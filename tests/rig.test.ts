/**
 * The skinned silhouette's construction (Stage 63): bones where the table says, geometry that
 * merges (every part carries the same attribute set), a bind pose that matches rest, and arms
 * that reach the weapon by IK when a pose is written.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyPose, BONE, buildRig, cloakGeometry, REST_BONES, rigReport, trimGeometry, weaponStripGeometry, type BoneName } from "../client/render/rig";
import { createPoseState, poseBody, type PoseInput } from "../client/render/pose";
import { MOVE } from "../shared/sim/constants";

const base = (over: Partial<PoseInput> = {}): PoseInput => ({ speed: 0, moveYaw: 0, yaw: 0, pitch: 0, vy: 0, turnRate: 0, grounded: true, stance: "stand", height: 1.8, reloading: 0, ads: 0, kick: 0, swap: 0, charge: 0, alive: true, stunned: false, clock: 0, phase: 0, ...over });

describe("the rig", () => {
  it("has ten bones at the rest table, in index order, with the socket at the root", () => {
    const rig = buildRig();
    expect(rig.skeleton.bones.length).toBe(10);
    for (const name of Object.keys(REST_BONES) as BoneName[]) {
      const w = rig.bones[name].getWorldPosition(new THREE.Vector3());
      expect([w.x, w.y, w.z].map((v) => +v.toFixed(6))).toEqual(REST_BONES[name].world);
      expect(rig.skeleton.bones[BONE[name]]).toBe(rig.bones[name]);
    }
    expect(rig.bones.socket.parent).toBe(rig.group);
    expect(rig.hand).toBe(rig.bones.socket);
  });

  it("the cloak and the trim are skinned meshes on one skeleton, with skin and sway attributes on every vertex", () => {
    const rig = buildRig();
    for (const m of [rig.cloak, rig.trimMesh]) {
      expect(m.isSkinnedMesh).toBe(true);
      expect(m.skeleton).toBe(rig.skeleton);
      const g = m.geometry;
      expect(g.getAttribute("skinIndex").itemSize).toBe(4);
      expect(g.getAttribute("skinWeight").itemSize).toBe(4);
      expect(g.getAttribute("sway").itemSize).toBe(1);
      expect(g.getAttribute("sway").count).toBe(g.getAttribute("position").count);
      expect(m.boundingSphere?.radius).toBe(1.5);
    }
    const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    expect(tris(rig.cloak.geometry)).toBeGreaterThan(200);
    expect(tris(rig.cloak.geometry)).toBeLessThan(500);
    expect(tris(rig.trimMesh.geometry)).toBeGreaterThan(40);
    // the hem sways, the shoulders do not
    const pos = rig.cloak.geometry.getAttribute("position");
    const sway = rig.cloak.geometry.getAttribute("sway");
    let hem = 0, top = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0.6 && Math.hypot(pos.getX(i), pos.getZ(i)) > 0.3) hem = Math.max(hem, sway.getX(i));
      if (pos.getY(i) > 1.45) top = Math.max(top, sway.getX(i));
    }
    expect(hem).toBeGreaterThan(0.9);
    expect(top).toBeLessThan(0.01);
    // both materials share one uniforms object, and the program key is constant
    expect(rig.mat.userData.sway).toBe(rig.uniforms);
    expect(rig.trim.userData.sway).toBe(rig.uniforms);
    expect(rig.mat.customProgramCacheKey()).toBe(rig.trim.customProgramCacheKey());
  });

  it("the geometry caches are shared: the same cloak twice, one per weapon slot, and a strip per weapon", () => {
    expect(cloakGeometry(null)).toBe(cloakGeometry(null));
    expect(cloakGeometry("stack_smg")).not.toBe(cloakGeometry(null));
    expect(cloakGeometry("stack_smg").getAttribute("position").count).toBeGreaterThan(cloakGeometry(null).getAttribute("position").count);
    expect(trimGeometry()).toBe(trimGeometry());
    expect(weaponStripGeometry("lease_breaker").getAttribute("position").count).toBeGreaterThan(0);
    // a slot's weapon rides the socket bone
    const idx = cloakGeometry("stack_smg").getAttribute("skinIndex");
    let socketVerts = 0;
    for (let i = 0; i < idx.count; i++) if (idx.getX(i) === BONE.socket) socketVerts++;
    expect(socketVerts).toBeGreaterThan(0);
  });

  it("a written pose puts the socket at the aim's pitch exactly and both hands on the weapon", () => {
    const rig = buildRig();
    rig.group.position.set(3, 0, -2);
    rig.group.rotation.y = 0.7;
    const st = createPoseState();
    for (const pitch of [0.5, -0.6, 0]) {
      let out = poseBody(base({ pitch }), st, 1 / 60);
      for (let i = 0; i < 60; i++) out = poseBody(base({ pitch, clock: i / 60 }), st, 1 / 60);
      applyPose(rig, out, 0.7);
      const r = rigReport(rig) as { socketPitch: number; wristErr: { r: number; l: number }; headPitch: number; hoodApex: number; bootBottom: { l: number; r: number } };
      expect(r.socketPitch).toBeCloseTo(pitch, 2);
      expect(r.wristErr.r).toBeLessThan(0.03);
      expect(r.wristErr.l).toBeLessThan(0.03);
      expect(r.headPitch).toBeCloseTo(0.85 * pitch, 1); // the chest bows 0.35 of the pitch and the hood 0.5 more on top
      expect(r.hoodApex).toBeGreaterThan(1.7);
      expect(r.bootBottom.l).toBeGreaterThan(-0.03);
    }
  });

  it("a crouch lowers the hood under the low capsule's height, and a slide lays the lead boot flat", () => {
    const rig = buildRig();
    const st = createPoseState();
    let out = poseBody(base({ stance: "crouch", height: MOVE.lowHeight }), st, 1 / 60);
    for (let i = 0; i < 90; i++) out = poseBody(base({ stance: "crouch", height: MOVE.lowHeight, clock: i / 60 }), st, 1 / 60);
    applyPose(rig, out, 0);
    const c = rigReport(rig) as { hoodApex: number; bootBottom: { l: number; r: number } };
    expect(c.hoodApex).toBeLessThanOrEqual(MOVE.lowHeight);
    expect(c.bootBottom.l).toBeGreaterThan(-0.03);
    const st2 = createPoseState();
    out = poseBody(base({ stance: "slide", height: 1.15, speed: 9 }), st2, 1 / 60);
    for (let i = 0; i < 90; i++) out = poseBody(base({ stance: "slide", height: 1.15, speed: 9, clock: i / 60 }), st2, 1 / 60);
    applyPose(rig, out, 0);
    const s = rigReport(rig) as { bootBottom: { l: number; r: number }; out: { hipsRx: number } | null };
    expect(s.bootBottom.r).toBeGreaterThan(-0.05);
    expect(s.bootBottom.r).toBeLessThan(0.12);
  });

  it("a death fades the trim to a fifth of the tint and a respawn restores it", () => {
    const rig = buildRig();
    const st = createPoseState();
    poseBody(base(), st, 1 / 60);
    let out = poseBody(base({ alive: false }), st, 1 / 60);
    for (let i = 0; i < 40; i++) out = poseBody(base({ alive: false, clock: i / 60 }), st, 1 / 60);
    applyPose(rig, out, 0);
    const dead = rig.trim.color.getHex();
    expect(dead).not.toBe(rig.tint.getHex());
    expect(rig.trim.color.r).toBeLessThanOrEqual(rig.tint.r * 0.25 + 0.01);
    applyPose(rig, poseBody(base({ alive: true }), st, 1 / 60), 0);
    expect(rig.trim.color.getHex()).toBe(rig.tint.getHex());
  });

  it("the boots stay on the ground through a whole crouch, not merely once it has settled", () => {
    // the claim is about the transient — the hips drop and the legs fold together — so read every
    // frame of the blend, at several depths, rather than the one frame where everything has eased
    for (const height of [MOVE.lowHeight, 1.3, 1.5]) {
      const rig = buildRig();
      const st = createPoseState();
      let worst = 1;
      for (let i = 0; i < 120; i++) {
        applyPose(rig, poseBody(base({ stance: "crouch", height, clock: i / 60 }), st, 1 / 60), 0);
        worst = Math.min(worst, rigReport(rig).bootBottom.l, rigReport(rig).bootBottom.r);
      }
      expect(worst).toBeGreaterThan(-0.03);
    }
  });

  it("a settled crouch at every depth fits under its capsule", () => {
    // the pose's crouch is driven by the sim's capsule height, so what a crouching player looks
    // like and what a shot at them tests are the same volume: the hood must clear MOVE.lowHeight
    for (const height of [MOVE.lowHeight, 1.3, 1.5]) {
      const rig = buildRig();
      const st = createPoseState();
      let out = poseBody(base({ stance: "crouch", height }), st, 1 / 60);
      for (let i = 0; i < 120; i++) out = poseBody(base({ stance: "crouch", height, clock: i / 60 }), st, 1 / 60);
      applyPose(rig, out, 0);
      const rep = rigReport(rig);
      expect(rep.hoodApex).toBeLessThanOrEqual(height === MOVE.lowHeight ? MOVE.lowHeight : height + 0.2);
      expect(rep.bootBottom.l).toBeGreaterThan(-0.03);
      expect(rep.bootBottom.r).toBeGreaterThan(-0.03);
      expect(rep.bootBottom.l).toBeLessThan(0.06);
    }
  });

  it("walking puts the chest ahead of the hips along the facing — it leans into the walk, not away from it", () => {
    for (const yaw of [0, 1.1, -2.4]) {
      const rig = buildRig();
      const st = createPoseState();
      let out = poseBody(base({ speed: 5, yaw, moveYaw: yaw }), st, 1 / 60);
      for (let i = 0; i < 90; i++) out = poseBody(base({ speed: 5, yaw, moveYaw: yaw, clock: i / 60 }), st, 1 / 60);
      applyPose(rig, out, yaw);
      expect(rigReport(rig).chestAhead).toBeGreaterThan(0.01);
    }
  });

  it("the lead boot stays on the ground at every frame of a slide entry, not only when it settles", () => {
    // the hips drop half a metre and the lead leg swings out; eased apart they used to put the boot
    // 9 cm through the floor halfway in, which is the only part of a slide a player actually sees
    const rig = buildRig();
    const st = createPoseState();
    poseBody(base(), st, 1 / 60);
    let worst = 1;
    for (let i = 0; i < 90; i++) {
      const out = poseBody(base({ stance: "slide", height: MOVE.lowHeight, speed: 9, clock: i / 60 }), st, 1 / 60);
      applyPose(rig, out, 0);
      worst = Math.min(worst, rigReport(rig).bootBottom.r);
    }
    expect(worst).toBeGreaterThan(-0.03);
  });

  it("a file laid down rests on the ground for the whole death, not only at the end of it", () => {
    // the hips drop half a metre and the legs swing out as the body falls; eased apart they put the
    // left boot 41 cm under the floor for the whole second the corpse is on screen (Stage 65)
    const rig = buildRig();
    const st = createPoseState();
    poseBody(base(), st, 1 / 60);
    let worst = 1;
    let laid = 0;
    for (let i = 0; i < 80; i++) {
      const out = poseBody(base({ alive: false, clock: i / 60 }), st, 1 / 60);
      applyPose(rig, out, 0);
      const rep = rigReport(rig);
      worst = Math.min(worst, rep.bootBottom.l, rep.bootBottom.r);
      laid = Math.max(laid, out.hips.rx);
    }
    expect(worst).toBeGreaterThan(-0.03);
    expect(laid).toBeGreaterThan(1.0); // and it is still lying down, not standing politely
  });

  it("both wrists reach the weapon as the bones were written, measured from the forearm's end", () => {
    // measured through the skeleton rather than from the solver's own return value, so writing the
    // solution to the wrong bone fails the check instead of passing it
    const rig = buildRig();
    const st = createPoseState();
    for (const pitch of [0, 0.6, -0.7]) {
      let out = poseBody(base({ pitch }), st, 1 / 60);
      for (let i = 0; i < 60; i++) out = poseBody(base({ pitch, clock: i / 60 }), st, 1 / 60);
      applyPose(rig, out, 0);
      const rep = rigReport(rig);
      expect(rep.wristErr.r ?? 9).toBeLessThan(0.03);
      expect(rep.wristErr.l ?? 9).toBeLessThan(0.03);
    }
  });
});
