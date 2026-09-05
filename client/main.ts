import { Game, type NetConfig } from "./game";
import type { NetClient } from "./net/netclient";
import type { BotStep } from "./bot";
import { SIM_HZ } from "@shared/sim/constants";
import type { SimEvent } from "@shared/sim/world";

/** Headless/state hook used by probes and CI. Everything here is read-only or deterministic. */
export interface GameHook {
  ready: true;
  simHz: number;
  game: Game;
  advance: (ticks: number) => void;
  setRealtime: (on: boolean) => void;
  setBot: (plan: BotStep[] | null) => void;
  botStatus: () => Game["botStatus"];
  state: () => {
    tick: number;
    pos: { x: number; y: number; z: number };
    vel: { x: number; y: number; z: number };
    yaw: number;
    pitch: number;
    stance: string;
    grounded: boolean;
    health: number;
    ammo: number;
    stats: typeof Game.prototype.player.stats;
    dummies: { id: number; alive: boolean; health: number; pos: { x: number; y: number; z: number } }[];
    loop: typeof Game.prototype.stats;
    audio: Record<string, number>;
    render: { post: boolean; district: string; frames: number; internalScale: number };
    hash: string;
  };
  events: () => SimEvent[];
  clearEvents: () => void;
  resumeAudio: () => void;
  setDrawing: (on: boolean) => void;
  connect: (cfg: NetConfig) => void;
  reconnect: () => void;
  disconnect: () => void;
  net: () => {
    online: boolean;
    status: string;
    playerId: number;
    token: string;
    rttMs: number;
    joinMs: number;
    pending: number;
    stats: NetClient["stats"];
    game: Game["netStats"];
    remotes: ReturnType<NetClient["remoteViews"]>;
    kickReason: string;
  } | null;
}

declare global {
  interface Window {
    __game: GameHook;
  }
}

const canvas = document.getElementById("view") as HTMLCanvasElement;
const hudRoot = document.getElementById("hud") as HTMLElement;
const game = new Game(canvas, hudRoot);

window.__game = {
  ready: true,
  simHz: SIM_HZ,
  game,
  advance: (n) => game.advance(n),
  setRealtime: (on) => {
    game.realtime = on;
  },
  setBot: (plan) => game.setBot(plan),
  botStatus: () => game.botStatus,
  state: () => ({
    tick: game.world.tick,
    pos: { ...game.player.pos },
    vel: { ...game.player.vel },
    yaw: game.player.yaw,
    pitch: game.player.pitch,
    stance: game.player.stance,
    grounded: game.player.grounded,
    health: game.player.health,
    ammo: game.player.ammo,
    stats: { ...game.player.stats },
    dummies: game.world.dummies.map((d) => ({ id: d.id, alive: d.alive, health: d.health, pos: { ...d.pos } })),
    loop: { ...game.stats },
    audio: { ...game.audio.fired },
    render: { post: !!game.renderer.post, district: game.renderer.district, frames: game.renderer.frames, internalScale: game.renderer.post.scale },
    hash: game.hash(),
  }),
  events: () => game.recentEvents.slice(),
  clearEvents: () => {
    game.recentEvents.length = 0;
  },
  resumeAudio: () => game.audio.resume(),
  setDrawing: (on) => {
    game.drawing = on;
  },
  connect: (cfg) => game.connect(cfg),
  reconnect: () => game.reconnect(),
  disconnect: () => game.net?.close(),
  net: () =>
    game.net
      ? {
          online: true,
          status: game.net.status,
          playerId: game.net.playerId,
          token: game.net.token,
          rttMs: game.net.rttMs,
          joinMs: game.net.stats.joinedAtMs ? game.net.stats.joinedAtMs - game.net.stats.connectStartMs : -1,
          pending: game.net.pendingInputs.length,
          stats: { ...game.net.stats },
          game: { ...game.netStats },
          remotes: game.net.remoteViews(),
          kickReason: game.net.kickReason,
        }
      : null,
};

// URL-driven connect: ?net=ws://host/room/name&name=ALPHA&lat=75&jitter=8&loss=0.05
{
  const q = new URLSearchParams(location.search);
  const url = q.get("net");
  if (url) {
    const lat = Number(q.get("lat") ?? 0);
    const loss = Number(q.get("loss") ?? 0);
    const jitter = Number(q.get("jitter") ?? 0);
    const seed = Number(q.get("seed") ?? 1);
    game.connect({ url, name: q.get("name") ?? "BLANK", sim: lat || loss || jitter ? { latencyMs: lat, jitterMs: jitter, loss, seed } : undefined });
  }
}

game.start();
