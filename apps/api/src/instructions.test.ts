import { describe, expect, it } from 'vitest';
import { MAJOR_US_RELEASES } from '@twindesk/core';
import {
  DAILY_LIMIT,
  interpret,
  InstructionError,
  toReply,
  type Interpretation,
} from './instructions';
import { baseConfig, memoryStore } from './test-support';

const config = { ...baseConfig, ANTHROPIC_API_KEY: 'sk-ant-test-0123456789' };
const NOW = Date.parse('2026-11-10T16:00:00Z');
const NONE = { economic: null, news: null };
const CHANNELS = { economic: ['in-app' as const, 'whatsapp' as const], news: ['in-app' as const] };

const read = (
  economic: Partial<Interpretation['economic']> = {},
  news: Partial<Interpretation['news']> = {},
  reply = 'I will watch the major US releases.',
): Interpretation => ({
  economic: {
    intent: 'set',
    events: [],
    remind_minutes: 15,
    results: true,
    summary_time: '',
    channels: 'unchanged',
    ...economic,
  },
  news: {
    intent: 'unchanged',
    tickers: [],
    topics: [],
    central_banks: [],
    channels: 'unchanged',
    ...news,
  },
  reply,
});

/** A fake Messages API that answers with `answer` and records each request body. */
function fakeClaude(answer: unknown, stopReason = 'end_turn', status = 200) {
  const requests: Array<Record<string, unknown>> = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('https://api.anthropic.com/v1/messages');
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (status !== 200) {
      return Response.json(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        { status },
      );
    }
    return Response.json({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify(answer) }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 900, output_tokens: 120 },
    });
  }) as typeof fetch;
  return { fetch: fakeFetch, requests };
}

describe('reading an instruction', () => {
  it('fills in the major releases, a default reminder and the channels named', () => {
    expect(toReply(read({ channels: 'email-and-whatsapp' }), NONE)).toEqual({
      kind: 'proposal',
      message: 'I will watch the major US releases.',
      watch: { events: MAJOR_US_RELEASES, remindMinutes: 15, results: true },
      channels: ['email', 'whatsapp'],
    });
    const nothing = toReply(
      read({ events: ['jolts', 'cpi', 'cpi'], remind_minutes: 0, results: false }),
      NONE,
    );
    expect(nothing).toMatchObject({
      watch: { events: ['cpi', 'jolts'], remindMinutes: 15, results: false },
    });
    expect(toReply(read({ remind_minutes: 99_999 }), NONE)).toMatchObject({
      watch: { remindMinutes: 1440 },
    });
  });

  it('adds a summary of the next day at a valid time only', () => {
    expect(
      toReply(read({ remind_minutes: 30, results: false, summary_time: '18:00' }), NONE),
    ).toMatchObject({ watch: { remindMinutes: 30, results: false, summaryAt: '18:00' } });
    const summaryOnly = toReply(
      read({ remind_minutes: 0, results: false, summary_time: '19:30' }),
      NONE,
    );
    expect(summaryOnly).toMatchObject({ watch: { remindMinutes: 0, summaryAt: '19:30' } });
    const odd = toReply(read({ summary_time: '6pm' }), NONE);
    expect(odd.kind === 'proposal' && odd.watch?.summaryAt).toBeFalsy();
  });

  it('keeps the current releases when the instruction changes something else', () => {
    const current = {
      economic: { events: ['cpi' as const], remindMinutes: 15, results: true },
      news: null,
    };
    expect(toReply(read({ remind_minutes: 30 }), current)).toMatchObject({
      watch: { events: ['cpi'], remindMinutes: 30 },
    });
  });

  it('proposes news alerts with clean tickers and topics', () => {
    const reply = toReply(
      read(
        { intent: 'unchanged' },
        {
          intent: 'set',
          tickers: ['nvda', 'NVDA', 'not a ticker', 'BRK.B'],
          topics: [' tariffs ', 'Tariffs', 'OPEC'],
          central_banks: ['ecb', 'fed'],
          channels: 'whatsapp',
        },
        'I will follow Nvidia, Berkshire, tariffs, OPEC, the Fed and the ECB.',
      ),
      NONE,
    );
    expect(reply).toEqual({
      kind: 'proposal',
      message: 'I will follow Nvidia, Berkshire, tariffs, OPEC, the Fed and the ECB.',
      news: {
        tickers: ['NVDA', 'BRK.B'],
        topics: ['tariffs', 'OPEC'],
        centralBanks: ['fed', 'ecb'],
      },
      newsChannels: ['whatsapp'],
    });
  });

  it('asks before stopping, and only what is running', () => {
    const current = {
      economic: { events: ['cpi' as const], remindMinutes: 15, results: true },
      news: { tickers: ['NVDA'], topics: [], centralBanks: [] },
    };
    expect(toReply(read({ intent: 'stop' }, { intent: 'stop' }, 'Stop both?'), current)).toEqual({
      kind: 'stop',
      message: 'Stop both?',
      what: ['economic', 'news'],
    });
    expect(toReply(read({ intent: 'stop' }, {}, 'Stop?'), NONE)).toMatchObject({ kind: 'reply' });
  });

  it('never shows an advisory reply', () => {
    const reply = toReply(
      read({ intent: 'unchanged' }, {}, 'You should buy the dollar before CPI.'),
      NONE,
    );
    expect(reply).toMatchObject({ kind: 'reply' });
    expect(reply.message).not.toMatch(/buy/);
  });

  it('asks Claude for the settings in a fixed shape, with no sampling settings', async () => {
    const claude = fakeClaude(read({ events: ['fomc', 'cpi'], remind_minutes: 10 }));
    const store = memoryStore();
    const reply = await interpret(
      { config, store, fetch: claude.fetch, now: NOW },
      'Remind me 10 minutes before CPI and the Fed, and post the figures after',
      NONE,
      CHANNELS,
    );
    expect(reply).toMatchObject({
      kind: 'proposal',
      watch: { events: ['fomc', 'cpi'], remindMinutes: 10, results: true },
    });
    const [body] = claude.requests;
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      output_config: { effort: 'low', format: { type: 'json_schema' } },
    });
    expect(body).not.toHaveProperty('temperature');
    const sent = JSON.stringify(body?.messages);
    expect(sent).toContain('Current economic release settings: none');
    expect(sent).toContain('News alerts go to: in-app');
  });

  it('turns a refusal or an unreadable answer into a plain message', async () => {
    const deps = (fetch: typeof globalThis.fetch) => ({
      config,
      store: memoryStore(),
      fetch,
      now: NOW,
    });
    const refused = await interpret(deps(fakeClaude({}, 'refusal').fetch), 'Hello', NONE, CHANNELS);
    expect(refused.kind).toBe('reply');
    await expect(
      interpret(deps(fakeClaude({ economic: 'maybe' }).fetch), 'Hello', NONE, CHANNELS),
    ).rejects.toMatchObject({ status: 502 });
    await expect(
      interpret(deps(fakeClaude({}, 'end_turn', 401).fetch), 'Hello', NONE, CHANNELS),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('stops at the daily limit and without a key', async () => {
    const store = memoryStore();
    store.settings.set('claude-usage', JSON.stringify({ day: '2026-11-10', count: DAILY_LIMIT }));
    const claude = fakeClaude(read());
    await expect(
      interpret({ config, store, fetch: claude.fetch, now: NOW }, 'Watch CPI', NONE, CHANNELS),
    ).rejects.toMatchObject({ status: 429 });
    expect(claude.requests).toHaveLength(0);

    await expect(
      interpret(
        { config: baseConfig, store, fetch: claude.fetch, now: NOW },
        'Watch CPI',
        NONE,
        CHANNELS,
      ),
    ).rejects.toBeInstanceOf(InstructionError);
  });
});
