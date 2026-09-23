import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  customerMetricsSchema, metricsAsOfSchema, nextBestOfferSchema, periodSummarySchema, productHoldingSchema,
  type CustomerMetrics, type CustomerMetricsAsOf, type NextBestOffer as NextBestOfferDto, type PeriodSummary,
  type ProductHolding as ProductHoldingDto,
} from '@mlink/contracts';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { DomainException } from '../../common/http';
import {
  Card, Customer, CustomerDailyPosition, CustomerMetric, NextBestOffer, ProductHolding,
} from '../../database/entities';
import {
  METRIC_WINDOW_DAYS, clampWindowDays, computePortfolioMetrics, type ComputedMetrics, type CustomerMetricsInput,
} from './metrics.formulas';
import { daysBetween, resolveRange, summarizePeriod, type PeriodPositionInput } from './period.formulas';

/** A complete preceding window needs twice the window length of journal before the as-of date. */
export const requiredHistoryDays = (windowDays: number) => 2 * windowDays;
const AS_OF_CACHE_TTL_MS = 5 * 60_000;

const money = (value: number) => value.toFixed(2);
const num = (value: string | number | null | undefined) => Number(value ?? 0);

function toEntity(metric: ComputedMetrics): Partial<CustomerMetric> {
  return {
    customerId: metric.customerId, asOfDate: metric.asOfDate,
    recencyDays: metric.recencyDays, freq90: metric.freq90, freqPrev90: metric.freqPrev90,
    casaAvg90: money(metric.casaAvg90), casaAvgPrev90: money(metric.casaAvgPrev90),
    casaTrend: metric.casaTrend, casaCv: metric.casaCv,
    ccAvgBalance90: money(metric.ccAvgBalance90), creditLimit: money(metric.creditLimit), cur: metric.cur,
    loanTotal: money(metric.loanTotal), fdCurrent: money(metric.fdCurrent), fdAvgPrev90: money(metric.fdAvgPrev90),
    fdLiquidated: metric.fdLiquidated, bondCurrent: money(metric.bondCurrent),
    fundCertCurrent: money(metric.fundCertCurrent), tav: money(metric.tav), leverage: metric.leverage,
    phs: metric.phs, holdingCount: metric.holdingCount, fxVolume12m: money(metric.fxVolume12m),
    rasRaw: metric.rasRaw, ras: metric.ras, valueScore: metric.valueScore, churnScore: metric.churnScore,
    churnLabel: metric.churnLabel, crossSellScore: metric.crossSellScore, priorityScore: metric.priorityScore,
    behaviourLabel: metric.behaviourLabel, riskAppetiteLabel: metric.riskAppetiteLabel,
    tierLabel: metric.tierLabel, phsLabel: metric.phsLabel, suggestionCode: metric.suggestionCode,
    isNewCif: metric.isNewCif, computedAt: new Date(),
  };
}

export function computedToDto(metric: ComputedMetrics, computedAt: Date): CustomerMetrics {
  return metricToDto({ ...toEntity(metric), computedAt } as CustomerMetric);
}

export function metricToDto(metric: CustomerMetric): CustomerMetrics {
  return customerMetricsSchema.parse({
    customerId: metric.customerId, asOfDate: String(metric.asOfDate).slice(0, 10),
    recencyDays: metric.recencyDays, freq90: metric.freq90, freqPrev90: metric.freqPrev90,
    casaAvg90: metric.casaAvg90, casaAvgPrev90: metric.casaAvgPrev90,
    casaTrend: num(metric.casaTrend), casaCv: num(metric.casaCv),
    ccAvgBalance90: metric.ccAvgBalance90, creditLimit: metric.creditLimit, cur: num(metric.cur),
    loanTotal: metric.loanTotal, fdCurrent: metric.fdCurrent, fdAvgPrev90: metric.fdAvgPrev90,
    fdLiquidated: metric.fdLiquidated, bondCurrent: metric.bondCurrent, fundCertCurrent: metric.fundCertCurrent,
    tav: metric.tav, leverage: num(metric.leverage), phs: num(metric.phs), holdingCount: metric.holdingCount,
    fxVolume12m: metric.fxVolume12m, rasRaw: num(metric.rasRaw), ras: num(metric.ras),
    valueScore: num(metric.valueScore), churnScore: num(metric.churnScore), churnLabel: metric.churnLabel,
    crossSellScore: num(metric.crossSellScore), priorityScore: num(metric.priorityScore),
    behaviourLabel: metric.behaviourLabel, riskAppetiteLabel: metric.riskAppetiteLabel,
    tierLabel: metric.tierLabel, phsLabel: metric.phsLabel, suggestionCode: metric.suggestionCode,
    isNewCif: metric.isNewCif, computedAt: new Date(metric.computedAt).toISOString(),
  });
}

/** Loads the journal (optionally truncated at `maxDate`) and builds the pure-formula inputs for every customer. */
export async function loadPortfolioInputs(
  dataSource: DataSource, asOfDate: string, maxDate?: string, windowDays?: number,
): Promise<CustomerMetricsInput[]> {
  const customers = await dataSource.getRepository(Customer).find();
  if (!customers.length) return [];
  const [positions, holdings, cards] = await Promise.all([
    dataSource.getRepository(CustomerDailyPosition).find({
      where: maxDate ? { positionDate: LessThanOrEqual(maxDate) } : {},
      order: { customerId: 'ASC', dayIndex: 'ASC' },
    }),
    dataSource.getRepository(ProductHolding).find(),
    dataSource.getRepository(Card).find({ where: { type: 'CREDIT' } }),
  ]);
  const positionsByCustomer = new Map<string, CustomerDailyPosition[]>();
  for (const row of positions) {
    const list = positionsByCustomer.get(row.customerId);
    if (list) list.push(row);
    else positionsByCustomer.set(row.customerId, [row]);
  }
  const holdingsByCustomer = new Map<string, Record<string, boolean>>();
  for (const row of holdings) {
    const map = holdingsByCustomer.get(row.customerId) ?? {};
    map[row.productCode] = row.held;
    holdingsByCustomer.set(row.customerId, map);
  }
  const creditLimitByCustomer = new Map<string, number>();
  for (const card of cards) {
    creditLimitByCustomer.set(card.customerId, (creditLimitByCustomer.get(card.customerId) ?? 0) + num(card.creditLimit));
  }
  return customers
    .filter((customer) => positionsByCustomer.has(customer.id))
    .map((customer) => ({
      customerId: customer.id,
      asOfDate,
      cifOpenedAt: String(customer.customerSince).slice(0, 10),
      declaredRiskAppetite: customer.declaredRiskAppetite,
      creditLimit: creditLimitByCustomer.get(customer.id) ?? 0,
      holdings: holdingsByCustomer.get(customer.id) ?? {},
      windowDays,
      positions: (positionsByCustomer.get(customer.id) ?? []).map((row) => ({
        dayIndex: row.dayIndex, casaBalance: num(row.casaBalance), fdBalance: num(row.fdBalance),
        bondBalance: num(row.bondBalance), fundCertValue: num(row.fundCertValue), loanTotal: num(row.loanTotal),
        creditCardBalance: num(row.creditCardBalance), fxVolume: num(row.fxVolume), txnCount: row.txnCount,
        isActive: row.isActive,
      })),
    }));
}

/**
 * Recomputes Part B metrics for every customer in the database for one as-of date.
 * Runs as a standalone function so the seed (no Nest DI) and the service share it.
 * Value Score is portfolio-relative, so a partial recompute is never valid.
 */
export async function recomputeMetrics(dataSource: DataSource, asOfDate: string): Promise<number> {
  const inputs = await loadPortfolioInputs(dataSource, asOfDate);
  if (!inputs.length) return 0;
  const computed = computePortfolioMetrics(inputs);
  await dataSource.transaction(async (manager) => {
    await manager.delete(CustomerMetric, { asOfDate });
    for (let offset = 0; offset < computed.length; offset += 200) {
      await manager.insert(CustomerMetric, computed.slice(offset, offset + 200).map(toEntity));
    }
  });
  return computed.length;
}

export interface QueueRow { metric: CustomerMetric; customer: Customer }

@Injectable()
export class MetricsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CustomerMetric) private readonly metrics: Repository<CustomerMetric>,
    @InjectRepository(ProductHolding) private readonly holdings: Repository<ProductHolding>,
    @InjectRepository(NextBestOffer) private readonly offers: Repository<NextBestOffer>,
    @InjectRepository(CustomerDailyPosition) private readonly positions: Repository<CustomerDailyPosition>,
  ) {}

  private readonly asOfCache = new Map<string, { computedAt: Date; rows: Map<string, ComputedMetrics> }>();

  recomputeAll(asOfDate: string) {
    this.asOfCache.clear();
    return recomputeMetrics(this.dataSource, asOfDate);
  }

  /** First/last journal day for a customer (the data range the period filter can address). */
  async dataRange(customerId: string): Promise<{ first: string; last: string }> {
    const [first, last] = await Promise.all([
      this.positions.findOne({ where: { customerId }, order: { dayIndex: 'ASC' } }),
      this.positions.findOne({ where: { customerId }, order: { dayIndex: 'DESC' } }),
    ]);
    if (!first || !last) throw new DomainException(404, 'POSITIONS_NOT_FOUND', 'Customer has no daily positions.');
    return { first: String(first.positionDate).slice(0, 10), last: String(last.positionDate).slice(0, 10) };
  }

  /**
   * Part B metrics for the whole portfolio as of an arbitrary journal day, computed on the fly
   * (never persisted). Value Score is portfolio-relative, so all customers are computed together.
   */
  async computeAsOf(asOf: string, windowDays = METRIC_WINDOW_DAYS): Promise<{ computedAt: Date; rows: Map<string, ComputedMetrics> }> {
    const window = clampWindowDays(windowDays);
    const key = `${asOf}|${window}`;
    const cached = this.asOfCache.get(key);
    if (cached && Date.now() - cached.computedAt.getTime() < AS_OF_CACHE_TTL_MS) return cached;
    const inputs = await loadPortfolioInputs(this.dataSource, asOf, asOf, window);
    const rows = new Map(computePortfolioMetrics(inputs).map((row) => [row.customerId, row]));
    const entry = { computedAt: new Date(), rows };
    this.asOfCache.set(key, entry);
    return entry;
  }

  /**
   * Metrics for one customer as of a chosen day and window length. Returns the stored snapshot
   * only for the canonical definition (latest journal day, 90-day window); every other
   * combination is recomputed on the fly for the whole portfolio.
   */
  async getAsOf(customerId: string, asOf?: string, windowDays?: number): Promise<CustomerMetricsAsOf> {
    const range = await this.dataRange(customerId);
    const window = clampWindowDays(windowDays);
    const target = !asOf || asOf > range.last ? range.last : asOf < range.first ? range.first : asOf;
    const historyDays = daysBetween(range.first, target) + 1;
    const insufficientHistory = historyDays < requiredHistoryDays(window);
    if (target === range.last && window === METRIC_WINDOW_DAYS) {
      const stored = await this.findLatest(customerId);
      if (stored && stored.asOfDate === target) {
        return metricsAsOfSchema.parse({
          ...stored, stored: true, historyDays, insufficientHistory,
          windowDays: window, prevWindowDays: Math.max(0, Math.min(window, historyDays - window)),
        });
      }
    }
    const { computedAt, rows } = await this.computeAsOf(target, window);
    const row = rows.get(customerId);
    if (!row) throw new DomainException(404, 'METRICS_NOT_FOUND', 'Customer metrics could not be computed for this date.');
    return metricsAsOfSchema.parse({
      ...computedToDto(row, computedAt), stored: false, historyDays, insufficientHistory,
      windowDays: row.windowDays, prevWindowDays: row.prevWindowDays,
    });
  }

  private toPeriodInput(row: CustomerDailyPosition): PeriodPositionInput {
    return {
      positionDate: String(row.positionDate).slice(0, 10), dayIndex: row.dayIndex, monthKey: row.monthKey,
      accountBalance: num(row.accountBalance), casaBalance: num(row.casaBalance), fdBalance: num(row.fdBalance),
      bondBalance: num(row.bondBalance), fundCertValue: num(row.fundCertValue), loanAdvance: num(row.loanAdvance),
      loanOverdraft: num(row.loanOverdraft), loanUnsecured: num(row.loanUnsecured), loanMortgage: num(row.loanMortgage),
      loanTotal: num(row.loanTotal), creditCardBalance: num(row.creditCardBalance), creditCardSpend: num(row.creditCardSpend),
      fxVolume: num(row.fxVolume), bancaLifePremium: num(row.bancaLifePremium), bancaNonlifePremium: num(row.bancaNonlifePremium),
      mobileTopup: num(row.mobileTopup), billPayment: num(row.billPayment), securitiesNet: num(row.securitiesNet),
      flightTicket: num(row.flightTicket), busTicket: num(row.busTicket), vietlott: num(row.vietlott),
      loanRepayment: num(row.loanRepayment), geneticaFee: num(row.geneticaFee), advisoryFee: num(row.advisoryFee),
      westernUnionFee: num(row.westernUnionFee), niceAccountFee: num(row.niceAccountFee),
      txnCount: row.txnCount, isActive: row.isActive,
    };
  }

  /** Balances, flows, activity and monthly averages for a date range (defaults to the last 90 days). */
  async periodSummary(customerId: string, requested: { from?: string; to?: string }): Promise<PeriodSummary> {
    const dataRange = await this.dataRange(customerId);
    const range = resolveRange(dataRange, requested);
    const rows = await this.positions.find({ where: { customerId }, order: { dayIndex: 'ASC' } });
    return periodSummarySchema.parse(summarizePeriod(customerId, rows.map((row) => this.toPeriodInput(row)), range));
  }

  /** Daily positions inside a range (`from`/`to`), or the last `days` when no range is given. */
  async listPositionsInRange(customerId: string, requested: { from?: string; to?: string; days?: number }) {
    const dataRange = await this.dataRange(customerId);
    const range = resolveRange(dataRange, requested, requested.days ?? 90);
    const rows = await this.positions
      .createQueryBuilder('p')
      .where('p.customer_id = :customerId', { customerId })
      .andWhere('p.position_date BETWEEN :from AND :to', { from: range.from, to: range.to })
      .orderBy('p.day_index', 'ASC')
      .getMany();
    return rows.map((row) => ({
      positionDate: String(row.positionDate).slice(0, 10), dayIndex: row.dayIndex,
      accountBalance: num(row.accountBalance), casaBalance: num(row.casaBalance), fdBalance: num(row.fdBalance),
      bondBalance: num(row.bondBalance), fundCertValue: num(row.fundCertValue), loanTotal: num(row.loanTotal),
      creditCardBalance: num(row.creditCardBalance), creditCardSpend: num(row.creditCardSpend),
      fxVolume: num(row.fxVolume), txnCount: row.txnCount, isActive: row.isActive,
    }));
  }

  async findLatest(customerId: string): Promise<CustomerMetrics | null> {
    const metric = await this.metrics.findOne({ where: { customerId }, order: { asOfDate: 'DESC' } });
    return metric ? metricToDto(metric) : null;
  }

  async latestByCustomerIds(customerIds: string[]): Promise<Map<string, CustomerMetrics>> {
    if (!customerIds.length) return new Map();
    const rows = await this.metrics
      .createQueryBuilder('m')
      .where('m.customer_id IN (:...customerIds)', { customerIds })
      .andWhere('m.as_of_date = (SELECT MAX(m2.as_of_date) FROM customer_metrics m2 WHERE m2.customer_id = m.customer_id)')
      .getMany();
    return new Map(rows.map((row) => [row.customerId, metricToDto(row)]));
  }

  async getLatest(customerId: string): Promise<CustomerMetrics> {
    const metric = await this.findLatest(customerId);
    if (!metric) throw new DomainException(404, 'METRICS_NOT_FOUND', 'Customer metrics have not been computed.');
    return metric;
  }

  async listHoldings(customerId: string): Promise<ProductHoldingDto[]> {
    const rows = await this.holdings.find({ where: { customerId }, order: { productCode: 'ASC' } });
    return rows.map((row) => productHoldingSchema.parse({ productCode: row.productCode, held: row.held }));
  }

  async listNextBestOffers(customerId: string): Promise<NextBestOfferDto[]> {
    const rows = await this.offers.find({ where: { customerId } });
    return rows
      .map((row) => nextBestOfferSchema.parse({ productCode: row.productCode, rank: row.rank }))
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  }

  async listPositions(customerId: string, days: number) {
    const rows = await this.positions.find({ where: { customerId }, order: { dayIndex: 'DESC' }, take: days });
    return rows.reverse().map((row) => ({
      positionDate: String(row.positionDate).slice(0, 10), dayIndex: row.dayIndex,
      accountBalance: num(row.accountBalance), casaBalance: num(row.casaBalance), fdBalance: num(row.fdBalance),
      bondBalance: num(row.bondBalance), fundCertValue: num(row.fundCertValue), loanTotal: num(row.loanTotal),
      creditCardBalance: num(row.creditCardBalance), creditCardSpend: num(row.creditCardSpend),
      fxVolume: num(row.fxVolume), txnCount: row.txnCount, isActive: row.isActive,
    }));
  }

  /** Sheet "CASA-FD binh quan 12 thang": monthly averages over the whole journal (or a range). */
  async monthlyAverages(customerId: string, requested: { from?: string; to?: string } = {}) {
    const dataRange = await this.dataRange(customerId);
    const range = resolveRange(dataRange, { from: requested.from ?? dataRange.first, to: requested.to ?? dataRange.last });
    const summary = await this.periodSummary(customerId, range);
    return summary.byMonth;
  }

  /** Latest metric snapshot for every customer of an RM, highest Priority Score first. */
  async latestForRm(rmId: string): Promise<QueueRow[]> {
    const rows = await this.metrics
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.customer', 'c')
      .where('c.rm_id = :rmId', { rmId })
      .andWhere('m.as_of_date = (SELECT MAX(as_of_date) FROM customer_metrics)')
      .orderBy('m.priority_score', 'DESC')
      .getMany();
    return rows.map((metric) => ({ metric, customer: metric.customer }));
  }
}
