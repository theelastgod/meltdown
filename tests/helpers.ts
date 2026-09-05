import { Btn, type InputFrame } from "../shared/sim/input";
import { drainageYard } from "../shared/sim/level";
import { World, type SimEvent } from "../shared/sim/world";
import type { PlayerState } from "../shared/sim/player";

export interface Step {
  ticks: number;
  buttons?: number;
  yaw?: number;
  pitch?: number;
  /** Aim at a world point each tick (overrides yaw/pitch). */
  aimAt?: { x: number; y: number; z: number } | (() => { x: number; y: number; z: number });
}

export interface RunResult {
  world: World;
  player: PlayerState;
  events: SimEvent[];
  /** yaw/pitch carried across steps */
  yaw: number;
  pitch: number;
}

export function makeWorld(): { world: World; player: PlayerState } {
  const world = new World(drainageYard());
  const player = world.addPlayer(1, "TEST");
  return { world, player };
}

/** Run a scripted sequence of inputs and collect all events. */
export function run(world: World, player: PlayerState, script: Step[], carry?: { yaw: number; pitch: number }): RunResult {
  const events: SimEvent[] = [];
  let yaw = carry?.yaw ?? player.yaw;
  let pitch = carry?.pitch ?? player.pitch;
  for (const s of script) {
    for (let i = 0; i < s.ticks; i++) {
      if (s.aimAt) {
        const t = typeof s.aimAt === "function" ? s.aimAt() : s.aimAt;
        const a = world.aimAt(player, t);
        yaw = a.yaw;
        pitch = a.pitch;
      } else {
        if (s.yaw !== undefined) yaw = s.yaw;
        if (s.pitch !== undefined) pitch = s.pitch;
      }
      const frame: InputFrame = { tick: world.tick, buttons: s.buttons ?? 0, yaw, pitch };
      world.step(new Map([[player.id, frame]]));
      events.push(...world.drainEvents());
    }
  }
  return { world, player, events, yaw, pitch };
}

export const SPRINT = Btn.Forward | Btn.Sprint;
export { Btn };
