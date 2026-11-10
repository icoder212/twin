import { z } from 'zod';
import { isoDateTimeSchema } from './common';

// ---------------------------------------------------------------------------
// The user's own calendar: read-only, reduced to what the desk needs.
// ---------------------------------------------------------------------------

export const calendarEventSchema = z.object({
  /** The provider's id. Google uses base32hex, plus `_` and a timestamp for recurring instances. */
  id: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier'),
  title: z.string().max(200),
  start: isoDateTimeSchema,
  end: isoDateTimeSchema,
  /** All-day events are anchored at midday UTC so they land on the right date in every timezone. */
  allDay: z.boolean(),
  location: z.string().max(200).optional(),
  /** https link to join the call, when the event has one. */
  joinUrl: z.string().max(2048).optional(),
  /** Opens the event in the calendar provider. */
  link: z.string().max(2048).optional(),
  /** You replied "maybe", or the organiser has not confirmed it. */
  tentative: z.boolean(),
  /** People invited, not counting you or rooms. Their names and addresses are never fetched. */
  guests: z.number().int().nonnegative(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarConnectionSchema = z.enum(['connected', 'expired', 'not-connected']);
export type CalendarConnection = z.infer<typeof calendarConnectionSchema>;

export const calendarUpcomingSchema = z.object({
  connection: calendarConnectionSchema,
  /** The calendar's own name, usually the account's address. */
  calendarName: z.string().max(200).optional(),
  fetchedAt: isoDateTimeSchema.optional(),
  /** When access ends and the user has to connect again, if it is time-limited. */
  accessEndsAt: isoDateTimeSchema.optional(),
  /** Soonest first. */
  events: z.array(calendarEventSchema),
});
export type CalendarUpcoming = z.infer<typeof calendarUpcomingSchema>;

/**
 * Platform port for a live calendar. The demo backend reads one supplied by the browser, which
 * holds short-lived access; the real backend implements the same port with tokens in its vault.
 */
export interface CalendarFeed {
  connection(): CalendarConnection;
  /**
   * Events from now to `days` ahead; `fresh` skips any cached copy. Resolves with `connection`
   * set when access has ended, and rejects with an ApiError when the provider fails.
   */
  upcoming(days: number, options?: { fresh?: boolean }): Promise<CalendarUpcoming>;
  disconnect(): void;
}
