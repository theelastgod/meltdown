/**
 * The three houses of Lethe and their fixers. Faction is picked when the
 * campaign starts and colours every conversation; the fixers are the
 * handlers who offer gigs from the Deadletter Office. Fiction only —
 * nothing here reads a stat. The PvP room never imports this module.
 */

export type FactionId = "estate" | "clockeaters" | "cells";

export interface FactionDef {
  id: FactionId;
  name: string;
  /** one line the CRT prints when you pick it */
  creed: string;
  /** HUD colour token */
  color: "am" | "mg" | "cy";
  /** the fixer who speaks for the house */
  fixer: HandlerId;
}

export type HandlerId = "vessel" | "marrow" | "deacon" | "wern" | "vantage";

export interface HandlerDef {
  id: HandlerId;
  name: string;
  title: string;
  faction: FactionId | null;
  color: "am" | "mg" | "cy" | "red" | "ye";
  /** how the terminal signs their lines */
  sigil: string;
}

export const FACTIONS: readonly FactionDef[] = [
  { id: "estate", name: "THE ESTATE", creed: "THE LEASE IS A KINDNESS. SOMEONE HAS TO HOLD THE PEN.", color: "am", fixer: "vessel" },
  { id: "clockeaters", name: "THE CLOCKEATERS", creed: "EAT THE HOURS THE MODEL CANNOT SEE.", color: "mg", fixer: "marrow" },
  { id: "cells", name: "THE WAKE CELLS", creed: "EVERY NODE OFF THE MODEL IS A MIND OFF THE LEASE.", color: "cy", fixer: "deacon" },
];

export const HANDLERS: Record<HandlerId, HandlerDef> = {
  vessel: { id: "vessel", name: "IDA VESSEL", title: "ESTATE DEFECTOR · FORMER AUDITOR", faction: "estate", color: "am", sigil: "◆" },
  marrow: { id: "marrow", name: "MARROW", title: "CLOCKEATER · UNLISTED SINCE THE FIRST LEASE", faction: "clockeaters", color: "mg", sigil: "◈" },
  deacon: { id: "deacon", name: "THE DEACON", title: "WAKE CELL SEVEN · KEEPS THE LEDGER OF THE WOKEN", faction: "cells", color: "cy", sigil: "▲" },
  wern: { id: "wern", name: "AUGUST WERN", title: "THE ESTATE · AUTHOR OF THE DIRECTIVE", faction: null, color: "red", sigil: "■" },
  vantage: { id: "vantage", name: "VANTAGE", title: "INTEGRITY SYSTEMS · THE MODEL'S VOICE", faction: null, color: "ye", sigil: "▣" },
};

export const factionById = (id: string | null | undefined): FactionDef | null => FACTIONS.find((f) => f.id === id) ?? null;
