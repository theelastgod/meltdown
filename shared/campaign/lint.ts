/**
 * Can the campaign actually be finished?
 *
 * Missions, gigs and endings are gated on testimony — `key = value` pairs written by dialogue
 * choices at CRT terminals. That is good data design and a bad failure mode: the keys are strings
 * written in one file and read in three others, so a single typo (`m4:vessel` against
 * `m4:vessell`) closes a gate that nothing will ever open, and the game still builds, still runs,
 * still plays. The ending is simply never reachable and no one finds out until a player doesn't
 * find it.
 *
 * That is the same shape as every other defect this project has turned up: a claim — "there are
 * four endings", "these twelve gigs unlock" — with no artifact behind it. So this is the artifact.
 * It walks the script graph for what testimony can actually be produced, then checks that every
 * gate anywhere in the campaign is openable, that every mission, gig and ending is reachable, and
 * that no dialogue writes testimony nobody reads.
 *
 * It is pure data analysis over the campaign tables. `npm run lint:campaign` runs it in CI, and
 * `tests/campaign.test.ts` fails the build on any violation.
 */
import { FACTIONS, type FactionId } from "./factions";
import { MISSIONS, type MissionDef } from "./missions";
import { SCRIPTS, type ScriptDef } from "./script";
import { ENDINGS, type Gate } from "./testimony";
import { resolveSpot } from "./runtime";
import { levelById } from "../sim/level";
import { canSee } from "../sim/ai";
import { DUMMY_HEIGHT } from "../sim/world";
import { v3 } from "../math/vec3";
import type { Objective, Spot } from "./missions";
import type { LevelDef } from "../sim/level";

export interface CampaignViolation {
  where: string;
  rule: string;
  detail: string;
  /**
   * `error` is a piece of the game nobody can reach — it fails the build. `note` is a choice that
   * changes nothing, which in a narrative game may be deliberate characterisation and is a
   * designer's call rather than a defect. Reporting them at the same severity would push someone
   * to delete good writing to make a lint go quiet.
   */
  severity: "error" | "note";
}

/** Every `key = value` any dialogue choice can write, and which script writes it. */
export function producibleTestimony(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of SCRIPTS) {
    for (const node of s.nodes) {
      for (const c of node.choices ?? []) {
        for (const [k, v] of Object.entries(c.set ?? {})) {
          const vals = out.get(k) ?? new Set<string>();
          vals.add(v);
          out.set(k, vals);
        }
      }
    }
  }
  return out;
}

/** Script nodes actually reachable from the script's start, following `next` and every choice. */
export function reachableNodes(s: ScriptDef): Set<string> {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = [s.start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    const node = byId.get(id)!;
    if (node.next) stack.push(node.next);
    for (const c of node.choices ?? []) if (c.next) stack.push(c.next);
  }
  return seen;
}

/** Testimony keys a gate reads, as `key=value` pairs, across both its halves. */
const gatePairs = (g: Gate | undefined): [string, string][] => [...Object.entries(g?.all ?? {}), ...Object.entries(g?.not ?? {})];

/**
 * Every gate in the campaign, with where it came from. A gate that cannot open is a piece of the
 * game nobody can see; a `not` gate whose value is unproducible is the opposite — harmless, but it
 * means the condition is decorative, and a decorative condition is usually a typo.
 */
function allGates(): { where: string; gate: Gate | undefined }[] {
  const out: { where: string; gate: Gate | undefined }[] = [];
  for (const m of MISSIONS) {
    if (m.requires?.gate) out.push({ where: `${m.kind} ${m.id}`, gate: m.requires.gate });
    for (const v of m.variants ?? []) out.push({ where: `${m.id} variant`, gate: v.gate });
  }
  for (const e of ENDINGS) out.push({ where: `ending ${e.id}`, gate: e.gate });
  for (const s of SCRIPTS) for (const n of s.nodes) for (const c of n.choices ?? []) if (c.gate) out.push({ where: `${s.id}/${n.id} choice`, gate: c.gate });
  return out;
}

/** Only the violations that mean a piece of the game cannot be reached. */
export const campaignErrors = (): CampaignViolation[] => lintCampaign().filter((v) => v.severity === "error");

/**
 * The arc's order and its `requires.after` references. Separate so it can be handed a broken list:
 * until Stage 56 a `requires.after` naming a non-mission was reported and then dereferenced on the
 * next line, so the lint died with a stack trace instead of printing the violation it had found.
 */
export function lintMissionOrder(missions: readonly MissionDef[]): CampaignViolation[] {
  const out: CampaignViolation[] = [];
  const byId = new Map(missions.map((m) => [m.id, m]));
  for (const m of missions) {
    const after = m.requires?.after;
    if (!after) continue;
    const prev = byId.get(after);
    if (!prev) {
      out.push({ where: `${m.kind} ${m.id}`, rule: "after-names-a-mission", detail: `requires.after "${after}" is not a mission`, severity: "error" });
      continue;
    }
    if (m.kind === "mission" && prev.order >= m.order) out.push({ where: `mission ${m.id}`, rule: "arc-is-ordered", detail: `comes after ${after} (order ${prev.order}) but is order ${m.order}`, severity: "error" });
  }
  return out;
}

export function lintCampaign(): CampaignViolation[] {
  const out: CampaignViolation[] = [];
  const producible = producibleTestimony();
  const scriptIds = new Set(SCRIPTS.map((s) => s.id));

  // ---- every gate reads testimony something can write ----
  for (const { where, gate } of allGates()) {
    for (const [k, v] of gatePairs(gate)) {
      const vals = producible.get(k);
      if (!vals) out.push({ where, rule: "gate-reads-real-testimony", detail: `nothing writes "${k}" — a gate on it can never open`, severity: "error" });
      else if (!vals.has(v)) out.push({ where, rule: "gate-reads-real-value", detail: `"${k}" is written as ${[...vals].map((x) => `"${x}"`).join(", ")}, never "${v}"`, severity: "error" });
    }
    if (gate?.faction) for (const f of gate.faction) if (!FACTIONS.some((x) => x.id === (f as FactionId))) out.push({ where, rule: "gate-names-a-faction", detail: `no faction "${f}"`, severity: "error" });
  }

  // ---- every ending is reachable, and the endings list is not secretly one ending ----
  for (const e of ENDINGS) {
    const blocked = gatePairs(e.gate).filter(([k, v]) => !producible.get(k)?.has(v));
    if (blocked.length) out.push({ where: `ending ${e.id}`, rule: "ending-is-reachable", detail: `needs ${blocked.map(([k, v]) => `${k}=${v}`).join(", ")}, which no choice writes`, severity: "error" });
  }

  // ---- and the white office can actually deliver it (Stage 174) ----
  //
  // The rule above asks whether an ending's gate can be opened. It can be — and the ending still
  // never plays, because the office does not choose by gate: it reads `m7:ending` and resolves the
  // answer the player gave. `wipe_fire` and `wipe_quiet` passed the gate rule for the life of the
  // campaign and were delivered exactly never, while the CONTRACTS panel listed them as open. An
  // ending is deliverable when some choice writes its id, or when it refines one that is.
  const written = new Set<string>();
  for (const [k, vals] of producible) if (k.endsWith(":ending")) for (const v of vals) written.add(v);
  const deliverable = (id: string, seen: Set<string> = new Set()): boolean => {
    if (written.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const e = ENDINGS.find((x) => x.id === id);
    return !!e?.refines && deliverable(e.refines, seen);
  };
  for (const e of ENDINGS) {
    if (e.refines && !ENDINGS.some((x) => x.id === e.refines)) out.push({ where: `ending ${e.id}`, rule: "ending-refines-an-ending", detail: `refines "${e.refines}", which is not an ending`, severity: "error" });
    else if (!deliverable(e.id)) out.push({ where: `ending ${e.id}`, rule: "ending-is-deliverable", detail: "no choice writes this id and it refines nothing that is written — the office can never show it", severity: "error" });
  }

  out.push(...lintSpotsAreInTheOpen());
  out.push(...lintHoldsAreAnchored());

  // ---- missions and gigs: the arc is ordered and nothing depends on what does not exist ----
  out.push(...lintMissionOrder(MISSIONS));
  for (const m of MISSIONS) {
    for (const o of m.objectives) if (o.kind === "dialogue" && !scriptIds.has(o.script)) out.push({ where: `${m.kind} ${m.id}`, rule: "dialogue-names-a-script", detail: `no script "${o.script}"`, severity: "error" });
    for (const v of m.variants ?? []) for (const o of v.objectives ?? []) if (o.kind === "dialogue" && !scriptIds.has(o.script)) out.push({ where: `${m.id} variant`, rule: "dialogue-names-a-script", detail: `no script "${o.script}"`, severity: "error" });
  }

  // ---- the mission arc has no gaps: orders run 1..n with nothing missing ----
  const orders = MISSIONS.filter((m) => m.kind === "mission").map((m) => m.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++) if (orders[i] !== i + 1) {
    out.push({ where: "the arc", rule: "arc-has-no-gaps", detail: `mission orders are ${orders.join(", ")} — expected 1..${orders.length}`, severity: "error" });
    break;
  }

  // ---- the scripts themselves ----
  for (const s of SCRIPTS) {
    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    if (!byId.has(s.start)) out.push({ where: `script ${s.id}`, rule: "script-starts-somewhere", detail: `start "${s.start}" is not a node`, severity: "error" });
    for (const n of s.nodes) {
      if (n.next && !byId.has(n.next)) out.push({ where: `${s.id}/${n.id}`, rule: "link-names-a-node", detail: `next "${n.next}" is not a node`, severity: "error" });
      for (const c of n.choices ?? []) if (c.next && !byId.has(c.next)) out.push({ where: `${s.id}/${n.id}`, rule: "link-names-a-node", detail: `choice "${c.text.slice(0, 24)}" goes to "${c.next}", which is not a node`, severity: "error" });
    }
    const live = reachableNodes(s);
    for (const n of s.nodes) if (!live.has(n.id)) out.push({ where: `${s.id}/${n.id}`, rule: "no-orphan-nodes", detail: "no path from the start reaches this node", severity: "error" });
  }

  // ---- testimony nobody reads: a choice that changes nothing, which is usually a typo ----
  const read = new Set<string>();
  for (const { gate } of allGates()) for (const [k] of gatePairs(gate)) read.add(k);
  // read in code rather than through a gate: the handler-survival rules, and the faction the file
  // picks at the hub (`shared/campaign/save.ts` lifts it off the testimony onto the save)
  for (const k of ["m4:vessel", "m2:informant", "faction"]) read.add(k);
  // the ending is recorded through testimony at the white office
  for (const k of [...producible.keys()]) if (k.endsWith(":ending")) read.add(k);
  for (const k of producible.keys()) if (!read.has(k)) out.push({ where: `testimony ${k}`, rule: "testimony-is-read", detail: "written by a choice and read by no gate — the choice changes nothing mechanical", severity: "note" });

  return out;
}


/** Levels are deterministic but not free to build; the lint touches each one once. */
const levelCache = new Map<string, LevelDef>();
const levelFor = (id: string): LevelDef => {
  let l = levelCache.get(id);
  if (!l) levelCache.set(id, (l = levelById(id)));
  return l;
};

/** Is the standing column at this point clear of the level's solid geometry? */
function standable(level: LevelDef, x: number, z: number): boolean {
  return !level.boxes.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > 0.1 && b.min.y < DUMMY_HEIGHT);
}

/** Can anything standing on open ground see the chest of something standing here? */
function sightlineExists(level: LevelDef, x: number, z: number): boolean {
  const chest = v3(x, DUMMY_HEIGHT * 0.55, z);
  const half = level.bounds ?? 60;
  for (const r of [3, 8, 16, 28]) {
    for (let a = 0; a < 360; a += 10) {
      const ex = x + r * Math.cos((a * Math.PI) / 180);
      const ez = z + r * Math.sin((a * Math.PI) / 180);
      if (Math.abs(ex) > half || Math.abs(ez) > half) continue;
      if (!standable(level, ex, ez)) continue;
      if (canSee(v3(ex, 1.6, ez), chest, level.boxes, [])) return true;
    }
  }
  return false;
}

/**
 * A survive/hold with no `at` is a timer that runs anywhere (Stage 180).
 *
 * m1's "HOLD THE TERMINAL WHILE THE FILE DECRYPTS" was the only one: `inside = !at || nearAny(...)`
 * is unconditionally true, the wave spawns on the player instead of the terminal, and the marker
 * is not drawn because `syncFx` requires `o.at`. Every other survive/hold in the 19 contracts
 * names a node. This asks the table, not the one mission.
 */
export function lintHoldsAreAnchored(missions: readonly MissionDef[] = MISSIONS): CampaignViolation[] {
  const out: CampaignViolation[] = [];
  const walk = (where: string, objectives: readonly Objective[]) => {
    for (const o of objectives) {
      if ((o.kind === "survive" || o.kind === "hold") && !o.at) {
        out.push({ where, rule: "hold-is-anchored", detail: `"${o.text}" has no at — the timer runs anywhere and no marker is drawn`, severity: "error" });
      }
    }
  };
  for (const m of missions) {
    walk(`${m.kind} ${m.id}`, m.objectives);
    for (const [i, v] of (m.variants ?? []).entries()) if (v.objectives) walk(`${m.id} variant ${i + 1}`, v.objectives);
  }
  return out;
}

/** every spot a mission or gig names, with where it came from */
function spotsOf(o: Objective): Spot[] {
  switch (o.kind) {
    case "destroy": return o.spots;
    case "escort": return o.path;
    case "reach": case "hold": return [o.at];
    case "survive": return o.at ? [o.at] : [];
    default: return [];
  }
}

/**
 * A spot inside a building is a mission that cannot be finished (Stage 175).
 *
 * Objectives name a place either as a level node — which the district generator puts on open
 * ground — or as a literal pair of coordinates typed into the mission table. A node cannot be
 * wrong. A literal can, and two of BLIND THE MODEL's six lattice nodes were: `{x:0,z:-30}` and
 * `{x:0,z:30}` on LEASE ROW both land inside a 4.2 m building, and a lattice node is a 1.8 m
 * dummy, so both were sealed in concrete. `castRay` clips at the first solid box before testing
 * any dummy, and `applyExplosion` refuses a target it cannot see, so neither could be destroyed
 * by any means the game offers — and campaign worlds do not respawn dummies, so the pair never
 * cycled out. PUT OUT THE SIX LATTICE NODES could reach four.
 *
 * The reachability lint this joins was built to answer "can the campaign be finished?" from the
 * testimony graph. It had no idea the geometry could say no.
 */
export function lintSpotsAreInTheOpen(): CampaignViolation[] {
  const out: CampaignViolation[] = [];
  for (const m of MISSIONS) {
    const level = levelFor(m.level);
    const runs: [string, readonly Objective[]][] = [[m.id, m.objectives]];
    for (const [i, v] of (m.variants ?? []).entries()) if (v.objectives) runs.push([`${m.id} variant ${i + 1}`, v.objectives]);
    for (const [where, objectives] of runs) {
      for (const o of objectives) {
        for (const s of spotsOf(o)) {
          if ("node" in s) {
            if (!level.nodes.some((n) => n.label === s.node)) out.push({ where, rule: "spot-names-a-node", detail: `"${o.kind}" names node ${s.node}, which ${m.level} does not have`, severity: "error" });
            continue;
          }
          const p = resolveSpot(level, s);
          if (!standable(level, p.x, p.z)) {
            out.push({ where, rule: "spot-is-in-the-open", detail: `"${o.kind}" spot (${p.x}, ${p.z}) on ${m.level} is inside a solid box — nothing can stand there`, severity: "error" });
          } else if (o.kind === "destroy" && !sightlineExists(level, p.x, p.z)) {
            out.push({ where, rule: "spot-can-be-shot", detail: `"${o.kind}" spot (${p.x}, ${p.z}) on ${m.level} has no line of sight from any open ground — it can never be destroyed`, severity: "error" });
          }
        }
      }
    }
  }
  return out;
}
