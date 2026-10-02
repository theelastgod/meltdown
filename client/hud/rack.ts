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
 *
 * Before the seat (Stage 879). The corner says -- while the magazine is not in.
 * The rack and the phone list still said 0, the empty count.
 *
 * The short name (Stage 899). An empty magazine turns the gun's name magenta.
 * On the rack that word stayed the same cyan as a full magazine. The count
 * beside it was already magenta.
 *
 * The last quarter (Stage 900). The gun's name turns amber. On the rack that
 * short name stayed the same cyan as a full magazine.
 *
 * The phone (Stage 901). The rack is hidden there. An empty magazine turns
 * the rack's short name magenta. On the phone that word stayed cyan.
 *
 * The last quarter on the phone (Stage 902). The rack's short name turns
 * amber. On the phone that word stayed the same cyan as a full magazine.
 *
 * The rank beside it (Stage 903). An empty magazine turns that short name
 * magenta. The rank beside the name stayed the same cyan as a full magazine.
 *
 * The last quarter (Stage 904). The short name turns amber. The rank beside
 * that name stayed the same cyan as a full magazine.
 *
 * The rank on the rack (Stage 905). An empty magazine turns the rank on the
 * phone magenta. On the rack that rank stayed the same cyan as a full magazine.
 *
 * The last quarter (Stage 906). That rank on the phone turns amber. On the
 * rack the rank stayed the same cyan as a full magazine.
 *
 * The slot number (Stage 907). An empty magazine turns that rank magenta.
 * The number beside the name stayed the same cyan as a full magazine.
 *
 * The last quarter (Stage 908). That rank turns amber. The slot number
 * beside the name stayed the same cyan as a full magazine.
 */
import { MAX_RANK } from "@shared/progression/mastery";
import { lowLine } from "./ammo";

export { weaponShortLabel as rackLabel } from "@shared/weapons/manifest";

/**
 * The rank on the rack when that gun's magazine is empty (Stage 905).
 * The phone turns magenta. The rack paints this rank through the mark, and
 * it stayed the same cyan as a full magazine. The last quarter is not this.
 */
export function rackRankEmpty(tone: "" | "low" | "empty"): boolean {
  return tone === "empty";
}

/**
 * The rank on the rack on the last quarter (Stage 906). The phone turns amber.
 * This mark stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function rackRankLow(tone: "" | "low" | "empty"): boolean {
  return tone === "low";
}

/** A class on the rack's rank mark. Empty is magenta. The last quarter is amber. */
export function rackRankAttr(tone: "" | "low" | "empty"): string {
  if (rackRankEmpty(tone)) return ` class="empty"`;
  if (rackRankLow(tone)) return ` class="low"`;
  return "";
}

/**
 * The slot number on the rack when that gun's magazine is empty (Stage 907).
 * The rank turns magenta. This number stayed the same cyan as a full magazine.
 * The last quarter is not this.
 */
export function rackSlotEmpty(tone: "" | "low" | "empty"): boolean {
  return tone === "empty";
}

/**
 * The slot number on the rack on the last quarter (Stage 908). The rank turns
 * amber. This number stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function rackSlotLow(tone: "" | "low" | "empty"): boolean {
  return tone === "low";
}

/** The slot number. Empty marks it magenta. The last quarter marks it amber. */
export function rackSlotHtml(slot: number, tone: "" | "low" | "empty"): string {
  const mark = rackSlotEmpty(tone) ? "empty" : rackSlotLow(tone) ? "low" : "";
  return `<span class="num${mark ? ` ${mark}` : ""}">${slot}</span>`;
}

/** The rank a slot wears. R01 through the rank before the last. MASTERED at the cap. */
export function rackRankMark(rank: number): string {
  const n = Number.isFinite(rank) ? Math.max(1, Math.min(MAX_RANK, Math.floor(rank))) : 1;
  if (n >= MAX_RANK) return "MASTERED";
  return `R${String(n).padStart(2, "0")}`;
}

/** Empty and the last quarter, the same lines the corner uses. A gun with no magazine stays plain. Before the magazine seats, the count is not a number. */
export function rackRoundTone(magSize: number, ammo: number, unseated = false): "" | "low" | "empty" {
  if (unseated || !(magSize > 0)) return "";
  const n = Number.isFinite(ammo) ? ammo : 0;
  if (n <= 0) return "empty";
  if (n <= lowLine(magSize)) return "low";
  return "";
}

/** The count the rack and the phone list print. -- until that gun's magazine seats, the same mark as the corner. */
export function rackRoundShown(magSize: number, ammo: number, unseated: boolean): number | string {
  if (!(magSize > 0)) return "∞";
  if (unseated) return "--";
  return Number.isFinite(ammo) ? ammo : 0;
}

/** The round count, yellow unless the tone says it is low or empty. */
export function rackRoundHtml(rounds: number | string, tone: "" | "low" | "empty" = ""): string {
  return `<i${tone ? ` class="${tone}"` : ""}>${rounds}</i>`;
}

/**
 * The short name on the rack when that gun's magazine is empty (Stage 899).
 * The corner name turns magenta. This word stayed the same cyan as a full magazine.
 * The last quarter is not this.
 */
export function rackNameEmpty(tone: "" | "low" | "empty"): boolean {
  return tone === "empty";
}

/**
 * The short name on the rack on the last quarter (Stage 900). The corner name
 * turns amber. This word stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function rackNameLow(tone: "" | "low" | "empty"): boolean {
  return tone === "low";
}

/** The short name. Empty marks it magenta. The last quarter marks it amber. */
export function rackNameHtml(label: string, tone: "" | "low" | "empty"): string {
  const mark = rackNameEmpty(tone) ? "empty" : rackNameLow(tone) ? "low" : "";
  return `<em${mark ? ` class="${mark}"` : ""}>${label}</em>`;
}

/**
 * One gun on the phone list. The rack is hidden there. The gun in hand is marked on.
 * `rounds` is the same count the rack paints: the magazine, or ∞ when the gun has none.
 */
/**
 * The short name on the phone when that gun's magazine is empty (Stage 901).
 * The rack turns magenta. A phone hides the rack, so this word stayed the same
 * cyan as a full magazine. The last quarter is not this.
 */
export function phoneNameEmpty(tone: "" | "low" | "empty"): boolean {
  return tone === "empty";
}

/**
 * The short name on the phone on the last quarter (Stage 902). The rack turns
 * amber. This word stayed the same cyan as a full magazine. Empty stays magenta.
 */
export function phoneNameLow(tone: "" | "low" | "empty"): boolean {
  return tone === "low";
}

/** The short name on the phone. Empty marks it magenta. The last quarter marks it amber. */
export function phoneNameHtml(label: string, tone: "" | "low" | "empty"): string {
  const mark = phoneNameEmpty(tone) ? "empty" : phoneNameLow(tone) ? "low" : "";
  return `<em${mark ? ` class="${mark}"` : ""}>${label}</em>`;
}

/**
 * The rank beside the short name on the phone when that magazine is empty (Stage 903).
 * The name turns magenta. This rank stayed the same cyan as a full magazine.
 * The last quarter is not this.
 */
export function phoneRankEmpty(tone: "" | "low" | "empty"): boolean {
  return tone === "empty";
}

/**
 * The rank beside the short name on the phone on the last quarter (Stage 904).
 * The name turns amber. This rank stayed the same cyan as a full magazine.
 * Empty stays magenta.
 */
export function phoneRankLow(tone: "" | "low" | "empty"): boolean {
  return tone === "low";
}

/** The rank beside the short name. Empty marks it magenta. The last quarter marks it amber. */
export function phoneRankHtml(rank: number, tone: "" | "low" | "empty"): string {
  const label = rackRankMark(rank);
  const mark = phoneRankEmpty(tone) ? "empty" : phoneRankLow(tone) ? "low" : "";
  return mark ? `<b class="${mark}">${label}</b>` : label;
}

export function phoneRankSlot(label: string, rank: number, rounds: number | string, on: boolean, tone: "" | "low" | "empty" = "", next = false): string {
  const name = label.trim();
  const cls = on ? "on" : next ? "next" : "";
  const mark = next && !on ? "▸ " : "";
  return `<span${cls ? ` class="${cls}"` : ""}>${mark}${phoneNameHtml(name, tone)} ${rackRoundHtml(rounds, tone)} ${phoneRankHtml(rank, tone)}</span>`;
}
