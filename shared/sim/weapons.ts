/**
 * Weapon state machine shared by client prediction and server. Pure and
 * deterministic: recoil and spread come from a server-issued magazine seed,
 * so the server reproduces every shot direction exactly.
 */
import { SIM_DT } from "./constants";
import { Btn, has, slotOf, type InputFrame } from "./input";
import {
  GRENADE_COOLDOWN,
  GRENADE_LIST,
  RECOIL_PATTERN_SHARE,
  RECOIL_VIEW_SHARE,
  WEAPONS,
  magJitter,
  weaponBySlot,
  type GrenadeId,
  type RangeProfile,
  type WeaponDef,
  type WeaponId,
} from "../weapons/manifest";

export interface WeaponState {
  slot: number;
  /** ammo by slot (index 1..6) */
  ammo: number[];
  reloadTimer: number;
  reloadTotal: number;
  reloadSeated: boolean;
  fireCooldown: number;
  charge: number;
  charging: boolean;
  shotIndex: number;
  magSeed: number;
  magCount: number;
  altActive: boolean;
  altCooldown: number;
  lungeT: number;
  lungeHit: boolean;
  grenades: number[];
  grenadeSel: number;
  grenadeCooldown: number;
  swapTimer: number;
  kickPitch: number;
  kickYaw: number;
  patX: number;
  patY: number;
  stunTimer: number;
  empTimer: number;
  /** seconds since the last shot (pattern resets after a pause) */
  sinceShot: number;
}

export function createWeaponState(): WeaponState {
  return {
    slot: 1,
    ammo: [0, WEAPONS.lease_breaker.magSize, WEAPONS.repo_hammer.magSize, WEAPONS.stack_smg.magSize, WEAPONS.longwave.magSize, WEAPONS.phage.magSize, 0],
    reloadTimer: 0,
    reloadTotal: 0,
    reloadSeated: false,
    fireCooldown: 0,
    charge: 0,
    charging: false,
    shotIndex: 0,
    magSeed: 0,
    magCount: 0,
    altActive: false,
    altCooldown: 0,
    lungeT: 0,
    lungeHit: false,
    grenades: GRENADE_LIST.map((g) => g.count),
    grenadeSel: 0,
    grenadeCooldown: 0,
    swapTimer: 0,
    kickPitch: 0,
    kickYaw: 0,
    patX: 0,
    patY: 0,
    stunTimer: 0,
    empTimer: 0,
    sinceShot: 9,
  };
}

export function resetWeaponState(w: WeaponState): void {
  const fresh = createWeaponState();
  Object.assign(w, fresh, { ammo: fresh.ammo.slice(), grenades: fresh.grenades.slice() });
}

export const currentWeapon = (w: WeaponState): WeaponDef => weaponBySlot(w.slot) ?? WEAPONS.lease_breaker;

/** Movement multiplier from weapon state (ADS, brace, stun). */
export function weaponMoveMult(w: WeaponState): number {
  const def = currentWeapon(w);
  let m = 1;
  if (w.stunTimer > 0) m *= 0.4;
  if (w.altActive && (def.alt.kind === "ads" || def.alt.kind === "brace")) m *= def.alt.moveMult ?? 1;
  return m;
}

export type FireRequest =
  | { kind: "ray"; weapon: WeaponId; dirs: { yaw: number; pitch: number }[]; damage: number; headMult: number; legMult: number; range: RangeProfile; pierce: boolean; slug: boolean }
  | { kind: "melee"; weapon: WeaponId; reach: number; arc: number; damage: number; chainRange: number; chainDamage: number; stun: number; lunge: boolean }
  | { kind: "projectile"; weapon: WeaponId | "grenade"; projKind: "phage" | "sticky" | GrenadeId; speed: number };

export type WeaponEvent =
  | { type: "swap"; slot: number }
  | { type: "reloadStart"; slot: number }
  | { type: "reloadSeat"; slot: number }
  | { type: "reloadCancel"; slot: number }
  | { type: "reloadEnd"; slot: number }
  | { type: "dryFire" }
  | { type: "chargeStart" }
  | { type: "chargeFull" }
  | { type: "chargeCancel" }
  | { type: "lunge" }
  | { type: "throw"; grenade: GrenadeId }
  | { type: "altToggle"; on: boolean }
  | { type: "fire"; weapon: WeaponId; alt: boolean };

/** Deterministic magazine seed for a player's nth magazine in a room. */
export function magSeedFor(roomSeed: number, playerId: number, magCount: number): number {
  let h = (roomSeed ^ Math.imul(playerId + 1, 0x9e3779b1) ^ Math.imul(magCount + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function seatMagazine(w: WeaponState, def: WeaponDef, roomSeed: number, playerId: number): void {
  w.ammo[w.slot] = def.magSize;
  w.shotIndex = 0;
  w.magCount++;
  w.magSeed = magSeedFor(roomSeed, playerId, w.magCount);
  w.reloadSeated = true;
  w.patX = 0;
  w.patY = 0;
}

/** Apply recoil for one shot and return the pattern offset the shot uses. */
function applyRecoil(w: WeaponState, def: WeaponDef, mult: number): void {
  const pat = def.recoil.pattern[w.shotIndex % def.recoil.pattern.length]!;
  const jx = magJitter(w.magSeed, w.shotIndex, 0) * def.recoil.jitter;
  const jy = magJitter(w.magSeed, w.shotIndex, 1) * def.recoil.jitter;
  const dPitch = (pat[1] * def.recoil.vertical + jy) * mult;
  const dYaw = (pat[0] * def.recoil.horizontal + jx) * mult;
  w.kickPitch += dPitch * RECOIL_VIEW_SHARE;
  w.kickYaw += dYaw * RECOIL_VIEW_SHARE;
  w.patY += dPitch * RECOIL_PATTERN_SHARE;
  w.patX += dYaw * RECOIL_PATTERN_SHARE;
}

/** Shot directions for a hitscan/pellet weapon, deterministic from the magazine seed. */
function shotDirs(w: WeaponState, def: WeaponDef, yaw: number, pitch: number, spread: number, pellets: number): { yaw: number; pitch: number }[] {
  const baseYaw = yaw + w.kickYaw + w.patX;
  const basePitch = pitch + w.kickPitch + w.patY;
  const out: { yaw: number; pitch: number }[] = [];
  if (pellets <= 1) {
    const sx = magJitter(w.magSeed, w.shotIndex, 2) * spread;
    const sy = magJitter(w.magSeed, w.shotIndex, 3) * spread;
    out.push({ yaw: baseYaw + sx, pitch: basePitch + sy });
    return out;
  }
  // ring pattern rotated by a seeded angle: readable, learnable, exactly reproducible
  const rot = magJitter(w.magSeed, w.shotIndex, 4) * Math.PI;
  for (let k = 0; k < pellets; k++) {
    const a = rot + (Math.PI * 2 * k) / pellets;
    const r = spread * (k % 2 === 0 ? 1 : 0.55);
    out.push({ yaw: baseYaw + Math.cos(a) * r, pitch: basePitch + Math.sin(a) * r });
  }
  return out;
}

/**
 * Advance the weapon one tick with this input. Returns fire requests for the
 * world to resolve. `roomSeed`/`playerId` derive magazine seeds.
 */
export function stepWeapon(w: WeaponState, input: InputFrame, prevButtons: number, yaw: number, pitch: number, alive: boolean, roomSeed: number, playerId: number, events: WeaponEvent[]): FireRequest[] {
  const dt = SIM_DT;
  const reqs: FireRequest[] = [];
  // timers
  w.fireCooldown = Math.max(0, w.fireCooldown - dt);
  w.altCooldown = Math.max(0, w.altCooldown - dt);
  w.grenadeCooldown = Math.max(0, w.grenadeCooldown - dt);
  w.swapTimer = Math.max(0, w.swapTimer - dt);
  w.stunTimer = Math.max(0, w.stunTimer - dt);
  w.empTimer = Math.max(0, w.empTimer - dt);
  w.sinceShot += dt;
  if (w.magCount === 0) {
    // the first magazine's seed is derived like every later one
    w.magCount = 1;
    w.magSeed = magSeedFor(roomSeed, playerId, 1);
  }
  const def = currentWeapon(w);
  const rec = Math.max(0, 1 - def.recoil.recover * dt);
  w.kickPitch *= rec;
  w.kickYaw *= rec;
  if (w.sinceShot > 0.45) {
    w.patX *= rec;
    w.patY *= rec;
  }
  if (!alive) {
    w.charging = false;
    w.charge = 0;
    return reqs;
  }
  const pressed = input.buttons & ~prevButtons;
  const fireHeld = has(input.buttons, Btn.Fire);
  const firePressed = has(pressed, Btn.Fire);
  const altHeld = has(input.buttons, Btn.Alt);
  const altPressed = has(pressed, Btn.Alt);

  // weapon swap
  const sel = slotOf(input.buttons);
  if (sel >= 1 && sel <= 6 && sel !== w.slot) {
    w.slot = sel;
    w.swapTimer = 0.35; // the swap delay is the cost; the previous weapon's cycle does not carry over
    w.fireCooldown = 0;
    w.reloadTimer = 0;
    w.reloadSeated = false;
    w.charging = false;
    w.charge = 0;
    w.altActive = false;
    w.patX = 0;
    w.patY = 0;
    events.push({ type: "swap", slot: sel });
    return reqs;
  }
  const d = currentWeapon(w);

  // grenades
  if (has(pressed, Btn.GrenadeNext)) w.grenadeSel = (w.grenadeSel + 1) % GRENADE_LIST.length;
  if (has(pressed, Btn.Grenade) && w.grenadeCooldown <= 0 && w.stunTimer <= 0 && (w.grenades[w.grenadeSel] ?? 0) > 0) {
    w.grenades[w.grenadeSel]!--;
    w.grenadeCooldown = GRENADE_COOLDOWN;
    const g = GRENADE_LIST[w.grenadeSel]!;
    reqs.push({ kind: "projectile", weapon: "grenade", projKind: g.id, speed: g.throwSpeed });
    events.push({ type: "throw", grenade: g.id });
  }

  // reload
  if (w.reloadTimer > 0) {
    w.reloadTimer -= dt;
    const seatAt = w.reloadTotal * (1 - d.seatFrac);
    if (!w.reloadSeated && w.reloadTimer <= seatAt) {
      seatMagazine(w, d, roomSeed, playerId);
      events.push({ type: "reloadSeat", slot: w.slot });
    }
    if (w.reloadTimer <= 0) {
      w.reloadTimer = 0;
      events.push({ type: "reloadEnd", slot: w.slot });
    } else if (w.reloadSeated && (firePressed || altPressed || has(pressed, Btn.Sprint))) {
      // cancel window: the magazine is in; skip the rest of the animation
      w.reloadTimer = 0;
      events.push({ type: "reloadCancel", slot: w.slot });
    } else if (!w.reloadSeated && firePressed && (w.ammo[w.slot] ?? 0) > 0) {
      // aborted before the seat: no ammo gained
      w.reloadTimer = 0;
      events.push({ type: "reloadCancel", slot: w.slot });
    } else {
      return reqs; // reloading blocks firing
    }
  }
  const wantReload = d.magSize > 0 && (w.ammo[w.slot] ?? 0) < d.magSize && (has(pressed, Btn.Reload) || (fireHeld && (w.ammo[w.slot] ?? 0) === 0));
  if (wantReload && w.reloadTimer <= 0) {
    w.reloadTimer = d.reloadTime;
    w.reloadTotal = d.reloadTime;
    w.reloadSeated = false;
    w.charging = false;
    w.charge = 0;
    events.push({ type: "reloadStart", slot: w.slot });
    return reqs;
  }
  if (w.swapTimer > 0 || w.stunTimer > 0) return reqs;

  // alt modes
  switch (d.alt.kind) {
    case "ads":
    case "brace":
      w.altActive = altHeld;
      break;
    case "slug":
      if (altPressed) {
        w.altActive = !w.altActive;
        events.push({ type: "altToggle", on: w.altActive });
      }
      break;
    default:
      break;
  }
  const altMult = w.altActive && (d.alt.kind === "ads" || d.alt.kind === "brace") ? { spread: d.alt.spreadMult ?? 1, recoil: d.alt.recoilMult ?? 1 } : { spread: 1, recoil: 1 };
  const ammo = w.ammo[w.slot] ?? 0;

  switch (d.cls) {
    case "hitscan":
    case "pellet": {
      if (fireHeld && w.fireCooldown <= 0) {
        if (ammo > 0) {
          w.ammo[w.slot] = ammo - 1;
          w.fireCooldown = 60 / d.rpm;
          const slug = d.alt.kind === "slug" && w.altActive;
          const spread = d.spread * altMult.spread * (slug ? d.alt.spreadMult ?? 1 : 1);
          const dirs = shotDirs(w, d, yaw, pitch, spread, slug ? 1 : d.pellets);
          applyRecoil(w, d, altMult.recoil);
          w.shotIndex++;
          w.sinceShot = 0;
          reqs.push({ kind: "ray", weapon: d.id, dirs, damage: slug ? d.alt.damage ?? d.damage : d.damage, headMult: d.headMult, legMult: d.legMult, range: d.range, pierce: false, slug });
          events.push({ type: "fire", weapon: d.id, alt: slug });
        } else if (firePressed) events.push({ type: "dryFire" });
      }
      break;
    }
    case "charge": {
      const c = d.charge!;
      if (altPressed && w.altCooldown <= 0 && ammo > 0 && !w.charging) {
        // quickshot: uncharged, half damage, instant
        w.ammo[w.slot] = ammo - 1;
        w.altCooldown = d.alt.cooldown ?? 0.5;
        w.fireCooldown = Math.max(w.fireCooldown, 0.1);
        const dirs = shotDirs(w, d, yaw, pitch, 0, 1);
        applyRecoil(w, d, 0.5);
        w.shotIndex++;
        w.sinceShot = 0;
        reqs.push({ kind: "ray", weapon: d.id, dirs, damage: d.alt.damage ?? 45, headMult: d.headMult, legMult: d.legMult, range: d.range, pierce: false, slug: false });
        events.push({ type: "fire", weapon: d.id, alt: true });
        break;
      }
      if (fireHeld && ammo > 0 && w.fireCooldown <= 0) {
        if (!w.charging) {
          w.charging = true;
          w.charge = 0;
          events.push({ type: "chargeStart" });
        }
        const before = w.charge;
        w.charge = Math.min(1, w.charge + dt / c.time);
        if (before < 1 && w.charge >= 1) events.push({ type: "chargeFull" });
      } else if (w.charging) {
        if (w.charge >= 1 && ammo > 0) {
          w.ammo[w.slot] = ammo - 1;
          w.fireCooldown = 60 / d.rpm;
          const dirs = shotDirs(w, d, yaw, pitch, 0, 1);
          applyRecoil(w, d, 1);
          w.shotIndex++;
          w.sinceShot = 0;
          reqs.push({ kind: "ray", weapon: d.id, dirs, damage: c.damage, headMult: d.headMult, legMult: d.legMult, range: d.range, pierce: c.pierce, slug: false });
          events.push({ type: "fire", weapon: d.id, alt: false });
        } else events.push({ type: "chargeCancel" });
        w.charging = false;
        w.charge = 0;
      } else if (firePressed && ammo === 0) events.push({ type: "dryFire" });
      break;
    }
    case "launcher": {
      const p = d.projectile!;
      if ((fireHeld || altPressed) && w.fireCooldown <= 0) {
        if (ammo > 0) {
          const sticky = altPressed && !fireHeld;
          w.ammo[w.slot] = ammo - 1;
          w.fireCooldown = 60 / d.rpm;
          applyRecoil(w, d, 1);
          w.shotIndex++;
          w.sinceShot = 0;
          reqs.push({ kind: "projectile", weapon: d.id, projKind: sticky ? "sticky" : "phage", speed: p.speed });
          events.push({ type: "fire", weapon: d.id, alt: sticky });
        } else if (firePressed || altPressed) events.push({ type: "dryFire" });
      }
      break;
    }
    case "melee": {
      const m = d.melee!;
      if (w.lungeT > 0) {
        w.lungeT = w.lungeHit ? 0 : Math.max(0, w.lungeT - dt);
        if (!w.lungeHit) reqs.push({ kind: "melee", weapon: d.id, reach: 1.3, arc: 1.0, damage: d.alt.damage ?? 60, chainRange: 0, chainDamage: 0, stun: m.stun, lunge: true });
      } else if (altPressed && w.altCooldown <= 0) {
        w.lungeT = d.alt.lungeTime ?? 0.2;
        w.lungeHit = false;
        w.altCooldown = d.alt.cooldown ?? 4;
        w.fireCooldown = 0.3;
        events.push({ type: "lunge" });
      } else if (fireHeld && w.fireCooldown <= 0) {
        w.fireCooldown = 60 / d.rpm;
        w.sinceShot = 0;
        reqs.push({ kind: "melee", weapon: d.id, reach: m.reach, arc: m.arc, damage: d.damage, chainRange: m.chainRange, chainDamage: m.chainDamage, stun: m.stun, lunge: false });
        events.push({ type: "fire", weapon: d.id, alt: false });
      }
      break;
    }
  }
  return reqs;
}
