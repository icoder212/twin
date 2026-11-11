import {
  US_RELEASE_INFO,
  dayKeyIn,
  economicWatchSchema,
  formatRelative,
  localClock,
  TOPIC_ROUTING,
  type UsRelease,
  type EconomicRelease,
  type EconomicState,
  type EconomicWatch,
} from '@twindesk/core';
import { BLS_EVENTS, blsResult } from './bls';
import type { Config } from './config';
import { FOMC_DECISION_DAYS, FOMC_TIME, fomcResult } from './fomc';
import { latestObservations, releaseDates, seriesUpdatedAt, type FredUnits } from './fred';
import { formatValue, periodLabel, type Format, type Period, type ReleaseResult } from './figures';
import { localTime, notify } from './notify';
import { loadPreferences } from './settings';
import type { ReleaseRow, Store } from './store';
import { reminderTemplate, updateTemplate } from './whatsapp';

export interface EconomicDeps {
  config: Config;
  store: Store;
  fetch: typeof fetch;
  now: number;
}

const WATCH_KEY = 'economic-watch';
const SCHEDULE_KEY = 'economic-schedule-at';
const NEW_YORK = 'America/New_York';
const DAY_MS = 86_400_000;
const REFRESH_MS = 6 * 3_600_000;
/** After a failed fetch, try again sooner than the usual refresh. */
const RETRY_MS = 15 * 60_000;
const LOOKAHEAD_DAYS = 60;
/**
 * How long to ask the agency itself; after that only FRED is asked, which keeps within BLS's
 * daily allowance even if a release is late.
 */
const DIRECT_WINDOW_MS = 30 * 60_000;
/** How long after a release to keep looking for its figures. */
const RESULTS_WINDOW_MS = 6 * 3_600_000;

interface SeriesSpec {
  id: string;
  units: FredUnits;
  format: Format;
  /** In the app and email: "All items, on the month". */
  label: string;
  /** On WhatsApp, where space is short: "m/m". */
  short: string;
}

interface FredEvent {
  releaseId: number;
  /** The agency's release time, New York clock. */
  time: string;
  period: Period;
  series: SeriesSpec[];
}

/** FRED release ids and the series each one publishes, as the agencies report them. */
const FRED_EVENTS: Record<Exclude<UsRelease, 'fomc'>, FredEvent> = {
  cpi: {
    releaseId: 10,
    time: '08:30',
    period: 'month',
    series: [
      {
        id: 'CPIAUCSL',
        units: 'pch',
        format: 'signed-percent',
        label: 'All items, on the month',
        short: 'm/m',
      },
      {
        id: 'CPIAUCNS',
        units: 'pc1',
        format: 'percent',
        label: 'All items, on the year',
        short: 'y/y',
      },
      {
        id: 'CPILFESL',
        units: 'pch',
        format: 'signed-percent',
        label: 'Excluding food and energy, on the month',
        short: 'core m/m',
      },
      {
        id: 'CPILFENS',
        units: 'pc1',
        format: 'percent',
        label: 'Excluding food and energy, on the year',
        short: 'core y/y',
      },
    ],
  },
  jobs: {
    releaseId: 50,
    time: '08:30',
    period: 'month',
    series: [
      { id: 'PAYEMS', units: 'chg', format: 'jobs', label: 'Non-farm payrolls', short: 'payrolls' },
      {
        id: 'UNRATE',
        units: 'lin',
        format: 'percent',
        label: 'Unemployment rate',
        short: 'unemployment',
      },
      {
        id: 'CES0500000003',
        units: 'pch',
        format: 'signed-percent',
        label: 'Average hourly earnings, on the month',
        short: 'earnings m/m',
      },
    ],
  },
  gdp: {
    releaseId: 53,
    time: '08:30',
    period: 'quarter',
    series: [
      {
        id: 'A191RL1Q225SBEA',
        units: 'lin',
        format: 'percent',
        label: 'Real GDP, annualised quarterly rate',
        short: 'annualised',
      },
    ],
  },
  pce: {
    releaseId: 54,
    time: '08:30',
    period: 'month',
    series: [
      {
        id: 'PCEPI',
        units: 'pch',
        format: 'signed-percent',
        label: 'PCE prices, on the month',
        short: 'm/m',
      },
      {
        id: 'PCEPI',
        units: 'pc1',
        format: 'percent',
        label: 'PCE prices, on the year',
        short: 'y/y',
      },
      {
        id: 'PCEPILFE',
        units: 'pch',
        format: 'signed-percent',
        label: 'Excluding food and energy, on the month',
        short: 'core m/m',
      },
      {
        id: 'PCEPILFE',
        units: 'pc1',
        format: 'percent',
        label: 'Excluding food and energy, on the year',
        short: 'core y/y',
      },
    ],
  },
  'retail-sales': {
    releaseId: 9,
    time: '08:30',
    period: 'month',
    series: [
      {
        id: 'RSAFS',
        units: 'pch',
        format: 'signed-percent',
        label: 'Retail sales, on the month',
        short: 'm/m',
      },
      {
        id: 'RSFSXMV',
        units: 'pch',
        format: 'signed-percent',
        label: 'Excluding motor vehicles and parts, on the month',
        short: 'ex autos m/m',
      },
    ],
  },
  ppi: {
    releaseId: 46,
    time: '08:30',
    period: 'month',
    series: [
      {
        id: 'PPIFIS',
        units: 'pch',
        format: 'signed-percent',
        label: 'Final demand, on the month',
        short: 'm/m',
      },
    ],
  },
  'jobless-claims': {
    releaseId: 180,
    time: '08:30',
    period: 'week',
    series: [
      {
        id: 'ICSA',
        units: 'lin',
        format: 'count',
        label: 'Initial claims',
        short: 'initial claims',
      },
    ],
  },
  jolts: {
    releaseId: 192,
    time: '10:00',
    period: 'month',
    series: [
      { id: 'JTSJOL', units: 'lin', format: 'millions', label: 'Job openings', short: 'openings' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------

/** The zone's offset from UTC at a moment, read back from its wall clock. */
function offsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wall - Math.floor(at / 1000) * 1000;
}

/** A wall-clock time in a zone, as an instant: 08:30 in New York is 13:30 UTC in winter. */
export function zonedInstant(day: string, time: string, timeZone: string): number {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let at = wall;
  // Twice, so a guess on the far side of a clock change settles.
  for (let i = 0; i < 2; i += 1) at = wall - offsetMs(at, timeZone);
  return at;
}

/** The calendar day in New York, offset by whole days. */
function newYorkDay(at: number, offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NEW_YORK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at + offsetDays * DAY_MS));
}

// ---------------------------------------------------------------------------
// The watch
// ---------------------------------------------------------------------------

export async function loadWatch(store: Store): Promise<EconomicWatch | null> {
  const raw = await store.getSetting(WATCH_KEY);
  if (!raw) return null;
  try {
    const parsed = economicWatchSchema.nullable().safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Saves the watch (null stops it) and fetches its release dates straight away. */
export async function saveWatch(deps: EconomicDeps, watch: EconomicWatch | null): Promise<void> {
  const clean = watch ? { ...watch, events: [...new Set(watch.events)] } : null;
  await deps.store.putSetting(WATCH_KEY, JSON.stringify(clean), deps.now);
  if (clean) await refreshSchedule(deps, clean, true);
}

/** The scheduled releases for the events on the watch, refreshed a few times a day. */
export async function refreshSchedule(
  deps: EconomicDeps,
  watch: EconomicWatch,
  force = false,
): Promise<string | undefined> {
  const { config, store, fetch, now } = deps;
  const last = Number((await store.getSetting(SCHEDULE_KEY)) ?? 0);
  if (!force && now - last < REFRESH_MS) return undefined;

  const from = newYorkDay(now, -1);
  const to = newYorkDay(now, LOOKAHEAD_DAYS);
  const rows: Array<Pick<ReleaseRow, 'key' | 'event' | 'releaseDate' | 'at'>> = [];
  let problem: string | undefined;
  for (const event of watch.events) {
    if (event === 'fomc') {
      for (const day of FOMC_DECISION_DAYS.filter((d) => d >= from && d <= to)) {
        rows.push({
          key: `fomc|${day}`,
          event,
          releaseDate: day,
          at: zonedInstant(day, FOMC_TIME, NEW_YORK),
        });
      }
      continue;
    }
    if (!config.FRED_API_KEY) continue;
    const spec = FRED_EVENTS[event];
    try {
      for (const day of await releaseDates(config.FRED_API_KEY, spec.releaseId, from, to, fetch)) {
        rows.push({
          key: `${event}|${day}`,
          event,
          releaseDate: day,
          at: zonedInstant(day, spec.time, NEW_YORK),
        });
      }
    } catch (error) {
      problem ??= error instanceof Error ? error.message : String(error);
    }
  }
  await store.upsertReleases(rows);
  await store.putSetting(SCHEDULE_KEY, String(problem ? now - REFRESH_MS + RETRY_MS : now), now);
  return problem;
}

// ---------------------------------------------------------------------------
// Published figures
// ---------------------------------------------------------------------------

/**
 * The figures for a release once published, or null while they are not. The agency comes first
 * (the Fed, BLS); FRED, which copies the agencies' data within the hour, covers the rest and
 * anything the agency check missed.
 */
export async function fetchResult(
  deps: EconomicDeps,
  row: ReleaseRow,
): Promise<ReleaseResult | null> {
  const { config, fetch, now } = deps;
  if (row.event === 'fomc') {
    const decision = await fomcResult(row.at, fetch);
    return decision ? { period: '', ...decision } : null;
  }
  if (config.BLS_API_KEY && BLS_EVENTS[row.event] && now - row.at <= DIRECT_WINDOW_MS) {
    try {
      const direct = await blsResult(config.BLS_API_KEY, row.event, row.at, fetch);
      if (direct) return direct;
    } catch (error) {
      if (!config.FRED_API_KEY) throw error;
    }
  }
  if (!config.FRED_API_KEY) return null;
  const spec = FRED_EVENTS[row.event];
  const [first] = spec.series;
  if (!first) return null;
  const updated = await seriesUpdatedAt(config.FRED_API_KEY, first.id, fetch);
  if (updated === null || updated < row.at) return null;

  const lines: string[] = [];
  const shorts: string[] = [];
  // Every line is for the same period as the first one found; a series FRED has not updated
  // yet is left out rather than shown with last month's figure.
  let periodDate = '';
  for (const series of spec.series) {
    const [latest, previous] = await latestObservations(
      config.FRED_API_KEY,
      series.id,
      series.units,
      fetch,
    );
    if (!latest || (periodDate && latest.date !== periodDate)) continue;
    periodDate ||= latest.date;
    const value = formatValue(latest.value, series.format);
    const before = previous ? ` (previously ${formatValue(previous.value, series.format)})` : '';
    lines.push(`${series.label}: ${value}${before}`);
    shorts.push(`${series.short} ${value}`);
  }
  if (lines.length === 0) return null;
  return {
    period: periodLabel(periodDate, spec.period),
    body: `${lines.join('. ')}.`,
    short: shorts.join(', '),
    via: 'FRED',
  };
}

// ---------------------------------------------------------------------------
// The scheduled run
// ---------------------------------------------------------------------------

export type EconomicOutcome =
  | { status: 'off' }
  | { status: 'ok'; summary: boolean; reminded: number; published: number; error?: string };

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Once a day at the chosen time, the watched releases due tomorrow on the owner's clock. A day
 * with none sends nothing. A watch saved after the time sends that day's summary straight away.
 */
export async function sendSummary(deps: EconomicDeps, watch: EconomicWatch): Promise<boolean> {
  const { config, store, now } = deps;
  if (!watch.summaryAt) return false;
  const [hours = 0, minutes = 0] = watch.summaryAt.split(':').map(Number);
  if (localClock(config.TIMEZONE, new Date(now)).minutes < hours * 60 + minutes) return false;

  const key = `econ-summary|${dayKeyIn(config.TIMEZONE, new Date(now))}`;
  if (!(await store.claimReminder(key, now))) return false;
  const tomorrow = dayKeyIn(config.TIMEZONE, new Date(now), 1);
  const watched = new Set(watch.events);
  const due = (await store.listReleases(now, now + 2 * DAY_MS)).filter(
    (r) => watched.has(r.event) && dayKeyIn(config.TIMEZONE, new Date(r.at)) === tomorrow,
  );
  if (due.length === 0) return false;

  const at = (r: ReleaseRow) => localTime(config, new Date(r.at).toISOString());
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(due[0]?.at ?? now));
  try {
    await notify(deps, {
      topic: 'release',
      urgency: TOPIC_ROUTING.release.urgency,
      title: `Tomorrow, ${day}: ${due.length} US release${due.length === 1 ? '' : 's'}`,
      body: `${due.map((r) => `${at(r)} ${US_RELEASE_INFO[r.event].label}`).join('. ')}.`,
      href: '/notifications',
      whatsapp: updateTemplate(
        config,
        `tomorrow's US releases`,
        due.map((r) => `${at(r)} ${US_RELEASE_INFO[r.event].short}`).join(', '),
      ),
    });
  } catch (error) {
    // Nothing was recorded, so the next run tries again.
    await store.releaseReminder(key);
    throw error;
  }
  return true;
}

/** One run: send due reminders and post figures that have arrived. */
export async function runEconomic(deps: EconomicDeps): Promise<EconomicOutcome> {
  const { config, store, now } = deps;
  const watch = await loadWatch(store);
  if (!watch) return { status: 'off' };

  let firstError = await refreshSchedule(deps, watch).catch(failure);
  const summary = await sendSummary(deps, watch).catch((error: unknown) => {
    firstError ??= `summary: ${failure(error)}`;
    return false;
  });
  const watched = new Set(watch.events);
  const rows = await store.listReleases(
    now - RESULTS_WINDOW_MS - 3_600_000,
    now + (watch.remindMinutes + 1) * 60_000,
  );
  const loc = { language: 'en-GB', timezone: config.TIMEZONE, currency: 'GBP' };
  let reminded = 0;
  let published = 0;

  for (const row of rows.filter((r) => watched.has(r.event))) {
    const info = US_RELEASE_INFO[row.event];
    const iso = new Date(row.at).toISOString();
    const time = localTime(config, iso);
    const startsIn = row.at - now;

    if (watch.remindMinutes > 0 && startsIn > 0 && startsIn <= watch.remindMinutes * 60_000) {
      if (await store.claimReleaseReminder(row.key, now)) {
        try {
          await notify(deps, {
            topic: 'release',
            urgency: TOPIC_ROUTING.release.urgency,
            title: `${time}: ${info.label}`,
            body: `Due ${formatRelative(iso, loc, now)}. Published by the ${info.source}.`,
            href: '/notifications',
            whatsapp: reminderTemplate(config, `${info.short} release`, time),
          });
          reminded += 1;
        } catch (error) {
          // Nothing was recorded, so the next run tries again.
          await store.unclaimReleaseReminder(row.key);
          firstError ??= failure(error);
        }
      }
      continue;
    }

    if (!watch.results || startsIn > 0 || row.resultAt !== null || row.missedAt !== null) continue;
    if (-startsIn > RESULTS_WINDOW_MS) {
      await store.markReleaseMissed(row.key, now);
      continue;
    }
    try {
      const result = await fetchResult(deps, row);
      if (!result || !(await store.claimReleaseResult(row.key, now, result.body))) continue;
      const subject = result.period ? `${info.short} for ${result.period}` : info.short;
      try {
        await notify(deps, {
          topic: 'release',
          urgency: TOPIC_ROUTING.release.urgency,
          title: `${subject}: published`,
          body: `${result.body} Source: ${info.source}${result.via ? `, via ${result.via}` : ''}.`,
          href: '/notifications',
          whatsapp: updateTemplate(config, subject, result.short),
        });
        published += 1;
      } catch (error) {
        await store.unclaimReleaseResult(row.key);
        throw error;
      }
    } catch (error) {
      firstError ??= `${row.event}: ${failure(error)}`;
    }
  }
  return { status: 'ok', summary, reminded, published, error: firstError };
}

// ---------------------------------------------------------------------------
// What the app shows
// ---------------------------------------------------------------------------

const SHOWN = 12;

/** The watched releases from yesterday on, for the app. */
export async function upcomingReleases(
  deps: EconomicDeps,
  watch: EconomicWatch | null,
): Promise<EconomicRelease[]> {
  if (!watch) return [];
  const { store, now } = deps;
  const watched = new Set(watch.events);
  const rows = await store.listReleases(now - DAY_MS, now + LOOKAHEAD_DAYS * DAY_MS);
  return rows
    .filter((r) => watched.has(r.event))
    .slice(0, SHOWN)
    .map((r) => ({
      key: r.key,
      event: r.event,
      at: new Date(r.at).toISOString(),
      status:
        r.resultAt !== null
          ? 'published'
          : r.missedAt !== null
            ? 'missed'
            : r.at > now
              ? 'upcoming'
              : watch.results
                ? 'waiting'
                : 'past',
      ...(r.details ? { details: r.details.slice(0, 400) } : {}),
    }));
}

/** Everything the app's instructions card shows. */
export async function economicState(deps: EconomicDeps): Promise<EconomicState> {
  const { config, store } = deps;
  const watch = await loadWatch(store);
  const preferences = await loadPreferences(store);
  return {
    claude: Boolean(config.ANTHROPIC_API_KEY),
    fred: Boolean(config.FRED_API_KEY),
    watch,
    channels: preferences.routing.release,
    upcoming: await upcomingReleases(deps, watch),
  };
}
