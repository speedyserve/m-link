import { Injectable, Logger } from '@nestjs/common';

/**
 * Sends the RM's question plus the already-looked-up facts to the Python agent, which only
 * phrases them naturally (see ASSISTANT_SYSTEM_PROMPT in apps/agent/generator.py) — it never
 * invents its own numbers. Falls back to the raw facts string when the agent/LLM is
 * unavailable, so the floating assistant always answers something.
 */
@Injectable()
export class AssistantAgentClient {
  private readonly logger = new Logger(AssistantAgentClient.name);

  async phrase(question: string, facts: string): Promise<string> {
    const baseUrl = process.env.AGENT_BASE_URL;
    const apiKey = process.env.AGENT_API_KEY;
    if (!baseUrl || !apiKey) return facts;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.AGENT_TIMEOUT_MS ?? 15_000));
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/agent/assistant-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ question, facts }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`assistant-answer rejected: ${response.status}`);
        return facts;
      }
      const payload = (await response.json()) as { answer?: string };
      return payload.answer?.trim() || facts;
    } catch (error) {
      this.logger.warn(`assistant-answer unreachable: ${(error as Error).message}`);
      return facts;
    } finally {
      clearTimeout(timeout);
    }
  }
}
