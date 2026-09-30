/**
 * How a portrait plate meets the next line (Stage 717).
 *
 * The same face holds the zoom it already has. A different face fades over it. Opening on a
 * plate, and closing the line, are not cuts between two people.
 */

export type PlatePass = "off" | "hold" | "zoom" | "cross";

/** The bars are this tall. The plate used to start inside the top one on a phone (Stage 724). */
export const LETTER_VH = 11;

/** Where the plate's top sits, in vh. Under the bar, on a desk and on a phone. */
export function plateTop(touch: boolean): number {
  const wanted = touch ? 8 : 12;
  return Math.max(LETTER_VH + 1, wanted);
}

export function platePass(prev: string | null, next: string | null): PlatePass {
  if (!next) return "off";
  if (prev === next) return "hold";
  if (prev) return "cross";
  return "zoom";
}
