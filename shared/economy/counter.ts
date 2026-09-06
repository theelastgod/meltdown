/**
 * The counter-ledger as the file sees it: the wallet link, the Ghostfile token, the stamps that
 * reached the chain, the name, the rig (owned skins, cached from chain) and the worn skin. Plain
 * data on the account (`account.counter`, typed in shared/progression/account.ts so the match
 * room never imports this module); the helpers here are what the hosts and the panel share.
 */
import type { Account, CounterRecord } from "../progression/account";
import { SKINS, skinByToken } from "./catalog";

/** EIP-712 domains and types: the same bytes the contracts hash (contracts/*.sol). */
export const VOUCHER_DOMAINS = { ghostfile: "MELTDOWN Ghostfile", stamps: "MELTDOWN Stamps", names: "MELTDOWN Names" } as const;
export const VOUCHER_TYPES = {
  Link: [{ name: "wallet", type: "address" }, { name: "fileId", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
  Stamp: [{ name: "wallet", type: "address" }, { name: "fileId", type: "bytes32" }, { name: "stampId", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
  Name: [{ name: "wallet", type: "address" }, { name: "name", type: "string" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
} as const;

/** SIWE statement the panel signs; the host refuses any other statement. */
export const SIWE_STATEMENT = "COUNTER-LEDGER LINK: bind this wallet to my Ghostfile. This signs nothing else.";
/** Relinking a file to another wallet waits this long. */
export const RELINK_COOLDOWN_MS = 30 * 86_400_000;
/** The name registry opens at Depth 50 (Chapter III). */
export const NAME_DEPTH = 50;
/** devnet / testnet only: the launch distribution to a Depth-10+ file at link, in whole $CAPITAL */
export const LAUNCH_GRANT = 1000;
export const LAUNCH_GRANT_DEPTH = 10;

/** Mirror of Names.priceOf: 3 → 2000 … 12+ → 150 $CAPITAL. */
export function nameFee(len: number): number | null {
  if (len < 3 || len > 24) return null;
  if (len === 3) return 2000;
  if (len === 4) return 1000;
  if (len === 5) return 600;
  if (len <= 7) return 400;
  if (len <= 11) return 250;
  return 150;
}

export const validName = (n: string): boolean => /^[A-Z0-9_-]{3,24}$/.test(n);

export const emptyCounter = (): CounterRecord => ({ address: null, linkedAt: 0, ghostfile: 0, stamps: [], name: null, rig: [], worn: 0, capital: "0", run: { day: 0, banked: 0, owed: 0, paid: 0 } });

/** THE RUN's payout rules live with the sim (shared/sim/run.ts) so the match room never imports this module; re-exported for the panel and the ledger. */
export { MAX_CAPITAL_PER_UNIT, RUN_DAILY_CAP, RUN_DEPTH, RUN_SCRIP_PER_UNIT } from "../sim/run";
import { RUN_DEPTH } from "../sim/run";

/** Wear an owned skin (token id) or 0 for none. Cached ownership is enough: equipping never waits on a chain read. */
export function wearSkin(a: Account, token: number): { ok: boolean; reason?: string } {
  const c = a.counter ?? emptyCounter();
  if (token !== 0 && !c.rig.includes(token)) return { ok: false, reason: "not on your rig" };
  if (token !== 0 && !skinByToken(token)) return { ok: false, reason: "unknown skin" };
  a.counter = { ...c, worn: token };
  return { ok: true };
}

/** What the panel shows; identity and ownership only. */
export function counterView(a: Account) {
  const c = a.counter ?? emptyCounter();
  return {
    linked: !!c.address,
    address: c.address,
    ghostfile: c.ghostfile,
    stamps: c.stamps.length,
    name: c.name,
    rig: c.rig.map((t) => ({ token: t, id: skinByToken(t)?.id ?? `token:${t}`, name: skinByToken(t)?.name ?? `TOKEN ${t}`, worn: c.worn === t })),
    worn: c.worn,
    capital: c.capital,
    nameOpen: a.depth >= NAME_DEPTH && !c.name,
    run: c.run ?? { day: 0, banked: 0, owed: 0, paid: 0 },
    runGate: a.depth >= RUN_DEPTH,
    skins: SKINS.map((s) => ({ ...s, owned: c.rig.includes(s.token) })),
    /** the sinks (Stage 19): Deep Wake seasons bought out, and unspent private room-hours */
    seasons: c.seasons ?? [],
    roomHours: c.roomHours ?? 0,
  };
}
