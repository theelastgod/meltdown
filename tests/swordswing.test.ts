/**
 * A Neon Edge swing sounds like the sword and names where it landed.
 * A miss names nowhere. The wire carries the weapon and that place.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { yawDir, v3 } from "../shared/math/vec3";
import { meleeOfWire, meleeWire } from "../shared/net/protocol";
import { Btn } from "../shared/sim/input";
import { drainageYard } from "../shared/sim/level";
import { World } from "../shared/sim/world";
import { WEAPONS } from "../shared/weapons/manifest";

describe("the sword swing", () => {
  it("a hit names the body, and a miss does not", () => {
    const hit = new World(drainageYard(), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const p = hit.addPlayer(1, "A", 1);
    p.weapon.slot = WEAPONS.neon_edge.slot;
    const f = yawDir(p.yaw);
    const dummy = hit.spawnDummy(v3(p.pos.x + f.x * 1.1, p.pos.y, p.pos.z + f.z * 1.1));
    hit.step(new Map([[1, { tick: 0, buttons: Btn.Fire, yaw: p.yaw, pitch: 0 }]]));
    const ev = hit.drainEvents().find((e) => e.type === "melee");
    expect(ev && ev.type === "melee" && ev.weapon).toBe("neon_edge");
    expect(ev && ev.type === "melee" && ev.at).toEqual({ x: dummy.pos.x, y: dummy.pos.y, z: dummy.pos.z });

    const miss = new World(drainageYard(), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const q = miss.addPlayer(1, "A", 1);
    q.weapon.slot = WEAPONS.neon_edge.slot;
    miss.spawnDummy(v3(q.pos.x + 30, q.pos.y, q.pos.z));
    miss.step(new Map([[1, { tick: 0, buttons: Btn.Fire, yaw: q.yaw, pitch: 0 }]]));
    const whiff = miss.drainEvents().find((e) => e.type === "melee");
    expect(whiff && whiff.type === "melee" && whiff.hits.length).toBe(0);
    expect(whiff && whiff.type === "melee" && whiff.at).toBeUndefined();
  });

  it("the wire keeps the sword apart from the baton, and the lunge in the low bit", () => {
    expect(meleeOfWire(meleeWire("neon_edge", false))).toEqual({ weapon: "neon_edge", lunge: false });
    expect(meleeOfWire(meleeWire("neon_edge", true))).toEqual({ weapon: "neon_edge", lunge: true });
    expect(meleeOfWire(meleeWire("shock_baton", false))).toEqual({ weapon: "shock_baton", lunge: false });
    expect(meleeOfWire(0)).toEqual({ weapon: "shock_baton", lunge: false });
    expect(meleeOfWire(1)).toEqual({ weapon: "shock_baton", lunge: true });
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toContain("this.audio.shot(ev.weapon, ev.lunge, this.world.level.name)");
    expect(game).toContain("const swing = meleeOfWire(ev.b)");
    const room = readFileSync(new URL("../server/room.ts", import.meta.url), "utf8");
    expect(room).toContain("b: meleeWire(ev.weapon, ev.lunge)");
    expect(room).toContain("x: ev.at?.x ?? 0");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toContain('def.alt.kind === "lunge" ? " · LUNGE"');
  });
});
