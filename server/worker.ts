/**
 * Cloudflare Workers host: one Durable Object per match room, WebSockets.
 * The Room class is identical to the Node host's.
 */
import { MAX_PLAYERS_PER_ROOM, matchRoomName } from "../shared/net/matchmaking";
import { Room, SERVER_TICK_MS, type Conn } from "./room";
import { DoAccountStore, PlayerFile } from "./player-do";
import { DoEndgameStore, Endgame } from "./endgame-do";
import { D1RunStore } from "./run-d1";
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
      const name = matchRoomName("neochina", district, mode, shard);
      const wsHost = url.host;
      return new Response(JSON.stringify({ room: name, district, mode, max: MAX_PLAYERS_PER_ROOM, url: `wss://${wsHost}/room/${name}?level=${district}${mode === "run" ? "&mode=run" : ""}` }), { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
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
        else if (now - this.idleSince > 10000 && this.timer) {
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
