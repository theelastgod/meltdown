/**
 * The rack called the DIRECTIVE "THE" (Stage 109).
 *
 * The weapon rack labels each slot with the first word of the weapon's name, which reads for
 * seven of the eight — LEASE-BREAKER, REPO, STACK, LONGWAVE, PHAGE, SHOCK, CLOCKEATER — and for
 * the eighth read `7 THE 12`. A label is the word that names the thing; an article is not one.
 * The helper lives on the shared manifest so chips (Stage 218) use the same word.
 *
 * The rank (Stage 873). The rack named the gun and its rounds and not the rank. The mark is
 * painted beside the rounds, not written into the slot's text, so a reader that strips trailing
 * digits still sees the name.
 *
 * The phone (Stage 874). The rack is hidden there, so a gun you are not holding said nothing
 * about its rank. The phone line names every gun and the rank.
 *
 * The cap (Stage 875). At the last rank the file says MASTERED. The rack and the phone
 * list said R30.
 *
 * The rounds (Stage 876). The phone list named the gun and its rank. The rack already
 * painted the rounds in that gun. A phone hides the rack, so those rounds were gone.
 *
 * The tone (Stage 877). That count stayed yellow when the gun was empty and when it
 * was on its last quarter. The corner already turns magenta and amber for those.
 *
 * The next gun (Stage 878). The phone list marked the gun in hand. It did not mark
 * the gun the next WPN tap selects. The grenade cycle pad already names its next one.
 */
import { MAX_RANK } from "@shared/progression/mastery";
import { lowLine } from "./ammo";

export { weaponShortLabel as rackLabel } from "@shared/weapons/manifest";

/** The rank a slot wears. R01 through the rank before the last. MASTERED at the cap. */
export function rackRankMark(rank: number): string {
  const n = Number.isFinite(rank) ? Math.max(1, Math.min(MAX_RANK, Math.floor(rank))) : 1;
  if (n >= MAX_RANK) return "MASTERED";
  return `R${String(n).padStart(2, "0")}`;
}

/** Empty and the last quarter, the same lines the corner uses. A gun with no magazine stays plain. */
export function rackRoundTone(magSize: number, ammo: number): "" | "low" | "empty" {
  if (!(magSize > 0)) return "";
  const n = Number.isFinite(ammo) ? ammo : 0;
  if (n <= 0) return "empty";
  if (n <= lowLine(magSize)) return "low";
  return "";
}

/** The round count, yellow unless the tone says it is low or empty. */
export function rackRoundHtml(rounds: number | string, tone: "" | "low" | "empty" = ""): string {
  return `<i${tone ? ` class="${tone}"` : ""}>${rounds}</i>`;
}

/**
 * One gun on the phone list. The rack is hidden there. The gun in hand is marked on.
 * `rounds` is the same count the rack paints: the magazine, or ∞ when the gun has none.
 */
export function phoneRankSlot(label: string, rank: number, rounds: number | string, on: boolean, tone: "" | "low" | "empty" = "", next = false): string {
  const name = label.trim();
  const cls = on ? "on" : next ? "next" : "";
  const mark = next && !on ? "▸ " : "";
  return `<span${cls ? ` class="${cls}"` : ""}>${mark}${name} ${rackRoundHtml(rounds, tone)} ${rackRankMark(rank)}</span>`;
}
