import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  CENTRAL_BANK_INFO,
  CENTRAL_BANKS,
  localClock,
  NEWS_SOURCE_LABELS,
  newsAlertSchema,
  newsWatchSchema,
  sanitizeText,
  safeUrl,
  TOPIC_ROUTING,
  type CentralBank,
  type NewsAlert,
  type NewsSource,
  type NewsState,
  type NewsWatch,
} from '@twindesk/core';
import { claudeClient, spendAllowance } from './claude';
import type { Config } from './config';
import { FED_FEED, FED_PRESS_RELEASES } from './fomc';
import { logError } from './log';
import { notify } from './notify';
import { getText, parseRss } from './rss';
import { loadPreferences } from './settings';
import type { Store } from './store';
import { updateTemplate } from './whatsapp';

/**
 * News the owner follows. Each run reads the central banks' own feeds and, when set up, the
 * Benzinga headline feed through Alpaca. Headlines about a watched ticker always match; for the
 * owner's topics Claude picks out the ones clearly about them. Items are passed on as
 * published, with their source.
 */

export interface NewsDeps {
  config: Config;
  store: Store;
  fetch: typeof fetch;
  now: number;
}

const WATCH_KEY = 'news-watch';
const CURSOR_KEY = 'news-cursor';
const RECENT_KEY = 'news-recent';
const FILTER_USAGE_KEY = 'claude-filter-usage';
/** At most about 1,000 small requests a day: pennies, even on a busy news day. */
const FILTER_DAILY_LIMIT = 1000;
/** A burst beyond this in one minute is cut short rather than flooding the phone. */
const MAX_ALERTS_PER_RUN = 10;
const RECENT_LIMIT = 30;
/** How far back the first run looks, and how much consecutive runs overlap. */
const LOOK_BACK_MS = 2 * 60_000;
/** Feed items older than this are never sent, even if the feed only shows them now. */
const MAX_AGE_MS = 24 * 3_600_000;

const ALPACA_NEWS = 'https://data.alpaca.markets/v1beta1/news';

interface BankFeed {
  url: string;
  prefix: string;
  /** Only rate decisions and statements; the banks' feeds carry much else. */
  keep: RegExp;
}

const BANK_FEEDS: Record<CentralBank, BankFeed> = {
  fed: { url: FED_FEED, prefix: FED_PRESS_RELEASES, keep: /FOMC|monetary policy|discount rate/i },
  boe: {
    url: 'https://www.bankofengland.co.uk/rss/news',
    prefix: 'https://www.bankofengland.co.uk/',
    keep: /\bbank rate\b|monetary policy summary/i,
  },
  ecb: {
    url: 'https://www.ecb.europa.eu/rss/press.html',
    prefix: 'https://www.ecb.europa.eu/',
    keep: /monetary policy (?:decisions|statement)|account of the monetary policy meeting/i,
  },
};

interface Candidate {
  key: string;
  source: NewsSource;
  headline: string;
  summary: string;
  url?: string;
  at: number;
  symbols: string[];
}

// ---------------------------------------------------------------------------
// The watch
// ---------------------------------------------------------------------------

/** Tickers in capitals, each topic and bank once. */
export function cleanNewsWatch(watch: NewsWatch): NewsWatch {
  const topics = new Map<string, string>();
  for (const t of watch.topics) {
    const clean = sanitizeText(t, { maxLength: 60, multiline: false });
    if (clean.length >= 2 && !topics.has(clean.toLowerCase()))
      topics.set(clean.toLowerCase(), clean);
  }
  return {
    tickers: [...new Set(watch.tickers.map((t) => t.toUpperCase()))].slice(0, 25),
    topics: [...topics.values()].slice(0, 10),
    centralBanks: CENTRAL_BANKS.filter((b) => watch.centralBanks.includes(b)),
  };
}

export async function loadNewsWatch(store: Store): Promise<NewsWatch | null> {
  const raw = await store.getSetting(WATCH_KEY);
  if (!raw) return null;
  try {
    const parsed = newsWatchSchema.nullable().safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveNewsWatch(store: Store, watch: NewsWatch | null, at: number) {
  await store.putSetting(WATCH_KEY, JSON.stringify(watch ? cleanNewsWatch(watch) : null), at);
}

async function loadRecent(store: Store): Promise<NewsAlert[]> {
  try {
    const parsed = z
      .array(newsAlertSchema)
      .safeParse(JSON.parse((await store.getSetting(RECENT_KEY)) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function newsState(deps: NewsDeps): Promise<NewsState> {
  const { config, store } = deps;
  const preferences = await loadPreferences(store);
  return {
    claude: Boolean(config.ANTHROPIC_API_KEY),
    headlines: Boolean(config.ALPACA_KEY_ID && config.ALPACA_SECRET_KEY),
    watch: await loadNewsWatch(store),
    channels: preferences.routing.news,
    recent: await loadRecent(store),
  };
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

async function bankItems(bank: CentralBank, fetchFn: typeof fetch): Promise<Candidate[]> {
  const feed = BANK_FEEDS[bank];
  return parseRss(await getText(feed.url, fetchFn), feed.prefix)
    .filter((i) => feed.keep.test(i.title))
    .map((i) => ({
      key: `news|${bank}|${i.id}`,
      source: bank,
      headline: i.title,
      summary: '',
      url: i.link,
      at: i.at,
      symbols: [],
    }));
}

const RATINGS =
  'strong buy|buy|sell|hold|neutral|overweight|underweight|outperform|underperform|equal[- ]weight|market perform|sector perform|peer perform|in-line|accumulate|reduce';

/**
 * Analyst ratings and price targets are other firms' recommendations ("Maintains Overweight on
 * X, Raises Price Target to $250"). Desk Twin passes on no advice, so these are left out.
 */
export const ANALYST_RATING = new RegExp(
  `\\b(?:price targets?|target prices?)\\b|\\b(?:maintains|reiterates|upgrades|downgrades|initiates|assumes|resumes)\\b.*\\b(?:${RATINGS})\\b`,
  'i',
);

const alpacaSchema = z.object({
  news: z
    .array(
      z.object({
        id: z.number().int(),
        headline: z.string().min(1).max(1000),
        summary: z.string().max(5000).optional().default(''),
        url: z.string().max(2000).nullable().optional(),
        created_at: z.string(),
        symbols: z.array(z.string().max(20)).max(100).optional().default([]),
      }),
    )
    .max(50),
});

/** Benzinga headlines through Alpaca's market data API, oldest first. */
async function headlineItems(
  config: Config,
  since: number,
  fetchFn: typeof fetch,
): Promise<Candidate[]> {
  if (!config.ALPACA_KEY_ID || !config.ALPACA_SECRET_KEY) return [];
  const url = new URL(ALPACA_NEWS);
  url.searchParams.set('start', new Date(since).toISOString());
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('limit', '50');
  const response = await fetchFn(url, {
    headers: {
      Accept: 'application/json',
      'APCA-API-KEY-ID': config.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': config.ALPACA_SECRET_KEY,
    },
  });
  if (!response.ok) throw new Error(`Alpaca news returned ${response.status}`);
  const parsed = alpacaSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('Alpaca news sent something unexpected');
  return parsed.data.news.flatMap((n) => {
    const at = Date.parse(n.created_at);
    if (Number.isNaN(at) || ANALYST_RATING.test(n.headline)) return [];
    return [
      {
        key: `news|benzinga|${n.id}`,
        source: 'benzinga' as const,
        headline: sanitizeText(n.headline, { maxLength: 300, multiline: false }),
        summary: sanitizeText(n.summary, { maxLength: 300, multiline: false }),
        url: safeUrl(n.url, { allowRelative: false }) ?? undefined,
        at,
        symbols: n.symbols.map((s) => s.toUpperCase()),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Matching topics
// ---------------------------------------------------------------------------

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Without Claude: a headline matches a topic when it has every word of it. */
export function wordMatches(items: Candidate[], topics: string[]): Map<number, string> {
  const found = new Map<number, string>();
  const patterns = topics.map((topic) => ({
    topic,
    words: topic
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3)
      .map((w) => new RegExp(`\\b${escape(w.length > 4 ? w.replace(/s$/, '') : w)}`, 'iu')),
  }));
  items.forEach((item, index) => {
    const text = `${item.headline} ${item.summary}`;
    const hit = patterns.find((p) => p.words.length > 0 && p.words.every((w) => w.test(text)));
    if (hit) found.set(index, hit.topic);
  });
  return found;
}

const filterSchema = z.object({
  matches: z.array(z.object({ number: z.number().int(), topic: z.string(), quote: z.string() })),
});

const FILTER_SYSTEM = `You sort news headlines for one trader. You get their topics and a numbered list of headlines.

A headline matches a topic only when the topic is what the headline is mainly about. Sharing an industry, naming a related company or product, or a loose link is not enough: an AI app is not about "AI chips", and a story that mentions a drink is not about "oil prices". Most headlines match no topic, and an empty list is the usual answer.

For each match, give the headline's number, the topic exactly as written in the list, and the first five words of the headline copied exactly, so the match can be checked.`;

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Whether a headline starts with the words Claude quoted (its first three are enough). */
function startsWith(headline: string, quote: string): boolean {
  const quoted = words(quote).slice(0, 3);
  const start = words(headline).slice(0, quoted.length);
  return quoted.length > 0 && quoted.every((w, i) => w === start[i]);
}

/** Claude picks the headlines about the owner's topics; words are matched if it cannot. */
async function topicMatches(
  deps: NewsDeps,
  items: Candidate[],
  topics: string[],
): Promise<Map<number, string>> {
  const { config, store, fetch, now } = deps;
  const client = claudeClient(config, fetch, 20_000);
  if (!client || !(await spendAllowance(store, FILTER_USAGE_KEY, FILTER_DAILY_LIMIT, now))) {
    return wordMatches(items, topics);
  }
  try {
    const response = await client.messages.create({
      model: config.CLAUDE_FILTER_MODEL,
      max_tokens: 1000,
      thinking: { type: 'disabled' },
      system: FILTER_SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(filterSchema) },
      messages: [
        {
          role: 'user',
          content: `Topics:\n${topics.map((t) => `- ${t}`).join('\n')}\n\nHeadlines:\n${items
            .map(
              (h, i) =>
                `${i + 1}. ${h.headline}${h.summary ? ` (${h.summary.slice(0, 200)})` : ''}`,
            )
            .join('\n')}`,
        },
      ],
    });
    if (response.stop_reason !== 'end_turn') return wordMatches(items, topics);
    const text = response.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = filterSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return wordMatches(items, topics);
    const known = new Map(topics.map((t) => [t.toLowerCase(), t]));
    const found = new Map<number, string>();
    for (const m of parsed.data.matches) {
      const topic = known.get(m.topic.trim().toLowerCase());
      if (!topic) continue;
      // The quote must agree with the number; a miscounted number is found by its quote.
      const index = startsWith(items[m.number - 1]?.headline ?? '', m.quote)
        ? m.number - 1
        : items.findIndex((item) => startsWith(item.headline, m.quote));
      if (index >= 0) found.set(index, topic);
    }
    return found;
  } catch (error) {
    logError('news filter', error);
    return wordMatches(items, topics);
  }
}

// ---------------------------------------------------------------------------
// The scheduled run
// ---------------------------------------------------------------------------

export type NewsOutcome =
  { status: 'off' } | { status: 'ok'; checked: number; sent: number; error?: string };

/** Weekdays from 06:00 to 21:00 in London the banks' feeds are read every minute; otherwise every 15. */
function busyHours(config: Config, now: number): boolean {
  const clock = localClock(config.TIMEZONE, new Date(now));
  return (
    clock.weekday >= 1 && clock.weekday <= 5 && clock.minutes >= 6 * 60 && clock.minutes < 21 * 60
  );
}

export async function runNews(deps: NewsDeps): Promise<NewsOutcome> {
  const { config, store, fetch, now } = deps;
  const watch = await loadNewsWatch(store);
  if (!watch) return { status: 'off' };

  let cursor: Partial<Record<NewsSource, number>> = {};
  try {
    cursor = JSON.parse((await store.getSetting(CURSOR_KEY)) ?? '{}') as typeof cursor;
  } catch {
    cursor = {};
  }
  let firstError: string | undefined;
  const fresh: Candidate[] = [];

  const readBanks = busyHours(config, now) || new Date(now).getUTCMinutes() % 15 === 0;
  for (const bank of readBanks ? watch.centralBanks : []) {
    try {
      const items = (await bankItems(bank, fetch)).filter((i) => now - i.at <= MAX_AGE_MS);
      if (cursor[bank] === undefined) {
        // The first read only notes what is already there, so nothing old arrives at once.
        for (const item of items) await store.claimReminder(item.key, now);
      } else {
        fresh.push(...items);
      }
      cursor[bank] = now;
    } catch (error) {
      firstError ??= `${bank}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (watch.tickers.length > 0 || watch.topics.length > 0) {
    try {
      const since =
        Math.max(cursor.benzinga ?? now - LOOK_BACK_MS, now - MAX_AGE_MS) - LOOK_BACK_MS;
      fresh.push(...(await headlineItems(config, since, fetch)));
      cursor.benzinga = now;
    } catch (error) {
      firstError ??= `headlines: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  await store.putSetting(CURSOR_KEY, JSON.stringify(cursor), now);

  // Each item is looked at once, matched or not.
  const unseen: Candidate[] = [];
  for (const item of fresh) if (await store.claimReminder(item.key, now)) unseen.push(item);

  const tickers = new Set(watch.tickers);
  const matched: Array<{ item: Candidate; match: string }> = [];
  const rest: Candidate[] = [];
  for (const item of unseen) {
    if (item.source !== 'benzinga') {
      matched.push({ item, match: CENTRAL_BANK_INFO[item.source].label });
      continue;
    }
    const hits = item.symbols.filter((s) => tickers.has(s));
    if (hits.length > 0) matched.push({ item, match: hits.slice(0, 3).join(', ') });
    else rest.push(item);
  }
  if (watch.topics.length > 0 && rest.length > 0) {
    for (const [index, topic] of await topicMatches(deps, rest, watch.topics)) {
      const item = rest[index];
      if (item) matched.push({ item, match: topic });
    }
  }

  const alerts: NewsAlert[] = [];
  for (const { item, match } of matched
    .sort((a, b) => a.item.at - b.item.at)
    .slice(0, MAX_ALERTS_PER_RUN)) {
    const label = NEWS_SOURCE_LABELS[item.source];
    try {
      await notify(deps, {
        topic: 'news',
        urgency: TOPIC_ROUTING.news.urgency,
        title: item.headline.slice(0, 120),
        body: `${item.headline.length > 120 ? `${item.headline} ` : ''}Matched: ${match}. Source: ${label}.${item.url ? ` ${item.url}` : ''}`,
        href: '/notifications',
        whatsapp: updateTemplate(config, match, item.headline),
      });
      alerts.push({
        id: item.key.slice(0, 120),
        source: item.source,
        headline: item.headline,
        ...(item.url ? { url: item.url.slice(0, 1000) } : {}),
        at: new Date(item.at).toISOString(),
        match: match.slice(0, 80),
      });
    } catch (error) {
      firstError ??= error instanceof Error ? error.message : String(error);
    }
  }
  if (alerts.length > 0) {
    const recent = [...alerts.reverse(), ...(await loadRecent(store))].slice(0, RECENT_LIMIT);
    await store.putSetting(RECENT_KEY, JSON.stringify(recent), now);
  }
  return { status: 'ok', checked: unseen.length, sent: alerts.length, error: firstError };
}
