import { z } from 'zod';
import { idSchema, isoDateTimeSchema, toneSchema } from './common';
import { specialistSchema } from './desk';

export const COMPLIANCE_CHECK_IDS = [
  'no-recommendation',
  'no-price-target',
  'no-forecast',
  'no-suitability',
  'no-performance-promise',
  'no-urgency',
  'cited',
  'no-foreign-data',
] as const;
export const complianceCheckIdSchema = z.enum(COMPLIANCE_CHECK_IDS);
export type ComplianceCheckId = z.infer<typeof complianceCheckIdSchema>;

export const complianceCheckResultSchema = z.object({
  id: complianceCheckIdSchema,
  label: z.string(),
  passed: z.boolean(),
  detail: z.string().optional(),
});
export type ComplianceCheckResult = z.infer<typeof complianceCheckResultSchema>;

export const SOURCE_KINDS = [
  'guide',
  'article',
  'service',
  'rule',
  'trade',
  'calendar',
  'news',
  'note',
  'statement',
  'account',
] as const;
export const sourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof sourceKindSchema>;

/** A retrieved passage the answer is allowed to cite, by its 1-based index. */
export const citationSchema = z.object({
  index: z.number().int().min(1),
  sourceId: idSchema,
  kind: sourceKindSchema,
  title: z.string().max(200),
  excerpt: z.string().max(1200),
  url: z.string().max(2048).optional(),
  owner: z.string().max(120),
  updatedAt: isoDateTimeSchema,
  /** Relevance score from the research agent, 0..1. */
  score: z.number().min(0).max(1),
});
export type Citation = z.infer<typeof citationSchema>;

/** Structured blocks an answer can carry in addition to its text. */
export const answerBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('checklist'),
    title: z.string(),
    items: z.array(
      z.object({
        label: z.string(),
        meta: z.string().optional(),
        state: z.enum(['ok', 'attention', 'breach', 'todo']),
      }),
    ),
  }),
  z.object({
    type: z.literal('table'),
    title: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    /** Index of a column whose cells are rendered in monospace (figures, times, ids). */
    monoColumns: z.array(z.number().int()).optional(),
  }),
  z.object({
    type: z.literal('metrics'),
    items: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        hint: z.string().optional(),
        tone: toneSchema,
      }),
    ),
  }),
  z.object({
    type: z.literal('approval'),
    approvalId: idSchema,
    title: z.string(),
    recipients: z.array(z.string()),
  }),
  z.object({
    type: z.literal('links'),
    title: z.string(),
    items: z.array(z.object({ label: z.string(), meta: z.string(), citation: z.number().int() })),
  }),
]);
export type AnswerBlock = z.infer<typeof answerBlockSchema>;

export const answerStatusSchema = z.enum(['answered', 'refused', 'not-covered', 'withheld']);
export type AnswerStatus = z.infer<typeof answerStatusSchema>;

export const draftAttemptSchema = z.object({
  attempt: z.number().int().min(1),
  passed: z.boolean(),
  failedChecks: z.array(complianceCheckIdSchema),
  /** A blocked draft is never shown or fed back into the conversation; only a summary is kept. */
  summary: z.string(),
});
export type DraftAttempt = z.infer<typeof draftAttemptSchema>;

export const twinAnswerSchema = z.object({
  /** Human-quotable audit id, e.g. DT-K7P2QA. */
  id: z.string().regex(/^DT-[A-Z0-9]{6}$/),
  question: z.string(),
  status: answerStatusSchema,
  specialist: specialistSchema,
  routeReason: z.string(),
  text: z.string(),
  blocks: z.array(answerBlockSchema),
  citations: z.array(citationSchema),
  checks: z.array(complianceCheckResultSchema),
  drafts: z.array(draftAttemptSchema),
  library: z.object({ matched: z.number().int(), size: z.number().int(), version: z.string() }),
  models: z.object({ router: z.string(), specialist: z.string() }),
  latencyMs: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  /** Shortcut that produced this answer, if any, e.g. "/prep". */
  shortcut: z.string().optional(),
});
export type TwinAnswer = z.infer<typeof twinAnswerSchema>;

export const askRequestSchema = z.object({
  conversationId: idSchema,
  question: z.string().min(1).max(2000),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

/**
 * Events streamed while the agent team works on a question. The backend will send these as
 * server-sent events; the mock engine emits the same sequence so the UI does not change.
 */
export const twinStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('routed'), specialist: specialistSchema, reason: z.string() }),
  z.object({
    type: z.literal('retrieved'),
    citations: z.array(citationSchema),
    matched: z.number().int(),
    size: z.number().int(),
  }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({
    type: z.literal('checked'),
    checks: z.array(complianceCheckResultSchema),
    attempt: z.number().int(),
  }),
  z.object({ type: z.literal('done'), answer: twinAnswerSchema }),
  z.object({ type: z.literal('error'), message: z.string(), retryable: z.boolean() }),
]);
export type TwinStreamEvent = z.infer<typeof twinStreamEventSchema>;

export const suggestionSchema = z.object({
  id: idSchema,
  label: z.string(),
  prompt: z.string(),
  kind: z.enum(['ask', 'shortcut', 'task', 'workflow', 'alert', 'approve', 'break']),
  hint: z.string(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;
