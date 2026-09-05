/**
 * Firmwares: two sidegrade fire-pattern variants per weapon, unlocked at
 * mastery rank 20 and 28. A firmware patches the weapon definition; the TTK
 * harness certifies every one inside the band, and the Fairness Lint duels
 * each against the baseline weapon.
 */
import { WEAPONS, type WeaponDef, type WeaponId } from "../weapons/manifest";

export interface FirmwareDef {
  id: string;
  weapon: WeaponId;
  rank: 20 | 28;
  name: string;
  line: string;
  patch: (d: WeaponDef) => WeaponDef;
}

const scale = (r: WeaponDef["recoil"], k: number): WeaponDef["recoil"] => ({ ...r, vertical: r.vertical * k, horizontal: r.horizontal * k });

export const FIRMWARES: FirmwareDef[] = [
  { id: "lease_breaker:three_count", weapon: "lease_breaker", rank: 20, name: "THREE-COUNT", line: "three-round bursts at 900 rpm, +15% damage, a third of a second between bursts, wide from the hip", patch: (d) => ({ ...d, burst: { count: 3, rpm: 900 }, rpm: 180, damage: Math.round(d.damage * 1.15), spread: d.spread * 1.4, recoil: scale(d.recoil, 0.85) }) },
  { id: "lease_breaker:long_lease", weapon: "lease_breaker", rank: 28, name: "LONG LEASE", line: "slower, heavier rounds: −18% rate, +18% damage, −25% spread", patch: (d) => ({ ...d, rpm: Math.round(d.rpm * 0.82), damage: Math.round(d.damage * 1.18), spread: d.spread * 0.75, recoil: scale(d.recoil, 1.15) }) },
  { id: "repo_hammer:double_barrel", weapon: "repo_hammer", rank: 20, name: "DOUBLE BARREL", line: "two shells per trigger 0.7 s apart, then a long reset; −8% pellet damage", patch: (d) => ({ ...d, burst: { count: 2, rpm: 85 }, rpm: 35, damage: Math.round(d.damage * 0.92), magSize: Math.max(2, d.magSize - 2) }) },
  { id: "repo_hammer:slam_fire", weapon: "repo_hammer", rank: 28, name: "SLAM FIRE", line: "+20% rate, −15% pellet damage, a little wider", patch: (d) => ({ ...d, rpm: Math.round(d.rpm * 1.2), damage: Math.round(d.damage * 0.85), spread: d.spread * 1.08 }) },
  { id: "stack_smg:dump_stage", weapon: "stack_smg", rank: 20, name: "DUMP STAGE", line: "+18% rate, −15% magazine, −10% damage, +30% recoil", patch: (d) => ({ ...d, rpm: Math.round(d.rpm * 1.18), magSize: Math.round(d.magSize * 0.85), recoil: scale(d.recoil, 1.3), damage: Math.round(d.damage * 0.9) }) },
  { id: "stack_smg:measured", weapon: "stack_smg", rank: 28, name: "MEASURED", line: "−22% rate, +26% damage, −30% spread", patch: (d) => ({ ...d, rpm: Math.round(d.rpm * 0.78), damage: Math.round(d.damage * 1.26), spread: d.spread * 0.7 }) },
  { id: "longwave:capacitor", weapon: "longwave", rank: 20, name: "CAPACITOR", line: "−15% charge time, −7% damage (two shots past 25 m)", patch: (d) => ({ ...d, charge: { ...d.charge!, time: d.charge!.time * 0.85, damage: Math.round(d.charge!.damage * 0.93) } }) },
  { id: "longwave:overcharge", weapon: "longwave", rank: 28, name: "OVERCHARGE", line: "+8% charge time, +8% damage, pierces cover", patch: (d) => ({ ...d, charge: { ...d.charge!, time: d.charge!.time * 1.08, damage: Math.round(d.charge!.damage * 1.08), pierce: true } }) },
  { id: "phage:cluster", weapon: "phage", rank: 20, name: "CLUSTER", line: "+25% burst radius, −15% damage", patch: (d) => ({ ...d, projectile: { ...d.projectile!, radius: d.projectile!.radius * 1.25, damage: Math.round(d.projectile!.damage * 0.85), edgeDamage: Math.round(d.projectile!.edgeDamage * 0.85) } }) },
  { id: "phage:long_fuse", weapon: "phage", rank: 28, name: "LONG FUSE", line: "faster, flatter rounds, +8% damage, longer fuse", patch: (d) => ({ ...d, projectile: { ...d.projectile!, speed: d.projectile!.speed * 1.2, gravity: d.projectile!.gravity * 0.8, fuse: d.projectile!.fuse * 1.3, damage: Math.round(d.projectile!.damage * 1.08) } }) },
  { id: "shock_baton:arc_relay", weapon: "shock_baton", rank: 20, name: "ARC RELAY", line: "chain reaches 50% further, −5% damage", patch: (d) => ({ ...d, damage: Math.round(d.damage * 0.95), melee: { ...d.melee!, chainRange: d.melee!.chainRange * 1.5 } }) },
  { id: "shock_baton:heavy_haft", weapon: "shock_baton", rank: 28, name: "HEAVY HAFT", line: "+25% damage, −7% swing rate, stuns longer", patch: (d) => ({ ...d, damage: Math.round(d.damage * 1.25), rpm: Math.round(d.rpm * 0.93), melee: { ...d.melee!, stun: d.melee!.stun * 1.3 } }) },
];

export const firmwareById = (id: string): FirmwareDef | undefined => FIRMWARES.find((f) => f.id === id);
export const firmwaresFor = (weapon: WeaponId): FirmwareDef[] => FIRMWARES.filter((f) => f.weapon === weapon);

/** The weapon definition with a firmware applied (or the stock definition). */
export function weaponWithFirmware(weapon: WeaponId, firmwareId: string | null | undefined): WeaponDef {
  const base = WEAPONS[weapon];
  if (!firmwareId) return base;
  const fw = firmwareById(firmwareId);
  return fw && fw.weapon === weapon ? fw.patch(base) : base;
}
