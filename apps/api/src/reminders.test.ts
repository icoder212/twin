import { beforeEach, describe, expect, it } from 'vitest';
import type { CalendarEvent } from '@twindesk/core';
import type { Config } from './config';
import { hmacSha256Hex, seal, toBase64Url, unseal } from './crypto';
import { idTokenEmail } from './google';
import { dueReminders, runReminders } from './reminders';
import type { GoogleLink, Store } from './store';
import { statusUpdates, templateText, verifySignature } from './whatsapp';

const KEY = toBase64Url(new Uint8Array(32).fill(7));
const NOW = Date.parse('2026-11-09T16:50:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

const config: Config = {
  OWNER_GOOGLE_ACCOUNT: 'owner@example.com',
  GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  TOKEN_KEY: KEY,
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_TOKEN: 'whatsapp-token-0123456789',
  WHATSAPP_APP_SECRET: 'app-secret-0123456789',
  WHATSAPP_VERIFY_TOKEN: 'verify-token-0123456789',
  WHATSAPP_TO: '447700900123',
  WHATSAPP_TEMPLATE: 'meeting_reminder',
  WHATSAPP_TEMPLATE_LANGUAGE: 'en_GB',
  GRAPH_API_VERSION: 'v26.0',
  REMINDER_MINUTES: 10,
  TIMEZONE: 'Europe/London',
};

const event = (id: string, minutes: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: `Event ${id}`,
  start: at(minutes),
  end: at(minutes + 30),
  allDay: false,
  tentative: false,
  guests: 0,
  ...extra,
});

function memoryStore(): Store & { link: GoogleLink | null; reminders: Map<string, string> } {
  const reminders = new Map<string, string>();
  return {
    link: null,
    reminders,
    async getLink() {
      return this.link;
    },
    async saveLink(email, refreshSealed) {
      this.link = { email, refreshSealed, accessSealed: null, accessExpiresAt: null };
    },
    async saveAccess(accessSealed, expiresAt) {
      if (this.link) this.link = { ...this.link, accessSealed, accessExpiresAt: expiresAt };
    },
    async clearAccess() {
      if (this.link) this.link = { ...this.link, accessSealed: null, accessExpiresAt: null };
    },
    async deleteLink() {
      this.link = null;
    },
    async claimReminder(key) {
      if (reminders.has(key)) return false;
      reminders.set(key, 'sending');
      return true;
    },
    async releaseReminder(key) {
      reminders.delete(key);
    },
    async markSent(key) {
      reminders.set(key, 'sent');
    },
    async updateDelivery() {},
    async pruneReminders() {},
  };
}

/** Fake Google and Meta endpoints, recording what the server sent. */
function fakeNetwork(events: unknown[]) {
  const sent: Array<{ to: string; params: string[] }> = [];
  let refreshes = 0;
  let whatsappStatus = 200;
  let tokenError: string | null = null;
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      refreshes += 1;
      if (tokenError) return Response.json({ error: tokenError }, { status: 400 });
      return Response.json({ access_token: 'fresh-access', expires_in: 3599, scope: 'x' });
    }
    if (url.startsWith('https://www.googleapis.com/calendar/')) {
      return Response.json({ summary: 'owner@example.com', items: events });
    }
    if (url.startsWith('https://graph.facebook.com/v26.0/1234567890/messages')) {
      if (whatsappStatus !== 200) {
        return Response.json(
          { error: { message: 'Template not approved', code: 132001 } },
          { status: whatsappStatus },
        );
      }
      const body = JSON.parse(String(init?.body)) as {
        to: string;
        template: { components: Array<{ parameters: Array<{ text: string }> }> };
      };
      sent.push({
        to: body.to,
        params: body.template.components[0]!.parameters.map((p) => p.text),
      });
      return Response.json({ messages: [{ id: `wamid.${sent.length}` }] });
    }
    throw new Error(`Unexpected request to ${url}`);
  }) as typeof fetch;
  return {
    fetch: fakeFetch,
    sent,
    refreshes: () => refreshes,
    failWhatsApp: (status: number) => (whatsappStatus = status),
    failRefresh: (error: string) => (tokenError = error),
  };
}

const googleEvent = (id: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  id,
  summary: `Meeting ${id}`,
  start: { dateTime: at(minutes) },
  end: { dateTime: at(minutes + 30) },
  ...extra,
});

describe('dueReminders', () => {
  it('picks timed events starting within the reminder window', () => {
    const due = dueReminders(
      [
        event('started', -1),
        event('now', 0),
        event('soon', 9),
        event('edge', 10),
        event('later', 11),
        event('allday', 5, { allDay: true }),
      ],
      NOW,
      10,
    );
    expect(due.map((d) => d.event.id)).toEqual(['soon', 'edge']);
    expect(due[0]?.key).toBe(`soon|${at(9)}`);
  });
});

describe('runReminders', () => {
  let store: ReturnType<typeof memoryStore>;

  beforeEach(async () => {
    store = memoryStore();
    await store.saveLink('owner@example.com', await seal('refresh-token', KEY), NOW);
  });

  it('does nothing until Google is connected', async () => {
    const net = fakeNetwork([]);
    expect(
      await runReminders({ config, store: memoryStore(), fetch: net.fetch, now: NOW }),
    ).toEqual({ status: 'not-connected' });
  });

  it('sends one WhatsApp reminder per meeting, with the title and local time', async () => {
    const net = fakeNetwork([
      googleEvent('a', 8),
      googleEvent('declined', 5, { attendees: [{ self: true, responseStatus: 'declined' }] }),
    ]);
    const first = await runReminders({ config, store, fetch: net.fetch, now: NOW });
    expect(first).toEqual({ status: 'ok', due: 1, sent: 1, failed: 0, error: undefined });
    expect(net.sent).toEqual([{ to: '447700900123', params: ['Meeting a', '16:58'] }]);

    // The next minute's run sees the same meeting and stays quiet; the access token is reused.
    await runReminders({ config, store, fetch: net.fetch, now: NOW + 60_000 });
    expect(net.sent).toHaveLength(1);
    expect(net.refreshes()).toBe(1);
    expect(await unseal(store.link!.refreshSealed, KEY)).toBe('refresh-token');
  });

  it('tries again on the next run when WhatsApp refuses a message', async () => {
    const net = fakeNetwork([googleEvent('a', 8)]);
    net.failWhatsApp(400);
    const failed = await runReminders({ config, store, fetch: net.fetch, now: NOW });
    expect(failed).toMatchObject({ status: 'ok', sent: 0, failed: 1 });
    expect(failed.status === 'ok' && failed.error).toContain('code 132001');

    net.failWhatsApp(200);
    await runReminders({ config, store, fetch: net.fetch, now: NOW + 60_000 });
    expect(net.sent).toHaveLength(1);
  });

  it('forgets the Google link when lasting access has been revoked', async () => {
    const net = fakeNetwork([]);
    net.failRefresh('invalid_grant');
    expect(await runReminders({ config, store, fetch: net.fetch, now: NOW })).toEqual({
      status: 'access-ended',
    });
    expect(store.link).toBeNull();
  });
});

describe('security helpers', () => {
  it('seals tokens so they cannot be read or altered without the key', async () => {
    const sealed = await seal('secret', KEY);
    expect(sealed).not.toContain('secret');
    expect(await unseal(sealed, KEY)).toBe('secret');
    const [iv, ct = ''] = sealed.split('.');
    const tampered = `${iv}.${ct.slice(0, -2)}${ct.endsWith('A') ? 'B' : 'A'}${ct.slice(-1)}`;
    await expect(unseal(tampered, KEY)).rejects.toThrow();
  });

  it('accepts only webhooks signed with the app secret', async () => {
    const body = '{"entry":[]}';
    const good = `sha256=${await hmacSha256Hex('app-secret-0123456789', body)}`;
    expect(await verifySignature('app-secret-0123456789', body, good)).toBe(true);
    expect(await verifySignature('app-secret-0123456789', `${body} `, good)).toBe(false);
    expect(await verifySignature('app-secret-0123456789', body, null)).toBe(false);
  });

  it('reads delivery receipts and nothing else', () => {
    expect(
      statusUpdates({
        entry: [
          {
            changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered' }, { id: 2 }] } }],
          },
          { changes: [{ value: { messages: [{ text: { body: 'hi' } }] } }] },
        ],
      }),
    ).toEqual([{ id: 'wamid.1', status: 'delivered' }]);
    expect(statusUpdates('nonsense')).toEqual([]);
  });

  it('trusts an ID token address only when Google has verified it', () => {
    const token = (claims: object) =>
      `h.${toBase64Url(new TextEncoder().encode(JSON.stringify(claims)))}.s`;
    expect(idTokenEmail(token({ email: 'Owner@Example.com', email_verified: true }))).toBe(
      'owner@example.com',
    );
    expect(idTokenEmail(token({ email: 'owner@example.com', email_verified: false }))).toBeNull();
    expect(idTokenEmail(undefined)).toBeNull();
  });

  it('keeps template text to one short line', () => {
    expect(templateText('Weekly   review\nwith Tyler')).toBe('Weekly review with Tyler');
    expect(templateText('x'.repeat(80))).toHaveLength(60);
    expect(templateText('   ')).toBe('Untitled event');
  });
});
