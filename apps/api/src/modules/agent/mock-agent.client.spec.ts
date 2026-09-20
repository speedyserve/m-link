import type { CustomerMetrics } from '@mlink/contracts';
import { MockAgentClient } from './mock-agent.client';
import type { MetricsService } from '../metrics/metrics.service';

const metricsFor = (overrides: Partial<CustomerMetrics>): CustomerMetrics => ({
  customerId: '08100411', asOfDate: '2026-09-18', recencyDays: 0, freq90: 104, freqPrev90: 91,
  casaAvg90: '71007844.44', casaAvgPrev90: '71597866.67', casaTrend: -0.0082, casaCv: 0.0448,
  ccAvgBalance90: '0.00', creditLimit: '0.00', cur: 0, loanTotal: '0.00', fdCurrent: '0.00', fdAvgPrev90: '0.00',
  fdLiquidated: false, bondCurrent: '0.00', fundCertCurrent: '0.00', tav: '71007844.44', leverage: 0, phs: 0.1538,
  holdingCount: 2, fxVolume12m: '0.00', rasRaw: 0, ras: 0, valueScore: 1.05, churnScore: 0.25, churnLabel: 'Thấp',
  crossSellScore: 84.6, priorityScore: 21.66, behaviourLabel: 'Trung tính', riskAppetiteLabel: 'An toàn',
  tierLabel: 'Mass', phsLabel: 'Chưa khai thác', suggestionCode: 'MAINTAIN', isNewCif: false,
  computedAt: '2026-09-18T00:00:00.000Z', ...overrides,
});

/** Records the arguments the client passes to MetricsService.getAsOf. */
let lastGetAsOf: { customerId: string; asOf?: string; windowDays?: number } | null = null;

function clientWith(metrics: CustomerMetrics | null) {
  lastGetAsOf = null;
  const service = {
    findLatest: async () => metrics,
    getAsOf: async (customerId: string, asOf?: string, windowDays?: number) => {
      lastGetAsOf = { customerId, asOf, windowDays };
      if (!metrics) throw new Error('METRICS_NOT_FOUND');
      return { ...metrics, stored: false, historyDays: 365, insufficientHistory: false, windowDays: windowDays ?? 90, prevWindowDays: windowDays ?? 90 };
    },
  } as unknown as MetricsService;
  return new MockAgentClient(service);
}

const input = (customerId: string, locale: 'vi' | 'en' = 'vi', period?: { periodFrom: string; periodTo: string }) =>
  ({ customerId, objective: 'prepare_rm_brief', requestedBy: 'RM001', locale, ...period }) as const;

describe('MockAgentClient (MSB sample portfolio)', () => {
  it('returns a retention scenario for the churn-high customer 08100274', async () => {
    const result = await clientWith(metricsFor({ customerId: '08100274', churnScore: 100, churnLabel: 'Cao', recencyDays: 94, priorityScore: 52.3 }))
      .analyzeCustomer(input('08100274', 'en'));
    expect(result.summary.relationshipStatus).toBe('at_risk');
    expect(result.summary.opportunityScore).toBe(52.3);
    expect(result.recommendations[0].type).toBe('retention');
    expect(result.guardrail.sellAllowed).toBe(true);
  });
  it('protects the loan and never offers credit for the high-leverage customer 08100548', async () => {
    const result = await clientWith(null).analyzeCustomer(input('08100548'));
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].product?.id).toBe('BANCA_PRU_PROTECT');
  });
  it('returns do not sell for the open complaint of 08101918', async () => {
    const result = await clientWith(null).analyzeCustomer(input('08101918'));
    expect(result.guardrail.sellAllowed).toBe(false);
    expect(result.recommendations).toHaveLength(0);
    expect(result.signals[0].type).toBe('open_complaint');
  });
  it('echoes stored metrics without inventing recommendations for other customers', async () => {
    const result = await clientWith(metricsFor({})).analyzeCustomer(input('08100411'));
    expect(result.recommendations).toHaveLength(0);
    expect(result.summary.opportunityScore).toBe(21.7);
    expect(result.summary.overview).toContain('Duy trì chăm sóc');
  });
  it('degrades gracefully when metrics are missing', async () => {
    const result = await clientWith(null).analyzeCustomer(input('08100411', 'en'));
    expect(result.summary.opportunityScore).toBe(0);
    expect(result.summary.relationshipStatus).toBe('healthy');
    expect(result.period).toBeNull();
  });

  it('recomputes metrics for the filtered window and echoes the period', async () => {
    const result = await clientWith(metricsFor({ customerId: '08100274', churnScore: 63.67, churnLabel: 'Cao', recencyDays: 29, priorityScore: 48.2 }))
      .analyzeCustomer(input('08100274', 'vi', { periodFrom: '2026-08-20', periodTo: '2026-09-18' }));
    expect(lastGetAsOf).toEqual({ customerId: '08100274', asOf: '2026-09-18', windowDays: 30 });
    expect(result.period).toEqual({ from: '2026-08-20', to: '2026-09-18', windowDays: 30 });
    expect(result.summary.opportunityScore).toBe(48.2);
    expect(result.signals[0].description).toContain('29 ngày');
    expect(result.recommendations[0].evidence[0].description).toContain('2026-08-20 → 2026-09-18');
  });

  it('falls back to the stored snapshot window when no period is sent', async () => {
    await clientWith(metricsFor({})).analyzeCustomer(input('08100411'));
    expect(lastGetAsOf).toEqual({ customerId: '08100411', asOf: undefined, windowDays: undefined });
  });
});
