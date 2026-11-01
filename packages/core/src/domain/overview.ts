import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';

/** One slot in "a day on this desk, handled". */
export const routineItemSchema = z.object({
  id: idSchema,
  /** "07:30", "Live" or "Fri". */
  slot: z.string().max(8),
  title: z.string().max(60),
  description: z.string().max(200),
  shortcut: z.string().max(40).optional(),
  state: z.enum(['done', 'running', 'next', 'later', 'live']),
});
export type RoutineItem = z.infer<typeof routineItemSchema>;

export const ruleWatchSchema = z.object({
  accountId: z.string().max(32),
  accountLabel: z.string().max(80),
  currency: z.string().length(3),
  balance: z.number(),
  equity: z.number(),
  equityFloor: z.number(),
  dailyLossLimitPct: z.number(),
  dailyLossUsedPct: z.number(),
  maxDrawdownPct: z.number(),
  drawdownUsedPct: z.number(),
  resetsAt: z.string().max(40),
  ruleVersion: z.number().int(),
  session: z.object({
    label: z.string().max(60),
    inside: z.boolean(),
    opensIn: z.string().max(20).optional(),
  }),
  /** Intraday equity samples, oldest first. */
  equitySeries: z.array(z.number()),
  tradesToday: z.number().int().nonnegative(),
  maxTradesPerSession: z.number().int().positive(),
});
export type RuleWatch = z.infer<typeof ruleWatchSchema>;

export const economicEventSchema = z.object({
  id: idSchema,
  time: z.string().regex(/^\d{2}:\d{2}$/),
  currency: z.string().length(3),
  title: z.string().max(120),
  impact: z.enum(['low', 'medium', 'high']),
  previous: z.string().max(16),
  consensus: z.string().max(16),
  actual: z.string().max(16).optional(),
  inCalendar: z.boolean(),
});
export type EconomicEvent = z.infer<typeof economicEventSchema>;

export const actionItemSchema = z.object({
  id: idSchema,
  title: z.string().max(140),
  kind: z.enum(['follow-up', 'reminder', 'approval', 'review']),
  due: z.string().max(20).optional(),
  done: z.boolean(),
});
export type ActionItem = z.infer<typeof actionItemSchema>;

export const newsItemSchema = z.object({
  id: idSchema,
  headline: z.string().max(200),
  source: z.string().max(60),
  at: isoDateTimeSchema,
  instruments: z.array(z.string().max(12)),
});
export type NewsItem = z.infer<typeof newsItemSchema>;

export const deskOverviewSchema = z.object({
  routine: z.array(routineItemSchema),
  ruleWatch: ruleWatchSchema,
  events: z.array(economicEventSchema),
  actionItems: z.array(actionItemSchema),
  news: z.array(newsItemSchema),
  offYourPlate: z.array(z.string()),
  timeSavedThisWeek: z.object({ minutes: z.number().int(), runs: z.number().int() }),
});
export type DeskOverview = z.infer<typeof deskOverviewSchema>;
