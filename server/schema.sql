-- MELTDOWN Ghostfile rows (Cloudflare D1). Applied with: npx wrangler d1 execute meltdown-ghostfile --file=server/schema.sql
CREATE TABLE IF NOT EXISTS ghostfile (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0,
  depth      INTEGER NOT NULL DEFAULT 1,
  scrip      INTEGER NOT NULL DEFAULT 0,
  wakelight  INTEGER NOT NULL DEFAULT 0,
  salvage    INTEGER NOT NULL DEFAULT 0,
  owned      TEXT NOT NULL DEFAULT '[]',   -- JSON list of Ledger Graph item ids
  loadout    TEXT NOT NULL DEFAULT '{}',   -- JSON, last attested loadout
  wears      TEXT NOT NULL DEFAULT '[]',   -- JSON list of crafted wear ids (id#seed)
  crafts     INTEGER NOT NULL DEFAULT 0,
  matches    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  extras     TEXT NOT NULL DEFAULT '{}'   -- JSON: mastery, stamps, counters (Stage 7)
);

-- Append-only ledger: every settlement, purchase, refund and craft leaves a line.
CREATE TABLE IF NOT EXISTS ledger (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  line    TEXT NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_account ON ledger (account, seq);

-- The counter-ledger index: one wallet per Ghostfile, one Ghostfile per wallet (Stage 11b).
CREATE TABLE IF NOT EXISTS wallet (
  address    TEXT PRIMARY KEY,
  account    TEXT NOT NULL UNIQUE,
  linked_at  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS siwe_nonce (
  account TEXT PRIMARY KEY,
  nonce   TEXT NOT NULL,
  at      INTEGER NOT NULL
);

-- Posted prize epochs (Stage 15): the Merkle leaves with proofs, so claims can be served.
CREATE TABLE IF NOT EXISTS prize_epoch (
  epoch INTEGER PRIMARY KEY,
  json  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS run_day (
  day     INTEGER NOT NULL,
  file    TEXT NOT NULL,
  units   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, file)
);
-- The day as the economy reads it (Stage 38). run_day.units is spent down as files are paid and
-- run_settled.units is only what the night settled, so neither is the day's gross. Nothing ever
-- subtracts from this table: it is what capUse and runnerShare are measured from.
CREATE TABLE IF NOT EXISTS run_day_stat (
  day      INTEGER NOT NULL,
  file     TEXT NOT NULL,
  gross    INTEGER NOT NULL DEFAULT 0,  -- units banked, never reduced
  eligible INTEGER NOT NULL DEFAULT 0,  -- 1 once the file is past the run's Depth gate
  PRIMARY KEY (day, file)
);
CREATE TABLE IF NOT EXISTS run_settled (
  day       INTEGER PRIMARY KEY,
  epoch     INTEGER NOT NULL,
  units     INTEGER NOT NULL,
  minted    TEXT NOT NULL,
  rate      TEXT NOT NULL,
  settled_at INTEGER NOT NULL
);
-- a device's frame report (Stage 50): one row per ?perf=1 session, read back by GET /perf
CREATE TABLE IF NOT EXISTS perf_report (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  build     TEXT NOT NULL,
  ua        TEXT NOT NULL,
  gpu       TEXT NOT NULL,
  viewport  TEXT NOT NULL,
  dpr       REAL NOT NULL,
  touch     INTEGER NOT NULL,
  scale     REAL NOT NULL,
  calls     INTEGER NOT NULL,
  triangles INTEGER NOT NULL,
  level     TEXT NOT NULL,
  frames    INTEGER NOT NULL,
  seconds   REAL NOT NULL,
  p50       REAL NOT NULL,
  p95       REAL NOT NULL,
  p99       REAL NOT NULL,
  max       REAL NOT NULL,
  fps       REAL NOT NULL
);
-- the endgame on one server (Stage 51): the Workers keep these in the Endgame Durable Object
CREATE TABLE IF NOT EXISTS audit_entry (
  seq  INTEGER PRIMARY KEY AUTOINCREMENT,
  week INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_entry_week ON audit_entry (week, seq);
CREATE TABLE IF NOT EXISTS season (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);
