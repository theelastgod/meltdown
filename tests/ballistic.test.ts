/**
 * Where a round that falls comes down (Stage 78): the arc the reticle marks for a launcher has to
 * be the arc the simulation integrates, or the mark is a different lie from the straight ray.
 */
import { describe, expect, it } from "vitest";
import { arcPoint, type ArcSpec } from "../client/render/ballistic";
import { box } from "../shared/sim/box";
import { v3 } from "../shared/math/vec3";
import { WEAPONS } from "../shared/weapons/manifest";

const eye = v3(0, 1.62, 0);
const still = { x: 0, y: 0, z: 0 };
const phage = WEAPONS.phage.projectile!;
const spec = (over: Partial<ArcSpec> = {}): ArcSpec => ({ speed: phage.speed, gravity: phage.gravity, fuse: phage.fuse, vel: still, muzzle: 0.6, ...over });
/** the ground, and a wall twenty metres down the street */
const ground = box(-100, -1, -100, 100, 0, 100);
const wall = box(-10, 0, -20.5, 10, 6, -20);

describe("the arc a launcher round takes", () => {
  it("with no gravity it is the straight ray, to the same wall", () => {
    const flat = arcPoint(eye, 0, 0, spec({ gravity: 0 }), [ground, wall]);
    expect(flat.hit).toBe(true);
    expect(flat.point.z).toBeCloseTo(-20, 1);
    expect(flat.point.y).toBeCloseTo(eye.y, 2);
  });

  it("and with gravity it lands under it, by what the drop is worth at that range", () => {
    const shot = arcPoint(eye, 0, 0, spec(), [ground, wall]);
    expect(shot.hit).toBe(true);
    expect(shot.point.z).toBeCloseTo(-20, 1);
    // 20.6 m at 40 m/s is a bit over half a second; the drop is half g t squared
    const t = shot.time;
    expect(t).toBeGreaterThan(0.45);
    expect(eye.y - shot.point.y).toBeCloseTo(0.5 * phage.gravity * t * t, 1);
    expect(shot.point.y).toBeLessThan(eye.y - 1);
  });

  it("lobbed up, it comes down on the ground rather than carrying on into the sky", () => {
    const lob = arcPoint(eye, 0, 0.25, spec(), [ground]);
    expect(lob.hit).toBe(true);
    expect(lob.point.y).toBeCloseTo(0, 1);
    // up at a quarter of a radian it lands well down the street, in front of the shooter
    expect(lob.point.z).toBeLessThan(-50);
    expect(lob.distance).toBeGreaterThan(50);
  });

  it("thrown higher than its fuse is long, it goes off in the air where it is", () => {
    // 0.6 rad at forty metres a second is nearly four seconds up and down, and the phage's fuse is
    // two and a half: the honest answer is where it bursts, not where it would have landed
    const high = arcPoint(eye, 0, 0.6, spec(), [ground]);
    expect(high.hit).toBe(false);
    expect(high.time).toBeCloseTo(phage.fuse, 1);
    expect(high.point.y).toBeGreaterThan(eye.y);
  });

  it("burns its fuse in the air over a hole, and says so", () => {
    const nothing = arcPoint(eye, 0, 0.6, spec({ fuse: 0.4 }), []);
    expect(nothing.hit).toBe(false);
    expect(nothing.onTarget).toBe(false);
    expect(nothing.time).toBeCloseTo(0.4, 2);
  });

  it("stops on a body in the way, and calls it a body", () => {
    const target = { pos: v3(0, 0, -12), radius: 0.4, height: 1.8 };
    const hit = arcPoint(eye, 0, 0, spec(), [ground, wall], [target]);
    expect(hit.onTarget).toBe(true);
    expect(hit.point.z).toBeGreaterThan(-13);
    expect(hit.point.z).toBeLessThan(-11);
    // and a body behind a wall is not a body in the way
    const behind = arcPoint(eye, 0, 0, spec(), [ground, wall], [{ pos: v3(0, 0, -30), radius: 0.4, height: 1.8 }]);
    expect(behind.onTarget).toBe(false);
  });

  it("a body behind cover in the same step of the walk is still behind it", () => {
    // at forty metres a second a tick of the walk is two thirds of a metre, so a body pressed up
    // against the far side of a barricade is tested in the same segment as the barricade: the
    // nearer of the two is what the round hits, and it is the barricade
    const target = { pos: v3(0, 0, -12), radius: 0.4, height: 1.8 };
    // the capsule's own radius reaches 0.4 m toward the shooter, so the cover goes just in front of
    // that: a tenth of a metre apart, well inside one step of the walk
    const barricade = box(-3, 0, -11.55, 3, 1.9, -11.5);
    const covered = arcPoint(eye, 0, 0, spec(), [ground, barricade], [target]);
    expect(covered.hit).toBe(true);
    expect(covered.onTarget).toBe(false);
    expect(covered.point.z).toBeGreaterThan(-11.6);
    // step out from behind it and the same shot is a hit on the body
    const open = arcPoint(eye, 0, 0, spec(), [ground], [target]);
    expect(open.onTarget).toBe(true);
  });

  it("carries the shooter's own speed, the way the launch does: running forward throws it further", () => {
    const standing = arcPoint(eye, 0, 0.6, spec(), [ground]);
    const running = arcPoint(eye, 0, 0.6, spec({ vel: { x: 0, y: 0, z: -7.2 } }), [ground]);
    expect(running.point.z).toBeLessThan(standing.point.z - 3);
    // and running backwards throws it shorter
    const back = arcPoint(eye, 0, 0.6, spec({ vel: { x: 0, y: 0, z: 7.2 } }), [ground]);
    expect(back.point.z).toBeGreaterThan(standing.point.z + 3);
  });

  it("is the simulation's own integration: the drop matches a hand-stepped Euler walk", () => {
    // the sim steps velocity first, then position, at SIM_DT — an arc trace that used a coarser
    // step or the analytic parabola would disagree with where the round actually goes
    const dt = 1 / 60;
    let p = v3(0, eye.y, -0.6);
    let vy = 0;
    const vz = -phage.speed;
    let t = 0;
    for (let i = 0; i < 40; i++) {
      vy -= phage.gravity * dt;
      p = v3(0, p.y + vy * dt, p.z + vz * dt);
      t += dt;
    }
    const traced = arcPoint(eye, 0, 0, spec(), [box(-10, -5, p.z - 0.5, 10, 6, p.z)]);
    expect(traced.time).toBeCloseTo(t, 1);
    expect(traced.point.y).toBeCloseTo(p.y, 1);
  });
});
