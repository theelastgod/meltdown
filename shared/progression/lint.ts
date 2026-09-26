/**
 * The Depth ladder lint: what a file receives for climbing, checked as a ladder (Stage 659).
 *
 * Every other check in the project asks whether a reward is *correct* — reconciled, inside the TTK
 * band, priced against its benefits. None of them can ask whether a Depth pays anything at all,
 * because a Depth that grants nothing has nothing to check. Measured before this stage, the whole
 * ladder was spent by Depth 30 at 32% of the climb: Depths 31–49 were nineteen consecutive levels
 * and 36.9 h of play with not one grant in them.
 *
 * A grant is anything the ladder opens at a Depth, whatever system owns it — a Ledger node or
 * keystone, a weapon, a moniker tier, a glyph layer, a counter-ledger gate. The rule is over all of
 * them together, because the player does not experience them separately.
 */
import { LEDGER_ITEMS } from "../manifest/items";
import { CHIPS } from "../manifest/chips";
import { FIRMWARES } from "../manifest/firmwares";
import { GATES, MAX_RANK } from "./mastery";
import { WEAPON_LIST, type WeaponId } from "../weapons/manifest";
import { WEAPON_DEPTH } from "../manifest/loadout";
import { MAX_DEPTH } from "./depth";
import { chapterFor } from "../identity/monikers";
import { layersForDepth } from "../identity/glyph";
import { NAME_DEPTH, RUN_DEPTH } from "../economy/counter";

/** The longest stretch of Depths granting nothing that the ladder may contain. */
export const MAX_EMPTY_RUN = 2;

export interface Grant {
  depth: number;
  what: string;
}

/**
 * Everything the ladder opens, by Depth. Derived from the manifests rather than listed here, so a
 * reward added anywhere counts without anyone remembering to come back.
 */
export function depthGrants(): Grant[] {
  const out: Grant[] = [];
  for (const it of LEDGER_ITEMS) out.push({ depth: it.requiresDepth, what: `${it.kind}:${it.id}` });
  for (const [weapon, depth] of Object.entries(WEAPON_DEPTH)) out.push({ depth, what: `weapon:${weapon}` });
  for (let d = 2; d <= MAX_DEPTH; d++) {
    if (chapterFor(d) > chapterFor(d - 1)) out.push({ depth: d, what: "moniker tier" });
    if (layersForDepth(d) > layersForDepth(d - 1)) out.push({ depth: d, what: "glyph layer" });
  }
  out.push({ depth: NAME_DEPTH, what: "on-chain name" });
  out.push({ depth: RUN_DEPTH, what: "THE RUN" });
  return out;
}

/** The Depths from 2 to MAX_DEPTH that open nothing at all. */
export function emptyDepths(grants: readonly Grant[] = depthGrants()): number[] {
  const paid = new Set(grants.map((g) => g.depth));
  const out: number[] = [];
  for (let d = 2; d <= MAX_DEPTH; d++) if (!paid.has(d)) out.push(d);
  return out;
}

/** The longest unbroken stretch of empty Depths, as `[from, to]`, or null when there is none. */
export function longestEmptyRun(grants: readonly Grant[] = depthGrants()): [number, number] | null {
  const empty = emptyDepths(grants);
  let best: [number, number] | null = null;
  let from = -1;
  let prev = -99;
  for (const d of empty) {
    if (d !== prev + 1) from = d;
    prev = d;
    if (!best || d - from > best[1] - best[0]) best = [from, d];
  }
  return best;
}

export interface LadderViolation {
  rule: string;
  detail: string;
}

export function lintDepthLadder(grants: readonly Grant[] = depthGrants()): LadderViolation[] {
  const out: LadderViolation[] = [];
  const run = longestEmptyRun(grants);
  if (run && run[1] - run[0] + 1 > MAX_EMPTY_RUN) {
    out.push({ rule: "dead-zone", detail: `Depth ${run[0]}–${run[1]} is ${run[1] - run[0] + 1} levels granting nothing (limit ${MAX_EMPTY_RUN})` });
  }
  // The top of the ladder is where a dead zone hides best: the last levels are the most expensive
  // and the least often reached, so nothing written for the mid-game ever notices them.
  const top = grants.filter((g) => g.depth > MAX_DEPTH / 2).length;
  if (top === 0) out.push({ rule: "empty-back-half", detail: `nothing at all is granted past Depth ${Math.floor(MAX_DEPTH / 2)}` });
  if (!grants.some((g) => g.depth === MAX_DEPTH)) out.push({ rule: "unpaid-cap", detail: `Depth ${MAX_DEPTH} — the cap — grants nothing` });
  for (const g of grants) {
    if (g.depth < 1 || g.depth > MAX_DEPTH) out.push({ rule: "grant-off-the-ladder", detail: `${g.what} needs Depth ${g.depth}, outside 1–${MAX_DEPTH}` });
  }
  return out;
}

/**
 * The same question one ladder down: does a weapon's mastery ladder pay the whole way up
 * (Stage 660)?
 *
 * Mastery runs rank 1–30 per weapon and has 22 things to give — 20 chips and the two firmwares —
 * so 7 of the 29 ranks above the first are empty by arithmetic and no re-spacing can change that.
 * The rule is therefore not "fill every rank", which is impossible, but "the empty ones may not be
 * the ranks that matter": never a challenge gate, never the cap, never two in a row.
 *
 * Measured before this stage, all three were violated at once. Rank 30 — the cap, about 12.4 h of
 * use on a single weapon — granted nothing on any of the eight. Rank 15 was a challenge gate that
 * granted nothing, alone among the five gates, so a player finished a curriculum and received
 * permission to keep ranking. Ranks 23 and 24 were empty back to back.
 */
export const MAX_EMPTY_RANK_RUN = 1;

export function rankGrants(weapon: WeaponId): number[] {
  return [...CHIPS.filter((c) => c.weapon === weapon).map((c) => c.rank), ...FIRMWARES.filter((f) => f.weapon === weapon).map((f) => f.rank)];
}

export function lintMasteryLadder(): LadderViolation[] {
  const out: LadderViolation[] = [];
  for (const w of WEAPON_LIST) {
    const paid = new Set(rankGrants(w.id));
    for (const g of GATES) {
      if (!paid.has(g)) out.push({ rule: "unpaid-gate", detail: `${w.name} rank ${g} is a challenge gate that grants nothing` });
    }
    if (!paid.has(MAX_RANK)) out.push({ rule: "unpaid-cap", detail: `${w.name} rank ${MAX_RANK} — the cap — grants nothing` });
    let run = 0;
    for (let r = 2; r <= MAX_RANK; r++) {
      run = paid.has(r) ? 0 : run + 1;
      if (run > MAX_EMPTY_RANK_RUN) {
        out.push({ rule: "dead-ranks", detail: `${w.name} ranks ${r - run + 1}–${r} grant nothing (limit ${MAX_EMPTY_RANK_RUN})` });
        break;
      }
    }
  }
  return out;
}
