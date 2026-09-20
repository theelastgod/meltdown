/**
 * A shot fired from inside a body (Stage 169).
 *
 * `rayCapsule` returns the ENTRY distance, and every quadratic in it takes the near root — which is
 * negative when the origin is already inside the capsule, so the `t >= 0` tests rejected it and the
 * function reported a clean miss. Files do not push each other apart, so standing inside one
 * another is ordinary melee range; a mech's capsule is 1.1 m wide, so walking up to one put your
 * eye inside it. At contact range every round passed through.
 */
import { describe, expect, it } from "vitest";
import { rayCapsule } from "../shared/sim/collision";
import { v3 } from "../shared/math/vec3";
import { MOVE } from "../shared/sim/constants";
import { World, MECH_RADIUS, MECH_HEIGHT, type SimEvent } from "../shared/sim/world";
import { drainageYard } from "../shared/sim/level";
import { Btn, type InputFrame } from "../shared/sim/input";

const EYE = MOVE.eyeStand;
const R = MOVE.capsuleRadius;
const H = MOVE.standHeight;

/** a level shot from the origin at a capsule whose axis is `gap` metres away */
const shotAt = (gap: number, r: number = R, h: number = H) => rayCapsule(v3(0, EYE, 0), v3(0, 0, 1), v3(0, 0, gap), r, h, 100);

describe("a shot fired from inside a body lands", () => {
  it("hits at zero range rather than reporting a miss", () => {
    for (const gap of [0.3, 0.2, 0.1, 0]) expect(shotAt(gap)).toBe(0);
  });

  it("hits a mech you are standing against — its capsule is over a metre wide", () => {
    expect(MECH_RADIUS).toBeGreaterThan(1);
    for (const gap of [0.9, 0.5, 0]) expect(shotAt(gap, MECH_RADIUS, MECH_HEIGHT)).toBe(0);
  });

  it("still misses what it should miss", () => {
    // the fix must not make every ray hit: past the capsule, beside it, and behind the shooter
    expect(shotAt(3)).not.toBe(0);
    expect(rayCapsule(v3(0, EYE, 0), v3(0, 0, 1), v3(5, 0, 2), R, H, 100)).toBeNull(); // off to the side
    expect(rayCapsule(v3(0, EYE, 0), v3(0, 0, -1), v3(0, 0, 5), R, H, 100)).toBeNull(); // pointing away
    expect(rayCapsule(v3(0, EYE, 0), v3(0, 0, 1), v3(0, 0, 50), R, H, 10)).toBeNull(); // beyond maxT
  });

  it("is continuous: there is no gap between point blank and a metre out", () => {
    // the structural guard. The defect was a hole in the middle of the function's domain — a level
    // shot landed at 0.39 m and hit nothing at 0.30 m. Walk the whole approach and require every
    // step to land, and the distance never to rise as the target gets closer.
    let last = Infinity;
    for (let gap = 2; gap >= 0; gap -= 0.01) {
      const t = shotAt(gap);
      expect(t, `a level shot at ${gap.toFixed(2)} m reported a miss`).not.toBeNull();
      expect(t!, `distance rose as the target got closer, at ${gap.toFixed(2)} m`).toBeLessThanOrEqual(last + 1e-9);
      last = t!;
    }
    expect(last).toBe(0);
  });
});

describe("two files at melee range", () => {
  it("do not push each other apart, and a round between them lands", () => {
    const level = drainageYard();
    level.dummies = [];
    const w = new World(level, { ai: false });
    const a = w.addPlayer(1, "A", 1);
    const b = w.addPlayer(2, "B", 2);
    b.pos = v3(a.pos.x, a.pos.y, a.pos.z + 0.2);
    // they stay where they are put: overlapping is a reachable state, not a theoretical one
    for (let i = 0; i < 60; i++) w.step(new Map());
    expect(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z)).toBeLessThan(R);

    const hp0 = b.health + b.shield;
    const out: SimEvent[] = [];
    for (let i = 0; i < 30; i++) {
      const aim = w.aimAt(a, { x: b.pos.x, y: b.pos.y + 1, z: b.pos.z });
      const f: InputFrame = { tick: w.tick, buttons: Btn.Fire, yaw: aim.yaw, pitch: aim.pitch };
      w.step(new Map([[1, f]]));
      out.push(...w.drainEvents());
    }
    const landed = out.filter((e) => e.type === "shot" && e.hit.kind === "player" && e.hit.id === 2);
    expect(landed.length).toBeGreaterThan(0);
    expect(b.health + b.shield).toBeLessThan(hp0);
    // "a round landed" is too weak to be a guard here, and measuring said so: with the entry
    // distance wrong the ray still left through the bottom sphere, so `rayCapsule` returned 0.867 m
    // rather than null and the hit registered — at the wrong distance, the wrong zone and the wrong
    // falloff. Five rounds point blank left the target on 20 health instead of killing it. So the
    // round is held to the distance it actually flew, and the exchange to its outcome.
    const flew = landed.map((e) => (e.type === "shot" ? Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y, e.to.z - e.from.z) : 0));
    expect(Math.min(...flew)).toBeLessThan(0.05);
    expect(b.alive).toBe(false);
  });
});
