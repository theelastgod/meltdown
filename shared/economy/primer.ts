/**
 * The four books, in the order the desk prints them.
 *
 * Scrip and Wakelight stay on the file. Chits are the contest credit. $CAPITAL is the
 * EVM token. No contract is posted until the host publishes one. The sentences here
 * are the ones the file panel and the wallet page show.
 * A city job pays XP and stamps. shared/city/reward.ts keeps the zero for chits.
 */
import { MAX_CAPITAL_PER_UNIT, RUN_DEPTH } from "../sim/run";

export interface LedgerBook {
  id: "scrip" | "wakelight" | "chits" | "capital";
  name: string;
  /** true only for the EVM token */
  token: boolean;
  earned: string;
  buys: string;
  never: string;
}

export const BOOKS: readonly LedgerBook[] = [
  {
    id: "scrip",
    name: "SCRIP",
    token: false,
    earned: "MATCHES, THE CAMPAIGN, CONTRACTS, THE CONTEST POT",
    buys: "GRAPH NODES AND CHIPS",
    never: "STAYS ON THE FILE. IT IS NOT A TOKEN.",
  },
  {
    id: "wakelight",
    name: "WAKELIGHT",
    token: false,
    earned: "A REWRITE AT DEPTH 50, AND DAILY CONTRACTS",
    buys: "CRT THEMES, ALIAS SLOTS, PRESET SLOTS",
    never: "STAYS ON THE FILE. IT IS NOT A TOKEN.",
  },
  {
    id: "chits",
    name: "CHITS",
    token: false,
    earned: "ONLY WHERE ANOTHER PLAYER CAN TAKE THEM",
    buys: `DEPTH ${RUN_DEPTH} TURNS THEM INTO UNITS IN TONIGHT'S POT. BELOW THAT, THEY BECOME SCRIP.`,
    never: "NO TRADE, NO GIFT, NO MAIL. THEY BUY NO STAT.",
  },
  {
    id: "capital",
    name: "$CAPITAL",
    token: true,
    earned: `BANKED UNITS, SETTLED TONIGHT, AT MOST ${MAX_CAPITAL_PER_UNIT} EACH`,
    buys: "A NAME, A SKIN, A SEASON, A PRIVATE ROOM",
    never: "LEAVES HEALTH, DAMAGE, SHIELD, RECOIL, WEAPONS, AND NODES ALONE.",
  },
];

/** The one sentence. The lint fails the build if a priced item grows a stat. */
export const CAPITAL_RULE = "$CAPITAL NEVER CHANGES A STAT. NO WAGER. NO STAKE. NO PAID RANDOMNESS.";

/** The words on the title, the menu, and the wallet. The rules under them do not change. */
export const P2E_MARK = "PLAY TO EARN";

/** How a unit becomes a token. A kill mints nothing. */
export const EARN_PATH = "PLAY TO EARN. BANK A CLAIM AT A GATE, OR EXCHANGE CHITS ONCE DEPTH REACHES 10. THE NIGHT SPLITS ONE POT. AN EMPTY POCKET PAYS THE KILLER NOTHING.";

/** The wallet page says this before a wallet is connected, and after. Below the gate the bank still pays Scrip. */
export const P2E_DESK = `PLAY TO EARN. $CAPITAL OPENS AT DEPTH ${RUN_DEPTH}. BANK A CLAIM AT A GATE. THE NIGHT SENDS IT, AT MOST 1 EACH.`;

/** PvE pays the file. It does not mint a cash-out. */
export const CHIT_ZERO_LINE = "CITY JOBS, STREET RUNS, AND CONTRACTS PAY XP AND STAMPS, AND ZERO CHITS.";

/**
 * The Solana Token-2022 mint that already exists. It is not the launch contract.
 * The launch chain is BNB Smart Chain. A missing capital address prints EVM_DARK_LINE.
 */
export const PUBLIC_MINT = "kLtXrN1jJ5YcCmVaGbgD1f65Jfej72xaSWG9fDPpump";

/** What the desk says until a BNB capital contract is published. Nothing has been sent. */
export const EVM_DARK_LINE = "BNB · NO CONTRACT POSTED · THE NIGHT HAS NOT SENT $CAPITAL";

/**
 * A connected EVM wallet can earn immediately: the units land on the file at the gate.
 * The token itself still waits for the night, and below Depth 10 the bank pays Scrip.
 */
export function earnReadyLine(depth: number | null): string {
  const d = depth !== null && Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : null;
  if (d !== null && d < RUN_DEPTH) return `PLAY TO EARN OPENS AT DEPTH ${RUN_DEPTH}. DEPTH ${d}. THIS BANK PAYS SCRIP.`;
  return "PLAY TO EARN. THIS WALLET EARNS $CAPITAL. BANK A CLAIM AT A GATE. THE UNITS ARE ON THE FILE NOW. THE NIGHT SENDS THEM, AT MOST 1 EACH.";
}

/**
 * The day's claim. Units are a record. This sentence never means a transfer happened.
 * Below the gate the bank pays Scrip. At the gate the night splits the pot, at most one token each.
 */
export function claimRecord(owed: number, depth: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(owed) ? owed : 0));
  const d = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
  const word = n === 1 ? "UNIT" : "UNITS";
  if (d >= RUN_DEPTH) return `OWED ${n} ${word} · SETTLES TONIGHT · AT MOST ${MAX_CAPITAL_PER_UNIT} $CAPITAL EACH · NOT SENT`;
  return `OWED ${n} ${word} · DEPTH ${d} · BELOW DEPTH ${RUN_DEPTH} THIS BANK PAYS SCRIP · NOT SENT`;
}

/**
 * What this file's chits do tonight.
 * Below the gate they become Scrip. At the gate they are units in the same pot THE RUN settles.
 */
export function chitFate(depth: number): string {
  const d = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
  if (d >= RUN_DEPTH) return `DEPTH ${d}. THESE CHITS ARE UNITS IN TONIGHT'S POT, AT MOST ${MAX_CAPITAL_PER_UNIT} $CAPITAL EACH.`;
  return `DEPTH ${d}. THESE CHITS EXCHANGE FOR SCRIP. $CAPITAL OPENS AT DEPTH ${RUN_DEPTH}.`;
}
