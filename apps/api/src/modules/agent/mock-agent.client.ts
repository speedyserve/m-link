import { Injectable } from '@nestjs/common';
import type { AnalysisPeriod, AnalyzeCustomerInput, CustomerAnalysis } from '@mlink/contracts';
import { randomUUID } from 'node:crypto';
import { MetricsService } from '../metrics/metrics.service';
import { daysBetween } from '../metrics/period.formulas';
import type { AgentClient } from './agent.types';
import { buildMockAnalysis } from './mock-fixtures';

@Injectable()
export class MockAgentClient implements AgentClient {
  constructor(private readonly metrics: MetricsService) {}

  async analyzeCustomer(input: AnalyzeCustomerInput): Promise<CustomerAnalysis> {
    await new Promise((resolve) => setTimeout(resolve, 350));
    // The mock honours the filtered period: metrics are recomputed for the window the RM selected.
    const period: AnalysisPeriod | null =
      input.periodFrom && input.periodTo
        ? { from: input.periodFrom, to: input.periodTo, windowDays: daysBetween(input.periodFrom, input.periodTo) + 1 }
        : null;
    const metrics = await this.metrics
      .getAsOf(input.customerId, period?.to, period?.windowDays)
      .catch(() => null);
    return buildMockAnalysis(input.customerId, input.locale, `RUN-MOCK-${randomUUID()}`, metrics, period);
  }
}
