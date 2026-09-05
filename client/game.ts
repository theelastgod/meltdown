import { MAX_CATCHUP_TICKS, SIM_DT, SIM_HZ } from "@shared/sim/constants";
import type { InputFrame } from "@shared/sim/input";
import { DEFAULT_LEVEL_ID, levelById, LEVEL_IDS } from "@shared/sim/level";
import { eyeHeight, type PlayerState } from "@shared/sim/player";
import { hashWorld, World, type SimEvent } from "@shared/sim/world";
import { lenXZ, wrapAngle } from "@shared/math/vec3";
import { GameAudio } from "./audio";
import { Bot, type BotStep, type BotTarget } from "./bot";
import { Hud } from "./hud/hud";
import { GhostFile } from "./file";
import { InputController } from "./input";
import { Renderer, type ViewState } from "./render/renderer";
import { NetClient } from "./net/netclient";
import { SimulatedLink, WsTransport, type LinkSim } from "./net/transport";
import { ENT_CLOUD, ENT_MECH, ENT_NODE, ENT_PROJECTILE, ENT_WASP, FX, type NetInput, type Snapshot as NetSnapshot } from "@shared/net/protocol";
import type { NodeView } from "./render/wake";
import { WEAPONS, WEAPON_LIST } from "@shared/weapons/manifest";
import { weaponDefOf } from "@shared/sim/player";

export interface NetConfig {
  url: string;
  name: string;
  token?: string;
  sim?: LinkSim;
}

interface Snapshot {
  x: number;
  y: number;
  z: number;
  eye: number;
  yaw: number;
  pitch: number;
  kickPitch: number;
  kickYaw: number;
}

const snap = (p: PlayerState): Snapshot => ({
  x: p.pos.x,
  y: p.pos.y,
  z: p.pos.z,
  eye: eyeHeight(p),
  yaw: p.yaw,
  pitch: p.pitch,
  kickPitch: p.weapon.kickPitch,
  kickYaw: p.weapon.kickYaw,
});

const lerpAngle = (a: number, b: number, t: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/**
 * Client game: fixed-timestep simulation (SIM_HZ) decoupled from rendering
 * (rAF), with render-time interpolation between the last two sim states.
 */
export class Game {
  readonly world: World;
  /** Level id this client built (URL `?level=`; the room's Welcome must agree or the client travels). */
  readonly levelId: string;
  /** Local player. Offline: created at construction. Online: created on Welcome; a placeholder until then. */
  player: PlayerState;
  net: NetClient | null = null;
  private netConfig: NetConfig | null = null;
  /** Online: true once the first authoritative local state arrived; prediction starts then. */
  synced = false;
  readonly netStats = { corrections: 0, maxCorrectionM: 0, replayedInputs: 0, serverHitsOnMe: 0, myHits: 0, myShotsConfirmed: 0, log: [] as { tick: number; corr: number; ack: number; pendingBefore: number; replayed: number; wasAlive: boolean; stance: string }[] };
  readonly input: InputController;
  readonly renderer: Renderer;
  readonly hud: Hud;
  readonly file: GhostFile;
  readonly audio = new GameAudio();
  private bot: Bot | null = null;
  private prev: Snapshot;
  private cur: Snapshot;
  private acc = 0;
  private last = -1;
  /** When false the rAF loop only renders; the sim advances via advance(). `?headless=1` starts paused. */
  realtime = !new URLSearchParams(location.search).has("headless");
  /** When false, the loop simulates but skips drawing (probes on software GL). */
  drawing = !new URLSearchParams(location.search).has("norender");
  hitmarkers = false;
  readonly recentEvents: SimEvent[] = [];
  readonly stats = { ticks: 0, frames: 0, droppedTime: 0, fps: 0, simHz: 0, wallStart: 0, realtimeWall: 0, realtimeTicks: 0, maxFrameDt: 0, catchupHits: 0 };
  private stepDist = 0;
  private stepSide = 1;
  private fpsWindow = { t: 0, frames: 0, ticks: 0 };

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    const q = new URLSearchParams(location.search);
    this.levelId = LEVEL_IDS.includes(q.get("level") ?? "") ? q.get("level")! : DEFAULT_LEVEL_ID;
    this.world = new World(levelById(this.levelId), { ai: q.get("ai") !== "0", seed: Number(q.get("seed") ?? 1) || 1, wakePhase: q.get("wake") === "0" ? "off" : "wake" });
    this.file = new GhostFile(() => this.online);
    this.player = this.world.addPlayer(1, "BLANK", 1, this.file.localLoadout());
    this.input = new InputController(canvas);
    this.input.yaw = this.player.yaw;
    this.renderer = new Renderer(canvas, this.world.level);
    this.hud = new Hud(hudRoot);
    this.hud.setLevel(this.world.level, (id) => this.travel(id));
    this.file.mount(hudRoot);
    this.hud.setFile(this.file.view());
    this.file.onChange = (f) => {
      // offline the loadout applies at once; online the server decides at the next link
      if (!this.online) this.world.setLoadout(this.player, f.localLoadout());
      this.hud.setFile(f.view());
    };
    this.file.onStamp = (lines, ranks, challenges) => {
      // a first, verified by the server: the CRT stutters and the line commits
      for (const l of lines) {
        this.hud.push(`STAMP · ${l}`, "am");
        this.hud.alert(`◆ ATTESTED — ${l}`, true, 3.5);
      }
      for (const r of ranks) this.hud.push(`MASTERY · ${r.replace(":r", " → RANK ").replace(/_/g, " ").toUpperCase()}`, "cy");
      for (const c of challenges) this.hud.push(`CHALLENGE CLEARED · ${c.replace(/_/g, " ").toUpperCase()}`, "cy");
      if (lines.length || ranks.length) this.renderer.post.kick(0.6);
    };
    this.prev = snap(this.player);
    this.cur = snap(this.player);
    this.input.onGesture = () => this.audio.resume();
    this.input.onLockChange = (l) => this.hud.setLocked(l);
    this.renderer.syncDummies(this.world.dummies);
  }

  get online(): boolean {
    return this.net !== null;
  }

  /** Connect to a room. The offline world is replaced by a server-fed one. */
  connect(cfg: NetConfig): void {
    this.netConfig = cfg;
    this.synced = false;
    this.world.removePlayer(this.player.id);
    const inner = new WsTransport(cfg.url);
    const transport = cfg.sim ? new SimulatedLink(inner, cfg.sim) : inner;
    const net = new NetClient(transport, cfg.name, cfg.token ?? "", this.file.account, this.file.loadoutJson());
    this.net = net;
    net.onFile = (f) => {
      this.file.applyServer(f);
      if (f.reason === "join" && this.net === net) {
        // the server admitted this loadout: run the same sheet locally (arrives before the first snapshot)
        this.world.setLoadout(this.player, f.loadout as Parameters<World["setLoadout"]>[1]);
        this.hud.push(`FILE ${f.account} · DEPTH ${String(f.depth).padStart(2, "0")} · ATTESTED [${f.loadout.attested.join(", ") || "none"}]${f.loadout.keystone ? " · " + f.loadout.keystone.toUpperCase() : ""}`, "cy");
      } else if (f.reason === "settle") {
        for (const line of f.ledger) this.hud.push(line, line.startsWith("DEPTH") ? "mg" : "am");
        this.hud.alert(`◆ LEDGER SETTLED — ${f.ledger[2] ?? ""}`, false, 5);
      }
    };
    net.onStatus = (st) => {
      if (st === "joined") {
        if (net.levelName && net.levelName !== this.levelId && LEVEL_IDS.includes(net.levelName)) {
          // the room plays a different district: travel there (a fresh world and renderer for that level)
          this.hud.alert(`◆ TRAVELLING — ${net.levelName.replace(/_/g, " ").toUpperCase()}`, false, 3);
          this.travel(net.levelName);
          return;
        }
        (this.world as { seed: number }).seed = net.seed;
        this.player = this.world.addPlayer(net.playerId, cfg.name, 1, this.file.admitted ?? this.file.localLoadout());
        this.input.yaw = this.player.yaw;
        this.hud.push(`LINKED · ROOM ${cfg.url.split("/").pop()} · FILE #${net.playerId}`, "cy");
      } else this.hud.push(`LINK ${st.toUpperCase()}${net.kickReason ? " · " + net.kickReason : ""}`, "mg");
    };
    net.onSnapshot = (snap) => this.onSnapshot(snap);
    this.hud.push(`LINKING ${cfg.url}${cfg.sim ? ` (sim ${cfg.sim.latencyMs * 2}ms rtt, ${(cfg.sim.loss * 100).toFixed(0)}% loss)` : ""}`, "k");
  }

  /** Travel to another district: the world and renderer are built per level, so the page reloads with `?level=`. */
  travel(levelId: string): void {
    if (!LEVEL_IDS.includes(levelId) || levelId === this.levelId) return;
    const u = new URL(location.href);
    u.searchParams.set("level", levelId);
    if (this.net?.token) u.searchParams.set("token", this.net.token);
    this.renderer.post.kick(1);
    setTimeout(() => location.replace(u.toString()), 120);
  }

  /** Rejoin the same room with the session token (state is restored server-side). */
  reconnect(): void {
    if (!this.netConfig || !this.net) return;
    const token = this.net.token;
    this.net.close();
    this.connect({ ...this.netConfig, token });
  }

  private onSnapshot(ns: NetSnapshot): void {
    const net = this.net!;
    if (net.status !== "joined") return;
    const p = this.player;
    // dummies are server-driven online
    for (const d of ns.dummies) {
      const local = this.world.dummies.find((x) => x.id === d.id);
      if (!local) continue;
      local.alive = d.alive;
      local.health = d.health;
      local.pos.x = d.x;
      local.pos.y = d.y;
      local.pos.z = d.z;
    }
    if (ns.local) {
      const before = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
      const wasSynced = this.synced;
      const wasAlive = p.alive;
      const pendingBefore = net.pendingInputs.length;
      const yawBefore = p.yaw;
      const velBefore = [+p.vel.x.toFixed(2), +p.vel.z.toFixed(2)];
      const lastIn = net.pendingInputs[net.pendingInputs.length - 1];
      this.world.importLocal(p, ns.local);
      const replay = net.ackUpTo(ns.local.seq);
      for (const r of replay) this.world.applyInput(p, r, { predictOnly: true, silent: true });
      this.netStats.replayedInputs += replay.length;
      if (wasSynced && wasAlive && p.alive) {
        const corr = Math.hypot(p.pos.x - before.x, p.pos.y - before.y, p.pos.z - before.z);
        if (corr > 0.001) this.netStats.corrections++;
        if (corr > this.netStats.maxCorrectionM) this.netStats.maxCorrectionM = corr;
        if (corr > 0.02 && this.netStats.log.length < 12) this.netStats.log.push({ tick: ns.tick, corr, ack: ns.local.seq, pendingBefore, replayed: replay.length, wasAlive, stance: p.stance, yawBefore: +yawBefore.toFixed(4), yawAfter: +p.yaw.toFixed(4), yawSrv: +ns.local.yaw.toFixed(4), yawIn: lastIn ? +lastIn.yaw.toFixed(4) : 0, velBefore, velAfter: [+p.vel.x.toFixed(2), +p.vel.z.toFixed(2)] } as never);
      }
      this.synced = true;
      this.prev = this.cur = snap(p);
      this.world.tick = ns.tick;
    }
    this.netEntities = ns.entities;
    this.netMatch = ns.match;
    for (const ev of ns.events) this.onNetEvent(ev);
  }

  private onNetEvent(ev: NetSnapshot["events"][number]): void {
    const me = this.player.id;
    switch (ev.type) {
      case "shot": {
        const hit = ev.hitKind >= 2;
        const def = WEAPON_LIST[ev.weapon - 1];
        const color = def?.tracer ?? 0xffb02e;
        if (ev.playerId === me) {
          this.netStats.myShotsConfirmed++;
          if (hit) {
            this.netStats.myHits++;
            this.audio.hit(ev.zone ?? "body");
            if (ev.hitKind === 2) this.renderer.flashDummy(ev.victimId);
            if (this.hitmarkers) this.hud.flashHit();
          }
        } else {
          if (ev.weapon === 4) this.renderer.fx.beam({ x: ev.fx, y: ev.fy, z: ev.fz }, { x: ev.tx, y: ev.ty, z: ev.tz }, color, 0.05, 0.6);
          else this.renderer.tracer({ x: ev.fx, y: ev.fy, z: ev.fz }, { x: ev.tx, y: ev.ty, z: ev.tz }, ev.hitKind === 1, true, color);
          if (ev.weapon === 0) this.audio.shot("wasp");
          else if (def) this.audio.shot(def.id);
          if (ev.hitKind === 3 && ev.victimId === me) {
            this.netStats.serverHitsOnMe++;
            this.audio.hurt();
            this.hud.alert("▲ INTEGRITY BREACH", true, 1);
          }
        }
        break;
      }
      case "fx": {
        const pos = { x: ev.x, y: ev.y, z: ev.z };
        switch (ev.kind) {
          case FX.explode:
            this.renderer.fx.explosion(pos, ev.a / 10, ev.b === 3 ? 0xffb02e : 0x8f4dff, ev.b === 3);
            this.audio.explosion(ev.b === 3);
            break;
          case FX.cloud:
            this.audio.smoke();
            break;
          case FX.emp:
            this.audio.emp();
            this.renderer.fx.explosion(pos, ev.a / 10, 0x35f2ff, false);
            break;
          case FX.flagged:
            if (ev.playerId === me) this.hud.flagged();
            break;
          case FX.stun:
            if (ev.playerId === me) {
              this.audio.stun();
              this.renderer.post.kick(0.8);
            }
            break;
          case FX.mechBeam:
            this.renderer.fx.beam({ x: ev.x, y: ev.y + 2.5, z: ev.z }, pos, 0xffb02e, 0.08, 0.35);
            if (ev.playerId === me) this.audio.mechBeam();
            break;
          case FX.hurt:
            if (ev.playerId === me) {
              this.audio.hurt();
              this.hud.alert(`▲ INTEGRITY −${ev.a}`, true, 0.8);
            }
            break;
          case FX.waspDeath:
            this.hud.push(`WASP-${String(ev.a).padStart(2, "0")} DOWNED`, "am");
            break;
          case FX.mechDeath:
            this.hud.push(`REPO MECH ${ev.a} DISABLED`, "am");
            break;
          case FX.nodeFlip: {
            const n = this.netEntities.find((e) => e.kind === ENT_NODE && e.id === ev.a);
            if (n) this.renderer.wake.flip({ x: n.x, y: n.y, z: n.z }, ev.b);
            this.audio.nodeFlip(ev.b === this.player.team);
            this.renderer.post.kick(0.5);
            this.hud.push(`NODE ${["", "A", "B", "C", "D", "E"][ev.a] ?? ev.a} — CELL ${ev.b === 1 ? "ONE" : "TWO"}`, ev.b === 1 ? "gr" : "cy");
            break;
          }
          case FX.nodeContest:
            this.hud.alert(`◆ NODE ${["", "A", "B", "C", "D", "E"][ev.a] ?? ev.a} CONTESTED`, true, 1.5);
            this.audio.contest();
            break;
          case FX.kernelPulse:
            this.hud.alert(`◆ KERNEL PULSE — NODE ${["", "A", "B", "C", "D", "E"][ev.a] ?? ev.a} ${ev.b ? "RE-LEASED" : "DRAINED"}`, true, 2.5);
            this.audio.kernelPulse();
            this.renderer.post.kick(0.8);
            break;
          case FX.phase:
            this.hud.alert(ev.a === 1 ? "◆ THE WAKE BEGINS" : ev.a === 2 ? `◆ ROUND OVER — ${ev.b ? `CELL ${ev.b === 1 ? "ONE" : "TWO"} WOKE THE YARD` : "NO ONE WOKE"}` : "◆ WARM-UP", false, 4);
            this.renderer.post.kick(1);
            break;
          case FX.fullWake:
            this.hud.alert("◆ FULL WAKE — THE YARD IS OFF THE MODEL", false, 5);
            this.renderer.post.kick(1);
            break;
          default:
            break;
        }
        break;
      }
      case "kill":
        if (ev.playerId === me) {
          this.audio.kill();
          this.hud.killStamp();
          this.renderer.post.kick(1);
          const vk = ["DUMMY", "FILE", "WASP", "MECH"][ev.victimKind] ?? "?";
          this.hud.push(`FILE #${me} ⟶ ${vk}-${String(ev.victimId).padStart(2, "0")}${ev.ttkTicks ? ` · TTK ${(ev.ttkTicks / SIM_HZ).toFixed(2)}s` : ""}`, "mg");
        } else this.hud.push(`FILE #${ev.playerId} ⟶ ${["DUMMY", "FILE", "WASP", "MECH"][ev.victimKind] ?? "?"}-${String(ev.victimId).padStart(2, "0")}`, "k");
        break;
      case "death":
        if (ev.playerId === me) {
          this.hud.alert("◆ FILE CLOSED — RE-LEASING IN 3s", true, 3);
          this.renderer.post.kick(1);
        }
        break;
      case "join":
        this.hud.push(`FILE #${ev.playerId} (${ev.name}) ENTERED THE YARD`, "cy");
        break;
      case "leave":
        this.hud.push(`FILE #${ev.playerId} DROPPED OFF THE LEDGER`, "k");
        break;
    }
  }

  private botTargets(): BotTarget[] {
    if (!this.net) return [];
    return this.net.remoteViews().map((v) => ({ id: v.id, x: v.x, y: v.y, z: v.z, height: v.height, alive: v.alive }));
  }

  private lastFrameAt = 0;

  start(): void {
    this.stats.wallStart = performance.now();
    const loop = () => {
      // one clock for both drivers: rAF timestamps lag performance.now() under load and would double-count
      this.frame(performance.now(), true);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // Hidden tabs get no animation frames; keep the simulation (and the net link) alive on a timer.
    setInterval(() => {
      const now = performance.now();
      if (now - this.lastFrameAt > 60) this.frame(now, false);
    }, 16);
  }

  /** Attach a scripted driver; passing null returns control to the keyboard. */
  setBot(plan: BotStep[] | null): void {
    this.bot = plan ? new Bot(plan, this.player.yaw) : null;
    this.hud.setLocked(!!plan || this.input.isLocked);
    if (!plan) {
      this.input.yaw = this.player.yaw;
      this.input.pitch = this.player.pitch;
    }
  }

  get botStatus(): { done: boolean; log: string[]; killed: boolean; current: BotStep | undefined } | null {
    return this.bot ? { done: this.bot.done, log: this.bot.log, killed: this.bot.killed, current: this.bot.current } : null;
  }

  /** Run exactly n ticks now (deterministic; used by probes). */
  advance(n: number): void {
    for (let i = 0; i < n; i++) this.tick();
  }

  hash(): string {
    return hashWorld(this.world);
  }

  private tick(): void {
    const t = this.world.tick;
    if (this.net) {
      // Online: predict the local player only; the server owns everything else.
      if (this.net.status !== "joined" || !this.synced) return;
      const frame: InputFrame = this.bot ? this.bot.sample(this.world, this.player, t, this.botTargets()) : this.input.sample(t);
      // apply exactly what the wire carries (angles quantized to 1e-4 rad) so prediction and server agree bit for bit
      // wrap first: the wire's i16 cannot carry angles beyond ±3.2767 rad, and both sides must apply the same value
      frame.yaw = Math.round(wrapAngle(frame.yaw) * 10000) / 10000;
      frame.pitch = Math.round(Math.max(-1.55, Math.min(1.55, frame.pitch)) * 10000) / 10000;
      const ni: NetInput = { ...frame, seq: this.net.nextSeq(), viewTick: this.net.viewTick(), px: 0, py: 0, pz: 0 };
      this.world.applyInput(this.player, ni, { predictOnly: true });
      ni.px = this.player.pos.x;
      ni.py = this.player.pos.y;
      ni.pz = this.player.pos.z;
      this.net.sendInput(ni);
      this.world.tick++;
    } else {
      const frame: InputFrame = this.bot ? this.bot.sample(this.world, this.player, t) : this.input.sample(t);
      this.world.step(new Map([[this.player.id, frame]]));
    }
    this.stats.ticks++;
    this.prev = this.cur;
    this.cur = snap(this.player);
    for (const ev of this.world.drainEvents()) this.onEvent(ev);
    this.footsteps();
    this.renderer.syncDummies(this.world.dummies);
  }

  private chargeTick = 0;

  /** Latest wake state for the HUD (offline: the world's; online: the snapshot's). */
  private wakeHud: { phase: string; timeLeft: number; score: [number, number, number]; nodes: { id: number; label: string; owner: number; hold: number; contested: boolean; puller: number }[] } | null = null;
  private lastNodeOwners = new Map<number, number>();

  private nodeViewsOffline(): NodeView[] {
    const w = this.world.wake;
    if (!w) return [];
    return w.nodes.map((n) => ({ id: n.id, label: n.label, pos: n.pos, owner: n.owner, hold: n.hold, contested: n.contested, puller: n.puller, boost: n.boost > 0, links: n.links }));
  }

  private syncOfflineEntities(): void {
    const w = this.world;
    if (w.wake) {
      const views = this.nodeViewsOffline();
      this.renderer.wake.sync(views);
      this.wakeHud = { phase: w.wake.phase, timeLeft: w.wake.timeLeft, score: w.wake.score, nodes: views };
    }
    this.renderer.fx.syncProjectiles(w.projectiles.map((p) => ({ id: p.id, kind: p.kind, pos: p.pos, stuck: p.stuck })));
    this.renderer.fx.syncClouds(w.clouds.map((c) => ({ id: c.id, pos: c.pos, radius: c.radius })));
    this.renderer.fx.syncWasps(w.wasps.map((x) => ({ id: x.id, pos: x.pos, yaw: x.yaw, alive: x.alive, state: x.disabledTimer > 0 ? 2 : x.state === "chase" ? 1 : 0 })));
    this.renderer.fx.syncMechs(w.mechs.map((m) => ({ id: m.id, pos: m.pos, yaw: m.yaw, lightYaw: m.face + m.lightYaw, alive: m.alive, locked: m.targetId >= 0 })));
  }

  private netEntities: NetSnapshot["entities"] = [];

  private netMatch: NetSnapshot["match"] = null;

  private syncNetEntities(): void {
    const kinds = ["phage", "phage", "sticky", "frag", "smoke", "emp"] as const;
    const ents = this.netEntities;
    const labels = ["", "A", "B", "C", "D", "E", "F", "G", "H"];
    const nodes: NodeView[] = ents
      .filter((e) => e.kind === ENT_NODE)
      .map((e) => ({ id: e.id, label: labels[e.id] ?? String(e.id), pos: { x: e.x, y: e.y, z: e.z }, owner: e.a, hold: e.b / 100, contested: !!(e.c & 1), puller: (e.c >> 1) & 3, boost: !!(e.c & 8), links: [1, 2, 3, 4, 5, 6, 7, 8].filter((l) => e.d & (1 << l)) }));
    if (nodes.length) {
      this.renderer.wake.sync(nodes);
      const m = this.netMatch;
      this.wakeHud = { phase: m ? (m.phase === 0 ? "warmup" : m.phase === 1 ? "wake" : "results") : "wake", timeLeft: m?.timeLeft ?? 0, score: [0, m?.score1 ?? 0, m?.score2 ?? 0], nodes };
    }
    this.renderer.fx.syncProjectiles(ents.filter((e) => e.kind === ENT_PROJECTILE).map((e) => ({ id: e.id, kind: kinds[e.a] ?? "phage", pos: { x: e.x, y: e.y, z: e.z }, stuck: e.b === 1 })));
    this.renderer.fx.syncClouds(ents.filter((e) => e.kind === ENT_CLOUD).map((e) => ({ id: e.id, pos: { x: e.x, y: e.y, z: e.z }, radius: e.c / 100 })));
    this.renderer.fx.syncWasps(ents.filter((e) => e.kind === ENT_WASP).map((e) => ({ id: e.id, pos: { x: e.x, y: e.y, z: e.z }, yaw: e.c / 1000, alive: e.a === 1, state: e.d })));
    this.renderer.fx.syncMechs(ents.filter((e) => e.kind === ENT_MECH).map((e) => ({ id: e.id, pos: { x: e.x, y: e.y, z: e.z }, yaw: e.c / 1000, lightYaw: e.d / 1000, alive: e.a === 1, locked: false })));
  }

  private footsteps(): void {
    if (this.player.weapon.charging) {
      this.chargeTick++;
      if (this.chargeTick % 6 === 0) this.audio.charge(this.player.weapon.charge);
    }
    const p = this.player;
    const sp = lenXZ(p.vel);
    if (p.grounded && sp > 0.8 && p.stance !== "slide") {
      this.stepDist += sp * SIM_DT;
      const stride = p.stance === "crouch" ? 1.2 : 1.9 + sp * 0.06;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        this.stepSide = -this.stepSide;
        this.audio.footstep(sp, this.stepSide * 0.25);
      }
    } else this.stepDist = Math.min(this.stepDist, 0.5);
  }

  private onEvent(ev: SimEvent): void {
    this.recentEvents.push(ev);
    if (this.recentEvents.length > 1500) this.recentEvents.shift();
    switch (ev.type) {
      case "shot": {
        const mine = ev.playerId === this.player.id;
        const def = ev.weapon === "wasp" ? null : WEAPONS[ev.weapon];
        const color = def?.tracer ?? 0xffb02e;
        if (mine) this.audio.shot(ev.weapon);
        else if (ev.weapon === "wasp") this.audio.shot("wasp");
        if (ev.weapon === "longwave") this.renderer.fx.beam(ev.from, ev.to, color, 0.05, 0.6);
        else this.renderer.tracer(ev.from, ev.to, ev.hit.kind === "world", !mine, color);
        if (!this.net && mine && ev.hits.length) {
          const h = ev.hits[0]!;
          this.audio.hit(h.zone ?? "body");
          if (h.kind === "dummy") this.renderer.flashDummy(h.id);
          if (this.hitmarkers) this.hud.flashHit();
        }
        break;
      }
      case "melee":
        if (ev.playerId === this.player.id) {
          this.audio.shot("shock_baton");
          if (ev.hits.length) {
            this.audio.hit("body");
            for (const h of ev.hits) if (h.kind === "dummy") this.renderer.flashDummy(h.id);
          }
          if (ev.lunge) this.renderer.post.kick(0.4);
        }
        break;
      case "explode":
        this.renderer.fx.explosion(ev.pos, ev.radius, ev.projKind === "frag" ? 0xffb02e : 0x8f4dff, ev.projKind === "frag");
        this.audio.explosion(ev.projKind === "frag");
        if (Math.hypot(ev.pos.x - this.player.pos.x, ev.pos.z - this.player.pos.z) < ev.radius * 2) this.renderer.post.kick(0.6);
        break;
      case "cloud":
        this.audio.smoke();
        break;
      case "emp":
        this.audio.emp();
        this.renderer.fx.explosion(ev.pos, ev.radius, 0x35f2ff, false);
        if (Math.hypot(ev.pos.x - this.player.pos.x, ev.pos.z - this.player.pos.z) < ev.radius) this.renderer.post.kick(1);
        break;
      case "stun":
        if (ev.playerId === this.player.id) {
          this.audio.stun();
          this.renderer.post.kick(0.8);
        }
        break;
      case "flagged":
        if (ev.playerId === this.player.id) {
          this.hud.flagged();
          if (this.world.tick % 30 === 0) this.audio.flagged();
        }
        break;
      case "mechBeam":
        this.renderer.fx.beam(ev.from, ev.to, 0xffb02e, 0.08, 0.35);
        if (ev.playerId === this.player.id) {
          this.audio.mechBeam();
          this.renderer.post.kick(0.5);
        }
        break;
      case "hurt":
        if (ev.playerId === this.player.id) {
          this.audio.hurt();
          this.hud.alert(`▲ INTEGRITY −${ev.damage}`, true, 0.8);
        }
        break;
      case "swap":
        if (ev.playerId === this.player.id) this.audio.swap();
        break;
      case "reloadSeat":
        if (ev.playerId === this.player.id) this.audio.reload("seat");
        break;
      case "reloadCancel":
        break;
      case "chargeStart":
      case "chargeCancel":
      case "altToggle":
      case "fire":
        break;
      case "chargeFull":
        if (ev.playerId === this.player.id) this.audio.charge(1);
        break;
      case "lunge":
        if (ev.playerId === this.player.id) this.audio.jump();
        break;
      case "throw":
        if (ev.playerId === this.player.id) this.audio.throw();
        break;
      case "nodeFlip": {
        const n = this.world.wake?.nodes.find((x) => x.id === ev.node);
        if (n) this.renderer.wake.flip(n.pos, ev.team);
        this.audio.nodeFlip(ev.team === this.player.team);
        this.renderer.post.kick(0.5);
        this.hud.push(`NODE ${n?.label ?? ev.node} ${ev.from === 0 ? "PULLED OFF THE MODEL" : "TAKEN"} — CELL ${ev.team === 1 ? "ONE" : "TWO"}`, ev.team === 1 ? "gr" : "cy");
        break;
      }
      case "nodeContest": {
        const n = this.world.wake?.nodes.find((x) => x.id === ev.node);
        this.hud.alert(`◆ NODE ${n?.label ?? ev.node} CONTESTED`, true, 1.5);
        this.audio.contest();
        break;
      }
      case "kernelPulse": {
        const n = this.world.wake?.nodes.find((x) => x.id === ev.node);
        this.hud.alert(`◆ KERNEL PULSE — NODE ${n?.label ?? ev.node} ${ev.released ? "RE-LEASED" : "DRAINED"}`, true, 2.5);
        this.audio.kernelPulse();
        this.renderer.post.kick(0.8);
        break;
      }
      case "phase":
        this.hud.alert(ev.phase === "wake" ? "◆ THE WAKE BEGINS — PULL THE NODES OFF THE MODEL" : ev.phase === "results" ? `◆ ROUND OVER — ${ev.winner ? `CELL ${ev.winner === 1 ? "ONE" : "TWO"} WOKE THE YARD` : "NO ONE WOKE"}` : "◆ WARM-UP", false, 4);
        this.audio.kernelPulse();
        this.renderer.post.kick(1);
        break;
      case "fullWake":
        this.hud.alert("◆ FULL WAKE — THE YARD IS OFF THE MODEL", false, 5);
        this.audio.nodeFlip(true);
        this.renderer.post.kick(1);
        break;
      case "waspDeath":
        this.hud.push(`WASP-${String(ev.waspId).padStart(2, "0")} DOWNED`, "am");
        this.audio.explosion(false);
        break;
      case "mechDeath":
        this.hud.push(`REPO MECH ${ev.mechId} DISABLED — VANTAGE RE-LEASING`, "am");
        this.audio.explosion(true);
        this.renderer.post.kick(1);
        break;
      case "kill":
        this.audio.kill();
        this.hud.killStamp();
        this.renderer.post.kick(1);
        this.hud.push(`BLANK ⟶ ${ev.victimKind.toUpperCase()}-${String(ev.victimId).padStart(2, "0")} · ${ev.weapon.toUpperCase()}${ev.ttkTicks ? ` · TTK ${ev.ttkSeconds.toFixed(2)}s` : ""}`, "mg");
        break;
      case "slide":
        this.audio.slide();
        break;
      case "slideJump":
        this.audio.jump();
        this.hud.push("SLIDE-JUMP", "k");
        break;
      case "jump":
        this.audio.jump();
        break;
      case "land":
        this.audio.land(ev.speed);
        break;
      case "mantle":
        this.audio.mantle();
        this.hud.push("MANTLE", "k");
        break;
      case "reloadStart":
        this.audio.reload("start");
        break;
      case "reloadEnd":
        this.audio.reload("end");
        break;
      case "dryFire":
        this.audio.dryFire();
        break;
      case "dummyRespawn":
        this.hud.push(`DUMMY-${String(ev.dummyId).padStart(2, "0")} RE-LEASED`, "am");
        this.hud.alert(`◆ VANTAGE RE-LEASE — DUMMY-${String(ev.dummyId).padStart(2, "0")} back on the ledger`, true);
        break;
      case "mantleEnd":
      case "slideEnd":
      case "death":
      case "respawn":
        break;
      default:
        break;
    }
  }

  private frame(now: number, render: boolean): void {
    this.lastFrameAt = now;
    if (this.last < 0) this.last = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.5) {
      // a tab switch or a very long hitch: drop the excess rather than simulate it
      this.stats.droppedTime += dt - 0.5;
      dt = 0.5;
    }
    if (this.realtime) {
      this.acc += dt;
      this.stats.realtimeWall += dt;
      if (dt > this.stats.maxFrameDt) this.stats.maxFrameDt = dt;
      let n = 0;
      while (this.acc >= SIM_DT && n < MAX_CATCHUP_TICKS) {
        this.tick();
        this.acc -= SIM_DT;
        n++;
      }
      this.stats.realtimeTicks += n;
      if (n === MAX_CATCHUP_TICKS && this.acc > SIM_DT) {
        this.stats.catchupHits++;
        this.stats.droppedTime += this.acc;
        this.acc = 0;
      }
    }
    const alpha = this.realtime ? Math.min(1, this.acc / SIM_DT) : 1;
    const a = this.prev;
    const b = this.cur;
    const p = this.player;
    const view: ViewState = {
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      eye: b.eye,
      yaw: lerpAngle(a.yaw, b.yaw, alpha),
      pitch: a.pitch + (b.pitch - a.pitch) * alpha,
      kickPitch: a.kickPitch + (b.kickPitch - a.kickPitch) * alpha,
      kickYaw: a.kickYaw + (b.kickYaw - a.kickYaw) * alpha,
      speed: lenXZ(p.vel),
      grounded: p.grounded,
      stance: p.stance,
      reloading: p.weapon.reloadTimer > 0 && p.weapon.reloadTotal > 0 ? 1 - p.weapon.reloadTimer / p.weapon.reloadTotal : 0,
      slot: p.weapon.slot,
      zoom: p.weapon.altActive && weaponDefOf(p).alt.kind === "ads" ? weaponDefOf(p).alt.zoom ?? 1 : 1,
      charge: p.weapon.charging ? p.weapon.charge : 0,
      stunned: p.weapon.stunTimer > 0,
    };
    this.input.currentSlot = p.weapon.slot;
    // Local view is not interpolated when the keyboard drives it: mouse look
    // must feel immediate, so use the live input angles.
    if (!this.bot && this.input.isLocked) {
      view.yaw = this.input.yaw;
      view.pitch = this.input.pitch;
    }
    if (!render || !this.drawing) return;
    if (this.net) this.renderer.syncRemotes(this.net.remoteViews());
    if (!this.net) this.syncOfflineEntities();
    else this.syncNetEntities();
    this.renderer.render(view, dt);
    this.stats.frames++;
    this.fpsWindow.frames++;
    this.fpsWindow.t += dt;
    if (this.fpsWindow.t >= 0.5) {
      this.stats.fps = this.fpsWindow.frames / this.fpsWindow.t;
      this.stats.simHz = (this.stats.ticks - this.fpsWindow.ticks) / this.fpsWindow.t;
      this.fpsWindow = { t: 0, frames: 0, ticks: this.stats.ticks };
    }
    this.hud.update(p, view.speed, this.stats.fps, this.realtime ? this.stats.simHz : SIM_HZ, this.world.dummies);
    if (this.wakeHud) this.hud.wake(this.wakeHud, p.team);
  }
}
