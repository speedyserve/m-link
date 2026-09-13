import { MockAgentClient } from './mock-agent.client';

describe('MockAgentClient', () => {
  const client = new MockAgentClient();
  it('returns a sales opportunity for CUS001', async () => {
    const result = await client.analyzeCustomer({ customerId: 'CUS001', objective: 'prepare_rm_brief', requestedBy: 'RM001', locale: 'en' });
    expect(result.guardrail.sellAllowed).toBe(true);
    expect(result.recommendations).toHaveLength(2);
  });
  it('returns do not sell for CUS002', async () => {
    const result = await client.analyzeCustomer({ customerId: 'CUS002', objective: 'prepare_rm_brief', requestedBy: 'RM001', locale: 'vi' });
    expect(result.guardrail.sellAllowed).toBe(false);
    expect(result.recommendations).toHaveLength(0);
  });
  it('allows an empty recommendation set for CUS003', async () => {
    const result = await client.analyzeCustomer({ customerId: 'CUS003', objective: 'prepare_rm_brief', requestedBy: 'RM001', locale: 'vi' });
    expect(result.recommendations).toHaveLength(0);
  });
});
