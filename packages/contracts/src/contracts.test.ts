import { describe, expect, it } from 'vitest';
import { analyzeCustomerInputSchema, customerAnalysisSchema } from './index';

describe('customerAnalysisSchema', () => {
  it('accepts a valid no-action response', () => {
    const result = customerAnalysisSchema.parse({
      runId: 'RUN-1',
      customerId: 'CUS003',
      summary: { relationshipStatus: 'healthy', opportunityScore: 10, overview: 'Normal' },
      signals: [],
      recommendations: [],
      guardrail: { sellAllowed: true, reason: null },
    });
    expect(result.recommendations).toHaveLength(0);
  });

  it('rejects confidence outside its range', () => {
    expect(() =>
      customerAnalysisSchema.parse({
        runId: 'RUN-2',
        customerId: 'CUS001',
        summary: { relationshipStatus: 'healthy', opportunityScore: 101, overview: 'Invalid' },
        signals: [],
        recommendations: [],
        guardrail: { sellAllowed: true, reason: null },
      }),
    ).toThrow();
  });
});


describe('analyzeCustomerInputSchema', () => {
  it('accepts a request without a period', () => {
    const result = analyzeCustomerInputSchema.parse({ customerId: '08102466', requestedBy: 'RM001' });
    expect(result.objective).toBe('prepare_rm_brief');
    expect(result.locale).toBe('vi');
    expect(result.periodFrom).toBeUndefined();
  });

  it('accepts a filtered period', () => {
    const result = analyzeCustomerInputSchema.parse({
      customerId: '08102466', requestedBy: 'RM001', locale: 'en', periodFrom: '2026-08-20', periodTo: '2026-09-18',
    });
    expect(result.periodFrom).toBe('2026-08-20');
    expect(result.periodTo).toBe('2026-09-18');
  });

  it('rejects an inverted period and a malformed date', () => {
    expect(() => analyzeCustomerInputSchema.parse({ customerId: 'C', requestedBy: 'RM001', periodFrom: '2026-09-18', periodTo: '2026-08-20' })).toThrow();
    expect(() => analyzeCustomerInputSchema.parse({ customerId: 'C', requestedBy: 'RM001', periodFrom: '18/09/2026' })).toThrow();
  });
});

describe('customerAnalysisSchema period echo', () => {
  const base = {
    runId: 'RUN-3', customerId: '08102466',
    summary: { relationshipStatus: 'at_risk', opportunityScore: 42.7, overview: 'Churn risk' },
    signals: [], recommendations: [], guardrail: { sellAllowed: true, reason: null },
  };
  it('accepts a response with the analysed window', () => {
    const result = customerAnalysisSchema.parse({ ...base, period: { from: '2026-08-20', to: '2026-09-18', windowDays: 30 } });
    expect(result.period?.windowDays).toBe(30);
  });
  it('still accepts a response stored before periods existed', () => {
    expect(customerAnalysisSchema.parse(base).period).toBeUndefined();
  });
});
