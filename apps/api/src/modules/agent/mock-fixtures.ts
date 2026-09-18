import type { AnalysisPeriod, CustomerAnalysis, CustomerMetrics, Locale } from '@mlink/contracts';
import { SUGGESTION_LABELS } from '../metrics/suggestion-labels';

/**
 * Deterministic mock of the external Agent for the MSB sample portfolio.
 *
 * Five CIFs carry scenario content that mirrors what the Python Agent's Part D rule engine
 * returns for them; every other CIF only echoes the stored Part B metrics. All numbers and the
 * window wording come from the metrics of the analysed period, so the mock follows the UI filter
 * instead of restating the full-year snapshot. The application never invents a recommendation.
 */
type Scenario = (ctx: ScenarioContext) => Pick<CustomerAnalysis, 'summary' | 'signals' | 'recommendations' | 'guardrail'>;

interface ScenarioContext {
  en: boolean;
  metrics: CustomerMetrics | null;
  period: AnalysisPeriod | null;
  windowDays: number;
  score: number;
  evidence: (title: string, description: string) => CustomerAnalysis['recommendations'][number]['evidence'][number];
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const signedPct = (value: number) => `${value > 0 ? '+' : ''}${pct(value)}`;
const billions = (value: string | number) => `${(Number(value) / 1_000_000_000).toFixed(2)}`;

const SCENARIOS: Record<string, Scenario> = {
  // Nguyễn Văn S — long dormancy, term deposit closed mid-term, churn label Cao.
  '08102466': ({ en, metrics: m, windowDays, score, evidence }) => ({
    summary: {
      relationshipStatus: 'at_risk', opportunityScore: score,
      overview: en
        ? `High churn risk: no transaction for ${m?.recencyDays ?? 0} days and the term deposit was closed mid-term. Retain before selling.`
        : `Rủi ro rời bỏ CAO: ${m?.recencyDays ?? 0} ngày không phát sinh giao dịch, sổ tiết kiệm đã tất toán giữa kỳ. Ưu tiên giữ chân trước khi bán thêm.`,
    },
    signals: [
      { type: 'churn_high', title: en ? 'High churn risk' : 'Rủi ro rời bỏ cao', severity: 'high', confidence: 0.95,
        description: en ? `Churn score ${(m?.churnScore ?? 0).toFixed(1)}/100, recency ${m?.recencyDays ?? 0} days.` : `Điểm churn ${(m?.churnScore ?? 0).toFixed(1)}/100, ${m?.recencyDays ?? 0} ngày không giao dịch.` },
      { type: 'fd_liquidated', title: en ? 'Term deposit closed' : 'Sổ tiết kiệm đã tất toán', severity: 'medium', confidence: 0.9,
        description: en ? `No term deposit balance remains; the preceding ${windowDays}-day window averaged a positive balance.` : `Không còn số dư tiết kiệm; cửa sổ ${windowDays} ngày liền trước vẫn còn số dư.` },
    ],
    recommendations: [
      {
        priority: 1, type: 'retention', confidence: 0.88,
        title: en ? 'Retention call with priority-customer deposit rates' : 'Gọi giữ chân, đề xuất Tiết kiệm lãi suất cao nhất kèm ưu đãi KHƯT',
        description: en ? 'Offer the highest-rate term deposit with the online bonus for priority customers and book a branch meeting.' : 'Đề xuất Tiết kiệm lãi suất cao nhất, gửi online cộng thêm lãi suất cho KHƯT, hẹn gặp trực tiếp tại chi nhánh.',
        product: { id: 'DEP_ONLINE', name: en ? 'Online term deposit' : 'Tiền gửi có kỳ hạn trực tuyến' },
        reasons: en
          ? ['Churn score above 60', `No transaction for ${m?.recencyDays ?? 0} days`, 'Deposit closed without renewal']
          : ['Điểm churn trên 60', `${m?.recencyDays ?? 0} ngày không phát sinh giao dịch`, 'FD tất toán không tái tục'],
        evidence: [evidence('recencyDays', `recencyDays=${m?.recencyDays ?? 0}`), evidence('churnScore', `churnScore=${(m?.churnScore ?? 0).toFixed(2)}`)],
        script: en ? 'We noticed you have not used your account for a while. As a valued customer you qualify for our best deposit rate plus an online bonus — may we schedule a short meeting?' : 'Em thấy lâu rồi mình chưa giao dịch với MSB. Anh/chị đang được hưởng mức lãi suất tiết kiệm cao nhất cộng thêm ưu đãi gửi online dành cho KHƯT, em xin hẹn mình 15 phút để tư vấn nhé?',
      },
    ],
    guardrail: { sellAllowed: true, reason: null },
  }),
  // Nguyễn Văn D — loans far above the asset base.
  '08100548': ({ en, metrics: m, score, evidence }) => ({
    summary: {
      relationshipStatus: 'opportunity', opportunityScore: score,
      overview: en ? 'Leverage far above 70%: protect the loan with insurance, do not offer additional credit.' : 'Đòn bẩy vượt xa 70%: ưu tiên bảo vệ khoản vay bằng bảo hiểm, KHÔNG chào thêm tín dụng.',
    },
    signals: [
      { type: 'leverage_high', title: en ? 'High leverage' : 'Đòn bẩy cao', severity: 'high', confidence: 0.97,
        description: en ? `Loans / assets = ${(m?.leverage ?? 0).toFixed(1)}x.` : `Dư nợ vay / tài sản = ${(m?.leverage ?? 0).toFixed(1)} lần.` },
    ],
    recommendations: [
      {
        priority: 1, type: 'protection', confidence: 0.85,
        title: en ? 'Protect the mortgage with Pru – Bảo vệ tối đa' : 'Tư vấn Bảo hiểm liên kết chung Pru – Bảo vệ tối đa để bảo vệ khoản vay',
        description: en ? 'Universal-life cover sized to the outstanding mortgage; no new lending.' : 'Bảo hiểm nhân thọ liên kết chung với số tiền bảo hiểm tương ứng dư nợ thế chấp; không chào vay mới.',
        product: { id: 'BANCA_PRU_PROTECT', name: 'Pru – Bảo vệ tối đa' },
        reasons: en ? ['Leverage above 70%', 'Regular monthly repayments show capacity to pay premiums'] : ['Đòn bẩy trên 70%', 'Trả nợ đều hàng tháng, có khả năng đóng phí'],
        evidence: [evidence('leverage', `leverage=${(m?.leverage ?? 0).toFixed(4)}`)],
        script: en ? 'With a large mortgage in place, a protection plan keeps your family safe from the loan if anything happens. May I walk you through the options?' : 'Với khoản vay thế chấp hiện tại, một gói bảo vệ sẽ giúp gia đình mình không bị áp lực trả nợ nếu có rủi ro. Em xin phép trình bày phương án phù hợp nhé?',
      },
    ],
    guardrail: { sellAllowed: true, reason: null },
  }),
  // Nguyễn Văn H — CASA growing, heavy FX turnover, no bond or fund holding.
  '08101096': ({ en, metrics: m, windowDays, score, evidence }) => ({
    summary: {
      relationshipStatus: 'opportunity', opportunityScore: score,
      overview: en ? 'CASA is growing with no bond or fund holdings — an investment conversation is timely.' : 'CASA tăng, chưa có Bond/CCQ — thời điểm phù hợp để tư vấn kênh sinh lời.',
    },
    signals: [
      { type: 'casa_surge', title: en ? 'CASA growing' : 'CASA tăng', severity: 'medium', confidence: 0.9,
        description: en ? `${windowDays}-day CASA trend ${signedPct(m?.casaTrend ?? 0)}.` : `Xu hướng CASA ${windowDays} ngày ${signedPct(m?.casaTrend ?? 0)}.` },
      { type: 'fx_active', title: en ? 'Frequent FX activity' : 'Giao dịch FX thường xuyên', severity: 'medium', confidence: 0.85,
        description: en ? 'Large FX turnover over the last 12 months; high behavioural risk appetite.' : 'Doanh số ngoại tệ 12 tháng lớn; khẩu vị rủi ro thực tế cao.' },
    ],
    recommendations: [
      {
        priority: 1, type: 'investment', confidence: 0.82,
        title: en ? 'Introduce MSB certificates of deposit' : 'Giới thiệu Chứng chỉ tiền gửi MSB',
        description: en ? 'Transferable certificate of deposit, no personal income tax on returns, suits growing idle CASA.' : 'CCTG chuyển nhượng linh hoạt, không thuế TNCN trên lợi nhuận, phù hợp CASA nhàn rỗi đang tăng.',
        product: { id: 'CD_MSB', name: 'Chứng chỉ tiền gửi MSB' },
        reasons: en ? [`CASA trend ${signedPct(m?.casaTrend ?? 0)} over ${windowDays} days`, 'No bond holding'] : [`CASA ${signedPct(m?.casaTrend ?? 0)} trong ${windowDays} ngày`, 'Chưa sở hữu Bond'],
        evidence: [evidence('casaTrend', `casaTrend=${(m?.casaTrend ?? 0).toFixed(4)}`)],
        script: en ? 'Your current account balance has grown over this period. A certificate of deposit lets that money earn more while staying transferable.' : 'Số dư tài khoản của mình tăng trong kỳ này. Chứng chỉ tiền gửi MSB giúp khoản tiền đó sinh lời tốt hơn mà vẫn chuyển nhượng linh hoạt ạ.',
      },
      {
        priority: 2, type: 'investment', confidence: 0.74,
        title: en ? 'Pru – Đầu tư vững tiến (unit-linked) for a high risk appetite' : 'Bảo hiểm liên kết đơn vị Pru – Đầu tư vững tiến theo khẩu vị rủi ro cao',
        description: en ? 'Protection up to 110% of sum assured plus investment via 7 PRUlink funds.' : 'Bảo vệ tới 110% STBH kèm đầu tư qua 7 quỹ PRUlink.',
        product: { id: 'BANCA_PRU_INVEST', name: 'Pru – Đầu tư vững tiến' },
        reasons: en ? ['Declared and behavioural risk appetite: high'] : ['Khẩu vị khai báo và thực tế: Rủi ro cao'],
        evidence: [evidence('ras', `ras=${(m?.ras ?? 0).toFixed(2)}`)],
        script: en ? 'If you are comfortable with market risk, a unit-linked plan combines protection with fund investment.' : 'Nếu mình chấp nhận rủi ro thị trường, gói liên kết đơn vị vừa bảo vệ vừa đầu tư qua các quỹ PRUlink ạ.',
      },
    ],
    guardrail: { sellAllowed: true, reason: null },
  }),
  // Nguyễn Văn O — open complaint about debt collection: care first, no selling, regardless of the period.
  '08101918': ({ en }) => ({
    summary: {
      relationshipStatus: 'customer_care_first', opportunityScore: 0,
      overview: en ? 'Resolve the open complaint about debt-collection calls before any product conversation.' : 'Xử lý khiếu nại đang mở về việc nhắc nợ trước khi trao đổi bất kỳ sản phẩm nào.',
    },
    signals: [
      { type: 'open_complaint', title: en ? 'Open customer complaint' : 'Khiếu nại đang mở', severity: 'high', confidence: 0.99,
        description: en ? 'Open negative interactions about repeated collection calls remain unresolved.' : 'Các tương tác tiêu cực đang mở về việc bị gọi thu nợ nhiều lần chưa được xử lý.' },
    ],
    recommendations: [],
    guardrail: { sellAllowed: false, reason: en ? 'Open complaint and repeated negative customer contacts' : 'Khiếu nại đang mở và nhiều tương tác tiêu cực liên tiếp' },
  }),
  // Nguyễn Văn U — largest total asset value of the portfolio, FX is the top-ranked offer.
  '08102740': ({ en, metrics: m, score, evidence }) => ({
    summary: {
      relationshipStatus: 'opportunity', opportunityScore: score,
      overview: en ? 'Highest-value customer of the portfolio (bond, funds, pledged-deposit loan). Deepen the investment relationship.' : 'Khách hàng giá trị cao nhất danh mục (Bond, CCQ, vay ứng vốn cầm cố sổ). Khai thác sâu quan hệ đầu tư.',
    },
    signals: [
      { type: 'top_value', title: en ? 'Top value customer' : 'Giá trị cao nhất danh mục', severity: 'medium', confidence: 0.9,
        description: en ? `Value Score ${(m?.valueScore ?? 0).toFixed(0)}/100, total asset value ${billions(m?.tav ?? 0)} bn VND.` : `Value Score ${(m?.valueScore ?? 0).toFixed(0)}/100, tổng tài sản ${billions(m?.tav ?? 0)} tỷ VNĐ.` },
    ],
    recommendations: [
      {
        priority: 1, type: 'cross_sell', confidence: 0.78,
        title: en ? 'Offer the FX / international transfer package (SWIFT)' : 'Giới thiệu gói ưu đãi tỷ giá / chuyển tiền quốc tế SWIFT',
        description: en ? 'FX is the top-ranked Next Best Offer for this customer.' : 'FX là Next Best Offer xếp hạng 1 của khách hàng.',
        product: { id: 'FX_SWIFT_PACKAGE', name: en ? 'FX & SWIFT transfer package' : 'Gói FX & chuyển tiền quốc tế SWIFT' },
        reasons: en ? ['Next Best Offer rank 1: FX', 'High behavioural risk appetite'] : ['Next Best Offer hạng 1: FX', 'Khẩu vị rủi ro thực tế cao'],
        evidence: [evidence('valueScore', `valueScore=${(m?.valueScore ?? 0).toFixed(1)}`)],
        script: en ? 'As one of our most valued investors, you can access preferential FX rates and SWIFT transfers — shall we review your international needs?' : 'Là một trong những khách hàng đầu tư giá trị nhất, anh/chị được hưởng tỷ giá ưu đãi và kênh SWIFT — mình cùng xem nhu cầu ngoại tệ sắp tới nhé?',
      },
    ],
    guardrail: { sellAllowed: true, reason: null },
  }),
};

export function buildMockAnalysis(
  customerId: string,
  locale: Locale,
  runId: string,
  metrics: CustomerMetrics | null = null,
  period: AnalysisPeriod | null = null,
): CustomerAnalysis {
  const en = locale === 'en';
  const windowDays = period?.windowDays ?? 90;
  const ctx: ScenarioContext = {
    en, metrics, period, windowDays,
    score: metrics ? Math.round(metrics.priorityScore * 10) / 10 : 0,
    evidence: (title, description) => ({
      type: 'metric', title, description: period ? `${description} (${period.from} → ${period.to})` : description,
      source: 'customer_metrics',
      sourceReference: metrics ? `customer_metrics:${metrics.customerId}:${metrics.asOfDate}` : undefined,
    }),
  };
  const scenario = SCENARIOS[customerId];
  if (scenario) return { runId, customerId, period, ...scenario(ctx) };

  const suggestion = metrics ? SUGGESTION_LABELS[metrics.suggestionCode][en ? 'en' : 'vi'] : null;
  return {
    runId, customerId, period,
    summary: {
      relationshipStatus: metrics?.churnLabel === 'Cao' ? 'at_risk' : 'healthy',
      opportunityScore: ctx.score,
      overview: suggestion ?? (en ? 'Mock provider: run the M-Link Agent for framework-based recommendations.' : 'Mock provider: chạy M-Link Agent để có khuyến nghị theo khung MSB.'),
    },
    signals: metrics && metrics.churnLabel !== 'Thấp'
      ? [{ type: 'churn_watch', title: en ? 'Churn watch' : 'Theo dõi rủi ro rời bỏ', severity: metrics.churnLabel === 'Cao' ? 'high' : 'medium', confidence: 0.8, description: en ? `Churn score ${metrics.churnScore.toFixed(1)}/100 over a ${windowDays}-day window.` : `Điểm churn ${metrics.churnScore.toFixed(1)}/100 trên cửa sổ ${windowDays} ngày.` }]
      : [],
    recommendations: [],
    guardrail: { sellAllowed: true, reason: null },
  };
}
