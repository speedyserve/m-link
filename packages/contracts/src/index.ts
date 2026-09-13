import { z } from 'zod';

export const localeSchema = z.enum(['vi', 'en']);
export type Locale = z.infer<typeof localeSchema>;

export const analyzeCustomerInputSchema = z.object({
  customerId: z.string().min(1),
  objective: z.string().min(1).default('prepare_rm_brief'),
  requestedBy: z.string().min(1),
  locale: localeSchema.default('vi'),
});
export type AnalyzeCustomerInput = z.infer<typeof analyzeCustomerInputSchema>;

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

