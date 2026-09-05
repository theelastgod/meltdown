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
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- Append-only ledger: every settlement, purchase, refund and craft leaves a line.
CREATE TABLE IF NOT EXISTS ledger (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  line    TEXT NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_account ON ledger (account, seq);
