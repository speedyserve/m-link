/**
 * Part B of "Khung công thức đánh giá KH MSB": pure, DB-free implementation of the
 * customer metrics. The formulas follow the Excel sheet "Chỉ số đánh giá KH" exactly
 * (90-day windows by day index, sample standard deviation, IFERROR(...,0) guards),
 * because that sheet is the business-approved reference and the Jest golden test
 * compares against its computed values.
 */
import type {
  BehaviourLabel, ChurnLabel, PhsLabel, RiskAppetite, SuggestionCode, Tier,
} from '@mlink/contracts';
import { PRODUCT_CODES } from '@mlink/contracts';

export const METRIC_WINDOW_DAYS = 90;
export const MIN_WINDOW_DAYS = 7;
export const MAX_WINDOW_DAYS = 365;
/**
 * Denominator of the recency term in the Churn Score. The framework writes
 * `40×MIN(Recency/90, 1)`, where 90 is a risk-calibration constant, not the aggregation
 * window, so it stays fixed even when the window follows a shorter filtered period.
 */
export const CHURN_RECENCY_SCALE_DAYS = 90;
export const NEW_CIF_DAYS = 90;
export const PRODUCT_LINE_COUNT = PRODUCT_CODES.length; // 13

export const THRESHOLDS = {
  churnHigh: 60, churnMedium: 30,
  leverageHigh: 0.7, curHigh: 0.8, rasHigh: 0.5, rasBalanced: 0.2,
  phsLow: 0.2, phsGood: 0.5, valueHigh: 50, trendSurge: 0.1, trendPositive: 0.05,
  recencyDormant: 90, recencyActive: 30, recencyNegative: 60,
  tierAff: 2_000_000_000, tierMassAff: 500_000_000,
  priorityWeights: { value: 0.4, churn: 0.35, crossSell: 0.25 },
} as const;

export interface DailyPositionInput {
  dayIndex: number;
  casaBalance: number;
  fdBalance: number;
  bondBalance: number;
  fundCertValue: number;
  loanTotal: number;
  creditCardBalance: number;
  fxVolume: number;
  txnCount: number;
  isActive: boolean;
}

export interface CustomerMetricsInput {
  customerId: string;
  asOfDate: string;           // YYYY-MM-DD, the last journal day
  cifOpenedAt: string;        // YYYY-MM-DD
  declaredRiskAppetite: string | null;
  creditLimit: number;
  holdings: Record<string, boolean>;
  positions: DailyPositionInput[];
  /** Aggregation window in days; defaults to the framework's 90. Set it to the filtered period length. */
  windowDays?: number;
}

/** Pass 1 output: everything that does not depend on the rest of the portfolio. */
export interface CoreMetrics {
  customerId: string;
  asOfDate: string;
  recencyDays: number;
  freq90: number;
  freqPrev90: number;
  casaAvg90: number;
  casaAvgPrev90: number;
  casaTrend: number;
  casaCv: number;
  ccAvgBalance90: number;
  creditLimit: number;
  cur: number;
  loanTotal: number;
  fdCurrent: number;
  fdAvgPrev90: number;
  fdLiquidated: boolean;
  bondCurrent: number;
  fundCertCurrent: number;
  tav: number;
  leverage: number;
  phs: number;
  holdingCount: number;
  fxVolume12m: number;
  rasRaw: number;
  ras: number;
  churnScore: number;
  churnLabel: ChurnLabel;
  crossSellScore: number;
  riskAppetiteLabel: RiskAppetite;
  tierLabel: Tier;
  phsLabel: PhsLabel;
  behaviourLabel: BehaviourLabel;
  isNewCif: boolean;
  windowDays: number;
  /** Days found in the preceding window; smaller than `windowDays` when the journal starts later. */
  prevWindowDays: number;
  declaredRiskAppetite: string | null;
  holdsBond: boolean;
}

/** Pass 2 output: portfolio-relative scores and the Excel "Gợi ý kịch bản" branch. */
export interface ComputedMetrics extends CoreMetrics {
  valueScore: number;
  priorityScore: number;
  suggestionCode: SuggestionCode;
}

const average = (values: number[]): number =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/** Excel STDEV: sample standard deviation (n − 1). Returns 0 for fewer than two values. */
export function sampleStdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

const safeRatio = (numerator: number, denominator: number): number =>
  denominator ? numerator / denominator : 0;

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function classifyChurn(score: number): ChurnLabel {
  if (score >= THRESHOLDS.churnHigh) return 'Cao';
  if (score >= THRESHOLDS.churnMedium) return 'Trung bình';
  return 'Thấp';
}

export function classifyRiskAppetite(ras: number): RiskAppetite {
  if (ras < THRESHOLDS.rasBalanced) return 'An toàn';
  if (ras <= THRESHOLDS.rasHigh) return 'Cân bằng';
  return 'Rủi ro cao';
}

export function classifyTier(tav: number): Tier {
  if (tav >= THRESHOLDS.tierAff) return 'Aff';
  if (tav >= THRESHOLDS.tierMassAff) return 'MassAff';
  return 'Mass';
}

export function classifyPhs(phs: number): PhsLabel {
  if (phs < THRESHOLDS.phsLow) return 'Chưa khai thác';
  if (phs <= THRESHOLDS.phsGood) return 'Trung bình';
  return 'Khai thác tốt';
}

/** Part C.1. Negative conditions are checked first so a customer never lands in both classes. */
export function classifyBehaviour(metrics: {
  casaTrend: number; recencyDays: number; cur: number; fdLiquidated: boolean; churnLabel: ChurnLabel;
}): BehaviourLabel {
  const negative =
    metrics.casaTrend < -THRESHOLDS.trendPositive ||
    metrics.recencyDays > THRESHOLDS.recencyNegative ||
    metrics.cur > THRESHOLDS.curHigh ||
    (metrics.fdLiquidated && metrics.casaTrend < 0);
  if (negative) return 'Tiêu cực';
  const positive =
    metrics.casaTrend > THRESHOLDS.trendPositive &&
    metrics.recencyDays <= THRESHOLDS.recencyActive &&
    metrics.churnLabel !== 'Cao';
  return positive ? 'Tích cực' : 'Trung tính';
}

/** Column AD of the Excel sheet: nested IF, first match wins. */
export function pickSuggestion(metrics: {
  leverage: number; cur: number; churnScore: number; rasRaw: number; declaredRiskAppetite: string | null;
  phs: number; valueScore: number; casaTrend: number; holdsBond: boolean; recencyDays: number;
}): SuggestionCode {
  if (metrics.leverage > THRESHOLDS.leverageHigh) return 'LEVERAGE_HIGH';
  if (metrics.cur > THRESHOLDS.curHigh) return 'CUR_HIGH';
  if (metrics.churnScore >= THRESHOLDS.churnHigh) return 'CHURN_HIGH';
  if (metrics.rasRaw > THRESHOLDS.rasHigh && metrics.declaredRiskAppetite === 'An toàn') return 'RISK_MISMATCH';
  if (metrics.phs < THRESHOLDS.phsLow && metrics.valueScore > THRESHOLDS.valueHigh) return 'UNDER_PENETRATED';
  if (metrics.casaTrend > THRESHOLDS.trendSurge && !metrics.holdsBond) return 'CASA_SURGE_NO_BOND';
  if (metrics.recencyDays > THRESHOLDS.recencyDormant) return 'DORMANT';
  return 'MAINTAIN';
}

/** Pass 1: metrics for one customer from its daily journal. */
export function clampWindowDays(windowDays: number | undefined): number {
  if (!windowDays || !Number.isFinite(windowDays)) return METRIC_WINDOW_DAYS;
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.round(windowDays)));
}

export function computeCoreMetrics(input: CustomerMetricsInput): CoreMetrics {
  const positions = [...input.positions].sort((a, b) => a.dayIndex - b.dayIndex);
  if (!positions.length) throw new Error(`No daily positions for customer ${input.customerId}`);
  const windowDays = clampWindowDays(input.windowDays);
  const lastIndex = positions[positions.length - 1].dayIndex;
  const last90 = positions.filter((row) => row.dayIndex > lastIndex - windowDays);
  const prev90 = positions.filter(
    (row) => row.dayIndex > lastIndex - 2 * windowDays && row.dayIndex <= lastIndex - windowDays,
  );
  const snapshot = positions[positions.length - 1];

  const lastActiveIndex = positions.reduce((max, row) => (row.isActive ? Math.max(max, row.dayIndex) : max), 0);
  const recencyDays = lastIndex - lastActiveIndex;
  const freq90 = last90.reduce((sum, row) => sum + row.txnCount, 0);
  const freqPrev90 = prev90.reduce((sum, row) => sum + row.txnCount, 0);
  const casaLast90 = last90.map((row) => row.casaBalance);
  const casaAvg90 = average(casaLast90);
  const casaAvgPrev90 = average(prev90.map((row) => row.casaBalance));
  const casaTrend = safeRatio(casaAvg90 - casaAvgPrev90, casaAvgPrev90);
  const casaCv = safeRatio(sampleStdev(casaLast90), casaAvg90);
  const ccAvgBalance90 = average(last90.map((row) => row.creditCardBalance));
  const cur = safeRatio(ccAvgBalance90, input.creditLimit);

  const loanTotal = snapshot.loanTotal;
  const fdCurrent = snapshot.fdBalance;
  const fdAvgPrev90 = average(prev90.map((row) => row.fdBalance));
  const fdLiquidated = fdCurrent === 0 && fdAvgPrev90 > 0;
  const bondCurrent = snapshot.bondBalance;
  const fundCertCurrent = snapshot.fundCertValue;
  const tav = casaAvg90 + fdCurrent + bondCurrent + fundCertCurrent;
  const leverage = safeRatio(loanTotal, tav);

  const holdingCount = PRODUCT_CODES.filter((code) => input.holdings[code]).length;
  const phs = holdingCount / PRODUCT_LINE_COUNT;
  const fxVolume12m = positions.reduce((sum, row) => sum + row.fxVolume, 0);
  const rasRaw = safeRatio(bondCurrent + fundCertCurrent + fxVolume12m, tav);
  const ras = Math.min(rasRaw, 1);

  const churnScore =
    40 * Math.min(recencyDays / CHURN_RECENCY_SCALE_DAYS, 1) +
    30 * Math.min(Math.max(0, -casaTrend), 1) +
    20 * (fdLiquidated ? 1 : 0) +
    10 * (freq90 < 0.5 * freqPrev90 ? 1 : 0);
  const churnLabel = classifyChurn(churnScore);
  const crossSellScore = (1 - phs) * 100;

  return {
    customerId: input.customerId,
    asOfDate: input.asOfDate,
    recencyDays, freq90, freqPrev90, casaAvg90, casaAvgPrev90, casaTrend, casaCv,
    ccAvgBalance90, creditLimit: input.creditLimit, cur,
    loanTotal, fdCurrent, fdAvgPrev90, fdLiquidated, bondCurrent, fundCertCurrent, tav, leverage,
    phs, holdingCount, fxVolume12m, rasRaw, ras,
    churnScore, churnLabel, crossSellScore,
    riskAppetiteLabel: classifyRiskAppetite(ras),
    tierLabel: classifyTier(tav),
    phsLabel: classifyPhs(phs),
    behaviourLabel: classifyBehaviour({ casaTrend, recencyDays, cur, fdLiquidated, churnLabel }),
    isNewCif: daysBetween(input.cifOpenedAt, input.asOfDate) <= NEW_CIF_DAYS,
    windowDays,
    prevWindowDays: prev90.length,
    declaredRiskAppetite: input.declaredRiskAppetite,
    holdsBond: Boolean(input.holdings.BOND),
  };
}

/**
 * Pass 2: Value Score is relative to the largest TAV in the whole portfolio (Excel
 * `T/MAX($T$5:$T$24)*100`), so it must always be recomputed for every customer together.
 */
export function finalizePortfolio(cores: CoreMetrics[]): ComputedMetrics[] {
  const maxTav = cores.reduce((max, core) => Math.max(max, core.tav), 0);
  const { value, churn, crossSell } = THRESHOLDS.priorityWeights;
  return cores.map((core) => {
    const valueScore = safeRatio(core.tav, maxTav) * 100;
    const priorityScore = value * valueScore + churn * core.churnScore + crossSell * core.crossSellScore;
    return {
      ...core,
      valueScore,
      priorityScore,
      suggestionCode: pickSuggestion({ ...core, valueScore }),
    };
  });
}

export function computePortfolioMetrics(inputs: CustomerMetricsInput[]): ComputedMetrics[] {
  return finalizePortfolio(inputs.map(computeCoreMetrics));
}
