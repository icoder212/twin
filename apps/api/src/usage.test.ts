import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import { notify, type NotifyDeps } from './notify';
import { baseConfig, memoryStore } from './test-support';
import { saveWhatsAppCap, usageState } from './usage';

const SID = `AC${'1'.repeat(32)}`;
const NOW = Date.parse('2026-11-17T10:00:00Z');

const twilio: Config = {
  ...baseConfig,
  WHATSAPP_PROVIDER: 'twilio',
  WHATSAPP_PHONE_NUMBER_ID: undefined,
  WHATSAPP_TOKEN: undefined,
  TWILIO_ACCOUNT_SID: SID,
  TWILIO_AUTH_TOKEN: 'f'.repeat(32),
  TWILIO_WHATSAPP_FROM: '+14155238886',
  TWILIO_REMINDER_CONTENT_SID: `HX${'a'.repeat(32)}`,
  TWILIO_UPDATE_CONTENT_SID: `HX${'b'.repeat(32)}`,
  TWILIO_MIN_BALANCE: 10,
};

/** Twilio's API as far as sending and the usage view need it. */
function fakeTwilio() {
  const sent: string[] = [];
  const fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/Balance.json')) return Response.json({ balance: '19.62', currency: 'GBP' });
    if (url.includes('/Usage/Records/ThisMonth.json?Category=totalprice')) {
      return Response.json({ usage_records: [{ category: 'totalprice', price: '0.38' }] });
    }
    if (url.endsWith('/Messages.json')) {
      sent.push(url);
      return Response.json({ sid: `SM${String(sent.length).padStart(32, '0')}` }, { status: 201 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;
  return { sent, fetch };
}

function alert(deps: NotifyDeps, title: string) {
  return notify(deps, {
    topic: 'price',
    urgency: 'important',
    title,
    body: `${title} today.`,
    channels: ['in-app', 'whatsapp'],
    whatsapp: { kind: 'update', name: 'release_update', params: [title, 'up 1.0% today'] },
  });
}

describe('usage this month', () => {
  it('counts this month’s messages by channel, with the Twilio balance and spend', async () => {
    const store = memoryStore();
    const net = fakeTwilio();
    // Last month's message is not counted.
    await alert(
      { config: twilio, store, fetch: net.fetch, now: Date.parse('2026-10-31T12:00:00Z') },
      'Gold',
    );
    const deps = { config: twilio, store, fetch: net.fetch, now: NOW };
    await alert(deps, 'Gold');
    await alert(deps, 'US Tech 100');

    expect(await usageState(deps)).toEqual({
      month: 'November 2026',
      channels: [
        { channel: 'in-app', sent: 2, failed: 0, skipped: 0 },
        { channel: 'whatsapp', sent: 2, failed: 0, skipped: 0 },
      ],
      whatsapp: { cap: null, sent: 2, spent: 0.38, balance: 19.62, currency: 'GBP', floor: 10 },
    });
  });

  it('stops WhatsApp at the monthly cap and keeps the app going', async () => {
    const store = memoryStore();
    const net = fakeTwilio();
    const deps = { config: twilio, store, fetch: net.fetch, now: NOW };
    await saveWhatsAppCap(store, 2, NOW);
    await alert(deps, 'Gold');
    await alert(deps, 'Wall Street');
    const third = await alert(deps, 'US Tech 100');

    expect(net.sent).toHaveLength(2);
    expect(third.deliveries.map((d) => [d.channel, d.status, d.note])).toEqual([
      ['in-app', 'delivered', undefined],
      ['whatsapp', 'skipped', 'Not sent: this month’s WhatsApp cap of 2 messages is reached'],
    ]);
    expect((await usageState(deps)).whatsapp).toMatchObject({ cap: 2, sent: 2 });

    // Lifting the cap lets the next one through.
    await saveWhatsAppCap(store, null, NOW);
    await alert(deps, 'Brent');
    expect(net.sent).toHaveLength(3);
  });

  it('shows no Twilio figures when WhatsApp goes through Meta', async () => {
    const deps = { config: baseConfig, store: memoryStore(), fetch: fakeTwilio().fetch, now: NOW };
    expect((await usageState(deps)).whatsapp).toEqual({
      cap: null,
      sent: 0,
      spent: null,
      balance: null,
      currency: null,
      floor: null,
    });
  });
});
