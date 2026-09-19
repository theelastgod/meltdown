/**
 * The line under the crosshair (Stage 157).
 *
 * The bottom row's middle has read `1 · BLANK · 0.0 m/s · STAND` since the look stage wrote the
 * HUD. The speed and the stance are live. The other two are not: the `1` and the `BLANK` were typed
 * into the markup and no code has ever written either, so the line named a file that did not exist
 * in whatever room it was drawn in. In the run probe's own frame the header says ALPHA and the log
 * says FILE #1, and the line between them says BLANK.
 *
 * Three stages measured that line and moved it without reading it: Stage 118 lifted it above the
 * bottom row where the slots and the tabs leave no room, Stage 132 took the rule off the phone
 * again, Stage 136 seated the reader frames above it. Stage 132's goal quotes the string in full.
 *
 * So the two halves are a rule now, taking the file's number in the room and what the city calls
 * it — the same display name the header's handle is written from, so the two cannot disagree.
 */

export interface FootTag {
  /** the file's number in the room, accented, or a dash before there is one */
  num: string;
  /** what the city calls this file */
  name: string;
}

/** What a file with no name yet is called, here and in the room. */
export const BLANK_FILE = "BLANK";

export function footTag(fileId: number, display: string): FootTag {
  const name = (display ?? "").trim() || BLANK_FILE;
  const numbered = Number.isInteger(fileId) && fileId >= 0;
  return { num: numbered ? `#${fileId}` : "#—", name };
}

/** The whole line's identity half, for the cache that keeps it off every frame's write path. */
export function footTagText(tag: FootTag): string {
  return `${tag.num} ${tag.name}`;
}
