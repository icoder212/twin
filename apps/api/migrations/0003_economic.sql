-- US economic releases for the owner's watch, one row per release, so each reminder and each
-- set of published figures goes out once. Dates come from FRED and the Federal Reserve.
CREATE TABLE economic_releases (
  key TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  release_date TEXT NOT NULL,
  at INTEGER NOT NULL,
  reminded_at INTEGER,
  result_at INTEGER,
  missed_at INTEGER,
  details TEXT
);
CREATE INDEX economic_releases_by_time ON economic_releases (at);
