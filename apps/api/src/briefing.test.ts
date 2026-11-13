import { beforeEach, describe, expect, it } from 'vitest';
import { runAdviceChecks } from '@twindesk/core';
import { handleApi } from './api';
import { buildBrief, loadBrief, runBrief, saveBrief } from './briefing';
import type { Config } from './config';
import { startSession } from './session';
import { APP, baseConfig, memoryStore } from './test-support';

// Thursday 17 December 2026: a Bank of England and an ECB decision day. The UK is on GMT.
const NOW = Date.parse('2026-12-17T08:00:00Z');
const minutes = (n: number) => NOW + n * 60_000;

const config: Config = {
  ...baseConfig,
  RESEND_API_KEY: 're_test_key_0123456789',
  FRED_API_KEY: 'a'.repeat(32),
  ALPACA_KEY_ID: 'alpaca-key-0123456789',
  ALPACA_SECRET_KEY: 'alpaca-secret-0123456789',
};

const ECB_CSV = [
  'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,TITLE',
  'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-12-15,0.8,"UK pound sterling/Euro, daily"',
  'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-12-16,0.82,"UK pound sterling/Euro, daily"',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-12-15,1.1,"US dollar/Euro, daily"',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-12-16,1.1,"US dollar/Euro, daily"',
].join('\n');

/** Fake Alpaca, ECB, FRED, Resend and Meta, recording what was sent. */
function fakeNetwork(options: { alpacaDown?: boolean } = {}) {
  const emails: Array<{ to: string[]; subject: string; text: string }> = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'data.alpaca.markets') {
      if (options.alpacaDown) return new Response('Unavailable', { status: 503 });
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
    if (url.hostname === 'data-api.ecb.europa.eu') return new Response(ECB_CSV);
    if (url.hostname === 'api.stlouisfed.org') return Response.json({ release_dates: [] });
    if (url.hostname === 'api.resend.com') {
      emails.push(JSON.parse(String(init?.body)) as (typeof emails)[number]);
      return Response.json({ id: `email-${emails.length}` });
    }
    if (url.hostname === 'graph.facebook.com') {
      return Response.json({ messages: [{ id: 'wamid.1' }] });
    }
    throw new Error(`Unexpected request to ${url.href}`);
  }) as typeof fetch;
  return { emails, fetch: fetchFn };
}

describe('the morning brief', () => {
  let store: ReturnType<typeof memoryStore>;
  let net: ReturnType<typeof fakeNetwork>;
  const deps = (now = NOW) => ({ config, store, fetch: net.fetch, now });

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
    expect(summary).toMatch(/^3 scheduled today, 2 of high severity: 12:00 UK Bank of England/);
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

  it('keeps only the sections and channels this server has', async () => {
    const saved = await saveBrief(deps(), {
      enabled: true,
      time: '07:30',
      days: [5, 1, 1],
      channels: ['email', 'sms'],
      sections: ['limits', 'markets'],
    });
    expect(saved).toMatchObject({ days: [1, 5], channels: ['in-app', 'email'], sections: ['markets'] });
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
    const [listed] = (await (await call('/v1/briefings')).json()) as Array<Record<string, unknown>>;
    expect(listed).toMatchObject({
      kind: 'morning-brief',
      enabled: false,
      time: '08:00',
      offered: ['markets', 'releases', 'news'],
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
    expect((await call('/v1/briefings/end-of-day/preview')).status).toBe(404);
  });
});
