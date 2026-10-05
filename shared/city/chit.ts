/**
 * The chit: one off-chain balance on the Ghostfile.
 *
 * A public event, a street run and a contract pay none (shared/city/reward.ts). A chit is earned
 * where another file can take it — inside a contest block — and it leaves a file only by being
 * dropped there. It never buys a stat. Depth below THE RUN's gate can hold chits and can lose
 * them; the exchange pays Scrip, and that Scrip is not $CAPITAL. At the gate, banked chits are
 * units in the same nightly pot THE RUN already settles. Burning $CAPITAL for chits is a sink:
 * the buyer names the price, the burn is the whole price, and nothing here sends the transaction.
 */
import type { Account, CounterRecord } from "../progression/account";
import { RUN_DAILY_CAP, RUN_DEPTH, RUN_SCRIP_PER_UNIT } from "../sim/run";

/** What a PvE credit pays in chits. The reward module keeps its own copy so it never imports this file. */
export const PVE_CHITS = 0;

/** The contest's session pot. One pot, split by placement. Not a mint per kill. */
export const CONTEST_POT = 10;

/** The desk's sentence when chain id, RPC and a capital address are absent. */
export const CHAIN_DARK_LINE = "CHAIN DARK · THE EXCHANGE NAMES NO BALANCE";

const LEDGER_CAP = 200;

export function fileChits(a: Account): number {
  const n = a.chits ?? 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Depth 10, the same gate THE RUN uses. Below it the exchange is Scrip. */
export const canExchange = (depth: number): boolean => depth >= RUN_DEPTH;

function pushLedger(a: Account, line: string): void {
  a.ledger.push(line);
  if (a.ledger.length > LEDGER_CAP) a.ledger.splice(0, a.ledger.length - LEDGER_CAP);
}

function runRow(a: Account, day: number): NonNullable<CounterRecord["run"]> {
  if (!a.counter) a.counter = { address: null, linkedAt: 0, ghostfile: 0, stamps: [], name: null, rig: [], worn: 0, capital: "0" };
  const prev = a.counter.run;
  const run = prev && prev.day === day ? prev : { day, banked: 0, owed: prev?.owed ?? 0, paid: prev?.paid ?? 0, clearedDay: prev?.clearedDay };
  a.counter.run = run;
  return run;
}

/**
 * Move the file's chits into the day's units, or into Scrip below Depth 10.
 * Units dilute the pot. There is no per-chit price. The caller passes `units` to the run store.
 */
export function exchangeChits(a: Account, day: number): { units: number; scrip: number; line: string } {
  const have = fileChits(a);
  if (have <= 0) return { units: 0, scrip: 0, line: "CHITS · NONE TO EXCHANGE" };
  if (!canExchange(a.depth)) {
    const scrip = have * RUN_SCRIP_PER_UNIT;
    a.wallet.scrip += scrip;
    a.chits = 0;
    const line = `CHITS · ${have} · DEPTH ${a.depth} · +${scrip} SCRIP · NOT CAPITAL`;
    pushLedger(a, line);
    return { units: 0, scrip, line };
  }
  const run = runRow(a, day);
  const room = Math.max(0, RUN_DAILY_CAP - run.banked);
  const units = Math.min(have, room);
  run.banked += units;
  run.owed += units;
  a.chits = have - units;
  const line = units > 0 ? `CHITS · ${units} UNITS · SETTLES TONIGHT` : `CHITS · DAY CAP ${RUN_DAILY_CAP}`;
  pushLedger(a, line);
  return { units, scrip: 0, line };
}

/**
 * $CAPITAL named by the buyer, burned in full, credited 1:1 as chits. No bonus, no yield.
 * A non-positive price credits nothing. The chain write is not this function's.
 */
export function chitsFromBurn(namedPrice: number): { burn: number; chits: number } {
  if (!Number.isFinite(namedPrice) || namedPrice <= 0) return { burn: 0, chits: 0 };
  const n = Math.min(1_000_000, Math.floor(namedPrice));
  return { burn: n, chits: n };
}

/** Credit chits a verified burn already paid for. A zero credit is a no-op. */
export function creditBurnedChits(a: Account, chits: number): number {
  const n = Number.isFinite(chits) ? Math.max(0, Math.floor(chits)) : 0;
  if (n <= 0) return fileChits(a);
  a.chits = fileChits(a) + n;
  return a.chits;
}

/**
 * A chit price does not write a stat. The number that goes in is the number that comes out.
 * A catalog item that prices a mechanical field fails the economy lint; this is the runtime twin.
 */
export function chitBuysStat<T>(stat: T): T {
  return stat;
}

/** The one ledger line. Below the gate it names Scrip. With the chain dark it says so. */
export function chitDeskLine(chits: number, depth: number, chainLive: boolean): string {
  const n = Math.max(0, Math.floor(Number.isFinite(chits) ? chits : 0));
  const gate = depth >= RUN_DEPTH ? "UNITS THAT SETTLE TONIGHT" : `DEPTH ${depth} HOLDS THEM · EXCHANGE PAYS SCRIP`;
  return `CHITS · ${n} · ${gate}${chainLive ? "" : ` · ${CHAIN_DARK_LINE}`}`;
}
