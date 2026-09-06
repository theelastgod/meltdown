/**
 * The campaign save on the file: faction, testimony, what is done, what is
 * worn, what is unlocked. Rewards are applied here (Scrip, XP, protocols,
 * weapons, counters) so the node host and the PlayerFile Durable Object do
 * it the same way. The match room never imports this module.
 */
import type { Account, CampaignRecord } from "../progression/account";
import { depthForXp } from "../progression/depth";
import type { FactionId } from "./factions";
import { gateOpen, handlersAlive, type Testimony } from "./testimony";
import { GIGS, MAIN_ARC, missionById, type MissionDef, type Reward } from "./missions";
import { MAX_PROTOCOLS, protocolById } from "./protocols";
import { threatRating } from "./threat";

export interface CampaignSave extends CampaignRecord {
  faction: FactionId | null;
  testimony: Testimony;
  /** campaign weapon unlocks */
  weapons: ("directive" | "clockeater")[];
}

export const emptyCampaign = (): CampaignSave => ({ faction: null, testimony: {}, missionsDone: [], gigsDone: [], protocols: [], worn: [], weapons: [], ending: null });

/** The live campaign record on the file (created or completed in place, never copied — callers keep one reference). */
export function campaignOf(a: Account): CampaignSave {
  if (!a.campaign) a.campaign = emptyCampaign();
  const c = a.campaign as CampaignSave;
  const d = emptyCampaign();
  for (const k of Object.keys(d) as (keyof CampaignSave)[]) if (c[k] === undefined) (c as unknown as Record<string, unknown>)[k] = d[k];
  return c;
}

/** The next main mission (null when the arc is complete). */
export function nextMission(c: CampaignSave): MissionDef | null {
  return MAIN_ARC.find((m) => !c.missionsDone.includes(m.id)) ?? null;
}

/** Gigs on offer: Threat and testimony gates, the fixer alive, not yet done. */
export function gigsOnOffer(a: Account, c: CampaignSave): MissionDef[] {
  const threat = threatRating({ depth: a.depth, counters: a.counters, campaign: c });
  const alive = handlersAlive(c.testimony);
  return GIGS.filter((g) => !c.gigsDone.includes(g.id) && (g.requires?.threat ?? 0) <= threat && gateOpen(g.requires?.gate, c.testimony, c.faction) && (g.fixer === "wern" || g.fixer === "vantage" || alive[g.fixer]));
}

/** Can this mission be launched now? Missions go in arc order; gigs must be on offer. */
export function canLaunch(a: Account, c: CampaignSave, id: string): { ok: boolean; reason?: string } {
  const m = missionById(id);
  if (!m) return { ok: false, reason: "unknown contract" };
  if (m.kind === "mission") {
    if (!c.faction) return { ok: false, reason: "pick a house first" };
    const next = nextMission(c);
    if (!next) return { ok: false, reason: "the arc is complete" };
    if (next.id !== id) return { ok: false, reason: `${next.title} comes first` };
    return { ok: true };
  }
  if (!gigsOnOffer(a, c).some((g) => g.id === id)) return { ok: false, reason: c.gigsDone.includes(id) ? "already closed" : "not on offer yet" };
  return { ok: true };
}

/** Apply a completion: rewards, testimony, done lists. Idempotent per contract. */
export function completeContract(a: Account, id: string, testimony: Testimony): { ok: boolean; reason?: string; reward?: Reward } {
  const c = campaignOf(a);
  const m = missionById(id);
  if (!m) return { ok: false, reason: "unknown contract" };
  // testimony is written as given (only keys the scripts know)
  for (const [k, v] of Object.entries(testimony)) if (/^(faction|m\d:[a-z_]+)$/.test(k) && /^[a-z_]+$/.test(v)) c.testimony[k] = v;
  if (c.testimony["faction"] && !c.faction) c.faction = c.testimony["faction"] as FactionId;
  const done = m.kind === "mission" ? c.missionsDone : c.gigsDone;
  if (done.includes(id)) return { ok: true, reward: {} };
  const launch = canLaunch(a, c, id);
  if (!launch.ok) return launch;
  done.push(id);
  applyReward(a, c, m.reward);
  a.counters[m.kind === "mission" ? "missionsDone" : "gigsDone"] = (a.counters[m.kind === "mission" ? "missionsDone" : "gigsDone"] ?? 0) + 1;
  if (m.id === "m7_white_office") {
    c.ending = c.testimony["m7:ending"] ?? "wipe";
    a.counters["endings"] = (a.counters["endings"] ?? 0) + 1;
  }
  a.ledger.push(`${m.kind === "mission" ? "MISSION" : "GIG"} CLOSED · ${m.title}${m.reward.scrip ? ` · +${m.reward.scrip} SCRIP` : ""}${m.reward.protocol ? ` · PROTOCOL ${m.reward.protocol.toUpperCase().replace(/_/g, " ")}` : ""}${m.reward.weapon ? ` · WEAPON ${m.reward.weapon.toUpperCase()}` : ""}`);
  return { ok: true, reward: m.reward };
}

function applyReward(a: Account, c: CampaignSave, r: Reward): void {
  if (r.scrip) a.wallet.scrip += r.scrip;
  if (r.xp) {
    a.xp += r.xp;
    a.depth = depthForXp(a.xp);
  }
  if (r.protocol && protocolById(r.protocol) && !c.protocols.includes(r.protocol)) c.protocols.push(r.protocol);
  if (r.weapon && !c.weapons.includes(r.weapon)) {
    c.weapons.push(r.weapon);
    const item = `weapon:${r.weapon}`;
    if (!a.owned.includes(item)) a.owned.push(item);
  }
}

/** Pick the faction at creation (once). */
export function pickFaction(a: Account, faction: FactionId): boolean {
  const c = campaignOf(a);
  if (c.faction) return false;
  c.faction = faction;
  c.testimony["faction"] = faction;
  a.ledger.push(`HOUSE · ${faction.toUpperCase()}`);
  return true;
}

/** Wear protocols (campaign only): owned, at most MAX_PROTOCOLS. */
export function wearProtocols(a: Account, ids: string[]): string[] {
  const c = campaignOf(a);
  c.worn = ids.filter((id, i, arr) => c.protocols.includes(id) && arr.indexOf(id) === i).slice(0, MAX_PROTOCOLS);
  return c.worn;
}
