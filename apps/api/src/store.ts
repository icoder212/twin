import {
  usReleaseSchema,
  notificationEventSchema,
  type UsRelease,
  type NotificationEvent,
} from '@twindesk/core';
import type { D1Database } from './worker-types';

export interface GoogleLink {
  email: string;
  refreshSealed: string;
  accessSealed: string | null;
  accessExpiresAt: number | null;
  connectedAt: number;
}

export interface StoredNotification {
  event: NotificationEvent;
  read: boolean;
}

/** One scheduled US release and what has been sent for it. */
export interface ReleaseRow {
  key: string;
  event: UsRelease;
  releaseDate: string;
  at: number;
  remindedAt: number | null;
  resultAt: number | null;
  missedAt: number | null;
  details: string | null;
}

/** Persistence the reminder run needs. D1 in production; an in-memory version in tests. */
export interface Store {
  getLink(): Promise<GoogleLink | null>;
  saveLink(email: string, refreshSealed: string, at: number): Promise<void>;
  saveAccess(accessSealed: string, expiresAt: number): Promise<void>;
  clearAccess(): Promise<void>;
  deleteLink(): Promise<void>;
  /** True only the first time a key is claimed, so each meeting gets one message. */
  claimReminder(key: string, at: number): Promise<boolean>;
  /** Gives a claim back when a reminder could not be recorded, so the next run tries again. */
  releaseReminder(key: string): Promise<void>;
  pruneReminders(before: number): Promise<void>;

  createSession(
    idHash: string,
    email: string,
    csrf: string,
    at: number,
    expiresAt: number,
  ): Promise<void>;
  getSession(idHash: string, now: number): Promise<{ email: string; csrf: string } | null>;
  deleteSession(idHash: string): Promise<void>;

  getSetting(key: string): Promise<string | null>;
  putSetting(key: string, value: string, at: number): Promise<void>;

  /** Inserts or replaces one notification. */
  saveNotification(event: NotificationEvent, read: boolean): Promise<void>;
  getNotification(id: string): Promise<StoredNotification | null>;
  /** Newest first. */
  listNotifications(limit: number): Promise<StoredNotification[]>;
  markRead(ids: string[]): Promise<void>;
  /** Links a provider's message id to a notification, for delivery receipts. */
  recordOutbound(messageId: string, notificationId: string, channel: string): Promise<void>;
  notificationForMessage(messageId: string): Promise<string | null>;

  /** Adds releases, or moves one whose date changed before anything was sent for it. */
  upsertReleases(
    rows: Array<Pick<ReleaseRow, 'key' | 'event' | 'releaseDate' | 'at'>>,
  ): Promise<void>;
  /** Releases due between two times, earliest first. */
  listReleases(from: number, to: number): Promise<ReleaseRow[]>;
  /** True only the first time, so each release gets one reminder. */
  claimReleaseReminder(key: string, at: number): Promise<boolean>;
  unclaimReleaseReminder(key: string): Promise<void>;
  /** True only the first time, so the figures are posted once. */
  claimReleaseResult(key: string, at: number, details: string): Promise<boolean>;
  unclaimReleaseResult(key: string): Promise<void>;
  markReleaseMissed(key: string, at: number): Promise<void>;
}

interface NotificationRow {
  event: string;
  read: number;
}

/** Rows were written by this server, but an unreadable one is skipped rather than trusted. */
function toStored(row: NotificationRow): StoredNotification | null {
  try {
    const event = notificationEventSchema.safeParse(JSON.parse(row.event));
    return event.success ? { event: event.data, read: row.read === 1 } : null;
  } catch {
    return null;
  }
}

interface ReleaseDbRow {
  key: string;
  event: string;
  release_date: string;
  at: number;
  reminded_at: number | null;
  result_at: number | null;
  missed_at: number | null;
  details: string | null;
}

function toRelease(row: ReleaseDbRow): ReleaseRow | null {
  const event = usReleaseSchema.safeParse(row.event);
  if (!event.success) return null;
  return {
    key: row.key,
    event: event.data,
    releaseDate: row.release_date,
    at: row.at,
    remindedAt: row.reminded_at,
    resultAt: row.result_at,
    missedAt: row.missed_at,
    details: row.details,
  };
}

interface LinkRow {
  email: string;
  refresh_sealed: string;
  access_sealed: string | null;
  access_expires_at: number | null;
  connected_at: number;
}

export function d1Store(db: D1Database): Store {
  return {
    async getLink() {
      const row = await db
        .prepare(
          'SELECT email, refresh_sealed, access_sealed, access_expires_at, connected_at FROM google_link WHERE id = 1',
        )
        .first<LinkRow>();
      return row
        ? {
            email: row.email,
            refreshSealed: row.refresh_sealed,
            accessSealed: row.access_sealed,
            accessExpiresAt: row.access_expires_at,
            connectedAt: row.connected_at,
          }
        : null;
    },
    async saveLink(email, refreshSealed, at) {
      await db
        .prepare(
          `INSERT INTO google_link (id, email, refresh_sealed, connected_at) VALUES (1, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET email = excluded.email,
             refresh_sealed = excluded.refresh_sealed, access_sealed = NULL,
             access_expires_at = NULL, connected_at = excluded.connected_at`,
        )
        .bind(email, refreshSealed, at)
        .run();
    },
    async saveAccess(accessSealed, expiresAt) {
      await db
        .prepare('UPDATE google_link SET access_sealed = ?, access_expires_at = ? WHERE id = 1')
        .bind(accessSealed, expiresAt)
        .run();
    },
    async clearAccess() {
      await db
        .prepare(
          'UPDATE google_link SET access_sealed = NULL, access_expires_at = NULL WHERE id = 1',
        )
        .run();
    },
    async deleteLink() {
      await db.prepare('DELETE FROM google_link WHERE id = 1').run();
    },
    async claimReminder(key, at) {
      const result = await db
        .prepare('INSERT OR IGNORE INTO reminders (event_key, claimed_at) VALUES (?, ?)')
        .bind(key, at)
        .run();
      return result.meta.changes === 1;
    },
    async releaseReminder(key) {
      await db.prepare('DELETE FROM reminders WHERE event_key = ?').bind(key).run();
    },
    async pruneReminders(before) {
      await db.prepare('DELETE FROM reminders WHERE claimed_at < ?').bind(before).run();
      await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(before).run();
      await db.prepare('DELETE FROM economic_releases WHERE at < ?').bind(before).run();
    },
    async createSession(idHash, email, csrf, at, expiresAt) {
      await db
        .prepare(
          'INSERT INTO sessions (id_hash, email, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(idHash, email, csrf, at, expiresAt)
        .run();
    },
    async getSession(idHash, now) {
      return db
        .prepare('SELECT email, csrf FROM sessions WHERE id_hash = ? AND expires_at > ?')
        .bind(idHash, now)
        .first<{ email: string; csrf: string }>();
    },
    async deleteSession(idHash) {
      await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
    },
    async getSetting(key) {
      const row = await db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .bind(key)
        .first<{ value: string }>();
      return row?.value ?? null;
    },
    async putSetting(key, value, at) {
      await db
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(key, value, at)
        .run();
    },
    async saveNotification(event, read) {
      await db
        .prepare(
          'INSERT OR REPLACE INTO notifications (id, created_at, read, event) VALUES (?, ?, ?, ?)',
        )
        .bind(event.id, Date.parse(event.createdAt), read ? 1 : 0, JSON.stringify(event))
        .run();
    },
    async getNotification(id) {
      const row = await db
        .prepare('SELECT event, read FROM notifications WHERE id = ?')
        .bind(id)
        .first<NotificationRow>();
      return row ? toStored(row) : null;
    },
    async listNotifications(limit) {
      const { results } = await db
        .prepare('SELECT event, read FROM notifications ORDER BY created_at DESC LIMIT ?')
        .bind(limit)
        .all<NotificationRow>();
      return results.map(toStored).filter((n): n is StoredNotification => n !== null);
    },
    async markRead(ids) {
      for (const id of ids.slice(0, 100)) {
        await db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').bind(id).run();
      }
    },
    async recordOutbound(messageId, notificationId, channel) {
      await db
        .prepare(
          'INSERT OR REPLACE INTO outbound_messages (message_id, notification_id, channel) VALUES (?, ?, ?)',
        )
        .bind(messageId, notificationId, channel)
        .run();
    },
    async notificationForMessage(messageId) {
      const row = await db
        .prepare('SELECT notification_id FROM outbound_messages WHERE message_id = ?')
        .bind(messageId)
        .first<{ notification_id: string }>();
      return row?.notification_id ?? null;
    },
    async upsertReleases(rows) {
      for (const row of rows) {
        await db
          .prepare(
            `INSERT INTO economic_releases (key, event, release_date, at) VALUES (?, ?, ?, ?)
             ON CONFLICT (key) DO UPDATE SET at = excluded.at
             WHERE reminded_at IS NULL AND result_at IS NULL`,
          )
          .bind(row.key, row.event, row.releaseDate, row.at)
          .run();
      }
    },
    async listReleases(from, to) {
      const { results } = await db
        .prepare(
          `SELECT key, event, release_date, at, reminded_at, result_at, missed_at, details
           FROM economic_releases WHERE at >= ? AND at <= ? ORDER BY at LIMIT 200`,
        )
        .bind(from, to)
        .all<ReleaseDbRow>();
      return results.map(toRelease).filter((r): r is ReleaseRow => r !== null);
    },
    async claimReleaseReminder(key, at) {
      const result = await db
        .prepare(
          'UPDATE economic_releases SET reminded_at = ? WHERE key = ? AND reminded_at IS NULL',
        )
        .bind(at, key)
        .run();
      return result.meta.changes === 1;
    },
    async unclaimReleaseReminder(key) {
      await db
        .prepare('UPDATE economic_releases SET reminded_at = NULL WHERE key = ?')
        .bind(key)
        .run();
    },
    async claimReleaseResult(key, at, details) {
      const result = await db
        .prepare(
          'UPDATE economic_releases SET result_at = ?, details = ? WHERE key = ? AND result_at IS NULL',
        )
        .bind(at, details, key)
        .run();
      return result.meta.changes === 1;
    },
    async unclaimReleaseResult(key) {
      await db
        .prepare('UPDATE economic_releases SET result_at = NULL, details = NULL WHERE key = ?')
        .bind(key)
        .run();
    },
    async markReleaseMissed(key, at) {
      await db
        .prepare('UPDATE economic_releases SET missed_at = ? WHERE key = ? AND missed_at IS NULL')
        .bind(at, key)
        .run();
    },
  };
}
