/**
 * Mirrors server/schema.sql statement for statement (tests/room.test.ts
 * asserts it). The PlayerFile DO runs these on a fresh D1 database at first
 * touch, so an unmigrated deploy degrades to "created now" instead of
 * refusing every join. Types-free so the client tsconfig can import it.
 */
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ghostfile (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0,
  depth      INTEGER NOT NULL DEFAULT 1,
  scrip      INTEGER NOT NULL DEFAULT 0,
  wakelight  INTEGER NOT NULL DEFAULT 0,
  salvage    INTEGER NOT NULL DEFAULT 0,
  owned      TEXT NOT NULL DEFAULT '[]',
  loadout    TEXT NOT NULL DEFAULT '{}',
  wears      TEXT NOT NULL DEFAULT '[]',
  crafts     INTEGER NOT NULL DEFAULT 0,
  matches    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  extras     TEXT NOT NULL DEFAULT '{}'
)`,
  `CREATE TABLE IF NOT EXISTS ledger (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  line    TEXT NOT NULL,
  at      INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS ledger_account ON ledger (account, seq)`,
  `CREATE TABLE IF NOT EXISTS wallet (
  address    TEXT PRIMARY KEY,
  account    TEXT NOT NULL UNIQUE,
  linked_at  INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS siwe_nonce (
  account TEXT PRIMARY KEY,
  nonce   TEXT NOT NULL,
  at      INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS prize_epoch (
  epoch INTEGER PRIMARY KEY,
  json  TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS run_day (
  day     INTEGER NOT NULL,
  file    TEXT NOT NULL,
  units   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, file)
)`,
  `CREATE TABLE IF NOT EXISTS run_settled (
  day       INTEGER PRIMARY KEY,
  epoch     INTEGER NOT NULL,
  units     INTEGER NOT NULL,
  minted    TEXT NOT NULL,
  rate      TEXT NOT NULL,
  settled_at INTEGER NOT NULL
)`,
];

/** Column additions for databases created before a column existed (each is ignored when the column is already there). */
export const MIGRATIONS = [`ALTER TABLE ghostfile ADD COLUMN extras TEXT NOT NULL DEFAULT '{}'`];
