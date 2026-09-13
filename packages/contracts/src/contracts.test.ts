import { describe, expect, it } from 'vitest';
import { customerAnalysisSchema } from './index';

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

