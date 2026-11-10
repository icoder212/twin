import { beforeEach, describe, expect, it } from 'vitest';
import type { CalendarEvent, NotificationEvent, NotificationPreferences } from '@twindesk/core';
import { handleApi } from './api';
import type { Config } from './config';
import { hmacSha256Hex, seal, toBase64Url, unseal } from './crypto';
import { idTokenEmail } from './google';
import { dueReminders, runReminders } from './reminders';
import { startSession } from './session';
import { DEFAULT_PREFERENCES } from './settings';
import type { GoogleLink, Store, StoredNotification } from './store';
import { statusUpdates, templateText, verifySignature } from './whatsapp';

const KEY = toBase64Url(new Uint8Array(32).fill(7));
const NOW = Date.parse('2026-11-09T16:50:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const APP = 'https://twin.example.com';

const baseConfig: Config = {
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
  APP_ORIGINS: [APP],
  RESEND_API_KEY: undefined,
  RESEND_FROM: 'Desk Twin <onboarding@resend.dev>',
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

function memoryStore() {
  const reminders = new Set<string>();
  const sessions = new Map<string, { email: string; csrf: string; expiresAt: number }>();
  const settings = new Map<string, string>();
  const notifications = new Map<string, StoredNotification>();
  const outbound = new Map<string, string>();
  const store: Store & { link: GoogleLink | null; notifications: typeof notifications } = {
    link: null,
    notifications,
    async getLink() {
      return this.link;
    },
    async saveLink(email, refreshSealed, connectedAt) {
      this.link = { email, refreshSealed, accessSealed: null, accessExpiresAt: null, connectedAt };
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
      reminders.add(key);
      return true;
    },
    async releaseReminder(key) {
      reminders.delete(key);
    },
    async pruneReminders() {},
    async createSession(idHash, email, csrf, _at, expiresAt) {
      sessions.set(idHash, { email, csrf, expiresAt });
    },
    async getSession(idHash, now) {
      const s = sessions.get(idHash);
      return s && s.expiresAt > now ? { email: s.email, csrf: s.csrf } : null;
    },
    async deleteSession(idHash) {
      sessions.delete(idHash);
    },
    async getSetting(key) {
      return settings.get(key) ?? null;
    },
    async putSetting(key, value) {
      settings.set(key, value);
    },
    async saveNotification(e, read) {
      notifications.set(e.id, { event: e, read });
    },
    async getNotification(id) {
      return notifications.get(id) ?? null;
    },
    async listNotifications(limit) {
      return [...notifications.values()]
        .sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt))
        .slice(0, limit);
    },
    async markRead(ids) {
      for (const id of ids) {
        const n = notifications.get(id);
        if (n) notifications.set(id, { ...n, read: true });
      }
    },
    async recordOutbound(messageId, notificationId) {
      outbound.set(messageId, notificationId);
    },
    async notificationForMessage(messageId) {
      return outbound.get(messageId) ?? null;
    },
  };
  return store;
}

/** Fake Google, Meta and Resend endpoints, recording what the server sent. */
function fakeNetwork(events: unknown[]) {
  const whatsapp: string[][] = [];
  const emails: Array<{ to: string[]; subject: string }> = [];
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
        template: { components: Array<{ parameters: Array<{ text: string }> }> };
      };
      whatsapp.push(body.template.components[0]!.parameters.map((p) => p.text));
      return Response.json({ messages: [{ id: `wamid.${whatsapp.length}` }] });
    }
    if (url === 'https://api.resend.com/emails') {
      emails.push(JSON.parse(String(init?.body)) as { to: string[]; subject: string });
      return Response.json({ id: `email_${emails.length}` });
    }
    throw new Error(`Unexpected request to ${url}`);
  }) as typeof fetch;
  return {
    fetch: fakeFetch,
    whatsapp,
    emails,
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

const channelsOf = (e: NotificationEvent | undefined) =>
  e?.deliveries.map((d) => [d.channel, d.status, d.note ?? '']);

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

  const run = (net: ReturnType<typeof fakeNetwork>, config = baseConfig, now = NOW) =>
    runReminders({ config, store, fetch: net.fetch, now });

  it('does nothing until Google is connected', async () => {
    const net = fakeNetwork([]);
    expect(
      await runReminders({ config: baseConfig, store: memoryStore(), fetch: net.fetch, now: NOW }),
    ).toEqual({ status: 'not-connected' });
  });

  it('records each meeting once in the app and sends it where meeting reminders go', async () => {
    const net = fakeNetwork([
      googleEvent('a', 8),
      googleEvent('declined', 5, { attendees: [{ self: true, responseStatus: 'declined' }] }),
    ]);
    expect(await run(net)).toMatchObject({ status: 'ok', due: 1, sent: 1, failed: 0 });
    expect(net.whatsapp).toEqual([['Meeting a', '16:58']]);
    const [recorded] = await store.listNotifications(10);
    expect(recorded?.event).toMatchObject({ topic: 'calendar', title: '16:58: Meeting a' });
    expect(channelsOf(recorded?.event)).toEqual([
      ['in-app', 'delivered', ''],
      ['whatsapp', 'delivered', ''],
    ]);

    // The next minute's run sees the same meeting and stays quiet; the access token is reused.
    await run(net, baseConfig, NOW + 60_000);
    expect(net.whatsapp).toHaveLength(1);
    expect(store.notifications.size).toBe(1);
    expect(net.refreshes()).toBe(1);
    expect(await unseal(store.link!.refreshSealed, KEY)).toBe('refresh-token');
  });

  it('follows the routing: email instead of WhatsApp when chosen', async () => {
    const preferences: NotificationPreferences = {
      ...DEFAULT_PREFERENCES,
      routing: { ...DEFAULT_PREFERENCES.routing, calendar: ['in-app', 'email'] },
    };
    await store.putSetting('notification-preferences', JSON.stringify(preferences), NOW);
    const net = fakeNetwork([googleEvent('a', 8)]);
    await run(net, { ...baseConfig, RESEND_API_KEY: 're_test_key_0123456789' });
    expect(net.whatsapp).toEqual([]);
    expect(net.emails).toEqual([
      expect.objectContaining({
        to: ['owner@example.com'],
        subject: '[Desk Twin] Important: 16:58: Meeting a',
      }),
    ]);
  });

  it('shows email as not set up, rather than sending, until Resend is configured', async () => {
    const preferences: NotificationPreferences = {
      ...DEFAULT_PREFERENCES,
      routing: { ...DEFAULT_PREFERENCES.routing, calendar: ['in-app', 'email'] },
    };
    await store.putSetting('notification-preferences', JSON.stringify(preferences), NOW);
    const net = fakeNetwork([googleEvent('a', 8)]);
    await run(net);
    const [recorded] = await store.listNotifications(10);
    expect(channelsOf(recorded?.event)).toEqual([
      ['in-app', 'delivered', ''],
      ['email', 'skipped', 'No verified address yet'],
    ]);
  });

  it('records a refused WhatsApp message on the notification instead of sending twice', async () => {
    const net = fakeNetwork([googleEvent('a', 8)]);
    net.failWhatsApp(400);
    const outcome = await run(net);
    expect(outcome).toMatchObject({ status: 'ok', sent: 1, failed: 1 });
    const [recorded] = await store.listNotifications(10);
    expect(recorded?.event.deliveries[1]).toMatchObject({ channel: 'whatsapp', status: 'failed' });
    expect(recorded?.event.deliveries[1]?.note).toContain('code 132001');

    net.failWhatsApp(200);
    await run(net, baseConfig, NOW + 60_000);
    expect(store.notifications.size).toBe(1);
  });

  it('forgets the Google link when lasting access has been revoked', async () => {
    const net = fakeNetwork([]);
    net.failRefresh('invalid_grant');
    expect(await run(net)).toEqual({ status: 'access-ended' });
    expect(store.link).toBeNull();
  });
});

describe('the app API', () => {
  let store: ReturnType<typeof memoryStore>;
  let cookies: string;
  let csrf: string;

  beforeEach(async () => {
    store = memoryStore();
    const set = await startSession(store, 'owner@example.com', Date.now());
    cookies = set.map((c) => c.split(';')[0]).join('; ');
    csrf = set[1]!.split(';')[0]!.split('=')[1]!;
  });

  const call = (
    path: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    net = fakeNetwork([]),
  ) => {
    const request = new Request(`https://api.example.com${path}`, {
      method: init.method ?? 'GET',
      headers: { Cookie: cookies, ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return handleApi(request, new URL(request.url), {
      config: baseConfig,
      store,
      fetch: net.fetch,
    });
  };
  const fromApp = { 'X-Requested-With': 'twindesk', Origin: APP };

  it('says who is signed in, and nothing without a session', async () => {
    expect(await (await call('/v1/account')).json()).toMatchObject({
      signedIn: true,
      email: 'owner@example.com',
      channels: { email: false, whatsapp: true },
    });
    cookies = '';
    expect(await (await call('/v1/account')).json()).toEqual({ signedIn: false });
    expect((await call('/v1/notifications')).status).toBe(401);
  });

  it('refuses changes that do not come from the app', async () => {
    const body = { ...DEFAULT_PREFERENCES, privacy: 'minimal' };
    const noToken = await call('/v1/notifications/preferences', {
      method: 'PUT',
      body,
      headers: fromApp,
    });
    expect(noToken.status).toBe(403);
    const otherSite = await call('/v1/notifications/preferences', {
      method: 'PUT',
      body,
      headers: { ...fromApp, 'X-CSRF-Token': csrf, Origin: 'https://evil.example' },
    });
    expect(otherSite.status).toBe(403);

    const saved = await call('/v1/notifications/preferences', {
      method: 'PUT',
      body: {
        ...body,
        routing: { ...DEFAULT_PREFERENCES.routing, calendar: ['email', 'push'] },
      },
      headers: { ...fromApp, 'X-CSRF-Token': csrf },
    });
    expect(saved.status).toBe(200);
    // The app is always kept, and channels this server cannot use are dropped.
    expect(((await saved.json()) as NotificationPreferences).routing.calendar).toEqual([
      'in-app',
      'email',
    ]);
  });

  it('sends a test, lists it in the log and the bell, and acknowledges it', async () => {
    const net = fakeNetwork([]);
    const sent = await call(
      '/v1/notifications/test',
      {
        method: 'POST',
        body: { urgency: 'important' },
        headers: { ...fromApp, 'X-CSRF-Token': csrf },
      },
      net,
    );
    const event = (await sent.json()) as NotificationEvent;
    expect(event.topic).toBe('test');
    expect(net.whatsapp).toHaveLength(1);

    const log = (await (await call('/v1/notifications/events')).json()) as NotificationEvent[];
    expect(log.map((e) => e.id)).toEqual([event.id]);
    const bell = (await (await call('/v1/notifications')).json()) as Array<{ read: boolean }>;
    expect(bell).toHaveLength(1);

    const acked = await call(`/v1/notifications/events/${event.id}/acknowledge`, {
      method: 'POST',
      headers: { ...fromApp, 'X-CSRF-Token': csrf },
    });
    expect(((await acked.json()) as NotificationEvent).acknowledgedVia).toBe('in-app');
  });

  it('only starts sign-in for allowed sites', async () => {
    const bad = await call('/v1/auth/google/start?origin=https://evil.example');
    expect(bad.status).toBe(400);
    const good = await call(
      `/v1/auth/google/start?origin=${encodeURIComponent(APP)}&return=/notifications`,
    );
    expect(good.status).toBe(302);
    expect(good.headers.get('Location')).toContain(
      encodeURIComponent(`${APP}/v1/auth/google/callback`),
    );
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
