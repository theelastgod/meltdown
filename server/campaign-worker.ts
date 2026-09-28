/**
 * The campaign Worker: a separate script from the PvP worker so the match
 * Durable Object never loads campaign power. It hosts the co-op room DO
 * and the campaign file route; files live in the PvP worker's PlayerFile
 * DO, reached through a cross-script binding (load → apply → save).
 *
 * The city's presence feed (Stage 705), `GET /city`: public, read-only, display names only. The
 * design is a fan-out behind a cache, the simplest thing that holds up here: the city is five
 * Durable Objects with fixed names (`city-<district>`), so the Worker asks each for its own line
 * (`/presence`, answered by the object without building a room when it has none) in parallel, with a
 * short timeout each, and aggregates them (`aggregatePresence`, which re-checks every name). The
 * result is kept for PRESENCE_TTL_MS in the isolate (`PresenceCache`, one build at a time), and sent
 * with `cache-control: max-age=2`, so however often the feed is asked, an isolate costs the city at
 * most five small subrequests per two seconds. There is no registry object to keep in step and no
 * write on every join: a district that cannot answer in time is an empty line, never an error.
 *
 * A city object that has been evicted has no room and nobody in it; its line still carries the
 * course records, which the object keeps beside the street-run board (`cityRecords:<district>`,
 * already reduced to course, time and display name) whenever the board or the feed changes them.
 */
import { IDLE_PARK_MS, SERVER_TICK_MS, type Conn } from "./room";
import { decodePath } from "./path";
import { createCampaignRoom, crewInfo, type CampaignRoomHandle } from "./campaign-room";
import { createCityRoom } from "./city-room";
import { CITY_DISTRICTS, cityOf } from "../shared/net/city";
import { aggregatePresence, emptyPresence, PresenceCache, PRESENCE_TIMEOUT_MS, readDistrict, type DistrictPresence } from "../shared/city/presence";
import type { CityRoomHandle } from "./city-room";
import { crewRoomName, normaliseCrewCode, NO_SUCH_CREW } from "../shared/net/crew";
import { DoAccountStore, NOT_YOURS } from "./player-do";
import { campaignRequest } from "../shared/campaign/endpoint";
import { campaignOf } from "../shared/campaign/save";
import { fileAuth, publicFile, upgradeAccount, type Account } from "../shared/progression/account";

export interface Env {
  CAMPAIGN_ROOM: DurableObjectNamespace;
  /** the PvP worker's PlayerFile namespace (script_name binding) */
  PLAYER_FILE: DurableObjectNamespace;
}

/** the feed, kept per isolate (Stage 705): at most one gather per PRESENCE_TTL_MS */
const presence = new PresenceCache<string>();

/** One district's line, from its city object: null when it does not answer in time. */
async function districtLine(env: Env, district: string): Promise<unknown> {
  const stub = env.CAMPAIGN_ROOM.get(env.CAMPAIGN_ROOM.idFromName(`city-${district}`));
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), PRESENCE_TIMEOUT_MS)));
  try {
    return await Promise.race([stub.fetch(new Request(`https://city/presence?city=${district}`)).then((r) => (r.ok ? r.json() : null)).catch(() => null), late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** GET /city: every district's line, gathered in parallel and aggregated (every name checked again). */
export function cityPresenceFeed(env: Env, now = Date.now()): Promise<string> {
  return presence.getAsync(now, async () => JSON.stringify(aggregatePresence(await Promise.all(CITY_DISTRICTS.map((d) => districtLine(env, d))), now)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/city" && request.method === "GET") {
      // public and read-only: display names, counts, the event and the records; never an id or a secret
      const body = await cityPresenceFeed(env).catch(() => JSON.stringify(aggregatePresence([], Date.now())));
      return new Response(body, { headers: { "access-control-allow-origin": "*", "content-type": "application/json", "cache-control": "public, max-age=2" } });
    }
    const m = url.pathname.match(/^\/campaign\/([a-zA-Z0-9_-]{1,32})$/);
    if (m) return env.CAMPAIGN_ROOM.get(env.CAMPAIGN_ROOM.idFromName(m[1]!)).fetch(request);
    // a crew's door (Stage 49): look a code up before travelling; a room nobody has opened says so
    const crew = url.pathname.match(/^\/crew\/([^/]+)$/);
    if (crew) {
      const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
      const code = normaliseCrewCode(crew[1]!); // no decoding: a code is plain, and a bad escape must be a bad code, not a thrown request
      if (!code) return new Response(JSON.stringify({ ok: false, reason: NO_SUCH_CREW }), { headers: cors });
      const r = await env.CAMPAIGN_ROOM.get(env.CAMPAIGN_ROOM.idFromName(crewRoomName(code))).fetch(new Request(`https://crew/info?code=${code}`));
      return new Response(await r.text(), { headers: cors });
    }
    const f = decodePath(url.pathname)?.match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})\/campaign$/);
    if (f) {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const stub = env.PLAYER_FILE.get(env.PLAYER_FILE.idFromName(f[1]!));
      const loaded = await stub.fetch(new Request("https://file/file", { method: "POST", body: JSON.stringify({ id: f[1], name: "BLANK" }) }));
      const a = upgradeAccount((await loaded.json()) as Account);
      const body = (await request.json().catch(() => ({}))) as { secret?: string };
      // the id names the file; the secret proves the caller owns it (Stage 26). This route is the
      // production campaign save — a house, worn protocols — and it was never checking (Stage 28).
      const auth = fileAuth(a, body.secret);
      if (!auth.ok) return new Response(JSON.stringify({ ok: false, reason: NOT_YOURS, campaign: campaignOf(a) }), { status: 403, headers: { ...cors, "content-type": "application/json" } });
      const r = campaignRequest(a, body);
      if (r.ok || auth.adopted) await stub.fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) }));
      return new Response(JSON.stringify({ ...r, account: publicFile(a) }), { headers: { ...cors, "content-type": "application/json" } });
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("meltdown campaign worker", { status: 404 });
  },
};

export class CampaignRoom implements DurableObject {
  private handle: CampaignRoomHandle | null = null;
  /** the city this object runs, when it is one (Stage 705: its presence line) */
  private city: CityRoomHandle | null = null;
  /** the records last kept for the feed, so they are written only when they change */
  private keptRecords = "";
  private env: Env;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private sockets = 0;
  private idleSince = 0;
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private roomFor(url: URL): CampaignRoomHandle {
    // a city (Stage 692) is a room with no mission: the district's shared open world, PvE
    const city = cityOf(url.pathname.split("/").pop() ?? "");
    if (!this.handle && city) {
      // the district's street-run board (Stage 703) outlives the room in this object's own storage:
      // one Durable Object per city room name, so one board per district
      const key = `streetRuns:${city}`;
      // a new best changes the records the presence feed shows, so they are kept with the board (Stage 705)
      const runBoard = {
        load: () => this.state.storage.get(key),
        save: async (data: unknown) => {
          await this.state.storage.put(key, data);
          if (this.city) await this.keepRecords(this.city.presence());
        },
      };
      const c = createCityRoom({ accounts: new DoAccountStore(this.env.PLAYER_FILE), district: city, runBoard });
      this.city = c;
      this.handle = { room: c.room, state: () => ({ mission: "", hostId: -1, view: null, settled: [], choices: 0 }) };
    }
    if (!this.handle) this.handle = createCampaignRoom({ accounts: new DoAccountStore(this.env.PLAYER_FILE), mission: url.searchParams.get("mission") ?? "g_escrow_row" });
    return this.handle;
  }

  private ensureLoop(): void {
    if (this.timer) return;
    this.next = Date.now();
    const room = this.handle!.room;
    this.timer = setInterval(() => {
      const now = Date.now();
      let n = 0;
      while (now >= this.next && n < 10) {
        room.step();
        this.next += SERVER_TICK_MS;
        n++;
      }
      if (n === 10) this.next = now;
      if (this.sockets === 0) {
        if (!this.idleSince) this.idleSince = now;
        else if (now - this.idleSince > IDLE_PARK_MS && this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      } else this.idleSince = 0;
    }, SERVER_TICK_MS / 2);
  }

  /** keep a city's records for the feed, beside its board, when they changed (display names only: they come from `districtPresence`) */
  private async keepRecords(line: DistrictPresence): Promise<void> {
    const s = JSON.stringify(line.records);
    if (s === this.keptRecords) return;
    this.keptRecords = s;
    await this.state.storage.put(`cityRecords:${line.district}`, line.records);
  }

  /** This city's line of the presence feed (Stage 705). Asking must not build a room: an object with none has nobody in it. */
  private async presenceLine(district: string): Promise<DistrictPresence> {
    if (this.city && this.city.district === district) {
      const line = this.city.presence();
      await this.keepRecords(line).catch(() => undefined);
      return line;
    }
    const kept = await this.state.storage.get(`cityRecords:${district}`).catch(() => null);
    // read back through the same checks as any report from another process
    return readDistrict({ ...emptyPresence(district), records: kept }) ?? emptyPresence(district);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/presence") {
      const district = cityOf(`city-${url.searchParams.get("city") ?? ""}`);
      if (!district) return Response.json(null, { status: 404 });
      return Response.json(await this.presenceLine(district));
    }
    // asking about a crew must not create one: an unopened room answers "no such crew"
    if (url.pathname === "/info") return Response.json(this.handle ? crewInfo(this.handle, url.searchParams.get("code") ?? "") : { ok: false, reason: NO_SUCH_CREW });
    const h = this.roomFor(url);
    if (url.pathname.endsWith("/stats")) return Response.json({ ...h.room.stats(), campaign: h.state() });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const conn: Conn = {
      send: (buf) => server.send(buf),
      close: (code, reason) => server.close(code, reason),
    };
    this.sockets++;
    // a city reads a gate arrival from its socket's query (Stage 697); a contract's room ignores it
    h.room.onOpen(conn, url.searchParams);
    server.addEventListener("message", (ev) => {
      if (ev.data instanceof ArrayBuffer) h.room.onMessage(conn, ev.data);
      else h.room.onMessage(conn, new ArrayBuffer(0));
    });
    const closed = () => {
      this.sockets = Math.max(0, this.sockets - 1);
      h.room.onClose(conn);
    };
    server.addEventListener("close", closed);
    server.addEventListener("error", closed);
    this.ensureLoop();
    return new Response(null, { status: 101, webSocket: client });
  }
}
