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
 */
import { MAX_RANK } from "@shared/progression/mastery";

export { weaponShortLabel as rackLabel } from "@shared/weapons/manifest";

/** The rank a slot wears. R01 through the last rank. */
export function rackRankMark(rank: number): string {
  const n = Number.isFinite(rank) ? Math.max(1, Math.min(MAX_RANK, Math.floor(rank))) : 1;
  return `R${String(n).padStart(2, "0")}`;
}

/** One gun on the phone list. The rack is hidden there. The gun in hand is marked on. */
export function phoneRankSlot(label: string, rank: number, on: boolean): string {
  const name = label.trim();
  return `<span${on ? ` class="on"` : ""}>${name} ${rackRankMark(rank)}</span>`;
}
