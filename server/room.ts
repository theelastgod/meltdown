/**
 * Authoritative match room. Transport-agnostic: the Node host and the
 * Cloudflare Durable Object host both drive this class. One instance = one
 * match. Runs the shared simulation at SIM_HZ, validates every input, keeps a
 * pose history for lag-compensated hitscan, sends quantized delta snapshots,
 * and supports rejoin by token.
 */
import { SEASON_DEPTH } from "../shared/endgame/season";
import { encodeRun, type RunMsg } from "../shared/net/protocol";
import { RUN_DAILY_CAP, RUN_DEPTH, RUN_SCRIP_PER_UNIT, runView } from "../shared/sim/run";
import { dayIndex } from "../shared/endgame/clock";
import { SIM_HZ } from "../shared/sim/constants";
import { auditErrors, type AuditDef } from "../shared/endgame/audits";
import { itemById } from "../shared/manifest/items";
import type { EndgameStore } from "./endgame";
import type { House } from "../shared/endgame/season";
import { MAX_BUTTONS } from "../shared/sim/input";
import { levelById } from "../shared/sim/level";
import { World, type RewindPose, type SimEvent } from "../shared/sim/world";
import type { PlayerState } from "../shared/sim/player";
import {
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY,
  MAX_REWIND_TICKS,
  MAX_INPUT_QUEUE,
  decodeClientMessage,
  encodeFile,
  encodeKick,
  type FileMsg,
  encodePong,
  encodeSnapshot,
  encodeWelcome,
  quantizeRemote,
  stanceToNum,
  ENT_CLOUD,
  ENT_MECH,
  ENT_PROJECTILE,
  ENT_WASP,
  ENT_NODE,
  FX,
  WEAPON_WIRE,
  type NetEntity,
  type NetEvent,
  type NetInput,
  type Snapshot, encodeSocial, type DossierEntry, type SocialMsg } from "../shared/net/protocol";
import { DEFAULT_LOADOUT, validateLoadout, type Loadout, stripCampaignFields } from "../shared/manifest/loadout";
import { applyMatch, ranksOf, type Account } from "../shared/progression/account";
import { ProgressionTracker, type ProgressNote } from "./progression";
import { assertClean, displayName, identityTag, publicIdentity, type PublicIdentity } from "../shared/identity/identity";
import { CHAPTERS, chapterFor, unlockedMonikers, wornMoniker } from "../shared/identity/monikers";
import { glyphSeed } from "../shared/identity/glyph";
import type { AccountStore } from "./accounts";
import type { PlayerStats } from "../shared/sim/player";

export interface Conn {
  send(buf: ArrayBuffer): void;
  close(code: number, reason: string): void;
}

interface ClientRec {
  conn: Conn | null;
  playerId: number;
  token: string;
  name: string;
  joined: boolean;
  queue: NetInput[];
  lastSeq: number;
  lastAppliedSeq: number;
  ackTick: number;
  strikes: number;
  strikeWindowStart: number;
  inputWindowStart: number;
  inputCount: number;
  /** unspent input credits: one accrues per sim tick, capped at INPUT_BURST_CREDITS */
  credits: number;
  /** inputs held back this session because the client outran the sim */
  throttled: number;
  disconnectedAt: number;
  pendingEvents: NetEvent[];
  sent: Map<number, Snapshot>;
  bytesOut: number;
  traceMaxErr: number;
  traceSamples: number;
  inputsApplied: number;
  inputsRejected: number;
  /** Trace comparison is skipped until this seq after a server-driven respawn. */
  traceSkipUntilSeq: number;
  /** The Ghostfile this connection plays as (null for a guest without a store). */
  account: Account | null;
  loadout: Loadout;
  /** Stats at the start of the current round; settlement credits the delta. */
  roundBase: PlayerStats;
  roundStartTick: number;
  settlements: number;
  /** XP of the last settlement (an Audit's score) */
  lastSettleXp: number;
  /** flips at the last settlement (the season's per-file contribution is the delta) */
  lastRoundFlips: number;
  progress: ProgressionTracker;
  /** what others see of this file (Stage 8); refreshed at join, round start and settlement */
  identity: PublicIdentity;
  /** this round: killer playerId → kills on me (feeds the Debt at settlement) */
  killedBy: Map<number, number>;
  /** playerId in this room of the file I owe a Debt to (−1 none) */
  debtTargetId: number;
  debtClearedThisRound: boolean;
}

/** Hooks a host may attach to run a mode on top of the room without the room importing it (the campaign co-op room). */
export interface RoomHooks {
  /** after every tick, with the tick's sim events */
  afterStep?: (room: Room, events: readonly SimEvent[]) => void;
  /** a client was admitted (its player exists) */
  onAdmit?: (room: Room, playerId: number, account: Account | null) => void;
  /** a client message the room does not handle itself */
  onClientMessage?: (room: Room, playerId: number, msg: { type: "choice"; script: string; testimony: Record<string, string> }) => void;
}

export interface RoomOptions {
  hooks?: RoomHooks;
  /** an Audit playlist: symmetric rules for every file in the room, scored to the week's leaderboard */
  audit?: { week: number; def: AuditDef } | null;
  /** Audit leaderboards and the Deep Wake season (settlement pushes into it) */
  endgame?: EndgameStore | null;
  /** THE RUN (Stage 14): claims, safe zones, banking; the room credits the file per bank and the counter-ledger pays the wallet */
  run?: boolean;
  /** "warmup" (the wake) or "off" (a campaign contract) */
  wakePhase?: "warmup" | "off";
  dummyRespawn?: boolean;
  lagComp?: boolean;
  ai?: boolean;
  seed?: number;
  maxPlayers?: number;
  /** Seconds a disconnected player is kept for rejoin. */
  rejoinGraceSeconds?: number;
  now?: () => number;
  onLog?: (line: string) => void;
  /** Ghostfile store; joins validate their loadout against it and results settle into it. */
  accounts?: AccountStore | null;
  warmupSeconds?: number;
  roundSeconds?: number;
  /** Level id (shared/sim/level.ts registry); unknown ids fall back to the default district. */
  level?: string;
}

export interface RoomStats {
  tick: number;
  level: string;
  players: number;
  connected: number;
  tickHz: number;
  avgTickMs: number;
  maxTickMs: number;
  kicks: number;
  inputsRejected: number;
  bytesOut: number;
  clients: { id: number; name: string; connected: boolean; traceMaxErr: number; traceSamples: number; throttled: number; inputsApplied: number; inputsRejected: number; kills: number; deaths: number; shots: number; hits: number; queue: number; flips: number; nodeSeconds: number; support: number; file: { account: string; depth: number; xp: number; scrip: number; settlements: number; stamps: number; ranks: Record<string, number> } | null; loadout: Loadout; identity: { display: string; chapter: number; moniker: string | null; debt: string | null; debtTarget: number; wakelight: number; chapters: number[] } }[];
  settlements: number;
  /** social messages sent, by kind (dossier / debt / rite) */
  social: Record<string, number>;
  campaignStripped: number;
  audit: { id: string; week: number; scores: number[] } | null;
  /** THE RUN (Stage 14) */
  run: { totalBanked: number; claims: number; carried: Record<string, number>; banked: Record<string, number>; credits: string[] } | null;
  seasonLast: string | null;
  loadoutRejections: string[];
  shotDiag: Record<string, number>;
  traceLog: unknown[];
  match: unknown;
}

const MAX_INPUTS_PER_TICK = 6;
const MAX_INPUT_RATE_PER_SEC = 95;
/**
 * A client may only ever spend as many inputs as the sim has ticked. Every input is a full
 * `stepPlayer` at SIM_DT, so a client allowed to spend more inputs than ticks simply moves and
 * shoots faster than everyone else — a speed hack that needs no modified physics, just a faster
 * send loop. Credits accrue one per tick and cap at a short burst, so a hitching client still
 * catches up while a flooder cannot outrun the clock.
 */
export const INPUT_BURST_CREDITS = 12;
const MAX_STRIKES = 3;

export class Room {
  readonly world: World;
  readonly opts: Required<RoomOptions>;
  private clients = new Map<number, ClientRec>();
  private byConn = new Map<Conn, ClientRec>();
  private history = new Map<number, Map<number, RewindPose>>();
  private nextId = 1;
  private tickTimes: number[] = [];
  private tickCount = 0;
  private startedAt: number;
  private lastRateAt: number;
  private lastRateTick = 0;
  private tickHz = 0;
  kicks = 0;
  settlements = 0;
  /** Reasons of every loadout refused at join (probes assert on these). */
  readonly loadoutRejections: string[] = [];
  private pendingJoins = new Set<Conn>();
  /** Last few large prediction/server divergences, for diagnosis. */
  readonly traceLog: { tick: number; id: number; seq: number; err: number; batch: number; queue: number; alive: boolean; stance: string; srv: number[]; cli: number[]; buttons: number }[] = [];
  readonly shotDiag = { shots: 0, playerHits: 0, rewindSum: 0, rewindMax: 0, clamped: 0, nearMissSum: 0, nearMissN: 0, nearMissMax: 0 };

  constructor(opts: RoomOptions = {}) {
    this.opts = {
      lagComp: opts.lagComp ?? true,
      ai: opts.ai ?? true,
      seed: opts.seed ?? ((Date.now() >>> 0) ^ 0x5eed),
      maxPlayers: opts.maxPlayers ?? 8,
      rejoinGraceSeconds: opts.rejoinGraceSeconds ?? 60,
      now: opts.now ?? (() => Date.now()),
      onLog: opts.onLog ?? (() => {}),
      accounts: opts.accounts ?? null,
      warmupSeconds: opts.warmupSeconds ?? 20,
      roundSeconds: opts.roundSeconds ?? 360,
      level: opts.level ?? "",
      hooks: opts.hooks ?? {},
      audit: opts.audit ?? null,
      endgame: opts.endgame ?? null,
      run: opts.run ?? false,
      wakePhase: opts.wakePhase ?? "warmup",
      dummyRespawn: opts.dummyRespawn ?? true,
    };
    this.world = new World(levelById(this.opts.level || undefined), { run: !!opts.run, ai: this.opts.ai, seed: this.opts.seed, wakePhase: this.opts.wakePhase, warmupSeconds: this.opts.warmupSeconds, roundSeconds: this.opts.roundSeconds, dummyRespawn: this.opts.dummyRespawn });
    if (this.opts.audit) this.world.gravityMult = this.opts.audit.def.gravityMult;
    this.startedAt = this.opts.now();
    this.lastRateAt = this.startedAt;
  }

  get tick(): number {
    return this.world.tick;
  }

  // ---- connection lifecycle ----

  onOpen(_conn: Conn): void {
    // nothing until Join
  }

  onMessage(conn: Conn, buf: ArrayBuffer): void {
    const msg = decodeClientMessage(buf);
    const rec = this.byConn.get(conn);
    if (!msg) {
      if (rec) this.strike(rec, "malformed message");
      else this.kickConn(conn, "malformed message before join");
      return;
    }
    if (msg.type === "join") {
      if (rec) return this.strike(rec, "duplicate join");
      if (msg.version !== PROTOCOL_VERSION) return this.kickConn(conn, `protocol ${msg.version} != ${PROTOCOL_VERSION}`);
      this.join(conn, msg.name, msg.token, msg.account, msg.loadout, msg.identity);
      return;
    }
    if (!rec) return this.kickConn(conn, "message before join");
    if (msg.type === "choice") {
      this.opts.hooks?.onClientMessage?.(this, rec.playerId, msg);
      return;
    }
    if (msg.type === "ping") {
      conn.send(encodePong(msg.clientTime, this.tick));
      return;
    }
    // input batch
    rec.ackTick = Math.max(rec.ackTick, msg.ackTick);
    const now = this.opts.now();
    if (now - rec.inputWindowStart >= 1000) {
      rec.inputWindowStart = now;
      rec.inputCount = 0;
    }
    for (const i of msg.inputs) {
      if (i.seq <= rec.lastSeq) continue; // redundant resend, already have it
      if (i.seq !== rec.lastSeq + 1 && rec.lastSeq !== 0) {
        // gap: the missing inputs were lost in all redundant copies; accept and let the trace flag it
      }
      if (!this.validInput(i)) {
        rec.inputsRejected++;
        this.strike(rec, "invalid input");
        continue;
      }
      rec.inputCount++;
      if (rec.inputCount > MAX_INPUT_RATE_PER_SEC) {
        rec.inputsRejected++;
        this.strike(rec, "input rate");
        continue;
      }
      if (rec.queue.length >= MAX_INPUT_QUEUE) {
        // A hitching client (long frame → burst of inputs) is not a cheater: keep the newest,
        // drop the oldest; the sustained-rate check above catches real flooding.
        rec.queue.shift();
        rec.inputsRejected++;
      }
      rec.lastSeq = i.seq;
      rec.queue.push(i);
    }
  }

  onClose(conn: Conn): void {
    this.pendingJoins.delete(conn);
    const rec = this.byConn.get(conn);
    if (!rec) return;
    this.byConn.delete(conn);
    rec.conn = null;
    rec.disconnectedAt = this.opts.now();
    rec.queue.length = 0;
    this.opts.onLog(`player ${rec.playerId} (${rec.name}) disconnected; rejoin window ${this.opts.rejoinGraceSeconds}s`);
  }

  private validInput(i: NetInput): boolean {
    if (!Number.isFinite(i.yaw) || !Number.isFinite(i.pitch)) return false;
    if (Math.abs(i.pitch) > 1.6) return false;
    if (i.buttons < 0 || i.buttons > MAX_BUTTONS) return false;
    if (!Number.isFinite(i.px) || !Number.isFinite(i.py) || !Number.isFinite(i.pz)) return false;
    return true;
  }

  private strike(rec: ClientRec, why: string): void {
    const now = this.opts.now();
    if (now - rec.strikeWindowStart > 5000) {
      rec.strikeWindowStart = now;
      rec.strikes = 0;
    }
    rec.strikes++;
    this.opts.onLog(`strike ${rec.strikes}/${MAX_STRIKES} on player ${rec.playerId}: ${why}`);
    if (rec.strikes >= MAX_STRIKES) this.kick(rec, why);
  }

  private kick(rec: ClientRec, reason: string): void {
    this.kicks++;
    this.opts.onLog(`kick player ${rec.playerId}: ${reason}`);
    if (rec.conn) {
      try {
        rec.conn.send(encodeKick(reason));
        rec.conn.close(4001, reason.slice(0, 100));
      } catch {
        /* closed */
      }
      this.byConn.delete(rec.conn);
      rec.conn = null;
    }
    this.removePlayer(rec);
  }

  private kickConn(conn: Conn, reason: string): void {
    this.kicks++;
    this.opts.onLog(`kick connection: ${reason}`);
    try {
      conn.send(encodeKick(reason));
      conn.close(4001, reason.slice(0, 100));
    } catch {
      /* closed */
    }
  }

  private removePlayer(rec: ClientRec): void {
    this.clients.delete(rec.playerId);
    this.world.removePlayer(rec.playerId);
    for (const other of this.clients.values()) other.pendingEvents.push({ type: "leave", playerId: rec.playerId });
  }

  private join(conn: Conn, name: string, token: string, accountId: string, loadoutJson: string, identityJson = ""): void {
    const safeName = (name || "BLANK").replace(/[^\x20-\x7e]/g, "").slice(0, 16) || "BLANK";
    // rejoin by token
    if (token) {
      for (const rec of this.clients.values()) {
        if (rec.token === token && rec.conn === null) {
          rec.conn = conn;
          rec.queue.length = 0;
          rec.sent.clear();
          rec.ackTick = 0;
          rec.lastSeq = 0; // the client's sequence restarts with its new link
          rec.lastAppliedSeq = 0;
          rec.traceSkipUntilSeq = 0;
          rec.strikes = 0;
          this.byConn.set(conn, rec);
          conn.send(encodeWelcome(rec.playerId, this.tick, rec.token, this.world.level.name, this.world.seed, this.mode()));
          const note: ProgressNote = { stamps: [], ranks: [], challenges: [] };
          rec.progress.onRejoin(note);
          conn.send(encodeFile(this.fileMsg(rec, [], "join", note)));
          this.opts.onLog(`player ${rec.playerId} rejoined`);
          return;
        }
      }
    }
    if (this.clients.size + this.pendingJoins.size >= this.opts.maxPlayers) return this.kickConn(conn, "room full");
    const safeAccount = (accountId || "").replace(/[^a-zA-Z0-9_:.-]/g, "").slice(0, 64);
    if (!this.opts.accounts) return this.admit(conn, safeName, null, loadoutJson, identityJson);
    // A guest without a file id plays a fresh Blank file keyed to this link.
    const id = safeAccount || `guest:${this.nextId}:${Math.random().toString(36).slice(2, 8)}`;
    const loaded = this.opts.accounts.load(id, safeName);
    if (loaded instanceof Promise) {
      this.pendingJoins.add(conn);
      loaded.then(
        (acc) => {
          if (!this.pendingJoins.delete(conn)) return; // closed while loading
          this.admit(conn, safeName, acc, loadoutJson, identityJson);
        },
        (err) => {
          this.pendingJoins.delete(conn);
          this.kickConn(conn, `FILE UNAVAILABLE: ${String(err)}`);
        },
      );
    } else this.admit(conn, safeName, loaded, loadoutJson, identityJson);
  }

  /** Validate the claimed loadout against the file, then spawn. Illegal loadouts are refused, never stripped. */
  private admit(conn: Conn, safeName: string, account: Account | null, loadoutJson: string, identityJson = ""): void {
    // a file first touched by a ledger endpoint (the FILE panel loads before the join) is a placeholder BLANK: the join names it
    if (account && (!account.name || account.name === "BLANK") && safeName !== "BLANK") account.name = safeName;
    // identity: an equipped moniker is worn only if earned; anything else is ignored, never a kick
    if (account && identityJson) {
      try {
        const req = (JSON.parse(identityJson) as { moniker?: unknown }).moniker;
        if (typeof req === "string" || req === null) account.moniker = wornMoniker(account, req)?.id ?? null;
      } catch {
        /* malformed identity: keep the file's own */
      }
    }
    let raw: unknown = DEFAULT_LOADOUT;
    if (loadoutJson) {
      try {
        raw = JSON.parse(loadoutJson);
      } catch {
        return this.rejectLoadout(conn, "unparseable: loadout is not JSON");
      }
    }
    // campaign-only power never enters a PvP room: strip it, then validate what is left like any other loadout
    const strip = stripCampaignFields(raw);
    raw = strip.raw;
    if (strip.stripped.length) {
      this.campaignStripped += strip.stripped.length;
      this.opts.onLog(`stripped campaign fields [${strip.stripped.join(", ")}] from ${safeName}'s loadout at join`);
    }
    const owned = account?.owned ?? [];
    const depth = account?.depth ?? 1;
    const v = validateLoadout(raw, owned, depth, account ? ranksOf(account) : {});
    if (!v.ok) return this.rejectLoadout(conn, v.errors.map((e) => `${e.rule}: ${e.detail}`).join("; "));
    if (this.opts.audit) {
      const ae = auditErrors(v.loadout, this.opts.audit.def, (id) => itemById(id)?.ring);
      if (ae.length) return this.rejectLoadout(conn, ae.map((e) => `${e.rule}: ${e.detail}`).join("; "));
    }
    if (this.clients.size >= this.opts.maxPlayers) return this.kickConn(conn, "room full");
    const playerId = this.nextId++;
    const newToken = `${playerId}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
    // balance cells: join the smaller one, ties to cell 1
    let c1 = 0;
    let c2 = 0;
    for (const p of this.world.players.values()) p.team === 1 ? c1++ : p.team === 2 ? c2++ : 0;
    const player = this.world.addPlayer(playerId, safeName, c1 <= c2 ? 1 : 2, v.loadout);
    // an Audit's sheet mutator is the same for every file in the room (the client applies it too, from the Welcome)
    if (this.opts.audit && Object.keys(this.opts.audit.def.sheet).length) this.world.setLoadout(player, v.loadout, this.opts.audit.def.sheet);
    const rec: ClientRec = {
      conn,
      playerId,
      token: newToken,
      name: safeName,
      joined: true,
      queue: [],
      lastSeq: 0,
      lastAppliedSeq: 0,
      ackTick: 0,
      strikes: 0,
      strikeWindowStart: 0,
      inputWindowStart: this.opts.now(),
      inputCount: 0,
      credits: INPUT_BURST_CREDITS,
      throttled: 0,
      disconnectedAt: 0,
      pendingEvents: [],
      sent: new Map(),
      bytesOut: 0,
      traceMaxErr: 0,
      traceSamples: 0,
      inputsApplied: 0,
      inputsRejected: 0,
      traceSkipUntilSeq: 0,
      account,
      loadout: v.loadout,
      roundBase: { ...player.stats },
      roundStartTick: this.tick,
      settlements: 0,
      lastSettleXp: 0,
      lastRoundFlips: 0,
      progress: new ProgressionTracker(account),
      identity: publicIdentity(account, safeName),
      killedBy: new Map(),
      debtTargetId: -1,
      debtClearedThisRound: false,
    };
    if (account) account.loadout = v.loadout;
    const joinNote = rec.progress.fileMilestones({ stamps: [], ranks: [], challenges: [] });
    this.clients.set(playerId, rec);
    this.byConn.set(conn, rec);
    conn.send(encodeWelcome(playerId, this.tick, newToken, this.world.level.name, this.world.seed, this.mode()));
    conn.send(encodeFile(this.fileMsg(rec, [], "join", joinNote)));
    this.resolveDebts();
    for (const other of this.clients.values()) if (other !== rec) other.pendingEvents.push({ type: "join", playerId, name: safeName });
    this.opts.hooks?.onAdmit?.(this, playerId, account);
    this.opts.onLog(`player ${playerId} (${safeName}) joined as ${account?.id ?? "guest"} depth ${depth} · ${v.loadout.primary}/${v.loadout.secondary} · attested [${v.loadout.attested.join(",")}]${v.loadout.keystone ? " · keystone " + v.loadout.keystone : ""}`);
  }

  /** Send a prebuilt message to one player or everyone (hooks use this). */
  send(buf: ArrayBuffer, playerId?: number): void {
    for (const rec of this.clients.values()) if (playerId === undefined || rec.playerId === playerId) rec.conn?.send(buf);
  }

  /** The file behind a player (hooks apply campaign rewards through it). */
  accountOf(playerId: number): Account | null {
    return this.clients.get(playerId)?.account ?? null;
  }

  playerIds(): number[] {
    return [...this.clients.keys()];
  }

  saveAccount(a: Account): void {
    const saved = this.opts.accounts?.save(a);
    if (saved instanceof Promise) saved.catch(() => {});
  }

  private rejectLoadout(conn: Conn, why: string): void {
    this.loadoutRejections.push(why);
    this.kickConn(conn, `LOADOUT REJECTED: ${why}`);
  }

  private fileMsg(rec: ClientRec, ledger: string[], reason: "join" | "settle" | "stamp", note?: ProgressNote): FileMsg {
    const a = rec.account;
    const mastery = a ? Object.fromEntries(Object.entries(a.mastery).map(([w, m]) => [w, { xp: m.xp, rank: m.rank, done: m.done.slice(), counters: { ...m.counters } }])) : undefined;
    return {
      reason,
      mastery,
      stamps: a?.stamps.slice() ?? [],
      newStamps: note?.stamps ?? [],
      ranks: note?.ranks ?? [],
      challenges: note?.challenges ?? [],
      account: a?.id ?? "guest",
      depth: a?.depth ?? 1,
      xp: a?.xp ?? 0,
      scrip: a?.wallet.scrip ?? 0,
      wakelight: a?.wallet.wakelight ?? 0,
      salvage: a?.wallet.salvage ?? 0,
      owned: a?.owned ?? [],
      ledger,
      loadout: rec.loadout,
      identity: { glyph: rec.identity.glyph, chapter: rec.identity.chapter, moniker: rec.identity.moniker, display: rec.identity.display, unlocked: a ? unlockedMonikers(a).map((m) => m.id) : [], debt: a?.debt ? { display: a.debt.display, glyph: glyphSeed(a.debt.account), kills: a.debt.kills } : null, chapters: a?.chapters.slice() ?? [] },
    };
  }

  // ---- identity & rituals (Stage 8) ----

  private social: Record<string, number> = {};
  /** campaign-only loadout fields stripped at join (stats) */
  private campaignStripped = 0;

  /** Every social send passes the leak scanner: a payload naming a stat, item, chip, firmware or weapon never leaves. */
  private sendSocial(rec: ClientRec, msg: SocialMsg): void {
    assertClean(msg, `social:${msg.kind}`);
    this.social[msg.kind] = (this.social[msg.kind] ?? 0) + 1;
    rec.conn?.send(encodeSocial(msg));
  }

  private refreshIdentity(rec: ClientRec): void {
    rec.identity = publicIdentity(rec.account, rec.name);
  }

  /** Point every file's Debt at the connected player who owes it (by file id), and tell the ones who just found their number in the room. */
  private resolveDebts(): void {
    for (const rec of this.clients.values()) {
      const debt = rec.account?.debt;
      if (!debt) {
        rec.debtTargetId = -1;
        continue;
      }
      const before = rec.debtTargetId;
      rec.debtTargetId = -1;
      for (const other of this.clients.values()) if (other !== rec && other.account?.id === debt.account) rec.debtTargetId = other.playerId;
      if (rec.debtTargetId >= 0 && before !== rec.debtTargetId) this.sendSocial(rec, { kind: "debt", event: "owed", id: rec.debtTargetId, display: debt.display, glyph: glyphSeed(debt.account), kills: debt.kills, credit: 0, capped: false });
    }
  }

  /** The pre-match dossier: both cells' files as the city sees them — identity only, viewer-relative Debt flag. */
  private sendDossiers(): void {
    for (const viewer of this.clients.values()) {
      const entries: DossierEntry[] = [];
      for (const rec of this.clients.values()) {
        const p = this.world.players.get(rec.playerId);
        if (!p) continue;
        entries.push({ id: rec.playerId, team: p.team, glyph: rec.identity.glyph, chapter: rec.identity.chapter, moniker: rec.identity.moniker, display: rec.identity.display, stamps: rec.identity.stamps, debt: viewer.debtTargetId === rec.playerId });
      }
      this.sendSocial(viewer, { kind: "dossier", seconds: 1.2, entries });
    }
  }

  /** A player killed a player: feed the victim's Debt ledger; settle the killer's Debt if this was their number. */
  private onPlayerKill(killerId: number, victimId: number): void {
    const killer = this.clients.get(killerId);
    const victim = this.clients.get(victimId);
    if (!killer || !victim) return;
    victim.killedBy.set(killerId, (victim.killedBy.get(killerId) ?? 0) + 1);
    const a = killer.account;
    if (!a || killer.debtTargetId !== victimId || !a.debt) return;
    // DEBT CLEARED. Social earnings are velocity-capped: one clear per pair per round, three per pair per day.
    const day = Math.floor(this.opts.now() / 86_400_000);
    const key = `pair:${a.debt.account}:${day}`;
    const already = a.social[key] ?? 0;
    const capped = killer.debtClearedThisRound || already >= 3;
    let wakelight = 0;
    if (!capped) {
      a.social[key] = already + 1;
      wakelight = 5;
      a.wallet.wakelight += wakelight;
    }
    killer.debtClearedThisRound = true;
    killer.progress.social("debtsCleared");
    a.ledger.push(`DEBT CLEARED · ${a.debt.display}${wakelight ? ` · +${wakelight} WAKELIGHT` : " · CAPPED"}`);
    const display = a.debt.display;
    const glyph = glyphSeed(a.debt.account);
    const kills = a.debt.kills;
    a.debt = null;
    killer.debtTargetId = -1;
    const saved = this.opts.accounts?.save(a);
    if (saved instanceof Promise) saved.catch(() => {});
    this.sendSocial(killer, { kind: "debt", event: "cleared", id: victimId, display, glyph, kills, credit: wakelight, capped });
    this.opts.onLog(`debt cleared: ${a.id} settled ${display}${capped ? " (capped)" : ""}`);
  }

  /** At settlement: the enemy who killed you most becomes your Debt; a Depth crossing 10/25/50 performs its Chapter rite. */
  private rituals(rec: ClientRec, depthBefore: number, depthAfter: number): void {
    const a = rec.account;
    if (!a) return;
    let top: ClientRec | null = null;
    let topKills = 0;
    for (const [id, n] of rec.killedBy) {
      const other = this.clients.get(id);
      if (!other?.account || other.account.id === a.id) continue;
      if (n > topKills) {
        topKills = n;
        top = other;
      }
    }
    if (top && topKills > 0) {
      a.debt = { account: top.account!.id, display: top.identity.display, kills: topKills };
      a.ledger.push(`DEBT · ${top.identity.display} · ${topKills} FILES ON YOU`);
    }
    rec.killedBy = new Map();
    rec.debtClearedThisRound = false;
    for (const ch of CHAPTERS) {
      if (chapterFor(depthAfter) >= ch.chapter && chapterFor(depthBefore) < ch.chapter && !a.chapters.includes(ch.chapter)) {
        a.chapters.push(ch.chapter);
        a.ledger.push(`CHAPTER ${ch.numeral} · ${ch.title}`);
        this.refreshIdentity(rec);
        this.sendSocial(rec, { kind: "rite", chapter: ch.chapter, numeral: ch.numeral, title: ch.title, lines: ch.lines, named: ch.chapter === 3, display: displayName(a, rec.name) });
      }
    }
    this.refreshIdentity(rec);
  }

  /** Round start: everyone's credit counts from here. */
  /** what the Welcome tells a client about the room: "" for a plain wake, `audit:<id>:<week>` for a playlist, `campaign` for co-op */
  mode(): string {
    if (this.opts.run) return "run";
    if (this.opts.audit) return `audit:${this.opts.audit.def.id}:${this.opts.audit.week}`;
    return this.opts.hooks.afterStep ? "campaign" : "";
  }

  /** flips this round per node id per cell (the Deep Wake reads them at settlement) */
  private roundFlips = new Map<number, Map<number, number>>();

  private beginRound(): void {
    this.roundFlips.clear();
    for (const rec of this.clients.values()) {
      const p = this.world.players.get(rec.playerId);
      if (!p) continue;
      rec.roundBase = { ...p.stats };
      rec.roundStartTick = this.tick;
      rec.killedBy = new Map();
      rec.debtClearedThisRound = false;
      this.refreshIdentity(rec);
    }
    this.resolveDebts();
    this.sendDossiers();
  }

  /** Results: settle every file through the store and hand each client its ledger entry. */
  private settle(winner: number): void {
    let top = -1;
    for (const rec of this.clients.values()) top = Math.max(top, this.world.players.get(rec.playerId)?.stats.kills ?? 0);
    for (const rec of this.clients.values()) {
      const p = this.world.players.get(rec.playerId);
      if (!p) continue;
      const b = rec.roundBase;
      const contribution = {
        flips: p.stats.flips - b.flips,
        nodeSeconds: p.stats.nodeSeconds - b.nodeSeconds,
        kills: p.stats.kills - b.kills,
        assists: p.stats.assists - b.assists,
        supportPoints: p.stats.support - b.support,
        seconds: (this.tick - rec.roundStartTick) / SIM_HZ,
        won: winner !== 0 && winner === p.team,
      };
      rec.roundBase = { ...p.stats };
      rec.roundStartTick = this.tick;
      rec.settlements++;
      this.settlements++;
      if (!rec.account) continue;
      const entry = applyMatch(rec.account, contribution);
      rec.lastSettleXp = entry.xp.total;
      const note = rec.progress.onRoundEnd(p, contribution.won, contribution.seconds, p.stats.kills === top, this.world.level.name);
      for (const id of note.stamps) entry.lines.push(`STAMP · ${id.toUpperCase().replace(/[:_]/g, " ")}`);
      this.rituals(rec, entry.depthBefore, entry.depthAfter);
      if (rec.account.debt) entry.lines.push(`DEBT · ${rec.account.debt.display} · ${rec.account.debt.kills} FILES ON YOU`);
      const saved = this.opts.accounts?.save(rec.account);
      if (saved instanceof Promise) saved.catch((err) => this.opts.onLog(`file save failed for ${rec.account?.id}: ${String(err)}`));
      this.opts.onLog(`settled ${rec.account.id}: xp +${entry.xp.total} (obj ${entry.xp.objective} / combat ${entry.xp.combat} / support ${entry.xp.support}) scrip +${entry.scrip} depth ${entry.depthBefore}→${entry.depthAfter}`);
      rec.conn?.send(encodeFile(this.fileMsg(rec, entry.lines, "settle", note)));
    }
    this.resolveDebts();
    this.pushEndgame(winner);
  }

  /** Audit scores to the week's board; the round's flips to the Deep Wake, by the flipping files' houses. */
  private pushEndgame(winner: number): void {
    const store = this.opts.endgame;
    if (!store) return;
    const houseOf = (team: number): House[] => {
      const out: House[] = [];
      for (const rec of this.clients.values()) {
        const p = this.world.players.get(rec.playerId);
        if (!p || p.team !== team) continue;
        const f = rec.account?.campaign?.faction;
        out.push(f === "estate" || f === "clockeaters" || f === "cells" ? f : "unaligned");
      }
      return out;
    };
    if (this.opts.audit) {
      for (const rec of this.clients.values()) {
        const a = rec.account;
        if (!a) continue;
        const score = rec.lastSettleXp;
        const best = a.audits && a.audits.week === this.opts.audit.week ? a.audits.best : 0;
        a.audits = { week: this.opts.audit.week, best: Math.max(best, score), played: (a.audits?.week === this.opts.audit.week ? a.audits.played : 0) + 1 };
        const saved = store.submitAudit(this.opts.audit.week, { account: a.id, display: rec.identity.display, score, at: this.opts.now() });
        if (saved instanceof Promise) saved.catch(() => {});
        this.saveAccount(a);
        this.auditScores.push(score);
      }
    }
    const flips: { label: string; house: House; count: number }[] = [];
    for (const [nodeId, byTeam] of this.roundFlips) {
      const label = this.world.level.nodes.find((n) => n.id === nodeId)?.label ?? String(nodeId);
      for (const [team, count] of byTeam) {
        const houses = houseOf(team);
        if (!houses.length) continue;
        for (const h of houses) flips.push({ label, house: h, count: count / houses.length });
      }
    }
    const winners = winner ? houseOf(winner) : [];
    // the season's prize channel: flips per file this round, from Depth 15
    const contributors: Record<string, number> = {};
    for (const rec of this.clients.values()) {
      const p = this.world.players.get(rec.playerId);
      const a = rec.account;
      if (!p || !a || a.depth < SEASON_DEPTH) continue;
      const f = p.stats.flips - rec.lastRoundFlips;
      if (f > 0) contributors[a.id] = (contributors[a.id] ?? 0) + f;
      rec.lastRoundFlips = p.stats.flips;
    }
    if (flips.length || winners.length) {
      const pushed = store.pushSeason({ level: this.world.level.name, flips, winners, contributors });
      const done = (st: { last: string | null }) => {
        this.seasonLast = st.last;
        if (st.last) this.opts.onLog(`deep wake · ${st.last}`);
      };
      if (pushed instanceof Promise) pushed.then(done).catch(() => {});
      else done(pushed);
    }
  }

  // ---- THE RUN (Stage 14): the room credits the file per bank; the counter-ledger pays the wallet ----
  private runDirty = false;
  private runCredits: string[] = [];
  /** A bank: at the gate, the day's units against the cap are owed and settle at the day's rate; below it, Scrip. Never a stat. */
  private onBank(playerId: number, value: number, zone: string): void {
    const rec = this.clients.get(playerId);
    const a = rec?.account;
    if (!rec || !a) return;
    const day = dayIndex(this.opts.now());
    if (!a.counter) a.counter = { address: null, linkedAt: 0, ghostfile: 0, stamps: [], name: null, rig: [], worn: 0, capital: "0" };
    const run = a.counter.run && a.counter.run.day === day ? a.counter.run : { day, banked: 0, owed: a.counter.run?.owed ?? 0, paid: a.counter.run?.paid ?? 0 };
    let line: string;
    if (a.depth < RUN_DEPTH) {
      a.wallet.scrip += value * RUN_SCRIP_PER_UNIT;
      line = `BANKED ${value} AT ${zone} · ${value * RUN_SCRIP_PER_UNIT} SCRIP (the run pays $CAPITAL from Depth ${RUN_DEPTH})`;
    } else {
      const room = Math.max(0, RUN_DAILY_CAP - run.banked);
      const paid = Math.min(value, room);
      run.banked += paid;
      // units, not $CAPITAL: the day's rate is set by the settlement, which the room never sees
      run.owed += paid;
      line = paid < value ? `BANKED ${value} AT ${zone} · ${paid} UNITS OWED · DAY CAP ${RUN_DAILY_CAP} REACHED` : `BANKED ${value} AT ${zone} · ${paid} UNITS OWED`;
    }
    a.counter.run = run;
    a.counters["runBanked"] = (a.counters["runBanked"] ?? 0) + value;
    a.ledger.push(line);
    if (a.ledger.length > 200) a.ledger.splice(0, a.ledger.length - 200);
    this.runCredits.push(`${rec.name}: ${line}`);
    this.saveAccount(a);
    this.opts.onLog(`run · ${a.id}: ${line}`);
    rec.conn?.send(encodeFile(this.fileMsg(rec, [line], "settle", rec.progress.fileMilestones({ stamps: [], ranks: [], challenges: [] }))));
  }
  /** The run as each client sees it, pushed on change and every half second. */
  private pushRun(): void {
    const run = this.world.run;
    if (!run) return;
    if (!this.runDirty && this.tick % 30 !== 0) return;
    this.runDirty = false;
    const day = dayIndex(this.opts.now());
    for (const rec of this.clients.values()) {
      const p = this.world.players.get(rec.playerId);
      if (!p || !rec.conn) continue;
      const v = runView(run, rec.playerId, p.pos);
      const r = rec.account?.counter?.run;
      const msg: RunMsg = { ...v, today: r && r.day === day ? r.banked : 0, cap: RUN_DAILY_CAP, owed: r?.owed ?? 0, events: [] };
      rec.conn.send(encodeRun(msg));
    }
  }

  /** audit scores submitted this session and the Deep Wake's last line (stats) */
  private auditScores: number[] = [];
  private seasonLast: string | null = null;

  // ---- simulation ----

  /** Advance one tick. Hosts call this at SIM_HZ. */
  step(): void {
    const t0 = performance.now();
    const now = this.opts.now();
    // expire disconnected players past the rejoin window
    for (const rec of [...this.clients.values()]) {
      if (rec.conn === null && now - rec.disconnectedAt > this.opts.rejoinGraceSeconds * 1000) this.removePlayer(rec);
    }
    const inputs = new Map<number, NetInput[]>();
    const applied = new Map<number, NetInput[]>();
    for (const rec of this.clients.values()) {
      // one credit per tick, so no client can spend more sim time than the sim has run
      rec.credits = Math.min(INPUT_BURST_CREDITS, rec.credits + 1);
      if (rec.queue.length === 0) continue;
      const allowed = Math.min(MAX_INPUTS_PER_TICK, Math.floor(rec.credits), rec.queue.length);
      if (allowed <= 0) continue;
      if (rec.queue.length > allowed) rec.throttled += rec.queue.length - allowed;
      rec.credits -= allowed;
      const list = rec.queue.splice(0, allowed);
      inputs.set(rec.playerId, list);
      applied.set(rec.playerId, list);
    }
    const wasAlive = new Map<number, boolean>();
    for (const p of this.world.players.values()) wasAlive.set(p.id, p.alive);
    this.world.step(inputs, { online: true, rewind: this.opts.lagComp ? (id, viewTick) => this.rewindFor(id, viewTick) : undefined });
    for (const p of this.world.players.values()) {
      const rec = this.clients.get(p.id);
      if (rec && !wasAlive.get(p.id) && p.alive) rec.traceSkipUntilSeq = rec.lastSeq + 120; // client learns the respawn from the next snapshot (+ slow-frame input bursts)
    }
    // trace comparison: the client's predicted position after its last applied input vs ours
    for (const [id, list] of applied) {
      const rec = this.clients.get(id)!;
      const p = this.world.players.get(id)!;
      const last = list[list.length - 1]!;
      rec.lastAppliedSeq = last.seq;
      rec.inputsApplied += list.length;
      if (p.alive && last.seq > rec.traceSkipUntilSeq) {
        const err = Math.hypot(p.pos.x - last.px, p.pos.y - last.py, p.pos.z - last.pz);
        rec.traceSamples++;
        if (err > rec.traceMaxErr) rec.traceMaxErr = err;
        if (err > 0.02 && this.traceLog.length < 12) this.traceLog.push({ tick: this.tick, id, seq: last.seq, err, batch: list.length, queue: rec.queue.length, alive: p.alive, stance: p.stance, srv: [+p.pos.x.toFixed(3), +p.pos.y.toFixed(3), +p.pos.z.toFixed(3)], cli: [+last.px.toFixed(3), +last.py.toFixed(3), +last.pz.toFixed(3)], buttons: last.buttons, yawIn: +last.yaw.toFixed(4), yawP: +p.yaw.toFixed(4), vel: [+p.vel.x.toFixed(2), +p.vel.z.toFixed(2)] } as never);
      }
    }
    // pose history for lag comp
    this.history.set(this.tick, this.world.poses());
    this.history.delete(this.tick - 64);
    // fan out events
    const tickEvents = this.world.drainEvents();
    for (const rec of this.clients.values()) {
      const p = this.world.players.get(rec.playerId);
      if (!p || !rec.account) continue;
      const note = rec.progress.onEvents(tickEvents, p, rec.playerId, this.tick, this.world.wasps);
      if (note) {
        const saved = this.opts.accounts?.save(rec.account);
        if (saved instanceof Promise) saved.catch(() => {});
        rec.conn?.send(encodeFile(this.fileMsg(rec, note.stamps.map((id) => `STAMP · ${id}`), "stamp", note)));
      }
    }
    for (const ev of tickEvents) {
      if (ev.type === "kill" && ev.victimKind === "player") this.onPlayerKill(ev.playerId, ev.victimId);
      if (ev.type === "bank") this.onBank(ev.playerId, ev.value, ev.zone);
      if (ev.type === "claim" || ev.type === "drop" || ev.type === "bank" || ev.type === "claimReturn") this.runDirty = true;
      if (ev.type === "death" || ev.type === "respawn" || ev.type === "kill") {
        const p = this.world.players.get(ev.playerId);
        this.opts.onLog(`t${this.tick} ${ev.type} player ${ev.playerId}${ev.type === "kill" ? ` → ${ev.victimKind} ${ev.victimId} (${ev.weapon})` : ""} at (${p?.pos.x.toFixed(1)},${p?.pos.y.toFixed(1)},${p?.pos.z.toFixed(1)}) lastSeq ${this.clients.get(ev.playerId)?.lastSeq}`);
      }
      if (ev.type === "shot") {
        const d = this.shotDiag;
        d.shots++;
        if (ev.hit.kind === "player") d.playerHits++;
        d.rewindSum += ev.rewindTicks;
        if (ev.rewindTicks > d.rewindMax) d.rewindMax = ev.rewindTicks;
        if (ev.rewindTicks > MAX_REWIND_TICKS) d.clamped++;
        if (ev.nearMiss >= 0 && ev.hit.kind !== "player") {
          d.nearMissSum += ev.nearMiss;
          d.nearMissN++;
          if (ev.nearMiss > d.nearMissMax) d.nearMissMax = ev.nearMiss;
        }
      }
      if (ev.type === "nodeFlip") {
        const byTeam = this.roundFlips.get(ev.node) ?? new Map<number, number>();
        byTeam.set(ev.team, (byTeam.get(ev.team) ?? 0) + 1);
        this.roundFlips.set(ev.node, byTeam);
      }
      if (ev.type === "phase") {
        if (ev.phase === "wake") this.beginRound();
        else if (ev.phase === "results") this.settle(ev.winner);
      }
      const ne = this.toNetEvent(ev);
      if (!ne) continue;
      for (const rec of this.clients.values()) rec.pendingEvents.push(ne);
    }
    this.opts.hooks?.afterStep?.(this, tickEvents);
    if (this.tick % SNAPSHOT_EVERY === 0) this.broadcast();
    const dt = performance.now() - t0;
    this.tickTimes.push(dt);
    if (this.tickTimes.length > 600) this.tickTimes.shift();
    this.tickCount++;
    if (now - this.lastRateAt >= 1000) {
      this.tickHz = ((this.tick - this.lastRateTick) * 1000) / (now - this.lastRateAt);
      this.lastRateAt = now;
      this.lastRateTick = this.tick;
    }
    this.pushRun();
  }

  private rewindFor(shooterId: number, viewTick: number): ReadonlyMap<number, RewindPose> | null {
    const target = Math.max(this.tick - MAX_REWIND_TICKS, Math.min(this.tick, viewTick));
    const poses = this.history.get(target);
    if (!poses) return null;
    void shooterId;
    return poses;
  }

  private toNetEvent(ev: SimEvent): NetEvent | null {
    const pid = (id: number) => (id < 0 ? 200 + Math.min(55, -id % 100) : id & 0xff);
    const hitKindNum = (k: string) => (k === "none" ? 0 : k === "world" ? 1 : k === "dummy" ? 2 : k === "player" ? 3 : k === "wasp" ? 4 : 5);
    switch (ev.type) {
      case "shot":
        return {
          type: "shot",
          playerId: pid(ev.playerId),
          weapon: WEAPON_WIRE[ev.weapon] ?? 0,
          fx: ev.from.x, fy: ev.from.y, fz: ev.from.z,
          tx: ev.to.x, ty: ev.to.y, tz: ev.to.z,
          hitKind: hitKindNum(ev.hit.kind),
          zone: ev.hit.zone,
          victimId: ev.hit.id < 0 ? 255 : ev.hit.id,
          pierce: ev.hits.length,
        };
      case "kill":
        return { type: "kill", playerId: pid(ev.playerId), victimKind: ev.victimKind === "dummy" ? 0 : ev.victimKind === "player" ? 1 : ev.victimKind === "wasp" ? 2 : 3, victimId: ev.victimId, ttkTicks: ev.ttkTicks, weapon: WEAPON_WIRE[ev.weapon] ?? 0 };
      case "death":
        return { type: "death", playerId: ev.playerId, killerId: pid(ev.killerId) };
      case "explode":
        return { type: "fx", kind: FX.explode, playerId: pid(ev.playerId), x: ev.pos.x, y: ev.pos.y, z: ev.pos.z, a: Math.round(ev.radius * 10), b: ev.projKind === "phage" ? 1 : ev.projKind === "sticky" ? 2 : ev.projKind === "frag" ? 3 : 0 };
      case "cloud":
        return { type: "fx", kind: FX.cloud, playerId: pid(ev.playerId), x: ev.pos.x, y: ev.pos.y, z: ev.pos.z, a: Math.round(ev.radius * 10), b: 0 };
      case "emp":
        return { type: "fx", kind: FX.emp, playerId: pid(ev.playerId), x: ev.pos.x, y: ev.pos.y, z: ev.pos.z, a: Math.round(ev.radius * 10), b: 0 };
      case "flagged":
        return { type: "fx", kind: FX.flagged, playerId: ev.playerId, x: 0, y: 0, z: 0, a: ev.mechId, b: 0 };
      case "stun":
        return { type: "fx", kind: FX.stun, playerId: ev.playerId, x: 0, y: 0, z: 0, a: pid(ev.by), b: 0 };
      case "swap":
        return { type: "fx", kind: FX.swap, playerId: ev.playerId, x: 0, y: 0, z: 0, a: ev.slot, b: 0 };
      case "melee":
        return { type: "fx", kind: FX.melee, playerId: ev.playerId, x: 0, y: 0, z: 0, a: ev.hits.length, b: ev.lunge ? 1 : 0 };
      case "mechBeam":
        return { type: "fx", kind: FX.mechBeam, playerId: ev.playerId, x: ev.to.x, y: ev.to.y, z: ev.to.z, a: ev.mechId, b: ev.damage };
      case "hurt":
        return { type: "fx", kind: FX.hurt, playerId: ev.playerId, x: 0, y: 0, z: 0, a: Math.min(255, ev.damage), b: ev.kind === "shot" ? 0 : ev.kind === "explosion" ? 1 : ev.kind === "melee" ? 2 : 3 };
      case "waspDeath":
        return { type: "fx", kind: FX.waspDeath, playerId: pid(ev.playerId), x: 0, y: 0, z: 0, a: ev.waspId, b: 0 };
      case "mechDeath":
        return { type: "fx", kind: FX.mechDeath, playerId: pid(ev.playerId), x: 0, y: 0, z: 0, a: ev.mechId, b: 0 };
      case "throw":
        return { type: "fx", kind: FX.throw, playerId: ev.playerId, x: 0, y: 0, z: 0, a: ev.grenade === "frag" ? 0 : ev.grenade === "smoke" ? 1 : 2, b: 0 };
      case "chargeFull":
        return { type: "fx", kind: FX.chargeFull, playerId: ev.playerId, x: 0, y: 0, z: 0, a: 0, b: 0 };
      case "lunge":
        return { type: "fx", kind: FX.lunge, playerId: ev.playerId, x: 0, y: 0, z: 0, a: 0, b: 0 };
      case "nodeFlip":
        return { type: "fx", kind: FX.nodeFlip, playerId: 0, x: 0, y: 0, z: 0, a: ev.node, b: ev.team };
      case "nodeContest":
        return { type: "fx", kind: FX.nodeContest, playerId: 0, x: 0, y: 0, z: 0, a: ev.node, b: 0 };
      case "kernelPulse":
        return { type: "fx", kind: FX.kernelPulse, playerId: 0, x: 0, y: 0, z: 0, a: ev.node, b: ev.released ? 1 : 0 };
      case "phase":
        return { type: "fx", kind: FX.phase, playerId: 0, x: 0, y: 0, z: 0, a: ev.phase === "warmup" ? 0 : ev.phase === "wake" ? 1 : 2, b: ev.winner };
      case "fullWake":
        return { type: "fx", kind: FX.fullWake, playerId: 0, x: 0, y: 0, z: 0, a: ev.team, b: 0 };
      default:
        return null;
    }
  }

  private entities(): NetEntity[] {
    const out: NetEntity[] = [];
    const w = this.world;
    for (const p of w.projectiles) out.push({ kind: ENT_PROJECTILE, id: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z, a: p.kind === "phage" ? 1 : p.kind === "sticky" ? 2 : p.kind === "frag" ? 3 : p.kind === "smoke" ? 4 : 5, b: p.stuck ? 1 : 0, c: Math.round(p.fuse * 100), d: 0 });
    for (const c of w.clouds) out.push({ kind: ENT_CLOUD, id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z, a: 0, b: 0, c: Math.round(c.radius * 100), d: Math.round(c.ttl * 100) });
    for (const ws of w.wasps) out.push({ kind: ENT_WASP, id: ws.id, x: ws.pos.x, y: ws.pos.y, z: ws.pos.z, a: ws.alive ? 1 : 0, b: Math.max(0, ws.health), c: Math.round(ws.yaw * 1000), d: ws.disabledTimer > 0 ? 2 : ws.state === "chase" ? 1 : 0 });
    if (w.wake) for (const n of w.wake.nodes) out.push({ kind: ENT_NODE, id: n.id, x: n.pos.x, y: n.pos.y, z: n.pos.z, a: n.owner, b: Math.round(n.hold * 100), c: (n.contested ? 1 : 0) | (n.puller << 1) | (n.boost > 0 ? 8 : 0), d: n.links.reduce((m, l) => m | (1 << l), 0) });
    for (const m of w.mechs) out.push({ kind: ENT_MECH, id: m.id, x: m.pos.x, y: m.pos.y, z: m.pos.z, a: m.alive ? 1 : 0, b: Math.round(Math.max(0, m.health) / 2), c: Math.round(m.yaw * 1000), d: Math.round((m.face + m.lightYaw) * 1000) });
    return out;
  }

  private broadcast(): void {
    const serverTimeMs = this.opts.now();
    for (const rec of this.clients.values()) {
      if (!rec.conn) {
        rec.pendingEvents.length = 0;
        continue;
      }
      const me = this.world.players.get(rec.playerId)!;
      const players = [...this.world.players.values()].filter((p) => p.id !== rec.playerId).map((p) => this.quantized(p));
      const dummies = this.world.dummies.map((d) => ({ id: d.id, alive: d.alive, health: d.health, x: d.pos.x, y: d.pos.y, z: d.pos.z }));
      const snap: Omit<Snapshot, "bytes"> = {
        tick: this.tick,
        serverTimeMs,
        // exact local state at 15 Hz is plenty for reconciliation and halves the snapshot
        local: this.tick % (SNAPSHOT_EVERY * 2) === 0 ? this.world.exportLocal(me, rec.lastAppliedSeq) : null,
        players,
        dummies,
        entities: this.entities(),
        match: this.world.wake ? { phase: this.world.wake.phase === "warmup" ? 0 : this.world.wake.phase === "wake" ? 1 : 2, timeLeft: this.world.wake.timeLeft, score1: this.world.wake.score[1], score2: this.world.wake.score[2], winner: this.world.wake.winner, round: this.world.wake.round } : null,
        events: rec.pendingEvents.splice(0),
      };
      const baseline = rec.ackTick ? rec.sent.get(rec.ackTick) ?? null : null;
      const buf = encodeSnapshot(snap, baseline);
      rec.bytesOut += buf.byteLength;
      const stored: Snapshot = { ...snap, bytes: buf.byteLength, events: [] };
      rec.sent.set(this.tick, stored);
      rec.sent.delete(this.tick - 40 * SNAPSHOT_EVERY);
      try {
        rec.conn.send(buf);
      } catch {
        /* transport closed; onClose follows */
      }
    }
  }

  private quantized(p: PlayerState) {
    const rec = this.clients.get(p.id);
    return quantizeRemote({
      id: p.id,
      slot: p.weapon.slot,
      team: p.team,
      shield: Math.max(0, Math.round(p.shield)),
      x: p.pos.x, y: p.pos.y, z: p.pos.z,
      vx: p.vel.x, vy: p.vel.y, vz: p.vel.z,
      yaw: p.yaw, pitch: p.pitch,
      health: Math.max(0, Math.round(p.health)),
      ammo: p.weapon.ammo[p.weapon.slot] ?? 0,
      alive: p.alive,
      grounded: p.grounded,
      stance: stanceToNum(p.stance),
      height: p.height,
      name: rec ? rec.identity.display : p.name,
      tag: rec ? identityTag(rec.identity) : "",
    });
  }

  stats(): RoomStats {
    const times = this.tickTimes;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const max = times.length ? Math.max(...times) : 0;
    let inputsRejected = 0;
    let bytesOut = 0;
    const clients = [...this.clients.values()].map((c) => {
      inputsRejected += c.inputsRejected;
      bytesOut += c.bytesOut;
      const p = this.world.players.get(c.playerId)!;
      return {
        id: c.playerId,
        name: c.name,
        connected: c.conn !== null,
        traceMaxErr: c.traceMaxErr,
        traceSamples: c.traceSamples,
        throttled: c.throttled,
        inputsApplied: c.inputsApplied,
        inputsRejected: c.inputsRejected,
        kills: p.stats.kills,
        deaths: p.stats.deaths,
        shots: p.stats.shots,
        hits: p.stats.hits,
        queue: c.queue.length,
        flips: p.stats.flips,
        nodeSeconds: p.stats.nodeSeconds,
        support: p.stats.support,
        file: c.account ? { account: c.account.id, depth: c.account.depth, xp: c.account.xp, scrip: c.account.wallet.scrip, settlements: c.settlements, stamps: c.account.stamps.length, ranks: Object.fromEntries(Object.entries(c.account.mastery).map(([w, m]) => [w, m.rank])) } : null,
        loadout: c.loadout,
        identity: { display: c.identity.display, chapter: c.identity.chapter, moniker: c.identity.moniker, debt: c.account?.debt?.display ?? null, debtTarget: c.debtTargetId, wakelight: c.account?.wallet.wakelight ?? 0, chapters: c.account?.chapters.slice() ?? [] },
      };
    });
    return {
      tick: this.tick,
      level: this.world.level.name,
      players: this.clients.size,
      connected: this.byConn.size,
      tickHz: this.tickHz || (this.tick * 1000) / Math.max(1, this.opts.now() - this.startedAt),
      avgTickMs: avg,
      maxTickMs: max,
      kicks: this.kicks,
      settlements: this.settlements,
      social: { ...this.social },
      campaignStripped: this.campaignStripped,
      audit: this.opts.audit ? { id: this.opts.audit.def.id, week: this.opts.audit.week, scores: this.auditScores.slice() } : null,
      run: this.world.run ? { totalBanked: this.world.run.totalBanked, claims: this.world.run.claims.filter((c) => c.active).length, carried: Object.fromEntries([...this.clients.values()].map((c) => [c.name, this.world.run!.carried.get(c.playerId) ?? 0])), banked: Object.fromEntries([...this.clients.values()].map((c) => [c.name, this.world.run!.banked.get(c.playerId) ?? 0])), credits: this.runCredits.slice(-20) } : null,
      seasonLast: this.seasonLast,
      loadoutRejections: this.loadoutRejections.slice(),
      inputsRejected,
      bytesOut,
      clients,
      traceLog: this.traceLog,
      match: this.world.wake ? { phase: this.world.wake.phase, timeLeft: this.world.wake.timeLeft, score: this.world.wake.score, winner: this.world.wake.winner, round: this.world.wake.round, nodes: this.world.wake.nodes.map((n) => ({ id: n.id, owner: n.owner, hold: n.hold, contested: n.contested })) } : null,
      shotDiag: { ...this.shotDiag, avgRewind: this.shotDiag.shots ? this.shotDiag.rewindSum / this.shotDiag.shots : 0, avgNearMiss: this.shotDiag.nearMissN ? this.shotDiag.nearMissSum / this.shotDiag.nearMissN : 0 },
    };
  }
}

export const SERVER_TICK_MS = 1000 / SIM_HZ;
