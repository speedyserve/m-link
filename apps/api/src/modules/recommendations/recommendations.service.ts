import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { feedbackSchema } from '@mlink/contracts';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { DomainException, parseWith } from '../../common/http';
import { AgentRun, Recommendation, RecommendationFeedback } from '../../database/entities';

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(Recommendation) private readonly recommendations: Repository<Recommendation>,
    @InjectRepository(RecommendationFeedback) private readonly feedback: Repository<RecommendationFeedback>,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
  ) {}

  async saveFeedback(recommendationId: string, rmId: string, body: unknown) {
    const recommendation = await this.recommendations.findOneBy({ id: recommendationId });
    if (!recommendation) throw new DomainException(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation was not found.');
    const run = await this.runs.findOneBy({ id: recommendation.agentRunId, rmId });
    if (!run) throw new DomainException(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation was not found.');
    const input = parseWith(feedbackSchema, body);
    const existing = await this.feedback.findOneBy({ recommendationId, rmId });
    return this.feedback.save({
      id: existing?.id ?? `FDB-${randomUUID()}`, recommendationId, rmId,
      useful: input.useful ?? null, status: input.status, comment: input.comment ?? null,
      ...(existing ? { createdAt: existing.createdAt } : {}),
    });
  }
}

