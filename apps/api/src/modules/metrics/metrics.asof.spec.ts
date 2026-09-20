/**
 * As-of recomputation: the pure formulas applied to the journal truncated at an earlier day
 * must behave like the Excel sheet would if it had been built on that day.
 */
import { msbDataset, positionsByCustomer } from '../../database/msb-dataset';
import { computePortfolioMetrics, type CustomerMetricsInput } from './metrics.formulas';
import { daysBetween } from './period.formulas';
import { requiredHistoryDays } from './metrics.service';

function inputsAsOf(asOf: string): CustomerMetricsInput[] {
  const grouped = positionsByCustomer();
  return msbDataset.customers.map((customer) => ({
    customerId: customer.cif, asOfDate: asOf, cifOpenedAt: customer.cifOpenedAt,
    declaredRiskAppetite: customer.declaredRiskAppetite, creditLimit: msbDataset.creditLimits[customer.cif] ?? 0,
    holdings: Object.fromEntries(Object.entries(msbDataset.productHoldings[customer.cif]).map(([code, held]) => [code, held === 1])),
    positions: (grouped.get(customer.cif) ?? [])
      .filter((row) => row.positionDate <= asOf)
      .map((row) => ({
        dayIndex: row.dayIndex, casaBalance: row.casaBalance, fdBalance: row.fdBalance, bondBalance: row.bondBalance,
        fundCertValue: row.fundCertValue, loanTotal: row.loanTotal, creditCardBalance: row.creditCardBalance,
        fxVolume: row.fxVolume, txnCount: row.txnCount, isActive: row.isActive,
      })),
  }));
}

describe('metrics as of an earlier journal day', () => {
  it('as of the last day equals the stored golden snapshot', () => {
    const rows = new Map(computePortfolioMetrics(inputsAsOf('2026-09-18')).map((row) => [row.customerId, row]));
    const golden = msbDataset.metricsGolden.find((row) => row.cif === '08102740')!;
    expect(rows.get('08102740')!.priorityScore).toBeCloseTo(golden.priorityScore, 6);
  });

  it('the same customer reads very differently as of different days (08102466: last active 2026-02-10, FD closed 2026-03-20)', () => {
    const early = new Map(computePortfolioMetrics(inputsAsOf('2026-02-15')).map((row) => [row.customerId, row])).get('08102466')!;
    expect(early.recencyDays).toBe(5);
    expect(early.churnScore).toBeLessThan(20);
    expect(early.fdCurrent).toBe(1_142_000_000);
    expect(early.fdLiquidated).toBe(false);

    // As of day 275 (2026-06-20) the customer is already at high risk with the term deposit gone.
    const rows = new Map(computePortfolioMetrics(inputsAsOf('2026-06-20')).map((row) => [row.customerId, row]));
    const s = rows.get('08102466')!;
    expect(s.recencyDays).toBe(220 - 90);
    expect(s.churnScore).toBeGreaterThanOrEqual(60);
    expect(s.churnLabel).toBe('Cao');
    expect(s.fdCurrent).toBe(0);
    expect(s.fdLiquidated).toBe(true);
    // Value Score stays portfolio-relative: exactly one customer scores 100 on any day.
    expect([...rows.values()].filter((row) => Math.abs(row.valueScore - 100) < 1e-9)).toHaveLength(1);
  });

  it('flags insufficient history when fewer than 180 journal days precede the as-of date', () => {
    expect(daysBetween('2025-09-19', '2025-12-31') + 1).toBeLessThan(requiredHistoryDays(90));
    expect(daysBetween('2025-09-19', '2026-06-20') + 1).toBeGreaterThanOrEqual(requiredHistoryDays(90));
    // A 30-day window only needs 60 days of journal, so the same date is sufficient for it.
    expect(daysBetween('2025-09-19', '2025-12-31') + 1).toBeGreaterThanOrEqual(requiredHistoryDays(30));
    // Formulas still run on a short history (previous window simply has fewer or no days).
    const rows = computePortfolioMetrics(inputsAsOf('2025-12-31'));
    expect(rows).toHaveLength(40);
    expect(rows.every((row) => Number.isFinite(row.priorityScore))).toBe(true);
  });
});
