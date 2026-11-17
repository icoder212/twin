import {
  dayKeyIn,
  describeMove,
  MARKET_SESSION_INFO,
  marketSessionsUpdateSchema,
  US_RELEASE_INFO,
  type MarketSession,
} from '@twindesk/core';
import {
  BOE_DECISION_DAYS,
  BOE_TIME,
  BOE_ZONE,
  ECB_DECISION_DAYS,
  ECB_TIME,
  ECB_ZONE,
} from './central-banks';
import { zonedInstant } from './economic';
import { marketsState } from './market-moves';
import { localTime, notify, type NotifyDeps } from './notify';
import type { Store } from './store';
import { updateTemplate } from './whatsapp';

/**
 * A note 10 minutes before the London and New York opens, on weekdays: how the watched markets
 * stand against the last close, and the releases and central bank decisions due in the first
 * hour. Bank holidays are not skipped. Facts only.
 */

const SESSIONS_KEY = 'market-sessions';
export const NOTE_MINUTES = 10;
/** A run missed by a few minutes still sends; after this the note is skipped for the day. */
const LATE_MS = 5 * 60_000;
const HOUR_MS = 3_600_000;

export async function loadSessions(store: Store): Promise<MarketSession[]> {
  try {
    const parsed = marketSessionsUpdateSchema.safeParse({
      sessions: JSON.parse((await store.getSetting(SESSIONS_KEY)) ?? '[]'),
    });
    return parsed.success ? parsed.data.sessions : [];
  } catch {
    return [];
  }
}

export async function saveSessions(store: Store, sessions: MarketSession[], now: number) {
  await store.putSetting(SESSIONS_KEY, JSON.stringify(sessions), now);
}

/** When a session opens today on its own clock, or null at its weekend. */
function openingToday(session: MarketSession, now: number): number | null {
  const { zone, opens } = MARKET_SESSION_INFO[session];
  const day = dayKeyIn(zone, new Date(now));
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return null;
  return zonedInstant(day, opens, zone);
}

/** US releases and central bank decisions due in the hour after `open`. */
async function firstHour(deps: NotifyDeps, open: number): Promise<string[]> {
  const time = (at: number) => localTime(deps.config, new Date(at).toISOString());
  const us = (await deps.store.listReleases(open, open + HOUR_MS - 1)).map((r) => ({
    at: r.at,
    label: `US ${US_RELEASE_INFO[r.event].label}`,
  }));
  const banks = [
    ...BOE_DECISION_DAYS.map((day) => ({
      at: zonedInstant(day, BOE_TIME, BOE_ZONE),
      label: 'Bank of England decision',
    })),
    ...ECB_DECISION_DAYS.map((day) => ({
      at: zonedInstant(day, ECB_TIME, ECB_ZONE),
      label: 'ECB decision',
    })),
  ].filter((e) => e.at >= open && e.at < open + HOUR_MS);
  return [...us, ...banks].sort((a, b) => a.at - b.at).map((e) => `${time(e.at)} ${e.label}`);
}

async function sendNote(deps: NotifyDeps, session: MarketSession, open: number) {
  const { label } = MARKET_SESSION_INFO[session];
  const at = localTime(deps.config, new Date(open).toISOString());
  const [state, due] = await Promise.all([
    marketsState(deps).catch(() => null),
    firstHour(deps, open),
  ]);
  const moves = (state?.quotes ?? []).flatMap((q) =>
    q.changePct === null ? [] : [`${q.name} ${describeMove(q.changePct)}`],
  );
  const body = [
    moves.length ? `Your markets against the last close: ${moves.join(', ')}.` : '',
    due.length
      ? `Due in the first hour: ${due.join(', ')}.`
      : 'Nothing scheduled in the first hour.',
  ]
    .filter(Boolean)
    .join(' ');
  await notify(deps, {
    topic: 'price',
    urgency: 'info',
    title: `${label} opens at ${at}`,
    body,
    href: '/notifications',
    scheduled: true,
    whatsapp: updateTemplate(
      deps.config,
      `the ${label} open at ${at}`,
      [
        moves.length ? moves.slice(0, 4).join(', ') : '',
        due.length ? `due: ${due.slice(0, 2).join(', ')}` : 'nothing due in the first hour',
      ]
        .filter(Boolean)
        .join('; '),
    ),
  });
}

export type SessionNotesOutcome = { status: 'off' } | { status: 'ok'; sent: number };

/** Called every minute: sends each chosen open's note once, 10 minutes before it. */
export async function runSessionNotes(deps: NotifyDeps): Promise<SessionNotesOutcome> {
  const sessions = await loadSessions(deps.store);
  if (sessions.length === 0) return { status: 'off' };
  let sent = 0;
  for (const session of sessions) {
    const open = openingToday(session, deps.now);
    if (open === null) continue;
    const due = open - NOTE_MINUTES * 60_000;
    if (deps.now < due || deps.now >= due + LATE_MS) continue;
    const day = dayKeyIn(MARKET_SESSION_INFO[session].zone, new Date(deps.now));
    const key = `session-note|${session}|${day}`;
    if (!(await deps.store.claimReminder(key, deps.now))) continue;
    try {
      await sendNote(deps, session, open);
      sent += 1;
    } catch (error) {
      // Nothing was recorded, so the next run tries again.
      await deps.store.releaseReminder(key);
      throw error;
    }
  }
  return { status: 'ok', sent };
}
