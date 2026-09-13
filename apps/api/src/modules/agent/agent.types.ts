import type { AnalyzeCustomerInput, CustomerAnalysis } from '@mlink/contracts';

export const AGENT_CLIENT = Symbol('AGENT_CLIENT');

export interface AgentClient {
  analyzeCustomer(input: AnalyzeCustomerInput): Promise<CustomerAnalysis>;
}

