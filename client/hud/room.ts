/**
 * What the HUD says about the room (Stage 149).
 *
 * Two readouts told the player how many files were in the district: the file's own header line
 * ended `· 1 online`, and the right-hand band read `▸ ONLINE (1)`. Both numbers were typed into the
 * HUD's markup at the first stage and never written again by any code — with ALPHA and BRAVO in
 * one room, and the log saying `FILE #2 (BRAVO) ENTERED DRAINAGE YARD`, both readouts still said
 * one. Offline, where there is no room at all, they said one too.
 *
 * The label is a rule so both readouts say the same thing and the probe can hold them to it.
 */

/** the room's line: how many files are in it, or that there is no room */
export function roomLabel(linked: boolean, files: number): string {
  if (!linked) return "OFFLINE";
  return `${Math.max(1, Math.floor(files))} ONLINE`;
}
