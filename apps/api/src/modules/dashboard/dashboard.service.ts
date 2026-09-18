import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { rbQueueItemSchema, type RbQueueItem, type SuggestionCode } from '@mlink/contracts';
import { Repository } from 'typeorm';
import { AgentRun, Customer, CustomerInteraction } from '../../database/entities';
import { MetricsService } from '../metrics/metrics.service';
import { SUGGESTION_LABELS } from '../metrics/suggestion-labels';
import { RmsService } from '../rms/rms.service';

/** Portfolio thresholds on the Part B metrics. Priority Score in the sample spans 19.6–53.5. */
export const DASHBOARD_THRESHOLDS = { highPriority: 40 } as const;

const round1 = (value: number) => Math.round(value * 10) / 10;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectRepository(CustomerInteraction) private readonly interactions: Repository<CustomerInteraction>,
    private readonly rms: RmsService,
    private readonly metrics: MetricsService,
  ) {}

  private async latestRuns(rmId: string) {
    const rows = (await this.runs.query(
      `SELECT DISTINCT ON (ar.customer_id) ar.customer_id, ar.response_payload
       FROM agent_runs ar WHERE ar.rm_id = $1 AND ar.status = 'COMPLETED'
       ORDER BY ar.customer_id, ar.created_at DESC`,
      [rmId],
    )) as Array<{ customer_id: string; response_payload: Record<string, any> | null }>;
    return new Map(rows.map((row) => [row.customer_id, row.response_payload]));
  }

  private async openComplaints(rmId: string) {
    const rows = await this.interactions
      .createQueryBuilder('i')
      .innerJoin('i.customer', 'c')
      .select('DISTINCT i.customer_id', 'customerId')
      .where('c.rm_id = :rmId', { rmId })
      .andWhere("i.status = 'OPEN' AND i.sentiment = 'NEGATIVE'")
      .getRawMany<{ customerId: string }>();
    return new Set(rows.map((row) => row.customerId));
  }

  /** RB queue: every customer of the RM ordered by Priority Score, merged with the latest stored analysis. */
  async queue(rmId: string): Promise<RbQueueItem[]> {
    await this.rms.assertExists(rmId);
    const [rows, runs, complaints] = await Promise.all([
      this.metrics.latestForRm(rmId), this.latestRuns(rmId), this.openComplaints(rmId),
    ]);
    return rows.map(({ metric, customer }) => {
      const analysis = runs.get(customer.id);
      const code = metric.suggestionCode as SuggestionCode;
      const suggestion = SUGGESTION_LABELS[code]?.vi ?? code;
      const sellAllowed = analysis ? analysis.guardrail?.sellAllowed !== false : !complaints.has(customer.id);
      return rbQueueItemSchema.parse({
        customerId: customer.id, customerName: customer.fullName, tier: customer.tier, segment: customer.segment,
        priorityScore: round1(Number(metric.priorityScore)), valueScore: round1(Number(metric.valueScore)),
        churnScore: round1(Number(metric.churnScore)), churnLabel: metric.churnLabel, suggestionCode: code,
        reason: analysis?.signals?.[0]?.title ?? suggestion,
        recommendedAction: analysis?.recommendations?.[0]?.title ?? analysis?.guardrail?.reason ?? suggestion,
        sellAllowed,
      });
    });
  }

  async get(rmId: string) {
    const [customerCount, queue] = await Promise.all([this.customers.countBy({ rmId }), this.queue(rmId)]);
    return {
      portfolio: {
        customerCount,
        needAttention: queue.filter((item) => item.churnLabel !== 'Thấp').length,
        highPriority: queue.filter((item) => item.priorityScore >= DASHBOARD_THRESHOLDS.highPriority).length,
        customerCare: queue.filter((item) => !item.sellAllowed).length,
      },
      priorityCustomers: queue,
    };
  }
}
