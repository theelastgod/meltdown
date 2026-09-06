/**
 * Local/dev host: one process, rooms keyed by URL path, plain `ws`.
 * Mirrors the Durable Object host's behaviour so probes run without wrangler.
 *
 *   npx tsx server/node-host.ts [port]
 *   GET  /stats              → JSON stats for every room
 *   GET  /file/<id>          → the Ghostfile (JSON)
 *   POST /file/<id>/buy      → { node } buys a Ledger Graph node with Scrip; /refund gives half back
 *   WS   /room/<name>[?lagcomp=0&ai=0&warmup=<s>&round=<s>&level=<id>&mode=run]
 *   WS   /campaign/<name>?mission=<id>   → a co-op contract (the mission runtime on the server)
 *   POST /file/<id>/campaign → { op: faction | complete | wear | state }
 *   POST /chain              → JSON-RPC to the in-process devnet (a real EVM; the contracts are deployed at boot)
 *   GET  /counter            → chain id, contract addresses, the market's listings, treasury figures
 *   POST /link/nonce | /link/verify | /file/<id>/counter → the counter-ledger (SIWE link, vouchers, rig)
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { Room, SERVER_TICK_MS, type Conn } from "./room";
import { devSeed, MemoryAccountStore } from "./accounts";
import { buyNode, recordGhost, refundNode, validGhost } from "../shared/progression/account";
import { campaignRequest } from "../shared/campaign/endpoint";
import { createCampaignRoom, type CampaignRoomHandle } from "./campaign-room";
import { MemoryEndgameStore, seasonView } from "./endgame";
import { currentAudit } from "../shared/endgame/audits";
import { contractsFor } from "../shared/endgame/contracts";
import { claimContract, dailyView } from "../shared/endgame/contracts";
import { dayIndex } from "../shared/endgame/clock";
import { buyCosmetic, rewrite, savePreset, setAlias, setTheme } from "../shared/endgame/rewrite";
import { bootDevnetLedger } from "./chain/boot";
import { counterRequest } from "../shared/economy/endpoint";
import type { Hex } from "viem";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const rooms = new Map<string, Room>();
/** One Ghostfile store for the whole host: "sandbox*" ids own every node, anything else starts Blank. */
const accounts = new MemoryAccountStore(devSeed);
/** Audit boards and the Deep Wake season, in memory */
const endgame = new MemoryEndgameStore();
const logs: string[] = [];
const log = (line: string) => {
  logs.push(`${new Date().toISOString()} ${line}`);
  if (logs.length > 500) logs.shift();
  if (process.env.VERBOSE) console.log(line);
};
/** The counter-ledger on an in-process devnet: a real EVM with the contracts deployed at boot and the market seeded. */
const counter = await bootDevnetLedger({ onLog: (l) => log(`[counter] ${l}`) });
const readBody = (req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}") as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });

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

function getRoom(name: string, lagComp: boolean, ai: boolean, warmupSeconds?: number, roundSeconds?: number, level?: string, audit = false, run = false): Room {
  let r = rooms.get(name);
  if (!r) {
    r = new Room({ lagComp, ai, seed: 7, accounts, warmupSeconds, roundSeconds, level, endgame, audit: audit ? { week: currentAudit().week, def: currentAudit().audit } : null, run, onLog: (l) => log(`[${name}] ${l}`) });
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
  if (req.method === "POST" && req.url === "/chain") {
    // the devnet's JSON-RPC: the panel's own transactions (market buys, name registration) go here
    void readBody(req).then(async (body) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(await counter.devnet.handle(Array.isArray(body) ? body : Object.keys(body).length ? body : [])));
    });
    return;
  }
  if (req.method === "POST" && req.url === "/chain/faucet") {
    // devnet only: gas for the wallet's own transactions (market buys, the name burn)
    void readBody(req).then(async (body) => {
      const address = String(body.address ?? "");
      res.setHeader("content-type", "application/json");
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        res.end(JSON.stringify({ ok: false, reason: "bad address" }));
        return;
      }
      await counter.devnet.fund(address as Hex);
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (req.method === "POST" && req.url === "/chain/outage") {
    // the "chain unreachable" drill: every RPC fails until it is switched back
    void readBody(req).then((body) => {
      counter.devnet.outage = !!body.on;
      log(`[counter] outage drill ${counter.devnet.outage ? "ON" : "OFF"}`);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, outage: counter.devnet.outage }));
    });
    return;
  }
  if (req.url === "/counter") {
    void (async () => {
      res.setHeader("content-type", "application/json");
      try {
        res.end(JSON.stringify({ ...counter.ledger.info(), rpc: `http://127.0.0.1:${port}/chain`, listings: await counter.ledger.listings(), treasury: await counter.ledger.treasury() }));
      } catch (e) {
        res.end(JSON.stringify({ ...counter.ledger.info(), rpc: `http://127.0.0.1:${port}/chain`, listings: [], treasury: null, reason: `CHAIN UNREACHABLE: ${String((e as Error).message).slice(0, 80)}` }));
      }
    })();
    return;
  }
  if (req.method === "POST" && (req.url === "/link/nonce" || req.url === "/link/verify")) {
    void readBody(req).then(async (body) => {
      res.setHeader("content-type", "application/json");
      const id = String(body.account ?? "").replace(/[^a-zA-Z0-9_:.-]/g, "").slice(0, 64);
      if (!id) {
        res.end(JSON.stringify({ ok: false, reason: "no account" }));
        return;
      }
      if (req.url === "/link/nonce") {
        res.end(JSON.stringify({ nonce: counter.ledger.nonce(id), statement: counter.ledger.info().statement, chainId: counter.ledger.info().chainId }));
        return;
      }
      const a = accounts.load(id, "BLANK");
      const r = await counter.ledger.link(a, String(body.message ?? ""), String(body.signature ?? "") as Hex);
      if (r.ok) accounts.save(a);
      log(`[counter] link ${id}: ${r.ok ? "ok" : r.reason}${r.ok && r.reason ? " (" + r.reason + ")" : ""}`);
      res.end(JSON.stringify({ ok: r.ok, reason: r.reason, counter: a.counter ?? null }));
    });
    return;
  }
  if (req.url?.startsWith("/endgame")) {
    const { week, audit } = currentAudit();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ day: dayIndex(), contracts: contractsFor(dayIndex()), audit: { week, ...audit }, board: endgame.audit(week), season: seasonView(endgame.season()) }));
    return;
  }
  const file = req.url?.match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})(\/(buy|refund|ghost|campaign|daily|claim|rewrite|cosmetic|counter))?$/);
  if (file) {
    const id = file[1]!;
    const name = "BLANK";
    if (req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(file[3] === "daily" ? dailyView(accounts.load(id, name)) : accounts.load(id, name)));
      return;
    }
    if (req.method === "POST" && file[3]) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let node = "";
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(body || "{}") as Record<string, unknown>;
          node = String((parsed as { node?: unknown }).node ?? "");
        } catch {
          node = "";
        }
        const a = accounts.load(id, name);
        if (file[3] === "counter") {
          // the counter-ledger: wear is cache-only; reconcile / stamps / name go to the chain and fail soft
          void counterRequest(a, parsed, counter.ledger).then((r) => {
            if (r.ok) accounts.save(a);
            log(`[counter] ${id} ${String((parsed as { op?: string }).op)}: ${r.ok ? "ok" : r.reason}`);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(r));
          });
          return;
        }
        if (file[3] === "claim" || file[3] === "rewrite" || file[3] === "cosmetic") {
          const body = parsed as { id?: string; op?: string; slot?: number; name?: string; loadout?: unknown; alias?: string };
          let r: { ok: boolean; reason?: string };
          if (file[3] === "claim") r = claimContract(a, String(body.id ?? ""));
          else if (file[3] === "rewrite") r = rewrite(a);
          else r = body.op === "buy" ? buyCosmetic(a, String(body.id ?? "")) : body.op === "theme" ? { ok: setTheme(a, body.id ? String(body.id) : null), reason: "not owned" } : body.op === "preset" ? savePreset(a, Number(body.slot ?? 0), String(body.name ?? ""), body.loadout) : body.op === "alias" ? setAlias(a, Number(body.slot ?? 0), String(body.alias ?? "")) : { ok: false, reason: "unknown op" };
          if (r.ok) accounts.save(a);
          log(`[file] ${id} ${file[3]} ${body.op ?? body.id ?? ""}: ${r.ok ? "ok" : r.reason}`);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ...r, account: a, daily: dailyView(a) }));
          return;
        }
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
          const run = validGhost((parsed as { run?: unknown }).run);
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
  const room = m[1] === "campaign" ? getCampaignRoom(m[2]!, url.searchParams.get("mission") ?? "g_escrow_row").room : getRoom(m[2]!, url.searchParams.get("lagcomp") !== "0", url.searchParams.get("ai") !== "0", num("warmup"), num("round"), url.searchParams.get("level") ?? undefined, url.searchParams.get("audit") === "1", url.searchParams.get("mode") === "run");
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
