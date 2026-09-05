/**
 * Local/dev host: one process, rooms keyed by URL path, plain `ws`.
 * Mirrors the Durable Object host's behaviour so probes run without wrangler.
 *
 *   npx tsx server/node-host.ts [port]
 *   GET  /stats              → JSON stats for every room
 *   WS   /room/<name>[?lagcomp=0]
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { Room, SERVER_TICK_MS, type Conn } from "./room";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const rooms = new Map<string, Room>();
const logs: string[] = [];
const log = (line: string) => {
  logs.push(`${new Date().toISOString()} ${line}`);
  if (logs.length > 500) logs.shift();
  if (process.env.VERBOSE) console.log(line);
};

function getRoom(name: string, lagComp: boolean): Room {
  let r = rooms.get(name);
  if (!r) {
    r = new Room({ lagComp, onLog: (l) => log(`[${name}] ${l}`) });
    rooms.set(name, r);
    // fixed-rate loop with drift correction
    let next = performance.now();
    const room = r;
    const loop = () => {
      const now = performance.now();
      let n = 0;
      while (now >= next && n < 10) {
        room.step();
        next += SERVER_TICK_MS;
        n++;
      }
      if (n === 10) next = now; // fell far behind: resync rather than spiral
      setTimeout(loop, Math.max(0, next - performance.now()));
    };
    setTimeout(loop, 0);
  }
  return r;
}

const http = createServer((req, res) => {
  if (req.url?.startsWith("/stats")) {
    const out: Record<string, unknown> = {};
    for (const [k, r] of rooms) out[k] = r.stats();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ rooms: out, logs: logs.slice(-60) }));
    return;
  }
  res.statusCode = 404;
  res.end("meltdown node host");
});

const wss = new WebSocketServer({ server: http });
wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url ?? "/", "http://x");
  const m = url.pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,32})$/);
  if (!m) {
    ws.close(4000, "bad room");
    return;
  }
  const room = getRoom(m[1]!, url.searchParams.get("lagcomp") !== "0");
  ws.binaryType = "arraybuffer";
  const conn: Conn = {
    send: (buf) => {
      if (ws.readyState === ws.OPEN) ws.send(buf);
    },
    close: (code, reason) => ws.close(code, reason),
  };
  room.onOpen(conn);
  ws.on("message", (data) => {
    const buf = data instanceof ArrayBuffer ? data : Array.isArray(data) ? Buffer.concat(data).buffer : new Uint8Array(data as Buffer).slice().buffer;
    room.onMessage(conn, buf as ArrayBuffer);
  });
  ws.on("close", () => room.onClose(conn));
  ws.on("error", () => room.onClose(conn));
});

http.listen(port, "127.0.0.1", () => console.log(`meltdown node host listening on ws://127.0.0.1:${port}/room/<name>`));
