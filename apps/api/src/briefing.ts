import {
  BRIEFING_SECTION_LABELS,
  briefingScheduleSchema,
  dayKeyIn,
  DELIVERY_CHANNELS,
  localClock,
  MAJOR_US_RELEASES,
  NEWS_SOURCE_LABELS,
  US_RELEASE_INFO,
  updateBriefingInputSchema,
  type Briefing,
  type BriefingSchedule,
  type BriefingSection,
  type NotificationEvent,
} from '@twindesk/core';
import type { z } from 'zod';
import {
  BOE_DECISION_DAYS,
  BOE_TIME,
  BOE_ZONE,
  ECB_DECISION_DAYS,
  ECB_TIME,
  ECB_ZONE,
} from './central-banks';
import { refreshSchedule, zonedInstant } from './economic';
import { marketLines } from './markets';
import { loadNewsWatch, loadRecent } from './news';
import { localTime, notify, type NotifyDeps } from './notify';
import { serverPolicy } from './settings';
import type { Store } from './store';
import { updateTemplate } from './whatsapp';

/**
 * The morning brief, on the owner's schedule: markets at the last close, the day's US releases
 * and central bank decisions with a severity for each, and the news the owner follows. Facts
 * only; the brief never recommends or predicts anything.
 */

const SCHEDULE_KEY = 'briefing-morning-brief';
const DAY_MS = 86_400_000;
/** How far ahead to look for the next high-severity event when the day has none. */
const LOOKAHEAD_DAYS = 60;
/** A run missed by a few minutes still sends; after this the day's brief is skipped. */
const LATE_MINUTES = 30;
const MAX_ITEMS = 12;
const MAX_ITEM_LENGTH = 240;

/** What this server can put in a brief so far. */
export const OFFERED: BriefingSection[] = ['markets', 'releases', 'news'];

const DEFAULT_SCHEDULE: BriefingSchedule = {
  kind: 'morning-brief',
  enabled: false,
  time: '08:00',
  days: [1, 2, 3, 4, 5],
  channels: ['in-app', 'email'],
  sections: OFFERED,
};

export const briefUpdateSchema = updateBriefingInputSchema.omit({ kind: true });

export async function loadBrief(store: Store): Promise<BriefingSchedule> {
  try {
    const parsed = briefingScheduleSchema.safeParse(
      JSON.parse((await store.getSetting(SCHEDULE_KEY)) ?? 'null'),
    );
    return parsed.success ? parsed.data : DEFAULT_SCHEDULE;
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

/** Saves the schedule, keeping only channels and sections this server has. Null if none left. */
export async function saveBrief(
  deps: NotifyDeps,
  input: z.infer<typeof briefUpdateSchema>,
): Promise<BriefingSchedule | null> {
  const sections = OFFERED.filter((s) => input.sections.includes(s));
  if (sections.length === 0) return null;
  const allowed = new Set(serverPolicy().allowedChannels);
  const previous = await loadBrief(deps.store);
  const schedule: BriefingSchedule = {
    kind: 'morning-brief',
    enabled: input.enabled,
    time: input.time,
    days: [...new Set(input.days)].sort((a, b) => a - b),
    channels: DELIVERY_CHANNELS.filter(
      (c) => c === 'in-app' || (input.channels.includes(c) && allowed.has(c)),
    ),
    sections,
    ...(previous.lastSentAt ? { lastSentAt: previous.lastSentAt } : {}),
  };
  await deps.store.putSetting(SCHEDULE_KEY, JSON.stringify(schedule), deps.now);
  return schedule;
}

function nextRun(deps: NotifyDeps, schedule: BriefingSchedule): string | undefined {
  if (!schedule.enabled) return undefined;
  const zone = deps.config.TIMEZONE;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = dayKeyIn(zone, new Date(deps.now), offset);
    const at = zonedInstant(day, schedule.time, zone);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (at > deps.now && schedule.days.includes(weekday)) return new Date(at).toISOString();
  }
  return undefined;
}

/** The schedule as the app shows it. */
export async function briefState(deps: NotifyDeps): Promise<BriefingSchedule> {
  const schedule = await loadBrief(deps.store);
  const next = nextRun(deps, schedule);
  return { ...schedule, offered: OFFERED, ...(next ? { nextRunAt: next } : {}) };
}

interface DayEvent {
  at: number;
  label: string;
  high: boolean;
}

function severity(event: DayEvent): string {
  return event.high ? 'high' : 'medium';
}

function longDay(deps: NotifyDeps, at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: deps.config.TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(at));
}

/** Today's scheduled US releases and central bank decisions, and the next high-severity one. */
async function events(deps: NotifyDeps): Promise<{ today: DayEvent[]; next?: DayEvent }> {
  const { config, store, now } = deps;
  // Stale dates are better than none, so a failed refresh still lists what is stored.
  await refreshSchedule(deps).catch(() => undefined);
  const zone = config.TIMEZONE;
  const start = zonedInstant(dayKeyIn(zone, new Date(now)), '00:00', zone);
  const end = zonedInstant(dayKeyIn(zone, new Date(now), 1), '00:00', zone);
  const horizon = now + LOOKAHEAD_DAYS * DAY_MS;
  const us = (await store.listReleases(start, horizon)).map((r) => ({
    at: r.at,
    label: `US ${US_RELEASE_INFO[r.event].label}`,
    high: US_RELEASE_INFO[r.event].major,
  }));
  const banks = [
    ...BOE_DECISION_DAYS.map((day) => ({
      at: zonedInstant(day, BOE_TIME, BOE_ZONE),
      label: 'UK Bank of England interest rate decision',
      high: true,
    })),
    ...ECB_DECISION_DAYS.map((day) => ({
      at: zonedInstant(day, ECB_TIME, ECB_ZONE),
      label: 'Euro area ECB interest rate decision',
      high: true,
    })),
  ].filter((e) => e.at >= start && e.at < horizon);
  const all = [...us, ...banks].sort((a, b) => a.at - b.at);
  return { today: all.filter((e) => e.at < end), next: all.find((e) => e.at >= end && e.high) };
}

async function newsItems(deps: NotifyDeps): Promise<string[]> {
  if (!(await loadNewsWatch(deps.store))) {
    return [
      'You are not following any news yet. Add companies or topics under Instructions for Desk Twin.',
    ];
  }
  const recent = (await loadRecent(deps.store)).filter(
    (a) => Date.parse(a.at) >= deps.now - DAY_MS,
  );
  return recent.length
    ? recent.map((a) => `${a.headline} (${NEWS_SOURCE_LABELS[a.source]})`)
    : ['No headlines on what you follow in the last 24 hours.'];
}

const MAJOR_WORDS = MAJOR_US_RELEASES.filter((e) => e !== 'fomc')
  .map((e) => US_RELEASE_INFO[e].short.replace(/^US /, ''))
  .join(', ')
  .replace(/, ([^,]*)$/, ' and $1');

export interface BuiltBrief {
  briefing: Briefing;
  /** A few lines for the app and WhatsApp. */
  summary: string;
  /** The whole brief as plain text, for email. */
  text: string;
}

export async function buildBrief(
  deps: NotifyDeps,
  sections: BriefingSection[],
): Promise<BuiltBrief> {
  const { config, now } = deps;
  const time = (at: number) => localTime(config, new Date(at).toISOString());
  const wanted = OFFERED.filter((s) => sections.includes(s));
  const none: { today: DayEvent[]; next?: DayEvent } = { today: [] };
  const [markets, day, news] = await Promise.all([
    wanted.includes('markets') ? marketLines(config, deps.fetch, now) : [],
    wanted.includes('releases') ? events(deps) : none,
    wanted.includes('news') ? newsItems(deps) : [],
  ]);

  const releaseItems = day.today.length
    ? day.today.map((e) => `${time(e.at)} ${e.label}, ${severity(e)} severity.`)
    : [
        'No US releases and no Fed, Bank of England or ECB decisions today.',
        ...(day.next
          ? [
              `Next high-severity event: ${longDay(deps, day.next.at)}, ${time(day.next.at)} ${day.next.label}.`,
            ]
          : []),
      ];
  const items: Record<string, string[]> = { markets, releases: releaseItems, news };
  const title = `Morning brief, ${longDay(deps, now)}`;
  const briefing: Briefing = {
    kind: 'morning-brief',
    title,
    generatedAt: new Date(now).toISOString(),
    sections: wanted.map((id) => ({
      id,
      heading: BRIEFING_SECTION_LABELS[id],
      items: (items[id] ?? []).slice(0, MAX_ITEMS).map((i) => i.slice(0, MAX_ITEM_LENGTH)),
    })),
  };

  const high = day.today.filter((e) => e.high).length;
  const summary = [
    wanted.includes('releases')
      ? day.today.length
        ? `${day.today.length} scheduled today, ${high || 'none'} of high severity: ${day.today.map((e) => `${time(e.at)} ${e.label}`).join(', ')}.`
        : 'No scheduled releases or central bank decisions today.'
      : '',
    markets[0] ? `${markets[0]}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const notes = [
    ...(wanted.includes('releases')
      ? [
          `Times are UK time. Severity is a fixed label for each kind of event: high for central bank decisions and the major US releases (${MAJOR_WORDS}), medium for the others.`,
        ]
      : []),
    ...(wanted.includes('markets')
      ? [
          'US-listed funds stand in for their indices. Prices from Alpaca; exchange rates are the ECB’s reference rates.',
        ]
      : []),
    'Facts only, with no recommendations or forecasts.',
  ];
  const text = [
    title,
    ...briefing.sections.flatMap((s) => ['', s.heading, ...s.items.map((i) => `- ${i}`)]),
    '',
    ...notes,
  ].join('\n');

  return { briefing, summary: summary || title, text };
}

/** Builds the brief and sends it on its own channels, quiet hours or not, as it was scheduled. */
export async function sendBrief(
  deps: NotifyDeps,
  schedule: BriefingSchedule,
): Promise<NotificationEvent> {
  const built = await buildBrief(deps, schedule.sections);
  const event = await notify(deps, {
    topic: 'briefing',
    urgency: 'info',
    title: built.briefing.title,
    body: built.summary,
    href: '/notifications?tab=briefings',
    channels: schedule.channels,
    scheduled: true,
    emailText: built.text,
    whatsapp: updateTemplate(deps.config, 'your morning brief', built.summary),
  });
  const saved = await loadBrief(deps.store);
  await deps.store.putSetting(
    SCHEDULE_KEY,
    JSON.stringify({ ...saved, lastSentAt: event.createdAt }),
    deps.now,
  );
  return event;
}

export type BriefOutcome = { status: 'off' } | { status: 'ok'; sent: boolean };

/** Called every minute: sends the day's brief once, at the set time on the chosen days. */
export async function runBrief(deps: NotifyDeps): Promise<BriefOutcome> {
  const { config, store, now } = deps;
  const schedule = await loadBrief(store);
  if (!schedule.enabled) return { status: 'off' };
  const clock = localClock(config.TIMEZONE, new Date(now));
  const [hours = 0, minutes = 0] = schedule.time.split(':').map(Number);
  const late = clock.minutes - (hours * 60 + minutes);
  if (!schedule.days.includes(clock.weekday) || late < 0 || late >= LATE_MINUTES) {
    return { status: 'ok', sent: false };
  }
  const key = `briefing|morning-brief|${dayKeyIn(config.TIMEZONE, new Date(now))}`;
  if (!(await store.claimReminder(key, now))) return { status: 'ok', sent: false };
  try {
    await sendBrief(deps, schedule);
  } catch (error) {
    // Nothing was recorded, so the next run tries again.
    await store.releaseReminder(key);
    throw error;
  }
  return { status: 'ok', sent: true };
}
