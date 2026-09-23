import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { rbQueueItemSchema, type RbActionGroup, type RbQueueItem, type SuggestionCode } from '@mlink/contracts';
import { Repository } from 'typeorm';
import { AgentRun, BankTransaction, Customer, CustomerInteraction } from '../../database/entities';
import { MetricsService } from '../metrics/metrics.service';
import { SUGGESTION_LABELS } from '../metrics/suggestion-labels';
import { RmsService } from '../rms/rms.service';
import { AssistantAgentClient } from '../agent/assistant-agent.client';

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Every customer is either RETENTION or OPPORTUNITY — never both, so the two counts
 * always add up to the RM's full customer count. "Chăm sóc" (an open complaint blocking
 * sales) is a separate, independent flag on `sellAllowed` — it can land on a customer
 * from either group, so it is never part of this 2-way split.
 */
export function actionGroupFor(item: { churnLabel: string }): RbActionGroup {
  return item.churnLabel !== 'Thấp' ? 'RETENTION' : 'OPPORTUNITY';
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectRepository(CustomerInteraction) private readonly interactions: Repository<CustomerInteraction>,
    @InjectRepository(BankTransaction) private readonly transactions: Repository<BankTransaction>,
    private readonly rms: RmsService,
    private readonly metrics: MetricsService,
    private readonly assistantAgent: AssistantAgentClient,
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
      const queueItem = {
        customerId: customer.id, customerName: customer.fullName, tier: customer.tier, segment: customer.segment,
        priorityScore: round1(Number(metric.priorityScore)), valueScore: round1(Number(metric.valueScore)), tav: Number(metric.tav),
        churnScore: round1(Number(metric.churnScore)), churnLabel: metric.churnLabel, suggestionCode: code,
        reason: analysis?.signals?.[0]?.title ?? suggestion,
        recommendedAction: analysis?.recommendations?.[0]?.title ?? analysis?.guardrail?.reason ?? suggestion,
        sellAllowed,
      };
      return rbQueueItemSchema.parse({ ...queueItem, actionGroup: actionGroupFor(queueItem) });
    });
  }

  async get(rmId: string) {
    const [customerCount, queue] = await Promise.all([this.customers.countBy({ rmId }), this.queue(rmId)]);
    return {
      portfolio: {
        customerCount,
        needAttention: queue.filter((item) => item.actionGroup === 'RETENTION').length,
        highPriority: queue.filter((item) => item.actionGroup === 'OPPORTUNITY').length,
        customerCare: queue.filter((item) => !item.sellAllowed).length,
      },
      priorityCustomers: queue,
    };
  }

  private normalizeVi(value: string): string {
    return (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  }

  private formatDay(value: string): string {
    return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /**
   * Fuzzy name match for when the RM mistypes or half-remembers a customer's name (e.g.
   * "Trần Bảo Châu" instead of "Trịnh Bảo Châu"). Vietnamese full names are "Họ [Đệm] Tên"
   * (surname, middle, given name) — the surname alone is nearly meaningless for disambiguation
   * (shared by many customers), so the given name (last word) must match, and it's weighted
   * heaviest; the surname only breaks ties between otherwise-equal given-name matches.
   */
  private fuzzyNameMatch(needle: string, queue: RbQueueItem[]): RbQueueItem | undefined {
    const questionWords = new Set(needle.split(/\s+/).filter(Boolean));
    let best: { item: RbQueueItem; score: number } | null = null;
    for (const item of queue) {
      const nameWords = this.normalizeVi(item.customerName).split(/\s+/).filter(Boolean);
      if (nameWords.length < 2 || !questionWords.has(nameWords[nameWords.length - 1])) continue;
      const weights = nameWords.map((_, i) => (i === nameWords.length - 1 ? 2 : i === 0 ? 0.5 : 1));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const matchedWeight = nameWords.reduce((sum, w, i) => sum + (questionWords.has(w) ? weights[i] : 0), 0);
      const score = matchedWeight / totalWeight;
      if (!best || score > best.score) best = { item, score };
    }
    return best?.item;
  }

  /**
   * Builds one comprehensive dump of everything known about a matched customer — profile,
   * priority/churn, recent transactions, stored recommendations, latest analysis overview.
   * No keyword-based intent routing: the LLM reads the whole thing and picks out whatever
   * the RM actually asked (birthday, transactions, next action, summary, or anything else),
   * so the RM can ask in their own words instead of hitting a fixed menu of questions.
   */
  private async customerFacts(rmId: string, found: RbQueueItem): Promise<string> {
    const [customerRow, analysis, recentTx] = await Promise.all([
      this.customers.findOneBy({ id: found.customerId }),
      this.latestRuns(rmId).then((runs) => runs.get(found.customerId)),
      this.transactions.createQueryBuilder('t')
        .where('t.customer_id = :id', { id: found.customerId })
        .orderBy('t.transaction_at', 'DESC').limit(5).getMany(),
    ]);

    const lines = [
      `Tên: ${found.customerName}`,
      customerRow && `CIF: ${customerRow.customerCode}`,
      customerRow && `Chi nhánh: ${customerRow.branch ?? '—'}`,
      customerRow && `Giới tính: ${customerRow.gender}`,
      customerRow && `Ngày sinh: ${this.formatDay(customerRow.dateOfBirth)}`,
      customerRow && `Khách hàng từ: ${this.formatDay(customerRow.customerSince)}`,
      `Phân hạng: ${found.tier}`,
      `Điểm ưu tiên liên hệ: ${found.priorityScore.toFixed(1)}/100`,
      `Rủi ro rời bỏ: ${found.churnLabel}`,
      `Tổng tài sản: ${found.tav.toLocaleString('vi-VN')} VND`,
      `Đang cho phép bán thêm sản phẩm: ${found.sellAllowed ? 'Có' : 'Không (đang tạm dừng vì khiếu nại/cần chăm sóc)'}`,
      `Hành động khuyến nghị hiện tại: ${found.recommendedAction}`,
      analysis?.summary?.overview && `Tổng kết phân tích M-Link gần nhất: ${analysis.summary.overview}`,
      analysis?.recommendations?.length &&
        `Danh sách đề xuất đã lưu: ${(analysis.recommendations as any[]).slice(0, 5).map((r, i) => `(${i + 1}) ${r.title}`).join('; ')}`,
      !analysis && 'Chưa có phân tích M-Link nào được lưu cho khách này.',
      recentTx.length
        ? `5 giao dịch gần nhất: ${recentTx.map((t) => `${this.formatDay(t.transactionAt.toISOString())} ${t.description} ${Number(t.amount).toLocaleString('vi-VN')} ${t.currency}`).join('; ')}`
        : 'Chưa có giao dịch nào được ghi nhận.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  /** Portfolio-wide facts, used when the RM's question doesn't name a specific customer. */
  private async portfolioFacts(rmId: string, queue: RbQueueItem[]): Promise<string> {
    const [rm, customerCount] = await Promise.all([this.rms.findById(rmId), this.customers.countBy({ rmId })]);
    const retention = queue.filter((c) => c.actionGroup === 'RETENTION');
    const opportunity = queue.filter((c) => c.actionGroup === 'OPPORTUNITY');
    const care = queue.filter((c) => !c.sellAllowed);
    const top5 = queue.slice(0, 5)
      .map((c) => `${c.customerName} (điểm ${c.priorityScore.toFixed(1)}, rủi ro rời bỏ ${c.churnLabel})`).join('; ');
    const retentionNames = retention.map((c) => `${c.customerName} (điểm ${c.priorityScore.toFixed(1)})`).join('; ');
    const careNames = care.map((c) => `${c.customerName} (${c.reason})`).join('; ');
    return [
      rm && `RM: ${rm.name}, chi nhánh ${rm.branch}, email ${rm.email}`,
      `Tổng số khách hàng đang quản lý: ${customerCount}`,
      `Số khách rủi ro rời bỏ Cao / cần chú ý, cần giữ chân: ${retention.length}`,
      `Danh sách khách cần chú ý / cần giữ chân: ${retentionNames || 'không có'}`,
      `Số khách rủi ro rời bỏ Thấp (nhóm có thể tư vấn thêm sản phẩm): ${opportunity.length}`,
      `Số khách đang tạm dừng bán / không nên bán thêm sản phẩm vì khiếu nại: ${care.length}`,
      `Danh sách khách đang tạm dừng bán / không nên bán thêm: ${careNames || 'không có'}`,
      `5 khách ưu tiên liên hệ cao nhất: ${top5 || 'không có'}`,
      'Không có tên/CIF khách hàng cụ thể nào được nhận ra trong câu hỏi này.',
    ].filter(Boolean).join('\n');
  }

  /**
   * Free-text Q&A for the floating assistant. If the RM's message names a customer (by name,
   * CIF, or phone number), every fact known about that customer is gathered and handed to the
   * LLM, which answers whatever was actually asked — birthday, transactions, next action,
   * summary, product suggestion, or anything else — instead of matching against a fixed list
   * of question types. With no customer named, portfolio-wide facts (counts, top priorities,
   * RM profile) are used instead.
   */
  async askAssistant(rmId: string, message: string) {
    await this.rms.assertExists(rmId);
    const queue = await this.queue(rmId);
    const needle = this.normalizeVi(message);
    const digitMatch = message.match(/\d{6,}/)?.[0];

    let found = digitMatch
      ? queue.find((c) => c.customerId.includes(digitMatch))
      : queue.find((c) => needle.includes(this.normalizeVi(c.customerName))) ?? this.fuzzyNameMatch(needle, queue);

    // A 6+ digit run that isn't a known CIF might be a phone number instead.
    if (!found && digitMatch) {
      const byPhone = await this.customers.createQueryBuilder('c')
        .where('c.rm_id = :rmId', { rmId })
        .andWhere("regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE :digits", { digits: `%${digitMatch}%` })
        .getOne();
      if (byPhone) found = queue.find((c) => c.customerId === byPhone.id);
    }

    if (found) {
      const facts = await this.customerFacts(rmId, found);
      const answer = await this.assistantAgent.phrase(message, facts);
      return { customerId: found.customerId, customerName: found.customerName, answer };
    }

    const facts = await this.portfolioFacts(rmId, queue);
    const answer = await this.assistantAgent.phrase(message, facts);
    return { customerId: null, answer };
  }
}
