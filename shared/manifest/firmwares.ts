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
  { id: "lease_breaker:three_count", weapon: "lease_breaker", rank: 20, name: "THREE-COUNT", line: "THREE-ROUND BURSTS AT 900 RPM, +12.5% DAMAGE, A THIRD OF A SECOND BETWEEN BURSTS, WIDE FROM THE HIP", patch: (d) => ({ ...d, burst: { count: 3, rpm: 900 }, rpm: 180, damage: Math.round(d.damage * 1.15), spread: d.spread * 1.4, recoil: scale(d.recoil, 0.85) }) },
  { id: "lease_breaker:long_lease", weapon: "lease_breaker", rank: 28, name: "LONG LEASE", line: "SLOWER, HEAVIER ROUNDS: −18% RATE, +19% DAMAGE, −25% SPREAD", patch: (d) => ({ ...d, rpm: Math.round(d.rpm * 0.82), damage: Math.round(d.damage * 1.18), spread: d.spread * 0.75, recoil: scale(d.recoil, 1.15) }) },
  { id: "repo_hammer:double_barrel", weapon: "repo_hammer", rank: 20, name: "DOUBLE BARREL", line: "TWO SHELLS PER TRIGGER 0.7 S APART, THEN A LONG RESET; −10% PELLET DAMAGE, MAGAZINE 4", patch: (d) => ({ ...d, burst: { count: 2, rpm: 85 }, rpm: 35, damage: Math.round(d.damage * 0.92), magSize: Math.max(2, d.magSize - 2) }) },
  { id: "repo_hammer:slam_fire", weapon: "repo_hammer", rank: 28, name: "SLAM FIRE", line: "+20% RATE, −10% PELLET DAMAGE, A LITTLE WIDER", patch: (d) => ({ ...d, rpm: Math.round(d.rpm * 1.2), damage: Math.round(d.damage * 0.85), spread: d.spread * 1.08 }) },
  { id: "stack_smg:dump_stage", weapon: "stack_smg", rank: 20, name: "DUMP STAGE", line: "+18% RATE, −15% MAGAZINE, −11% DAMAGE, +30% RECOIL", patch: (d) => ({ ...d, rpm: Math.round(d.rpm * 1.18), magSize: Math.round(d.magSize * 0.85), recoil: scale(d.recoil, 1.3), damage: Math.round(d.damage * 0.9) }) },
  { id: "stack_smg:measured", weapon: "stack_smg", rank: 28, name: "MEASURED", line: "−22% RATE, +22% DAMAGE, −30% SPREAD", patch: (d) => ({ ...d, rpm: Math.round(d.rpm * 0.78), damage: Math.round(d.damage * 1.26), spread: d.spread * 0.7 }) },
  { id: "longwave:capacitor", weapon: "longwave", rank: 20, name: "CAPACITOR", line: "−15% CHARGE TIME, −7% DAMAGE", patch: (d) => ({ ...d, charge: { ...d.charge!, time: d.charge!.time * 0.85, damage: Math.round(d.charge!.damage * 0.93) } }) },
  { id: "longwave:overcharge", weapon: "longwave", rank: 28, name: "OVERCHARGE", line: "+8% CHARGE TIME, +8% DAMAGE", patch: (d) => ({ ...d, charge: { ...d.charge!, time: d.charge!.time * 1.08, damage: Math.round(d.charge!.damage * 1.08) } }) },
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
