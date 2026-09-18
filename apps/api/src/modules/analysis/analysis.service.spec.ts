import type { CustomerAnalysis } from '@mlink/contracts';
import { AnalysisService } from './analysis.service';
import type { AgentClient } from '../agent/agent.types';
import type { AgentRun } from '../../database/entities';
import type { CustomersService } from '../customers/customers.service';
import type { MetricsService } from '../metrics/metrics.service';

const DATA_RANGE = { first: '2025-09-19', last: '2026-09-18' };

function analysisWith(period: CustomerAnalysis['period']): CustomerAnalysis {
  return {
    runId: 'RUN-1', customerId: '08102466',
    summary: { relationshipStatus: 'at_risk', opportunityScore: 42.4, overview: 'Churn risk' },
    signals: [], recommendations: [], guardrail: { sellAllowed: true, reason: null },
    ...(period === undefined ? {} : { period }),
  };
}

/** Captures the row the service writes, then serves it back through getById(). */
function serviceWith(response: CustomerAnalysis) {
  const stored: Partial<AgentRun> = {};
  const runs = {
    create: (row: Partial<AgentRun>) => Object.assign(stored, row),
    save: async (row: Partial<AgentRun>) => row,
    update: async (_id: string, patch: Partial<AgentRun>) => Object.assign(stored, patch),
    findOne: async () => ({ ...stored, recommendations: [] }),
  };
  // The service writes the response inside a transaction, so the fake manager must merge like update() does.
  const manager = {
    update: async (_entity: unknown, _id: string, patch: Partial<AgentRun>) => Object.assign(stored, patch),
    save: async () => undefined,
  };
  const dataSource = { transaction: async (work: (m: typeof manager) => Promise<void>) => work(manager) };
  const agent: AgentClient = { analyzeCustomer: async () => response };
  const customers = { assertCustomer: async () => undefined } as unknown as CustomersService;
  const metrics = { dataRange: async () => DATA_RANGE } as unknown as MetricsService;
  return new AnalysisService(agent, runs as never, dataSource as never, customers, metrics);
}

describe('AnalysisService period handling', () => {
  const window = { locale: 'vi', periodFrom: '2026-08-20', periodTo: '2026-09-18' };

  it('reports periodApplied=true when the Agent echoes the requested window', async () => {
    const service = serviceWith(analysisWith({ from: '2026-08-20', to: '2026-09-18', windowDays: 30 }));
    const result = await service.analyze('08102466', 'RM001', window);
    expect(result.period).toEqual({ from: '2026-08-20', to: '2026-09-18', windowDays: 30 });
    expect(result.periodApplied).toBe(true);
  });

  it('reports periodApplied=false when a stale Agent answers without a period', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = serviceWith(analysisWith(undefined));
    const result = await service.analyze('08102466', 'RM001', window);
    expect(result.periodApplied).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('agent_ignored_period'));
    warn.mockRestore();
  });

  it('reports periodApplied=false when the Agent echoes a different window', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = serviceWith(analysisWith({ from: '2025-09-19', to: '2026-09-18', windowDays: 365 }));
    expect((await service.analyze('08102466', 'RM001', window)).periodApplied).toBe(false);
    warn.mockRestore();
  });

  it('resolves the default window when the client sends none, and still flags an Agent that ignores it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = serviceWith(analysisWith(undefined));
    const result = await service.analyze('08102466', 'RM001', { locale: 'vi' });
    expect(result.period).toEqual({ from: '2026-06-21', to: '2026-09-18', windowDays: 90 });
    expect(result.periodApplied).toBe(false);
    warn.mockRestore();
  });

  it('leaves period and periodApplied null for a run stored before periods existed', async () => {
    const legacy = {
      id: 'ARUN-old', customerId: '08102466', rmId: 'RM001', provider: 'greennode', status: 'COMPLETED',
      requestPayload: { customerId: '08102466', locale: 'vi' },
      responsePayload: { runId: 'RUN-old', summary: {}, guardrail: { sellAllowed: true } },
      recommendations: [],
    };
    const runs = { findOne: async () => legacy };
    const service = new AnalysisService(
      { analyzeCustomer: async () => analysisWith(undefined) }, runs as never, {} as never,
      { assertCustomer: async () => undefined } as unknown as CustomersService,
      { dataRange: async () => DATA_RANGE } as unknown as MetricsService,
    );
    const result = await service.getById('ARUN-old', 'RM001');
    expect(result.period).toBeNull();
    expect(result.periodApplied).toBeNull();
  });
});
