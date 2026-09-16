/**
 * Cloudflare Workers host: one Durable Object per match room, WebSockets.
 * The Room class is identical to the Node host's.
 */
import { MAX_PLAYERS_PER_ROOM, inputClassOf, matchRoomName } from "../shared/net/matchmaking";
import { Room, IDLE_PARK_MS, SERVER_TICK_MS, type Conn } from "./room";
import { DoAccountStore, PlayerFile } from "./player-do";
import { DoEndgameStore, Endgame } from "./endgame-do";
import { D1RunStore } from "./run-d1";
import { checkReport, type StoredReport } from "../shared/perf/report";
import { seasonView } from "./endgame";
import { currentAudit } from "../shared/endgame/audits";
import { contractsFor } from "../shared/endgame/contracts";
import { dayIndex } from "../shared/endgame/clock";

export { PlayerFile, Endgame };

export interface Env {
  MATCH_ROOM: DurableObjectNamespace;
  PLAYER_FILE: DurableObjectNamespace;
  ENDGAME: DurableObjectNamespace;
  DB?: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,32})$/);
    if (m) {
      const id = env.MATCH_ROOM.idFromName(m[1]!);
      return env.MATCH_ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/match") {
      // matchmaking: a Worker cannot enumerate rooms, so the shard is the ten-minute slot — rooms fill together and rotate
      const district = (url.searchParams.get("district") ?? "lease_row").replace(/[^a-z_]/g, "");
      const mode = url.searchParams.get("mode") === "run" ? "run" : "wake";
      const shard = Math.floor(Date.now() / 600_000) % 6;
      // a thumb and a mouse do not share a room that pays (Stage 34); MATCH_MIX_INPUTS="1" collapses
      // the two pools for an operator running a population too thin to fill either
      const input = inputClassOf(url.searchParams.get("input"));
      const name = matchRoomName("neochina", district, mode, shard, input, (env as unknown as { MATCH_MIX_INPUTS?: string }).MATCH_MIX_INPUTS === "1");
      const wsHost = url.host;
      return new Response(JSON.stringify({ room: name, district, mode, input, max: MAX_PLAYERS_PER_ROOM, url: `wss://${wsHost}/room/${name}?level=${district}${mode === "run" ? "&mode=run" : ""}` }), { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    }
    if (url.pathname === "/endgame") {
      const store = new DoEndgameStore(env.ENDGAME);
      const { week, audit } = currentAudit();
      const body = { day: dayIndex(), contracts: contractsFor(dayIndex()), audit: { week, ...audit }, board: await store.audit(week), season: seasonView(await store.season()) };
      return new Response(JSON.stringify(body), { headers: { "access-control-allow-origin": "*", "content-type": "application/json" } });
    }
    const f = decodeURIComponent(url.pathname).match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})(\/(buy|refund|ghost|daily|claim|rewrite|cosmetic))?$/);
    if (f) {
      const id = env.PLAYER_FILE.idFromName(f[1]!);
      const stub = env.PLAYER_FILE.get(id);
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const res = f[3] === "daily"
        ? await stub.fetch(new Request("https://file/daily", { method: "POST", body: JSON.stringify({ id: f[1] }) }))
        : f[3] && request.method === "POST"
        ? await stub.fetch(new Request(`https://file/${f[3]}`, { method: "POST", body: JSON.stringify({ id: f[1], ...((await request.json().catch(() => ({}))) as object) }) }))
        : await stub.fetch(new Request("https://file/public", { method: "POST", body: JSON.stringify({ id: f[1], name: "BLANK" }) }));
      return new Response(res.body, { status: res.status, headers: { ...cors, "content-type": "application/json" } });
    }
    if (url.pathname === "/perf") {
      // a device's frame report (Stage 50): one bounded row in, the newest rows out; D1 keeps them
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "content-type": "application/json" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (!env.DB) return new Response(JSON.stringify({ ok: false, reason: "no database bound" }), { headers: cors });
      if (request.method === "POST") {
        const c = checkReport(await request.json().catch(() => null));
        if (!c.ok) return new Response(JSON.stringify({ ok: false, reason: `not a frame report: ${c.problem}` }), { headers: cors });
        const r = c.report;
        const at = Date.now();
        await env.DB.prepare("INSERT INTO perf_report (at, build, ua, gpu, viewport, dpr, touch, scale, calls, triangles, level, frames, seconds, p50, p95, p99, max, fps) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)")
          .bind(at, r.build, r.ua, r.gpu, r.viewport, r.dpr, r.touch ? 1 : 0, r.scale, r.calls, r.triangles, r.level, r.frames, r.seconds, r.p50, r.p95, r.p99, r.max, r.fps)
          .run();
        return new Response(JSON.stringify({ ok: true, at }), { headers: cors });
      }
      const rows = await env.DB.prepare("SELECT at, build, ua, gpu, viewport, dpr, touch, scale, calls, triangles, level, frames, seconds, p50, p95, p99, max, fps FROM perf_report ORDER BY at DESC LIMIT 50").all<Omit<StoredReport, "touch"> & { touch: number }>();
      return new Response(JSON.stringify({ ok: true, reports: (rows.results ?? []).map((x) => ({ ...x, touch: x.touch === 1 })) }), { headers: cors });
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("meltdown worker", { status: 404 });
  },
};

export class MatchRoom implements DurableObject {
  private room: Room | null = null;
  private env: Env;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private sockets = 0;
  private idleSince = 0;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  /** The room is built on first contact so the opening URL can pick the district (`?level=`). */
  private roomFor(url: URL): Room {
    if (!this.room) {
      const audit = url.searchParams.get("audit") === "1" ? { week: currentAudit().week, def: currentAudit().audit } : null;
      this.room = new Room({
        accounts: new DoAccountStore(this.env.PLAYER_FILE),
        endgame: new DoEndgameStore(this.env.ENDGAME),
        // the day's banking goes straight to the shared database; the counter Worker settles it
        // nightly. A lost write is money the night will not pay for, so it is logged rather than
        // swallowed — the file's own `owed` still records it, and the two can be reconciled.
        onRunBank: (day, file, units) => {
          if (!this.env.DB) return;
          void new D1RunStore(this.env.DB).add(day, file, units).catch((e: unknown) => console.error(`run bank lost: day ${day} ${file} ${units} units — ${String((e as Error).message).slice(0, 200)}`));
        },
        // the economy's own denominator (Stage 38): who played, and who could have run. A lost row
        // costs an estimate a little accuracy and costs nobody any money, so it is logged and dropped
        // rather than retried against the match loop.
        onActive: (day, file, eligible) => {
          if (!this.env.DB) return;
          void new D1RunStore(this.env.DB).seen(day, file, eligible).catch((e: unknown) => console.error(`run stat lost: day ${day} ${file} — ${String((e as Error).message).slice(0, 200)}`));
        },
        audit, run: url.searchParams.get("mode") === "run", level: url.searchParams.get("level") ?? undefined, ai: url.searchParams.get("ai") !== "0" });
    }
    return this.room;
  }

  private ensureLoop(): void {
    if (this.timer) return;
    this.next = Date.now();
    const room = this.room!;
    this.timer = setInterval(() => {
      const now = Date.now();
      let n = 0;
      while (now >= this.next && n < 10) {
        room.step();
        this.next += SERVER_TICK_MS;
        n++;
      }
      if (n === 10) this.next = now;
      // stop ticking once no socket has been open for 10 s (the room state stays for rejoin)
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
    const room = this.roomFor(url);
    if (url.pathname.endsWith("/stats")) return Response.json(room.stats());
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const conn: Conn = {
      send: (buf) => server.send(buf),
      close: (code, reason) => server.close(code, reason),
    };
    this.sockets++;
    room.onOpen(conn);
    server.addEventListener("message", (ev) => {
      if (ev.data instanceof ArrayBuffer) room.onMessage(conn, ev.data);
      else room.onMessage(conn, new ArrayBuffer(0));
    });
    const closed = () => {
      this.sockets = Math.max(0, this.sockets - 1);
      room.onClose(conn);
    };
    server.addEventListener("close", closed);
    server.addEventListener("error", closed);
    this.ensureLoop();
    return new Response(null, { status: 101, webSocket: client });
  }
}
