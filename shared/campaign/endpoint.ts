/**
 * The campaign file endpoint, shared by the node host and the PlayerFile
 * Durable Object: one request shape, one validator. The match room never
 * imports this.
 */
import type { Account } from "../progression/account";
import { FACTIONS, type FactionId } from "./factions";
import { campaignOf, completeContract, pickFaction, wearProtocols } from "./save";

export type CampaignRequest =
  | { op: "faction"; faction: string }
  | { op: "complete"; id: string; testimony?: Record<string, string> }
  | { op: "wear"; protocols: string[] }
  | { op: "state" };

export function campaignRequest(a: Account, body: unknown): { ok: boolean; reason?: string; campaign: ReturnType<typeof campaignOf>; reward?: unknown } {
  const req = (body ?? {}) as Partial<CampaignRequest> & { op?: string };
  switch (req.op) {
    case "faction": {
      const f = String((req as { faction?: unknown }).faction ?? "");
      if (!FACTIONS.some((x) => x.id === f)) return { ok: false, reason: "unknown house", campaign: campaignOf(a) };
      const ok = pickFaction(a, f as FactionId);
      return { ok, reason: ok ? undefined : "house already picked", campaign: campaignOf(a) };
    }
    case "complete": {
      const id = String((req as { id?: unknown }).id ?? "");
      const t = (req as { testimony?: unknown }).testimony;
      const testimony = t && typeof t === "object" && !Array.isArray(t) ? Object.fromEntries(Object.entries(t as Record<string, unknown>).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])) : {};
      const r = completeContract(a, id, testimony);
      return { ok: r.ok, reason: r.reason, campaign: campaignOf(a), reward: r.reward };
    }
    case "wear": {
      const ids = Array.isArray((req as { protocols?: unknown }).protocols) ? ((req as { protocols: unknown[] }).protocols.filter((x) => typeof x === "string") as string[]) : [];
      wearProtocols(a, ids);
      return { ok: true, campaign: campaignOf(a) };
    }
    case "state":
      return { ok: true, campaign: campaignOf(a) };
    default:
      return { ok: false, reason: "unknown op", campaign: campaignOf(a) };
  }
}
