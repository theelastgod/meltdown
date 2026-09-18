/** The round was over and the guns were not (Stage 126): no file takes damage in the results phase. */
import { describe, expect, it } from "vitest";
import { drainageYard } from "../shared/sim/level";
import { World } from "../shared/sim/world";

function yard() {
  const level = drainageYard();
  level.dummies = [];
  const w = new World(level, { ai: false, seed: 3 });
  const p = w.addPlayer(1);
  const q = w.addPlayer(2, "OTHER", 2);
  // the shield takes the first 30 of any hit; the rule is read on the health underneath
  p.shield = 0;
  p.maxShield = 0;
  return { w, p, q };
}

describe("damage across the wake's phases", () => {
  it("lands in the wake and in the warm-up", () => {
    const { w, p, q } = yard();
    for (const phase of ["wake", "warmup"] as const) {
      w.wake!.phase = phase;
      const before = p.health;
      w.applyDamage("player", p.id, 30, q.id, "lease_breaker", "shot");
      expect(p.health).toBe(before - 30);
    }
  });
  it("does not land on a file in the results phase, however it is dealt", () => {
    const { w, p, q } = yard();
    w.wake!.phase = "results";
    const before = p.health;
    w.applyDamage("player", p.id, 30, q.id, "lease_breaker", "shot");
    w.applyDamage("player", p.id, 30, q.id, "phage", "explosion");
    w.applyDamage("player", p.id, 30, 0, "kernel", "beam");
    expect(p.health).toBe(before);
    expect(p.alive).toBe(true);
  });
  it("still lands on a dummy in the results phase", () => {
    const level = drainageYard();
    const w = new World(level, { ai: false, seed: 3 });
    const q = w.addPlayer(2, "OTHER", 2);
    w.wake!.phase = "results";
    const d = w.dummies[0]!;
    const before = d.health;
    w.applyDamage("dummy", d.id, 30, q.id, "lease_breaker", "shot");
    expect(d.health).toBe(before - 30);
  });
});
