import { z } from 'zod';
import { watchChannelSchema } from './economic';
import { deliveryChannelSchema } from './notifications';

/**
 * Rule watch on the owner's own trading account: how much of their daily loss limit and maximum
 * drawdown is used, with an alert as each share is reached. The limits are the owner's own rules;
 * the figures are the account's, as the broker reports them. Facts only, never what to trade.
 */

/** Alerts go out as the share used first reaches each of these, in per cent. */
export const RULE_ALERT_STEPS = [50, 75, 90, 100] as const;
export const MAX_OPEN_POSITIONS_SHOWN = 50;

const amount = z.number().positive().max(100_000_000);

export const ruleLimitsSchema = z.object({
  /** The most the account may fall in a day, from its equity at the day's first reading. */
  dailyLoss: amount,
  /** The most it may fall from its highest equity seen. */
  maxDrawdown: amount.optional(),
});
export type RuleLimits = z.infer<typeof ruleLimitsSchema>;

export const ruleWatchUpdateSchema = z.object({
  limits: ruleLimitsSchema,
  /** When present, rule alerts go to these channels from now on, besides the app. */
  channels: z.array(watchChannelSchema).max(2).optional(),
});
export type RuleWatchUpdate = z.infer<typeof ruleWatchUpdateSchema>;

export const tradingAccountSchema = z.object({
  name: z.string().max(80),
  /** e.g. SPREADBET or CFD. */
  type: z.string().max(30),
  currency: z.string().max(8),
  balance: z.number(),
  /** Open positions' profit or loss now. */
  profitLoss: z.number(),
  equity: z.number(),
});
export type TradingAccount = z.infer<typeof tradingAccountSchema>;

export const openPositionSchema = z.object({
  epic: z.string().max(60),
  name: z.string().max(120),
  direction: z.enum(['BUY', 'SELL']),
  size: z.number(),
  level: z.number(),
  /** The price the position would close at now. */
  price: z.number().nullable(),
  /** Points in the position's favour (negative against it). */
  points: z.number().nullable(),
});
export type OpenPosition = z.infer<typeof openPositionSchema>;

/** How much of one limit is used, and the highest alert step sent for it. */
export const limitUseSchema = z.object({
  /** Equity the use is measured from: the day's first reading, or the highest seen. */
  from: z.number(),
  used: z.number().min(0),
  /** Share of the limit used, in per cent. */
  pct: z.number().min(0),
  /** 0 when none has been sent. */
  alerted: z.number().int().min(0).max(100),
});
export type LimitUse = z.infer<typeof limitUseSchema>;

export const ruleWatchStateSchema = z.object({
  /** Whether this server can read a trading account. */
  available: z.boolean(),
  limits: ruleLimitsSchema.nullable(),
  /** Where rule alerts go now, the app included. */
  channels: z.array(deliveryChannelSchema),
  account: tradingAccountSchema.nullable(),
  daily: limitUseSchema.nullable(),
  drawdown: limitUseSchema.nullable(),
  positions: z.array(openPositionSchema).max(MAX_OPEN_POSITIONS_SHOWN),
  /** Why the account is missing, in plain words, when it is. */
  problem: z.string().max(200).optional(),
});
export type RuleWatchState = z.infer<typeof ruleWatchStateSchema>;

/** The highest alert step `pct` has reached, or 0. */
export function ruleStep(pct: number): number {
  return [...RULE_ALERT_STEPS].reverse().find((step) => pct >= step) ?? 0;
}
