import { Game } from "./game";
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
};

game.start();
