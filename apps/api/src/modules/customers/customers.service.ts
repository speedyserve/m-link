import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { tierSchema } from '@mlink/contracts';
import { z } from 'zod';
import { DomainException, parseWith } from '../../common/http';
import {
  Account,
  BankTransaction,
  Card,
  Customer,
  CustomerInteraction,
  CustomerLoan,
  Deposit,
} from '../../database/entities';
import { MetricsService } from '../metrics/metrics.service';
import { RmsService } from '../rms/rms.service';

const customerQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  segment: z.enum(['MASS', 'MASS_AFFLUENT', 'PRIORITY', 'PRIVATE']).optional(),
  tier: tierSchema.optional(),
  status: z.enum(['HEALTHY', 'NEEDS_ATTENTION', 'AT_RISK']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const transactionQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  category: z.string().max(30).optional(),
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(BankTransaction) private readonly transactions: Repository<BankTransaction>,
    @InjectRepository(Card) private readonly cards: Repository<Card>,
    @InjectRepository(Deposit) private readonly deposits: Repository<Deposit>,
    @InjectRepository(CustomerLoan) private readonly loans: Repository<CustomerLoan>,
    @InjectRepository(CustomerInteraction) private readonly interactions: Repository<CustomerInteraction>,
    private readonly rms: RmsService,
    private readonly metrics: MetricsService,
  ) {}

  async assertCustomer(id: string, rmId?: string) {
    const where: FindOptionsWhere<Customer> = { id, ...(rmId ? { rmId } : {}) };
    const customer = await this.customers.findOneBy(where);
    if (!customer) throw new DomainException(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.');
    return customer;
  }

  async list(rmId: string, rawQuery: unknown) {
    await this.rms.assertExists(rmId);
    const query = parseWith(customerQuerySchema, rawQuery);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.customers.createQueryBuilder('customer').where('customer.rm_id = :rmId', { rmId });
    if (query.search) {
      const phoneSearch = query.search.replace(/\D/g, '').replace(/^84/, '0');
      builder.andWhere(
        `(customer.full_name ILIKE :search OR customer.customer_code ILIKE :search${phoneSearch ? " OR regexp_replace(customer.phone, '[^0-9]', '', 'g') LIKE :phoneSearch" : ''})`,
        { search: `%${query.search}%`, ...(phoneSearch ? { phoneSearch: `%${phoneSearch}%` } : {}) },
      );
    }
    if (query.segment) builder.andWhere('customer.segment = :segment', { segment: query.segment });
    if (query.tier) builder.andWhere('customer.tier = :tier', { tier: query.tier });
    if (query.status) builder.andWhere('customer.relationship_status = :status', { status: query.status });
    const [items, total] = await builder.orderBy('customer.full_name', 'ASC')
      .skip((page - 1) * limit).take(limit).getManyAndCount();
    const metricsByCustomer = await this.metrics.latestByCustomerIds(items.map((item) => item.id));
    return {
      items: items.map((item) => ({ ...item, metrics: metricsByCustomer.get(item.id) ?? null })),
      page, limit, total, totalPages: Math.ceil(total / limit),
    };
  }

  async detail(id: string, rmId?: string) {
    const customer = await this.assertCustomer(id, rmId);
    const [accountRows, deposits, cards, metrics, holdings, rmQueue, loans] = await Promise.all([
      this.accounts.findBy({ customerId: id }), this.deposits.findBy({ customerId: id, status: 'ACTIVE' }),
      this.cards.findBy({ customerId: id }), this.metrics.findLatest(id), this.metrics.listHoldings(id),
      this.metrics.latestForRm(customer.rmId),
      this.loans.find({ where: { customerId: id, status: 'ACTIVE' }, order: { nextDueDate: 'ASC' } }),
    ]);
    const totalAssets = accountRows.reduce((sum, row) => sum + Number(row.balance), 0) + deposits.reduce((sum, row) => sum + Number(row.principal), 0);
    // rmQueue is already ordered by priority_score DESC (see MetricsService.latestForRm),
    // so the row's position there is this customer's contact-priority rank on the RM's desk.
    const rankIndex = rmQueue.findIndex((row) => row.customer.id === id);
    return {
      ...customer,
      financialSummary: {
        totalAssets: totalAssets.toFixed(2),
        casa: accountRows.filter((row) => row.type === 'CASA').reduce((sum, row) => sum + Number(row.balance), 0).toFixed(2),
        deposits: deposits.reduce((sum, row) => sum + Number(row.principal), 0).toFixed(2),
        creditLimit: cards.reduce((sum, row) => sum + Number(row.creditLimit), 0).toFixed(2),
      },
      metrics,
      holdings,
      loans: loans.map((loan) => ({
        loanType: loan.loanType, principal: loan.principal, disbursementDate: loan.disbursementDate,
        interestRate: loan.interestRate, termMonths: loan.termMonths, monthlyPaymentEstimate: loan.monthlyPaymentEstimate,
        nextDueDate: loan.nextDueDate, status: loan.status,
      })),
      priorityRank: rankIndex >= 0 ? rankIndex + 1 : null,
      priorityRankOf: rmQueue.length,
    };
  }

  async listAccounts(id: string, rmId?: string) {
    await this.assertCustomer(id, rmId);
    return this.accounts.find({ where: { customerId: id }, order: { openedAt: 'DESC' } });
  }

  async listTransactions(id: string, rmId: string | undefined, rawQuery: unknown) {
    await this.assertCustomer(id, rmId);
    const query = parseWith(transactionQuerySchema, rawQuery);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: FindOptionsWhere<BankTransaction> = { customerId: id };
    if (query.from && query.to) where.transactionAt = Between(query.from, query.to);
    else if (query.from) where.transactionAt = MoreThanOrEqual(query.from);
    else if (query.to) where.transactionAt = LessThanOrEqual(query.to);
    if (query.category) where.category = query.category;
    if (query.type) where.type = query.type;
    const [items, total] = await this.transactions.findAndCount({
      where, order: { transactionAt: 'DESC' }, skip: (page - 1) * limit, take: limit,
    });
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async listCards(id: string, rmId?: string) {
    await this.assertCustomer(id, rmId);
    return this.cards.find({ where: { customerId: id }, order: { createdAt: 'DESC' } });
  }
  async listDeposits(id: string, rmId?: string) {
    await this.assertCustomer(id, rmId);
    return this.deposits.find({ where: { customerId: id }, order: { status: 'ASC', startDate: 'ASC' } });
  }
  async listInteractions(id: string, rmId?: string) {
    await this.assertCustomer(id, rmId);
    return this.interactions.find({ where: { customerId: id }, order: { interactionAt: 'DESC' } });
  }
  async listLoans(id: string, rmId?: string) {
    await this.assertCustomer(id, rmId);
    return this.loans.find({ where: { customerId: id, status: 'ACTIVE' }, order: { nextDueDate: 'ASC' } });
  }
}
