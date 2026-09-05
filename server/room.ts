/**
 * Authoritative match room. Transport-agnostic: the Node host and the
 * Cloudflare Durable Object host both drive this class. One instance = one
 * match. Runs the shared simulation at SIM_HZ, validates every input, keeps a
 * pose history for lag-compensated hitscan, sends quantized delta snapshots,
 * and supports rejoin by token.
 */
import { SIM_HZ } from "../shared/sim/constants";
import { drainageYard } from "../shared/sim/level";
import { World, type RewindPose, type SimEvent } from "../shared/sim/world";
import type { PlayerState } from "../shared/sim/player";
import {
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY,
  MAX_REWIND_TICKS,
  MAX_INPUT_QUEUE,
  decodeClientMessage,
  encodeKick,
  encodePong,
  encodeSnapshot,
  encodeWelcome,
  quantizeRemote,
  stanceToNum,
  type NetEvent,
  type NetInput,
  type Snapshot,
} from "../shared/net/protocol";

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
}

export interface RoomOptions {
  lagComp?: boolean;
  maxPlayers?: number;
  /** Seconds a disconnected player is kept for rejoin. */
  rejoinGraceSeconds?: number;
  now?: () => number;
  onLog?: (line: string) => void;
}

export interface RoomStats {
  tick: number;
  players: number;
  connected: number;
  tickHz: number;
  avgTickMs: number;
  maxTickMs: number;
  kicks: number;
  inputsRejected: number;
  bytesOut: number;
  clients: { id: number; name: string; connected: boolean; traceMaxErr: number; traceSamples: number; inputsApplied: number; inputsRejected: number; kills: number; deaths: number; shots: number; hits: number; queue: number }[];
  shotDiag: Record<string, number>;
  traceLog: unknown[];
}

const MAX_INPUTS_PER_TICK = 6;
const MAX_INPUT_RATE_PER_SEC = 95;
const MAX_STRIKES = 3;

export class Room {
  readonly world = new World(drainageYard());
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
  /** Last few large prediction/server divergences, for diagnosis. */
  readonly traceLog: { tick: number; id: number; seq: number; err: number; batch: number; queue: number; alive: boolean; stance: string; srv: number[]; cli: number[]; buttons: number }[] = [];
  readonly shotDiag = { shots: 0, playerHits: 0, rewindSum: 0, rewindMax: 0, clamped: 0, nearMissSum: 0, nearMissN: 0, nearMissMax: 0 };

  constructor(opts: RoomOptions = {}) {
    this.opts = {
      lagComp: opts.lagComp ?? true,
      maxPlayers: opts.maxPlayers ?? 8,
      rejoinGraceSeconds: opts.rejoinGraceSeconds ?? 60,
      now: opts.now ?? (() => Date.now()),
      onLog: opts.onLog ?? (() => {}),
    };
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
      this.join(conn, msg.name, msg.token);
      return;
    }
    if (!rec) return this.kickConn(conn, "message before join");
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
    if (i.buttons < 0 || i.buttons > 0x3ff) return false;
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

  private join(conn: Conn, name: string, token: string): void {
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
          conn.send(encodeWelcome(rec.playerId, this.tick, rec.token, this.world.level.name));
          this.opts.onLog(`player ${rec.playerId} rejoined`);
          return;
        }
      }
    }
    if (this.clients.size >= this.opts.maxPlayers) return this.kickConn(conn, "room full");
    const playerId = this.nextId++;
    const newToken = `${playerId}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
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
      disconnectedAt: 0,
      pendingEvents: [],
      sent: new Map(),
      bytesOut: 0,
      traceMaxErr: 0,
      traceSamples: 0,
      inputsApplied: 0,
      inputsRejected: 0,
      traceSkipUntilSeq: 0,
    };
    this.clients.set(playerId, rec);
    this.byConn.set(conn, rec);
    this.world.addPlayer(playerId, safeName);
    conn.send(encodeWelcome(playerId, this.tick, newToken, this.world.level.name));
    for (const other of this.clients.values()) if (other !== rec) other.pendingEvents.push({ type: "join", playerId, name: safeName });
    this.opts.onLog(`player ${playerId} (${safeName}) joined`);
  }

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
      if (rec.queue.length === 0) continue;
      const list = rec.queue.splice(0, Math.min(MAX_INPUTS_PER_TICK, rec.queue.length));
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
    for (const ev of this.world.drainEvents()) {
      if (ev.type === "death" || ev.type === "respawn" || ev.type === "kill") {
        const p = this.world.players.get(ev.playerId);
        this.opts.onLog(`t${this.tick} ${ev.type} player ${ev.playerId} at (${p?.pos.x.toFixed(1)},${p?.pos.y.toFixed(1)},${p?.pos.z.toFixed(1)}) lastSeq ${this.clients.get(ev.playerId)?.lastSeq}`);
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
      const ne = this.toNetEvent(ev);
      if (!ne) continue;
      for (const rec of this.clients.values()) rec.pendingEvents.push(ne);
    }
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
  }

  private rewindFor(shooterId: number, viewTick: number): ReadonlyMap<number, RewindPose> | null {
    const target = Math.max(this.tick - MAX_REWIND_TICKS, Math.min(this.tick, viewTick));
    const poses = this.history.get(target);
    if (!poses) return null;
    void shooterId;
    return poses;
  }

  private toNetEvent(ev: SimEvent): NetEvent | null {
    switch (ev.type) {
      case "shot":
        return {
          type: "shot",
          playerId: ev.playerId,
          fx: ev.from.x, fy: ev.from.y, fz: ev.from.z,
          tx: ev.to.x, ty: ev.to.y, tz: ev.to.z,
          hitKind: ev.hit.kind === "none" ? 0 : ev.hit.kind === "world" ? 1 : ev.hit.kind === "dummy" ? 2 : 3,
          zone: ev.hit.zone,
          victimId: ev.hit.id < 0 ? 255 : ev.hit.id,
        };
      case "kill":
        return { type: "kill", playerId: ev.playerId, victimKind: ev.victimKind === "dummy" ? 0 : 1, victimId: ev.victimId, ttkTicks: ev.ttkTicks };
      case "death":
        return { type: "death", playerId: ev.playerId, killerId: ev.killerId < 0 ? 255 : ev.killerId };
      default:
        return null;
    }
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
      x: p.pos.x, y: p.pos.y, z: p.pos.z,
      vx: p.vel.x, vy: p.vel.y, vz: p.vel.z,
      yaw: p.yaw, pitch: p.pitch,
      health: Math.max(0, Math.round(p.health)),
      ammo: p.ammo,
      alive: p.alive,
      grounded: p.grounded,
      stance: stanceToNum(p.stance),
      height: p.height,
      name: rec?.name ?? p.name,
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
        inputsApplied: c.inputsApplied,
        inputsRejected: c.inputsRejected,
        kills: p.stats.kills,
        deaths: p.stats.deaths,
        shots: p.stats.shots,
        hits: p.stats.hits,
        queue: c.queue.length,
      };
    });
    return {
      tick: this.tick,
      players: this.clients.size,
      connected: this.byConn.size,
      tickHz: this.tickHz || (this.tick * 1000) / Math.max(1, this.opts.now() - this.startedAt),
      avgTickMs: avg,
      maxTickMs: max,
      kicks: this.kicks,
      inputsRejected,
      bytesOut,
      clients,
      traceLog: this.traceLog,
      shotDiag: { ...this.shotDiag, avgRewind: this.shotDiag.shots ? this.shotDiag.rewindSum / this.shotDiag.shots : 0, avgNearMiss: this.shotDiag.nearMissN ? this.shotDiag.nearMissSum / this.shotDiag.nearMissN : 0 },
    };
  }
}

export const SERVER_TICK_MS = 1000 / SIM_HZ;
