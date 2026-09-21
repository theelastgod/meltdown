/**
 * What the camera does on a landing and in a slide (Stage 79): the shape has to start at nothing,
 * end at nothing, and be worth seeing in between, or it reads as a glitch rather than as weight.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fallSpeed, landDip, landHardness, LAND_CEIL, LAND_DIP, LAND_FLOOR, LAND_TIME, lookYawPitch, SLIDE_ROLL, stanceRoll } from "../client/render/feel";

describe("how hard a landing was", () => {
  it("is nothing for a step off a kerb and everything for a drop", () => {
    expect(landHardness(0)).toBe(0);
    expect(landHardness(-LAND_FLOOR)).toBe(0);
    expect(landHardness(-LAND_CEIL)).toBe(1);
    expect(landHardness(-40)).toBe(1); // past the ceiling it is still one, not more
    expect(landHardness(-(LAND_FLOOR + LAND_CEIL) / 2)).toBeCloseTo(0.5, 6);
  });

  it("reads the fall, not the climb: rising is never a landing", () => {
    expect(landHardness(9)).toBe(0);
    expect(landHardness(0.5)).toBe(0);
  });

  it("a 6 m/s fall is 6 m/s at 60 Hz, 20 Hz and 12 Hz", () => {
    // lastY - y over the real frame, not the hitch-capped dt
    expect(fallSpeed(6, 6 - 6 / 60, 1 / 60)).toBeCloseTo(-6, 6);
    expect(fallSpeed(6, 6 - 6 / 20, 1 / 20)).toBeCloseTo(-6, 6);
    expect(fallSpeed(6, 6 - 6 / 12, 1 / 12)).toBeCloseTo(-6, 6);
    expect(landHardness(fallSpeed(6, 6 - 6 / 12, 1 / 12))).toBeCloseTo(landHardness(-6), 6);
  });
});

describe("the renderer divides the fall by the real frame", () => {
  it("uses rawDt for fallSpeed and drains the dip on rawDt", () => {
    const src = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(src).toMatch(/fallSpeed\(this\.lastY, v\.y, rawDt\)/);
    expect(src).toMatch(/this\.landT = Math.max\(0, this\.landT - rawDt\)/);
  });
});

describe("the dip a landing puts in the camera", () => {
  it("starts at nothing, ends at nothing, and is deepest early", () => {
    expect(landDip(1, 0)).toBe(0);
    expect(landDip(1, LAND_TIME)).toBe(0);
    expect(landDip(1, LAND_TIME + 1)).toBe(0);
    expect(landDip(1, -0.1)).toBe(0);
    const peak = landDip(1, LAND_TIME * 0.2);
    expect(peak).toBeCloseTo(LAND_DIP, 6);
    expect(peak).toBeGreaterThan(landDip(1, LAND_TIME * 0.6));
    expect(landDip(1, LAND_TIME * 0.6)).toBeGreaterThan(landDip(1, LAND_TIME * 0.9));
  });

  it("scales with how hard the landing was, and a soft one is barely there", () => {
    const t = LAND_TIME * 0.2;
    expect(landDip(0, t)).toBe(0);
    expect(landDip(0.5, t)).toBeCloseTo(LAND_DIP / 2, 6);
    expect(landDip(1, t)).toBeGreaterThan(landDip(0.3, t));
    // a jump on the flat comes back at about six metres a second: present, not dramatic
    const jump = landHardness(-6);
    expect(jump).toBeGreaterThan(0.2);
    expect(jump).toBeLessThan(0.5);
    expect(landDip(jump, t)).toBeLessThan(0.1);
  });

  it("never lifts the camera above the eye, at any point of its life", () => {
    for (let i = 0; i <= 40; i++) {
      const d = landDip(1, (i / 40) * LAND_TIME);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(LAND_DIP + 1e-9);
    }
  });
});

describe("the roll of a slide", () => {
  it("leans in a slide and nowhere else", () => {
    expect(stanceRoll("slide")).toBeCloseTo(SLIDE_ROLL, 6);
    for (const s of ["stand", "crouch", "mantle", "air", ""]) expect(stanceRoll(s)).toBe(0);
  });
});

describe("the look that finds what closed the file", () => {
  const at = { x: 4, y: 1.6, z: -2 };

  it("points along the simulation's own convention: -z is yaw zero and +x is the right hand", () => {
    expect(lookYawPitch(at, { x: at.x, y: at.y, z: at.z - 10 }).yaw).toBeCloseTo(0, 6);
    expect(lookYawPitch(at, { x: at.x + 10, y: at.y, z: at.z }).yaw).toBeCloseTo(-Math.PI / 2, 6);
    expect(lookYawPitch(at, { x: at.x - 10, y: at.y, z: at.z }).yaw).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.abs(lookYawPitch(at, { x: at.x, y: at.y, z: at.z + 10 }).yaw)).toBeCloseTo(Math.PI, 6);
  });

  it("tilts up for something above and down for something below, and is level across flat ground", () => {
    expect(lookYawPitch(at, { x: at.x, y: at.y + 10, z: at.z - 10 }).pitch).toBeGreaterThan(0.7);
    expect(lookYawPitch(at, { x: at.x, y: at.y - 10, z: at.z - 10 }).pitch).toBeLessThan(-0.7);
    expect(lookYawPitch(at, { x: at.x, y: at.y, z: at.z - 10 }).pitch).toBeCloseTo(0, 6);
    // straight up is straight up, not a division by nothing
    expect(lookYawPitch(at, { x: at.x, y: at.y + 5, z: at.z }).pitch).toBeGreaterThan(1.5);
  });

  it("a killer standing exactly where you fell is not a direction: the look you had is kept", () => {
    expect(lookYawPitch(at, at, 1.25, -0.3)).toEqual({ yaw: 1.25, pitch: -0.3 });
  });
});
