/**
 * The phone could only throw one kind of grenade (Stage 143).
 *
 * The desktop throws with G and cycles the type with Q, and the HUD lists `FRAG 2 · SMOKE 1 ·
 * EMP 1` with the selected one lit. The touch build hides that list ("the NADE pad carries the
 * selected one") and has no cycle at all, so a phone was stuck on whichever type the file spawned
 * with: it could never throw smoke or EMP, and it could not see how many it had left.
 *
 * The two pads say what they do. The throw pad names what it will throw and how many are left;
 * the cycle pad names what the next tap selects and how many of those are left. The sim cycles
 * blindly through the list (`(sel + 1) % n`), whatever the counts, so the label does too: the pad
 * tells the truth about where the tap goes, empty or not.
 */

/** the index the sim moves to on the next cycle: the list's next, wrapping, whatever the counts */
export function nextGrenade(sel: number, count: number): number {
  if (count <= 0) return 0;
  return ((((sel % count) + count) % count) + 1) % count;
}

/** the two pads' labels: what a tap throws, and what the next cycle selects */
export function grenadePad(sel: number, counts: readonly number[], names: readonly string[]): { throwLabel: string; cycleLabel: string } {
  const n = Math.min(counts.length, names.length);
  if (n === 0) return { throwLabel: "NADE", cycleLabel: "NADE" };
  const at = ((sel % n) + n) % n;
  const next = (at + 1) % n;
  return { throwLabel: `${names[at]} ${counts[at]}`, cycleLabel: `▸${names[next]} ${counts[next]}` };
}
