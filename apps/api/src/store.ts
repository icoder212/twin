import type { D1Database } from './worker-types';

export interface GoogleLink {
  email: string;
  refreshSealed: string;
  accessSealed: string | null;
  accessExpiresAt: number | null;
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
  /** Gives a claim back after a failed send, so the next run tries again. */
  releaseReminder(key: string): Promise<void>;
  markSent(key: string, messageId: string): Promise<void>;
  /** Delivery receipts from the WhatsApp webhook: sent, delivered, read or failed. */
  updateDelivery(messageId: string, status: string): Promise<void>;
  pruneReminders(before: number): Promise<void>;
}

interface LinkRow {
  email: string;
  refresh_sealed: string;
  access_sealed: string | null;
  access_expires_at: number | null;
}

export function d1Store(db: D1Database): Store {
  return {
    async getLink() {
      const row = await db
        .prepare(
          'SELECT email, refresh_sealed, access_sealed, access_expires_at FROM google_link WHERE id = 1',
        )
        .first<LinkRow>();
      return row
        ? {
            email: row.email,
            refreshSealed: row.refresh_sealed,
            accessSealed: row.access_sealed,
            accessExpiresAt: row.access_expires_at,
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
    async markSent(key, messageId) {
      await db
        .prepare("UPDATE reminders SET message_id = ?, status = 'sent' WHERE event_key = ?")
        .bind(messageId, key)
        .run();
    },
    async updateDelivery(messageId, status) {
      await db
        .prepare('UPDATE reminders SET status = ? WHERE message_id = ?')
        .bind(status, messageId)
        .run();
    },
    async pruneReminders(before) {
      await db.prepare('DELETE FROM reminders WHERE claimed_at < ?').bind(before).run();
    },
  };
}
