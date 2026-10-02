/**
 * Opening the city used to put a file on the street in the same second a patrol could see it.
 * The loading grace ends on the first input. A fresh life stays unseen until it fires, or for
 * STREET_SHIELD_SECONDS. A match (PvP) is not covered.
 */
import { describe, expect, it } from "vitest";
import { Btn, emptyInput } from "../shared/sim/input";
import { SIM_HZ } from "../shared/sim/constants";
import { v3 } from "../shared/math/vec3";
import { levelById } from "../shared/sim/level";
import { STREET_SHIELD_SECONDS, World } from "../shared/sim/world";

describe("a fresh life in the city is not shot the moment the street appears", () => {
  it("stands under a wasp for two seconds at full health, then can be shot once the shield is gone", () => {
    const level = levelById("lease_row");
    const w = new World(level, { ai: true, seed: 7, wakePhase: "off", pvp: false });
    const p = w.addPlayer(1, "BLANK", 1);
    expect(p.streetShield).toBe(STREET_SHIELD_SECONDS);
    const open = level.nodes.find((n) => n.label === "A")!;
    const wasp = w.wasps[0]!;
    wasp.pos.x = open.pos.x;
    wasp.pos.y = 4;
    wasp.pos.z = open.pos.z;
    wasp.waypoints = [v3(open.pos.x, 4, open.pos.z), v3(open.pos.x + 2, 4, open.pos.z)];
    const stand = emptyInput(0);
    for (let t = 0; t < 2 * SIM_HZ; t++) {
      p.pos.x = wasp.pos.x;
      p.pos.z = wasp.pos.z + 3;
      p.pos.y = 0;
      w.step(new Map([[p.id, { ...stand, tick: t, yaw: p.yaw, pitch: 0 }]]));
      expect(p.health, `hurt at tick ${t}`).toBe(p.maxHealth);
      expect(p.shield).toBe(p.maxShield);
      expect(w.wasps.some((x) => x.targetId === p.id), `targeted at tick ${t}`).toBe(false);
    }
    expect(p.streetShield).toBeGreaterThan(STREET_SHIELD_SECONDS - 2.1);
    p.streetShield = 0;
    let hurt = false;
    for (let t = 0; t < 3 * SIM_HZ && !hurt; t++) {
      p.pos.x = wasp.pos.x;
      p.pos.z = wasp.pos.z + 3;
      p.pos.y = 0;
      w.step(new Map([[p.id, { ...stand, tick: 1000 + t, yaw: p.yaw, pitch: 0 }]]));
      hurt = p.health < p.maxHealth || p.shield < p.maxShield;
    }
    expect(hurt).toBe(true);
  });

  it("a shot ends the shield, and a match never has one", () => {
    const city = new World(levelById("lease_row"), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const p = city.addPlayer(1, "BLANK", 1);
    const fire = emptyInput(0);
    fire.buttons = Btn.Fire;
    city.step(new Map([[p.id, fire]]));
    expect(p.streetShield).toBe(0);

    const match = new World(levelById("lease_row"), { ai: false, seed: 1, wakePhase: "off", pvp: true });
    expect(match.addPlayer(1, "BLANK", 1).streetShield).toBe(0);
  });
});
