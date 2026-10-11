/**
 * Buying or finding the Neon Edge puts it in the hand. The swap does not heal.
 * A death in this room comes back holding it. Another gun still respawns on the primary.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withSlot } from "../shared/sim/input";
import { drainageYard } from "../shared/sim/level";
import { respawnPlayer } from "../shared/sim/player";
import { World } from "../shared/sim/world";
import { WEAPONS } from "../shared/weapons/manifest";

describe("the neon edge in the hand", () => {
  it("a slot request draws the sword without healing, and a death in this room keeps it", () => {
    const world = new World(drainageYard(), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const p = world.addPlayer(1, "A", 1);
    expect(p.weapon.slot).toBe(WEAPONS.lease_breaker.slot);
    expect(p.kit.primarySlot).toBe(WEAPONS.lease_breaker.slot);
    p.health = 40;
    const max = p.maxHealth;
    world.step(new Map([[1, { tick: 0, buttons: withSlot(0, WEAPONS.neon_edge.slot), yaw: p.yaw, pitch: 0 }]]));
    expect(p.weapon.slot).toBe(WEAPONS.neon_edge.slot);
    expect(p.kit.primarySlot).toBe(WEAPONS.neon_edge.slot);
    expect(p.health).toBe(40);
    expect(p.maxHealth).toBe(max);
    respawnPlayer(p, world.level.spawns[0]!);
    expect(p.weapon.slot).toBe(WEAPONS.neon_edge.slot);
  });

  it("swapping to another gun does not change the gun a death hands back", () => {
    const world = new World(drainageYard(), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const p = world.addPlayer(1, "A", 1);
    p.health = 40;
    world.step(new Map([[1, { tick: 0, buttons: withSlot(0, WEAPONS.stack_smg.slot), yaw: p.yaw, pitch: 0 }]]));
    expect(p.weapon.slot).toBe(WEAPONS.stack_smg.slot);
    expect(p.kit.primarySlot).toBe(WEAPONS.lease_breaker.slot);
    expect(p.health).toBe(40);
    respawnPlayer(p, world.level.spawns[0]!);
    expect(p.weapon.slot).toBe(WEAPONS.lease_breaker.slot);
  });

  it("the desk and the rescue gig ask for the sword", () => {
    const camp = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    const input = readFileSync(new URL("../client/input.ts", import.meta.url), "utf8");
    const player = readFileSync(new URL("../shared/sim/player.ts", import.meta.url), "utf8");
    expect(input).toMatch(/requestSlot\(slot: number\)/);
    expect(camp.match(/this\.drawEdge\(\)/g)?.length).toBe(2);
    expect(camp).toMatch(/p\.weapon\.slot = slot/);
    expect(camp).toMatch(/p\.kit\.primarySlot = slot/);
    expect(camp).toMatch(/if \(this\.game\.online\) return/);
    expect(player).toMatch(/p\.weapon\.slot === WEAPONS\.neon_edge\.slot && p\.weapon\.slot !== held/);
  });
});
