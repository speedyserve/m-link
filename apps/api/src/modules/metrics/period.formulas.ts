/**
 * Period aggregation over the daily journal for one customer: balances (start/end/avg/min/max),
 * flows per transaction category, activity and monthly averages. Pure and DB-free so it is
 * shared by the API routes and the Jest tests against the committed dataset.
 */
import { BALANCE_KEYS, FLOW_CATEGORIES, type BalanceKey, type BalanceStats, type FlowCategory, type PeriodSummary } from '@mlink/contracts';

export interface PeriodPositionInput {
  positionDate: string;      // YYYY-MM-DD
  dayIndex: number;
  monthKey: number;
  accountBalance: number; casaBalance: number; fdBalance: number; bondBalance: number; fundCertValue: number;
  loanAdvance: number; loanOverdraft: number; loanUnsecured: number; loanMortgage: number; loanTotal: number;
  creditCardBalance: number;
  creditCardSpend: number; fxVolume: number; bancaLifePremium: number; bancaNonlifePremium: number;
  mobileTopup: number; billPayment: number; securitiesNet: number; flightTicket: number; busTicket: number;
  vietlott: number; loanRepayment: number; geneticaFee: number; advisoryFee: number; westernUnionFee: number;
  niceAccountFee: number;
  txnCount: number;
  isActive: boolean;
}

/** Journal flow column -> transaction category (same codes as the seeded `transactions.category`). */
export const FLOW_COLUMN_BY_CATEGORY: Record<FlowCategory, keyof PeriodPositionInput> = {
  CC_SPEND: 'creditCardSpend', FX: 'fxVolume', BANCA_LIFE: 'bancaLifePremium', BANCA_NONLIFE: 'bancaNonlifePremium',
  MOBILE_TOPUP: 'mobileTopup', BILL_PAYMENT: 'billPayment', SECURITIES: 'securitiesNet', AIRLINE: 'flightTicket',
  BUS_TICKET: 'busTicket', LOTTERY: 'vietlott', LOAN_REPAYMENT: 'loanRepayment', GENETICA: 'geneticaFee',
  ADVISORY_FEE: 'advisoryFee', WESTERN_UNION: 'westernUnionFee', PREMIUM_ACCOUNT_FEE: 'niceAccountFee',
};

export const average = (values: number[]): number =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const stats = (values: number[]): BalanceStats => {
  if (!values.length) return { start: 0, end: 0, avg: 0, min: 0, max: 0, change: 0 };
  const start = values[0];
  const end = values[values.length - 1];
  return { start, end, avg: average(values), min: Math.min(...values), max: Math.max(...values), change: end - start };
};

const totalAssetsOf = (row: PeriodPositionInput) => row.casaBalance + row.fdBalance + row.bondBalance + row.fundCertValue;

export const addDays = (isoDate: string, days: number): string =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Normalises a requested range against the customer's data range: defaults to the last
 * `defaultDays` days ending on the last journal day and clamps both ends into the data range.
 */
export function resolveRange(
  dataRange: { first: string; last: string },
  requested: { from?: string; to?: string },
  defaultDays = 90,
): { from: string; to: string; days: number } {
  let to = requested.to ?? dataRange.last;
  if (to > dataRange.last) to = dataRange.last;
  if (to < dataRange.first) to = dataRange.first;
  let from = requested.from ?? addDays(to, -(defaultDays - 1));
  if (from < dataRange.first) from = dataRange.first;
  if (from > to) from = to;
  return { from, to, days: daysBetween(from, to) + 1 };
}

export function summarizePeriod(
  customerId: string,
  positions: PeriodPositionInput[],
  range: { from: string; to: string },
): PeriodSummary {
  const sorted = [...positions].sort((a, b) => a.dayIndex - b.dayIndex);
  const dataRange = {
    first: sorted[0]?.positionDate ?? range.from,
    last: sorted[sorted.length - 1]?.positionDate ?? range.to,
  };
  const rows = sorted.filter((row) => row.positionDate >= range.from && row.positionDate <= range.to);

  const balances = Object.fromEntries(
    BALANCE_KEYS.map((key) => [key, stats(rows.map((row) => row[key as BalanceKey]))]),
  ) as Record<BalanceKey, BalanceStats>;

  const totals = rows.map(totalAssetsOf);
  const totalAssets = {
    start: totals[0] ?? 0, end: totals[totals.length - 1] ?? 0, avg: average(totals),
    change: (totals[totals.length - 1] ?? 0) - (totals[0] ?? 0),
  };

  const flows = Object.fromEntries(
    FLOW_CATEGORIES.map((category) => {
      const column = FLOW_COLUMN_BY_CATEGORY[category];
      const values = rows.map((row) => Number(row[column])).filter((value) => value !== 0);
      const entry: { total: number; days: number; buy?: number; sell?: number } = {
        total: values.reduce((sum, value) => sum + Math.abs(value), 0), days: values.length,
      };
      if (category === 'SECURITIES') {
        entry.buy = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
        entry.sell = values.filter((value) => value < 0).reduce((sum, value) => sum - value, 0);
      }
      return [category, entry];
    }),
  ) as PeriodSummary['flows'];

  const activeRows = rows.filter((row) => row.isActive);
  const activity = {
    days: rows.length,
    activeDays: activeRows.length,
    txnCount: rows.reduce((sum, row) => sum + row.txnCount, 0),
    firstActiveDate: activeRows[0]?.positionDate ?? null,
    lastActiveDate: activeRows[activeRows.length - 1]?.positionDate ?? null,
  };

  const months = new Map<number, PeriodPositionInput[]>();
  for (const row of rows) {
    const list = months.get(row.monthKey);
    if (list) list.push(row);
    else months.set(row.monthKey, [row]);
  }
  const byMonth = [...months.entries()]
    .sort(([a], [b]) => a - b)
    .map(([monthKey, list]) => ({
      monthKey: String(monthKey), days: list.length,
      casaAvg: average(list.map((row) => row.casaBalance)), fdAvg: average(list.map((row) => row.fdBalance)),
      txnCount: list.reduce((sum, row) => sum + row.txnCount, 0),
      ccSpend: list.reduce((sum, row) => sum + row.creditCardSpend, 0),
      fxVolume: list.reduce((sum, row) => sum + row.fxVolume, 0),
    }));

  return {
    customerId,
    range: { from: range.from, to: range.to, days: rows.length ? daysBetween(range.from, range.to) + 1 : 0 },
    dataRange, totalAssets, balances, flows, activity, byMonth,
  };
}
