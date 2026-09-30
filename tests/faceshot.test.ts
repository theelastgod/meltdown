/**
 * Dialogue closes on a face (Stage 715).
 *
 * The lens uses the body's own forward. It stands under a metre from the face, on a field of view
 * a street lens never uses. Taking the stand out to a wide shot fails the distance check.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { yawDir, yawTo } from "../shared/math/vec3";
import { dialogueShot, FACE_CUT_M, FACE_FOV, FACE_STAND, FACE_Y, faceCuts, faceShot, gunOnLine, ownStand } from "../client/render/faceshot";
import { attend, ATTEND, buildFixer, FIXER_SCALE, holdFace } from "../client/render/figures";

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

  it("a reply faces the other person, and the next line cuts to their face", () => {
    const player = { x: 0, y: 0, z: 0, yaw: Math.PI, eye: 1.62 };
    const visitor = { id: "deacon", x: 1.6, z: -5, yaw: 0.4 };
    const you = dialogueShot({ speaker: "you", player, visitor, wern: null })!;
    const toward = yawTo({ x: 0, y: 0, z: 0 }, { x: visitor.x, y: 0, z: visitor.z });
    expect(you.yaw).toBeCloseTo(toward);
    expect(you.yaw).not.toBeCloseTo(player.yaw);
    const fwd = yawDir(toward);
    const aimed = yawDir(player.yaw);
    expect(fwd.x * aimed.x + fwd.z * aimed.z).toBeLessThan(0);
    expect(you.x).toBeCloseTo(player.x + fwd.x * FACE_STAND);
    expect(you.z).toBeCloseTo(player.z + fwd.z * FACE_STAND);
    const alone = dialogueShot({ speaker: "you", player, visitor: null, wern: null })!;
    expect(alone.yaw).toBeCloseTo(player.yaw);
    const deacon = dialogueShot({ speaker: "deacon", player, visitor, wern: null })!;
    expect(Math.hypot(you.lookX - deacon.lookX, you.lookZ - deacon.lookZ)).toBeGreaterThan(FACE_CUT_M);
    expect(faceCuts(you, deacon)).toBe(true);
    expect(faceCuts(deacon, you)).toBe(true);
    expect(faceCuts(you, you)).toBe(false);
    expect(faceCuts(null, you)).toBe(false);
    expect(faceCuts(you, null)).toBe(false);
    const rend = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(rend).toMatch(/faceCuts\(this\.faceHold, shot\)/);
    expect(rend).toMatch(/this\.faceT = 1/);
    expect(rend).toMatch(/this\.local\.group\.rotation\.y = s\.yaw/);
  });

  it("the other person looks at the player, not at the mark they were placed on", () => {
    const player = { x: 4, y: 0, z: 1, yaw: 0, eye: 1.62 };
    const visitor = { id: "deacon", x: 1.6, z: -5, yaw: 0.4 };
    const deacon = dialogueShot({ speaker: "deacon", player, visitor, wern: null })!;
    const toward = yawTo({ x: visitor.x, y: 0, z: visitor.z }, { x: player.x, y: 0, z: player.z });
    expect(deacon.yaw).toBeCloseTo(toward);
    expect(deacon.yaw).not.toBeCloseTo(visitor.yaw);
    const wernAt = { x: 1.25, z: -7.25, yaw: Math.PI };
    const wern = dialogueShot({ speaker: "wern", player, visitor: null, wern: wernAt })!;
    expect(wern.yaw).toBeCloseTo(yawTo({ x: wernAt.x, y: 0, z: wernAt.z }, { x: player.x, y: 0, z: player.z }));
    expect(wern.yaw).not.toBeCloseTo(wernAt.yaw);
    const onTop = dialogueShot({ speaker: "deacon", player: { ...player, x: visitor.x, z: visitor.z }, visitor, wern: null })!;
    expect(onTop.yaw).toBeCloseTo(visitor.yaw);
    const rend = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(rend).toMatch(/faceVisitor\(s\.yaw\)/);
    expect(rend).toMatch(/this\.wern\.rotation\.y = s\.yaw/);
  });

  it("the waiting turn does not put the hood back on the door before the frame", () => {
    const f = buildFixer("deacon");
    f.position.set(1.6, 0, -5);
    f.rotation.y = 0.4;
    const player = { x: 4, z: 1 };
    for (let k = 0; k < 180; k++) attend(f, 1 / 60, player.x, player.z, k / 60);
    const capped = f.rotation.y;
    const yaw = yawTo({ x: 1.6, y: 0, z: -5 }, { x: player.x, y: 0, z: player.z });
    expect(Math.abs(yaw - capped)).toBeGreaterThan(0.5);
    const turned = (f.userData as { turned: number }).turned;
    holdFace(f, yaw);
    attend(f, 1 / 60, player.x, player.z, 4);
    expect(f.rotation.y).toBeCloseTo(yaw);
    expect((f.userData as { turned: number }).turned).toBeCloseTo(turned);
    const chest = f.scale.y;
    attend(f, 1 / 60, player.x, player.z, 4 + 1.05);
    expect(f.scale.y).not.toBeCloseTo(chest, 5);
    const rend = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(rend).toMatch(/holdVisitor\(s\.yaw\)/);
    expect(rend).toMatch(/holdFace\(this\.wern, s\.yaw\)/);
    expect(rend).toMatch(/this\.pinSpeaker\(this\.faceShot\)/);
  });

  it("ending the line eases the hood off you instead of snapping it to the door", () => {
    const f = buildFixer("deacon");
    f.position.set(1.6, 0, -5);
    f.rotation.y = 0.4;
    const player = { x: 4, z: 1 };
    for (let k = 0; k < 180; k++) attend(f, 1 / 60, player.x, player.z, k / 60);
    const capped = f.rotation.y;
    const yaw = yawTo({ x: 1.6, y: 0, z: -5 }, { x: player.x, y: 0, z: player.z });
    holdFace(f, yaw);
    attend(f, 1 / 60, player.x, player.z, 4);
    expect(f.rotation.y).toBeCloseTo(yaw);
    holdFace(f, null);
    attend(f, 1 / 60, player.x, player.z, 4);
    const slipped = Math.atan2(Math.sin(f.rotation.y - yaw), Math.cos(f.rotation.y - yaw));
    expect(Math.abs(slipped)).toBeLessThanOrEqual(ATTEND.rate / 60 + 1e-6);
    expect(Math.abs(f.rotation.y - capped)).toBeGreaterThan(0.5);
  });

  it("the gun is off the lens from the start of the line, not after the blend", () => {
    expect(gunOnLine(0, false)).toBe(false);
    expect(gunOnLine(0.1, false)).toBe(false);
    expect(gunOnLine(0, true)).toBe(true);
    expect(gunOnLine(0.1, true)).toBe(true);
    expect(gunOnLine(1, true)).toBe(true);
    const rend = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(rend).toMatch(/gunOnLine\(k, this\.faceShot !== null\)/);
    expect(rend).not.toMatch(/if \(k > 0\.35\) this\.viewmodel\.visible = false/);
  });

  it("your own line stands your body on your feet in first person", () => {
    const feet = { x: 3, y: 1, z: -2 };
    expect(ownStand("you", false, feet)).toEqual(feet);
    expect(ownStand("you", true, feet)).toEqual(feet);
    expect(ownStand("other", false, feet)).toBeNull();
    const rend = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(rend).toMatch(/ownStand\(s\.who, this\.thirdPerson/);
    expect(rend).toMatch(/this\.local\.group\.position\.set\(feet\.x, feet\.y, feet\.z\)/);
  });

  it("a guest does not film their own face for the host's line", () => {
    const player = { x: 2, y: 0, z: 1, yaw: 0.4, eye: 1.62 };
    expect(dialogueShot({ speaker: "you", player, visitor: null, wern: null, youIsSelf: false })).toBeNull();
    expect(dialogueShot({ speaker: "you", player, visitor: null, wern: null })!.who).toBe("you");
    const deacon = dialogueShot({ speaker: "deacon", player, visitor: { id: "deacon", x: 1.6, z: -5, yaw: 1 }, wern: null, youIsSelf: false });
    expect(deacon).not.toBeNull();
    expect(deacon!.who).toBe("other");
    const camp = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(camp).toMatch(/this\.armCutscene\(n\.speaker, false\)/);
    expect(camp).toMatch(/youIsSelf,/);
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
