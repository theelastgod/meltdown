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
import { MISSIONS } from "./missions";
import { SCRIPTS, type ScriptDef } from "./script";
import { ENDINGS, type Gate } from "./testimony";

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
function allGates(): { where: string; gate: Gate | undefined; kind: "gate" | "not-only" }[] {
  const out: { where: string; gate: Gate | undefined; kind: "gate" | "not-only" }[] = [];
  for (const m of MISSIONS) {
    if (m.requires?.gate) out.push({ where: `${m.kind} ${m.id}`, gate: m.requires.gate, kind: "gate" });
    for (const v of m.variants ?? []) out.push({ where: `${m.id} variant`, gate: v.gate, kind: "gate" });
  }
  for (const e of ENDINGS) out.push({ where: `ending ${e.id}`, gate: e.gate, kind: "gate" });
  for (const s of SCRIPTS) for (const n of s.nodes) for (const c of n.choices ?? []) if (c.gate) out.push({ where: `${s.id}/${n.id} choice`, gate: c.gate, kind: "gate" });
  return out;
}

/** Only the violations that mean a piece of the game cannot be reached. */
export const campaignErrors = (): CampaignViolation[] => lintCampaign().filter((v) => v.severity === "error");

export function lintCampaign(): CampaignViolation[] {
  const out: CampaignViolation[] = [];
  const producible = producibleTestimony();
  const missionIds = new Set(MISSIONS.map((m) => m.id));
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

  // ---- missions and gigs: the arc is ordered and nothing depends on what does not exist ----
  for (const m of MISSIONS) {
    const after = m.requires?.after;
    if (after && !missionIds.has(after)) out.push({ where: `${m.kind} ${m.id}`, rule: "after-names-a-mission", detail: `requires.after "${after}" is not a mission`, severity: "error" });
    if (after) {
      const prev = MISSIONS.find((x) => x.id === after)!;
      if (m.kind === "mission" && prev.order >= m.order) out.push({ where: `mission ${m.id}`, rule: "arc-is-ordered", detail: `comes after ${after} (order ${prev.order}) but is order ${m.order}`, severity: "error" });
    }
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
