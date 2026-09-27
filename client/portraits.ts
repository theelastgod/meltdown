/**
 * Who is speaking (Stage 680). Until this stage the CRT terminal named a speaker with one glyph —
 * ▲ for the Deacon, ◈ for Marrow — and the four people who hand the player every contract had faces
 * only in the Deadletter Office, where they stand as 3D figures. Now the terminal shows each of them
 * beside their words: drawn in Higgsfield from the turntable of those same figures, so the hood, the
 * cut of the coat and the strip-light are the ones the player meets in the office. Faces are never
 * lit, as in the world. VANTAGE, which has no body, is its eye.
 *
 * A Record over every handler, so a new speaker cannot be written without a portrait.
 */
import type { HandlerId } from "@shared/campaign/factions";

export const PORTRAIT: Record<HandlerId, string> = {
  deacon: "/portraits/deacon.jpg",
  marrow: "/portraits/marrow.jpg",
  vessel: "/portraits/vessel.jpg",
  wern: "/portraits/wern.jpg",
  vantage: "/portraits/vantage.jpg",
};

/** the portrait for a script node's speaker, or null for the file's own lines and the bare terminal */
export function portraitFor(speaker: string): string | null {
  return speaker in PORTRAIT ? PORTRAIT[speaker as HandlerId] : null;
}
