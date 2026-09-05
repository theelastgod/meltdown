/**
 * THE FAIRNESS LINT — a headless simulation, not budget arithmetic.
 *
 * For every candidate build (pairwise coverage over the item catalogue plus
 * adversarial builds), duel a baseline Blank across five range brackets
 * with every weapon: the build shoots the baseline and the baseline shoots
 * the build. Assert that no build beats baseline in EVERY bracket and that
 * no TTK deviation exceeds ±4%. A separate mobility lint runs a traversal
 * course and holds times within ±5%.
 */
import { Btn, withSlot, type InputFrame } from "../sim/input";
import { drainageYard } from "../sim/level";
import { World } from "../sim/world";
import { WEAPONS, WEAPON_LIST, type WeaponId } from "../weapons/manifest";
import { ALL_ITEMS, LEDGER_ITEMS, KEYSTONES, lintItemSchema, type LedgerItem } from "../manifest/items";
import { validateLoadout, type Loadout } from "../manifest/loadout";
import { v3 } from "../math/vec3";
import { Bot } from "../sim/bot";

export const RANGE_BRACKETS = [3, 8, 15, 25, 40] as const;
export const TTK_DEVIATION_LIMIT = 0.04;
/** A bracket where the baseline weapon needs longer than this is out of role: it feeds only the every-bracket rule. */
export const IN_ROLE_TTK = 3.0;
export const MOBILITY_DEVIATION_LIMIT = 0.05;
/** Keystones are the rule-benders: they may lose more, never gain more, and get one violent mobility axis. */
export const KEYSTONE_MOBILITY_LIMIT = 0.12;

export interface DuelResult {
  weapon: WeaponId;
  range: number;
  /** seconds for the attacker (build) to kill the baseline defender */
  offense: number;
  /** seconds for a baseline attacker to kill the build */
  defense: number;
}

/** One duel: attacker with `attack` loadout shoots defender with `defend` loadout. Perfect aim, body shots. */
export function duel(weapon: WeaponId, range: number, attack: Loadout, defend: Loadout, maxSeconds = 8): number {
  const level = drainageYard();
  level.dummies = [];
  level.wasps = [];
  level.mechs = [];
  const world = new World(level, { ai: false, seed: 42, wakePhase: "off" });
  const a = world.addPlayer(1, "A", 1, attack);
  const d = world.addPlayer(2, "D", 2, defend);
  a.pos.x = -29;
  a.pos.z = 0;
  d.pos.x = -29 + range;
  d.pos.z = 0;
  const def = WEAPONS[weapon];
  const idle: InputFrame = { tick: 0, buttons: 0, yaw: Math.PI / 2, pitch: 0 };
  const stepWith = (buttons: number) => {
    const chest = { x: d.pos.x, y: d.pos.y + d.height * 0.55, z: d.pos.z };
    const aim = world.aimAt(a, chest);
    const w = a.weapon;
    const f: InputFrame = { tick: world.tick, buttons, yaw: aim.yaw - (w.kickYaw + w.patX), pitch: aim.pitch - (w.kickPitch + w.patY) };
    world.step(new Map([[1, f], [2, { ...idle, tick: world.tick }]]));
    return world.drainEvents();
  };
  for (let i = 0; i < 20; i++) stepWith(0);
  stepWith(withSlot(0, def.slot));
  for (let i = 0; i < 30; i++) stepWith(0);
  let first = -1;
  const maxTicks = Math.round(maxSeconds * 60);
  for (let i = 0; i < maxTicks; i++) {
    let buttons = Btn.Fire;
    if (def.cls === "charge") buttons = a.weapon.charge >= 1 ? 0 : Btn.Fire;
    const ev = stepWith(buttons);
    for (const e of ev) {
      if ((e.type === "fire" || e.type === "chargeStart") && first < 0) first = world.tick - 1;
      if (e.type === "kill" && e.victimKind === "player" && e.victimId === 2) return (world.tick - 1 - first) / 60;
    }
  }
  return Infinity;
}

const BASELINE: Loadout = { primary: "lease_breaker", secondary: "shock_baton", attested: [], keystone: null };

export function duelTable(build: Loadout, weapons: readonly WeaponId[] = WEAPON_LIST.map((w) => w.id)): DuelResult[] {
  const out: DuelResult[] = [];
  for (const weapon of weapons) {
    for (const range of RANGE_BRACKETS) {
      if (WEAPONS[weapon].cls === "melee" && range > 3) continue;
      out.push({ weapon, range, offense: duel(weapon, range, build, BASELINE), defense: duel(weapon, range, BASELINE, build) });
    }
  }
  return out;
}

export interface LintViolation {
  build: string;
  rule: string;
  detail: string;
}

export interface BuildReport {
  name: string;
  loadout: Loadout;
  worstOffense: number;
  worstDefense: number;
  beatsEveryBracket: boolean;
  mobility: number;
  violations: LintViolation[];
}

/** Connected attestations of up to `size` nodes seeded from `seedId`, walking the graph. */
function growAttestation(seedId: string, size: number, prefer: readonly string[] = []): string[] {
  const out = [seedId];
  const frontier = () => {
    const f: string[] = [];
    for (const id of out) for (const l of ALL_ITEMS.find((i) => i.id === id)?.links ?? []) if (!out.includes(l) && ALL_ITEMS.find((i) => i.id === l)?.kind === "node" && !f.includes(l)) f.push(l);
    return f;
  };
  while (out.length < size) {
    const f = frontier();
    if (!f.length) break;
    const pick = f.find((id) => prefer.includes(id)) ?? f[0]!;
    out.push(pick);
  }
  return out;
}

/** Pairwise coverage: every pair of linked nodes appears together in some build; plus singles and keystone builds. */
export function candidateBuilds(): { name: string; loadout: Loadout }[] {
  const builds: { name: string; loadout: Loadout }[] = [];
  const nodes = LEDGER_ITEMS;
  for (const n of nodes) builds.push({ name: `solo:${n.id}`, loadout: { ...BASELINE, attested: [n.id] } });
  const seenPairs = new Set<string>();
  for (const n of nodes) {
    for (const l of n.links) {
      const other = nodes.find((x) => x.id === l);
      if (!other) continue;
      const key = [n.id, l].sort().join("+");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      builds.push({ name: `pair:${key}`, loadout: { ...BASELINE, attested: [n.id, l] } });
    }
  }
  for (const n of nodes) builds.push({ name: `grow:${n.id}`, loadout: { ...BASELINE, attested: growAttestation(n.id, 7) } });
  for (const k of KEYSTONES) builds.push({ name: `keystone:${k.id}`, loadout: { ...BASELINE, attested: growAttestation(k.links[0]!, 4), keystone: k.id } });
  // adversarial: greedily stack every offensive stat; every defensive stat; every mobility stat
  const score = (it: LedgerItem, stats: readonly string[]) => [...it.benefits].filter((m) => stats.includes(m.stat)).reduce((a, m) => a + Math.abs(m.delta), 0);
  const adversarial = (name: string, stats: readonly string[]) => {
    const ranked = [...nodes].sort((a, b) => score(b, stats) - score(a, stats));
    const seed = ranked[0]!;
    const attested = growAttestation(seed.id, 7, ranked.map((r) => r.id));
    const ks = [...KEYSTONES].sort((a, b) => score(b, stats) - score(a, stats)).find((k) => k.links.some((l) => attested.includes(l)));
    builds.push({ name, loadout: { ...BASELINE, attested, keystone: ks ? ks.id : null } });
  };
  adversarial("adversarial:offense", ["damage", "headMult", "fireRate", "range"]);
  adversarial("adversarial:defense", ["maxHealth", "maxShield", "shieldRegen"]);
  adversarial("adversarial:mobility", ["moveSpeed", "slideBoost", "mantleTime"]);
  return builds;
}

/** Traversal course: sprint the lane, slide, mantle the deck, cross to the east pillars. Returns seconds. */
export function mobilityCourse(loadout: Loadout): number {
  const level = drainageYard();
  level.dummies = [];
  level.wasps = [];
  level.mechs = [];
  const world = new World(level, { ai: false, seed: 42, wakePhase: "off" });
  const p = world.addPlayer(1, "M", 1, loadout);
  const bot = new Bot(
    [
      { kind: "hold", ticks: 10 },
      { kind: "goto", x: 0, z: 16, sprint: true },
      { kind: "slide", ticks: 30, jumpAt: 18 },
      { kind: "goto", x: 0, z: 1.5, sprint: true, radius: 0.8 },
      { kind: "mantle", x: 0, z: -3, timeoutTicks: 300 },
      { kind: "goto", x: 3.5, z: -3.5, sprint: true, radius: 0.6 },
      { kind: "goto", x: 18, z: 4, sprint: true, radius: 1 },
    ],
    p.yaw,
  );
  let t = 0;
  while (!bot.done && t < 60 * 40) {
    const inp = bot.sample(world, p, world.tick);
    world.step(new Map([[1, inp]]));
    world.drainEvents();
    t++;
  }
  return bot.done && !bot.log.some((l) => l.includes("TIMEOUT")) ? t / 60 : Infinity;
}

export interface FairnessReport {
  ok: boolean;
  schema: ReturnType<typeof lintItemSchema>;
  baseline: DuelResult[];
  baselineMobility: number;
  builds: BuildReport[];
  violations: LintViolation[];
}

export function runFairnessLint(opts: { weapons?: readonly WeaponId[]; builds?: { name: string; loadout: Loadout }[]; quick?: boolean } = {}): FairnessReport {
  const violations: LintViolation[] = [];
  const schema = lintItemSchema();
  for (const v of schema) violations.push({ build: v.itemId, rule: "schema:" + v.rule, detail: v.detail });
  const weapons = opts.weapons ?? (opts.quick ? (["lease_breaker", "repo_hammer", "longwave"] as WeaponId[]) : WEAPON_LIST.map((w) => w.id));
  const baseline = duelTable(BASELINE, weapons);
  const baselineMobility = mobilityCourse(BASELINE);
  const builds: BuildReport[] = [];
  const list = opts.builds ?? candidateBuilds();
  for (const b of list) {
    const owned = [...b.loadout.attested, ...(b.loadout.keystone ? [b.loadout.keystone] : [])];
    const legal = validateLoadout(b.loadout, owned, 50);
    const bv: LintViolation[] = [];
    if (!legal.ok) bv.push({ build: b.name, rule: "illegal-build", detail: legal.errors.map((e) => e.detail).join("; ") });
    const table = duelTable(legal.loadout, weapons);
    let worstOffense = 0;
    let worstDefense = 0;
    // "beats baseline in every bracket": for each bracket, the build's best offensive TTK is better than baseline's best
    let beatsEvery = true;
    for (const range of RANGE_BRACKETS) {
      const mine = Math.min(...table.filter((r) => r.range === range).map((r) => r.offense));
      const base = Math.min(...baseline.filter((r) => r.range === range).map((r) => r.offense));
      if (!(mine < base - 1e-6)) beatsEvery = false;
    }
    const keystone = !!legal.loadout.keystone;
    for (const r of table) {
      const ref = baseline.find((x) => x.weapon === r.weapon && x.range === r.range)!;
      if (ref.offense > IN_ROLE_TTK || ref.defense > IN_ROLE_TTK) continue; // out of role: spread geometry noise, not balance
      const dOff = ref.offense === Infinity ? 0 : r.offense / ref.offense - 1; // negative = kills faster (a gain)
      const dDef = ref.defense === Infinity ? 0 : r.defense / ref.defense - 1; // positive = harder to kill (a gain)
      worstOffense = Math.max(worstOffense, Math.abs(dOff));
      worstDefense = Math.max(worstDefense, Math.abs(dDef));
      // nodes: symmetric ±4%. keystones: no gain beyond 4%; losses are the trade.
      const offBad = keystone ? dOff < -TTK_DEVIATION_LIMIT : Math.abs(dOff) > TTK_DEVIATION_LIMIT;
      const defBad = keystone ? dDef > TTK_DEVIATION_LIMIT : Math.abs(dDef) > TTK_DEVIATION_LIMIT;
      if (offBad) bv.push({ build: b.name, rule: "ttk-deviation", detail: `${r.weapon} @${r.range} m offense ${(dOff * 100).toFixed(1)}% (${r.offense.toFixed(3)} vs ${ref.offense.toFixed(3)} s)` });
      if (defBad) bv.push({ build: b.name, rule: "ttk-deviation", detail: `${r.weapon} @${r.range} m defense ${(dDef * 100).toFixed(1)}% (${r.defense.toFixed(3)} vs ${ref.defense.toFixed(3)} s)` });
    }
    if (beatsEvery) bv.push({ build: b.name, rule: "beats-every-bracket", detail: "faster than baseline in all five range brackets" });
    const mobility = mobilityCourse(legal.loadout);
    const dm = mobility / baselineMobility - 1;
    const mlim = keystone ? KEYSTONE_MOBILITY_LIMIT : MOBILITY_DEVIATION_LIMIT;
    if (Math.abs(dm) > mlim) bv.push({ build: b.name, rule: "mobility-deviation", detail: `course ${mobility.toFixed(2)} s vs ${baselineMobility.toFixed(2)} s (${(dm * 100).toFixed(1)}%, limit ±${mlim * 100}%)` });
    builds.push({ name: b.name, loadout: legal.loadout, worstOffense, worstDefense, beatsEveryBracket: beatsEvery, mobility, violations: bv });
    violations.push(...bv);
  }
  return { ok: violations.length === 0, schema, baseline, baselineMobility, builds, violations };
}
