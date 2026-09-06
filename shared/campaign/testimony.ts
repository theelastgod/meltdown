/**
 * Testimony: every choice the player makes at a CRT terminal, keyed and
 * kept on the file. Later missions read it — layouts change, handlers
 * survive or don't, endings open or close. Conditions are tiny data so
 * missions and gigs can declare what they need without code.
 */
import type { FactionId } from "./factions";

export type Testimony = Record<string, string>;

/** A condition over testimony: every key must equal its value; `not` keys must not. */
export interface Gate {
  all?: Record<string, string>;
  not?: Record<string, string>;
  faction?: FactionId[];
}

export function gateOpen(g: Gate | undefined, t: Testimony, faction: FactionId | null): boolean {
  if (!g) return true;
  if (g.all) for (const [k, v] of Object.entries(g.all)) if (t[k] !== v) return false;
  if (g.not) for (const [k, v] of Object.entries(g.not)) if (t[k] === v) return false;
  if (g.faction && (!faction || !g.faction.includes(faction))) return false;
  return true;
}

/** Which handlers are alive, read from testimony: the leak can cost Ida, the informant can cost Marrow. */
export function handlersAlive(t: Testimony): Record<"vessel" | "marrow" | "deacon", boolean> {
  return { vessel: t["m4:vessel"] !== "expose", marrow: t["m2:informant"] !== "turn", deacon: true };
}

export type EndingId = "wipe" | "chair" | "chair_clockeater" | "chair_estate";

export interface EndingDef {
  id: EndingId;
  title: string;
  hidden: boolean;
  gate: Gate;
  lines: string[];
}

export const ENDINGS: readonly EndingDef[] = [
  { id: "wipe", title: "WIPE THE LEDGER", hidden: false, gate: {}, lines: ["THE LEASE SYSTEM HAS NO AUTHOR NOW.", "THE CITY REMEMBERS NOTHING OF YOU. THAT WAS THE POINT.", "YOU WALK OUT OF THE WHITE OFFICE INTO RAIN THAT DOES NOT KNOW YOUR NAME."] },
  { id: "chair", title: "TAKE THE CHAIR", hidden: false, gate: { all: { "m4:directive": "kept" } }, lines: ["THE DIRECTIVE IS YOURS TO SIGN OR BURN.", "YOU SIGN. THE CITY STAYS FROZEN, BUT IT IS YOUR ICE.", "WERN LEAVES THE PEN ON THE DESK AND DOES NOT LOOK BACK."] },
  { id: "chair_clockeater", title: "THE CLOCKEATER'S CHAIR", hidden: true, gate: { all: { "m4:directive": "kept", "m3:volatility": "hold" }, faction: ["clockeaters"] }, lines: ["YOU TAKE THE CHAIR AND SET THE MODEL TO FORGET.", "EVERY LEASE EXPIRES AT THE HOUR IT CANNOT SEE.", "MARROW SAYS THE CITY WILL EAT WELL TONIGHT."] },
  { id: "chair_estate", title: "THE ESTATE'S CHAIR", hidden: true, gate: { all: { "m4:directive": "kept", "m4:vessel": "shield" }, faction: ["estate"] }, lines: ["IDA VESSEL STANDS AT YOUR SHOULDER AS YOU SIGN.", "THE LEASE STAYS. THE PEN CHANGES HANDS. THAT IS ALL THE ESTATE EVER WANTED.", "THE MELTDOWN IS FORECAST FOR NEVER."] },
];

export function endingsFor(t: Testimony, faction: FactionId | null): EndingDef[] {
  return ENDINGS.filter((e) => gateOpen(e.gate, t, faction));
}
