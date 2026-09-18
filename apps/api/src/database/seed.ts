/**
 * Seeds the MSB sample portfolio: 20 customers x 365 daily positions exported from
 * Data_mau_365ngay_20KH.xlsx (see msb-dataset/ and apps/agent/tools/export_msb_dataset.py).
 *
 * The seed always truncates: customer ids are CIFs, so leftovers from another dataset
 * would otherwise survive an upsert. Legacy tables (accounts, transactions, cards,
 * deposits) are derived from the daily journal so the Customer 360 UI keeps working,
 * then Part B metrics are recomputed for the dataset's as-of date.
 */
import { AppDataSource } from './data-source';
import {
  Account,
  BankTransaction,
  Card,
  Customer,
  CustomerDailyPosition,
  CustomerInteraction,
  Deposit,
  NextBestOffer,
  ProductHolding,
  RMUser,
} from './entities';
import { msbDataset, positionsByCustomer, type DailyPositionRecord } from './msb-dataset';
import { recomputeMetrics } from '../modules/metrics/metrics.service';

const money = (value: number) => value.toFixed(2);
const noon = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Branch -> RM. RM001 (HCM) is the UI default and owns the southern branches. */
const RM_BY_BRANCH: Record<string, string> = {
  'CN Quận 1': 'RM001', 'CN Quận 3': 'RM001', 'CN Bình Thạnh': 'RM001', 'CN Cần Thơ': 'RM001',
  'CN Hà Nội': 'RM002', 'CN Đống Đa': 'RM002', 'CN Cầu Giấy': 'RM002', 'CN Hải Phòng': 'RM002', 'Sở Giao Dịch': 'RM002',
  'CN Đà Nẵng': 'RM003',
};
const SEGMENT_BY_TIER: Record<string, string> = { Aff: 'PRIORITY', MassAff: 'MASS_AFFLUENT', Mass: 'MASS' };

/** Daily flow columns that become transaction rows (one per non-zero cell). */
const FLOW_COLUMNS: Array<{ key: keyof DailyPositionRecord; category: string; description: string }> = [
  { key: 'creditCardSpend', category: 'CC_SPEND', description: 'Chi tiêu thẻ tín dụng' },
  { key: 'fxVolume', category: 'FX', description: 'Giao dịch ngoại tệ' },
  { key: 'bancaLifePremium', category: 'BANCA_LIFE', description: 'Phí bảo hiểm nhân thọ' },
  { key: 'bancaNonlifePremium', category: 'BANCA_NONLIFE', description: 'Phí bảo hiểm phi nhân thọ' },
  { key: 'mobileTopup', category: 'MOBILE_TOPUP', description: 'Nạp thẻ điện thoại' },
  { key: 'billPayment', category: 'BILL_PAYMENT', description: 'Thanh toán hóa đơn' },
  { key: 'securitiesNet', category: 'SECURITIES', description: 'Đầu tư chứng khoán' },
  { key: 'flightTicket', category: 'AIRLINE', description: 'Mua vé máy bay' },
  { key: 'busTicket', category: 'BUS_TICKET', description: 'Mua vé xe khách' },
  { key: 'vietlott', category: 'LOTTERY', description: 'Mua Vietlott' },
  { key: 'loanRepayment', category: 'LOAN_REPAYMENT', description: 'Trả nợ / thu nợ vay' },
  { key: 'geneticaFee', category: 'GENETICA', description: 'SP hợp tác Genetica' },
  { key: 'advisoryFee', category: 'ADVISORY_FEE', description: 'Phí tư vấn tài chính' },
  { key: 'westernUnionFee', category: 'WESTERN_UNION', description: 'Phí chuyển tiền Western Union' },
  { key: 'niceAccountFee', category: 'PREMIUM_ACCOUNT_FEE', description: 'Phí tài khoản số đẹp' },
];

async function insertChunked<T extends object>(entity: new () => T, rows: Partial<T>[], size: number) {
  const repository = AppDataSource.getRepository(entity);
  for (let offset = 0; offset < rows.length; offset += size) {
    await repository.insert(rows.slice(offset, offset + size) as never);
  }
}

export async function seedDatabase(): Promise<{ customers: number; positions: number; transactions: number; metrics: number }> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  await AppDataSource.query(`TRUNCATE recommendation_feedback, recommendation_evidence, recommendations, agent_runs,
    customer_metrics, next_best_offers, product_holdings, customer_daily_positions, customer_interactions,
    deposits, cards, transactions, accounts, customers, rm_users RESTART IDENTITY CASCADE`);

  // The as-of date is the last journal day of the dataset, never the wall clock.
  const asOfDate = msbDataset.manifest.asOfDate;
  const reference = noon(asOfDate);

  await AppDataSource.getRepository(RMUser).insert([
    { id: 'RM001', name: 'Trần Mai Anh', email: 'mai.anh@mlink.demo', branch: 'Hồ Chí Minh' },
    { id: 'RM002', name: 'Nguyễn Đức Long', email: 'duc.long@mlink.demo', branch: 'Hà Nội' },
    { id: 'RM003', name: 'Lê Thu Hà', email: 'thu.ha@mlink.demo', branch: 'Đà Nẵng' },
  ]);

  const customers: Partial<Customer>[] = msbDataset.customers.map((row) => ({
    id: row.cif, customerCode: row.cif, cif: row.cif, rmId: RM_BY_BRANCH[row.branch] ?? 'RM001',
    fullName: row.fullName, dateOfBirth: row.dateOfBirth, gender: row.gender,
    segment: SEGMENT_BY_TIER[row.tier] ?? 'MASS', customerSince: row.cifOpenedAt, phone: row.phone, email: row.email,
    occupation: null, relationshipStatus: row.churnWarning ? 'AT_RISK' : 'HEALTHY',
    branch: row.branch, tier: row.tier, declaredBehaviour: row.declaredBehaviour,
    declaredRiskAppetite: row.declaredRiskAppetite, churnWarning: row.churnWarning, behaviourNote: row.behaviourNote,
  }));
  await AppDataSource.getRepository(Customer).insert(customers);

  const grouped = positionsByCustomer();
  const positions: Partial<CustomerDailyPosition>[] = [];
  const transactions: Partial<BankTransaction>[] = [];
  const accounts: Partial<Account>[] = [];
  const cards: Partial<Card>[] = [];
  const deposits: Partial<Deposit>[] = [];
  const holdings: Partial<ProductHolding>[] = [];
  const offers: Partial<NextBestOffer>[] = [];

  for (const customer of msbDataset.customers) {
    const cif = customer.cif;
    const rows = grouped.get(cif) ?? [];
    const last = rows[rows.length - 1];
    if (!last) throw new Error(`Dataset has no daily positions for CIF ${cif}`);

    for (const row of rows) {
      positions.push({
        customerId: cif, positionDate: row.positionDate, monthKey: row.monthKey, dayIndex: row.dayIndex,
        accountBalance: money(row.accountBalance), casaBalance: money(row.casaBalance), fdBalance: money(row.fdBalance),
        bondBalance: money(row.bondBalance), fundCertValue: money(row.fundCertValue), loanAdvance: money(row.loanAdvance),
        loanOverdraft: money(row.loanOverdraft), loanUnsecured: money(row.loanUnsecured), loanMortgage: money(row.loanMortgage),
        loanTotal: money(row.loanTotal), creditCardBalance: money(row.creditCardBalance), creditCardSpend: money(row.creditCardSpend),
        fxVolume: money(row.fxVolume), bancaLifePremium: money(row.bancaLifePremium), bancaNonlifePremium: money(row.bancaNonlifePremium),
        mobileTopup: money(row.mobileTopup), billPayment: money(row.billPayment), securitiesNet: money(row.securitiesNet),
        flightTicket: money(row.flightTicket), busTicket: money(row.busTicket), vietlott: money(row.vietlott),
        loanRepayment: money(row.loanRepayment), geneticaFee: money(row.geneticaFee), advisoryFee: money(row.advisoryFee),
        westernUnionFee: money(row.westernUnionFee), niceAccountFee: money(row.niceAccountFee),
        txnCount: row.txnCount, isActive: row.isActive,
      });
      for (const flow of FLOW_COLUMNS) {
        const amount = Number(row[flow.key]);
        if (!amount) continue;
        const inflow = flow.key === 'securitiesNet' && amount < 0;
        transactions.push({
          id: `TX-${cif}-${String(row.dayIndex).padStart(3, '0')}-${flow.category}`,
          transactionCode: `TX-${cif}-${String(row.dayIndex).padStart(3, '0')}-${flow.category}`,
          accountId: `ACC-${cif}-CASA`, customerId: cif, type: inflow ? 'CREDIT' : 'DEBIT', category: flow.category,
          amount: money(Math.abs(amount)), currency: 'VND',
          description: inflow ? 'Bán chứng khoán, tiền về tài khoản' : flow.description, merchant: null,
          transactionAt: noon(row.positionDate), balanceAfter: money(row.casaBalance),
        });
      }
    }

    accounts.push(
      {
        id: `ACC-${cif}-CASA`, customerId: cif, accountNumber: `19${cif}01`, type: 'CASA', currency: 'VND',
        balance: money(last.casaBalance), availableBalance: money(last.casaBalance), status: 'ACTIVE', openedAt: customer.cifOpenedAt,
      },
      {
        id: `ACC-${cif}-PAY`, customerId: cif, accountNumber: `19${cif}02`, type: 'PAYMENT', currency: 'VND',
        balance: money(last.accountBalance), availableBalance: money(last.accountBalance), status: 'ACTIVE', openedAt: customer.cifOpenedAt,
      },
    );

    const creditLimit = msbDataset.creditLimits[cif] ?? 0;
    if (creditLimit > 0) {
      const lastSpend = [...rows].reverse().find((row) => row.creditCardSpend > 0);
      cards.push({
        id: `CARD-${cif}`, customerId: cif, maskedNumber: `**** **** **** ${cif.slice(-4)}`, type: 'CREDIT',
        creditLimit: money(creditLimit), availableLimit: money(Math.max(0, creditLimit - last.creditCardBalance)),
        status: 'ACTIVE', expiryDate: '2029-12-31', lastTransactionAt: lastSpend ? noon(lastSpend.positionDate) : null,
      });
    }

    const firstFd = rows.find((row) => row.fdBalance > 0);
    if (firstFd) {
      const lastFdDay = [...rows].reverse().find((row) => row.fdBalance > 0)!;
      deposits.push({
        id: `DEP-${cif}`, customerId: cif, productName: 'Tiết kiệm lãi suất cao nhất',
        principal: money(last.fdBalance > 0 ? last.fdBalance : lastFdDay.fdBalance), interestRate: null,
        startDate: firstFd.positionDate, maturityDate: null, status: last.fdBalance > 0 ? 'ACTIVE' : 'CLOSED',
      });
    }

    for (const [productCode, held] of Object.entries(msbDataset.productHoldings[cif] ?? {})) {
      holdings.push({ customerId: cif, productCode, held: held === 1 });
    }
    for (const [productCode, rank] of Object.entries(msbDataset.nextBestOffers[cif] ?? {})) {
      offers.push({ customerId: cif, productCode, rank });
    }
  }

  await insertChunked(Account, accounts, 200);
  await insertChunked(CustomerDailyPosition, positions, 300);
  await insertChunked(BankTransaction, transactions, 500);
  await insertChunked(Card, cards, 200);
  await insertChunked(Deposit, deposits, 200);
  await insertChunked(ProductHolding, holdings, 500);
  await insertChunked(NextBestOffer, offers, 500);

  // Interactions are not part of the workbook. One open complaint keeps the
  // Customer-Care-First guardrail demonstrable (08101918: repeated debt collection).
  const interactions: Partial<CustomerInteraction>[] = [
    { id: 'INT-08101918-1', customerId: '08101918', channel: 'CALL', type: 'COMPLAINT', sentiment: 'NEGATIVE',
      subject: 'Khiếu nại về tần suất nhắc nợ vay thế chấp', summary: 'Khách hàng phản ánh bị gọi thu nợ nhiều lần trong tuần và đề nghị xem lại lịch trả nợ.',
      status: 'OPEN', interactionAt: addDays(reference, -4) },
    { id: 'INT-08101918-2', customerId: '08101918', channel: 'BRANCH', type: 'COMPLAINT', sentiment: 'NEGATIVE',
      subject: 'Yêu cầu phản hồi khiếu nại', summary: 'Khách hàng đến chi nhánh yêu cầu xử lý sớm, chưa nhận được phản hồi.',
      status: 'OPEN', interactionAt: addDays(reference, -1) },
    { id: 'INT-08102466-1', customerId: '08102466', channel: 'APP', type: 'SERVICE', sentiment: 'NEUTRAL',
      subject: 'Khảo sát định kỳ', summary: 'Không phản hồi khảo sát mức độ hài lòng qua ứng dụng.', status: 'CLOSED',
      interactionAt: addDays(reference, -120) },
    { id: 'INT-08101507-1', customerId: '08101507', channel: 'CALL', type: 'SERVICE', sentiment: 'POSITIVE',
      subject: 'Chăm sóc định kỳ', summary: 'Khách hàng hài lòng với dịch vụ, quan tâm thêm về kênh đầu tư.', status: 'CLOSED',
      interactionAt: addDays(reference, -20) },
    { id: 'INT-08100548-1', customerId: '08100548', channel: 'EMAIL', type: 'SERVICE', sentiment: 'NEUTRAL',
      subject: 'Xác nhận lịch trả nợ', summary: 'Gửi lịch trả nợ vay thế chấp và thấu chi tháng tới.', status: 'CLOSED',
      interactionAt: addDays(reference, -10) },
  ];
  await AppDataSource.getRepository(CustomerInteraction).insert(interactions);

  const metrics = await recomputeMetrics(AppDataSource, asOfDate);
  return { customers: customers.length, positions: positions.length, transactions: transactions.length, metrics };
}

if (require.main === module) {
  seedDatabase()
    .then(async (summary) => {
      console.log(`Seed completed: ${summary.customers} customers, ${summary.positions} daily positions, ${summary.transactions} transactions, ${summary.metrics} metric rows`);
      await AppDataSource.destroy();
    })
    .catch(async (error: unknown) => {
      console.error('Seed failed', error instanceof Error ? error.message : 'Unknown error');
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
      process.exitCode = 1;
    });
}
