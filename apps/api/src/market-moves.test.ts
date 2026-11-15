import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import { searchMarkets } from './ig';
import { marketsState, runMarketMoves, saveMarketWatch } from './market-moves';
import { baseConfig, KEY, memoryStore } from './test-support';

const NASDAQ = 'IX.D.NASDAQ.CASH.IP';
const GOLD = 'CS.D.USCGC.TODAY.IP';
const NOW = Date.parse('2026-12-17T15:00:00Z');

const config: Config = {
  ...baseConfig,
  TOKEN_KEY: KEY,
  IG_API_KEY: 'd'.repeat(40),
  IG_USERNAME: 'deskapi',
  IG_PASSWORD: 'demo-password',
};

interface Quote {
  bid: number;
  netChange: number;
  status?: string;
}

/** A stand-in for IG (and WhatsApp) that records what was asked for. */
function fakeNet(quotes: Record<string, Quote>) {
  const calls = { logins: 0, details: 0, whatsapp: [] as string[] };
  let expireNext = false;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/session') && init?.method === 'POST') {
      calls.logins += 1;
      return new Response('{}', {
        headers: { CST: `cst-${calls.logins}`, 'X-SECURITY-TOKEN': `token-${calls.logins}` },
      });
    }
    if (url.includes('/markets?epics=')) {
      calls.details += 1;
      if (expireNext) {
        expireNext = false;
        return Response.json({ errorCode: 'error.security.client-token-invalid' }, { status: 401 });
      }
      const epics = decodeURIComponent(url.split('epics=')[1] ?? '').split(',');
      return Response.json({
        marketDetails: epics
          .filter((epic) => quotes[epic])
          .map((epic) => {
            const q = quotes[epic] as Quote;
            return {
              instrument: { epic, name: epic === NASDAQ ? 'US Tech 100' : 'Spot Gold' },
              snapshot: {
                marketStatus: q.status ?? 'TRADEABLE',
                bid: q.bid,
                offer: q.bid + 2,
                netChange: q.netChange,
                percentageChange: 0,
                decimalPlacesFactor: 1,
              },
            };
          }),
      });
    }
    if (url.includes('/markets?searchTerm=')) {
      return Response.json({
        markets: [
          {
            epic: NASDAQ,
            instrumentName: 'US Tech 100',
            instrumentType: 'INDICES',
            expiry: 'DFB',
            marketStatus: 'TRADEABLE',
            bid: 28000,
            offer: 28002,
            percentageChange: 0.4,
          },
          {
            epic: 'DO.D.NDX.1.IP',
            instrumentName: 'Daily US Tech 100 CALL',
            instrumentType: 'OPT_INDICES',
            expiry: '16-NOV-26',
            marketStatus: 'EDITS_ONLY',
            bid: 1,
            offer: 2,
            percentageChange: 0,
          },
        ],
      });
    }
    if (url.startsWith('https://graph.facebook.com/')) {
      const body = JSON.parse(String(init?.body)) as {
        template: { components: Array<{ parameters: Array<{ text: string }> }> };
      };
      calls.whatsapp.push(
        body.template.components[0]?.parameters.map((p) => p.text).join(': ') ?? '',
      );
      return Response.json({ messages: [{ id: `wamid.${calls.whatsapp.length}` }] });
    }
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;
  return { calls, fetch, expireSession: () => (expireNext = true) };
}

async function setUp(quotes: Record<string, Quote>) {
  const store = memoryStore();
  const net = fakeNet(quotes);
  await saveMarketWatch(
    store,
    {
      markets: [
        { epic: NASDAQ, name: 'US Tech 100', stepPct: 1 },
        { epic: GOLD, name: 'Spot Gold', stepPct: 1 },
      ],
    },
    NOW,
  );
  const run = (minutes = 0) =>
    runMarketMoves({ config, store, fetch: net.fetch, now: NOW + minutes * 60_000 });
  return { store, net, run };
}

describe('market move alerts', () => {
  it('alerts the first time the day reaches each whole step, up or down', async () => {
    // Previous close 28,000 for US Tech 100 and 4,000 for gold.
    const quotes: Record<string, Quote> = {
      [NASDAQ]: { bid: 28_100, netChange: 100 },
      [GOLD]: { bid: 4_000, netChange: 0 },
    };
    const { net, run } = await setUp(quotes);

    expect(await run()).toEqual({ status: 'ok', sent: 0 });

    quotes[NASDAQ] = { bid: 28_300, netChange: 300 }; // +1.07%
    expect(await run(1)).toEqual({ status: 'ok', sent: 1 });
    expect(net.calls.whatsapp).toEqual(['US Tech 100: up 1.1% today at 28,301.0']);

    quotes[NASDAQ] = { bid: 28_400, netChange: 400 }; // +1.43%: same step, no alert
    expect(await run(2)).toEqual({ status: 'ok', sent: 0 });

    quotes[NASDAQ] = { bid: 28_600, netChange: 600 }; // +2.14%
    quotes[GOLD] = { bid: 3_955, netChange: -45 }; // -1.13%
    expect(await run(3)).toEqual({ status: 'ok', sent: 2 });
    expect(net.calls.whatsapp.slice(1)).toEqual([
      'US Tech 100: up 2.1% today at 28,601.0',
      'Spot Gold: down 1.1% today at 3,956.0',
    ]);

    quotes[NASDAQ] = { bid: 28_350, netChange: 350 }; // back to +1.25%: already sent
    expect(await run(4)).toEqual({ status: 'ok', sent: 0 });
  });

  it('starts the steps again on a new trading day', async () => {
    const quotes: Record<string, Quote> = {
      [NASDAQ]: { bid: 28_300, netChange: 300 },
      [GOLD]: { bid: 4_000, netChange: 0 },
    };
    const { net, run } = await setUp(quotes);
    expect(await run()).toEqual({ status: 'ok', sent: 1 });

    // The next day closes at 28,300, then moves 1.2% again.
    quotes[NASDAQ] = { bid: 28_640, netChange: 340 };
    expect(await run(60 * 24)).toEqual({ status: 'ok', sent: 1 });
    expect(net.calls.whatsapp.at(-1)).toBe('US Tech 100: up 1.2% today at 28,641.0');
  });

  it('ignores markets that are not trading', async () => {
    const { run } = await setUp({
      [NASDAQ]: { bid: 28_600, netChange: 600, status: 'CLOSED' },
      [GOLD]: { bid: 4_000, netChange: 0 },
    });
    expect(await run()).toEqual({ status: 'ok', sent: 0 });
  });

  it('reuses the IG login and logs in again only when IG ends it', async () => {
    const { net, run } = await setUp({
      [NASDAQ]: { bid: 28_000, netChange: 0 },
      [GOLD]: { bid: 4_000, netChange: 0 },
    });
    await run();
    await run(1);
    expect(net.calls.logins).toBe(1);
    net.expireSession();
    expect(await run(2)).toEqual({ status: 'ok', sent: 0 });
    expect(net.calls.logins).toBe(2);
  });

  it('is off without a watchlist or IG settings', async () => {
    const net = fakeNet({});
    expect(
      await runMarketMoves({ config, store: memoryStore(), fetch: net.fetch, now: NOW }),
    ).toEqual({ status: 'off' });
    const { store } = await setUp({});
    expect(
      await runMarketMoves({
        config: { ...config, IG_API_KEY: undefined },
        store,
        fetch: net.fetch,
        now: NOW,
      }),
    ).toEqual({ status: 'off' });
    expect(net.calls.logins).toBe(0);
  });

  it('shows live prices and the steps already sent today', async () => {
    const quotes: Record<string, Quote> = {
      [NASDAQ]: { bid: 28_300, netChange: 300 },
      [GOLD]: { bid: 4_000, netChange: 0 },
    };
    const { store, net, run } = await setUp(quotes);
    await run();
    const state = await marketsState({ config, store, fetch: net.fetch, now: NOW });
    const nasdaq = state.quotes.find((q) => q.epic === NASDAQ);
    expect(nasdaq).toMatchObject({
      price: 28_301,
      previousClose: 28_000,
      alertedUp: 1,
      alertedDown: 0,
    });
    expect(nasdaq?.changePct).toBeCloseTo(1.071, 3);
    expect(state.channels).toEqual(['in-app', 'whatsapp']);
  });

  it('searches IG without options or binaries', async () => {
    const net = fakeNet({});
    const results = await searchMarkets(
      { config, store: memoryStore(), fetch: net.fetch, now: NOW },
      'tech 100',
    );
    expect(results).toEqual([
      {
        epic: NASDAQ,
        name: 'US Tech 100',
        type: 'INDICES',
        expiry: 'DFB',
        status: 'TRADEABLE',
        price: 28_001,
        changePct: 0.4,
      },
    ]);
  });
});
