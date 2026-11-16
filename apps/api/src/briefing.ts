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
import { briefHtml, type BriefItem } from './brief-email';
import {
  BOE_DECISION_DAYS,
  BOE_TIME,
  BOE_ZONE,
  ECB_DECISION_DAYS,
  ECB_TIME,
  ECB_ZONE,
} from './central-banks';
import { yesterdayDigest, type DigestPeriod } from './digest';
import { fetchResult, refreshSchedule, zonedInstant } from './economic';
import { BIG_MOVE, markets, MIN_MOVER_PRICE, movers, type Markets } from './markets';
import { loadNewsWatch, loadRecent } from './news';
import { localTime, notify, type NotifyDeps } from './notify';
import { serverPolicy } from './settings';
import type { Store } from './store';
import { updateTemplate } from './whatsapp';

/**
 * The morning brief, on the owner's schedule: markets at the last close, the biggest moves among
 * US stocks, the last 24 hours in the news (the US, wars and conflicts, oil and gold), the figures
 * from yesterday's US releases, the day's US releases and central bank decisions with a severity
 * for each, and the news the owner follows. Facts only; the brief never recommends or predicts
 * anything.
 */

const SCHEDULE_KEY = 'briefing-morning-brief';
/** The day of the last scheduled send, so later runs that day stop before building anything. */
const SENT_KEY = 'briefing-morning-brief-sent';
const DAY_MS = 86_400_000;
/** How far ahead to look for the next high-severity event when the day has none. */
const LOOKAHEAD_DAYS = 60;
/** A run missed by a few minutes still sends; after this the day's brief is skipped. */
const LATE_MINUTES = 30;
const MAX_ITEMS = 12;
const MAX_ITEM_LENGTH = 240;

/** What this server can put in a brief, in the order it appears. */
export const OFFERED: BriefingSection[] = [
  'markets',
  'movers',
  'headlines',
  'results',
  'releases',
  'news',
];

const DEFAULT_SCHEDULE: BriefingSchedule = {
  kind: 'morning-brief',
  enabled: false,
  time: '08:00',
  days: [0, 1, 2, 3, 4, 5, 6],
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

/**
 * How far back "yesterday" reaches: to the last weekday, so Monday's brief covers Friday and the
 * weekend, and Sunday's covers Friday and Saturday. Bank holidays are not skipped.
 */
interface LookBack {
  days: number;
  /** The weekday it reaches back to, e.g. "Friday". */
  day: string;
  since: number;
}

function lookBack(deps: NotifyDeps): LookBack {
  const today = dayKeyIn(deps.config.TIMEZONE, new Date(deps.now));
  const noon = Date.parse(`${today}T12:00:00Z`);
  const weekday = new Date(noon).getUTCDay();
  const days = weekday === 1 ? 3 : weekday === 0 ? 2 : 1;
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(noon - days * DAY_MS),
  );
  return { days, day, since: deps.now - days * DAY_MS };
}

function digestPeriod(back: LookBack): DigestPeriod {
  return {
    since: back.since,
    words:
      back.days === 1
        ? 'the last 24 hours'
        : `the ${back.days * 24} hours since ${back.day} morning`,
  };
}

/** Section headings, naming the day when "yesterday" would be wrong. */
function heading(id: BriefingSection, back: LookBack): string {
  if (back.days > 1 && id === 'headlines') return `In the news since ${back.day}`;
  if (back.days > 1 && id === 'results') return `${back.day}’s results`;
  return BRIEFING_SECTION_LABELS[id];
}

/** Midnight at the start of today, `offset` days on, on the owner's clock. */
function midnight(deps: NotifyDeps, offset = 0): number {
  const zone = deps.config.TIMEZONE;
  return zonedInstant(dayKeyIn(zone, new Date(deps.now), offset), '00:00', zone);
}

/** Today's scheduled US releases and central bank decisions, and the next high-severity one. */
async function events(deps: NotifyDeps): Promise<{ today: DayEvent[]; next?: DayEvent }> {
  const { store, now } = deps;
  // Stale dates are better than none, so a failed refresh still lists what is stored.
  await refreshSchedule(deps).catch(() => undefined);
  const start = midnight(deps);
  const end = midnight(deps, 1);
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

/**
 * What the last trading day's US releases and any Fed decision published, from the agencies or
 * FRED: yesterday's, or Friday's on a Monday.
 */
async function yesterdayResults(deps: NotifyDeps, back: LookBack): Promise<string[]> {
  const time = (at: number) => localTime(deps.config, new Date(at).toISOString());
  const rows = (
    await deps.store.listReleases(midnight(deps, -back.days), midnight(deps) - 1)
  ).filter((r) => r.at < deps.now);
  if (rows.length === 0) {
    return [
      back.days === 1
        ? 'No scheduled US releases yesterday.'
        : `No scheduled US releases on ${back.day}.`,
    ];
  }
  const items: string[] = [];
  for (const row of rows) {
    const label = `${time(row.at)} US ${US_RELEASE_INFO[row.event].label}`;
    try {
      const result = await fetchResult(deps, row);
      items.push(
        result
          ? `${label}${result.period ? ` for ${result.period}` : ''}: ${result.short}.`
          : `${label}: the figures are not on FRED yet.`,
      );
    } catch {
      items.push(`${label}: the figures could not be fetched.`);
    }
  }
  return items;
}

async function newsItems(deps: NotifyDeps, back: LookBack): Promise<string[]> {
  if (!(await loadNewsWatch(deps.store))) {
    return [
      'You are not following any news yet. Add companies or topics under Instructions for Desk Twin.',
    ];
  }
  const recent = (await loadRecent(deps.store)).filter((a) => Date.parse(a.at) >= back.since);
  return recent.length
    ? recent.map((a) => `${a.headline} (${NEWS_SOURCE_LABELS[a.source]})`)
    : [
        `No headlines on what you follow ${back.days === 1 ? 'in the last 24 hours' : `since ${back.day} morning`}.`,
      ];
}

/** The notification body's limit, and WhatsApp's for a template field. */
const SUMMARY_LENGTH = 400;
const WHATSAPP_LENGTH = 200;

interface SummaryPart {
  lead: string;
  items: string[];
}

/** As many whole items as fit in `max` characters, part by part, so nothing is cut mid-word. */
export function fitted(parts: SummaryPart[], max: number): string {
  let out = '';
  for (const { lead, items } of parts) {
    const taken: string[] = [];
    const sentence = (list: string[]) => `${out}${out ? ' ' : ''}${lead}${list.join(', ')}.`;
    for (const item of items) {
      if (sentence([...taken, item]).length > max) break;
      taken.push(item);
    }
    if (taken.length) out = sentence(taken);
  }
  return out;
}

const MAJOR_WORDS = MAJOR_US_RELEASES.filter((e) => e !== 'fomc')
  .map((e) => US_RELEASE_INFO[e].short.replace(/^US /, ''))
  .join(', ')
  .replace(/, ([^,]*)$/, ' and $1');

export interface BuiltBrief {
  briefing: Briefing;
  /** A few lines for the app. */
  summary: string;
  /** The same, shortened to whole items that fit a WhatsApp template field. */
  short: string;
  /** The whole brief as plain text, for email. */
  text: string;
  /** The same as HTML, with big moves and high-severity events in bold, given the email footer. */
  emailHtml: (footer: string) => string;
}

/** "US: …" shows its topic in bold. */
function topicItem(text: string): BriefItem {
  const label = /^[^:]{1,24}:/.exec(text)?.[0];
  return label ? { text, strong: label } : { text };
}

const plain = (list: string[]): BriefItem[] => list.map((text) => ({ text }));

export async function buildBrief(
  deps: NotifyDeps,
  sections: BriefingSection[],
): Promise<BuiltBrief> {
  const { config, now } = deps;
  const time = (at: number) => localTime(config, new Date(at).toISOString());
  const wanted = OFFERED.filter((s) => sections.includes(s));
  const none: { today: DayEvent[]; next?: DayEvent } = { today: [] };
  const noMarkets: Markets = { lines: [], moves: [] };
  const back = lookBack(deps);
  // Release dates are refreshed first, as yesterday's results read the same stored schedule.
  const day = wanted.includes('releases') ? await events(deps) : none;
  const [market, moved, headlines, results, news] = await Promise.all([
    wanted.includes('markets') || wanted.includes('movers')
      ? markets(config, deps.fetch, now)
      : noMarkets,
    wanted.includes('movers')
      ? movers(config, deps.fetch).catch((): Markets => ({
          lines: [{ text: 'The biggest moves could not be fetched.' }],
          moves: [],
        }))
      : noMarkets,
    wanted.includes('headlines')
      ? yesterdayDigest(deps, dayKeyIn(config.TIMEZONE, new Date(now)), digestPeriod(back))
      : [],
    wanted.includes('results') ? yesterdayResults(deps, back) : [],
    wanted.includes('news') ? newsItems(deps, back) : [],
  ]);

  const releaseItems: BriefItem[] = day.today.length
    ? day.today.map((e) => {
        const text = `${time(e.at)} ${e.label}, ${severity(e)} severity.`;
        return e.high ? { text, strong: text } : { text };
      })
    : plain([
        'No US releases and no Fed, Bank of England or ECB decisions today.',
        ...(day.next
          ? [
              `Next high-severity event: ${longDay(deps, day.next.at)}, ${time(day.next.at)} ${day.next.label}.`,
            ]
          : []),
      ]);
  const sp500 = market.moves.find((m) => m.startsWith('S&P 500 '));
  const items: Record<string, BriefItem[]> = {
    markets: market.lines,
    movers: [
      ...(sp500 ? plain([`For comparison, the S&P 500 (SPY) moved ${sp500.slice(8)}.`]) : []),
      ...(moved.lines.length
        ? moved.lines
        : plain([`No US stock priced at $${MIN_MOVER_PRICE} or more moved 1% or more.`])),
    ],
    headlines: headlines.length
      ? headlines.map(topicItem)
      : plain(['The news sources could not be read this morning.']),
    results: plain(results),
    releases: releaseItems,
    news: plain(news),
  };
  const title = `Morning brief, ${longDay(deps, now)}`;
  const shown = wanted.map((id) => ({
    id,
    heading: heading(id, back),
    items: (items[id] ?? [])
      .slice(0, MAX_ITEMS)
      .map((i) => ({ ...i, text: i.text.slice(0, MAX_ITEM_LENGTH) })),
  }));
  const briefing: Briefing = {
    kind: 'morning-brief',
    title,
    generatedAt: new Date(now).toISOString(),
    sections: shown.map((s) => ({ ...s, items: s.items.map((i) => i.text) })),
  };

  const parts: SummaryPart[] = [
    ...(wanted.includes('releases')
      ? [
          day.today.length
            ? {
                lead: 'Today: ',
                items: day.today.map((e) => `${time(e.at)} ${e.label} (${severity(e)})`),
              }
            : { lead: '', items: ['No scheduled releases or central bank decisions today'] },
        ]
      : []),
    ...(wanted.includes('markets') ? [{ lead: 'Last close: ', items: market.moves }] : []),
    { lead: 'Biggest moves: ', items: moved.moves.slice(0, 3) },
  ];

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
    ...(wanted.includes('movers')
      ? [
          `Biggest moves are the largest changes either way from the previous close among US stocks priced at $${MIN_MOVER_PRICE} or more (Alpaca market movers).`,
        ]
      : []),
    ...(wanted.includes('headlines')
      ? [
          `${heading('headlines', back)} covers ${back.days === 1 ? 'the 24 hours to this brief' : `the ${back.days * 24} hours since ${back.day}’s brief`}, from BBC News and Benzinga, summarised by Claude from the stories named.`,
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

  const legend =
    wanted.includes('markets') || wanted.includes('movers') || wanted.includes('releases')
      ? [
          `Bold marks moves of ${BIG_MOVE.fund}% or more (${BIG_MOVE.currency}% for currencies, ${BIG_MOVE.crypto}% for Bitcoin), the biggest moves and high-severity events.`,
        ]
      : [];

  return {
    briefing,
    summary: fitted(parts, SUMMARY_LENGTH) || title,
    short: fitted(parts, WHATSAPP_LENGTH) || title,
    text,
    emailHtml: (footer) =>
      briefHtml({ title, sections: shown, notes: [...legend, ...notes], footer }),
  };
}

/** Sends a built brief on its own channels, quiet hours or not, as it was scheduled. */
async function deliverBrief(
  deps: NotifyDeps,
  schedule: BriefingSchedule,
  built: BuiltBrief,
): Promise<NotificationEvent> {
  const event = await notify(deps, {
    topic: 'briefing',
    urgency: 'info',
    title: built.briefing.title,
    body: built.summary,
    href: '/notifications?tab=briefings',
    channels: schedule.channels,
    scheduled: true,
    emailText: built.text,
    emailHtml: built.emailHtml,
    whatsapp: updateTemplate(deps.config, 'your morning brief', built.short),
  });
  const saved = await loadBrief(deps.store);
  await deps.store.putSetting(
    SCHEDULE_KEY,
    JSON.stringify({ ...saved, lastSentAt: event.createdAt }),
    deps.now,
  );
  return event;
}

/** Builds and sends the brief now, as "Send now" in the app does. */
export async function sendBrief(
  deps: NotifyDeps,
  schedule: BriefingSchedule,
): Promise<NotificationEvent> {
  return deliverBrief(deps, schedule, await buildBrief(deps, schedule.sections));
}

export type BriefOutcome = { status: 'off' } | { status: 'ok'; sent: boolean };

/**
 * Called every minute: sends the day's brief once, at the set time on the chosen days. The brief
 * is built before the day is claimed, so a run cut short by the platform is tried again next
 * minute instead of losing the day's brief.
 */
export async function runBrief(deps: NotifyDeps): Promise<BriefOutcome> {
  const { config, store, now } = deps;
  const schedule = await loadBrief(store);
  if (!schedule.enabled) return { status: 'off' };
  const clock = localClock(config.TIMEZONE, new Date(now));
  const [hours = 0, minutes = 0] = schedule.time.split(':').map(Number);
  const late = clock.minutes - (hours * 60 + minutes);
  const today = dayKeyIn(config.TIMEZONE, new Date(now));
  if (
    !schedule.days.includes(clock.weekday) ||
    late < 0 ||
    late >= LATE_MINUTES ||
    (await store.getSetting(SENT_KEY)) === today
  ) {
    return { status: 'ok', sent: false };
  }
  const built = await buildBrief(deps, schedule.sections);
  const key = `briefing|morning-brief|${today}`;
  if (!(await store.claimReminder(key, now))) return { status: 'ok', sent: false };
  try {
    await deliverBrief(deps, schedule, built);
  } catch (error) {
    // Nothing was recorded, so the next run tries again.
    await store.releaseReminder(key);
    throw error;
  }
  await store.putSetting(SENT_KEY, today, now);
  return { status: 'ok', sent: true };
}
