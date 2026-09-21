import { z } from 'zod';

export const localeSchema = z.enum(['vi', 'en']);
export type Locale = z.infer<typeof localeSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const analyzeCustomerInputSchema = z
  .object({
    customerId: z.string().min(1),
    objective: z.string().min(1).default('prepare_rm_brief'),
    requestedBy: z.string().min(1),
    locale: localeSchema.default('vi'),
    // The analysed window. Omitted means "the stored 90-day snapshot".
    periodFrom: isoDate.optional(),
    periodTo: isoDate.optional(),
  })
  .refine((value) => !value.periodFrom || !value.periodTo || value.periodFrom <= value.periodTo, {
    message: 'periodFrom must be on or before periodTo',
  });
export type AnalyzeCustomerInput = z.infer<typeof analyzeCustomerInputSchema>;

/** The window an analysis was produced for; echoed by the Agent and stored with the run. */
export const analysisPeriodSchema = z.object({
  from: isoDate,
  to: isoDate,
  windowDays: z.number().int().positive(),
});
export type AnalysisPeriod = z.infer<typeof analysisPeriodSchema>;

export const signalSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
  description: z.string().min(1),
});

export const evidenceSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  source: z.string().optional(),
  sourceReference: z.string().optional(),
});

export const recommendationSchema = z.object({
  priority: z.number().int().positive(),
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  confidence: z.number().min(0).max(1),
  product: z
    .object({ id: z.string().min(1), name: z.string().min(1) })
    .nullable()
    .optional(),
  reasons: z.array(z.string()).default([]),
  evidence: z.array(evidenceSchema).default([]),
  script: z.string().optional().default(''),
});

export const customerAnalysisSchema = z.object({
  runId: z.string().min(1),
  customerId: z.string().min(1),
  summary: z.object({
    relationshipStatus: z.string().min(1),
    opportunityScore: z.number().min(0).max(100),
    overview: z.string().min(1),
  }),
  signals: z.array(signalSchema).default([]),
  recommendations: z.array(recommendationSchema).default([]),
  guardrail: z.object({
    sellAllowed: z.boolean(),
    reason: z.string().nullable(),
  }),
  period: analysisPeriodSchema.nullish(),
});
export type CustomerAnalysis = z.infer<typeof customerAnalysisSchema>;

export const feedbackSchema = z.object({
  useful: z.boolean().nullable().optional(),
  status: z.enum(['CONTACTED', 'INTERESTED', 'REJECTED', 'NOT_RELEVANT']),
  comment: z.string().max(1000).nullable().optional(),
});
export type RecommendationFeedbackInput = z.infer<typeof feedbackSchema>;

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}


// ---------------------------------------------------------------------------
// MSB customer evaluation framework (Khung công thức đánh giá KH MSB, 18/09/2026)
// ---------------------------------------------------------------------------

export const productCodeSchema = z.enum([
  'ACCOUNT', 'CASA', 'FD', 'LOAN_ADVANCE', 'BOND', 'CREDIT_CARD', 'LOAN_OVERDRAFT',
  'LOAN_UNSECURED', 'LOAN_MORTGAGE', 'FX', 'BANCA_LIFE', 'BANCA_NONLIFE', 'FUND_CERT',
]);
export type ProductCode = z.infer<typeof productCodeSchema>;
export const PRODUCT_CODES = productCodeSchema.options;

export const nboFamilySchema = z.enum(['CREDIT_CARD', 'BANCA', 'FX', 'BOND', 'LOAN']);
export type NboFamily = z.infer<typeof nboFamilySchema>;

export const tierSchema = z.enum(['Aff', 'MassAff', 'Mass']);
export type Tier = z.infer<typeof tierSchema>;
export const churnLabelSchema = z.enum(['Cao', 'Trung bình', 'Thấp']);
export type ChurnLabel = z.infer<typeof churnLabelSchema>;
export const behaviourLabelSchema = z.enum(['Tích cực', 'Tiêu cực', 'Trung tính']);
export type BehaviourLabel = z.infer<typeof behaviourLabelSchema>;
export const riskAppetiteSchema = z.enum(['An toàn', 'Cân bằng', 'Rủi ro cao']);
export type RiskAppetite = z.infer<typeof riskAppetiteSchema>;
export const phsLabelSchema = z.enum(['Chưa khai thác', 'Trung bình', 'Khai thác tốt']);
export type PhsLabel = z.infer<typeof phsLabelSchema>;
export const suggestionCodeSchema = z.enum([
  'LEVERAGE_HIGH', 'CUR_HIGH', 'CHURN_HIGH', 'RISK_MISMATCH', 'UNDER_PENETRATED',
  'CASA_SURGE_NO_BOND', 'DORMANT', 'MAINTAIN',
]);
export type SuggestionCode = z.infer<typeof suggestionCodeSchema>;

const moneyString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const customerMetricsSchema = z.object({
  customerId: z.string().min(1),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recencyDays: z.number().int(),
  freq90: z.number().int(),
  freqPrev90: z.number().int(),
  casaAvg90: moneyString,
  casaAvgPrev90: moneyString,
  casaTrend: z.number(),
  casaCv: z.number(),
  ccAvgBalance90: moneyString,
  creditLimit: moneyString,
  cur: z.number(),
  loanTotal: moneyString,
  fdCurrent: moneyString,
  fdAvgPrev90: moneyString,
  fdLiquidated: z.boolean(),
  bondCurrent: moneyString,
  fundCertCurrent: moneyString,
  tav: moneyString,
  leverage: z.number(),
  phs: z.number(),
  holdingCount: z.number().int(),
  fxVolume12m: moneyString,
  rasRaw: z.number(),
  ras: z.number(),
  valueScore: z.number(),
  churnScore: z.number(),
  churnLabel: churnLabelSchema,
  crossSellScore: z.number(),
  priorityScore: z.number(),
  behaviourLabel: behaviourLabelSchema,
  riskAppetiteLabel: riskAppetiteSchema,
  tierLabel: tierSchema,
  phsLabel: phsLabelSchema,
  suggestionCode: suggestionCodeSchema,
  isNewCif: z.boolean(),
  computedAt: z.string(),
});
export type CustomerMetrics = z.infer<typeof customerMetricsSchema>;

export const productHoldingSchema = z.object({ productCode: productCodeSchema, held: z.boolean() });
export type ProductHolding = z.infer<typeof productHoldingSchema>;

export const nextBestOfferSchema = z.object({
  productCode: nboFamilySchema,
  rank: z.number().int().min(1).max(5).nullable(),
});
export type NextBestOffer = z.infer<typeof nextBestOfferSchema>;

export const rbQueueItemSchema = z.object({
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  tier: tierSchema,
  segment: z.string(),
  priorityScore: z.number(),
  valueScore: z.number(),
  churnScore: z.number(),
  churnLabel: churnLabelSchema,
  suggestionCode: suggestionCodeSchema,
  reason: z.string(),
  recommendedAction: z.string(),
  sellAllowed: z.boolean(),
});
export type RbQueueItem = z.infer<typeof rbQueueItemSchema>;

// ---------------------------------------------------------------------------
// Period filtering (per-customer date range on the daily journal)
// ---------------------------------------------------------------------------

export const dateRangeQuerySchema = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((value) => !value.from || !value.to || value.from <= value.to, { message: 'from must be on or before to' });
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const balanceStatsSchema = z.object({
  start: z.number(), end: z.number(), avg: z.number(), min: z.number(), max: z.number(), change: z.number(),
});
export type BalanceStats = z.infer<typeof balanceStatsSchema>;

export const BALANCE_KEYS = [
  'accountBalance', 'casaBalance', 'fdBalance', 'bondBalance', 'fundCertValue', 'loanAdvance',
  'loanOverdraft', 'loanUnsecured', 'loanMortgage', 'loanTotal', 'creditCardBalance',
] as const;
export type BalanceKey = (typeof BALANCE_KEYS)[number];

export const flowCategorySchema = z.enum([
  'CC_SPEND', 'FX', 'BANCA_LIFE', 'BANCA_NONLIFE', 'MOBILE_TOPUP', 'BILL_PAYMENT', 'SECURITIES', 'AIRLINE',
  'BUS_TICKET', 'LOTTERY', 'LOAN_REPAYMENT', 'GENETICA', 'ADVISORY_FEE', 'WESTERN_UNION', 'PREMIUM_ACCOUNT_FEE',
]);
export type FlowCategory = z.infer<typeof flowCategorySchema>;
export const FLOW_CATEGORIES = flowCategorySchema.options;

export const flowStatsSchema = z.object({
  total: z.number(), days: z.number().int(), buy: z.number().optional(), sell: z.number().optional(),
});

export const periodSummarySchema = z.object({
  customerId: z.string().min(1),
  range: z.object({ from: isoDate, to: isoDate, days: z.number().int() }),
  dataRange: z.object({ first: isoDate, last: isoDate }),
  totalAssets: z.object({ start: z.number(), end: z.number(), avg: z.number(), change: z.number() }),
  balances: z.object(
    Object.fromEntries(BALANCE_KEYS.map((key) => [key, balanceStatsSchema])) as Record<BalanceKey, typeof balanceStatsSchema>,
  ),
  flows: z.object(
    Object.fromEntries(FLOW_CATEGORIES.map((key) => [key, flowStatsSchema])) as Record<FlowCategory, typeof flowStatsSchema>,
  ),
  activity: z.object({
    days: z.number().int(), activeDays: z.number().int(), txnCount: z.number().int(),
    firstActiveDate: isoDate.nullable(), lastActiveDate: isoDate.nullable(),
  }),
  byMonth: z.array(z.object({
    monthKey: z.string(), days: z.number().int(), casaAvg: z.number(), fdAvg: z.number(),
    txnCount: z.number().int(), ccSpend: z.number(), fxVolume: z.number(),
  })),
});
export type PeriodSummary = z.infer<typeof periodSummarySchema>;

export const metricsAsOfSchema = customerMetricsSchema.extend({
  stored: z.boolean(),
  historyDays: z.number().int(),
  insufficientHistory: z.boolean(),
  /** Length of the aggregation window; equals the filtered period when one was requested. */
  windowDays: z.number().int().positive(),
  /** Days actually available in the preceding window (shorter than `windowDays` near the start of the journal). */
  prevWindowDays: z.number().int(),
});
export type CustomerMetricsAsOf = z.infer<typeof metricsAsOfSchema>;
