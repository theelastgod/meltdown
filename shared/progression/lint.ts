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
