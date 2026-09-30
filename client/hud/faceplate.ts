/**
 * How a portrait plate meets the next line (Stage 717).
 *
 * The same face holds the zoom it already has. A different face fades over it. Opening on a
 * plate, and closing the line, are not cuts between two people.
 */

export type PlatePass = "off" | "hold" | "zoom" | "cross";

export function platePass(prev: string | null, next: string | null): PlatePass {
  if (!next) return "off";
  if (prev === next) return "hold";
  if (prev) return "cross";
  return "zoom";
}
