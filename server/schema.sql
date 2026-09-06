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
