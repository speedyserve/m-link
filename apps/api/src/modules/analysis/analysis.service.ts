import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { customerAnalysisSchema, localeSchema, type AnalysisPeriod, type Locale } from '@mlink/contracts';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { DomainException } from '../../common/http';
import { AgentRun, Recommendation, RecommendationEvidence } from '../../database/entities';
import { AGENT_CLIENT, type AgentClient } from '../agent/agent.types';
import { AgentProviderError } from '../agent/greennode-agent.client';
import { CustomersService } from '../customers/customers.service';
import { MetricsService } from '../metrics/metrics.service';
import { daysBetween, resolveRange } from '../metrics/period.formulas';

/**
 * jsonb columns are typed `Record<string, unknown>`, which TypeORM's `update()` mapper cannot
 * express; the payloads written here are already validated by their Zod schema.
 */
const asJsonb = <T extends object>(value: T) => value as unknown as Record<string, never>;

/** True when the Agent echoed back exactly the window it was asked to analyse. */
function periodMatches(
  requested: { periodFrom?: string; periodTo?: string },
  echoed: { from: string; to: string } | null | undefined,
): boolean {
  if (!requested.periodFrom || !requested.periodTo) return true;
  return echoed?.from === requested.periodFrom && echoed?.to === requested.periodTo;
}

/** Body of `POST /api/customers/:id/analyze` after controller validation. */
export interface AnalyzeRequestBody {
  locale?: unknown;
  periodFrom?: string;
  periodTo?: string;
}

@Injectable()
export class AnalysisService {
  constructor(
    @Inject(AGENT_CLIENT) private readonly agent: AgentClient,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly customers: CustomersService,
    private readonly metrics: MetricsService,
  ) {}

  private provider() {
    return (process.env.AGENT_PROVIDER ?? 'mock').toLowerCase();
  }

  async analyze(customerId: string, rmId: string, body: AnalyzeRequestBody) {
    await this.customers.assertCustomer(customerId, rmId);
    const locale: Locale = localeSchema.catch('vi').parse(body.locale);
    // Resolve the requested window against the customer's journal, so both the stored run and
    // the Agent request always carry a concrete, clamped period even if the client sent none.
    const dataRange = await this.metrics.dataRange(customerId);
    const period = resolveRange(dataRange, { from: body.periodFrom, to: body.periodTo });
    const id = `ARUN-${randomUUID()}`;
    const input = {
      customerId, objective: 'prepare_rm_brief', requestedBy: rmId, locale,
      periodFrom: period.from, periodTo: period.to,
    };
    const run = this.runs.create({
      id, customerId, rmId, provider: this.provider(), externalRunId: null,
      objective: input.objective, status: 'PENDING', startedAt: null, completedAt: null,
      latencyMs: null, requestPayload: { ...input, windowDays: period.days },
      responsePayload: null, errorCode: null, errorMessage: null,
    });
    try {
      await this.runs.save(run);
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new DomainException(409, 'ANALYSIS_IN_PROGRESS', 'An analysis is already in progress.');
      }
      throw error;
    }

    const started = Date.now();
    await this.runs.update(id, { status: 'RUNNING', startedAt: new Date(started) });
    try {
      const response = customerAnalysisSchema.parse(await this.agent.analyzeCustomer(input));
      if (!periodMatches(input, response.period)) {
        // A stale Agent build drops periodFrom/periodTo and answers with its default snapshot.
        console.warn(
          `agent_ignored_period customerId=${customerId} requested=${input.periodFrom}..${input.periodTo} ` +
          `echoed=${response.period ? `${response.period.from}..${response.period.to}` : 'none'}`,
        );
      }
      const completedAt = new Date();
      await this.dataSource.transaction(async (manager) => {
        await manager.update(AgentRun, id, {
          status: 'COMPLETED', externalRunId: response.runId, responsePayload: asJsonb(response),
          completedAt, latencyMs: completedAt.getTime() - started,
        });
        for (const item of response.recommendations) {
          const recommendationId = `REC-${randomUUID()}`;
          await manager.save(Recommendation, {
            id: recommendationId, agentRunId: id, customerId, priority: item.priority,
            type: item.type, title: item.title, description: item.description,
            confidence: item.confidence.toFixed(4), productId: item.product?.id ?? null,
            productName: item.product?.name ?? null, suggestedScript: item.script,
            sellAllowed: response.guardrail.sellAllowed, reasons: item.reasons,
          });
          for (const evidence of item.evidence) {
            await manager.save(RecommendationEvidence, {
              id: `EVI-${randomUUID()}`, recommendationId, type: evidence.type,
              title: evidence.title, description: evidence.description,
              source: evidence.source ?? null, sourceReference: evidence.sourceReference ?? null,
            });
          }
        }
      });
      return this.getById(id, rmId);
    } catch (error) {
      const providerError = error instanceof AgentProviderError ? error : new AgentProviderError('AGENT_INVALID_RESPONSE', 'Agent returned an invalid response.');
      const status = providerError.code === 'AGENT_TIMEOUT' ? 'TIMEOUT' : 'FAILED';
      await this.runs.update(id, {
        status, completedAt: new Date(), latencyMs: Date.now() - started,
        errorCode: providerError.code, errorMessage: 'Customer analysis could not be completed.',
      });
      const httpStatus = providerError.code === 'AGENT_TIMEOUT' ? 504 : providerError.code === 'AGENT_REJECTED' ? 502 : 503;
      throw new DomainException(httpStatus, providerError.code, 'Customer analysis could not be completed.');
    }
  }

  async list(customerId: string, rmId: string) {
    await this.customers.assertCustomer(customerId, rmId);
    const items = await this.runs.find({ where: { customerId, rmId }, order: { createdAt: 'DESC' } });
    return items.map((run) => this.summary(run));
  }

  async getById(id: string, rmId: string) {
    const run = await this.runs.findOne({
      where: { id, rmId }, relations: { recommendations: { evidence: true } },
      order: { recommendations: { priority: 'ASC' } },
    });
    if (!run) throw new DomainException(404, 'ANALYSIS_NOT_FOUND', 'Analysis was not found.');
    return {
      ...this.summary(run),
      analysis: run.responsePayload,
      recommendations: run.recommendations?.map((item) => ({
        id: item.id, priority: item.priority, type: item.type, title: item.title,
        description: item.description, confidence: Number(item.confidence),
        product: item.productId ? { id: item.productId, name: item.productName } : null,
        reasons: item.reasons, script: item.suggestedScript, evidence: item.evidence,
      })) ?? [],
    };
  }

  /** The analysed window, read back from the stored request payload (null for runs created before periods existed). */
  private periodOf(run: AgentRun): AnalysisPeriod | null {
    const payload = run.requestPayload as { periodFrom?: string; periodTo?: string; windowDays?: number } | null;
    if (!payload?.periodFrom || !payload?.periodTo) return null;
    return {
      from: payload.periodFrom, to: payload.periodTo,
      windowDays: payload.windowDays ?? daysBetween(payload.periodFrom, payload.periodTo) + 1,
    };
  }

  /**
   * Whether the Agent honoured the requested window: `null` when no window was requested or the
   * run has no response yet, `false` when the Agent answered without echoing the period (which a
   * build older than the period-aware contract does).
   */
  private periodAppliedOf(run: AgentRun): boolean | null {
    const requested = run.requestPayload as { periodFrom?: string; periodTo?: string } | null;
    if (!requested?.periodFrom || !requested?.periodTo || !run.responsePayload) return null;
    const echoed = (run.responsePayload as { period?: { from: string; to: string } | null }).period;
    return periodMatches(requested, echoed);
  }

  private summary(run: AgentRun) {
    return {
      id: run.id, customerId: run.customerId, provider: run.provider, period: this.periodOf(run),
      periodApplied: this.periodAppliedOf(run),
      externalRunId: run.externalRunId, status: run.status, objective: run.objective,
      startedAt: run.startedAt, completedAt: run.completedAt, latencyMs: run.latencyMs,
      error: run.errorCode ? { code: run.errorCode, message: run.errorMessage } : null,
      createdAt: run.createdAt,
    };
  }
}

