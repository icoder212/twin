import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import { loadRuleLimits, ruleWatchState, runRuleWatch, saveRuleLimits } from './rule-watch';
import { baseConfig, KEY, memoryStore } from './test-support';

// Thursday 17 December 2026, 10:00 in London.
const NOW = Date.parse('2026-12-17T10:00:00Z');

const config: Config = {
  ...baseConfig,
  TOKEN_KEY: KEY,
  IG_API_KEY: 'd'.repeat(40),
  IG_USERNAME: 'deskapi',
  IG_PASSWORD: 'demo-password',
};

/** A stand-in for IG's account and positions, and WhatsApp, that records what was sent. */
function fakeNet() {
  const account = { balance: 10_000, profitLoss: 0 };
  const whatsapp: string[] = [];
  const methods: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(config.IG_API_URL)) methods.push(init?.method ?? 'GET');
    if (url.endsWith('/session') && init?.method === 'POST') {
      return new Response('{}', { headers: { CST: 'cst', 'X-SECURITY-TOKEN': 'token' } });
    }
    if (url.endsWith('/accounts')) {
      return Response.json({
        accounts: [
          {
            accountName: 'Spread bet',
            accountType: 'SPREADBET',
            preferred: true,
            currency: 'GBP',
            balance: { ...account },
          },
          {
            accountName: 'CFD',
            accountType: 'CFD',
            preferred: false,
            currency: 'GBP',
            balance: { balance: 1, profitLoss: 0 },
          },
        ],
      });
    }
    if (url.endsWith('/positions')) {
      return Response.json({
        positions: [
          {
            position: { size: 2, direction: 'BUY', level: 28_000 },
            market: {
              epic: 'IX.D.NASDAQ.CASH.IP',
              instrumentName: 'US Tech 100',
              bid: 27_950,
              offer: 27_952,
            },
          },
          {
            position: { size: 1, direction: 'SELL', level: 4_000 },
            market: {
              epic: 'CS.D.USCGC.TODAY.IP',
              instrumentName: 'Spot Gold',
              bid: 3_980,
              offer: 3_980.5,
            },
          },
        ],
      });
    }
    if (url.startsWith('https://graph.facebook.com/')) {
      const body = JSON.parse(String(init?.body)) as {
        template: { components: Array<{ parameters: Array<{ text: string }> }> };
      };
      whatsapp.push(body.template.components[0]?.parameters.map((p) => p.text).join(': ') ?? '');
      return Response.json({ messages: [{ id: `wamid.${whatsapp.length}` }] });
    }
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;
  return { account, whatsapp, methods, fetch };
}

async function setUp(limits = { dailyLoss: 500, maxDrawdown: 1_000 }) {
  const store = memoryStore();
  const net = fakeNet();
  await saveRuleLimits(store, limits, NOW);
  const run = (minutes = 0) =>
    runRuleWatch({ config, store, fetch: net.fetch, now: NOW + minutes * 60_000 });
  return { store, net, run };
}

describe('rule watch', () => {
  it('alerts the first time each share of the daily loss limit is reached', async () => {
    const { net, run } = await setUp({ dailyLoss: 500, maxDrawdown: 5_000 });
    expect(await run()).toEqual({ status: 'ok', sent: 0 });

    net.account.profitLoss = -260;
    expect(await run(1)).toEqual({ status: 'ok', sent: 1 });
    expect(net.whatsapp).toEqual([
      'your daily loss limit: 50% used, £260.00 of £500.00; equity £9,740.00',
    ]);

    net.account.profitLoss = -300;
    expect(await run(2)).toEqual({ status: 'ok', sent: 0 });

    // Past 90% straight to the limit: one alert, for the limit.
    net.account.profitLoss = -620;
    expect(await run(3)).toEqual({ status: 'ok', sent: 1 });
    expect(net.whatsapp.at(-1)).toBe(
      'your daily loss limit: reached, £620.00 of £500.00; equity £9,380.00',
    );
    expect(await run(4)).toEqual({ status: 'ok', sent: 0 });
    // The server only ever reads from IG.
    expect(new Set(net.methods)).toEqual(new Set(['POST', 'GET']));
    expect(net.methods.filter((m) => m === 'POST')).toHaveLength(1);
  });

  it('starts the day again from the first reading after midnight', async () => {
    const { net, run } = await setUp({ dailyLoss: 500, maxDrawdown: 5_000 });
    net.account.profitLoss = -300;
    await run();
    net.account.profitLoss = -800;
    // The next morning starts from 9,200: no daily loss yet.
    expect(await run(60 * 20)).toEqual({ status: 'ok', sent: 0 });
    net.account.profitLoss = -1_060;
    expect(await run(60 * 21)).toEqual({ status: 'ok', sent: 1 });
    expect(net.whatsapp.at(-1)).toMatch(/^your daily loss limit: 50% used, £260\.00 of £500\.00/);
  });

  it('measures the drawdown from the highest equity, and a new high clears its alerts', async () => {
    const { net, run } = await setUp({ dailyLoss: 5_000, maxDrawdown: 1_000 });
    net.account.profitLoss = 500;
    await run();
    net.account.profitLoss = -100;
    expect(await run(1)).toEqual({ status: 'ok', sent: 1 });
    expect(net.whatsapp.at(-1)).toBe(
      'your maximum drawdown: 50% used, £600.00 of £1,000.00; equity £9,900.00',
    );
    net.account.profitLoss = 700;
    await run(2);
    net.account.profitLoss = 150;
    expect(await run(3)).toEqual({ status: 'ok', sent: 1 });
    expect(net.whatsapp.at(-1)).toMatch(/^your maximum drawdown: 50% used, £550\.00/);
  });

  it('keeps the day’s starting point when the limits change mid-session', async () => {
    const { store, net, run } = await setUp({ dailyLoss: 500, maxDrawdown: 5_000 });
    await run();
    net.account.profitLoss = -300;
    expect(await run(1)).toEqual({ status: 'ok', sent: 1 });

    await saveRuleLimits(store, { dailyLoss: 1_000, maxDrawdown: 5_000 }, NOW);
    expect(await loadRuleLimits(store)).toEqual({ dailyLoss: 1_000, maxDrawdown: 5_000 });
    expect(await run(2)).toEqual({ status: 'ok', sent: 0 });
    // Still measured from 10,000: 520 is 52% of the new limit.
    net.account.profitLoss = -520;
    expect(await run(3)).toEqual({ status: 'ok', sent: 1 });
    expect(net.whatsapp.at(-1)).toMatch(/^your daily loss limit: 50% used, £520\.00 of £1,000\.00/);
  });

  it('shows the account, the use of each limit and the open positions', async () => {
    const { store, net, run } = await setUp();
    await run();
    net.account.profitLoss = -110;
    await run(1);
    const state = await ruleWatchState({ config, store, fetch: net.fetch, now: NOW });
    expect(state).toMatchObject({
      available: true,
      limits: { dailyLoss: 500, maxDrawdown: 1_000 },
      account: {
        name: 'Spread bet',
        type: 'SPREADBET',
        currency: 'GBP',
        balance: 10_000,
        profitLoss: -110,
        equity: 9_890,
      },
      daily: { from: 10_000, used: 110, pct: 22, alerted: 0 },
      drawdown: { from: 10_000, used: 110, pct: 11, alerted: 0 },
      positions: [
        { name: 'US Tech 100', direction: 'BUY', size: 2, price: 27_950, points: -50 },
        { name: 'Spot Gold', direction: 'SELL', size: 1, price: 3_980.5, points: 19.5 },
      ],
    });
  });

  it('is off without limits or IG settings', async () => {
    const net = fakeNet();
    const store = memoryStore();
    expect(await runRuleWatch({ config, store, fetch: net.fetch, now: NOW })).toEqual({
      status: 'off',
    });
    await saveRuleLimits(store, { dailyLoss: 500 }, NOW);
    expect(
      await runRuleWatch({
        config: { ...config, IG_API_KEY: undefined },
        store,
        fetch: net.fetch,
        now: NOW,
      }),
    ).toEqual({ status: 'off' });
    expect(net.methods).toHaveLength(0);
  });
});
