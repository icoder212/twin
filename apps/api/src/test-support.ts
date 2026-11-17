// Shared by the server's tests: settings for a made-up deployment and an in-memory store.
import type { Config } from './config';
import { toBase64Url } from './crypto';
import type { DeliveryCount, GoogleLink, ReleaseRow, Store, StoredNotification } from './store';

export const KEY = toBase64Url(new Uint8Array(32).fill(7));
export const APP = 'https://twin.example.com';

export const baseConfig: Config = {
  OWNER_GOOGLE_ACCOUNT: 'owner@example.com',
  GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  TOKEN_KEY: KEY,
  WHATSAPP_PROVIDER: 'meta',
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
  EMAIL_TO: undefined,
  WHATSAPP_UPDATE_TEMPLATE: 'release_update',
  ANTHROPIC_API_KEY: undefined,
  CLAUDE_MODEL: 'claude-opus-5-5',
  CLAUDE_FILTER_MODEL: 'claude-haiku-5-5',
  BLS_API_KEY: undefined,
  ALPACA_KEY_ID: undefined,
  ALPACA_SECRET_KEY: undefined,
  FRED_API_KEY: undefined,
  TWILIO_MIN_BALANCE: undefined,
  IG_API_URL: 'https://demo-api.ig.com/gateway/deal',
};

export function memoryStore() {
  const reminders = new Set<string>();
  const sessions = new Map<string, { email: string; csrf: string; expiresAt: number }>();
  const settings = new Map<string, string>();
  const notifications = new Map<string, StoredNotification>();
  const outbound = new Map<string, string>();
  const releases = new Map<string, ReleaseRow>();
  const store: Store & {
    link: GoogleLink | null;
    notifications: typeof notifications;
    releases: typeof releases;
    settings: typeof settings;
  } = {
    link: null,
    notifications,
    releases,
    settings,
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
    async countDeliveries(since) {
      const counts = new Map<string, DeliveryCount>();
      for (const { event } of notifications.values()) {
        if (Date.parse(event.createdAt) < since) continue;
        for (const d of event.deliveries) {
          const key = `${d.channel}|${d.status}`;
          const row = counts.get(key) ?? { channel: d.channel, status: d.status, count: 0 };
          row.count += 1;
          counts.set(key, row);
        }
      }
      return [...counts.values()];
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
    async upsertReleases(rows) {
      for (const row of rows) {
        const existing = releases.get(row.key);
        if (existing && (existing.remindedAt !== null || existing.resultAt !== null)) continue;
        releases.set(row.key, {
          remindedAt: null,
          resultAt: null,
          missedAt: null,
          details: null,
          ...existing,
          ...row,
        });
      }
    },
    async listReleases(from, to) {
      return [...releases.values()]
        .filter((r) => r.at >= from && r.at <= to)
        .sort((x, y) => x.at - y.at);
    },
    async claimReleaseReminder(key, at) {
      const row = releases.get(key);
      if (!row || row.remindedAt !== null) return false;
      releases.set(key, { ...row, remindedAt: at });
      return true;
    },
    async unclaimReleaseReminder(key) {
      const row = releases.get(key);
      if (row) releases.set(key, { ...row, remindedAt: null });
    },
    async claimReleaseResult(key, at, details) {
      const row = releases.get(key);
      if (!row || row.resultAt !== null) return false;
      releases.set(key, { ...row, resultAt: at, details });
      return true;
    },
    async unclaimReleaseResult(key) {
      const row = releases.get(key);
      if (row) releases.set(key, { ...row, resultAt: null, details: null });
    },
    async markReleaseMissed(key, at) {
      const row = releases.get(key);
      if (row && row.missedAt === null) releases.set(key, { ...row, missedAt: at });
    },
  };
  return store;
}
