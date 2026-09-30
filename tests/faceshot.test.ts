/**
 * Dialogue closes on a face (Stage 715).
 *
 * The lens uses the body's own forward. It stands under a metre from the face, on a field of view
 * a street lens never uses. Taking the stand out to a wide shot fails the distance check.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { yawDir } from "../shared/math/vec3";
import { dialogueShot, FACE_FOV, FACE_STAND, FACE_Y, faceShot } from "../client/render/faceshot";
import { FIXER_SCALE } from "../client/render/figures";

describe("the close-up", () => {
  it("stands in front of the face, along the same forward the body uses, and looks at it", () => {
    const at = { x: 1.6, z: -5 };
    const yaw = 0.7;
    const s = faceShot(at, yaw, FACE_Y.deacon);
    const fwd = yawDir(yaw);
    expect(s.x).toBeCloseTo(at.x + fwd.x * FACE_STAND);
    expect(s.z).toBeCloseTo(at.z + fwd.z * FACE_STAND);
    expect(s.y).toBeLessThan(s.lookY);
    const dist = Math.hypot(s.x - s.lookX, s.y - s.lookY, s.z - s.lookZ);
    expect(dist).toBeGreaterThan(0.4);
    expect(dist).toBeLessThan(1);
    expect(s.fov).toBe(FACE_FOV);
    expect(s.fov).toBeLessThan(40);
    const cam = new THREE.PerspectiveCamera(s.fov, 16 / 9, 0.05, 50);
    cam.position.set(s.x, s.y, s.z);
    cam.lookAt(s.lookX, s.lookY, s.lookZ);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const toFace = new THREE.Vector3(s.lookX - s.x, s.lookY - s.y, s.lookZ - s.z).normalize();
    expect(dir.dot(toFace)).toBeGreaterThan(0.99);
  });

  it("uses the hood's own height", () => {
    const src = readFileSync(new URL("../client/render/figures.ts", import.meta.url), "utf8");
    expect(src).toMatch(/hood\(parts, \{ r: 0\.175, cy: 1\.66/);
    expect(src).toMatch(/hood\(parts, \{ r: 0\.19, cy: 1\.6,/);
    expect(FACE_Y.deacon).toBeCloseTo(1.66 * FIXER_SCALE.deacon);
    expect(FACE_Y.marrow).toBeCloseTo(1.6 * FIXER_SCALE.marrow);
  });

  it("closes on whoever is speaking, and on a plate when that person is not in the room", () => {
    const player = { x: 0, y: 0, z: 3, yaw: 0, eye: 1.62 };
    const you = dialogueShot({ speaker: "you", player, visitor: null, wern: null })!;
    expect(you.who).toBe("you");
    expect(you.lookZ).toBe(3);
    const deacon = dialogueShot({ speaker: "deacon", player, visitor: { id: "deacon", x: 1.6, z: -5, yaw: 1 }, wern: null })!;
    expect(deacon.who).toBe("other");
    expect(deacon.lookY).toBeCloseTo(FACE_Y.deacon);
    expect(Math.hypot(you.lookX - deacon.lookX, you.lookZ - deacon.lookZ)).toBeGreaterThan(2);
    expect(dialogueShot({ speaker: "deacon", player, visitor: { id: "marrow", x: 1.6, z: -5, yaw: 1 }, wern: null })).toBeNull();
    expect(dialogueShot({ speaker: "vantage", player, visitor: null, wern: null })).toBeNull();
    expect(dialogueShot({ speaker: "wern", player, visitor: null, wern: { x: 1.25, z: -7.25, yaw: Math.PI } })!.lookZ).toBeCloseTo(-7.25);
  });

  it("the line arms it, and the end of the line lets the camera go", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/this\.armCutscene\(n\.speaker\)/);
    expect(src).toMatch(/this\.game\.renderer\.setFace\(shot\)/);
    expect(src).toMatch(/this\.game\.renderer\.setFace\(null\)/);
    const hud = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(hud).toMatch(/@keyframes facezoom/);
    expect(hud).toMatch(/scale\(1\.85\)/);
  });
});
