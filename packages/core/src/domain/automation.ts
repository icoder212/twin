import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';

/**
 * Tasks ("say it once") and workflows (source to destination) share one model: a plan of steps
 * that read from allowed sources and write only to allowed destinations.
 */
export const automationKindSchema = z.enum(['task', 'workflow']);
export type AutomationKind = z.infer<typeof automationKindSchema>;

export const stepVerbSchema = z.enum([
  'read',
  'check',
  'match',
  'compare',
  'write',
  'draft',
  'remind',
]);
export type StepVerb = z.infer<typeof stepVerbSchema>;

export const automationStepSchema = z.object({
  id: idSchema,
  verb: stepVerbSchema,
  system: z.string().max(80),
  description: z.string().max(300),
  /** Writes to another person (email, message, invite) always wait for approval. */
  needsApproval: z.boolean(),
});
export type AutomationStep = z.infer<typeof automationStepSchema>;

export const scheduleSchema = z.object({
  kind: z.enum(['schedule', 'manual', 'event']),
  label: z.string().max(80),
  cron: z.string().max(64).optional(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const runStatusSchema = z.enum([
  'succeeded',
  'failed',
  'awaiting-approval',
  'running',
  'stopped',
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const automationRunSchema = z.object({
  id: idSchema,
  automationId: idSchema,
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.optional(),
  status: runStatusSchema,
  trigger: z.enum(['schedule', 'manual', 'shortcut', 'event']),
  steps: z.array(
    z.object({
      stepId: idSchema,
      status: z.enum(['succeeded', 'failed', 'skipped', 'waiting']),
      message: z.string().max(300),
      at: isoDateTimeSchema,
    }),
  ),
});
export type AutomationRun = z.infer<typeof automationRunSchema>;

export const automationSchema = z.object({
  id: idSchema,
  kind: automationKindSchema,
  name: z.string().min(1).max(80),
  instruction: z.string().min(1).max(1000),
  shortcut: z
    .string()
    .regex(/^\/[a-z][a-z0-9-]{1,23}$/)
    .optional(),
  schedule: scheduleSchema,
  sources: z.array(z.string().max(80)),
  destinations: z.array(z.string().max(80)),
  steps: z.array(automationStepSchema).min(1).max(20),
  recipients: z.array(z.string().max(120)),
  status: z.enum(['active', 'paused', 'draft']),
  createdAt: isoDateTimeSchema,
  lastRun: automationRunSchema.optional(),
  nextRunAt: isoDateTimeSchema.optional(),
});
export type Automation = z.infer<typeof automationSchema>;

/** What the twin returns when asked to plan a job from one plain-English instruction. */
export const automationPlanSchema = z.object({
  draft: automationSchema,
  questions: z.array(
    z.object({ id: idSchema, question: z.string(), options: z.array(z.string()).min(1).max(6) }),
  ),
});
export type AutomationPlan = z.infer<typeof automationPlanSchema>;

export const planRequestSchema = z.object({
  kind: automationKindSchema,
  instruction: z
    .string()
    .trim()
    .min(12, 'Describe the job in a sentence or two')
    .max(1000, 'Keep the instruction under 1,000 characters'),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;
