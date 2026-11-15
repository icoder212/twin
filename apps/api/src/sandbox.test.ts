import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import { runSandboxReminder, TWILIO_SANDBOX_NUMBER } from './sandbox';
import { baseConfig, memoryStore } from './test-support';

const UPDATE = `HX${'b'.repeat(32)}`;
// December, so London is on UTC.
const at = (hhmm: string) => Date.parse(`2026-12-17T${hhmm}:00Z`);

const config: Config = {
  ...baseConfig,
  WHATSAPP_PROVIDER: 'twilio',
  TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'f'.repeat(32),
  TWILIO_WHATSAPP_FROM: TWILIO_SANDBOX_NUMBER,
  TWILIO_REMINDER_CONTENT_SID: `HX${'a'.repeat(32)}`,
  TWILIO_UPDATE_CONTENT_SID: UPDATE,
  RESEND_API_KEY: 're_test_0123456789abcdef',
  SANDBOX_REMINDER_AT: '22:30',
};

/** Stand-ins for Twilio and Resend that record what was sent. */
function fakeNet() {
  const sent: Array<{ url: string; body: string }> = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, body: String(init?.body ?? '') });
    if (url.endsWith('/Messages.json')) {
      return Response.json({ sid: `SM${'c'.repeat(32)}` }, { status: 201 });
    }
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'email-1' });
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;
  return { sent, fetch };
}

describe('daily reply reminder while on the WhatsApp test number', () => {
  it('waits for the reminder time, then sends once a day on WhatsApp and email', async () => {
    const store = memoryStore();
    const net = fakeNet();
    const run = (now: number) => runSandboxReminder({ config, store, fetch: net.fetch, now });

    expect(await run(at('22:00'))).toEqual({ status: 'ok', sent: false });
    expect(net.sent).toHaveLength(0);

    expect(await run(at('22:31'))).toEqual({ status: 'ok', sent: true });
    const whatsapp = new URLSearchParams(
      net.sent.find((s) => s.url.endsWith('/Messages.json'))?.body,
    );
    expect(whatsapp.get('ContentSid')).toBe(UPDATE);
    expect(JSON.parse(whatsapp.get('ContentVariables') ?? '{}')).toEqual({
      1: 'your WhatsApp alerts',
      2: 'reply hi here to keep them coming for the next 24 hours',
    });
    const email = JSON.parse(net.sent.find((s) => s.url.includes('resend'))?.body ?? '{}');
    expect(email.text).toContain(`Send "hi" to ${TWILIO_SANDBOX_NUMBER} on WhatsApp`);

    // Once a day only.
    expect(await run(at('22:45'))).toEqual({ status: 'ok', sent: false });
    expect(net.sent).toHaveLength(2);
  });

  it('stops once WhatsApp sends from your own number, or is not on Twilio', async () => {
    const net = fakeNet();
    for (const changed of [
      { TWILIO_WHATSAPP_FROM: '+447700900999' },
      { WHATSAPP_PROVIDER: 'meta' as const },
      { SANDBOX_REMINDER_AT: undefined },
    ]) {
      const outcome = await runSandboxReminder({
        config: { ...config, ...changed },
        store: memoryStore(),
        fetch: net.fetch,
        now: at('23:00'),
      });
      expect(outcome).toEqual({ status: 'off' });
    }
    expect(net.sent).toHaveLength(0);
  });
});
