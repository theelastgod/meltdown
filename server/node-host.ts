/**
 * Local/dev host: one process, rooms keyed by URL path, plain `ws`.
 * Mirrors the Durable Object host's behaviour so probes run without wrangler.
 *
 *   npx tsx server/node-host.ts [port]
 *   GET  /stats              → JSON stats for every room
 *   WS   /room/<name>[?lagcomp=0&ai=0&warmup=<s>&round=<s>&level=<id>]
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { Room, SERVER_TICK_MS, type Conn } from "./room";
import { devSeed, MemoryAccountStore } from "./accounts";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const rooms = new Map<string, Room>();
/** One Ghostfile store for the whole host: "sandbox*" ids own every node, anything else starts Blank. */
const accounts = new MemoryAccountStore(devSeed);
const logs: string[] = [];
const log = (line: string) => {
  logs.push(`${new Date().toISOString()} ${line}`);
  if (logs.length > 500) logs.shift();
  if (process.env.VERBOSE) console.log(line);
};

function getRoom(name: string, lagComp: boolean, ai: boolean, warmupSeconds?: number, roundSeconds?: number, level?: string): Room {
  let r = rooms.get(name);
  if (!r) {
    r = new Room({ lagComp, ai, seed: 7, accounts, warmupSeconds, roundSeconds, level, onLog: (l) => log(`[${name}] ${l}`) });
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
    const files: Record<string, unknown> = {};
    for (const [id, a] of accounts.accounts) files[id] = { depth: a.depth, xp: a.xp, scrip: a.wallet.scrip, matches: a.matches, ledger: a.ledger.slice(-8) };
    res.end(JSON.stringify({ rooms: out, files, saves: accounts.saves, logs: logs.slice(-60) }));
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
  const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
  const room = getRoom(m[1]!, url.searchParams.get("lagcomp") !== "0", url.searchParams.get("ai") !== "0", num("warmup"), num("round"), url.searchParams.get("level") ?? undefined);
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
