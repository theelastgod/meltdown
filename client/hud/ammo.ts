/**
 * The magazine that ran out without a word (Stage 100).
 *
 * The ammo count is a number in the bottom-right corner, and in a fight nobody is looking there;
 * the first anyone knew of an empty magazine was the dry click, and the reload after it showed
 * `--` for a second and a half with nothing to say how long was left. Three tells, all read from
 * the weapon state the sim already keeps: the counter turns amber on the last quarter of the
 * magazine and magenta when it is empty, the reticle carries the reload as a ring filling up, and
 * the last quarter is heard once, on the round that crosses into it.
 *
 * Pure so the rule is unit-tested; the HUD and the game read it, neither decides it.
 */

/** the last quarter of a magazine is "low" */
export const LOW_FRAC = 0.25;

export type AmmoState = "ok" | "low" | "empty" | "reloading";

export interface AmmoRead {
  state: AmmoState;
  /** 0 at the start of a reload, 1 as it ends; 0 when no reload is running */
  reloadFrac: number;
  /** the magazine is in: the rest of the reload can be cancelled */
  seated: boolean;
}

/**
 * The round count at or under which a magazine is low. A magazine of one has no last quarter to
 * warn about — its one round is the whole thing — so it is never low, only full or empty.
 */
export function lowLine(magSize: number): number {
  if (magSize <= 1) return 0;
  return Math.max(1, Math.ceil(magSize * LOW_FRAC));
}

/**
 * The reload pad (Stage 885). An empty magazine turns the corner magenta and points at that pad.
 * The pad stayed the same cyan as a full gun. Low and a reload in progress are not that empty.
 */
export function reloadPadHot(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The reload pad on the last quarter (Stage 892). The fire pad turns amber. The pad the corner
 * points at stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function reloadPadLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The fire pad (Stage 886). An empty magazine marks the reload pad. The trigger you are
 * holding stayed the same cyan as a full gun. The last quarter is not this: that one is amber.
 */
export function firePadHot(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The fire pad on the last quarter (Stage 887). The corner and the magazine bar turn amber.
 * The trigger you are holding stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function firePadLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The weapon pad (Stage 911). An empty magazine turns the frame around the slot
 * number magenta. The pad that cycles the gun stayed the same cyan as a full
 * magazine. The last quarter is not this.
 */
export function weaponPadHot(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The weapon pad on the last quarter (Stage 912). The frame around the slot
 * number turns amber. The pad that cycles the gun stayed the same cyan as a
 * full magazine. Empty stays magenta.
 */
export function weaponPadLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The alt pad (Stage 913). An empty magazine turns the weapon pad magenta.
 * The other trigger stayed the same cyan as a full magazine. The last quarter
 * is not this.
 */
export function altPadHot(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The alt pad on the last quarter (Stage 914). The weapon pad turns amber.
 * The other trigger stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function altPadLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The jump pad (Stage 915). An empty magazine turns the alt pad magenta.
 * The jump stayed the same cyan as a full magazine. The last quarter is not this.
 */
export function jumpPadHot(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The jump pad on the last quarter (Stage 916). The alt pad turns amber.
 * The jump stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function jumpPadLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The slide pad (Stage 917). An empty magazine turns the jump pad magenta.
 * The slide stayed the same cyan as a full magazine. The last quarter is not this.
 */
export function slidePadHot(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The slide pad on the last quarter (Stage 918). The jump pad turns amber.
 * The slide stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function slidePadLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The grenade pad (Stage 919). An empty magazine turns the slide pad magenta.
 * The grenade stayed the same cyan as a full magazine. The last quarter is not this.
 */
export function grenadePadHot(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The grenade pad on the last quarter (Stage 920). The slide pad turns amber.
 * The grenade stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function grenadePadLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The crosshair on the last quarter (Stage 888). The corner, the bar, and the fire pad turn
 * amber. The mark you aim with stayed the same cyan as a full magazine. Empty is not this.
 */
export function reticleLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The crosshair when the magazine is empty (Stage 889). The corner and the fire pad turn
 * magenta. The mark you aim with stayed the same cyan as a full magazine. The last quarter is amber.
 */
export function reticleEmpty(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The cone on the last quarter (Stage 890). The cross turns amber. The ring the next round
 * leaves in stayed the same cyan as a full magazine. Empty is not this.
 */
export function coneLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The cone when the magazine is empty (Stage 891). The cross turns magenta. The ring the next
 * round leaves in stayed the same cyan as a full magazine. The last quarter is amber.
 */
export function coneEmpty(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The gun's name when the magazine is empty (Stage 893). The count turns magenta. The name
 * stayed the same cyan as a full magazine. The last quarter is not this.
 */
export function nameEmpty(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The gun's name on the last quarter (Stage 894). The count turns amber. The name stayed the
 * same cyan as a full magazine. Empty stays magenta.
 */
export function nameLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The size beside the count when the magazine is empty (Stage 895). The count and the name
 * turn magenta. The size printed beside that count stayed the same cyan as a full magazine.
 * The last quarter is not this.
 */
export function sizeEmpty(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The size beside the count on the last quarter (Stage 896). The count turns amber. The size
 * printed beside that count stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function sizeLow(state: AmmoState): boolean {
  return state === "low";
}

/**
 * The slash between the count and the size when the magazine is empty (Stage 897). The count,
 * the name, and the size turn magenta. That slash stayed the same cyan as a full magazine.
 * The last quarter is not this.
 */
export function slashEmpty(state: AmmoState): boolean {
  return state === "empty";
}

/**
 * The slash between the count and the size on the last quarter (Stage 898). The size turns
 * amber. That slash stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function slashLow(state: AmmoState): boolean {
  return state === "low";
}

export function ammoRead(ammo: number, magSize: number, reloadTimer: number, reloadTotal: number, reloadSeated: boolean): AmmoRead {
  if (magSize <= 0) return { state: "ok", reloadFrac: 0, seated: false };
  if (reloadTimer > 0 && reloadTotal > 0) return { state: "reloading", reloadFrac: Math.min(1, Math.max(0, 1 - reloadTimer / reloadTotal)), seated: reloadSeated };
  if (ammo <= 0) return { state: "empty", reloadFrac: 0, seated: false };
  if (ammo <= lowLine(magSize)) return { state: "low", reloadFrac: 0, seated: false };
  return { state: "ok", reloadFrac: 0, seated: false };
}

/**
 * True on the round that takes the magazine into its last quarter: the count was above the line
 * and is now at or under it, and still has something in it. Counted going down only — a reload
 * that comes up through the line is not a warning — and the empty click is the dry fire's own.
 */
export function lastRoundsEdge(prevAmmo: number, ammo: number, magSize: number): boolean {
  const line = lowLine(magSize);
  return line > 0 && prevAmmo > line && ammo <= line && ammo > 0;
}

/** A charge held (Stage 106): whether the ring is up, how full, and whether it has reached the top. */
export interface ChargeRead {
  on: boolean;
  /** 0..1 */
  frac: number;
  full: boolean;
}

/**
 * The LONGWAVE's charge, for the reticle. The corner has said `CHARGE 64%` since Stage 4, in the
 * place nobody looks while holding a shot on a moving file; the ring under the reticle is where
 * the eyes are, and it is the same ring the reload uses, in the charge's own colour, snapping to
 * a full mark the frame the charge tops out.
 */
export function chargeRead(charging: boolean, charge: number): ChargeRead {
  if (!charging) return { on: false, frac: 0, full: false };
  const frac = Math.min(1, Math.max(0, charge));
  return { on: true, frac, full: frac >= 1 };
}
