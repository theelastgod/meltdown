/**
 * A panel drawn over another panel has to hide it (Stage 161).
 *
 * Every HUD panel is painted `--pan`, `rgba(3, 5, 9, 0.72)`. Over the city that translucency is the
 * whole look: the street shows faintly through the chrome. Over another panel it is not a look, it
 * is two documents printed on one page.
 *
 * The district chooser is where that lands. Measured on a drawn HUD at 960×540, with the contracts
 * panel open and `M` pressed — two keystrokes — the chooser's box is 386×189 and it overlaps the
 * contracts panel by 72 954 px², which is all of it. The endgame probe's own frame,
 * `stage11-deepwake.png`, shows the district rows with `VANTAGE CLEARING HOUSE`, `FLIPS · 7 NODE
 * SECONDS · OBJECTIVE 335` and `[ENTER] SIGN` legible straight through them.
 *
 * A player is asked to read that list and pick from it. So the rule is about choosers over panels,
 * not about the HUD's translucency in general: what the scene behind shows through is the look, and
 * it stays.
 */

/** The alpha of a colour as `getComputedStyle` reports it. Anything unreadable counts as clear. */
export function cssAlpha(colour: string): number {
  const c = (colour ?? "").trim().toLowerCase();
  if (c === "transparent") return 0;
  const rgba = /^rgba?\(([^)]+)\)$/.exec(c);
  if (!rgba) return 0;
  // commas, slashes and spaces: `rgba(3, 5, 9, 0.72)` and `rgb(3 5 9 / 0.72)` are the same colour
  const parts = rgba[1]!.split(/[,/\s]+/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 3) return 0;
  if (parts.length === 3) return 1; // rgb() is opaque
  const a = parts[3]!.endsWith("%") ? Number(parts[3]!.slice(0, -1)) / 100 : Number(parts[3]);
  return Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 0;
}

/**
 * Whether a panel covering `overlapPx` of other panels hides them. A panel that covers nothing is
 * free to be as translucent as the look wants.
 */
export function hidesPanels(bgAlpha: number, overlapPx: number): boolean {
  return overlapPx <= 0 || bgAlpha >= 1;
}
