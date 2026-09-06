/**
 * Local/dev host: one process, rooms keyed by URL path, plain `ws`.
 * Mirrors the Durable Object host's behaviour so probes run without wrangler.
 *
 *   npx tsx server/node-host.ts [port]
 *   GET  /stats              → JSON stats for every room
 *   GET  /file/<id>          → the Ghostfile (JSON)
 *   POST /file/<id>/buy      → { node } buys a Ledger Graph node with Scrip; /refund gives half back
 *   WS   /room/<name>[?lagcomp=0&ai=0&warmup=<s>&round=<s>&level=<id>]
 *   WS   /campaign/<name>?mission=<id>   → a co-op contract (the mission runtime on the server)
 *   POST /file/<id>/campaign → { op: faction | complete | wear | state }
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { Room, SERVER_TICK_MS, type Conn } from "./room";
import { devSeed, MemoryAccountStore } from "./accounts";
import { buyNode, recordGhost, refundNode, validGhost } from "../shared/progression/account";
import { campaignRequest } from "../shared/campaign/endpoint";
import { createCampaignRoom, type CampaignRoomHandle } from "./campaign-room";

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

/** fixed-rate loop with drift correction */
function startLoop(room: Room): void {
  let next = performance.now();
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

function getRoom(name: string, lagComp: boolean, ai: boolean, warmupSeconds?: number, roundSeconds?: number, level?: string): Room {
  let r = rooms.get(name);
  if (!r) {
    r = new Room({ lagComp, ai, seed: 7, accounts, warmupSeconds, roundSeconds, level, onLog: (l) => log(`[${name}] ${l}`) });
    rooms.set(name, r);
    startLoop(r);
  }
  return r;
}

const campaigns = new Map<string, CampaignRoomHandle>();
function getCampaignRoom(name: string, mission: string): CampaignRoomHandle {
  let h = campaigns.get(name);
  if (!h) {
    h = createCampaignRoom({ lagComp: true, seed: 7, accounts, mission, onLog: (l) => log(`[campaign ${name}] ${l}`) });
    campaigns.set(name, h);
    startLoop(h.room);
  }
  return h;
}

const http = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const file = req.url?.match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})(\/(buy|refund|ghost|campaign))?$/);
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
        let parsed: { node?: string; run?: unknown; op?: string } = {};
        try {
          parsed = JSON.parse(body || "{}") as { node?: string; run?: unknown; op?: string };
          node = String(parsed.node ?? "");
        } catch {
          node = "";
        }
        const a = accounts.load(id, name);
        if (file[3] === "campaign") {
          // the campaign save: faction, contract completions (rewards), worn protocols — never the match room's business
          const r = campaignRequest(a, parsed);
          if (r.ok) accounts.save(a);
          log(`[file] ${id} campaign ${String((parsed as { op?: string }).op)}: ${r.ok ? "ok" : r.reason}`);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ...r, account: a }));
          return;
        }
        if (file[3] === "ghost") {
          // a range ghost: kept when it is the best run of its course; the client never reads anything mechanical back from it
          const run = validGhost(parsed.run);
          const ok = run ? recordGhost(a, run) : false;
          if (ok) accounts.save(a);
          log(`[file] ${id} ghost ${run ? run.level + " " + run.seconds.toFixed(2) + "s" : "malformed"}: ${ok ? "kept" : "not kept"}`);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok, reason: run ? undefined : "malformed run", ghost: run ? a.ghosts[run.level] ?? null : null }));
          return;
        }
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
    for (const [k, h] of campaigns) out[`campaign:${k}`] = { ...h.room.stats(), campaign: h.state() };
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
  const m = url.pathname.match(/^\/(room|campaign)\/([a-zA-Z0-9_-]{1,32})$/);
  if (!m) {
    ws.close(4000, "bad room");
    return;
  }
  const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
  const room = m[1] === "campaign" ? getCampaignRoom(m[2]!, url.searchParams.get("mission") ?? "g_escrow_row").room : getRoom(m[2]!, url.searchParams.get("lagcomp") !== "0", url.searchParams.get("ai") !== "0", num("warmup"), num("round"), url.searchParams.get("level") ?? undefined);
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
