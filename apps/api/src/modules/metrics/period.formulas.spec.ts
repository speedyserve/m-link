import { msbDataset, positionsByCustomer } from '../../database/msb-dataset';
import { resolveRange, summarizePeriod } from './period.formulas';

const golden = (cif: string) => msbDataset.metricsGolden.find((row) => row.cif === cif)!;
const rows = (cif: string) => positionsByCustomer().get(cif)!;

describe('summarizePeriod against the golden sheet', () => {
  it('full year FX flow equals the 12-month FX volume metric (08100137)', () => {
    const summary = summarizePeriod('08100137', rows('08100137'), { from: '2025-09-19', to: '2026-09-18' });
    expect(summary.flows.FX.total).toBeCloseTo(golden('08100137').fxVolume12m, 6);
    expect(summary.range.days).toBe(365);
    expect(summary.dataRange).toEqual({ first: '2025-09-19', last: '2026-09-18' });
    expect(summary.activity.days).toBe(365);
  });

  it('last 90 days reproduce casaAvg90, freq90 and the snapshot balances', () => {
    const summary = summarizePeriod('08100137', rows('08100137'), { from: '2026-06-21', to: '2026-09-18' });
    const g = golden('08100137');
    expect(summary.range.days).toBe(90);
    expect(summary.balances.casaBalance.avg).toBeCloseTo(g.casaAvg90, 6);
    expect(summary.balances.creditCardBalance.avg).toBeCloseTo(g.ccAvgBalance90, 6);
    expect(summary.activity.txnCount).toBe(g.freq90);
    expect(summary.balances.fdBalance.end).toBe(g.fdCurrent);
    expect(summary.balances.bondBalance.end).toBe(g.bondCurrent);
    expect(summary.balances.fundCertValue.end).toBe(g.fundCertCurrent);
    expect(summary.totalAssets.end).toBe(29_631_000 + g.fdCurrent + g.bondCurrent + g.fundCertCurrent);
  });

  it('monthly averages match sheet "CASA-FD binh quan 12 thang"', () => {
    const summary = summarizePeriod('08100137', rows('08100137'), { from: '2025-10-01', to: '2025-10-31' });
    expect(summary.byMonth).toHaveLength(1);
    expect(summary.byMonth[0].monthKey).toBe('202510');
    expect(summary.byMonth[0].casaAvg).toBeCloseTo(49_987_322.5806452, 4);
    expect(summary.byMonth[0].fdAvg).toBe(2_244_000_000);
  });

  it('splits securities flows into buy and sell legs', () => {
    const summary = summarizePeriod('08100137', rows('08100137'), { from: '2025-09-19', to: '2026-09-18' });
    const securities = summary.flows.SECURITIES;
    expect(securities.buy! + securities.sell!).toBeCloseTo(securities.total, 6);
    expect(securities.sell).toBeGreaterThan(0);
  });

  it('records dormancy for the churn-high customer', () => {
    const summary = summarizePeriod('08102466', rows('08102466'), { from: '2026-06-21', to: '2026-09-18' });
    expect(summary.activity.activeDays).toBe(0);
    expect(summary.activity.lastActiveDate).toBeNull();
    expect(summary.balances.fdBalance.start).toBe(1_750_000_000);
    expect(summary.balances.fdBalance.end).toBe(0);
  });
});

describe('resolveRange', () => {
  const dataRange = { first: '2025-09-19', last: '2026-09-18' };
  it('defaults to the last 90 days of data', () => {
    expect(resolveRange(dataRange, {})).toEqual({ from: '2026-06-21', to: '2026-09-18', days: 90 });
  });
  it('clamps requests outside the data range', () => {
    expect(resolveRange(dataRange, { from: '2020-01-01', to: '2030-01-01' })).toEqual({ from: '2025-09-19', to: '2026-09-18', days: 365 });
  });
  it('keeps a custom range and reports its length', () => {
    expect(resolveRange(dataRange, { from: '2026-01-01', to: '2026-01-31' }).days).toBe(31);
  });
});
