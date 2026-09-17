/**
 * The third-person camera's rules (Stage 60): behind and over the shoulder, never through a wall,
 * and a reticle that marks what the eye's ray reaches.
 */
import { describe, expect, it } from "vitest";
import { aimPoint, thirdPersonCamera, TPS_ADS, TPS_DEFAULT } from "../client/render/tps";
import { box } from "../shared/sim/box";
import { dist, v3, viewDir, yawRight, dot, sub } from "../shared/math/vec3";

const eye = v3(0, 1.62, 0);

describe("where the camera goes", () => {
  it("with nothing behind: the full distance back, to the right of the aim, a little above", () => {
    const c = thirdPersonCamera(eye, 0, 0, []);
    expect(c.blocked).toBe(false);
    expect(c.distance).toBeCloseTo(TPS_DEFAULT.distance, 6);
    const rel = sub(c.pos, eye);
    expect(dot(rel, viewDir(0, 0))).toBeCloseTo(-TPS_DEFAULT.distance, 6); // behind
    expect(dot(rel, yawRight(0))).toBeCloseTo(TPS_DEFAULT.shoulder, 6); // over the right shoulder
    expect(rel.y).toBeCloseTo(TPS_DEFAULT.lift, 6);
  });

  it("turning the aim turns the camera with it, and looking down lifts it over the player", () => {
    const left = thirdPersonCamera(eye, Math.PI / 2, 0, []);
    expect(dot(sub(left.pos, eye), viewDir(Math.PI / 2, 0))).toBeCloseTo(-TPS_DEFAULT.distance, 6);
    const down = thirdPersonCamera(eye, 0, -1.2, []);
    expect(down.pos.y).toBeGreaterThan(eye.y + 2.2);
  });

  it("a wall behind the player pulls the camera in and keeps a gap from it; a wall ahead does nothing", () => {
    // facing -z (yaw 0); a wall 1 m behind, spanning the whole width
    const behind = box(-10, 0, 0.8, 10, 4, 1.2, "wall");
    const c = thirdPersonCamera(eye, 0, 0, [behind]);
    expect(c.blocked).toBe(true);
    expect(c.distance).toBeLessThan(1);
    expect(c.pos.z).toBeLessThan(0.8 - TPS_DEFAULT.wallPad + 1e-6);
    expect(c.pos.z).toBeGreaterThan(0.8 - TPS_DEFAULT.wallPad - 0.05);
    const ahead = box(-10, 0, -3, 10, 4, -2, "wall");
    expect(thirdPersonCamera(eye, 0, 0, [ahead]).blocked).toBe(false);
  });

  it("backed right up against a wall the camera still keeps its minimum distance, never inside the head", () => {
    const flush = box(-10, 0, 0.3, 10, 4, 1, "wall");
    const c = thirdPersonCamera(eye, 0, 0, [flush]);
    expect(c.distance).toBeCloseTo(TPS_DEFAULT.minDistance, 6);
    expect(dist(c.pos, eye)).toBeGreaterThan(0.4);
  });

  it("aiming down sights is the same rule with the camera closer and tighter", () => {
    const c = thirdPersonCamera(eye, 0, 0, [], TPS_ADS);
    expect(c.distance).toBeCloseTo(TPS_ADS.distance, 6);
    expect(TPS_ADS.distance).toBeLessThan(TPS_DEFAULT.distance);
    expect(TPS_ADS.shoulder).toBeLessThan(TPS_DEFAULT.shoulder);
  });
});

describe("where the reticle goes", () => {
  it("marks the first wall the eye's ray reaches, or a far point when it reaches none", () => {
    const wall = box(-10, 0, -6, 10, 4, -5, "wall");
    const a = aimPoint(eye, 0, 0, [wall]);
    expect(a.hit).toBe(true);
    expect(a.distance).toBeCloseTo(5, 6);
    expect(a.point.z).toBeCloseTo(-5, 6);
    const none = aimPoint(eye, 0, 0, []);
    expect(none.hit).toBe(false);
    expect(none.distance).toBe(80);
  });
  it("is the eye's ray, not the camera's: the shot and the reticle agree by construction", () => {
    const wall = box(-10, 0, -6, 10, 4, -5, "wall");
    const a = aimPoint(eye, 0.3, -0.1, [wall]);
    const along = viewDir(0.3, -0.1);
    const rel = sub(a.point, eye);
    expect(rel.x / rel.z).toBeCloseTo(along.x / along.z, 6);
    expect(rel.y / rel.z).toBeCloseTo(along.y / along.z, 6);
  });
});
