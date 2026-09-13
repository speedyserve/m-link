import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { customerAnalysisSchema, localeSchema, type Locale } from '@mlink/contracts';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { DomainException } from '../../common/http';
import { AgentRun, Recommendation, RecommendationEvidence } from '../../database/entities';
import { AGENT_CLIENT, type AgentClient } from '../agent/agent.types';
import { AgentProviderError } from '../agent/greennode-agent.client';
import { CustomersService } from '../customers/customers.service';

@Injectable()
export class AnalysisService {
  constructor(
    @Inject(AGENT_CLIENT) private readonly agent: AgentClient,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly customers: CustomersService,
  ) {}

  private provider() {
    return (process.env.AGENT_PROVIDER ?? 'mock').toLowerCase();
  }

  async analyze(customerId: string, rmId: string, localeValue: unknown) {
    await this.customers.assertCustomer(customerId, rmId);
    const locale: Locale = localeSchema.catch('vi').parse(localeValue);
    const id = `ARUN-${randomUUID()}`;
    const input = { customerId, objective: 'prepare_rm_brief', requestedBy: rmId, locale };
    const run = this.runs.create({
      id, customerId, rmId, provider: this.provider(), externalRunId: null,
      objective: input.objective, status: 'PENDING', startedAt: null, completedAt: null,
      latencyMs: null, requestPayload: input, responsePayload: null, errorCode: null, errorMessage: null,
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
      const completedAt = new Date();
      await this.dataSource.transaction(async (manager) => {
        await manager.update(AgentRun, id, {
          status: 'COMPLETED', externalRunId: response.runId, responsePayload: response,
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

  private summary(run: AgentRun) {
    return {
      id: run.id, customerId: run.customerId, provider: run.provider,
      externalRunId: run.externalRunId, status: run.status, objective: run.objective,
      startedAt: run.startedAt, completedAt: run.completedAt, latencyMs: run.latencyMs,
      error: run.errorCode ? { code: run.errorCode, message: run.errorMessage } : null,
      createdAt: run.createdAt,
    };
  }
}

