import { z } from 'zod';
import { watchChannelSchema } from './economic';
import { deliveryChannelSchema } from './notifications';

/**
 * Market move alerts: the owner's watchlist of markets, and an alert each time a market's move on
 * the day reaches a new whole step (1% by default), up or down. Facts only: the level, the move
 * and the previous close, never what to do about it.
 */

/** A market's identifier at the price source, e.g. IG's IX.D.NASDAQ.CASH.IP. */
export const marketEpicSchema = z
  .string()
  .regex(/^[A-Z0-9][A-Za-z0-9._-]{2,59}$/, 'Not a market identifier');

/** Move sizes offered, in per cent of the previous close. */
export const MARKET_STEP_CHOICES = [0.5, 1, 2, 3] as const;
export const DEFAULT_MARKET_STEP = 1;
export const MAX_WATCHED_MARKETS = 20;

export const watchedMarketSchema = z.object({
  epic: marketEpicSchema,
  name: z.string().trim().min(1).max(80),
  /** An alert goes out each time the move on the day reaches a new multiple of this. */
  stepPct: z.number().min(0.25).max(10),
});
export type WatchedMarket = z.infer<typeof watchedMarketSchema>;

export const marketWatchSchema = z.object({
  markets: z
    .array(watchedMarketSchema)
    .min(1, 'Add at least one market')
    .max(MAX_WATCHED_MARKETS, `Watch up to ${MAX_WATCHED_MARKETS} markets`)
    .refine((list) => new Set(list.map((m) => m.epic)).size === list.length, {
      message: 'Each market can be added once',
    }),
});
export type MarketWatch = z.infer<typeof marketWatchSchema>;

export const marketWatchUpdateSchema = z.object({
  watch: marketWatchSchema,
  /** When present, market moves go to these channels from now on, besides the app. */
  channels: z.array(watchChannelSchema).max(2).optional(),
});
export type MarketWatchUpdate = z.infer<typeof marketWatchUpdateSchema>;

/** A watched market now, with the levels already alerted on its current trading day. */
export const marketQuoteSchema = z.object({
  epic: marketEpicSchema,
  name: z.string().max(120),
  /** The source's status, e.g. TRADEABLE or CLOSED. */
  status: z.string().max(30),
  price: z.number().nullable(),
  change: z.number().nullable(),
  changePct: z.number().nullable(),
  previousClose: z.number().nullable(),
  decimals: z.number().int().min(0).max(8),
  /** Steps alerted today on each side: 2 means the +2 step was sent; -1 the -1 step. */
  alertedUp: z.number().int().min(0),
  alertedDown: z.number().int().max(0),
});
export type MarketQuote = z.infer<typeof marketQuoteSchema>;

export const marketSearchResultSchema = z.object({
  epic: marketEpicSchema,
  name: z.string().max(120),
  /** e.g. INDICES, CURRENCIES, COMMODITIES, SHARES. */
  type: z.string().max(40),
  /** e.g. DFB for a daily funded bet, or a futures month such as DEC-26. */
  expiry: z.string().max(20),
  status: z.string().max(30),
  price: z.number().nullable(),
  changePct: z.number().nullable(),
});
export type MarketSearchResult = z.infer<typeof marketSearchResultSchema>;

export const marketsStateSchema = z.object({
  /** Whether this server has a price source set up. */
  available: z.boolean(),
  watch: marketWatchSchema.nullable(),
  /** Where market moves go now, the app included. */
  channels: z.array(deliveryChannelSchema),
  quotes: z.array(marketQuoteSchema).max(MAX_WATCHED_MARKETS),
  /** Why prices are missing, in plain words, when they are. */
  problem: z.string().max(200).optional(),
});
export type MarketsState = z.infer<typeof marketsStateSchema>;

/**
 * Whole steps moved on the day, towards zero: +2.3% with a 1% step is 2, -1.4% is -1 and +0.9%
 * is 0. The small allowance keeps an exact 1.0% from rounding down to 0.
 */
export function moveLevel(changePct: number, stepPct: number): number {
  const steps = Math.floor(Math.abs(changePct) / stepPct + 1e-9);
  if (steps === 0) return 0;
  return changePct < 0 ? -steps : steps;
}

/** "up 1.2%", "down 2.0%": the move on the day, to one decimal place. */
export function describeMove(changePct: number): string {
  return `${changePct < 0 ? 'down' : 'up'} ${Math.abs(changePct).toFixed(1)}%`;
}
