/**
 * Cloudflare Workers host: one Durable Object per match room, WebSockets.
 * The Room class is identical to the Node host's.
 */
import { Room, SERVER_TICK_MS, type Conn } from "./room";

export interface Env {
  MATCH_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,32})$/);
    if (m) {
      const id = env.MATCH_ROOM.idFromName(m[1]!);
      return env.MATCH_ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("meltdown worker", { status: 404 });
  },
};

export class MatchRoom implements DurableObject {
  private room: Room;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private sockets = 0;
  private idleSince = 0;

  constructor(_state: DurableObjectState) {
    this.room = new Room({});
  }

  private ensureLoop(): void {
    if (this.timer) return;
    this.next = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      let n = 0;
      while (now >= this.next && n < 10) {
        this.room.step();
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
    if (url.pathname.endsWith("/stats")) return Response.json(this.room.stats());
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const conn: Conn = {
      send: (buf) => server.send(buf),
      close: (code, reason) => server.close(code, reason),
    };
    this.sockets++;
    this.room.onOpen(conn);
    server.addEventListener("message", (ev) => {
      if (ev.data instanceof ArrayBuffer) this.room.onMessage(conn, ev.data);
      else this.room.onMessage(conn, new ArrayBuffer(0));
    });
    const closed = () => {
      this.sockets = Math.max(0, this.sockets - 1);
      this.room.onClose(conn);
    };
    server.addEventListener("close", closed);
    server.addEventListener("error", closed);
    this.ensureLoop();
    return new Response(null, { status: 101, webSocket: client });
  }
}
