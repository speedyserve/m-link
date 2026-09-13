import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentRun, Customer } from '../../database/entities';
import { RmsService } from '../rms/rms.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    private readonly rms: RmsService,
  ) {}

  async get(rmId: string) {
    await this.rms.assertExists(rmId);
    const [customerCount, needAttention, rows] = await Promise.all([
      this.customers.countBy({ rmId }),
      this.customers.createQueryBuilder('c').where('c.rm_id = :rmId', { rmId }).andWhere('c.relationship_status != :healthy', { healthy: 'HEALTHY' }).getCount(),
      this.runs.query(
        `SELECT DISTINCT ON (ar.customer_id) ar.*, c.full_name, c.segment
         FROM agent_runs ar JOIN customers c ON c.id = ar.customer_id
         WHERE ar.rm_id = $1 AND ar.status = 'COMPLETED'
         ORDER BY ar.customer_id, ar.created_at DESC`, [rmId],
      ) as Promise<Array<Record<string, unknown>>>,
    ]);
    const latest = rows.map((row) => ({ row, analysis: row.response_payload as Record<string, any> }));
    const highPriority = latest.filter(({ analysis }) => Number(analysis?.summary?.opportunityScore ?? 0) >= 80).length;
    const customerCare = latest.filter(({ analysis }) => analysis?.guardrail?.sellAllowed === false).length;
    const priorityCustomers = latest
      .filter(({ analysis }) => Number(analysis?.summary?.opportunityScore ?? 0) >= 60 || analysis?.guardrail?.sellAllowed === false)
      .map(({ row, analysis }) => ({
        customerId: row.customer_id, customerName: row.full_name, segment: row.segment,
        reason: analysis.signals?.[0]?.title ?? analysis.guardrail?.reason ?? '',
        priorityScore: analysis.summary?.opportunityScore ?? 0,
        recommendedAction: analysis.recommendations?.[0]?.title ?? analysis.summary?.overview ?? '',
        sellAllowed: analysis.guardrail?.sellAllowed ?? true,
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore);
    return { portfolio: { customerCount, needAttention, highPriority, customerCare }, priorityCustomers };
  }
}

