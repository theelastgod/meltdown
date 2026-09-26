/**
 * A tick is simultaneous, not a queue (Stage 653).
 *
 * `World.step` walked `players.values()` and resolved each player's fire requests inside that
 * player's own sub-step, so the damage from the first player in the map landed before the second
 * player's trigger had been read. `applyInput` then hit `if (!p.alive) return` and threw the second
 * player's shot away. Measured before this stage, on two files with the same loadout at the same
 * range, both holding fire from tick 1: whoever was added to the world first killed the other on
 * tick 44 and walked away on exactly 4.0 health — one shot from dead, never taking it. Reversing
 * the join order reversed the winner and nothing else. A trade kill could not happen at all.
 *
 * Every player now moves and pulls their trigger while they are all still standing, and only then
 * does any of it land.
 */
import { describe, expect, it } from "vitest";
import { World, type TickInput } from "../shared/sim/world";
import { drainageYard } from "../shared/sim/level";
import { Btn } from "../shared/sim/input";

/** Two files six metres apart, both holding fire, until somebody dies. */
function duel(firstId: number, secondId: number): { tick: number; kills: number; survivor: number } {
  const world = new World(drainageYard(), { ai: false });
  const a = world.addPlayer(firstId, `P${firstId}`);
  const b = world.addPlayer(secondId, `P${secondId}`);
  a.pos.x = 0;
  a.pos.z = 0;
  b.pos.x = 0;
  b.pos.z = 6;
  a.pos.y = 1;
  b.pos.y = 1;
  for (let t = 1; t <= 600; t++) {
    const frames = new Map<number, TickInput>();
    for (const p of [a, b]) {
      const other = p === a ? b : a;
      const look = world.aimAt(p, { x: other.pos.x, y: other.pos.y + 1.2, z: other.pos.z });
      frames.set(p.id, { tick: t, buttons: Btn.Fire, yaw: look.yaw, pitch: look.pitch });
    }
    world.step(frames);
    const kills = world.drainEvents().filter((e) => e.type === "kill" && e.victimKind === "player");
    // by id, never by "the one added first": a result keyed on position cannot see an order
    // dependence, because a world where the first player always wins looks the same from both ends
    if (kills.length > 0) return { tick: t, kills: kills.length, survivor: a.health > 0 ? a.id : b.health > 0 ? b.id : 0 };
  }
  return { tick: -1, kills: 0, survivor: a.health > 0 ? a.id : b.health > 0 ? b.id : 0 };
}

describe("a tick is simultaneous, not a queue", () => {
  it("two files shooting each other at the same instant both fall: a trade, not a win for whoever joined first", () => {
    const r = duel(1, 2);
    expect(r.tick, "somebody has to die inside 600 ticks or the duel proves nothing").toBeGreaterThan(0);
    expect(r.kills, "both shots were fired while both were alive, so both land").toBe(2);
    expect(r.survivor, "nobody walks away from a duel both files won").toBe(0);
  });

  it("and the join order decides nothing: the same duel from either end leaves the same file standing", () => {
    expect(duel(2, 1)).toEqual(duel(1, 2));
  });
});
