/**
 * THE RUN — the play-to-earn loop. A district is a PvP zone with claims in it: $CAPITAL units
 * VANTAGE never collected, lying where the city forgot them. A Blank who walks over one carries
 * it. Carried claims are lost on death — they drop where the file fell, for anyone. Carrying
 * them into a SAFE ZONE and holding still for a moment banks them: the room credits the file,
 * the counter-ledger pays the wallet. Inside a safe zone no one takes damage and no one deals
 * it; the markets are there.
 *
 * Deterministic, server-authoritative, shared with the offline sandbox. Nothing here reads a
 * stat and nothing in the sim reads a wallet: the run pays the counter-ledger; the wake pays
 * the file.
 */
import { SIM_DT } from "./constants";
import { type Vec3, v3 } from "../math/vec3";

export const RUN = {
  /** pickup radius around a claim */
  pickupRadius: 1.6,
  /** seconds a claim stays gone after a pickup before it respawns */
  respawnSeconds: 45,
  /** seconds a carrier must stand in a safe zone to bank */
  bankSeconds: 2,
  /** a dropped claim (a death) lies for this long, then returns to the city */
  dropSeconds: 120,
  /** the most a file can carry; anything beyond stays on the ground */
  carryCap: 40,
} as const;

/** THE RUN's payout rules, owned by the sim so the match room never imports the economy: the Depth gate (below it a run pays Scrip), the day's cap in units, Scrip per unit below the gate, whole $CAPITAL per unit at it. */
export const RUN_DEPTH = 10;
export const RUN_DAILY_CAP = 200;
export const RUN_SCRIP_PER_UNIT = 10;
export const CAPITAL_PER_UNIT = 1;

export interface ZoneDef {
  kind: "safe";
  label: string;
  pos: Vec3;
  radius: number;
}

export interface ClaimDef {
  pos: Vec3;
  /** $CAPITAL units */
  value: number;
}

export interface RunClaim {
  id: number;
  pos: Vec3;
  value: number;
  active: boolean;
  /** seconds until an inactive claim returns (spawned claims) or a dropped one expires */
  timer: number;
  /** a drop lies where a carrier fell; it does not respawn, it expires */
  dropped: boolean;
}

export interface RunCarrier {
  id: number;
  team: number;
  pos: Vec3;
  alive: boolean;
}

export interface RunState {
  zones: ZoneDef[];
  claims: RunClaim[];
  /** per player: units carried */
  carried: Map<number, number>;
  /** per player: units banked this session (the room credits the file per bank event) */
  banked: Map<number, number>;
  /** per player: seconds standing in a safe zone with something to bank */
  banking: Map<number, number>;
  nextId: number;
  /** total units banked by everyone (the room's stats line) */
  totalBanked: number;
}

export type RunEvent =
  | { type: "claim"; playerId: number; claimId: number; value: number; carried: number }
  | { type: "drop"; playerId: number; claimId: number; value: number; pos: Vec3 }
  | { type: "bank"; playerId: number; value: number; zone: string; banked: number }
  | { type: "claimReturn"; claimId: number };

export function createRun(zones: readonly ZoneDef[], claims: readonly ClaimDef[]): RunState {
  return {
    zones: zones.map((z) => ({ ...z, pos: v3(z.pos.x, z.pos.y, z.pos.z) })),
    claims: claims.map((c, i) => ({ id: i + 1, pos: v3(c.pos.x, c.pos.y, c.pos.z), value: c.value, active: true, timer: 0, dropped: false })),
    carried: new Map(),
    banked: new Map(),
    banking: new Map(),
    nextId: claims.length + 1,
    totalBanked: 0,
  };
}

const dist2 = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** The safe zone a position is inside, or null. */
export function zoneAt(run: RunState, pos: Vec3): ZoneDef | null {
  for (const z of run.zones) if (dist2(z.pos, pos) <= z.radius * z.radius) return z;
  return null;
}

export const inSafeZone = (run: RunState, pos: Vec3): boolean => zoneAt(run, pos) !== null;

/** A death: the carrier's claims fall where the file fell (one claim of the whole value). */
export function dropCarried(run: RunState, playerId: number, pos: Vec3, events: RunEvent[]): number {
  const v = run.carried.get(playerId) ?? 0;
  if (v <= 0) return 0;
  run.carried.set(playerId, 0);
  const id = run.nextId++;
  run.claims.push({ id, pos: v3(pos.x, pos.y, pos.z), value: v, active: true, timer: RUN.dropSeconds, dropped: true });
  events.push({ type: "drop", playerId, claimId: id, value: v, pos: v3(pos.x, pos.y, pos.z) });
  return v;
}

/** One tick: pickups, banking dwell, respawn and expiry timers. */
export function stepRun(run: RunState, carriers: readonly RunCarrier[], events: RunEvent[]): void {
  const dt = SIM_DT;
  // timers
  for (let i = run.claims.length - 1; i >= 0; i--) {
    const c = run.claims[i]!;
    if (c.active && c.dropped) {
      c.timer -= dt;
      if (c.timer <= 0) {
        run.claims.splice(i, 1);
        events.push({ type: "claimReturn", claimId: c.id });
      }
    } else if (!c.active) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.active = true;
        c.timer = 0;
        events.push({ type: "claimReturn", claimId: c.id });
      }
    }
  }
  const r2 = RUN.pickupRadius * RUN.pickupRadius;
  for (const p of carriers) {
    if (!p.alive) {
      run.banking.set(p.id, 0);
      continue;
    }
    // pickups (not inside a safe zone: claims never lie there, but a drop could)
    let carried = run.carried.get(p.id) ?? 0;
    for (const c of run.claims) {
      // a claim is taken whole or not at all: a spawned one keeps its value for its respawn, a drop is gone
      if (!c.active || carried + c.value > RUN.carryCap) continue;
      if (dist2(c.pos, p.pos) > r2) continue;
      carried += c.value;
      if (c.dropped) run.claims.splice(run.claims.indexOf(c), 1);
      else {
        c.active = false;
        c.timer = RUN.respawnSeconds;
      }
      run.carried.set(p.id, carried);
      events.push({ type: "claim", playerId: p.id, claimId: c.id, value: c.value, carried });
      break; // one claim per tick keeps the events readable
    }
    // banking: stand in a safe zone with something to bank
    const zone = zoneAt(run, p.pos);
    if (zone && carried > 0) {
      const t = (run.banking.get(p.id) ?? 0) + dt;
      if (t >= RUN.bankSeconds) {
        run.carried.set(p.id, 0);
        const banked = (run.banked.get(p.id) ?? 0) + carried;
        run.banked.set(p.id, banked);
        run.totalBanked += carried;
        run.banking.set(p.id, 0);
        events.push({ type: "bank", playerId: p.id, value: carried, zone: zone.label, banked });
      } else run.banking.set(p.id, t);
    } else run.banking.set(p.id, 0);
  }
}

/** Respawned claims that the level defines: the same positions every run, so the map can be learned. */
export function runView(run: RunState, playerId: number, pos: Vec3) {
  const zone = zoneAt(run, pos);
  return {
    carried: run.carried.get(playerId) ?? 0,
    banked: run.banked.get(playerId) ?? 0,
    banking: Math.min(1, (run.banking.get(playerId) ?? 0) / RUN.bankSeconds),
    inSafe: !!zone,
    zone: zone?.label ?? null,
    claims: run.claims.filter((c) => c.active).map((c) => ({ id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z, value: c.value, dropped: c.dropped })),
    zones: run.zones.map((z) => ({ label: z.label, x: z.pos.x, z: z.pos.z, radius: z.radius })),
  };
}
export type RunView = ReturnType<typeof runView>;
