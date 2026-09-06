/**
 * The Workers side of the endgame store: one Durable Object holds the Audit
 * boards and the Deep Wake season; DoEndgameStore is the room's proxy to it.
 * Worker-only (Durable Object types); the Node host uses MemoryEndgameStore.
 */
import { leaderboard, type AuditEntry } from "../shared/endgame/audits";
import { applyRound, emptySeason, rollSeason, type RoundPush, type SeasonState } from "../shared/endgame/season";
import type { EndgameStore } from "./endgame";

/** The Workers side: one Durable Object holds both. */
export class Endgame implements DurableObject {
  private state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/audit") {
      const week = Number(url.searchParams.get("week") ?? 0);
      const list = (await this.state.storage.get<AuditEntry[]>(`audit:${week}`)) ?? [];
      if (request.method === "POST") {
        const entry = (await request.json()) as AuditEntry;
        list.push(entry);
        await this.state.storage.put(`audit:${week}`, list.slice(-2000));
      }
      return Response.json(leaderboard(list));
    }
    if (url.pathname === "/season") {
      const st = (await this.state.storage.get<SeasonState>("season")) ?? emptySeason();
      if (request.method === "POST") applyRound(st, (await request.json()) as RoundPush);
      else rollSeason(st);
      await this.state.storage.put("season", st);
      return Response.json(st);
    }
    return new Response("endgame", { status: 404 });
  }
}

export class DoEndgameStore implements EndgameStore {
  constructor(private ns: DurableObjectNamespace) {}
  private stub(): DurableObjectStub {
    return this.ns.get(this.ns.idFromName("deep-wake"));
  }
  async audit(week: number): Promise<AuditEntry[]> {
    return (await (await this.stub().fetch(`https://endgame/audit?week=${week}`)).json()) as AuditEntry[];
  }
  async submitAudit(week: number, entry: AuditEntry): Promise<void> {
    await this.stub().fetch(new Request(`https://endgame/audit?week=${week}`, { method: "POST", body: JSON.stringify(entry) }));
  }
  async season(): Promise<SeasonState> {
    return (await (await this.stub().fetch("https://endgame/season")).json()) as SeasonState;
  }
  async pushSeason(push: RoundPush): Promise<SeasonState> {
    return (await (await this.stub().fetch(new Request("https://endgame/season", { method: "POST", body: JSON.stringify(push) }))).json()) as SeasonState;
  }
}

