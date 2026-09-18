/**
 * Typed access to the committed MSB sample dataset (exported from
 * Data_mau_365ngay_20KH.xlsx by apps/agent/tools/export_msb_dataset.py).
 * JSON is imported so `tsc` emits it into dist for the seed and Docker image.
 */
import creditLimits from './credit_limits.json';
import customers from './customers.json';
import dailyPositions from './daily_positions.json';
import manifest from './manifest.json';
import metricsGolden from './metrics_golden.json';
import nextBestOffers from './next_best_offers.json';
import productHoldings from './product_holdings.json';

export interface DatasetCustomer {
  cif: string; fullName: string; gender: string; dateOfBirth: string; phone: string; email: string;
  branch: string; cifOpenedAt: string; tier: string; declaredBehaviour: string;
  declaredRiskAppetite: string; churnWarning: boolean; behaviourNote: string;
}

export interface DailyPositionRecord {
  cif: string; positionDate: string; monthKey: number; dayIndex: number;
  accountBalance: number; casaBalance: number; fdBalance: number; bondBalance: number; fundCertValue: number;
  loanAdvance: number; loanOverdraft: number; loanUnsecured: number; loanMortgage: number; loanTotal: number;
  creditCardBalance: number; creditCardSpend: number; fxVolume: number; bancaLifePremium: number;
  bancaNonlifePremium: number; mobileTopup: number; billPayment: number; securitiesNet: number;
  flightTicket: number; busTicket: number; vietlott: number; loanRepayment: number; geneticaFee: number;
  advisoryFee: number; westernUnionFee: number; niceAccountFee: number; txnCount: number; isActive: boolean;
}

/** Column names in daily_positions.json, in order, mapped to camelCase record keys. */
const COLUMN_KEYS: Array<keyof DailyPositionRecord> = [
  'cif', 'positionDate', 'monthKey', 'dayIndex', 'accountBalance', 'casaBalance', 'fdBalance', 'bondBalance',
  'fundCertValue', 'loanAdvance', 'loanOverdraft', 'loanUnsecured', 'loanMortgage', 'loanTotal',
  'creditCardBalance', 'creditCardSpend', 'fxVolume', 'bancaLifePremium', 'bancaNonlifePremium', 'mobileTopup',
  'billPayment', 'securitiesNet', 'flightTicket', 'busTicket', 'vietlott', 'loanRepayment', 'geneticaFee',
  'advisoryFee', 'westernUnionFee', 'niceAccountFee', 'txnCount', 'isActive',
];

export interface GoldenMetrics {
  cif: string; creditLimit: number; recencyDays: number; freq90: number; freqPrev90: number; casaAvg90: number;
  casaAvgPrev90: number; trend90: number; casaCv90: number; ccAvgBalance90: number; cur: number; loanTotal: number;
  fdCurrent: number; bondCurrent: number; fundCertCurrent: number; tav: number; leverage: number; phs: number;
  fxVolume12m: number; rasRaw: number; valueScore: number; churnScore: number; churnLabel: string;
  crossSellScore: number; priorityScore: number; suggestionText: string;
}

export const msbDataset = {
  manifest,
  customers: customers as DatasetCustomer[],
  productHoldings: productHoldings as Record<string, Record<string, number>>,
  nextBestOffers: nextBestOffers as Record<string, Record<string, number | null>>,
  creditLimits: creditLimits as Record<string, number>,
  metricsGolden: metricsGolden as GoldenMetrics[],
};

let cachedPositions: DailyPositionRecord[] | null = null;

/** Expands the compact column/row journal into typed records (7,300 rows). */
export function loadDailyPositions(): DailyPositionRecord[] {
  if (cachedPositions) return cachedPositions;
  const columns = dailyPositions.columns as string[];
  if (columns.length !== COLUMN_KEYS.length) {
    throw new Error(`daily_positions.json has ${columns.length} columns, expected ${COLUMN_KEYS.length}`);
  }
  cachedPositions = (dailyPositions.rows as Array<Array<string | number>>).map((row) => {
    const record = {} as Record<string, unknown>;
    COLUMN_KEYS.forEach((key, index) => {
      record[key] = key === 'isActive' ? row[index] === 1 : row[index];
    });
    return record as unknown as DailyPositionRecord;
  });
  return cachedPositions;
}

export function positionsByCustomer(): Map<string, DailyPositionRecord[]> {
  const grouped = new Map<string, DailyPositionRecord[]>();
  for (const row of loadDailyPositions()) {
    const list = grouped.get(row.cif);
    if (list) list.push(row);
    else grouped.set(row.cif, [row]);
  }
  grouped.forEach((rows) => rows.sort((a, b) => a.dayIndex - b.dayIndex));
  return grouped;
}
