import {
  formatTime,
  GoogleCalendarError,
  listGoogleEvents,
  type CalendarEvent,
} from '@twindesk/core';
import type { Config } from './config';
import { seal, unseal } from './crypto';
import { GoogleAuthError, refreshAccessToken } from './google';
import type { GoogleLink, Store } from './store';
import { reminderMessage, sendWhatsApp } from './whatsapp';

/** Refresh access a minute early, so a run never uses a token that expires mid-request. */
const ACCESS_MARGIN_MS = 60_000;

export interface DueReminder {
  key: string;
  event: CalendarEvent;
}

/**
 * Timed events starting within the next `minutes`. A run every minute picks each one up about
 * `minutes` before it starts; if runs were missed, it still goes out, just later.
 */
export function dueReminders(events: CalendarEvent[], now: number, minutes: number): DueReminder[] {
  return events
    .filter((e) => {
      const startsIn = Date.parse(e.start) - now;
      return !e.allDay && startsIn > 0 && startsIn <= minutes * 60_000;
    })
    .map((event) => ({ key: `${event.id}|${event.start}`, event }));
}

export interface ReminderDeps {
  config: Config;
  store: Store;
  fetch: typeof fetch;
  now: number;
}

export type RunOutcome =
  | { status: 'not-connected' }
  | { status: 'access-ended' }
  | { status: 'ok'; due: number; sent: number; failed: number; error?: string };

async function accessToken(
  { config, store, fetch, now }: ReminderDeps,
  link: GoogleLink,
): Promise<string> {
  if (link.accessSealed && link.accessExpiresAt && link.accessExpiresAt - ACCESS_MARGIN_MS > now) {
    return unseal(link.accessSealed, config.TOKEN_KEY);
  }
  const refreshToken = await unseal(link.refreshSealed, config.TOKEN_KEY);
  const tokens = await refreshAccessToken(config, refreshToken, fetch);
  await store.saveAccess(
    await seal(tokens.access_token, config.TOKEN_KEY),
    now + tokens.expires_in * 1000,
  );
  return tokens.access_token;
}

/** One scheduled run: read the next few minutes of the calendar and send what is due. */
export async function runReminders(deps: ReminderDeps): Promise<RunOutcome> {
  const { config, store, fetch, now } = deps;
  const link = await store.getLink();
  if (!link) return { status: 'not-connected' };

  let token: string;
  try {
    token = await accessToken(deps, link);
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reason === 'revoked') {
      await store.deleteLink();
      return { status: 'access-ended' };
    }
    throw error;
  }

  let events: CalendarEvent[];
  try {
    ({ events } = await listGoogleEvents({
      accessToken: token,
      from: new Date(now),
      to: new Date(now + (config.REMINDER_MINUTES + 1) * 60_000),
      fetch,
    }));
  } catch (error) {
    // A refused token is refreshed on the next run.
    if (error instanceof GoogleCalendarError && error.reason === 'expired')
      await store.clearAccess();
    throw error;
  }

  const due = dueReminders(events, now, config.REMINDER_MINUTES);
  const loc = { language: 'en-GB', timezone: config.TIMEZONE, currency: 'GBP' };
  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const { key, event } of due) {
    if (!(await store.claimReminder(key, now))) continue;
    try {
      const message = reminderMessage(config, event.title, formatTime(event.start, loc));
      await store.markSent(key, await sendWhatsApp(config, message, fetch));
      sent += 1;
    } catch (error) {
      await store.releaseReminder(key);
      failed += 1;
      firstError ??= error instanceof Error ? error.message : String(error);
    }
  }
  return { status: 'ok', due: due.length, sent, failed, error: firstError };
}
