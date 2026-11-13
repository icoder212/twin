import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { runAdviceChecks } from '@twindesk/core';
import { claudeClient, spendAllowance } from './claude';
import type { Config } from './config';
import { logError } from './log';
import { ANALYST_RATING } from './news';
import type { NotifyDeps } from './notify';
import { getText, parseRss } from './rss';

/**
 * "Yesterday in the news" for the morning brief: the last 24 hours on the US, wars and conflicts,
 * oil and gold. Stories come from the BBC's world, US and business feeds and from Benzinga's
 * market-wide items (those tagged with the index, oil and gold funds), through Alpaca. Claude's
 * small model writes a few short lines using only those stories, citing them by number. A line
 * without a valid citation, or that fails the advice checks, is dropped. Without Claude the
 * headlines are listed as published.
 */

export const DIGEST_TOPICS = ['us', 'war', 'oil', 'gold'] as const;
type DigestTopic = (typeof DIGEST_TOPICS)[number];

const TOPIC_NAMES: Record<DigestTopic, string> = {
  us: 'US',
  war: 'War and conflict',
  oil: 'Oil',
  gold: 'Gold',
};

const BBC_FEEDS = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
  'https://feeds.bbci.co.uk/news/business/rss.xml',
];
const ALPACA_NEWS = 'https://data.alpaca.markets/v1beta1/news';
const MARKET_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'USO', 'GLD'];
const ALPACA_PAGES = 2;
const DAY_MS = 86_400_000;
const MAX_STORIES = 160;
const PER_TOPIC = 3;
/** Claude's sentence; with the topic and source around it, the line stays within 240. */
const MAX_LINE = 210;
const MAX_ITEM = 240;
/** One digest a day is cached; this bounds retries and previews. */
const DAILY_LIMIT = 6;
const USAGE_KEY = 'claude-digest-usage';
const CACHE_KEY = 'brief-digest';

export interface Story {
  source: string;
  title: string;
  summary: string;
  at: number;
  symbols: string[];
  /** Which list it came from, for the listing used without Claude. */
  feed: 'bbc-world' | 'bbc-us' | 'bbc-business' | 'benzinga';
}

const alpacaSchema = z.object({
  news: z.array(
    z.object({
      headline: z.string().min(1).max(1000),
      summary: z.string().max(5000).optional().default(''),
      created_at: z.string(),
      symbols: z.array(z.string().max(20)).max(100).optional().default([]),
    }),
  ),
  next_page_token: z.string().nullable().optional(),
});

async function benzinga(config: Config, fetchFn: typeof fetch, since: number): Promise<Story[]> {
  if (!config.ALPACA_KEY_ID || !config.ALPACA_SECRET_KEY) return [];
  const stories: Story[] = [];
  let token: string | null | undefined;
  for (let page = 0; page < ALPACA_PAGES; page += 1) {
    const url = new URL(ALPACA_NEWS);
    url.searchParams.set('start', new Date(since).toISOString());
    url.searchParams.set('symbols', MARKET_SYMBOLS.join(','));
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('limit', '50');
    if (token) url.searchParams.set('page_token', token);
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
    for (const n of parsed.data.news) {
      const at = Date.parse(n.created_at);
      if (Number.isNaN(at) || ANALYST_RATING.test(n.headline)) continue;
      stories.push({
        source: 'Benzinga',
        title: n.headline.slice(0, 300),
        summary: n.summary.slice(0, 300),
        at,
        symbols: n.symbols,
        feed: 'benzinga',
      });
    }
    token = parsed.data.next_page_token;
    if (!token) break;
  }
  return stories;
}

async function bbc(fetchFn: typeof fetch, since: number): Promise<Story[]> {
  const feeds = ['bbc-world', 'bbc-us', 'bbc-business'] as const;
  const read = await Promise.allSettled(BBC_FEEDS.map((url) => getText(url, fetchFn)));
  return read.flatMap((result, i) =>
    result.status === 'fulfilled'
      ? parseRss(result.value, 'https://www.bbc.')
          .filter((item) => item.at >= since)
          .map((item) => ({
            source: 'BBC News',
            title: item.title,
            summary: item.summary ?? '',
            at: item.at,
            symbols: [],
            feed: feeds[i] ?? 'bbc-world',
          }))
      : [],
  );
}

/** The last 24 hours of stories, newest first, each headline once. */
export async function collectStories(deps: NotifyDeps): Promise<Story[]> {
  const since = deps.now - DAY_MS;
  const [fromBbc, fromBenzinga] = await Promise.allSettled([
    bbc(deps.fetch, since),
    benzinga(deps.config, deps.fetch, since),
  ]);
  if (fromBenzinga.status === 'rejected') logError('digest benzinga', fromBenzinga.reason);
  const all = [
    ...(fromBbc.status === 'fulfilled' ? fromBbc.value : []),
    ...(fromBenzinga.status === 'fulfilled' ? fromBenzinga.value : []),
  ].sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  return all
    .filter((s) => {
      const key = s.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_STORIES);
}

const WAR_WORDS =
  /\b(?:war|military|missiles?|drones?|troops|ceasefire|invasion|attacks?|air ?strikes?|ukraine|russia|israel|gaza|iran|nato|peace talks?)\b/i;
const OIL_WORDS = /\b(?:oil|crude|brent|wti|opec\+?)\b/i;
const GOLD_WORDS = /\b(?:gold|bullion)\b/i;

/** The headlines as published, a few per topic, when Claude cannot write the digest. */
export function listedDigest(stories: Story[]): string[] {
  const used = new Set<Story>();
  const pick = (topic: DigestTopic, test: (s: Story) => boolean) =>
    stories
      .filter((s) => !used.has(s) && test(s))
      .slice(0, PER_TOPIC)
      .map((s) => {
        used.add(s);
        return `${TOPIC_NAMES[topic]}: ${s.title} (${s.source})`;
      });
  const text = (s: Story) => `${s.title} ${s.summary}`;
  return [
    ...pick('war', (s) => s.feed !== 'benzinga' && WAR_WORDS.test(text(s))),
    ...pick('oil', (s) => s.symbols.includes('USO') || OIL_WORDS.test(s.title)),
    ...pick('gold', (s) => s.symbols.includes('GLD') || GOLD_WORDS.test(s.title)),
    ...pick('us', (s) => s.feed === 'bbc-us' || s.symbols.includes('SPY')),
  ].sort(
    (a, b) =>
      DIGEST_TOPICS.findIndex((t) => a.startsWith(TOPIC_NAMES[t])) -
      DIGEST_TOPICS.findIndex((t) => b.startsWith(TOPIC_NAMES[t])),
  );
}

const lineSchema = z.object({ text: z.string(), sources: z.array(z.number().int()) });
/** A field per topic, so each one is considered rather than the first few filling the answer. */
const digestSchema = z.object({
  us: z.array(lineSchema),
  war: z.array(lineSchema),
  oil: z.array(lineSchema),
  gold: z.array(lineSchema),
});

const DIGEST_SYSTEM = `You write the "Yesterday in the news" part of a morning brief for a trader in the UK. You are given numbered news stories from the last 24 hours: a headline and sometimes a short summary.

Cover four topics:
- us: US politics, policy, the economy and the markets.
- war: wars and armed conflicts, attacks, and talks to end them.
- oil: oil prices, supply, OPEC and energy policy.
- gold: gold prices and the precious metals market.

Answer with a list of lines for each of the four topics. Write up to ${PER_TOPIC} lines per topic, most significant first, and cover every topic that any story touches. Each line is one plain sentence in UK English of at most 200 characters.

Rules:
- Use only facts stated in the stories you cite, and cite every story a line relies on by its number.
- Report what happened. Never recommend anything, predict anything or say what prices or markets will do.
- Leave out analyst ratings, price targets, opinion pieces, adverts and articles about individual stock picks.
- Do not tell the same story under two topics.
- Leave a topic's list empty only when no story covers it.`;

/** Claude's lines, checked: valid citations, within length, and passing the advice checks. */
async function writtenDigest(deps: NotifyDeps, stories: Story[]): Promise<string[] | null> {
  const { config, store, fetch, now } = deps;
  const client = claudeClient(config, fetch, 40_000);
  if (!client || !(await spendAllowance(store, USAGE_KEY, DAILY_LIMIT, now))) return null;
  try {
    const response = await client.messages.create({
      model: config.CLAUDE_FILTER_MODEL,
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      system: DIGEST_SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(digestSchema) },
      messages: [
        {
          role: 'user',
          content: `Stories:\n${stories
            .map(
              (s, i) =>
                `${i + 1}. [${s.source}] ${s.title}${s.summary ? ` (${s.summary.slice(0, 200)})` : ''}`,
            )
            .join('\n')}`,
        },
      ],
    });
    if (response.stop_reason !== 'end_turn') return null;
    const text = response.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = digestSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const lines: string[] = [];
    for (const topic of DIGEST_TOPICS) {
      const before = lines.length;
      for (const line of parsed.data[topic].slice(0, PER_TOPIC)) {
        const cited = [...new Set(line.sources)].map((n) => stories[n - 1]);
        const sentence = line.text.replace(/\s*\[\d+(?:,\s*\d+)*\]/g, '').trim();
        if (cited.length === 0 || cited.some((s) => !s) || !sentence) continue;
        if (sentence.length > MAX_LINE) continue;
        const checks = runAdviceChecks(sentence, {
          requiresCitations: false,
          citedIndexes: [],
          retrievedIndexes: [],
        });
        if (checks.some((c) => !c.passed)) continue;
        const sources = [...new Set(cited.map((s) => s!.source))];
        const item = `${TOPIC_NAMES[topic]}: ${sentence} (${sources.join(', ')})`;
        lines.push(
          item.length <= MAX_ITEM ? item : `${TOPIC_NAMES[topic]}: ${sentence} (${sources[0]})`,
        );
      }
      // Each topic is always shown, so a quiet one reads as checked rather than missing.
      if (lines.length === before) {
        lines.push(`${TOPIC_NAMES[topic]}: nothing in the sources in the last 24 hours.`);
      }
    }
    return lines;
  } catch (error) {
    logError('digest', error);
    return null;
  }
}

/**
 * The digest for today, written once and kept for the rest of the day so previews and resends
 * reuse it. Empty when no stories could be read.
 */
export async function yesterdayDigest(deps: NotifyDeps, day: string): Promise<string[]> {
  try {
    const cached = JSON.parse((await deps.store.getSetting(CACHE_KEY)) ?? 'null') as {
      day?: unknown;
      lines?: unknown;
    } | null;
    if (
      cached?.day === day &&
      Array.isArray(cached.lines) &&
      cached.lines.every((l) => typeof l === 'string')
    ) {
      return cached.lines as string[];
    }
  } catch {
    // An unreadable cache is written again below.
  }
  const stories = await collectStories(deps);
  if (stories.length === 0) return [];
  const written = await writtenDigest(deps, stories);
  const lines = written && written.length > 0 ? written : listedDigest(stories);
  // Only Claude's digest is kept: the listing is cheap to make again with fresher stories.
  if (written && written.length > 0) {
    await deps.store.putSetting(CACHE_KEY, JSON.stringify({ day, lines }), deps.now);
  }
  return lines;
}
