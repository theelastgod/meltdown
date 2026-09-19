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

/**
 * And how the link is doing (Stage 154). The client has measured its own round trip since the
 * netcode stage — a median over the last samples, the number its own clock estimate is built on —
 * and has never shown it to anybody. A player on a bad link saw the rubber-banding and had nothing
 * on the screen to tell them whether it was the link or the game.
 */

/** a round trip at or past this is worth saying out loud (ms) */
export const LINK_SLOW_MS = 120;
/** and at or past this, worth alarm (ms) */
export const LINK_BAD_MS = 250;

export type LinkTone = "ok" | "slow" | "bad";

/** the round trip as the band says it, or nothing with no room and nothing before the first sample */
export function linkLabel(linked: boolean, rttMs: number): string {
  if (!linked || !(rttMs > 0)) return "";
  return `${Math.round(rttMs)} MS`;
}

/** how worried the readout looks */
export function linkTone(rttMs: number): LinkTone {
  if (rttMs >= LINK_BAD_MS) return "bad";
  if (rttMs >= LINK_SLOW_MS) return "slow";
  return "ok";
}
