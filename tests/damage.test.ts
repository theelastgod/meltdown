/**
 * Where a hit came from (Stage 74): the bearing maths the HUD draws its wedges from. A shot from
 * behind has to read as behind, at any facing, or the indicator is worse than nothing.
 */
import { describe, expect, it } from "vitest";
import { bearing, hitMarks, HIT_LIFE, HIT_MAX, pruneHits, type HitSource } from "../client/hud/damage";

const at = { x: 10, z: -4 };

describe("the bearing of a hit", () => {
  it("reads ahead, behind, left and right for a player looking along -z", () => {
    // yaw 0 looks toward -z, which is the sim's own convention (viewDir)
    expect(bearing(at.x, at.z - 5, at.x, at.z, 0)).toBeCloseTo(0, 6); // in front
    expect(Math.abs(bearing(at.x, at.z + 5, at.x, at.z, 0))).toBeCloseTo(Math.PI, 6); // behind
    expect(bearing(at.x + 5, at.z, at.x, at.z, 0)).toBeCloseTo(Math.PI / 2, 6); // to the right
    expect(bearing(at.x - 5, at.z, at.x, at.z, 0)).toBeCloseTo(-Math.PI / 2, 6); // to the left
  });

  it("turns with the look: the same attacker moves around the ring as the player turns", () => {
    const from = { x: at.x + 5, z: at.z }; // due east of the player
    expect(bearing(from.x, from.z, at.x, at.z, 0)).toBeCloseTo(Math.PI / 2, 6);
    // face east — which is yaw -pi/2 in the sim's terms — and the attacker is straight ahead
    expect(bearing(from.x, from.z, at.x, at.z, -Math.PI / 2)).toBeCloseTo(0, 6);
    // face west and they are behind
    expect(Math.abs(bearing(from.x, from.z, at.x, at.z, Math.PI / 2))).toBeCloseTo(Math.PI, 6);
  });

  it("never returns an angle outside a half turn, so a wedge cannot spin the long way round", () => {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      for (const yaw of [0, 2.9, -3.0, 6.2, -7.5]) {
        const b = bearing(at.x + Math.sin(a) * 4, at.z + Math.cos(a) * 4, at.x, at.z, yaw);
        expect(b).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
        expect(b).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });

  it("an attacker standing on the player is not a direction", () => {
    expect(bearing(at.x, at.z, at.x, at.z, 1.2)).toBe(0);
  });
});

describe("the marks the HUD draws", () => {
  const hits = (n: number, t0 = 0): HitSource[] => Array.from({ length: n }, (_, i) => ({ x: at.x + 5, z: at.z, at: t0 + i * 0.1, damage: 10 + i }));

  it("fades a mark over its life and drops it when it is spent", () => {
    const h: HitSource[] = [{ x: at.x + 5, z: at.z, at: 0, damage: 12 }];
    expect(hitMarks(h, at.x, at.z, 0, 0)[0]!.alpha).toBeCloseTo(1, 6);
    expect(hitMarks(h, at.x, at.z, 0, HIT_LIFE / 2)[0]!.alpha).toBeCloseTo(0.5, 6);
    expect(hitMarks(h, at.x, at.z, 0, HIT_LIFE)).toHaveLength(0);
    expect(hitMarks(h, at.x, at.z, 0, HIT_LIFE + 5)).toHaveLength(0);
  });

  it("shows the newest hits and never more than the cap, however fast they land", () => {
    const many = hits(12);
    const marks = hitMarks(many, at.x, at.z, 0, 0.5);
    expect(marks).toHaveLength(HIT_MAX);
    // newest first: the last hit landed at 1.1 s… which is still to come at 0.5, so the newest
    // *arrived* is the one at 0.5
    expect(marks[0]!.damage).toBeGreaterThan(marks[marks.length - 1]!.damage);
  });

  it("does not draw a hit that has not landed yet", () => {
    const h: HitSource[] = [{ x: at.x, z: at.z + 5, at: 3, damage: 9 }];
    expect(hitMarks(h, at.x, at.z, 0, 1)).toHaveLength(0);
    expect(hitMarks(h, at.x, at.z, 0, 3)).toHaveLength(1);
  });

  it("pruning keeps the list from growing without bound", () => {
    // whole seconds, so the arithmetic in the test is not the thing being tested
    const h: HitSource[] = [0, 1, 2, 3, 4, 5].map((t) => ({ x: at.x, z: at.z + 3, at: t, damage: 5 }));
    expect(pruneHits(h, 10)).toHaveLength(0);
    expect(pruneHits(h, 6)).toHaveLength(1); // only the one at 5 s is inside the 1.4 s life
    expect(pruneHits(h, 4.5)).toHaveLength(2); // at 4.5: the one at 4 s, and the one at 5 s that has not landed yet
  });
});
