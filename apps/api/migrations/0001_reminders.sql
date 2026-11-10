-- One Google account (the owner's) for the first slice; becomes per-user with real sign-in.
CREATE TABLE google_link (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL,
  -- AES-GCM sealed with TOKEN_KEY; never stored in the clear.
  refresh_sealed TEXT NOT NULL,
  access_sealed TEXT,
  access_expires_at INTEGER,
  connected_at INTEGER NOT NULL
);

-- One row per meeting reminded, so each meeting gets exactly one message.
CREATE TABLE reminders (
  event_key TEXT PRIMARY KEY,
  claimed_at INTEGER NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sending'
);
CREATE INDEX reminders_by_message ON reminders (message_id);
