/**
 * The campaign Worker: a separate script from the PvP worker so the match
 * Durable Object never loads campaign power. It hosts the co-op room DO
 * and the campaign file route; files live in the PvP worker's PlayerFile
 * DO, reached through a cross-script binding (load → apply → save).
 */
import { IDLE_PARK_MS, SERVER_TICK_MS, type Conn } from "./room";
import { createCampaignRoom, crewInfo, type CampaignRoomHandle } from "./campaign-room";
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
    const f = decodeURIComponent(url.pathname).match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})\/campaign$/);
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
  private env: Env;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private sockets = 0;
  private idleSince = 0;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  private roomFor(url: URL): CampaignRoomHandle {
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

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
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
    h.room.onOpen(conn);
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
