import { beforeEach, describe, expect, it } from 'vitest';
import type { NewsState } from '@twindesk/core';
import { handleApi } from './api';
import { ANALYST_RATING, newsState, runNews, saveNewsWatch, wordMatches } from './news';
import { startSession } from './session';
import { loadPreferences } from './settings';
import { APP, baseConfig, memoryStore } from './test-support';

// A Tuesday afternoon in London, when the central banks' feeds are read every minute.
const NOW = Date.parse('2026-11-10T16:00:00Z');
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const rfc = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toUTCString();

const alpaca = {
  ...baseConfig,
  ALPACA_KEY_ID: 'alpaca-key-0123456789',
  ALPACA_SECRET_KEY: 'alpaca-secret-0123456789',
};

/** Fake Alpaca, central bank and Claude endpoints. */
function fakeNetwork() {
  const state = {
    headlines: [
      {
        id: 1,
        headline: 'Nvidia beats estimates',
        summary: '',
        url: 'https://www.benzinga.com/1',
        created_at: iso(1),
        symbols: ['NVDA'],
      },
      {
        id: 2,
        headline: 'US to raise tariffs on steel imports',
        summary: '',
        url: null,
        created_at: iso(1),
        symbols: [],
      },
      {
        id: 3,
        headline: 'Apple opens a new store',
        summary: '',
        url: null,
        created_at: iso(1),
        symbols: ['AAPL'],
      },
      {
        id: 6,
        headline: 'Morgan Stanley Maintains Overweight on Nvidia, Raises Price Target to $250',
        summary: '',
        url: null,
        created_at: iso(1),
        symbols: ['NVDA'],
      },
    ],
    boe: [
      {
        title: 'Bank Rate increased to 4% - November 2026 Monetary Policy Summary',
        at: rfc(60 * 24 * 5),
      },
      { title: 'Minutes of the Money Market Committee', at: rfc(30) },
    ],
    claudeAnswer: null as unknown,
    claudeRequests: [] as Array<Record<string, unknown>>,
    alpacaCalls: [] as URL[],
  };
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'data.alpaca.markets') {
      state.alpacaCalls.push(url);
      expect(new Headers(init?.headers).get('APCA-API-KEY-ID')).toBe(alpaca.ALPACA_KEY_ID);
      return Response.json({ news: state.headlines, next_page_token: null });
    }
    if (url.hostname === 'www.bankofengland.co.uk') {
      const items = state.boe
        .map(
          (i, n) =>
            `<item><guid>{${n}}</guid><link>https://www.bankofengland.co.uk/news/${n}</link><title>${i.title}</title><pubDate>${i.at}</pubDate></item>`,
        )
        .join('');
      return new Response(`<rss><channel>${items}</channel></rss>`);
    }
    if (url.hostname === 'api.anthropic.com') {
      state.claudeRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-5-5',
        content: [{ type: 'text', text: JSON.stringify(state.claudeAnswer) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 200, output_tokens: 20 },
      });
    }
    throw new Error(`Unexpected request to ${url.href}`);
  }) as typeof fetch;
  return { state, fetch: fakeFetch };
}

describe('matching topics without Claude', () => {
  it('needs every word of the topic, allowing plurals', () => {
    const item = (headline: string) => ({
      key: headline,
      source: 'benzinga' as const,
      headline,
      summary: '',
      at: NOW,
      symbols: [],
    });
    const found = wordMatches(
      [item('New tariff on steel'), item('OPEC+ agrees cuts'), item('Treasury auction tails')],
      ['tariffs', 'OPEC', 'Treasury auctions results'],
    );
    expect([...found]).toEqual([
      [0, 'tariffs'],
      [1, 'OPEC'],
    ]);
  });
});

describe('leaving out advice', () => {
  it('drops analyst ratings and price targets, and keeps the news', () => {
    for (const headline of [
      'Morgan Stanley Maintains Overweight on Nvidia, Raises Price Target to $250',
      'GLJ Research Reiterates Sell on GE Vernova, Maintains $540 Price Target',
      'Goldman Sachs Upgrades Apple to Buy',
      'JPMorgan Lowers Barrick Gold Target Price to $53 Following Q3 Results',
      'Jefferies Initiates Coverage On Tesla with Underperform Rating',
    ]) {
      expect(ANALYST_RATING.test(headline), headline).toBe(true);
    }
    for (const headline of [
      'OPEC maintains output despite price slump',
      'OPEC lowers its output target for 2027',
      'Nvidia Q3 revenue $57.0B versus $54.9B a year earlier',
      'US to raise tariffs on steel imports',
    ]) {
      expect(ANALYST_RATING.test(headline), headline).toBe(false);
    }
  });
});

describe('following news', () => {
  let store: ReturnType<typeof memoryStore>;
  let net: ReturnType<typeof fakeNetwork>;

  beforeEach(async () => {
    store = memoryStore();
    net = fakeNetwork();
    await saveNewsWatch(
      store,
      { tickers: ['nvda'], topics: ['tariffs'], centralBanks: ['boe'] },
      NOW,
    );
  });

  it('sends headlines on watched tickers and topics once each', async () => {
    const deps = { config: alpaca, store, fetch: net.fetch, now: NOW };
    expect(await runNews(deps)).toMatchObject({ checked: 3, sent: 2 });
    const titles = [...store.notifications.values()].map((n) => n.event.title).sort();
    expect(titles).toEqual(['Nvidia beats estimates', 'US to raise tariffs on steel imports']);
    const nvidia = [...store.notifications.values()].find((n) =>
      n.event.title.startsWith('Nvidia'),
    );
    expect(nvidia?.event).toMatchObject({
      topic: 'news',
      body: 'Matched: NVDA. Source: Benzinga. https://www.benzinga.com/1',
    });
    // News goes to the app alone unless the owner adds WhatsApp.
    expect(nvidia?.event.deliveries.map((d) => d.channel)).toEqual(['in-app']);

    expect(await runNews({ ...deps, now: NOW + 60_000 })).toMatchObject({ checked: 0, sent: 0 });
    expect(net.state.alpacaCalls[1]?.searchParams.get('start')).toBe(iso(2));

    const state = await newsState(deps);
    expect(state.recent.map((r) => r.match).sort()).toEqual(['NVDA', 'tariffs']);
  });

  it('notes what the bank already published, then sends rate decisions only', async () => {
    const deps = { config: baseConfig, store, fetch: net.fetch, now: NOW };
    expect(await runNews(deps)).toMatchObject({ sent: 0 });
    net.state.boe.unshift(
      { title: 'Bank Rate maintained at 4% - December 2026 Monetary Policy Summary', at: rfc(0) },
      { title: 'Minutes of the Securities Lending Committee', at: rfc(0) },
    );
    expect(await runNews({ ...deps, now: NOW + 60_000 })).toMatchObject({ sent: 1 });
    const [decision] = [...store.notifications.values()];
    expect(decision?.event.title).toBe(
      'Bank Rate maintained at 4% - December 2026 Monetary Policy Summary',
    );
    expect(decision?.event.body).toContain('Matched: Bank of England.');
  });

  it('lets Claude pick the headlines about a topic', async () => {
    net.state.claudeAnswer = {
      matches: [
        // Right number and quote; a quote that fits no headline; a miscounted number.
        { number: 1, topic: 'Tariffs', quote: 'White House widens steel' },
        { number: 2, topic: 'tariffs', quote: 'Something else entirely' },
        { number: 9, topic: 'tariffs', quote: 'EU answers with duties' },
      ],
    };
    net.state.headlines = [
      {
        id: 4,
        headline: 'White House widens steel levies',
        summary: '',
        url: null,
        created_at: iso(1),
        symbols: [],
      },
      {
        id: 5,
        headline: 'Weather delays flights',
        summary: '',
        url: null,
        created_at: iso(1),
        symbols: [],
      },
      {
        id: 7,
        headline: 'EU answers with duties on US goods',
        summary: '',
        url: null,
        created_at: iso(1),
        symbols: [],
      },
    ];
    const config = { ...alpaca, ANTHROPIC_API_KEY: 'sk-ant-test-0123456789' };
    expect(await runNews({ config, store, fetch: net.fetch, now: NOW })).toMatchObject({ sent: 2 });
    expect([...store.notifications.values()].map((n) => n.event.title).sort()).toEqual([
      'EU answers with duties on US goods',
      'White House widens steel levies',
    ]);
    expect(net.state.claudeRequests[0]).toMatchObject({
      model: 'claude-haiku-5-5',
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    });
  });
});

describe('the news API', () => {
  it('saves a watch and routes news to the channels chosen', async () => {
    const store = memoryStore();
    const set = await startSession(store, 'owner@example.com', Date.now());
    const cookies = set.map((c) => c.split(';')[0]).join('; ');
    const csrf = set[1]!.split(';')[0]!.split('=')[1]!;
    const call = (method: string, path: string, body?: unknown) => {
      const request = new Request(`https://api.example.com${path}`, {
        method,
        headers: {
          Cookie: cookies,
          'X-Requested-With': 'twindesk',
          'X-CSRF-Token': csrf,
          Origin: APP,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return handleApi(request, new URL(request.url), {
        config: baseConfig,
        store,
        fetch: fakeNetwork().fetch,
      });
    };

    const saved = await call('PUT', '/v1/news/watch', {
      watch: { tickers: ['NVDA'], topics: [], centralBanks: ['fed'] },
      channels: ['whatsapp'],
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()) as NewsState).toMatchObject({
      headlines: false,
      watch: { tickers: ['NVDA'], centralBanks: ['fed'] },
      channels: ['in-app', 'whatsapp'],
    });
    expect((await loadPreferences(store)).routing.news).toEqual(['in-app', 'whatsapp']);

    const empty = await call('PUT', '/v1/news/watch', {
      watch: { tickers: [], topics: [], centralBanks: [] },
    });
    expect(empty.status).toBe(422);
    expect(((await (await call('DELETE', '/v1/news/watch')).json()) as NewsState).watch).toBeNull();
  });
});
