import { SIM_HZ } from "@shared/sim/constants";
import {
  INPUT_REDUNDANCY,
  decodeServerMessage,
  encodeInputs,
  encodeJoin,
  encodePing,
  numToStance,
  type NetInput,
  type RemotePlayerQ,
  type Snapshot,
  type FileMsg,
} from "@shared/net/protocol";
import type { Transport } from "./transport";

/** Remote players are rendered this many ticks behind the estimated server tick. */
export const INTERP_DELAY_TICKS = 6;

export interface RemoteView {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  height: number;
  alive: boolean;
  stance: "stand" | "crouch" | "slide" | "mantle";
  health: number;
}

interface RemoteSample {
  tick: number;
  q: RemotePlayerQ;
}

/**
 * Client side of the protocol: join, send redundant input batches, receive
 * delta snapshots, estimate the server clock, and interpolate remote players.
 * Reconciliation of the local player is the Game's job (it owns the world).
 */
export class NetClient {
  playerId = -1;
  token: string;
  status: "connecting" | "joined" | "closed" | "kicked" = "connecting";
  kickReason = "";
  levelName = "";
  /** Room seed from Welcome: magazine seeds derive from it on both sides. */
  seed = 1;
  rttMs = 0;
  private rttSamples: number[] = [];
  private seq = 0;
  private pending: NetInput[] = [];
  private baselines = new Map<number, Snapshot>();
  private latestTick = 0;
  private latestAt = 0;
  private remotes = new Map<number, RemoteSample[]>();
  private names = new Map<number, string>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  readonly stats = { snapshots: 0, bytesIn: 0, bytesOut: 0, undecodable: 0, reconciles: 0, maxCorrection: 0, joinedAtMs: 0, connectStartMs: performance.now() };
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onStatus: ((s: NetClient["status"]) => void) | null = null;
  onFile: ((f: FileMsg) => void) | null = null;

  constructor(private transport: Transport, private name: string, token = "", private account = "", private loadout = "") {
    this.token = token;
    transport.onOpen = () => {
      transport.send(encodeJoin(this.name, this.token, this.account, this.loadout));
    };
    transport.onMessage = (buf) => this.receive(buf);
    transport.onClose = (reason) => {
      if (this.status !== "kicked") this.status = "closed";
      this.kickReason ||= reason;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.onStatus?.(this.status);
    };
  }

  get pendingInputs(): readonly NetInput[] {
    return this.pending;
  }

  /** Estimated current server tick (continuous). */
  serverTickNow(): number {
    if (!this.latestTick) return 0;
    return this.latestTick + ((performance.now() - this.latestAt) / 1000) * SIM_HZ + (this.rttMs / 2 / 1000) * SIM_HZ;
  }

  /** Tick the remote players are rendered at (what the local player is aiming at). */
  viewTick(): number {
    return Math.max(0, Math.floor(this.serverTickNow() - INTERP_DELAY_TICKS));
  }

  nextSeq(): number {
    return ++this.seq;
  }

  /** Queue one input (already applied locally) and send the last few redundantly. */
  sendInput(input: NetInput): void {
    this.pending.push(input);
    if (this.pending.length > 240) this.pending.splice(0, this.pending.length - 240);
    const batch = this.pending.slice(-INPUT_REDUNDANCY);
    const buf = encodeInputs(batch, this.latestTick);
    this.stats.bytesOut += buf.byteLength;
    this.transport.send(buf);
  }

  /** Drop inputs the server has processed; returns the ones still to replay. */
  ackUpTo(seq: number): NetInput[] {
    let i = 0;
    while (i < this.pending.length && this.pending[i]!.seq <= seq) i++;
    this.pending.splice(0, i);
    return this.pending;
  }

  close(): void {
    this.transport.close();
  }

  private receive(buf: ArrayBuffer): void {
    this.stats.bytesIn += buf.byteLength;
    const msg = decodeServerMessage(buf, (t) => this.baselines.get(t) ?? null);
    if (!msg) {
      this.stats.undecodable++;
      return;
    }
    switch (msg.type) {
      case "file":
        this.onFile?.(msg.file);
        break;
      case "welcome":
        this.playerId = msg.playerId;
        this.token = msg.token;
        this.levelName = msg.level;
        this.seed = msg.seed;
        this.status = "joined";
        this.stats.joinedAtMs = performance.now();
        this.latestTick = msg.tick;
        this.latestAt = performance.now();
        this.pingTimer = setInterval(() => this.transport.send(encodePing(performance.now() >>> 0)), 500);
        this.transport.send(encodePing(performance.now() >>> 0));
        this.onStatus?.(this.status);
        break;
      case "pong": {
        const rtt = (performance.now() >>> 0) - msg.clientTime;
        if (rtt >= 0 && rtt < 5000) {
          this.rttSamples.push(rtt);
          if (this.rttSamples.length > 8) this.rttSamples.shift();
          const sorted = [...this.rttSamples].sort((a, b) => a - b);
          this.rttMs = sorted[Math.floor(sorted.length / 2)]!;
        }
        break;
      }
      case "kick":
        this.status = "kicked";
        this.kickReason = msg.reason;
        this.onStatus?.(this.status);
        break;
      case "snapshot": {
        const s = msg.snapshot;
        if (s.tick <= this.latestTick && this.stats.snapshots > 0) break; // stale/out of order
        this.stats.snapshots++;
        this.latestTick = s.tick;
        this.latestAt = performance.now();
        this.baselines.set(s.tick, s);
        for (const t of this.baselines.keys()) if (t < s.tick - 120) this.baselines.delete(t);
        for (const p of s.players) {
          this.names.set(p.id, p.name);
          let list = this.remotes.get(p.id);
          if (!list) this.remotes.set(p.id, (list = []));
          list.push({ tick: s.tick, q: p });
          if (list.length > 40) list.shift();
        }
        for (const id of this.remotes.keys()) if (!s.players.some((p) => p.id === id)) this.remotes.delete(id);
        this.onSnapshot?.(s);
        break;
      }
    }
  }

  /** Interpolated remote players at the current view tick. */
  remoteViews(): RemoteView[] {
    const t = this.serverTickNow() - INTERP_DELAY_TICKS;
    const out: RemoteView[] = [];
    for (const [id, list] of this.remotes) {
      if (list.length === 0) continue;
      let a = list[0]!;
      let b = list[list.length - 1]!;
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i]!.tick <= t && list[i + 1]!.tick >= t) {
          a = list[i]!;
          b = list[i + 1]!;
          break;
        }
      }
      let k = b.tick === a.tick ? 1 : (t - a.tick) / (b.tick - a.tick);
      k = Math.max(0, Math.min(1, k));
      // beyond the newest sample: extrapolate briefly with velocity, then hold
      let x = a.q.x + (b.q.x - a.q.x) * k;
      let y = a.q.y + (b.q.y - a.q.y) * k;
      let z = a.q.z + (b.q.z - a.q.z) * k;
      if (t > b.tick) {
        const dt = Math.min(4, t - b.tick) / SIM_HZ;
        x = b.q.x + b.q.vx * dt;
        y = b.q.y + b.q.vy * dt;
        z = b.q.z + b.q.vz * dt;
      }
      let dy = b.q.yaw - a.q.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      out.push({
        id,
        name: this.names.get(id) ?? "BLANK",
        x, y, z,
        yaw: a.q.yaw + dy * k,
        pitch: a.q.pitch + (b.q.pitch - a.q.pitch) * k,
        height: b.q.height,
        alive: b.q.alive,
        stance: numToStance(b.q.stance),
        health: b.q.health,
      });
    }
    return out;
  }
}
