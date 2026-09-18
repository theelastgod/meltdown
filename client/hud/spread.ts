/**
 * The reticle did not know the cone (Stage 108).
 *
 * The REPO HAMMER throws eight pellets in a cone 0.055 rad wide; choked, one slug in 0.008. The
 * STACK SMG's cone halves when braced. The reticle drew the same four-armed cross for all of it —
 * a point, for a gun that fires an area — so the one thing a shotgun player needs to see, how much
 * of the file in front of them the cone covers, was nowhere on the screen, and racking the choke
 * changed a word in the corner (Stage 94 gave it a sound) and nothing at the reticle.
 *
 * Pure so the rule is unit-tested: the cone the sim will actually use for the next round, read
 * from the same definition and the same alt rule `weapons.ts` fires from, and the pixels that cone
 * covers at the screen's centre for this camera. A cone too small to draw is not drawn: a ring a
 * pixel wide would claim a precision the eye cannot use.
 */
import type { WeaponDef } from "../../shared/weapons/manifest";

/** a cone narrower than this at the reticle is not drawn (px, radius) */
export const CONE_MIN_PX = 3;

/**
 * The cone half-angle (rad) the next round leaves in. The sim's own rule: the weapon's spread,
 * times the alt's multiplier when the alt is an optic or a brace and is on, or when it is a choke
 * and is on; times the firmware's spread stat.
 */
export function coneNow(def: WeaponDef, altActive: boolean, modSpread = 1): number {
  const alt = def.alt;
  const altMult = altActive && (alt.kind === "ads" || alt.kind === "brace" || alt.kind === "slug") ? (alt.spreadMult ?? 1) : 1;
  return def.spread * altMult * modSpread;
}

/**
 * The radius on screen (px) of a cone this wide, for a camera with this vertical field of view
 * (degrees) drawing into a view this tall (px). The half-height of the screen is the tangent of
 * half the field; the cone's edge is the tangent of its half-angle on the same scale.
 */
export function coneRadiusPx(halfAngle: number, fovDeg: number, viewHeight: number): number {
  if (!(halfAngle > 0) || !(fovDeg > 0) || !(viewHeight > 0)) return 0;
  const pxPerUnit = viewHeight / 2 / Math.tan((fovDeg * Math.PI) / 360);
  return Math.tan(halfAngle) * pxPerUnit;
}
