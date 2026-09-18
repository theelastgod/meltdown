/**
 * The shield broke in silence (Stage 102).
 *
 * Every file carries thirty points of shield over seventy of integrity: the shield soaks damage
 * first and grows back a few seconds after the last hit. The moment it breaks is the moment the
 * fight changes — the next round is integrity — and the client marked it with nothing: the cyan
 * bar in the corner went to zero and the `▲ INTEGRITY` alert read the same as any other hit. The
 * moment it is back is when the file can push again, and that was silent too.
 *
 * Pure so the rule is unit-tested: two views of the file, and the edges between them. A respawn is
 * not a shield coming back, and a file already broken taking another hit is not breaking again.
 */

export interface ShieldView {
  shield: number;
  maxShield: number;
  alive: boolean;
}

export type ShieldMoment = "broke" | "back";

export function shieldMoments(prev: ShieldView | null, next: ShieldView): ShieldMoment[] {
  if (!prev || !prev.alive || !next.alive || next.maxShield <= 0) return [];
  if (prev.shield > 0 && next.shield <= 0) return ["broke"];
  if (prev.shield < prev.maxShield && next.shield >= next.maxShield) return ["back"];
  return [];
}

export function shieldLine(m: ShieldMoment): string {
  return m === "broke" ? "◇ SHIELD DOWN" : "◇ SHIELD BACK";
}
