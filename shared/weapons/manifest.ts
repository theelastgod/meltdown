/**
 * Weapon and grenade definitions. Server-authoritative; every number here is
 * read by the client for prediction/presentation, by the server for
 * resolution, and by the TTK harness in CI. Stage 6 folds this into the
 * shared stat manifest with the Fairness Lint.
 */
export type WeaponId = "lease_breaker" | "repo_hammer" | "stack_smg" | "longwave" | "phage" | "shock_baton" | "directive" | "clockeater";
/** Weapons 7–8 unlock in the campaign (the arc and a Clockeater gig); a file must own `weapon:<id>` to spawn with one. */
export const CAMPAIGN_WEAPONS: readonly WeaponId[] = ["directive", "clockeater"];
export type WeaponClass = "hitscan" | "pellet" | "charge" | "launcher" | "melee";
export type AltKind = "ads" | "slug" | "brace" | "quickshot" | "sticky" | "lunge";

export interface RangeProfile {
  /** Intended engagement range (m): the TTK harness measures here. */
  ideal: number;
  /** Damage stays full up to this distance. */
  fullTo: number;
  /** Damage reaches minMult at this distance. */
  falloffTo: number;
  minMult: number;
  max: number;
}

export interface RecoilProfile {
  /** Total vertical recoil per shot (rad); 60% goes to the view, 40% to the pattern. */
  vertical: number;
  /** Horizontal magnitude per shot (rad), alternating in the base pattern. */
  horizontal: number;
  /** Deterministic base pattern (unit offsets, repeats). */
  pattern: [number, number][];
  /** Seeded per-magazine jitter amplitude (rad). */
  jitter: number;
  /** View-kick recovery rate (1/s). */
  recover: number;
}

export interface WeaponDef {
  id: WeaponId;
  slot: number;
  name: string;
  cls: WeaponClass;
  rpm: number;
  damage: number;
  headMult: number;
  legMult: number;
  magSize: number;
  reloadTime: number;
  /** Fraction of the reload at which the magazine seats (ammo restored); after this the animation can be cancelled. */
  seatFrac: number;
  pellets: number;
  /** Cone half-angle (rad) for pellets / hip spread. */
  spread: number;
  range: RangeProfile;
  recoil: RecoilProfile;
  tracer: number;
  charge?: { time: number; damage: number; pierce: boolean };
  /** Burst fire (firmware): `count` rounds at `rpm`, then the weapon's own cycle. */
  burst?: { count: number; rpm: number };
  projectile?: { speed: number; gravity: number; fuse: number; radius: number; damage: number; edgeDamage: number; direct: number };
  melee?: { reach: number; arc: number; chainRange: number; chainDamage: number; stun: number };
  alt: {
    kind: AltKind;
    /** Multipliers while active (ads/brace). */
    spreadMult?: number;
    recoilMult?: number;
    moveMult?: number;
    zoom?: number;
    /** Slug / quickshot damage; lunge damage. */
    damage?: number;
    cooldown?: number;
    lungeSpeed?: number;
    lungeTime?: number;
    stickyArm?: number;
    proximity?: number;
  };
  /** The band the harness certifies at range.ideal (body shots, perfect aim). */
  ttkBand: [number, number];
}

export const TTK_BAND: [number, number] = [0.6, 1.0];

const R = (ideal: number, fullTo: number, falloffTo: number, minMult: number, max: number): RangeProfile => ({ ideal, fullTo, falloffTo, minMult, max });

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  lease_breaker: {
    id: "lease_breaker",
    slot: 1,
    name: "LEASE-BREAKER",
    cls: "hitscan",
    rpm: 500,
    damage: 16,
    headMult: 1.5,
    legMult: 0.85,
    magSize: 30,
    reloadTime: 1.9,
    seatFrac: 0.62,
    pellets: 1,
    spread: 0.004,
    range: R(20, 28, 55, 0.7, 120),
    recoil: { vertical: 0.0092, horizontal: 0.003, pattern: [[0, 1], [0.6, 1], [-0.7, 1], [0.9, 0.9], [-1, 0.8], [0.4, 0.7], [-0.5, 0.6], [1, 0.5]], jitter: 0.0012, recover: 11 },
    tracer: 0x35f2ff,
    alt: { kind: "ads", spreadMult: 0.4, recoilMult: 0.75, moveMult: 0.72, zoom: 2 },
    ttkBand: TTK_BAND,
  },
  repo_hammer: {
    id: "repo_hammer",
    slot: 2,
    name: "REPO HAMMER",
    cls: "pellet",
    rpm: 70,
    damage: 10,
    headMult: 1.3,
    legMult: 0.9,
    magSize: 6,
    reloadTime: 2.6,
    seatFrac: 0.7,
    pellets: 8,
    spread: 0.055,
    range: R(7, 9, 18, 0.35, 30),
    recoil: { vertical: 0.05, horizontal: 0.01, pattern: [[0, 1], [0.5, 1], [-0.5, 1]], jitter: 0.004, recover: 7 },
    tracer: 0xffb02e,
    alt: { kind: "slug", damage: 70, spreadMult: 0.15 },
    ttkBand: TTK_BAND,
  },
  stack_smg: {
    id: "stack_smg",
    slot: 3,
    name: "STACK SMG",
    cls: "hitscan",
    rpm: 900,
    damage: 9,
    headMult: 1.4,
    legMult: 0.85,
    magSize: 40,
    reloadTime: 1.7,
    seatFrac: 0.6,
    pellets: 1,
    spread: 0.012,
    range: R(10, 12, 28, 0.55, 60),
    recoil: { vertical: 0.0075, horizontal: 0.0055, pattern: [[0, 1], [1, 1], [1, 0.9], [-1, 1], [-1, 0.8], [0.5, 0.7], [1, 0.6], [-0.8, 0.6], [-1, 0.5], [0.6, 0.5]], jitter: 0.002, recover: 12 },
    tracer: 0xff3ec9,
    alt: { kind: "brace", spreadMult: 0.5, recoilMult: 0.5, moveMult: 0.55 },
    ttkBand: TTK_BAND,
  },
  longwave: {
    id: "longwave",
    slot: 4,
    name: "LONGWAVE RAIL",
    cls: "charge",
    rpm: 40,
    damage: 110,
    headMult: 1.25,
    legMult: 0.9,
    magSize: 5,
    reloadTime: 2.4,
    seatFrac: 0.7,
    pellets: 1,
    spread: 0,
    range: R(40, 200, 200, 1, 260),
    recoil: { vertical: 0.06, horizontal: 0.0, pattern: [[0, 1]], jitter: 0.0, recover: 6 },
    tracer: 0x9fe8ff,
    charge: { time: 0.9, damage: 110, pierce: true },
    alt: { kind: "quickshot", damage: 45, cooldown: 0.45 },
    ttkBand: TTK_BAND,
  },
  phage: {
    id: "phage",
    slot: 5,
    name: "PHAGE LAUNCHER",
    cls: "launcher",
    rpm: 90,
    damage: 60,
    headMult: 1,
    legMult: 1,
    magSize: 4,
    reloadTime: 2.8,
    seatFrac: 0.7,
    pellets: 1,
    spread: 0,
    range: R(10, 60, 60, 1, 80),
    recoil: { vertical: 0.03, horizontal: 0.0, pattern: [[0, 1]], jitter: 0.0, recover: 8 },
    tracer: 0x8f4dff,
    projectile: { speed: 40, gravity: 12, fuse: 2.5, radius: 3.5, damage: 60, edgeDamage: 18, direct: 60 },
    alt: { kind: "sticky", stickyArm: 0.5, proximity: 2.2, damage: 70 },
    ttkBand: TTK_BAND,
  },
  shock_baton: {
    id: "shock_baton",
    slot: 6,
    name: "SHOCK BATON",
    cls: "melee",
    rpm: 130,
    damage: 36,
    headMult: 1,
    legMult: 1,
    magSize: 0,
    reloadTime: 0,
    seatFrac: 1,
    pellets: 1,
    spread: 0,
    range: R(1.5, 1.6, 1.6, 1, 1.6),
    recoil: { vertical: 0.0, horizontal: 0.0, pattern: [[0, 0]], jitter: 0.0, recover: 10 },
    tracer: 0x35f2ff,
    melee: { reach: 1.6, arc: 0.6, chainRange: 2.5, chainDamage: 15, stun: 0.5 },
    alt: { kind: "lunge", damage: 60, cooldown: 4, lungeSpeed: 20, lungeTime: 0.2 },
    ttkBand: TTK_BAND,
  },
  // ---- campaign unlocks: weapon 7 from THE LEAK, weapon 8 from the Clockeaters' depot heist ----
  directive: {
    id: "directive",
    slot: 7,
    name: "THE DIRECTIVE",
    cls: "hitscan",
    rpm: 150,
    damage: 34,
    headMult: 2.0,
    legMult: 0.85,
    magSize: 12,
    reloadTime: 2.2,
    seatFrac: 0.65,
    pellets: 1,
    spread: 0.0012,
    range: R(35, 45, 75, 0.75, 140),
    recoil: { vertical: 0.028, horizontal: 0.006, pattern: [[0, 1], [0.3, 1], [-0.3, 1]], jitter: 0.001, recover: 7 },
    tracer: 0xffd166,
    alt: { kind: "ads", spreadMult: 0.25, recoilMult: 0.7, moveMult: 0.6, zoom: 3 },
    ttkBand: TTK_BAND,
  },
  clockeater: {
    id: "clockeater",
    slot: 8,
    name: "CLOCKEATER",
    cls: "hitscan",
    rpm: 240,
    damage: 13,
    headMult: 1.5,
    legMult: 0.85,
    magSize: 18,
    reloadTime: 1.6,
    seatFrac: 0.6,
    pellets: 1,
    spread: 0.006,
    range: R(14, 20, 40, 0.6, 90),
    recoil: { vertical: 0.012, horizontal: 0.005, pattern: [[0, 1], [0.5, 1], [-0.6, 1], [0.8, 0.8]], jitter: 0.0015, recover: 10 },
    tracer: 0xff3ec9,
    burst: { count: 3, rpm: 1200 },
    alt: { kind: "ads", spreadMult: 0.5, recoilMult: 0.8, moveMult: 0.8, zoom: 1.5 },
    ttkBand: TTK_BAND,
  },
};

export const WEAPON_LIST: WeaponDef[] = Object.values(WEAPONS).sort((a, b) => a.slot - b.slot);
export const weaponBySlot = (slot: number): WeaponDef | undefined => WEAPON_LIST[slot - 1];

export type GrenadeId = "frag" | "smoke" | "emp";
export interface GrenadeDef {
  id: GrenadeId;
  name: string;
  count: number;
  fuse: number;
  throwSpeed: number;
  gravity: number;
  bounce: number;
  radius: number;
  damage: number;
  edgeDamage: number;
  /** Cloud lifetime (smoke) or effect duration (EMP). */
  duration: number;
  color: number;
}
export const GRENADES: Record<GrenadeId, GrenadeDef> = {
  frag: { id: "frag", name: "FRAG", count: 2, fuse: 1.8, throwSpeed: 17, gravity: 20, bounce: 0.35, radius: 4.5, damage: 100, edgeDamage: 15, duration: 0, color: 0xffb02e },
  smoke: { id: "smoke", name: "SMOKE", count: 1, fuse: 1.2, throwSpeed: 15, gravity: 20, bounce: 0.2, radius: 4, damage: 0, edgeDamage: 0, duration: 8, color: 0x9fb3c8 },
  emp: { id: "emp", name: "EMP", count: 1, fuse: 1.5, throwSpeed: 17, gravity: 20, bounce: 0.35, radius: 5, damage: 0, edgeDamage: 0, duration: 3, color: 0x35f2ff },
};
export const GRENADE_LIST: GrenadeDef[] = [GRENADES.frag, GRENADES.smoke, GRENADES.emp];
export const GRENADE_COOLDOWN = 0.8;

/** Damage multiplier by distance for a range profile. */
export function falloff(r: RangeProfile, d: number): number {
  if (d <= r.fullTo) return 1;
  if (d >= r.max) return 0;
  if (d >= r.falloffTo) return r.minMult;
  return 1 + ((r.minMult - 1) * (d - r.fullTo)) / (r.falloffTo - r.fullTo);
}

/** Deterministic per-magazine jitter in [-1, 1] from a server-issued seed and shot index. */
export function magJitter(seed: number, shot: number, axis: number): number {
  let h = (seed ^ Math.imul(shot + 1, 0x9e3779b1) ^ Math.imul(axis + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Split of recoil between view kick and pattern climb. */
export const RECOIL_VIEW_SHARE = 0.6;
export const RECOIL_PATTERN_SHARE = 0.4;
