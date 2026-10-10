/**
 * A few streets talk. The line is the role that street already has.
 * It does not open a new district.
 */
import { streetCast } from "./continents";

export const STREET_REACH = 8;

const LINES: Record<string, string> = {
  lease_row: "CLERK: RENEWALS ARE AUTOMATIC. THE ROW DOES NOT WAIT.",
  glass_mile: "BROKER: THE MILE BUYS WHAT YOU ARE HOLDING. NAME A PRICE.",
  relay_heights: "RIGGER: THE WIRE IS LIVE. THE HEIGHTS DO NOT CATCH YOU.",
  night_market: "STALLHAND: STALL RENT IS DUE AT DUSK. MOVE OR PAY.",
};

/** The bark for this street, or null when this street stays quiet. */
export function streetLine(id: string | undefined): string | null {
  const cast = streetCast(id);
  if (!cast) return null;
  const line = LINES[cast.id];
  if (!line || !line.startsWith(`${cast.role}:`)) return null;
  return line;
}

/** Close enough to the fixer's post to hear the street. */
export function inStreetTalk(x: number, z: number, spot: { x: number; z: number }): boolean {
  return Math.hypot(x - spot.x, z - spot.z) <= STREET_REACH;
}
