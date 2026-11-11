import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  CENTRAL_BANK_INFO,
  CENTRAL_BANKS,
  centralBankSchema,
  MAJOR_US_RELEASES,
  runAdviceChecks,
  sanitizeText,
  tickerSchema,
  US_RELEASE_INFO,
  US_RELEASES,
  usReleaseSchema,
  type DeliveryChannel,
  type EconomicWatch,
  type InstructionReply,
  type NewsWatch,
  type WatchChannel,
  type WatchKind,
} from '@twindesk/core';
import { claudeClient, spendAllowance } from './claude';
import type { Config } from './config';
import { logError } from './log';
import { cleanNewsWatch } from './news';
import type { Store } from './store';

/**
 * Claude reads one instruction from the owner and fills in the settings for watching US
 * releases and following news. It never changes anything itself: the app shows what it
 * understood and the owner confirms. Messages that go out later are written by this server from
 * published figures and headlines.
 */

export interface InstructionDeps {
  config: Config;
  store: Store;
  fetch: typeof fetch;
  now: number;
}

export class InstructionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'InstructionError';
  }
}

/** Keeps the cost bounded if something goes wrong in the app: a few pence a day at most. */
export const DAILY_LIMIT = 40;
const USAGE_KEY = 'claude-usage';
const DEFAULT_REMINDER = 15;
const DEFAULT_SUMMARY = '18:00';
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const CHANNEL_CHOICES = [
  'unchanged',
  'app-only',
  'email',
  'whatsapp',
  'email-and-whatsapp',
] as const;
const CHANNELS: Record<(typeof CHANNEL_CHOICES)[number], WatchChannel[] | undefined> = {
  unchanged: undefined,
  'app-only': [],
  email: ['email'],
  whatsapp: ['whatsapp'],
  'email-and-whatsapp': ['email', 'whatsapp'],
};

const intent = z.enum(['set', 'stop', 'unchanged']);

/** What Claude returns. Limits are checked afterwards, so the schema stays simple. */
export const interpretationSchema = z.object({
  economic: z.object({
    intent,
    events: z.array(usReleaseSchema),
    remind_minutes: z.number().int(),
    results: z.boolean(),
    summary_time: z.string(),
    channels: z.enum(CHANNEL_CHOICES),
  }),
  news: z.object({
    intent,
    tickers: z.array(z.string()),
    topics: z.array(z.string()),
    central_banks: z.array(centralBankSchema),
    channels: z.enum(CHANNEL_CHOICES),
  }),
  reply: z.string(),
});
export type Interpretation = z.infer<typeof interpretationSchema>;

const releases = US_RELEASES.map(
  (e) => `- ${e}: ${US_RELEASE_INFO[e].label}${US_RELEASE_INFO[e].major ? ' (major)' : ''}`,
).join('\n');
const banks = CENTRAL_BANKS.map((b) => `- ${b}: ${CENTRAL_BANK_INFO[b].label}`).join('\n');

const SYSTEM = `You set up alerts in Desk Twin, a work tool for one trader. You read one instruction from them and fill in two sets of settings: US economic releases (a reminder before each, and the published figures after it) and news (headlines about companies and topics, and central bank rate decisions and statements).

US releases that can be watched (id: name):
${releases}

Central banks whose decisions and statements can be followed (id: name):
${banks}

How to fill in the settings:
- Start from the current settings given with the instruction and change only what the instruction mentions. With no current settings, start from nothing.
- For each set, intent is "set" when the instruction sets it up or changes it, "stop" when it asks to stop that kind of alert altogether, and "unchanged" otherwise. Fill in the full settings for "set"; for "stop" or "unchanged", copy the current ones.
- Economic releases:
  - events: the ids to watch. "Major", "key", "important", "big" or "high-impact" US releases means exactly the ones marked major. "All" means every id in the list.
  - remind_minutes: how many minutes before each release the reminder goes; 0 for no reminder. If a reminder is asked for without a time, use ${DEFAULT_REMINDER}. Hours become minutes. At most 1440.
  - results: true when they want the figures afterwards (for example "post-event details", "results", "actuals", "the numbers", "what came out").
  - summary_time: when to send a summary of the next day's releases, as HH:MM on the 24-hour clock (for example "a summary today for tomorrow", "the evening before"); "" for none. If one is asked for without a time, use ${DEFAULT_SUMMARY}. If the instruction does not mention it, keep the current value.
  - If the instruction mentions none of the reminder, the figures or the summary, keep the current choices; with no current settings, use a ${DEFAULT_REMINDER}-minute reminder and the figures.
- News:
  - tickers: US stock tickers for the companies named, in capitals (Nvidia is NVDA, Apple is AAPL). Only tickers you are sure of.
  - topics: short phrases for other subjects to follow, such as "tariffs", "OPEC" or "US Treasury auctions". Not companies or central banks.
  - central_banks: the ids of central banks whose decisions and statements they want. "Central banks" alone means all of them.
- channels (in each set): where those alerts go besides the app, only when the instruction names channels; otherwise "unchanged".
- reply: one or two short, plain sentences in UK English to the trader, saying what you understood, or, if nothing applies, what you can set up. Say if something they asked for is not available, such as another country's statistics or forecasts.
- Never give trading advice, opinions, forecasts or predictions about markets, companies or releases, even if asked.`;

function currentSummary(
  economic: EconomicWatch | null,
  economicChannels: DeliveryChannel[],
  news: NewsWatch | null,
  newsChannels: DeliveryChannel[],
): string {
  const releases = economic
    ? JSON.stringify({
        events: economic.events,
        remind_minutes: economic.remindMinutes,
        results: economic.results,
        summary_time: economic.summaryAt ?? '',
      })
    : 'none';
  const following = news
    ? JSON.stringify({
        tickers: news.tickers,
        topics: news.topics,
        central_banks: news.centralBanks,
      })
    : 'none';
  return [
    `Current economic release settings: ${releases}`,
    `Economic release alerts go to: ${economicChannels.join(', ')}`,
    `Current news settings: ${following}`,
    `News alerts go to: ${newsChannels.join(', ')}`,
  ].join('\n');
}

/** Claude's reply as shown in the app: plain, short, and never advisory. */
function safeMessage(text: string, fallback: string): string {
  const clean = sanitizeText(text, { maxLength: 600, multiline: false });
  if (!clean) return fallback;
  const checks = runAdviceChecks(clean, {
    requiresCitations: false,
    citedIndexes: [],
    retrievedIndexes: [],
  });
  return checks.every((c) => c.passed) ? clean : fallback;
}

const NOTHING_TO_DO =
  'I can set up reminders before US economic releases with the figures after them, and news alerts for companies, topics and central banks.';

export interface CurrentWatches {
  economic: EconomicWatch | null;
  news: NewsWatch | null;
}

function economicPart(read: Interpretation['economic'], current: EconomicWatch | null) {
  const events = US_RELEASES.filter((e) => read.events.includes(e));
  const summary = read.summary_time.trim();
  const summaryAt = CLOCK.test(summary) ? summary : undefined;
  let remindMinutes = Math.min(1440, Math.max(0, Math.round(read.remind_minutes)));
  if (remindMinutes === 0 && !read.results && !summaryAt) remindMinutes = DEFAULT_REMINDER;
  return {
    watch: {
      events: events.length > 0 ? events : (current?.events ?? MAJOR_US_RELEASES),
      remindMinutes,
      results: read.results,
      ...(summaryAt ? { summaryAt } : {}),
    },
    channels: CHANNELS[read.channels],
  };
}

function newsPart(read: Interpretation['news']) {
  const tickers = read.tickers
    .map((t) => t.trim().toUpperCase())
    .filter((t) => tickerSchema.safeParse(t).success);
  const watch = cleanNewsWatch({
    tickers,
    topics: read.topics,
    centralBanks: read.central_banks,
  });
  const empty = watch.tickers.length + watch.topics.length + watch.centralBanks.length === 0;
  return empty ? null : { watch, channels: CHANNELS[read.channels] };
}

/** Turns Claude's reading into a proposal the app can show and the owner can confirm. */
export function toReply(read: Interpretation, current: CurrentWatches): InstructionReply {
  const message = (fallback: string) => safeMessage(read.reply, fallback);
  const stop: WatchKind[] = [];
  if (read.economic.intent === 'stop' && current.economic) stop.push('economic');
  if (read.news.intent === 'stop' && current.news) stop.push('news');

  const economic =
    read.economic.intent === 'set' ? economicPart(read.economic, current.economic) : null;
  const news = read.news.intent === 'set' ? newsPart(read.news) : null;

  if (!economic && !news) {
    return stop.length > 0
      ? { kind: 'stop', message: message('Stop these alerts?'), what: stop }
      : { kind: 'reply', message: message(NOTHING_TO_DO) };
  }
  return {
    kind: 'proposal',
    message: message('Here is what I understood. Nothing changes until you confirm.'),
    ...(economic ? { watch: economic.watch } : {}),
    ...(economic?.channels ? { channels: economic.channels } : {}),
    ...(news ? { news: news.watch } : {}),
    ...(news?.channels ? { newsChannels: news.channels } : {}),
    ...(stop.length > 0 ? { stop } : {}),
  };
}

const unreadable = () =>
  new InstructionError(502, 'Claude’s answer could not be read. Try putting it another way.');

export async function interpret(
  deps: InstructionDeps,
  text: string,
  current: CurrentWatches,
  channels: { economic: DeliveryChannel[]; news: DeliveryChannel[] },
): Promise<InstructionReply> {
  const { config, store, fetch, now } = deps;
  const client = claudeClient(config, fetch);
  if (!client) {
    throw new InstructionError(
      409,
      'Claude is not set up on the server yet, so choose the settings yourself for now.',
    );
  }
  if (!(await spendAllowance(store, USAGE_KEY, DAILY_LIMIT, now))) {
    throw new InstructionError(
      429,
      `That is ${DAILY_LIMIT} instructions today, the daily limit. Try again tomorrow.`,
    );
  }

  const instruction = sanitizeText(text, { maxLength: 600, multiline: true });
  let response;
  try {
    // The schema shapes Claude's answer; it is checked here, after the stop reason.
    response = await client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(interpretationSchema) },
      messages: [
        {
          role: 'user',
          content: `${currentSummary(current.economic, channels.economic, current.news, channels.news)}\n\nInstruction:\n${instruction}`,
        },
      ],
    });
  } catch (error) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      throw new InstructionError(
        503,
        'Claude turned down the server’s key. Check the key on the server.',
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new InstructionError(429, 'Claude is busy right now. Try again in a minute.');
    }
    // The log keeps Anthropic's reason (such as no credit left); the app gets a plain message.
    if (error instanceof Anthropic.APIError) logError('instructions', error);
    if (error instanceof Anthropic.BadRequestError) {
      throw new InstructionError(
        502,
        'Claude did not accept the request. Check that the Anthropic account has credit.',
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new InstructionError(502, 'Claude could not be reached. Try again shortly.');
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    return { kind: 'reply', message: 'I can only help with setting up alerts here.' };
  }
  if (response.stop_reason !== 'end_turn') throw unreadable();
  const answer = response.content.find((block) => block.type === 'text')?.text ?? '';
  let parsed;
  try {
    parsed = interpretationSchema.safeParse(JSON.parse(answer));
  } catch {
    throw unreadable();
  }
  if (!parsed.success) throw unreadable();
  return toReply(parsed.data, current);
}
