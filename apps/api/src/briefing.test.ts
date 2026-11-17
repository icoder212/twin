import { beforeEach, describe, expect, it } from 'vitest';
import { runAdviceChecks, type NotificationEvent } from '@twindesk/core';
import { handleApi } from './api';
import { buildBrief, fitted, loadBrief, runBrief, saveBrief } from './briefing';
import type { Config } from './config';
import { runMarketMoves, saveMarketWatch } from './market-moves';
import { startSession } from './session';
import { APP, baseConfig, memoryStore } from './test-support';

// Thursday 17 December 2026: a Bank of England and an ECB decision day. The UK is on GMT.
const NOW = Date.parse('2026-12-17T08:00:00Z');
const minutes = (n: number) => NOW + n * 60_000;

const config: Config = {
  ...baseConfig,
  RESEND_API_KEY: 're_test_key_0123456789',
  FRED_API_KEY: 'a'.repeat(32),
  // Paper-trading keys start with PK, so company names come from Alpaca's paper API.
  ALPACA_KEY_ID: 'PKTEST0123456789',
  ALPACA_SECRET_KEY: 'alpaca-secret-0123456789',
};

const ECB_CSV = [
  'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,TITLE',
  'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-12-15,0.8,"UK pound sterling/Euro, daily"',
  'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-12-16,0.82,"UK pound sterling/Euro, daily"',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-12-15,1.1,"US dollar/Euro, daily"',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-12-16,1.1,"US dollar/Euro, daily"',
].join('\n');

const BBC_WORLD = `<rss><channel>
<item><title>Ukraine and Russia trade drone attacks on energy sites</title><link>https://www.bbc.com/news/articles/a1</link><description><![CDATA[Both sides reported strikes overnight.]]></description><pubDate>Wed, 16 Dec 2026 21:00:00 GMT</pubDate></item>
<item><title>A story from last week</title><link>https://www.bbc.com/news/articles/a0</link><pubDate>Wed, 09 Dec 2026 21:00:00 GMT</pubDate></item>
</channel></rss>`;

/** Fake Alpaca, ECB, FRED, BBC, Claude, Resend and Meta, recording what was asked and sent. */
function fakeNetwork(
  options: { alpacaDown?: boolean; claude?: unknown; fredUpdated?: string } = {},
) {
  const emails: Array<{ to: string[]; subject: string; text: string; html?: string }> = [];
  const claudeRequests: Array<Record<string, unknown>> = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'data.alpaca.markets') {
      if (options.alpacaDown) return new Response('Unavailable', { status: 503 });
      if (url.pathname === '/v1beta1/news') {
        return Response.json({
          news: [
            {
              headline: 'Oil falls as OPEC+ keeps output unchanged',
              summary: '',
              created_at: '2026-12-16T15:00:00Z',
              symbols: ['USO'],
            },
            {
              headline: 'Analyst Raises Price Target On Gold Miner',
              created_at: '2026-12-16T14:00:00Z',
              symbols: ['GLD'],
            },
          ],
          next_page_token: null,
        });
      }
      if (url.pathname === '/v1beta1/screener/stocks/movers') {
        return Response.json({
          gainers: [
            { symbol: 'BEATW', percent_change: 195, price: 0.0118 },
            { symbol: 'FCUV', percent_change: 136, price: 7.08 },
            { symbol: 'SBC', percent_change: 37.64, price: 7.35 },
            { symbol: 'CALM', percent_change: 0.5, price: 50 },
          ],
          losers: [
            { symbol: 'ZYN', percent_change: -45.56, price: 9.13 },
            { symbol: 'RMIX', percent_change: -37.44, price: 5.08 },
            { symbol: 'NPCE', percent_change: -37.1, price: 7.56 },
            { symbol: 'OGEN', percent_change: -42.59, price: 0.201 },
          ],
        });
      }
      if (url.pathname === '/v2/stocks/bars') {
        expect(url.searchParams.get('feed')).toBe('sip');
        return Response.json({
          bars: {
            SPY: [
              { t: '2026-12-15T05:00:00Z', c: 600 },
              { t: '2026-12-16T05:00:00Z', c: 606 },
              // Counts only once today's session has closed.
              { t: '2026-12-17T05:00:00Z', c: 612.06 },
            ],
          },
          next_page_token: null,
        });
      }
      return Response.json({
        bars: {
          'BTC/USD': [
            { t: '2026-12-15T00:00:00Z', c: 100_000 },
            { t: '2026-12-16T00:00:00Z', c: 95_000 },
            { t: '2026-12-17T00:00:00Z', c: 1 },
          ],
        },
      });
    }
    if (url.hostname === 'paper-api.alpaca.markets') {
      const symbol = url.pathname.split('/').pop() ?? '';
      if (symbol === 'NPCE') return Response.json({ message: 'not found' }, { status: 404 });
      return Response.json({ symbol, name: `${symbol} Holdings Inc. Class A Common Stock` });
    }
    if (url.hostname === 'data-api.ecb.europa.eu') return new Response(ECB_CSV);
    if (url.hostname === 'feeds.bbci.co.uk') {
      return new Response(
        url.pathname === '/news/world/rss.xml' ? BBC_WORLD : '<rss><channel></channel></rss>',
      );
    }
    if (url.hostname === 'api.stlouisfed.org') {
      if (url.pathname.endsWith('/release/dates')) return Response.json({ release_dates: [] });
      if (url.pathname.endsWith('/series')) {
        return Response.json({
          seriess: [{ last_updated: options.fredUpdated ?? '2026-12-16 07:45:00-06' }],
        });
      }
      return Response.json({
        observations: [
          { date: '2026-12-12', value: '231000' },
          { date: '2026-12-05', value: '224000' },
        ],
      });
    }
    if (url.hostname === 'api.anthropic.com') {
      claudeRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-5-5',
        content: [{ type: 'text', text: JSON.stringify(options.claude) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 200 },
      });
    }
    if (url.hostname === 'api.resend.com') {
      emails.push(JSON.parse(String(init?.body)) as (typeof emails)[number]);
      return Response.json({ id: `email-${emails.length}` });
    }
    if (url.hostname === 'graph.facebook.com') {
      return Response.json({ messages: [{ id: 'wamid.1' }] });
    }
    throw new Error(`Unexpected request to ${url.href}`);
  }) as typeof fetch;
  return { emails, claudeRequests, fetch: fetchFn };
}

describe('the morning brief', () => {
  let store: ReturnType<typeof memoryStore>;
  let net: ReturnType<typeof fakeNetwork>;
  const deps = (now = NOW, withConfig = config) => ({
    config: withConfig,
    store,
    fetch: net.fetch,
    now,
  });

  beforeEach(async () => {
    store = memoryStore();
    net = fakeNetwork();
    await store.upsertReleases([
      {
        key: 'jobless-claims|2026-12-10',
        event: 'jobless-claims',
        releaseDate: '2026-12-10',
        at: Date.parse('2026-12-10T13:30:00Z'),
      },
      {
        key: 'jobless-claims|2026-12-17',
        event: 'jobless-claims',
        releaseDate: '2026-12-17',
        at: Date.parse('2026-12-17T13:30:00Z'),
      },
    ]);
  });

  it('lists markets at the last close and the day’s events with their severity, facts only', async () => {
    const { briefing, summary, text } = await buildBrief(deps(), ['markets', 'releases', 'news']);
    expect(briefing.title).toBe('Morning brief, Thursday 17 December');
    expect(briefing.sections.map((s) => [s.heading, s.items])).toEqual([
      [
        'Markets at the last close',
        [
          'S&P 500 (SPY): 606.00, up 1.0% on Wednesday',
          'GBP/USD: 1.3415, down 2.4% (ECB reference rate, Wednesday)',
          'EUR/USD: 1.1000, unchanged (ECB reference rate, Wednesday)',
          'EUR/GBP: 0.8200, up 2.5% (ECB reference rate, Wednesday)',
          'Bitcoin (BTC/USD): 95,000, down 5.0% on Wednesday (UTC day)',
        ],
      ],
      [
        'Today’s releases',
        [
          '12:00 UK Bank of England interest rate decision, high severity.',
          '13:15 Euro area ECB interest rate decision, high severity.',
          '13:30 US Weekly jobless claims, medium severity.',
        ],
      ],
      [
        'News on your instruments',
        [
          'You are not following any news yet. Add companies or topics under Instructions for Desk Twin.',
        ],
      ],
    ]);
    expect(summary).toBe(
      'Today: 12:00 UK Bank of England interest rate decision (high), 13:15 Euro area ECB interest rate decision (high), 13:30 US Weekly jobless claims (medium). Last close: S&P 500 up 1.0%, GBP/USD 1.3415.',
    );
    expect(text).toContain('- 13:30 US Weekly jobless claims, medium severity.');
    expect(text).toContain('high for central bank decisions and the major US releases (CPI,');
    const checks = runAdviceChecks(text, {
      requiresCitations: false,
      citedIndexes: [],
      retrievedIndexes: [],
    });
    expect(checks.filter((c) => !c.passed)).toEqual([]);
  });

  it('names the next high-severity event on a day without any', async () => {
    const friday = Date.parse('2026-12-18T08:00:00Z');
    const { briefing } = await buildBrief(deps(friday), ['releases']);
    expect(briefing.sections[0]?.items).toEqual([
      'No US releases and no Fed, Bank of England or ECB decisions today.',
      'Next high-severity event: Wednesday 27 January, 19:00 US Fed interest rate decision (FOMC).',
    ]);
  });

  it('gives the figures yesterday’s US releases published', async () => {
    const friday = Date.parse('2026-12-11T08:00:00Z');
    const { briefing } = await buildBrief(deps(friday), ['results']);
    expect(briefing.sections[0]?.heading).toBe('Yesterday’s results');
    expect(briefing.sections[0]?.items).toEqual([
      expect.stringMatching(/^13:30 US Weekly jobless claims for .+: initial claims 231,000\.$/),
    ]);

    net = fakeNetwork({ fredUpdated: '2026-12-09 07:45:00-06' });
    const notYet = await buildBrief(deps(friday), ['results']);
    expect(notYet.briefing.sections[0]?.items).toEqual([
      '13:30 US Weekly jobless claims: the figures are not on FRED yet.',
    ]);

    // On a Monday "yesterday" is Friday: the weekend has no releases.
    const monday = Date.parse('2026-12-14T08:00:00Z');
    const quiet = await buildBrief(deps(monday), ['results', 'headlines']);
    expect(quiet.briefing.sections.map((section) => section.heading)).toEqual([
      'In the news since Friday',
      'Friday’s results',
    ]);
    expect(quiet.briefing.sections[1]?.items).toEqual(['No scheduled US releases on Friday.']);

    // A Tuesday looks back one day again.
    const tuesday = Date.parse('2026-12-15T08:00:00Z');
    const back = await buildBrief(deps(tuesday), ['results']);
    expect(back.briefing.sections[0]?.heading).toBe('Yesterday’s results');
  });

  it('reaches back to Friday for Monday’s results', async () => {
    // Thursday 10 December's jobless claims are "yesterday" on the Friday, and not on the Monday.
    const monday = Date.parse('2026-12-14T08:00:00Z');
    const { briefing } = await buildBrief(deps(monday), ['results']);
    expect(briefing.sections[0]?.items).not.toContainEqual(expect.stringMatching(/jobless claims/));
  });

  it('lists yesterday’s headlines by topic as published when Claude is not set up', async () => {
    const { briefing } = await buildBrief(deps(), ['headlines']);
    expect(briefing.sections[0]?.items).toEqual([
      'War and conflict: Ukraine and Russia trade drone attacks on energy sites (BBC News)',
      'Oil: Oil falls as OPEC+ keeps output unchanged (Benzinga)',
    ]);
  });

  it('keeps only the lines Claude wrote that cite real stories and give no forecasts', async () => {
    const withClaude = { ...config, ANTHROPIC_API_KEY: 'sk-ant-test-0123456789' };
    net = fakeNetwork({
      claude: {
        us: [],
        war: [
          { text: 'Ukraine and Russia traded drone attacks on energy sites. [1]', sources: [1] },
          { text: 'A story nobody gave.', sources: [9] },
        ],
        oil: [
          { text: 'Oil fell after OPEC+ kept output unchanged.', sources: [2] },
          { text: 'Oil will rise next week.', sources: [2] },
        ],
        gold: [],
      },
    });
    const day = '2026-12-17';
    const { briefing } = await buildBrief(deps(NOW, withClaude), ['headlines']);
    expect(briefing.sections[0]?.items).toEqual([
      'US: nothing in the sources in the last 24 hours.',
      'War and conflict: Ukraine and Russia traded drone attacks on energy sites. (BBC News)',
      'Oil: Oil fell after OPEC+ kept output unchanged. (Benzinga)',
      'Gold: nothing in the sources in the last 24 hours.',
    ]);
    // Rated and dated stories never reach Claude; the stories are numbered newest first.
    const prompt = JSON.stringify(net.claudeRequests[0]?.messages);
    expect(prompt).toContain('1. [BBC News] Ukraine and Russia trade drone attacks');
    expect(prompt).not.toContain('Price Target');
    expect(prompt).not.toContain('last week');

    // The same day's brief reuses the digest rather than asking Claude again.
    await buildBrief(deps(minutes(30), withClaude), ['headlines']);
    expect(net.claudeRequests).toHaveLength(1);
    expect(JSON.parse(store.settings.get('brief-digest') ?? '{}')).toMatchObject({ day });
  });

  it('lists the biggest moves either way among US stocks of $5 or more', async () => {
    const { briefing, summary } = await buildBrief(deps(), ['movers']);
    expect(briefing.sections[0]?.heading).toBe('Biggest moves at the last close');
    expect(briefing.sections[0]?.items).toEqual([
      'For comparison, the S&P 500 (SPY) moved up 1.0%.',
      'FCUV (FCUV Holdings Inc.): 7.08, up 136.0%',
      'ZYN (ZYN Holdings Inc.): 9.13, down 45.6%',
      'SBC (SBC Holdings Inc.): 7.35, up 37.6%',
      'RMIX (RMIX Holdings Inc.): 5.08, down 37.4%',
      // A name that cannot be looked up leaves the symbol on its own.
      'NPCE: 7.56, down 37.1%',
    ]);
    expect(summary).toBe('Biggest moves: FCUV up 136.0%, ZYN down 45.6%, SBC up 37.6%.');
  });

  it('counts today’s US session once it has closed', async () => {
    const evening = Date.parse('2026-12-17T21:30:00Z');
    const { briefing } = await buildBrief(deps(evening), ['markets']);
    expect(briefing.sections[0]?.items[0]).toBe('S&P 500 (SPY): 612.06, up 1.0% on Thursday');
  });

  it('says when a price source cannot be reached and still sends the rest', async () => {
    net = fakeNetwork({ alpacaDown: true });
    const { briefing } = await buildBrief(deps(), ['markets']);
    expect(briefing.sections[0]?.items).toEqual([
      'US fund prices could not be fetched.',
      'GBP/USD: 1.3415, down 2.4% (ECB reference rate, Wednesday)',
      'EUR/USD: 1.1000, unchanged (ECB reference rate, Wednesday)',
      'EUR/GBP: 0.8200, up 2.5% (ECB reference rate, Wednesday)',
    ]);
  });

  it('sends once at the set time on the chosen days, by email in full', async () => {
    await saveBrief(deps(), {
      enabled: true,
      time: '08:00',
      days: [1, 2, 3, 4, 5],
      channels: ['in-app', 'email'],
      sections: ['markets', 'releases', 'news'],
    });

    expect(await runBrief(deps(minutes(-1)))).toEqual({ status: 'ok', sent: false });
    expect(await runBrief(deps())).toEqual({ status: 'ok', sent: true });
    expect(await runBrief(deps(minutes(1)))).toEqual({ status: 'ok', sent: false });
    expect(net.emails).toHaveLength(1);
    expect(net.emails[0]).toMatchObject({
      to: ['owner@example.com'],
      subject: '[Desk Twin] Info: Morning brief, Thursday 17 December',
    });
    expect(net.emails[0]?.text).toContain('Markets at the last close\n- S&P 500 (SPY): 606.00');
    // The HTML version shows big moves and high-severity events in bold, and nothing else.
    const html = net.emails[0]?.html ?? '';
    expect(html).toContain('S&amp;P 500 (SPY): 606.00, <strong>up 1.0%</strong> on Wednesday');
    expect(html).toContain('GBP/USD: 1.3415, <strong>down 2.4%</strong>');
    expect(html).toContain('EUR/USD: 1.1000, unchanged (ECB');
    expect(html).toContain(
      '<strong>12:00 UK Bank of England interest rate decision, high severity.</strong>',
    );
    expect(html).toContain(
      '<li style="margin:3px 0">13:30 US Weekly jobless claims, medium severity.</li>',
    );
    expect(html).toContain('Bold marks moves of 1% or more');

    const [sent] = await store.listNotifications(10);
    expect(sent?.event).toMatchObject({ topic: 'briefing', href: '/notifications?tab=briefings' });
    expect(sent?.event.deliveries.map((d) => [d.channel, d.status])).toEqual([
      ['in-app', 'delivered'],
      ['email', 'delivered'],
    ]);
    expect((await loadBrief(store)).lastSentAt).toBe(new Date(NOW).toISOString());

    // Saturday is not one of the chosen days.
    const saturday = Date.parse('2026-12-19T08:00:00Z');
    expect(await runBrief(deps(saturday))).toEqual({ status: 'ok', sent: false });
  });

  it('sends the summary to WhatsApp when it is chosen', async () => {
    const whatsapp: string[][] = [];
    const recording = net.fetch;
    net.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input)).hostname === 'graph.facebook.com') {
        const body = JSON.parse(String(init?.body)) as {
          template: { components: Array<{ parameters: Array<{ text: string }> }> };
        };
        whatsapp.push(body.template.components[0]!.parameters.map((p) => p.text));
      }
      return recording(input, init);
    }) as typeof fetch;
    await saveBrief(deps(), {
      enabled: true,
      time: '08:00',
      days: [0, 1, 2, 3, 4, 5, 6],
      channels: ['in-app', 'email', 'whatsapp'],
      sections: ['markets', 'releases'],
    });
    expect(await runBrief(deps())).toEqual({ status: 'ok', sent: true });
    expect(whatsapp).toEqual([
      ['your morning brief', expect.stringMatching(/^Today: 12:00 UK Bank of England.*[^.]$/)],
    ]);
    // WhatsApp takes 200 characters a field; the summary is cut to whole items, not mid-word.
    expect(whatsapp[0]![1]!.length).toBeLessThanOrEqual(200);
  });

  it('fits a summary to whole items', () => {
    const parts = [
      { lead: 'Today: ', items: ['12:00 BoE decision (high)', '13:30 US CPI (high)'] },
      { lead: 'Last close: ', items: ['S&P 500 up 1.0%', 'gold down 0.2%'] },
    ];
    expect(fitted(parts, 400)).toBe(
      'Today: 12:00 BoE decision (high), 13:30 US CPI (high). Last close: S&P 500 up 1.0%, gold down 0.2%.',
    );
    expect(fitted(parts, 90)).toBe(
      'Today: 12:00 BoE decision (high), 13:30 US CPI (high). Last close: S&P 500 up 1.0%.',
    );
    expect(fitted(parts, 40)).toBe('Today: 12:00 BoE decision (high).');
  });

  it('keeps only the sections and channels this server has', async () => {
    const saved = await saveBrief(deps(), {
      enabled: true,
      time: '07:30',
      days: [5, 1, 1],
      channels: ['email', 'sms'],
      sections: ['limits', 'markets'],
    });
    expect(saved).toMatchObject({
      days: [1, 5],
      channels: ['in-app', 'email'],
      sections: ['markets'],
    });
    expect(
      await saveBrief(deps(), {
        enabled: true,
        time: '07:30',
        days: [1],
        channels: ['in-app'],
        sections: ['limits'],
      }),
    ).toBeNull();
  });
});

describe('the briefings API', () => {
  let store: ReturnType<typeof memoryStore>;
  let cookies: string;
  let csrf: string;

  beforeEach(async () => {
    store = memoryStore();
    const set = await startSession(store, 'owner@example.com', Date.now());
    cookies = set.map((c) => c.split(';')[0]).join('; ');
    csrf = set[1]!.split(';')[0]!.split('=')[1]!;
  });

  const call = (path: string, init: { method?: string; body?: unknown } = {}) => {
    const request = new Request(`https://api.example.com${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Cookie: cookies,
        'X-Requested-With': 'twindesk',
        Origin: APP,
        'X-CSRF-Token': csrf,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return handleApi(request, new URL(request.url), {
      config,
      store,
      fetch: fakeNetwork().fetch,
    });
  };

  it('offers the morning brief with the sections it can fill, and saves it', async () => {
    const [listed, recap] = (await (await call('/v1/briefings')).json()) as Array<
      Record<string, unknown>
    >;
    expect(recap).toMatchObject({
      kind: 'end-of-day',
      enabled: false,
      time: '21:30',
      days: [1, 2, 3, 4, 5],
      offered: ['watchlist', 'markets', 'movers', 'results', 'alerts', 'tomorrow'],
    });
    expect(listed).toMatchObject({
      kind: 'morning-brief',
      enabled: false,
      time: '08:00',
      days: [0, 1, 2, 3, 4, 5, 6],
      offered: ['markets', 'movers', 'headlines', 'results', 'releases', 'news'],
    });

    const body = {
      enabled: true,
      time: '08:00',
      days: [1, 2, 3, 4, 5],
      channels: ['in-app', 'email'],
      sections: ['markets', 'releases'],
    };
    const saved = await call('/v1/briefings/morning-brief', { method: 'PUT', body });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ ...body, nextRunAt: expect.any(String) });

    const refused = await call('/v1/briefings/morning-brief', {
      method: 'PUT',
      body: { ...body, sections: ['limits'] },
    });
    expect(refused.status).toBe(422);
    expect((await call('/v1/briefings/end-of-day/preview')).status).toBe(200);
    expect((await call('/v1/briefings/weekly/preview')).status).toBe(404);
  });
});

describe('the end-of-day recap', () => {
  const NASDAQ = 'IX.D.NASDAQ.CASH.IP';
  // Thursday 17 December 2026, after the US close.
  const EVENING = Date.parse('2026-12-17T21:30:00Z');
  let store: ReturnType<typeof memoryStore>;
  let net: ReturnType<typeof fakeNetwork>;
  const deps = (now = EVENING, withConfig = config) => ({
    config: withConfig,
    store,
    fetch: net.fetch,
    now,
  });

  const alert = (topic: NotificationEvent['topic'], title: string, at: string) =>
    store.saveNotification(
      {
        id: `nev_${title.length}${at.slice(11, 13)}`,
        ref: 'NT-ABC123',
        topic,
        urgency: 'important',
        title,
        body: title,
        createdAt: at,
        deliveries: [],
      },
      false,
    );

  beforeEach(async () => {
    store = memoryStore();
    net = fakeNetwork();
    await store.upsertReleases([
      {
        key: 'jobless-claims|2026-12-17',
        event: 'jobless-claims',
        releaseDate: '2026-12-17',
        at: Date.parse('2026-12-17T13:30:00Z'),
      },
    ]);
  });

  it('gives today’s figures, the alerts sent today and tomorrow’s events, facts only', async () => {
    await alert('price', 'US Tech 100 up 1.1% today', '2026-12-17T14:32:00Z');
    await alert('price', 'Spot Gold above 4,000.0', '2026-12-17T16:05:00Z');
    // Not counted: yesterday's alert, and a briefing.
    await alert('price', 'Wall Street down 1.0% today', '2026-12-16T15:00:00Z');
    await alert('briefing', 'Morning brief, Thursday 17 December', '2026-12-17T08:00:00Z');

    const { briefing, summary, short, text } = await buildBrief(
      deps(),
      ['results', 'alerts', 'tomorrow'],
      'end-of-day',
    );
    expect(briefing.kind).toBe('end-of-day');
    expect(briefing.title).toBe('End-of-day recap, Thursday 17 December');
    expect(briefing.sections.map((s) => [s.heading, s.items])).toEqual([
      ['Today’s results', [expect.stringMatching(/^13:30 US Weekly jobless claims/)]],
      ['Alerts sent today', ['14:32 US Tech 100 up 1.1% today', '16:05 Spot Gold above 4,000.0']],
      [
        'Tomorrow’s releases',
        [
          'No US releases and no Fed, Bank of England or ECB decisions tomorrow.',
          'Next high-severity event: Wednesday 27 January, 19:00 US Fed interest rate decision (FOMC).',
        ],
      ],
    ]);
    expect(summary).toBe(
      '2 alerts today. No scheduled releases or central bank decisions tomorrow.',
    );
    expect(short).toBe(summary);
    const checks = runAdviceChecks(text, {
      requiresCitations: false,
      citedIndexes: [],
      retrievedIndexes: [],
    });
    expect(checks.filter((c) => !c.passed)).toEqual([]);
  });

  it('looks ahead to Monday on a Friday', async () => {
    const friday = Date.parse('2026-12-18T21:30:00Z');
    const { briefing } = await buildBrief(deps(friday), ['tomorrow'], 'end-of-day');
    expect(briefing.sections[0]?.heading).toBe('Monday’s releases');
    expect(briefing.sections[0]?.items[0]).toBe(
      'No US releases and no Fed, Bank of England or ECB decisions on Monday.',
    );
  });

  it('shows the watched markets from IG with what was alerted on them today', async () => {
    const withIg: Config = {
      ...config,
      IG_API_KEY: 'd'.repeat(40),
      IG_USERNAME: 'deskapi',
      IG_PASSWORD: 'demo-password',
    };
    const base = net.fetch;
    const igFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/session') && init?.method === 'POST') {
        return new Response('{}', { headers: { CST: 'cst', 'X-SECURITY-TOKEN': 'token' } });
      }
      if (url.includes('/markets?epics=')) {
        return Response.json({
          marketDetails: [
            {
              instrument: { epic: NASDAQ, name: 'US Tech 100' },
              snapshot: {
                marketStatus: 'TRADEABLE',
                bid: 28_300,
                offer: 28_302,
                netChange: 300,
                percentageChange: 0,
                decimalPlacesFactor: 1,
              },
            },
          ],
        });
      }
      return base(input, init);
    }) as typeof fetch;
    const igDeps = { config: withIg, store, fetch: igFetch, now: EVENING };
    expect(
      (await buildBrief(deps(), ['watchlist'], 'end-of-day')).briefing.sections[0]?.items,
    ).toEqual(['Prices from IG are not set up yet.']);

    await saveMarketWatch(
      store,
      { markets: [{ epic: NASDAQ, name: 'US Tech 100', stepPct: 1 }] },
      EVENING,
    );
    await runMarketMoves(igDeps);
    const { briefing, summary } = await buildBrief(igDeps, ['watchlist', 'alerts'], 'end-of-day');
    expect(briefing.sections.map((s) => s.items)).toEqual([
      ['US Tech 100: 28,301.0, up 1.1% on the day. Alerted at +1%.'],
      ['21:30 US Tech 100 up 1.1% today'],
    ]);
    expect(summary).toBe('Your markets: US Tech 100 up 1.1%. 1 alert today.');
  });

  it('sends on its own schedule, apart from the morning brief', async () => {
    await saveBrief(
      deps(),
      {
        enabled: true,
        time: '21:30',
        days: [1, 2, 3, 4, 5],
        channels: ['in-app', 'email'],
        sections: ['results', 'tomorrow'],
      },
      'end-of-day',
    );
    expect(await runBrief(deps(), 'morning-brief')).toEqual({ status: 'off' });
    expect(await runBrief(deps(), 'end-of-day')).toEqual({ status: 'ok', sent: true });
    expect(await runBrief(deps(EVENING + 60_000), 'end-of-day')).toEqual({
      status: 'ok',
      sent: false,
    });
    expect(net.emails).toHaveLength(1);
    expect(net.emails[0]?.subject).toMatch(/End-of-day recap, Thursday 17 December/);
    expect((await loadBrief(store, 'end-of-day')).lastSentAt).toBe(new Date(EVENING).toISOString());
    expect((await loadBrief(store)).lastSentAt).toBeUndefined();
  });
});

describe('the weekly review', () => {
  // Friday 18 December 2026, after the US close.
  const FRIDAY = Date.parse('2026-12-18T22:00:00Z');
  let store: ReturnType<typeof memoryStore>;
  let net: ReturnType<typeof fakeNetwork>;
  const deps = () => ({ config, store, fetch: net.fetch, now: FRIDAY });
  const alert = (topic: NotificationEvent['topic'], title: string, at: string) =>
    store.saveNotification(
      {
        id: `nev_${topic}${at.slice(8, 10)}${at.slice(11, 13)}`,
        ref: 'NT-ABC123',
        topic,
        urgency: 'important',
        title,
        body: title,
        createdAt: at,
        deliveries: [],
      },
      false,
    );

  beforeEach(async () => {
    store = memoryStore();
    net = fakeNetwork();
    await store.upsertReleases([
      {
        key: 'jobless-claims|2026-12-17',
        event: 'jobless-claims',
        releaseDate: '2026-12-17',
        at: Date.parse('2026-12-17T13:30:00Z'),
      },
      {
        key: 'gdp|2026-12-22',
        event: 'gdp',
        releaseDate: '2026-12-22',
        at: Date.parse('2026-12-22T13:30:00Z'),
      },
    ]);
  });

  it('counts the week’s alerts, gives its figures and lists next week’s events', async () => {
    await alert('price', 'US Tech 100 up 1.1% today', '2026-12-14T15:00:00Z');
    await alert('price', 'Spot Gold above 4,000.0', '2026-12-16T16:05:00Z');
    await alert('release', 'US Weekly jobless claims figures', '2026-12-17T13:31:00Z');
    await alert('loss-limit', '50% of your daily loss limit used', '2026-12-18T15:00:00Z');
    // Not counted: a briefing, and last week's alert.
    await alert('briefing', 'Morning brief, Friday 18 December', '2026-12-18T08:00:00Z');
    await alert('price', 'Wall Street down 1.0% today', '2026-12-11T15:00:00Z');

    const { briefing, summary, text } = await buildBrief(
      deps(),
      ['week-alerts', 'week-results', 'journal', 'next-week'],
      'weekly-review',
    );
    expect(briefing.title).toBe('Weekly review, Friday 18 December');
    expect(briefing.sections.map((s) => [s.heading, s.items])).toEqual([
      ['Alerts this week', ['Market moves and levels: 2.', 'Releases: 1.', 'Rule watch: 1.']],
      ['This week’s results', [expect.stringMatching(/^13:30 US Weekly jobless claims/)]],
      ['Journal prompts', expect.arrayContaining([expect.stringMatching(/\?$/)])],
      ['Next week’s releases', [expect.stringMatching(/^Tue 22 Dec, 13:30 US .+ severity\.$/)]],
    ]);
    expect(summary).toMatch(/^4 alerts this week\./);
    const checks = runAdviceChecks(text, {
      requiresCitations: false,
      citedIndexes: [],
      retrievedIndexes: [],
    });
    expect(checks.filter((c) => !c.passed)).toEqual([]);
  });

  it('is offered on Friday evenings by default', async () => {
    const schedule = await loadBrief(store, 'weekly-review');
    expect(schedule).toMatchObject({ enabled: false, time: '22:00', days: [5] });
  });
});
