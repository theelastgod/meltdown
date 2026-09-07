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

/**
 * `trustCompletion` decides whether a caller may close a contract by saying so.
 *
 * It must be false in production, and the default is false. A campaign contract hands out Scrip,
 * XP — which is Depth, which is the Ledger Graph — and the two campaign weapons, and all three
 * follow the player into the wake, where the Audit board pays $CAPITAL. A client that can close a
 * contract by asserting it can walk the arc in a handful of requests and arrive at Depth 50 with
 * both weapons, having played nothing.
 *
 * The real completion path does not come through here at all: `server/campaign-room.ts` calls
 * `completeContract` itself when the mission's own objectives report `complete`, for every player
 * in the room. That is server-authoritative and unforgeable, and it is what closes a contract for
 * anyone actually playing.
 *
 * The flag exists because the dev host needs to reach a late campaign state without playing seven
 * missions, in the same spirit as its `/chain/faucet`. `server/player-do.ts` — the production
 * path — never passes it.
 */
export interface CampaignOptions {
  trustCompletion?: boolean;
}

export function campaignRequest(a: Account, body: unknown, opts: CampaignOptions = {}): { ok: boolean; reason?: string; campaign: ReturnType<typeof campaignOf>; reward?: unknown } {
  const req = (body ?? {}) as Partial<CampaignRequest> & { op?: string };
  switch (req.op) {
    case "faction": {
      const f = String((req as { faction?: unknown }).faction ?? "");
      if (!FACTIONS.some((x) => x.id === f)) return { ok: false, reason: "unknown house", campaign: campaignOf(a) };
      const ok = pickFaction(a, f as FactionId);
      return { ok, reason: ok ? undefined : "house already picked", campaign: campaignOf(a) };
    }
    case "complete": {
      if (!opts.trustCompletion) return { ok: false, reason: "a contract is closed by the room that ran it, not by asking", campaign: campaignOf(a) };
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
