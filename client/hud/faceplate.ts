/**
 * How a portrait plate meets the next line (Stage 717).
 *
 * The same face holds the zoom it already has. A different face fades over it. Opening on a
 * plate, and closing the line, are not cuts between two people.
 */

export type PlatePass = "off" | "hold" | "zoom" | "cross";

/** The bars are this tall. The plate used to start inside the top one on a phone (Stage 724). */
export const LETTER_VH = 11;

/** The alert's home, under the compass. A line's bar covers that spot (Stage 731). */
export const ALERT_HOME = 58;

/**
 * During a line the letterbox paints over the alert, and on a short screen the same spot sits on
 * the face. The line parks it in the bar, above the black.
 */
export function alertOnCut(cut: boolean): { top: number; z: string } {
  if (!cut) return { top: ALERT_HOME, z: "" };
  return { top: 8, z: "6" };
}

/** Where the plate's top sits, in vh. Under the bar, on a desk and on a phone. */
export function plateTop(touch: boolean): number {
  const wanted = touch ? 8 : 12;
  return Math.max(LETTER_VH + 1, wanted);
}

/**
 * The small face beside the words (Stage 725). The big plate is already that face, so the line
 * does not show it twice. A body in the room has no plate, and the thumbnail stays.
 */
export function thumbBeside(plate: string | null, portrait: string | null): string | null {
  if (plate) return null;
  return portrait;
}

export function platePass(prev: string | null, next: string | null): PlatePass {
  if (!next) return "off";
  if (prev === next) return "hold";
  if (prev) return "cross";
  return "zoom";
}
