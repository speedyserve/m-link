import { Injectable } from '@nestjs/common';
import { customerAnalysisSchema, type AnalyzeCustomerInput, type CustomerAnalysis } from '@mlink/contracts';
import type { AgentClient } from './agent.types';

export class AgentProviderError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

@Injectable()
export class GreenNodeAgentClient implements AgentClient {
  async analyzeCustomer(input: AnalyzeCustomerInput): Promise<CustomerAnalysis> {
    const baseUrl = process.env.AGENT_BASE_URL;
    const apiKey = process.env.AGENT_API_KEY;
    if (!baseUrl || !apiKey) throw new AgentProviderError('AGENT_CONFIGURATION_ERROR', 'Agent provider is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.AGENT_TIMEOUT_MS ?? 30_000));
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/agent/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(input), signal: controller.signal,
      });
      if (!response.ok) {
        const code = response.status >= 500 ? 'AGENT_UNAVAILABLE' : 'AGENT_REJECTED';
        throw new AgentProviderError(code, 'Agent provider rejected the request.');
      }
      const payload: unknown = await response.json();
      const parsed = customerAnalysisSchema.safeParse(payload);
      if (!parsed.success) throw new AgentProviderError('AGENT_INVALID_RESPONSE', 'Agent returned an invalid response.');
      return parsed.data;
    } catch (error) {
      if (error instanceof AgentProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new AgentProviderError('AGENT_TIMEOUT', 'Agent request timed out.');
      throw new AgentProviderError('AGENT_NETWORK_ERROR', 'Agent could not be reached.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

