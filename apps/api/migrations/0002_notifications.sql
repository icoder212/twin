-- Signed-in browser sessions. The app reaches this server on its own domain (/v1 is proxied),
-- so the cookies are first-party. Only a hash of the session token is stored.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- The owner's settings, such as notification preferences, as JSON validated by the shared schemas.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Every notification and where it went: the app's bell and delivery log read from here.
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  event TEXT NOT NULL
);
CREATE INDEX notifications_by_time ON notifications (created_at);

-- Provider message ids, so delivery receipts find their notification.
CREATE TABLE outbound_messages (
  message_id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  channel TEXT NOT NULL
);
