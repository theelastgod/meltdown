/**
 * Local/dev host: one process, rooms keyed by URL path, plain `ws`.
 * Mirrors the Durable Object host's behaviour so probes run without wrangler.
 *
 *   npx tsx server/node-host.ts [port]
 *   GET  /stats              → JSON stats for every room
 *   GET  /file/<id>          → the Ghostfile (JSON)
 *   POST /file/<id>/buy      → { node } buys a Ledger Graph node with Scrip; /refund gives half back
 *   WS   /room/<name>[?lagcomp=0&ai=0&warmup=<s>&round=<s>&level=<id>]
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { Room, SERVER_TICK_MS, type Conn } from "./room";
import { devSeed, MemoryAccountStore } from "./accounts";
import { buyNode, refundNode } from "../shared/progression/account";

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
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const file = req.url?.match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})(\/(buy|refund))?$/);
  if (file) {
    const id = file[1]!;
    const name = "BLANK";
    if (req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(accounts.load(id, name)));
      return;
    }
    if (req.method === "POST" && file[3]) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let node = "";
        try {
          node = String((JSON.parse(body || "{}") as { node?: string }).node ?? "");
        } catch {
          node = "";
        }
        const a = accounts.load(id, name);
        const r = file[3] === "buy" ? buyNode(a, node) : refundNode(a, node);
        if (r.ok) accounts.save(a);
        log(`[file] ${id} ${file[3]} ${node}: ${r.ok ? "ok" : r.reason}`);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: r.ok, reason: r.reason, account: a }));
      });
      return;
    }
  }
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
