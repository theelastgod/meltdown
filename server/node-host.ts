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
import { describe, observe } from "../shared/economy/telemetry";
import { DOC_POPULATION, observedPopulation, summarise } from "../shared/economy/model";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { Room, SERVER_TICK_MS, type Conn } from "./room";
import { devSeed, MemoryAccountStore } from "./accounts";
import { buyNode, fileAuth, publicFile, publicLabel, recordGhost, refundNode, validGhost } from "../shared/progression/account";
import { NOT_YOURS } from "./player-do";
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
import { auditPrizes, seasonPrizes } from "../shared/economy/prizes";
import { settleRunDay } from "./chain/settle-run";
import { reconcileRunDay } from "./chain/reconcile-run";
import { isPrivateRoom, makeInviteCode, privateRoomName, sanitiseRules, validInviteCode, type PrivateRules } from "../shared/net/private";
import { MemoryRunStore } from "./run-store";

import { MAX_PLAYERS_PER_ROOM, inputClassOf, matchRoomName } from "../shared/net/matchmaking";
import type { Hex } from "viem";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const rooms = new Map<string, Room>();
/**
 * Private rooms bought with a room-hour (Stage 20), by invite code. The code is the whole access
 * control — the room name is derived from it, so a room cannot be guessed into — and the entry is
 * what the WebSocket upgrade reads to build the room with the buyer's rules.
 */
const privateRooms = new Map<string, { rules: PrivateRules; owner: string; wallet: string; openedAt: number; expiresAt: number }>();
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
/** Per-file rate limit on the counter-ledger endpoints: a chain write is not free, and a script should not spin them. */
const rateWindows = new Map<string, { at: number; n: number }>();
export const RATE_PER_MINUTE = 30;
function rateOk(id: string, now = Date.now()): boolean {
  const w = rateWindows.get(id);
  if (!w || now - w.at > 60_000) {
    rateWindows.set(id, { at: now, n: 1 });
    return true;
  }
  w.n++;
  return w.n <= RATE_PER_MINUTE;
}
/** The counter-ledger on an in-process devnet: a real EVM with the contracts deployed at boot and the market seeded. */
/** the day's banking, for the nightly settlement (the Workers keep it in D1) */
const runs = new MemoryRunStore();
const counter = await bootDevnetLedger({ runs, onLog: (l) => log(`[counter] ${l}`) });
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

/**
 * How many live sockets each room has, so an empty one can stop simulating.
 *
 * The Worker host has stopped idle rooms since Stage 13; this one never did, and every room it had
 * ever created kept stepping at 60 Hz for the life of the process. probe:harden fills a room to the
 * cap of eight to test matchmaking and then closes those sockets — but the room went on simulating
 * eight players, its wasps and its mechs for the rest of the probe. Its own host log gives it away:
 * forty seconds after the sockets closed, `[neochina-lease_row]` is still logging wasp kills and
 * respawns while the next check waits for a client to sync in a different room.
 *
 * On a CI runner sharing two cores with two software-GL browsers that is not free, and probe:harden
 * timed out there twice — once with a socket that never finished connecting, once with a client that
 * joined and never received a snapshot. Both are what starvation looks like from the outside.
 */
const roomSockets = new Map<Room, number>();
const roomIdleSince = new Map<Room, number>();
const IDLE_STOP_MS = 10_000;

/** fixed-rate loop with drift correction; parks itself once a room has been empty for IDLE_STOP_MS */
function startLoop(room: Room): void {
  if (roomIdleSince.get(room) === -1) return; // already looping
  roomIdleSince.set(room, -1);
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
    // park an empty room rather than tick it forever; its state stays for a rejoin, and the next
    // connection starts the loop again from wherever the clock is now
    if ((roomSockets.get(room) ?? 0) === 0) {
      const since = roomIdleSince.get(room) ?? -1;
      if (since === -1) roomIdleSince.set(room, now);
      else if (now - since > IDLE_STOP_MS) {
        roomIdleSince.delete(room);
        return;
      }
    } else roomIdleSince.set(room, -1);
    setTimeout(loop, Math.max(0, next - performance.now()));
  };
  setTimeout(loop, 0);
}

/** A socket opened on a room: count it and make sure the room is stepping. */
function roomAttach(room: Room): void {
  roomSockets.set(room, (roomSockets.get(room) ?? 0) + 1);
  if (!roomIdleSince.has(room)) startLoop(room); // it had parked itself
}

function roomDetach(room: Room): void {
  roomSockets.set(room, Math.max(0, (roomSockets.get(room) ?? 0) - 1));
}

function getRoom(name: string, lagComp: boolean, ai: boolean, warmupSeconds?: number, roundSeconds?: number, level?: string, audit = false, run = false): Room {
  let r = rooms.get(name);
  if (!r) {
    // a private room takes its settings from what its buyer paid for, and mints nothing
    const priv = isPrivateRoom(name) ? privateRooms.get(name.slice(5).toUpperCase()) : undefined;
    r = priv
      ? new Room({ lagComp, ai: priv.rules.ai, seed: 7, accounts, warmupSeconds: priv.rules.warmupSeconds, roundSeconds: priv.rules.roundSeconds, level: priv.rules.district, endgame, audit: null, run: priv.rules.mode === "run", private: true, onLog: (l) => log(`[${name}] ${l}`) })
      : new Room({ lagComp, ai, seed: 7, accounts, warmupSeconds, roundSeconds, level, endgame, audit: audit ? { week: currentAudit().week, def: currentAudit().audit } : null, run, onRunBank: (day, file, units) => void runs.add(day, file, units), onActive: (day, file, eligible) => void runs.seen(day, file, eligible), onLog: (l) => log(`[${name}] ${l}`) });
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
  if (req.url === "/prizes") {
    // every posted epoch (the leaves name files, not wallets, so the board can read it)
    void (async () => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ epochs: counter.prizes.list().map((e) => ({ epoch: e.epoch, kind: e.kind, period: e.period, total: e.total, postedAt: e.postedAt, leaves: e.leaves.map((l) => ({ file: publicLabel(l.file), amount: l.amount, reason: l.reason })) })) }));
    })();
    return;
  }
  if (req.method === "POST" && req.url === "/prizes/post") {
    // the weekly / season-end / nightly job, callable by hand on the dev host:
    // { kind: "audit", week } | { kind: "season" } | { kind: "run", day }
    // { kind: "reconcile", day, fix } | { kind: "reclaim", epoch }
    void readBody(req).then(async (body) => {
      res.setHeader("content-type", "application/json");
      const kind = body.kind === "season" ? "season" : body.kind === "run" ? "run" : body.kind === "reconcile" ? "reconcile" : body.kind === "reclaim" ? "reclaim" : "audit";
      // THE RUN settles a day: the units every file banked that day, priced pro rata out of the day's
      // slice of the emission schedule. Gathered from the dev host's account map; a production host
      // reads them from its counter-ledger index.
      if (kind === "run") {
        const day = Number(body.day ?? dayIndex(Date.now()) - 1);
        const r = await settleRunDay(day, { ledger: counter.ledger, runs, load: (id) => accounts.load(id, "BLANK"), save: (a) => accounts.save(a), log });
        res.end(JSON.stringify(r));
        return;
      }
      if (kind === "reconcile") {
        // the two records THE RUN keeps, compared: `?fix=1` repairs, otherwise it only reports
        const day = Number(body.day ?? dayIndex(Date.now()) - 1);
        const r = await reconcileRunDay(day, { ledger: counter.ledger, runs, wallets: counter.wallets, load: (id) => accounts.load(id, "BLANK"), save: (a) => accounts.save(a), log }, { fix: body.fix === true });
        res.end(JSON.stringify(r));
        return;
      }
      if (kind === "reclaim") {
        // sweep an epoch nobody claimed; the vault refuses until its own deadline has passed
        const id = Number(body.epoch ?? 0);
        res.end(JSON.stringify(await counter.ledger.reclaimEpoch(id)));
        return;
      }
      const period = kind === "audit" ? Number(body.week ?? currentAudit().week) : endgame.season().season;
      const lines = kind === "audit" ? auditPrizes(endgame.audit(period)) : seasonPrizes(endgame.season().contributors ?? {});
      const r = await counter.ledger.postEpoch(kind, period, lines);
      log(`[prizes] post ${kind} ${period}: ${r.ok ? `${r.epoch?.leaves.length} leaves` : r.reason}${r.skipped?.length ? ` · no wallet: ${r.skipped.join(", ")}` : ""}`);
      res.end(JSON.stringify({ ok: r.ok, reason: r.reason, epoch: r.epoch ? { epoch: r.epoch.epoch, root: r.epoch.root, total: r.epoch.total, leaves: r.epoch.leaves.map((l) => ({ file: publicLabel(l.file), amount: l.amount, reason: l.reason })) } : null, skipped: r.skipped ?? [], lines }));
    });
    return;
  }
  if (req.method === "POST" && req.url === "/rooms/open") {
    /**
     * Open a private room against a room-hour (Stage 19's `RoomCredits`).
     *
     * The credit is spent on chain *before* the room exists. The other order — open it, then bill —
     * gives away a room for free whenever the spend reverts, and a room-hour is a real burn, so it
     * has to be the thing that gates the door rather than a receipt filed after it.
     */
    void readBody(req).then(async (body) => {
      res.setHeader("content-type", "application/json");
      const id = String(body.account ?? "");
      const a = id ? accounts.load(id, "BLANK") : null;
      // this spends the file's room-hours, which are a real on-chain burn, so it needs the file
      // (Stage 29 — it is not under /file/, so the Stage 26 sweep never reached it). It is checked
      // before anything else the route knows about the file: whether a wallet is linked is the
      // file's own business, and answering that to a bare id is answering it to anyone.
      if (!a || !fileAuth(a, String(body.secret ?? "")).ok) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ ok: false, reason: NOT_YOURS }));
      }
      accounts.save(a); // an adopted secret is kept
      const wallet = a.counter?.address;
      if (!wallet) return res.end(JSON.stringify({ ok: false, reason: "link a wallet first: a private room is bought, not requested" }));
      const rules = sanitiseRules(body.rules as Partial<PrivateRules>);
      const hours = Math.max(1, Math.min(24, Math.round(Number(body.hours ?? 1)) || 1));
      const code = makeInviteCode();
      const spent = await counter.ledger.spendRoomHours(a, hours, privateRoomName(code));
      if (!spent.ok) return res.end(JSON.stringify({ ok: false, reason: spent.reason }));
      const now = Date.now();
      privateRooms.set(code, { rules, owner: a.id, wallet, openedAt: now, expiresAt: now + hours * 3_600_000 });
      const name = privateRoomName(code);
      log(`[rooms] ${a.id} opened ${name} for ${hours}h · ${rules.mode} ${rules.district} ${rules.roundSeconds}s`);
      res.end(JSON.stringify({ ok: true, code, room: name, hours, rules, expiresAt: now + hours * 3_600_000, url: `ws://127.0.0.1:${port}/room/${name}?code=${code}`, join: `?net=${encodeURIComponent(`ws://127.0.0.1:${port}/room/${name}?code=${code}`)}` }));
    });
    return;
  }
  if (req.url?.startsWith("/rooms/")) {
    // what a code opens, for the client's join screen. Never lists them: a code is the access control.
    const code = decodeURIComponent(req.url.slice(7)).split("?")[0]!.toUpperCase();
    res.setHeader("content-type", "application/json");
    const p = validInviteCode(code) ? privateRooms.get(code) : undefined;
    if (!p || p.expiresAt < Date.now()) {
      res.end(JSON.stringify({ ok: false, reason: "no such room, or the hours ran out" }));
      return;
    }
    res.end(JSON.stringify({ ok: true, code, room: privateRoomName(code), rules: p.rules, expiresAt: p.expiresAt, players: rooms.get(privateRoomName(code))?.stats().players ?? 0, url: `ws://127.0.0.1:${port}/room/${privateRoomName(code)}?code=${code}` }));
    return;
  }
  if (req.url?.startsWith("/match")) {
    // matchmaking: the public room for a district and a mode that still has room, sharded by fill
    const u = new URL(req.url, "http://x");
    const district = (u.searchParams.get("district") ?? "lease_row").replace(/[^a-z_]/g, "");
    const mode = u.searchParams.get("mode") === "run" ? "run" : "wake";
    // a thumb and a mouse do not share a room that pays (Stage 34)
    const input = inputClassOf(u.searchParams.get("input"));
    const mix = process.env.MATCH_MIX_INPUTS === "1";
    let shard = 0;
    while (shard < 64) {
      const name = matchRoomName("neochina", district, mode, shard, input, mix);
      const r = rooms.get(name);
      if (!r || r.stats().players < MAX_PLAYERS_PER_ROOM) break;
      shard++;
    }
    const name = matchRoomName("neochina", district, mode, shard, input, mix);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ room: name, district, mode, input, players: rooms.get(name)?.stats().players ?? 0, max: MAX_PLAYERS_PER_ROOM, url: `ws://127.0.0.1:${port}/room/${name}?level=${district}${mode === "run" ? "&mode=run" : ""}` }));
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
      if (!rateOk(id)) {
        res.statusCode = 429;
        res.end(JSON.stringify({ ok: false, reason: "RATE LIMITED: the counter-ledger takes 30 requests a minute per file" }));
        return;
      }
      const a = accounts.load(id, "BLANK");
      // linking binds a wallet to a file for good; the SIWE signature proves the wallet, and this
      // proves the file (Stage 28)
      if (!fileAuth(a, String(body.secret ?? "")).ok) {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, reason: NOT_YOURS, counter: a.counter ?? null }));
        return;
      }
      accounts.save(a); // an adopted secret is kept
      const r = await counter.ledger.link(a, String(body.message ?? ""), String(body.signature ?? "") as Hex);
      if (r.ok) accounts.save(a);
      log(`[counter] link ${id}: ${r.ok ? "ok" : r.reason}${r.ok && r.reason ? " (" + r.reason + ")" : ""}`);
      res.end(JSON.stringify({ ok: r.ok, reason: r.reason, counter: a.counter ?? null }));
    });
    return;
  }
  if (req.url?.startsWith("/economy")) {
    /**
     * What the projection is actually standing on (Stage 38).
     *
     * `capUse` and `runnerShare` have been documented as guesses since Stage 19. This reads them
     * back off the recorded days and says, in the same breath, which of the two the sample is big
     * enough to have measured — an operator should never have to guess whether a number in the
     * projection came from the game or from a spreadsheet.
     */
    const today = dayIndex();
    const window = Number(new URL(req.url, "http://x").searchParams.get("days") ?? 30);
    const stats = Array.from({ length: Math.max(1, Math.min(365, window)) }, (_, i) => runs.stat(today - i));
    const o = observe(stats);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ observed: o, note: describe(o), projection: summarise(observedPopulation(DOC_POPULATION, o), o) }));
    return;
  }
  if (req.url?.startsWith("/endgame")) {
    const { week, audit } = currentAudit();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ day: dayIndex(), contracts: contractsFor(dayIndex()), audit: { week, ...audit }, board: endgame.audit(week), season: seasonView(endgame.season()) }));
    return;
  }
  const file = (() => {
    try {
      return decodeURIComponent(req.url ?? "").match(/^\/file\/([a-zA-Z0-9_:.-]{1,64})(\/(buy|refund|ghost|campaign|daily|claim|rewrite|cosmetic|counter))?$/);
    } catch {
      return null;
    }
  })();
  if (file) {
    const id = file[1]!;
    const name = "BLANK";
    if (req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(file[3] === "daily" ? dailyView(accounts.load(id, name)) : publicFile(accounts.load(id, name))));
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
        // Every POST to a file mutates it, so every POST must prove it speaks for the file. The id
        // alone used to be enough, and the id is published — see docs/SECURITY.md §1.9.
        if (!fileAuth(a, String((parsed as { secret?: unknown }).secret ?? "")).ok) {
          res.statusCode = 403;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, reason: NOT_YOURS }));
          return;
        }
        accounts.save(a); // an adopted secret is kept
        if (file[3] === "counter") {
          if (!rateOk(id)) {
            res.statusCode = 429;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false, reason: "RATE LIMITED: the counter-ledger takes 30 requests a minute per file", counter: a.counter ?? null }));
            return;
          }
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
          res.end(JSON.stringify({ ...r, account: publicFile(a), daily: dailyView(a) }));
          return;
        }
        if (file[3] === "campaign") {
          // the campaign save: faction, contract completions (rewards), worn protocols — never the match room's business
          // the dev host trusts a claimed completion so a probe can reach a late arc state without
          // playing seven missions — the same dev-only affordance as /chain/faucet. The Worker does not.
          const r = campaignRequest(a, parsed, { trustCompletion: true });
          if (r.ok) accounts.save(a);
          log(`[file] ${id} campaign ${String((parsed as { op?: string }).op)}: ${r.ok ? "ok" : r.reason}`);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ...r, account: publicFile(a) }));
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
        res.end(JSON.stringify({ ok: r.ok, reason: r.reason, account: publicFile(a) }));
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
  // a private room's door: the code, the room it names, and the hours still on it
  if (m[1] === "room" && isPrivateRoom(m[2]!)) {
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    const p = validInviteCode(code) ? privateRooms.get(code) : undefined;
    if (!p || privateRoomName(code) !== m[2]) {
      ws.close(4003, "this room takes an invite code");
      return;
    }
    if (p.expiresAt < Date.now()) {
      privateRooms.delete(code);
      rooms.delete(m[2]!);
      ws.close(4003, "the room-hours ran out");
      return;
    }
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
  roomAttach(room);
  room.onOpen(conn);
  ws.on("message", (data) => {
    const buf = data instanceof ArrayBuffer ? data : Array.isArray(data) ? Buffer.concat(data).buffer : new Uint8Array(data as Buffer).slice().buffer;
    room.onMessage(conn, buf as ArrayBuffer);
  });
  // once per socket however it ends, so the room's count cannot drift below its real occupancy
  let gone = false;
  const closed = () => {
    if (gone) return;
    gone = true;
    roomDetach(room);
    room.onClose(conn);
  };
  ws.on("close", closed);
  ws.on("error", closed);
});

http.listen(port, "127.0.0.1", () => console.log(`meltdown node host listening on ws://127.0.0.1:${port}/room/<name>`));
