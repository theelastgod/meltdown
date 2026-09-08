/**
 * What a safe zone actually protects (Stage 35).
 *
 * probe:run went red on CI reading "health 70 → 70 · ALPHA kills 0 → 1" — BRAVO, standing in the
 * gate, lost no health at all, and the check failed anyway because it asserted on ALPHA's whole
 * kill tally. The tally counts every kind the sim can kill, and drainage_yard's training dummies
 * stand in the street, dummy 3 a little under 9 m from the gate's centre — well inside a spray
 * aimed past BRAVO.
 *
 * Worse, the detail line could not settle the question either way. BASE_HEALTH is 70, so "70 → 70"
 * is equally the reading for a player who was never touched and one who died and respawned at full.
 * The check watched the wrong player's counter and then reported a number that could not tell the
 * two apart. It now reads BRAVO's own death count, which can.
 *
 * world.ts carried the same overreach in a comment — "nothing inside one takes damage, and nothing
 * inside one deals it". The code protects PLAYERS, which is the rule the game means: you bank a
 * claim and use the market without another file shooting you.
 *
 * These cases pin the narrow rule from both sides, and pin the deliberate hole in it, so that
 * neither the comment nor a future probe can quietly widen it again.
 */
import { describe, expect, it } from "vitest";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { inSafeZone } from "../shared/sim/run";
import { v3 } from "../shared/math/vec3";

const GATE = v3(-20, 0, 0); // drainage_yard's one safe zone, radius 5
const STREET = v3(-6, 0, 0); // outside it, in the PvP zone

/** A run world with two players placed where the test wants them. */
const world = (aPos: { x: number; y: number; z: number }, bPos: { x: number; y: number; z: number }) => {
  const w = new World(levelById("drainage_yard"), { run: true, ai: false, seed: 7 });
  const a = w.addPlayer(1, "ALPHA", 1);
  const b = w.addPlayer(2, "BRAVO", 2);
  a.pos = { ...aPos };
  b.pos = { ...bPos };
  return { w, a, b };
};

describe("the gate is a rule about players", () => {
  it("a player inside takes no damage from a player outside", () => {
    const { w, b } = world(STREET, GATE);
    expect(inSafeZone(w.run!, b.pos)).toBe(true);
    const [hp, sh] = [b.health, b.shield];
    w.applyDamage("player", 2, 40, 1, "lease_breaker", "shot");
    expect([b.health, b.shield]).toEqual([hp, sh]);
    expect(b.alive).toBe(true);
  });

  it("and a player inside deals none to a player outside — it is not a firing position", () => {
    const { w, a } = world(STREET, GATE);
    const [hp, sh] = [a.health, a.shield];
    // BRAVO (id 2) is the one in the gate here, shooting out at ALPHA in the street
    w.applyDamage("player", 1, 40, 2, "lease_breaker", "shot");
    expect([a.health, a.shield]).toEqual([hp, sh]);
  });

  it("outside it, the same shot lands — the guard is the zone, not a blanket", () => {
    const { w, b } = world(STREET, v3(-2, 0, 0));
    expect(inSafeZone(w.run!, b.pos)).toBe(false);
    const pool = b.health + b.shield; // shields soak first, so count the pool
    w.applyDamage("player", 2, 40, 1, "lease_breaker", "shot");
    expect(b.health + b.shield).toBe(pool - 40);
  });

  it("a death inside is impossible however many rounds arrive", () => {
    const { w, b } = world(STREET, GATE);
    for (let i = 0; i < 20; i++) w.applyDamage("player", 2, 40, 1, "lease_breaker", "shot");
    expect(b.alive).toBe(true);
    expect(b.health).toBeGreaterThan(0);
  });
});

describe("the hole in it is deliberate, and the probe used to read it as a leak", () => {
  it("a training dummy in the street is killable, and that moves the shooter's tally without the zone leaking", () => {
    const { w, a, b } = world(STREET, GATE);
    const d = w.dummies[0]!;
    expect(inSafeZone(w.run!, d.pos)).toBe(false);
    const [hp, sh] = [b.health, b.shield];
    for (let i = 0; i < 12; i++) w.applyDamage("dummy", d.id, 40, 1, "lease_breaker", "shot");
    // the dummy died and ALPHA was credited …
    expect(d.alive).toBe(false);
    expect(a.stats.kills).toBe(1);
    // … while the player in the gate never lost a point. Both at once is the state CI reported.
    expect([b.health, b.shield]).toEqual([hp, sh]);
    expect(b.stats.deaths).toBe(0);
  });

  it("but a player in the gate still cannot be dragged down with it: the shooter's own position is checked too", () => {
    const { w } = world(GATE, GATE);
    const d = w.dummies[0]!;
    const health = d.health;
    // ALPHA is standing in the gate; nothing it fires does anything, to any kind
    w.applyDamage("dummy", d.id, 40, 1, "lease_breaker", "shot");
    expect(d.health).toBe(health);
  });
});

describe("levels place the cast against that rule, not by accident", () => {
  it("no level parks a training dummy inside a safe zone, where it could never be shot", () => {
    for (const id of ["drainage_yard", "lease_row", "deadletter_docks", "repo_depot"]) {
      const L = levelById(id);
      for (const z of L.zones ?? []) {
        if (z.kind !== "safe") continue;
        for (const d of L.dummies) {
          expect(Math.hypot(d.pos.x - z.pos.x, d.pos.z - z.pos.z), `${id} dummy ${d.id} in ${z.label}`).toBeGreaterThanOrEqual(z.radius);
        }
      }
    }
  });
});
