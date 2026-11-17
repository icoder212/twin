import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import { saveMarketWatch } from './market-moves';
import { runSessionNotes, saveSessions } from './session-notes';
import { baseConfig, KEY, memoryStore } from './test-support';

const NASDAQ = 'IX.D.NASDAQ.CASH.IP';
// Wednesday 16 December 2026. London and New York are both on winter time: New York opens at
// 14:30 in London.
const at = (time: string) => Date.parse(`2026-12-16T${time}:00Z`);

const config: Config = {
  ...baseConfig,
  TOKEN_KEY: KEY,
  IG_API_KEY: 'd'.repeat(40),
  IG_USERNAME: 'deskapi',
  IG_PASSWORD: 'demo-password',
};

/** IG's prices and WhatsApp, recording each WhatsApp message. */
function fakeNet() {
  const whatsapp: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
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
              bid: 28_112,
              offer: 28_114,
              netChange: 112,
              percentageChange: 0,
              decimalPlacesFactor: 1,
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
  return { whatsapp, fetch };
}

async function setUp() {
  const store = memoryStore();
  const net = fakeNet();
  await saveMarketWatch(store, { markets: [{ epic: NASDAQ, name: 'US Tech 100', stepPct: 1 }] }, 0);
  await store.upsertReleases([
    { key: 'jolts|2026-12-16', event: 'jolts', releaseDate: '2026-12-16', at: at('15:00') },
  ]);
  const run = (now: number) => runSessionNotes({ config, store, fetch: net.fetch, now });
  return { store, net, run };
}

describe('notes before the open', () => {
  it('sends each chosen open’s note once, 10 minutes before it', async () => {
    const { store, net, run } = await setUp();
    expect(await run(at('07:50'))).toEqual({ status: 'off' });
    await saveSessions(store, ['london', 'new-york'], 0);

    expect(await run(at('07:49'))).toEqual({ status: 'ok', sent: 0 });
    expect(await run(at('07:50'))).toEqual({ status: 'ok', sent: 1 });
    expect(await run(at('07:51'))).toEqual({ status: 'ok', sent: 0 });
    expect(net.whatsapp).toEqual([
      'the London open at 08:00: US Tech 100 up 0.4%; nothing due in the first hour',
    ]);

    expect(await run(at('14:20'))).toEqual({ status: 'ok', sent: 1 });
    expect(net.whatsapp.at(-1)).toBe(
      'the New York open at 14:30: US Tech 100 up 0.4%; due: 15:00 US Job openings (JOLTS)',
    );
    const [note] = await store.listNotifications(1);
    expect(note?.event).toMatchObject({
      topic: 'price',
      title: 'New York opens at 14:30',
      body: 'Your markets against the last close: US Tech 100 up 0.4%. Due in the first hour: 15:00 US Job openings (JOLTS).',
    });
  });

  it('skips the weekend and a note missed by more than a few minutes', async () => {
    const { store, run } = await setUp();
    await saveSessions(store, ['london'], 0);
    expect(await run(Date.parse('2026-12-19T07:50:00Z'))).toEqual({ status: 'ok', sent: 0 });
    expect(await run(at('07:56'))).toEqual({ status: 'ok', sent: 0 });
  });
});
