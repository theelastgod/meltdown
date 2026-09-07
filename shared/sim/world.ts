import { createRun, dropCarried, inSafeZone, stepRun, type RunEvent, type RunState } from "./run";
import { ADDITIVE, type StatSheet } from "../manifest/stats";
import { DUMMY_MAX_HEALTH, DUMMY_RESPAWN_SECONDS, MOVE, SIM_DT, SIM_HZ } from "./constants";
import { emptyInput, type InputFrame } from "./input";
import type { DummyDef, LevelDef } from "./level";
import { rayBox, rayCapsule } from "./collision";
import { applySheet, createPlayer, eyePos, modsFor, respawnPlayer, stepPlayer, weaponDefOf, type PlayerEvent, type PlayerState } from "./player";
import { DEFAULT_LOADOUT, kitFor, sheetFor, type Loadout } from "../manifest/loadout";
import { type FireRequest } from "./weapons";
import { createProjectile, stepProjectiles, type CapsuleTarget, type Cloud, type Projectile, type ProjKind } from "./projectiles";
import { canSee, createMech, createWasp, stepMech, stepWasp, type AiRequest, type Mech, type SightTarget, type Wasp, WASP, MECH } from "./ai";
import { falloff, GRENADES, WEAPONS, type RangeProfile, type WeaponId } from "../weapons/manifest";
import { addKillPoints, boostNearest, boostNodes, createWake, stepWake, type WakeEvent, type WakeState } from "./wake";
import { type Vec3, v3, clone, copy, set, addScaled, viewDir, dist, lenXZ, sub, normalize, yawDir, dot, len } from "../math/vec3";
import type { LocalAuth } from "../net/protocol";

export type HitZone = "head" | "body" | "legs";

export interface Dummy {
  id: number;
  def: DummyDef;
  pos: Vec3;
  health: number;
  alive: boolean;
  respawnTimer: number;
  phase: number;
  dir: number;
  firstDamageTick: number;
  hitsTaken: number;
}

/** Historical pose of a player, used by lag-compensated hit resolution. */
export interface RewindPose {
  pos: Vec3;
  height: number;
  alive: boolean;
}

export interface StepOpts {
  rewind?: (shooterId: number, viewTick: number, viewFrac: number) => ReadonlyMap<number, RewindPose> | null;
  online?: boolean;
  predictOnly?: boolean;
  silent?: boolean;
}

export interface TickInput extends InputFrame {
  viewTick?: number;
  /** fraction of a tick past `viewTick` the shooter had interpolated to (Stage 34) */
  viewFrac?: number;
}

export type TargetKind = "world" | "dummy" | "player" | "wasp" | "mech" | "none";

export interface ShotHit {
  kind: TargetKind;
  id: number;
  zone?: HitZone;
  damage: number;
}

/** How a kill happened (mastery challenges and stamps read this; the sim never does). */
export interface KillCtx {
  how: "shot" | "explosion" | "melee" | "beam";
  zone: HitZone | null;
  distance: number;
  /** alt-fire (slug, quickshot, sticky, lunge) */
  alt: boolean;
  /** rail: the shot passed through cover before the victim */
  through: boolean;
  projKind: string | null;
  shooterStance: string;
  shooterAir: boolean;
  shooterSlideJump: boolean;
  victimTeam: number;
  victimEmp: boolean;
}

export type SimEvent =
  | ({ tick: number; playerId: number } & PlayerEvent)
  | { tick: number; playerId: number; type: "shot"; weapon: WeaponId | "wasp"; from: Vec3; to: Vec3; hit: ShotHit; hits: ShotHit[]; nearMiss: number; rewindTicks: number; pierce: boolean }
  | { tick: number; playerId: number; type: "melee"; weapon: WeaponId; hits: ShotHit[]; lunge: boolean }
  | { tick: number; playerId: number; type: "kill"; victimKind: "dummy" | "player" | "wasp" | "mech"; victimId: number; ttkTicks: number; ttkSeconds: number; weapon: string; ctx: KillCtx }
  | { tick: number; playerId: number; type: "death"; killerId: number }
  | { tick: number; playerId: number; type: "respawn" }
  | { tick: number; playerId: number; type: "dummyRespawn"; dummyId: number }
  | { tick: number; playerId: number; type: "explode"; projKind: ProjKind; pos: Vec3; radius: number }
  | { tick: number; playerId: number; type: "cloud"; pos: Vec3; radius: number }
  | { tick: number; playerId: number; type: "emp"; pos: Vec3; radius: number }
  | { tick: number; playerId: number; type: "stun"; by: number }
  | { tick: number; playerId: number; type: "flagged"; mechId: number }
  | { tick: number; playerId: number; type: "mechBeam"; mechId: number; from: Vec3; to: Vec3; damage: number }
  | { tick: number; playerId: number; type: "hurt"; damage: number; by: number; kind: "shot" | "explosion" | "melee" | "beam" }
  | { tick: number; playerId: number; type: "waspDeath"; waspId: number }
  | { tick: number; playerId: number; type: "mechDeath"; mechId: number }
  // THE RUN
  | { tick: number; playerId: number; type: "claim"; claimId: number; value: number; carried: number }
  | { tick: number; playerId: number; type: "drop"; claimId: number; value: number; pos: Vec3 }
  | { tick: number; playerId: number; type: "bank"; value: number; zone: string; banked: number }
  | { tick: number; playerId: number; type: "claimReturn"; claimId: number }
  | ({ tick: number; playerId: number } & WakeEvent);

export const DUMMY_RADIUS = MOVE.capsuleRadius;
export const DUMMY_HEIGHT = MOVE.standHeight;
export const WASP_RADIUS = 0.45;
export const WASP_HEIGHT = 0.9;
export const MECH_RADIUS = 1.1;
export const MECH_HEIGHT = 3.4;

export function zoneOf(hitY: number, feetY: number, height: number): HitZone {
  const f = (hitY - feetY) / height;
  if (f > 0.82) return "head";
  if (f < 0.42) return "legs";
  return "body";
}

export interface WorldOptions {
  seed?: number;
  ai?: boolean;
  /** Start the wake immediately (offline sandbox) or in warm-up (rooms). */
  wakePhase?: "warmup" | "wake" | "off";
  /** THE RUN (Stage 14): claims, safe zones, banking; the wake is off in a run */
  run?: boolean;
  warmupSeconds?: number;
  roundSeconds?: number;
  /** dummies come back after DUMMY_RESPAWN_SECONDS (false: campaign targets stay down) */
  dummyRespawn?: boolean;
}

/**
 * The authoritative world. Deterministic: same inputs → same state. No
 * Math.random, no wall clock. Used unchanged by client prediction and server.
 */
export class World {
  tick = 0;
  readonly seed: number;
  readonly ai: boolean;
  readonly dummyRespawn: boolean;
  readonly level: LevelDef;
  readonly players = new Map<number, PlayerState>();
  readonly dummies: Dummy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly clouds: Cloud[] = [];
  readonly wasps: Wasp[] = [];
  readonly mechs: Mech[] = [];
  readonly wake: WakeState | null;
  /** THE RUN: null unless the room runs it */
  readonly run: RunState | null;
  private pending: SimEvent[] = [];
  /** an Audit playlist's gravity (symmetric for every file in the room; 1 outside an Audit) */
  gravityMult = 1;
  private nextSpawn = 0;
  private nextProjId = 1;
  private nextCloudId = 1;

  constructor(level: LevelDef, opts: WorldOptions = {}) {
    this.level = level;
    this.seed = opts.seed ?? 1;
    this.ai = opts.ai ?? true;
    this.dummyRespawn = opts.dummyRespawn ?? true;
    const wp = opts.wakePhase ?? "wake";
    this.wake = wp === "off" || opts.run || level.nodes.length === 0 ? null : createWake(level.nodes, wp, { warmupSeconds: opts.warmupSeconds, roundSeconds: opts.roundSeconds });
    this.run = opts.run ? createRun(level.zones ?? [], level.claims ?? []) : null;
    for (const d of level.dummies) {
      this.dummies.push({ id: d.id, def: d, pos: clone(d.pos), health: DUMMY_MAX_HEALTH, alive: true, respawnTimer: 0, phase: 0, dir: 1, firstDamageTick: -1, hitsTaken: 0 });
    }
    if (this.ai) {
      level.wasps.forEach((w, i) => this.wasps.push(createWasp(i + 1, w.waypoints.map(clone))));
      level.mechs.forEach((m, i) => this.mechs.push(createMech(i + 1, m.path.map(clone), m.face)));
    }
  }

  get time(): number {
    return this.tick / SIM_HZ;
  }

  // ---- runtime spawns (campaign missions; the wake never calls these) ----

  /** A wasp patrol added mid-match (Threat, mission waves). Ids continue after the level's own. */
  spawnWasp(waypoints: Vec3[]): Wasp {
    const id = this.wasps.reduce((m, w) => Math.max(m, w.id), 0) + 1;
    const w = createWasp(id, waypoints.map(clone));
    this.wasps.push(w);
    return w;
  }

  spawnMech(path: Vec3[], face?: number): Mech {
    const id = this.mechs.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const m = createMech(id, path.map(clone), face);
    this.mechs.push(m);
    return m;
  }

  /** A static target (a relay, a lattice node): a dummy that does not patrol. */
  spawnDummy(pos: Vec3): Dummy {
    const id = this.dummies.reduce((m, d) => Math.max(m, d.id), 0) + 1;
    const def: DummyDef = { id, pos: clone(pos) };
    const d: Dummy = { id, def, pos: clone(pos), health: DUMMY_MAX_HEALTH, alive: true, respawnTimer: 0, phase: 0, dir: 1, firstDamageTick: -1, hitsTaken: 0 };
    this.dummies.push(d);
    return d;
  }

  addPlayer(id: number, name = "BLANK", team = 1, loadout: Loadout = DEFAULT_LOADOUT): PlayerState {
    const spawn = this.level.spawns[this.nextSpawn % this.level.spawns.length]!;
    this.nextSpawn++;
    const p = createPlayer(id, name, spawn);
    p.team = team;
    this.setLoadout(p, loadout);
    this.players.set(id, p);
    return p;
  }

  /** Apply a validated loadout: the build sheet, the per-weapon kit (firmware, chips), and the starting weapon. */
  setLoadout(p: PlayerState, loadout: Loadout, extra?: Partial<StatSheet>): void {
    // `extra` is campaign-only power (Kernel Protocols) folded into the sheet; PvP rooms never pass it
    const sheet = sheetFor(loadout);
    if (extra) for (const [k, v] of Object.entries(extra) as [keyof StatSheet, number][]) sheet[k] = ADDITIVE.has(k) ? sheet[k] + v : sheet[k] * v;
    applySheet(p, sheet);
    const kit = kitFor(loadout);
    p.kit = { defs: {}, mods: {}, mechanics: {} };
    for (const w of Object.values(WEAPONS)) {
      const k = kit[w.id];
      if (k.def !== w) p.kit.defs[w.slot] = k.def;
      if (Object.values(loadout.chips?.[w.id] ?? {}).some(Boolean)) p.kit.mods[w.slot] = k.mods;
      if (k.mechanics.length) p.kit.mechanics[w.slot] = k.mechanics;
      // a firmware that changes the magazine starts with that magazine
      if (k.def.magSize !== w.magSize) p.weapon.ammo[w.slot] = k.def.magSize;
    }
    const slot = WEAPONS[loadout.primary]?.slot ?? 1;
    p.weapon.slot = slot;
  }

  removePlayer(id: number): void {
    this.players.delete(id);
  }

  drainEvents(): SimEvent[] {
    const e = this.pending;
    this.pending = [];
    return e;
  }

  private emit(ev: SimEvent, opts: StepOpts): void {
    if (!opts.silent) this.pending.push(ev);
  }

  /** Advance exactly one tick. */
  step(inputs: ReadonlyMap<number, TickInput | TickInput[]>, opts: StepOpts = {}): void {
    for (const p of this.players.values()) {
      const raw = inputs.get(p.id);
      const list: TickInput[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
      if (list.length === 0) {
        if (opts.online) continue;
        list.push({ ...emptyInput(this.tick), yaw: p.yaw, pitch: p.pitch });
      }
      for (const input of list) this.applyInput(p, input, opts);
    }
    for (const p of this.players.values()) {
      if (p.pos.y < this.level.killY && p.alive) this.killPlayer(p, -1, "fall", opts);
      if (!p.alive && !opts.predictOnly) {
        p.respawnTimer -= SIM_DT;
        if (p.respawnTimer <= 0) {
          respawnPlayer(p, this.level.spawns[(p.id + this.tick) % this.level.spawns.length]!);
          this.emit({ tick: this.tick, playerId: p.id, type: "respawn" }, opts);
        }
      }
    }
    if (!opts.predictOnly) {
      this.stepProjectilesAndClouds(opts);
      if (this.ai) this.stepAI(opts);
      if (this.wake) this.stepWakeMode(opts);
      if (this.run) this.stepRunMode(opts);
    }
    this.stepDummies();
    this.tick++;
  }

  private stepRunMode(opts: StepOpts): void {
    const events: RunEvent[] = [];
    stepRun(this.run!, [...this.players.values()].map((p) => ({ id: p.id, team: p.team, pos: p.pos, alive: p.alive })), events);
    for (const e of events) this.emit({ tick: this.tick, playerId: "playerId" in e ? e.playerId : -1, ...e }, opts);
  }

  private stepWakeMode(opts: StepOpts): void {
    const w = this.wake!;
    const occupants = [...this.players.values()].map((p) => ({ team: p.team, pos: p.pos, flipMult: p.flipMult, alive: p.alive, credit: p.stats }));
    const per: [number, number, number] = [0, 0, 0];
    for (const p of this.players.values()) if (p.team === 1 || p.team === 2) per[p.team]++;
    const events: WakeEvent[] = [];
    const solo = per[1] + per[2] <= 1;
    stepWake(w, occupants, per, events, solo);
    for (const e of events) this.emit({ tick: this.tick, playerId: -1, ...e }, opts);
  }

  /** Apply one input to one player: movement + weapon; resolve its fire requests. */
  applyInput(p: PlayerState, input: TickInput, opts: StepOpts = {}): void {
    const events: PlayerEvent[] = [];
    const reqs = stepPlayer(p, input, this.level.boxes, events, this.seed, this.gravityMult);
    for (const ev of events) this.emit({ tick: this.tick, playerId: p.id, ...ev }, opts);
    if (!p.alive) return;
    for (const r of reqs) this.resolveRequest(p, r, input.viewTick ?? this.tick, input.viewFrac ?? 0, opts);
  }

  private resolveRequest(p: PlayerState, r: FireRequest, viewTick: number, viewFrac: number, opts: StepOpts): void {
    const origin = eyePos(p);
    if (r.kind === "ray") {
      const rewound = opts.predictOnly ? null : opts.rewind?.(p.id, viewTick, viewFrac) ?? null;
      for (const d of r.dirs) {
        const dir = viewDir(d.yaw, d.pitch);
        this.castRay(p.id, r.weapon, origin, dir, r.damage, r.headMult, r.legMult, r.range, r.pierce, rewound, viewTick, opts, r.slug);
      }
      return;
    }
    if (r.kind === "melee") {
      if (opts.predictOnly) {
        this.emit({ tick: this.tick, playerId: p.id, type: "melee", weapon: r.weapon, hits: [], lunge: r.lunge }, opts);
        return;
      }
      const f = yawDir(p.yaw);
      const hits: ShotHit[] = [];
      const inArc = (pos: Vec3, radius: number): boolean => {
        const d = sub(v3(pos.x, origin.y, pos.z), origin);
        const dd = len(d);
        if (dd > r.reach + radius) return false;
        if (dd < 1e-6) return true;
        const cos = dot(normalize(d), f);
        return cos >= Math.cos(r.arc);
      };
      let first: { kind: TargetKind; id: number; pos: Vec3 } | null = null;
      for (const o of this.players.values()) {
        if (o === p || !o.alive) continue;
        if (inArc(o.pos, MOVE.capsuleRadius)) { first = { kind: "player", id: o.id, pos: o.pos }; break; }
      }
      if (!first) for (const d of this.dummies) if (d.alive && inArc(d.pos, DUMMY_RADIUS)) { first = { kind: "dummy", id: d.id, pos: d.pos }; break; }
      if (!first) for (const w of this.wasps) if (w.alive && inArc(v3(w.pos.x, w.pos.y - WASP_HEIGHT / 2, w.pos.z), WASP_RADIUS)) { first = { kind: "wasp", id: w.id, pos: w.pos }; break; }
      if (!first) for (const m of this.mechs) if (m.alive && inArc(m.pos, MECH_RADIUS)) { first = { kind: "mech", id: m.id, pos: m.pos }; break; }
      if (first) {
        const md = Math.round(r.damage * modsFor(p).damage);
        hits.push({ kind: first.kind, id: first.id, damage: md, zone: "body" });
        this.applyDamage(first.kind, first.id, md, p.id, r.weapon, "melee", opts, { alt: r.lunge, distance: 1 });
        if (first.kind === "player") this.stunPlayer(first.id, r.stun, p.id, opts);
        if (r.lunge) {
          p.weapon.lungeHit = true;
          p.weapon.lungeT = 0; // the dash ends on contact
          p.vel.x *= 0.2;
          p.vel.z *= 0.2;
        }
        // chain: one more adjacent enemy takes the arc
        if (r.chainRange > 0) {
          for (const o of this.players.values()) {
            if (o === p || o.id === first.id || !o.alive) continue;
            if (dist(o.pos, first.pos) <= r.chainRange) {
              hits.push({ kind: "player", id: o.id, damage: r.chainDamage, zone: "body" });
              this.applyDamage("player", o.id, r.chainDamage, p.id, r.weapon, "melee", opts);
              this.stunPlayer(o.id, r.stun, p.id, opts);
              break;
            }
          }
          for (const d of this.dummies) {
            if (!d.alive || (first.kind === "dummy" && d.id === first.id)) continue;
            if (dist(d.pos, first.pos) <= r.chainRange) {
              hits.push({ kind: "dummy", id: d.id, damage: r.chainDamage, zone: "body" });
              this.applyDamage("dummy", d.id, r.chainDamage, p.id, r.weapon, "melee", opts);
              break;
            }
          }
        }
      }
      this.emit({ tick: this.tick, playerId: p.id, type: "melee", weapon: r.weapon, hits, lunge: r.lunge }, opts);
      return;
    }
    // projectile
    if (opts.predictOnly) return; // projectiles are server-driven
    const dir = viewDir(p.yaw + p.weapon.kickYaw, p.pitch + p.weapon.kickPitch);
    const start = addScaled(origin, dir, 0.6);
    const vel = v3(dir.x * r.speed + p.vel.x * 0.5, dir.y * r.speed + p.vel.y * 0.3, dir.z * r.speed + p.vel.z * 0.5);
    this.projectiles.push(createProjectile(this.nextProjId++, r.projKind, p.id, start, vel));
  }

  /** Cast one ray from a player (or a wasp with negative shooter id) and apply damage. */
  private castRay(shooterId: number, weapon: WeaponId | "wasp", origin: Vec3, dir: Vec3, damage: number, headMult: number, legMult: number, range: RangeProfile, pierce: boolean, rewound: ReadonlyMap<number, RewindPose> | null, viewTick: number, opts: StepOpts, slug = false): void {
    const maxT: number = range.max;
    let worldT: number = maxT;
    for (const b of this.level.boxes) {
      const t = rayBox(origin, dir, b, worldT);
      if (t !== null && t < worldT) worldT = t;
    }
    const cands: { t: number; hit: ShotHit }[] = [];
    let nearMiss = Infinity;
    const shooterP = shooterId > 0 ? this.players.get(shooterId) : undefined;
    const shooterMods = shooterP ? modsFor(shooterP) : undefined;
    const dmgMult = shooterMods?.damage ?? 1;
    const rangeP: RangeProfile = shooterMods && shooterMods.range !== 1 ? { ...range, fullTo: range.fullTo * shooterMods.range, falloffTo: range.falloffTo * shooterMods.range } : range;
    const zoneDmg = (t: number, feetY: number, height: number, hm: number, lm: number): { zone: HitZone; damage: number } => {
      const zone = zoneOf(origin.y + dir.y * t, feetY, height);
      const mult = zone === "head" ? hm * (shooterMods?.headMult ?? 1) : zone === "legs" ? lm : 1;
      return { zone, damage: Math.max(1, Math.round(damage * dmgMult * mult * falloff(rangeP, t))) };
    };
    if (!opts.predictOnly) {
      for (const d of this.dummies) {
        if (!d.alive) continue;
        const t = rayCapsule(origin, dir, d.pos, DUMMY_RADIUS, DUMMY_HEIGHT, worldT);
        if (t !== null) cands.push({ t, hit: { kind: "dummy", id: d.id, ...zoneDmg(t, d.pos.y, DUMMY_HEIGHT, headMult, legMult) } });
      }
      for (const o of this.players.values()) {
        if (o.id === shooterId) continue;
        const pose = rewound?.get(o.id);
        if (!o.alive || (pose && !pose.alive)) continue;
        const pos = pose ? pose.pos : o.pos;
        const height = pose ? pose.height : o.height;
        {
          const cx = pos.x - origin.x, cy = pos.y + height * 0.5 - origin.y, cz = pos.z - origin.z;
          const along = cx * dir.x + cy * dir.y + cz * dir.z;
          if (along > 0) {
            const px = origin.x + dir.x * along, py = origin.y + dir.y * along, pz = origin.z + dir.z * along;
            const dd = Math.sqrt((px - pos.x) ** 2 + (py - (pos.y + height * 0.5)) ** 2 + (pz - pos.z) ** 2);
            if (dd < nearMiss) nearMiss = dd;
          }
        }
        const t = rayCapsule(origin, dir, pos, MOVE.capsuleRadius, height, worldT);
        if (t !== null) cands.push({ t, hit: { kind: "player", id: o.id, ...zoneDmg(t, pos.y, height, headMult, legMult) } });
      }
      for (const w of this.wasps) {
        if (!w.alive || shooterId < 0) continue;
        const t = rayCapsule(origin, dir, v3(w.pos.x, w.pos.y - WASP_HEIGHT / 2, w.pos.z), WASP_RADIUS, WASP_HEIGHT, worldT);
        if (t !== null) cands.push({ t, hit: { kind: "wasp", id: w.id, zone: "body", damage: Math.max(1, Math.round(damage * dmgMult * falloff(rangeP, t))) } });
      }
      for (const m of this.mechs) {
        if (!m.alive || shooterId < 0) continue;
        const t = rayCapsule(origin, dir, m.pos, MECH_RADIUS, MECH_HEIGHT, worldT);
        if (t !== null) cands.push({ t, hit: { kind: "mech", id: m.id, zone: "body", damage: Math.max(1, Math.round(damage * dmgMult * 0.5 * falloff(rangeP, t))) } });
      }
    }
    cands.sort((a, b) => a.t - b.t);
    const applied = pierce ? cands : cands.slice(0, 1);
    const endT = applied.length && !pierce ? applied[0]!.t : worldT;
    const to = addScaled(origin, dir, endT);
    const hits = applied.map((c) => c.hit);
    const first: ShotHit = hits[0] ?? { kind: worldT < maxT ? "world" : "none", id: -1, damage: 0 };
    this.emit({ tick: this.tick, playerId: shooterId, type: "shot", weapon, from: origin, to, hit: first, hits, nearMiss: Number.isFinite(nearMiss) ? nearMiss : -1, rewindTicks: this.tick - viewTick, pierce }, opts);
    if (opts.predictOnly) return;
    if (shooterId > 0) {
      const shooter = this.players.get(shooterId);
      if (shooter && hits.length) shooter.stats.hits++;
    }
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i]!;
      const hc = cands.find((c) => c.hit === h);
      this.applyDamage(h.kind, h.id, h.damage, shooterId, weapon, "shot", opts, { zone: h.zone, distance: hc?.t ?? 0, alt: slug, through: pierce && i > 0 });
    }
  }

  private stunPlayer(id: number, seconds: number, by: number, opts: StepOpts): void {
    const v = this.players.get(id);
    if (!v || !v.alive) return;
    v.weapon.stunTimer = Math.max(v.weapon.stunTimer, seconds);
    v.weapon.charging = false;
    v.weapon.charge = 0;
    this.emit({ tick: this.tick, playerId: id, type: "stun", by }, opts);
  }

  /** Damage any entity; handles deaths, kill events and TTK bookkeeping. */
  applyDamage(kind: TargetKind, id: number, damage: number, attacker: number, weapon: string, how: "shot" | "explosion" | "melee" | "beam", opts: StepOpts = {}, hit: { zone?: HitZone; distance?: number; alt?: boolean; through?: boolean; projKind?: string } = {}): void {
    if (damage <= 0) return;
    const shooter = attacker > 0 ? this.players.get(attacker) : undefined;
    // THE RUN's safe zones: nothing inside one takes damage, and nothing inside one deals it
    if (this.run) {
      if (shooter && inSafeZone(this.run, shooter.pos)) return;
      if (kind === "player") {
        const v = this.players.get(id);
        if (v && inSafeZone(this.run, v.pos)) return;
      }
    }
    const mech = shooter ? (shooter.kit.mechanics[shooter.weapon.slot] ?? []) : [];
    if (shooter && (kind === "wasp" || kind === "mech") && mech.includes("vantage_bane")) damage = Math.round(damage * 1.25);
    const ctx = (victimTeam: number, victimEmp: boolean): KillCtx => ({
      how,
      zone: hit.zone ?? null,
      distance: hit.distance ?? 0,
      alt: hit.alt ?? false,
      through: hit.through ?? false,
      projKind: hit.projKind ?? null,
      shooterStance: shooter?.stance ?? "stand",
      shooterAir: shooter ? !shooter.grounded : false,
      shooterSlideJump: shooter ? !shooter.grounded && shooter.slideTime > 0 : false,
      victimTeam,
      victimEmp,
    });
    const onKill = () => {
      if (!shooter) return;
      if (mech.includes("escrow_kill")) shooter.shield = Math.min(shooter.maxShield, shooter.shield + 10);
      if (mech.includes("contagion_kill") && this.wake) boostNearest(this.wake, shooter.pos, 4, 1.06);
    };
    if (kind === "dummy") {
      const d = this.dummies.find((x) => x.id === id);
      if (!d || !d.alive) return;
      if (d.firstDamageTick < 0) d.firstDamageTick = this.tick;
      d.hitsTaken++;
      d.health -= damage;
      if (d.health <= 0) {
        d.alive = false;
        d.respawnTimer = DUMMY_RESPAWN_SECONDS;
        if (shooter) shooter.stats.kills++;
        onKill();
        const ttk = this.tick - d.firstDamageTick;
        this.emit({ tick: this.tick, playerId: attacker, type: "kill", victimKind: "dummy", victimId: d.id, ttkTicks: ttk, ttkSeconds: ttk / SIM_HZ, weapon, ctx: ctx(0, false) }, opts);
      }
      return;
    }
    if (kind === "player") {
      const v = this.players.get(id);
      if (!v || !v.alive) return;
      if (v.firstDamageTick < 0) v.firstDamageTick = this.tick;
      v.lastAttacker = attacker;
      v.sinceDamage = 0;
      // shields soak first
      const toShield = Math.min(v.shield, damage);
      v.shield -= toShield;
      v.health -= damage - toShield;
      this.emit({ tick: this.tick, playerId: id, type: "hurt", damage, by: attacker, kind: how }, opts);
      if (v.health <= 0) {
        const ttk = this.tick - v.firstDamageTick;
        const kctx = ctx(v.team, v.weapon.empTimer > 0);
        this.killPlayer(v, attacker, weapon, opts);
        if (shooter) {
          shooter.stats.kills++;
          if (this.wake && shooter.team !== v.team) addKillPoints(this.wake, shooter.team);
        }
        onKill();
        this.emit({ tick: this.tick, playerId: attacker, type: "kill", victimKind: "player", victimId: v.id, ttkTicks: ttk, ttkSeconds: ttk / SIM_HZ, weapon, ctx: kctx }, opts);
      }
      return;
    }
    if (kind === "wasp") {
      const w = this.wasps.find((x) => x.id === id);
      if (!w || !w.alive) return;
      w.health -= damage;
      if (w.health <= 0) {
        w.alive = false;
        w.respawnTimer = WASP.respawn;
        const sh = this.players.get(attacker);
        if (sh) sh.stats.support += 2;
        this.emit({ tick: this.tick, playerId: attacker, type: "waspDeath", waspId: w.id }, opts);
        this.emit({ tick: this.tick, playerId: attacker, type: "kill", victimKind: "wasp", victimId: w.id, ttkTicks: 0, ttkSeconds: 0, weapon, ctx: ctx(0, false) }, opts);
      }
      return;
    }
    if (kind === "mech") {
      const m = this.mechs.find((x) => x.id === id);
      if (!m || !m.alive) return;
      m.health -= damage;
      if (m.health <= 0) {
        m.alive = false;
        m.respawnTimer = MECH.respawn;
        const sh = this.players.get(attacker);
        if (sh) sh.stats.support += 6;
        this.emit({ tick: this.tick, playerId: attacker, type: "mechDeath", mechId: m.id }, opts);
        this.emit({ tick: this.tick, playerId: attacker, type: "kill", victimKind: "mech", victimId: m.id, ttkTicks: 0, ttkSeconds: 0, weapon, ctx: ctx(0, false) }, opts);
      }
    }
  }

  private killPlayer(v: PlayerState, killerId: number, _weapon: string, opts: StepOpts = {}): void {
    v.alive = false;
    v.health = 0;
    v.respawnTimer = 3;
    v.stats.deaths++;
    this.emit({ tick: this.tick, playerId: v.id, type: "death", killerId }, opts);
    if (this.run) {
      const dropped: RunEvent[] = [];
      dropCarried(this.run, v.id, v.pos, dropped);
      for (const e of dropped) this.emit({ tick: this.tick, playerId: v.id, ...e }, opts);
    }
  }

  private capsuleTargets(): CapsuleTarget[] {
    const out: CapsuleTarget[] = [];
    for (const p of this.players.values()) if (p.alive) out.push({ id: p.id, pos: p.pos, height: p.height, radius: MOVE.capsuleRadius });
    for (const d of this.dummies) if (d.alive) out.push({ id: 1000 + d.id, pos: d.pos, height: DUMMY_HEIGHT, radius: DUMMY_RADIUS });
    for (const w of this.wasps) if (w.alive) out.push({ id: 2000 + w.id, pos: v3(w.pos.x, w.pos.y - WASP_HEIGHT / 2, w.pos.z), height: WASP_HEIGHT, radius: WASP_RADIUS });
    for (const m of this.mechs) if (m.alive) out.push({ id: 3000 + m.id, pos: m.pos, height: MECH_HEIGHT, radius: MECH_RADIUS });
    return out;
  }

  private stepProjectilesAndClouds(opts: StepOpts): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]!;
      c.ttl -= SIM_DT;
      if (c.ttl <= 0) this.clouds.splice(i, 1);
    }
    const dets = stepProjectiles(this.projectiles, this.level.boxes, this.capsuleTargets());
    for (const det of dets) this.detonate(det.proj, det.pos, det.directTarget, opts);
  }

  private detonate(p: Projectile, pos: Vec3, direct: CapsuleTarget | null, opts: StepOpts): void {
    const weapon = p.kind === "phage" || p.kind === "sticky" ? "phage" : p.kind;
    if (p.kind === "smoke") {
      this.clouds.push({ id: this.nextCloudId++, pos: clone(pos), radius: p.radius, ttl: GRENADES.smoke.duration });
      this.emit({ tick: this.tick, playerId: p.owner, type: "cloud", pos: clone(pos), radius: p.radius }, opts);
      return;
    }
    if (p.kind === "emp") {
      for (const o of this.players.values()) {
        if (!o.alive) continue;
        if (dist(v3(o.pos.x, o.pos.y + 0.9, o.pos.z), pos) <= p.radius) {
          o.weapon.empTimer = Math.max(o.weapon.empTimer, GRENADES.emp.duration);
          o.shield = 0;
          o.sinceDamage = 0;
        }
      }
      for (const w of this.wasps) if (w.alive && dist(w.pos, pos) <= p.radius + 1) w.disabledTimer = Math.max(w.disabledTimer, GRENADES.emp.duration);
      for (const m of this.mechs) if (m.alive && dist(v3(m.pos.x, m.pos.y + 1.7, m.pos.z), pos) <= p.radius + 1.5) m.disabledTimer = Math.max(m.disabledTimer, GRENADES.emp.duration);
      this.emit({ tick: this.tick, playerId: p.owner, type: "emp", pos: clone(pos), radius: p.radius }, opts);
      return;
    }
    this.emit({ tick: this.tick, playerId: p.owner, type: "explode", projKind: p.kind, pos: clone(pos), radius: p.radius }, opts);
    if (this.wake && (p.kind === "phage" || p.kind === "sticky")) boostNodes(this.wake, pos, p.radius); // violet burst speeds the wake
    if (direct) {
      const kind: TargetKind = direct.id >= 3000 ? "mech" : direct.id >= 2000 ? "wasp" : direct.id >= 1000 ? "dummy" : "player";
      const id = direct.id >= 3000 ? direct.id - 3000 : direct.id >= 2000 ? direct.id - 2000 : direct.id >= 1000 ? direct.id - 1000 : direct.id;
      this.applyDamage(kind, id, p.direct, p.owner, weapon, "explosion", opts, { projKind: p.kind, alt: p.kind === "sticky", distance: 0 });
    }
    this.applyExplosion(pos, p.radius, p.damage, p.edgeDamage, p.owner, weapon, direct ? direct.id : -1, opts);
  }

  /** Radial damage with line-of-sight through the level. Self-damage applies. */
  applyExplosion(center: Vec3, radius: number, damage: number, edge: number, owner: number, weapon: string, excludeCapsuleId: number, opts: StepOpts): void {
    const dmg = (d: number) => Math.round(damage + (edge - damage) * Math.min(1, d / radius));
    for (const t of this.capsuleTargets()) {
      if (t.id === excludeCapsuleId) continue;
      const chest = v3(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z);
      const d = dist(chest, center) - t.radius;
      if (d > radius) continue;
      if (!canSee(center, chest, this.level.boxes, [])) continue;
      const kind: TargetKind = t.id >= 3000 ? "mech" : t.id >= 2000 ? "wasp" : t.id >= 1000 ? "dummy" : "player";
      const id = t.id >= 3000 ? t.id - 3000 : t.id >= 2000 ? t.id - 2000 : t.id >= 1000 ? t.id - 1000 : t.id;
      this.applyDamage(kind, id, dmg(Math.max(0, d)), owner, weapon, "explosion", opts, { projKind: weapon, distance: d });
    }
  }

  private stepAI(opts: StepOpts): void {
    const targets: SightTarget[] = [];
    for (const p of this.players.values()) targets.push({ id: p.id, eye: eyePos(p), chest: v3(p.pos.x, p.pos.y + p.height * 0.55, p.pos.z), alive: p.alive, detectMult: modsFor(p).droneDetect * (0.85 + 0.15 * modsFor(p).footstep) });
    const reqs: AiRequest[] = [];
    for (const w of this.wasps) stepWasp(w, targets, this.level.boxes, this.clouds, this.tick, reqs);
    for (const m of this.mechs) stepMech(m, targets, this.level.boxes, this.clouds, reqs);
    for (const r of reqs) {
      if (r.kind === "waspShot") {
        const dir = viewDir(r.yaw, r.pitch);
        this.castRay(-(100 + r.wasp), "wasp", r.origin, dir, WASP.damage, 1, 1, { ideal: 10, fullTo: 30, falloffTo: 40, minMult: 0.5, max: 60 }, false, null, this.tick, opts);
      } else if (r.kind === "mechFlag") {
        this.emit({ tick: this.tick, playerId: r.targetId, type: "flagged", mechId: r.mech }, opts);
      } else {
        const v = this.players.get(r.targetId);
        if (!v || !v.alive) continue;
        const to = v3(v.pos.x, v.pos.y + v.height * 0.55, v.pos.z);
        this.emit({ tick: this.tick, playerId: r.targetId, type: "mechBeam", mechId: r.mech, from: clone(r.origin), to, damage: r.damage }, opts);
        this.applyDamage("player", v.id, r.damage, -(200 + r.mech), "mech", "beam", opts);
      }
    }
  }

  private stepDummies(): void {
    for (const d of this.dummies) {
      if (!d.alive) {
        if (!this.dummyRespawn) continue;
        d.respawnTimer -= SIM_DT;
        if (d.respawnTimer <= 0) {
          d.alive = true;
          d.health = DUMMY_MAX_HEALTH;
          d.firstDamageTick = -1;
          d.hitsTaken = 0;
          this.pending.push({ tick: this.tick, playerId: -1, type: "dummyRespawn", dummyId: d.id });
        }
        continue;
      }
      const to = d.def.patrolTo;
      if (to) {
        const length = dist(d.def.pos, to);
        const speed = 1.6;
        d.phase += (d.dir * speed * SIM_DT) / Math.max(0.01, length);
        if (d.phase >= 1) {
          d.phase = 1;
          d.dir = -1;
        } else if (d.phase <= 0) {
          d.phase = 0;
          d.dir = 1;
        }
        d.pos.x = d.def.pos.x + (to.x - d.def.pos.x) * d.phase;
        d.pos.y = d.def.pos.y + (to.y - d.def.pos.y) * d.phase;
        d.pos.z = d.def.pos.z + (to.z - d.def.pos.z) * d.phase;
      }
    }
  }

  // ---- state export for the network ----

  exportLocal(p: PlayerState, seq: number): LocalAuth {
    const w = p.weapon;
    return {
      seq,
      x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: p.vel.x, vy: p.vel.y, vz: p.vel.z,
      yaw: p.yaw, pitch: p.pitch,
      stance: p.stance === "stand" ? 0 : p.stance === "crouch" ? 1 : p.stance === "slide" ? 2 : 3,
      height: p.height, grounded: p.grounded ? 1 : 0, airTime: p.airTime, jumpBuffer: p.jumpBuffer,
      slideTime: p.slideTime, slideCooldown: p.slideCooldown, sdx: p.slideDir.x, sdz: p.slideDir.z,
      mfx: p.mantleFrom.x, mfy: p.mantleFrom.y, mfz: p.mantleFrom.z, mtx: p.mantleTo.x, mty: p.mantleTo.y, mtz: p.mantleTo.z, mantleT: p.mantleT,
      health: p.health, alive: p.alive ? 1 : 0, respawnTimer: p.respawnTimer, prevButtons: p.prevButtons,
      shield: p.shield, sinceDamage: p.sinceDamage,
      kills: p.stats.kills, deaths: p.stats.deaths, shots: p.stats.shots, hits: p.stats.hits,
      team: p.team,
      slot: w.slot, ammo: w.ammo.slice(), reloadTimer: w.reloadTimer, reloadTotal: w.reloadTotal, reloadSeated: w.reloadSeated ? 1 : 0, fireCooldown: w.fireCooldown,
      charge: w.charge, charging: w.charging ? 1 : 0, shotIndex: w.shotIndex, magSeed: w.magSeed, magCount: w.magCount, altActive: w.altActive ? 1 : 0, altCooldown: w.altCooldown,
      lungeT: w.lungeT, lungeHit: w.lungeHit ? 1 : 0, grenades: w.grenades.slice(), grenadeSel: w.grenadeSel, grenadeCooldown: w.grenadeCooldown, swapTimer: w.swapTimer,
      kickPitch: w.kickPitch, kickYaw: w.kickYaw, patX: w.patX, patY: w.patY, stunTimer: w.stunTimer, empTimer: w.empTimer, sinceShot: w.sinceShot,
      burstLeft: w.burstLeft, burstTimer: w.burstTimer,
    };
  }

  importLocal(p: PlayerState, l: LocalAuth): void {
    set(p.pos, l.x, l.y, l.z);
    set(p.vel, l.vx, l.vy, l.vz);
    p.yaw = l.yaw;
    p.pitch = l.pitch;
    p.stance = l.stance === 0 ? "stand" : l.stance === 1 ? "crouch" : l.stance === 2 ? "slide" : "mantle";
    p.height = l.height;
    p.grounded = l.grounded === 1;
    p.airTime = l.airTime;
    p.jumpBuffer = l.jumpBuffer;
    p.slideTime = l.slideTime;
    p.slideCooldown = l.slideCooldown;
    set(p.slideDir, l.sdx, 0, l.sdz);
    set(p.mantleFrom, l.mfx, l.mfy, l.mfz);
    set(p.mantleTo, l.mtx, l.mty, l.mtz);
    p.mantleT = l.mantleT;
    p.health = l.health;
    p.shield = l.shield;
    p.sinceDamage = l.sinceDamage;
    p.alive = l.alive === 1;
    p.respawnTimer = l.respawnTimer;
    p.prevButtons = l.prevButtons;
    p.stats.kills = l.kills;
    p.stats.deaths = l.deaths;
    p.stats.shots = l.shots;
    p.stats.hits = l.hits;
    p.team = l.team;
    const w = p.weapon;
    w.slot = l.slot;
    w.ammo = l.ammo.slice();
    w.reloadTimer = l.reloadTimer;
    w.reloadTotal = l.reloadTotal;
    w.reloadSeated = l.reloadSeated === 1;
    w.fireCooldown = l.fireCooldown;
    w.charge = l.charge;
    w.charging = l.charging === 1;
    w.shotIndex = l.shotIndex;
    w.magSeed = l.magSeed;
    w.magCount = l.magCount;
    w.altActive = l.altActive === 1;
    w.altCooldown = l.altCooldown;
    w.lungeT = l.lungeT;
    w.lungeHit = l.lungeHit === 1;
    w.grenades = l.grenades.slice();
    w.grenadeSel = l.grenadeSel;
    w.grenadeCooldown = l.grenadeCooldown;
    w.swapTimer = l.swapTimer;
    w.kickPitch = l.kickPitch;
    w.kickYaw = l.kickYaw;
    w.patX = l.patX;
    w.patY = l.patY;
    w.stunTimer = l.stunTimer;
    w.empTimer = l.empTimer;
    w.sinceShot = l.sinceShot;
    w.burstLeft = l.burstLeft;
    w.burstTimer = l.burstTimer;
  }

  poses(): Map<number, RewindPose> {
    const m = new Map<number, RewindPose>();
    for (const p of this.players.values()) m.set(p.id, { pos: clone(p.pos), height: p.height, alive: p.alive });
    return m;
  }

  aimAt(p: PlayerState, target: Vec3): { yaw: number; pitch: number } {
    const e = eyePos(p);
    const d = normalize(sub(target, e));
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))) };
  }
}

/** Stable digest of all gameplay-relevant state; equal digests ⇒ identical simulation. */
export function hashWorld(w: World): string {
  const parts: number[] = [w.tick];
  const push = (v: Vec3) => parts.push(v.x, v.y, v.z);
  for (const p of [...w.players.values()].sort((a, b) => a.id - b.id)) {
    push(p.pos);
    push(p.vel);
    parts.push(p.yaw, p.pitch, p.height, p.grounded ? 1 : 0, p.health, p.shield, p.slideTime, p.mantleT);
    parts.push(p.stance === "stand" ? 0 : p.stance === "crouch" ? 1 : p.stance === "slide" ? 2 : 3);
    const wp = p.weapon;
    parts.push(wp.slot, wp.reloadTimer, wp.fireCooldown, wp.charge, wp.shotIndex, wp.magSeed, wp.kickPitch, wp.kickYaw, wp.patX, wp.patY, wp.stunTimer, wp.empTimer, ...wp.ammo, ...wp.grenades);
  }
  for (const d of w.dummies) {
    push(d.pos);
    parts.push(d.health, d.alive ? 1 : 0, d.respawnTimer, d.phase);
  }
  for (const pr of w.projectiles) {
    push(pr.pos);
    push(pr.vel);
    parts.push(pr.fuse, pr.stuck ? 1 : 0);
  }
  for (const c of w.clouds) parts.push(c.pos.x, c.pos.z, c.ttl);
  for (const ws of w.wasps) {
    push(ws.pos);
    parts.push(ws.health, ws.alive ? 1 : 0, ws.wp, ws.fireCooldown);
  }
  for (const m of w.mechs) {
    push(m.pos);
    parts.push(m.health, m.alive ? 1 : 0, m.lightYaw, m.lockTimer);
  }
  if (w.wake) {
    parts.push(w.wake.timeLeft, w.wake.score[1], w.wake.score[2], w.wake.kernelTimer, w.wake.phase === "wake" ? 1 : w.wake.phase === "warmup" ? 0 : 2);
    for (const n of w.wake.nodes) parts.push(n.owner, n.hold, n.boost);
  }
  const buf = new Float64Array(parts);
  const bytes = new Uint8Array(buf.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const horizontalSpeed = (p: PlayerState): number => lenXZ(p.vel);
export { v3, copy, WEAPONS };
