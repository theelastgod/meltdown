import { DUMMY_MAX_HEALTH, DUMMY_RESPAWN_SECONDS, LEASE_BREAKER, MOVE, SIM_DT, SIM_HZ } from "./constants";
import { emptyInput, type InputFrame } from "./input";
import type { DummyDef, LevelDef } from "./level";
import { rayBox, rayCapsule } from "./collision";
import { createPlayer, eyePos, respawnPlayer, stepPlayer, type PlayerEvent, type PlayerState } from "./player";
import { type Vec3, v3, clone, addScaled, viewDir, dist, lenXZ, sub, normalize } from "../math/vec3";

export type HitZone = "head" | "body" | "legs";

export interface Dummy {
  id: number;
  def: DummyDef;
  pos: Vec3;
  health: number;
  alive: boolean;
  respawnTimer: number;
  /** patrol phase in [0,1), direction +1/-1 */
  phase: number;
  dir: number;
  firstDamageTick: number;
  hitsTaken: number;
}

export type SimEvent =
  | ({ tick: number; playerId: number } & PlayerEvent)
  | {
      tick: number;
      playerId: number;
      type: "shot";
      from: Vec3;
      to: Vec3;
      hit: { kind: "world" | "dummy" | "player" | "none"; id: number; zone?: HitZone; damage: number };
    }
  | { tick: number; playerId: number; type: "kill"; victimKind: "dummy" | "player"; victimId: number; ttkTicks: number; ttkSeconds: number }
  | { tick: number; playerId: number; type: "death"; killerId: number }
  | { tick: number; playerId: number; type: "respawn" }
  | { tick: number; playerId: number; type: "dummyRespawn"; dummyId: number };

export const DUMMY_RADIUS = MOVE.capsuleRadius;
export const DUMMY_HEIGHT = MOVE.standHeight;

export function zoneOf(hitY: number, feetY: number, height: number): HitZone {
  const f = (hitY - feetY) / height;
  if (f > 0.82) return "head";
  if (f < 0.42) return "legs";
  return "body";
}

export function zoneMult(z: HitZone): number {
  return z === "head" ? LEASE_BREAKER.headMult : z === "legs" ? LEASE_BREAKER.legMult : 1;
}

/**
 * The authoritative world. Deterministic: same inputs → same state. No
 * Math.random, no wall clock. Used unchanged by client prediction and server.
 */
export class World {
  tick = 0;
  readonly level: LevelDef;
  readonly players = new Map<number, PlayerState>();
  readonly dummies: Dummy[] = [];
  private pending: SimEvent[] = [];
  private nextSpawn = 0;

  constructor(level: LevelDef) {
    this.level = level;
    for (const d of level.dummies) {
      this.dummies.push({
        id: d.id,
        def: d,
        pos: clone(d.pos),
        health: DUMMY_MAX_HEALTH,
        alive: true,
        respawnTimer: 0,
        phase: 0,
        dir: 1,
        firstDamageTick: -1,
        hitsTaken: 0,
      });
    }
  }

  get time(): number {
    return this.tick / SIM_HZ;
  }

  addPlayer(id: number, name = "BLANK"): PlayerState {
    const spawn = this.level.spawns[this.nextSpawn % this.level.spawns.length]!;
    this.nextSpawn++;
    const p = createPlayer(id, name, spawn);
    this.players.set(id, p);
    return p;
  }

  removePlayer(id: number): void {
    this.players.delete(id);
  }

  /** Drain events produced since the last drain. */
  drainEvents(): SimEvent[] {
    const e = this.pending;
    this.pending = [];
    return e;
  }

  /** Advance exactly one tick with the given per-player inputs (missing players idle). */
  step(inputs: ReadonlyMap<number, InputFrame>): void {
    const boxes = this.level.boxes;
    const perPlayer: PlayerEvent[] = [];
    for (const p of this.players.values()) {
      const input = inputs.get(p.id) ?? { ...emptyInput(this.tick), yaw: p.yaw, pitch: p.pitch };
      perPlayer.length = 0;
      stepPlayer(p, input, boxes, perPlayer);
      for (const ev of perPlayer) this.pending.push({ tick: this.tick, playerId: p.id, ...ev });
      if (p.pos.y < this.level.killY && p.alive) this.killPlayer(p, -1);
      if (!p.alive) {
        p.respawnTimer -= SIM_DT;
        if (p.respawnTimer <= 0) {
          respawnPlayer(p, this.level.spawns[(p.id + this.tick) % this.level.spawns.length]!);
          this.pending.push({ tick: this.tick, playerId: p.id, type: "respawn" });
        }
      }
    }
    // Hitscan resolves after all movement so both parties are at this tick's positions.
    for (const p of this.players.values()) {
      if (p.firedThisTick && p.alive) this.resolveShot(p);
    }
    this.stepDummies();
    this.tick++;
  }

  private stepDummies(): void {
    for (const d of this.dummies) {
      if (!d.alive) {
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

  /** Cast the shooter's view ray against the level, dummies and other players. */
  private resolveShot(shooter: PlayerState): void {
    const origin = eyePos(shooter);
    const dir = viewDir(shooter.yaw + shooter.kickYaw, shooter.pitch + shooter.kickPitch);
    const maxT = LEASE_BREAKER.range;
    let bestT: number = maxT;
    let hit: { kind: "world" | "dummy" | "player" | "none"; id: number; zone?: HitZone; damage: number } = { kind: "none", id: -1, damage: 0 };
    for (const b of this.level.boxes) {
      const t = rayBox(origin, dir, b, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        hit = { kind: "world", id: -1, damage: 0 };
      }
    }
    for (const d of this.dummies) {
      if (!d.alive) continue;
      const t = rayCapsule(origin, dir, d.pos, DUMMY_RADIUS, DUMMY_HEIGHT, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        const zone = zoneOf(origin.y + dir.y * t, d.pos.y, DUMMY_HEIGHT);
        hit = { kind: "dummy", id: d.id, zone, damage: Math.round(LEASE_BREAKER.damage * zoneMult(zone)) };
      }
    }
    for (const other of this.players.values()) {
      if (other === shooter || !other.alive) continue;
      const t = rayCapsule(origin, dir, other.pos, MOVE.capsuleRadius, other.height, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        const zone = zoneOf(origin.y + dir.y * t, other.pos.y, other.height);
        hit = { kind: "player", id: other.id, zone, damage: Math.round(LEASE_BREAKER.damage * zoneMult(zone)) };
      }
    }
    const to = addScaled(origin, dir, bestT);
    this.pending.push({ tick: this.tick, playerId: shooter.id, type: "shot", from: origin, to, hit });

    if (hit.kind === "dummy") {
      const d = this.dummies.find((x) => x.id === hit.id)!;
      shooter.stats.hits++;
      if (d.firstDamageTick < 0) d.firstDamageTick = this.tick;
      d.hitsTaken++;
      d.health -= hit.damage;
      if (d.health <= 0) {
        d.alive = false;
        d.respawnTimer = DUMMY_RESPAWN_SECONDS;
        shooter.stats.kills++;
        const ttk = this.tick - d.firstDamageTick;
        this.pending.push({ tick: this.tick, playerId: shooter.id, type: "kill", victimKind: "dummy", victimId: d.id, ttkTicks: ttk, ttkSeconds: ttk / SIM_HZ });
      }
    } else if (hit.kind === "player") {
      const v = this.players.get(hit.id)!;
      shooter.stats.hits++;
      if (v.firstDamageTick < 0) v.firstDamageTick = this.tick;
      v.lastAttacker = shooter.id;
      v.health -= hit.damage;
      if (v.health <= 0) {
        const ttk = this.tick - v.firstDamageTick;
        this.killPlayer(v, shooter.id);
        shooter.stats.kills++;
        this.pending.push({ tick: this.tick, playerId: shooter.id, type: "kill", victimKind: "player", victimId: v.id, ttkTicks: ttk, ttkSeconds: ttk / SIM_HZ });
      }
    }
  }

  private killPlayer(v: PlayerState, killerId: number): void {
    v.alive = false;
    v.health = 0;
    v.respawnTimer = 3;
    v.stats.deaths++;
    this.pending.push({ tick: this.tick, playerId: v.id, type: "death", killerId });
  }

  /** Direction from a player's eye to a dummy's chest; used by bots and tests. */
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
    parts.push(p.yaw, p.pitch, p.height, p.grounded ? 1 : 0, p.health, p.ammo, p.reloadTimer, p.fireCooldown, p.slideTime, p.mantleT);
    parts.push(p.stance === "stand" ? 0 : p.stance === "crouch" ? 1 : p.stance === "slide" ? 2 : 3);
  }
  for (const d of w.dummies) {
    push(d.pos);
    parts.push(d.health, d.alive ? 1 : 0, d.respawnTimer, d.phase);
  }
  // FNV-1a over the float64 bit patterns
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
export { v3 };
