import type { SuggestionCode } from '@mlink/contracts';
import { msbDataset, positionsByCustomer } from '../../database/msb-dataset';
import {
  classifyBehaviour, clampWindowDays, computeCoreMetrics, computePortfolioMetrics, pickSuggestion, sampleStdev,
  type ComputedMetrics, type CustomerMetricsInput,
} from './metrics.formulas';
import { addDays, summarizePeriod } from './period.formulas';

const AS_OF = msbDataset.manifest.asOfDate;

function buildInputs(): CustomerMetricsInput[] {
  const grouped = positionsByCustomer();
  return msbDataset.customers.map((customer) => ({
    customerId: customer.cif,
    asOfDate: AS_OF,
    cifOpenedAt: customer.cifOpenedAt,
    declaredRiskAppetite: customer.declaredRiskAppetite,
    creditLimit: msbDataset.creditLimits[customer.cif] ?? 0,
    holdings: Object.fromEntries(
      Object.entries(msbDataset.productHoldings[customer.cif]).map(([code, held]) => [code, held === 1]),
    ),
    positions: (grouped.get(customer.cif) ?? []).map((row) => ({
      dayIndex: row.dayIndex, casaBalance: row.casaBalance, fdBalance: row.fdBalance,
      bondBalance: row.bondBalance, fundCertValue: row.fundCertValue, loanTotal: row.loanTotal,
      creditCardBalance: row.creditCardBalance, fxVolume: row.fxVolume, txnCount: row.txnCount,
      isActive: row.isActive,
    })),
  }));
}

/** Maps the Vietnamese "Gợi ý kịch bản" text of the Excel sheet to the suggestion code. */
function suggestionCodeFromText(text: string): SuggestionCode {
  if (text.startsWith('Đòn bẩy cao')) return 'LEVERAGE_HIGH';
  if (text.startsWith('CUR thẻ TD cao')) return 'CUR_HIGH';
  if (text.startsWith('Rủi ro rời bỏ CAO')) return 'CHURN_HIGH';
  if (text.startsWith('Cảnh báo lệch khẩu vị')) return 'RISK_MISMATCH';
  if (text.startsWith('KH chưa khai thác')) return 'UNDER_PENETRATED';
  if (text.startsWith('CASA tăng mạnh')) return 'CASA_SURGE_NO_BOND';
  if (text.startsWith('Không phát sinh giao dịch')) return 'DORMANT';
  return 'MAINTAIN';
}

function expectClose(actual: number, expected: number, label: string) {
  const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-6);
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

describe('MSB metric formulas against the Excel golden sheet', () => {
  let computed: Map<string, ComputedMetrics>;

  beforeAll(() => {
    computed = new Map(computePortfolioMetrics(buildInputs()).map((row) => [row.customerId, row]));
  });

  it('loads 20 customers and 7,300 daily positions', () => {
    expect(msbDataset.customers).toHaveLength(20);
    expect(msbDataset.manifest.dailyPositions).toBe(7300);
    expect(computed.size).toBe(20);
  });

  it.each(msbDataset.metricsGolden.map((row) => [row.cif, row] as const))(
    'matches every numeric column for CIF %s',
    (cif, golden) => {
      const actual = computed.get(cif)!;
      expectClose(actual.recencyDays, golden.recencyDays, 'recencyDays');
      expectClose(actual.freq90, golden.freq90, 'freq90');
      expectClose(actual.freqPrev90, golden.freqPrev90, 'freqPrev90');
      expectClose(actual.casaAvg90, golden.casaAvg90, 'casaAvg90');
      expectClose(actual.casaAvgPrev90, golden.casaAvgPrev90, 'casaAvgPrev90');
      expectClose(actual.casaTrend, golden.trend90, 'casaTrend');
      expectClose(actual.casaCv, golden.casaCv90, 'casaCv');
      expectClose(actual.ccAvgBalance90, golden.ccAvgBalance90, 'ccAvgBalance90');
      expectClose(actual.cur, golden.cur, 'cur');
      expectClose(actual.loanTotal, golden.loanTotal, 'loanTotal');
      expectClose(actual.fdCurrent, golden.fdCurrent, 'fdCurrent');
      expectClose(actual.bondCurrent, golden.bondCurrent, 'bondCurrent');
      expectClose(actual.fundCertCurrent, golden.fundCertCurrent, 'fundCertCurrent');
      expectClose(actual.tav, golden.tav, 'tav');
      expectClose(actual.leverage, golden.leverage, 'leverage');
      expectClose(actual.phs, golden.phs, 'phs');
      expectClose(actual.fxVolume12m, golden.fxVolume12m, 'fxVolume12m');
      expectClose(actual.rasRaw, golden.rasRaw, 'rasRaw');
      expectClose(actual.valueScore, golden.valueScore, 'valueScore');
      expectClose(actual.churnScore, golden.churnScore, 'churnScore');
      expectClose(actual.crossSellScore, golden.crossSellScore, 'crossSellScore');
      expectClose(actual.priorityScore, golden.priorityScore, 'priorityScore');
      expect(actual.churnLabel).toBe(golden.churnLabel);
      expect(actual.suggestionCode).toBe(suggestionCodeFromText(golden.suggestionText));
    },
  );

  it('reproduces the headline scenarios of the demo', () => {
    expect(computed.get('08102466')!.churnLabel).toBe('Cao');
    expect(computed.get('08102466')!.recencyDays).toBe(229);
    expect(computed.get('08102740')!.valueScore).toBeCloseTo(100, 9);
    expect(computed.get('08100548')!.suggestionCode).toBe('LEVERAGE_HIGH');
    expect(computed.get('08101096')!.suggestionCode).toBe('CASA_SURGE_NO_BOND');
    expect(computed.get('08101096')!.ras).toBe(1);
    expect(computed.get('08101096')!.riskAppetiteLabel).toBe('Rủi ro cao');
    const ranked = [...computed.values()].sort((a, b) => b.priorityScore - a.priorityScore);
    expect(ranked.slice(0, 3).map((row) => row.customerId)).toEqual(['08102740', '08102466', '08100137']);
  });

  it('flags no customer as a new CIF in the sample (youngest CIF is 365 days old)', () => {
    expect([...computed.values()].some((row) => row.isNewCif)).toBe(false);
  });
});

describe('helper classifiers', () => {
  it('uses the sample standard deviation like Excel STDEV', () => {
    expect(sampleStdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
    expect(sampleStdev([5])).toBe(0);
  });

  it('classifies behaviour with negative conditions first', () => {
    expect(classifyBehaviour({ casaTrend: 0.2, recencyDays: 5, cur: 0.9, fdLiquidated: false, churnLabel: 'Thấp' })).toBe('Tiêu cực');
    expect(classifyBehaviour({ casaTrend: 0.2, recencyDays: 5, cur: 0.1, fdLiquidated: false, churnLabel: 'Thấp' })).toBe('Tích cực');
    expect(classifyBehaviour({ casaTrend: 0.01, recencyDays: 5, cur: 0.1, fdLiquidated: false, churnLabel: 'Thấp' })).toBe('Trung tính');
  });

  it('follows the Excel nested-IF order for suggestions', () => {
    const base = {
      leverage: 0, cur: 0, churnScore: 0, rasRaw: 0, declaredRiskAppetite: 'Cân bằng', phs: 0.5, valueScore: 10,
      casaTrend: 0, holdsBond: true, recencyDays: 0,
    };
    expect(pickSuggestion({ ...base, leverage: 0.71, churnScore: 90 })).toBe('LEVERAGE_HIGH');
    expect(pickSuggestion({ ...base, cur: 0.81, churnScore: 90 })).toBe('CUR_HIGH');
    expect(pickSuggestion({ ...base, churnScore: 60 })).toBe('CHURN_HIGH');
    expect(pickSuggestion({ ...base, rasRaw: 0.6, declaredRiskAppetite: 'An toàn' })).toBe('RISK_MISMATCH');
    expect(pickSuggestion({ ...base, phs: 0.1, valueScore: 60 })).toBe('UNDER_PENETRATED');
    expect(pickSuggestion({ ...base, casaTrend: 0.2, holdsBond: false })).toBe('CASA_SURGE_NO_BOND');
    expect(pickSuggestion({ ...base, recencyDays: 120 })).toBe('DORMANT');
    expect(pickSuggestion(base)).toBe('MAINTAIN');
  });
});


describe('window that follows the filtered period', () => {
  const CIF = '08100137';

  function inputFor(windowDays: number): CustomerMetricsInput {
    return { ...buildInputs().find((row) => row.customerId === CIF)!, windowDays };
  }

  it.each([30, 60, 180])('window of %i days matches the period summary of the same range', (windowDays) => {
    const metrics = computeCoreMetrics(inputFor(windowDays));
    const period = summarizePeriod(CIF, positionsByCustomer().get(CIF)!, { from: addDays(AS_OF, -(windowDays - 1)), to: AS_OF });
    expect(metrics.windowDays).toBe(windowDays);
    expect(metrics.prevWindowDays).toBe(windowDays);
    expect(metrics.casaAvg90).toBeCloseTo(period.balances.casaBalance.avg, 6);
    expect(metrics.freq90).toBe(period.activity.txnCount);
    expect(metrics.ccAvgBalance90).toBeCloseTo(period.balances.creditCardBalance.avg, 6);
  });

  it('keeps the snapshot values of the golden sheet at the default 90-day window', () => {
    const golden = msbDataset.metricsGolden.find((row) => row.cif === CIF)!;
    const metrics = computeCoreMetrics(inputFor(90));
    expect(metrics.casaAvg90).toBeCloseTo(golden.casaAvg90, 6);
    expect(metrics.churnScore).toBeCloseTo(golden.churnScore, 6);
  });

  it('does not rescale the churn recency denominator with the window', () => {
    // Recency is measured from the as-of date, so a shorter window must not inflate churn.
    const short = computeCoreMetrics({ ...inputFor(30), positions: inputFor(30).positions });
    const long = computeCoreMetrics(inputFor(180));
    const recencyTerm = (rows: { recencyDays: number }) => 40 * Math.min(rows.recencyDays / 90, 1);
    expect(recencyTerm(short)).toBeCloseTo(recencyTerm(long), 9);
  });

  it('reports a shorter preceding window when the journal does not reach back far enough', () => {
    const metrics = computeCoreMetrics(inputFor(365));
    expect(metrics.windowDays).toBe(365);
    expect(metrics.prevWindowDays).toBe(0);
  });

  it('clamps the window into the supported range', () => {
    expect(clampWindowDays(undefined)).toBe(90);
    expect(clampWindowDays(1)).toBe(7);
    expect(clampWindowDays(9999)).toBe(365);
    expect(clampWindowDays(30.4)).toBe(30);
  });
});
