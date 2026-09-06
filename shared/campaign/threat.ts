/**
 * Threat Rating 0–10: how hard VANTAGE hunts this file. It rises with the
 * account — Depth, wakes won, files closed, missions and gigs done — and
 * the districts answer: more patrols, wider detection, the PA calling your
 * moniker. Campaign and explorable districts only; PvP rooms never read it.
 */
import type { Account } from "../progression/account";

export interface ThreatProfile {
  rating: number;
  /** extra wasp patrols per district */
  extraWasps: number;
  /** extra repo mechs */
  extraMechs: number;
  /** multiplier on wasp detection radius */
  detectMult: number;
  /** the PA names you from here up */
  named: boolean;
  /** one line for the FILE panel */
  line: string;
}

export function threatRating(a: Pick<Account, "depth" | "counters"> & { campaign?: { missionsDone: string[]; gigsDone: string[] } | null }): number {
  const c = a.counters;
  const missions = a.campaign?.missionsDone.length ?? 0;
  const gigs = a.campaign?.gigsDone.length ?? 0;
  const r = a.depth / 12 + missions * 0.8 + gigs * 0.3 + (c["wins"] ?? 0) * 0.05 + (c["kills"] ?? 0) / 200;
  return Math.max(0, Math.min(10, Math.round(r)));
}

export const THREAT_LINES = ["UNLISTED · THE MODEL HAS NOT NOTICED", "NOTED · A LINE IN A LOG", "WATCHED · PATROLS ROUTED PAST YOU", "NAMED · THE PA KNOWS YOUR MONIKER", "PRICED · EXTRA WASPS ON EVERY STREET", "HUNTED · A REPO MECH IS ASSIGNED", "FLAGGED · DETECTION DOUBLED", "DIVERGENT · WERN'S OFFICE HAS YOUR FILE", "MELTDOWN RISK · THE LATTICE TRACKS YOU", "CRITICAL · EVERYTHING VANTAGE HAS", "THE DIRECTIVE · YOU ARE THE FORECAST"];

export function threatProfile(rating: number): ThreatProfile {
  const r = Math.max(0, Math.min(10, rating));
  return { rating: r, extraWasps: Math.floor(r / 2), extraMechs: r >= 6 ? 1 : 0, detectMult: 1 + 0.06 * r, named: r >= 3, line: THREAT_LINES[r] ?? THREAT_LINES[0]! };
}
