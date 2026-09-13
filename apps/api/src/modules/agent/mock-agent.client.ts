import { Injectable } from '@nestjs/common';
import type { AnalyzeCustomerInput, CustomerAnalysis } from '@mlink/contracts';
import { randomUUID } from 'node:crypto';
import type { AgentClient } from './agent.types';
import { buildMockAnalysis } from './mock-fixtures';

@Injectable()
export class MockAgentClient implements AgentClient {
  async analyzeCustomer(input: AnalyzeCustomerInput): Promise<CustomerAnalysis> {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return buildMockAnalysis(input.customerId, input.locale, `RUN-MOCK-${randomUUID()}`);
  }
}

