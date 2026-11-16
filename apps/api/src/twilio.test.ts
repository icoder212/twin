import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readConfig, type Config, type Env } from './config';
import { baseConfig } from './test-support';
import {
  deliverWhatsApp,
  missingWhatsAppSettings,
  reminderTemplate,
  twilioStatus,
  updateTemplate,
  verifyTwilioSignature,
} from './whatsapp';

const SID = `AC${'1'.repeat(32)}`;
const TOKEN = 'f'.repeat(32);
const REMINDER = `HX${'a'.repeat(32)}`;
const UPDATE = `HX${'b'.repeat(32)}`;
const CALLBACK = 'https://desk-twin-api.example.workers.dev/twilio/status';

const twilio: Config = {
  ...baseConfig,
  WHATSAPP_PROVIDER: 'twilio',
  WHATSAPP_PHONE_NUMBER_ID: undefined,
  WHATSAPP_TOKEN: undefined,
  TWILIO_ACCOUNT_SID: SID,
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_WHATSAPP_FROM: '+14155238886',
  TWILIO_REMINDER_CONTENT_SID: REMINDER,
  TWILIO_UPDATE_CONTENT_SID: UPDATE,
  TWILIO_MIN_BALANCE: 10,
  TWILIO_STATUS_CALLBACK_URL: CALLBACK,
};

/** A stand-in for Twilio's API that records every request. */
function fakeTwilio(balance: string) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/Balance.json')) return Response.json({ balance, currency: 'GBP' });
    if (url.endsWith('/Messages.json')) {
      return Response.json({ sid: `SM${'c'.repeat(32)}`, status: 'queued' }, { status: 201 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

describe('Twilio settings', () => {
  const env = (extra: Record<string, unknown>) => ({
    ...Object.fromEntries(
      Object.entries(baseConfig).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.join(',') : v === undefined ? '' : String(v),
      ]),
    ),
    DB: {} as Env['DB'],
    ...extra,
  });

  it('needs the Twilio account, sender and template only when Twilio is chosen', async () => {
    expect(readConfig(env({})).WHATSAPP_PROVIDER).toBe('meta');
    // A gap in the WhatsApp settings stops WhatsApp only: the rest of the server still starts.
    const unset = readConfig(env({ WHATSAPP_PROVIDER: 'twilio' }));
    expect(missingWhatsAppSettings(unset)).toEqual([
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_WHATSAPP_FROM',
      'TWILIO_REMINDER_CONTENT_SID',
    ]);
    const net = fakeTwilio('19.98');
    await expect(
      deliverWhatsApp(unset, reminderTemplate(unset, 'CPI release', '13:30'), net.fetch),
    ).rejects.toThrow(/WhatsApp is not set up: missing TWILIO_ACCOUNT_SID/);
    expect(net.calls).toHaveLength(0);
    const config = readConfig(
      env({
        WHATSAPP_PROVIDER: 'twilio',
        WHATSAPP_PHONE_NUMBER_ID: '',
        WHATSAPP_TOKEN: '',
        TWILIO_ACCOUNT_SID: SID,
        TWILIO_AUTH_TOKEN: TOKEN,
        TWILIO_WHATSAPP_FROM: '+14155238886',
        TWILIO_REMINDER_CONTENT_SID: REMINDER,
        TWILIO_MIN_BALANCE: '10',
      }),
    );
    expect(config.TWILIO_MIN_BALANCE).toBe(10);
    // Without an update template, updates go to the app and email only.
    expect(updateTemplate(config, 'your morning brief', 'details')).toBeUndefined();
  });
});

describe('the update template', () => {
  it('leaves the closing full stop to the template', () => {
    const update = updateTemplate(twilio, 'your morning brief', 'Biggest moves: FCUV up 136.0%.');
    expect(update?.params).toEqual(['your morning brief', 'Biggest moves: FCUV up 136.0%']);
    expect(updateTemplate(twilio, 'US Tech 100', 'up 2.0% today at 28,601.0')?.params[1]).toBe(
      'up 2.0% today at 28,601.0',
    );
  });
});

describe('sending through Twilio', () => {
  it('sends the matching content template with its variables', async () => {
    const net = fakeTwilio('19.98');
    const id = await deliverWhatsApp(
      twilio,
      reminderTemplate(twilio, 'CPI release', '13:30'),
      net.fetch,
    );
    expect(id).toBe(`SM${'c'.repeat(32)}`);
    const send = net.calls.find((c) => c.url.endsWith('/Messages.json'));
    const form = new URLSearchParams(String(send?.init?.body));
    expect(Object.fromEntries(form)).toEqual({
      From: 'whatsapp:+14155238886',
      To: 'whatsapp:+447700900123',
      ContentSid: REMINDER,
      ContentVariables: JSON.stringify({ 1: 'CPI release', 2: '13:30' }),
      StatusCallback: CALLBACK,
    });
    expect(new Headers(send?.init?.headers).get('Authorization')).toBe(
      `Basic ${btoa(`${SID}:${TOKEN}`)}`,
    );
  });

  it('stops at the spending floor without sending', async () => {
    const net = fakeTwilio('10.00');
    const update = updateTemplate(twilio, 'your morning brief', '3 releases today');
    if (!update) throw new Error('expected an update template');
    await expect(deliverWhatsApp(twilio, update, net.fetch)).rejects.toThrow(/spending floor/);
    expect(net.calls.some((c) => c.url.endsWith('/Messages.json'))).toBe(false);
  });
});

describe('Twilio delivery receipts', () => {
  const form = new URLSearchParams({
    MessageSid: `SM${'d'.repeat(32)}`,
    MessageStatus: 'read',
    AccountSid: SID,
  });
  const sign = (url: string, body: URLSearchParams, token = TOKEN) =>
    createHmac('sha1', token)
      .update(
        url +
          [...body.keys()]
            .sort()
            .map((k) => `${k}${body.get(k)}`)
            .join(''),
      )
      .digest('base64');

  it('accepts only bodies signed for the configured URL with the auth token', async () => {
    expect(await verifyTwilioSignature(TOKEN, CALLBACK, form, sign(CALLBACK, form))).toBe(true);
    expect(await verifyTwilioSignature(TOKEN, CALLBACK, form, sign(`${CALLBACK}x`, form))).toBe(
      false,
    );
    expect(
      await verifyTwilioSignature(TOKEN, CALLBACK, form, sign(CALLBACK, form, 'e'.repeat(32))),
    ).toBe(false);
    expect(await verifyTwilioSignature(TOKEN, CALLBACK, form, null)).toBe(false);
  });

  it('reads the message id and status, and ignores anything malformed', () => {
    expect(twilioStatus(form)).toEqual({ id: `SM${'d'.repeat(32)}`, status: 'read' });
    expect(
      twilioStatus(new URLSearchParams({ MessageSid: 'x', MessageStatus: 'read' })),
    ).toBeNull();
  });
});
