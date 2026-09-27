/**
 * VANTAGE's machines have bodies (Stage 668).
 *
 * The Wasp was a box under four flat discs and the repo mech a box on two box legs that slid along
 * its patrol. These tests drive the real `ArsenalFx` sync path the game calls every frame and read
 * what it built: the mech's legs stride by ground covered with the planted foot planted, what you
 * see stays inside what you can shoot, the searchlight's lens faces the street, and each machine
 * costs fewer draw calls than the boxes did.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ArsenalFx } from "../client/render/weapons";
import { MECH_STRIDE, mechGeometry, mechLegLength, waspGeometry } from "../client/render/machines";
import { MECH_HEIGHT, MECH_RADIUS, WASP_HEIGHT } from "../shared/sim/world";

const mech = (z: number, x = 0) => [{ id: 7, pos: { x, y: 0, z }, yaw: 0, lightYaw: 0, alive: true, locked: false }];
const meshesOf = (scene: THREE.Scene) => {
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};
const reach = (g: THREE.BufferGeometry) => {
  const p = g.getAttribute("position");
  let r = 0, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.count; i++) {
    r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
    y0 = Math.min(y0, p.getY(i));
    y1 = Math.max(y1, p.getY(i));
  }
  return { r, y0, y1 };
};

describe("the repo mech walks", () => {
  // the mech's own sole points, in world space, read off the meshes the game built
  const rig = () => {
    const scene = new THREE.Scene();
    const fx = new ArsenalFx(scene);
    fx.syncMechs(mech(0));
    const legs = ["legL", "legR"].map((n) => scene.getObjectByName(n)!);
    const leg = mechGeometry().leg;
    leg.computeBoundingBox();
    const soleY = leg.boundingBox!.min.y;
    const soles = () =>
      legs.map((l) => {
        l.updateWorldMatrix(true, false);
        return new THREE.Vector3(0, soleY, 0).applyMatrix4(l.matrixWorld);
      });
    return { fx, soles };
  };

  it("its legs are half a stride apart, stop when it stops, and a jump across the street is not a step", () => {
    const { fx } = rig();
    const at0 = fx.mechLegs(7)!;
    const MECH_SWING = Math.asin(MECH_STRIDE / 4 / mechLegLength());
    // at the start of the cycle one foot is put down ahead and the other is behind
    expect(at0[0]).toBeCloseTo(MECH_SWING, 6);
    expect(at0[1]).toBeCloseTo(-MECH_SWING, 6);
    fx.syncMechs(mech(-MECH_STRIDE / 3));
    const mid = fx.mechLegs(7)!;
    expect(mid).not.toEqual(at0);
    fx.syncMechs(mech(-MECH_STRIDE / 3));
    expect(fx.mechLegs(7), "standing still walked").toEqual(mid);
    fx.syncMechs(mech(-40));
    expect(fx.mechLegs(7), "a respawn was taken as a stride").toEqual(mid);
  });

  it("the planted foot stays where it was put and on the ground, and the stepping foot lifts clear", () => {
    const { fx, soles } = rig();
    let slip = 0, sunk = 0, floated = 0, lifted = 0;
    const steps = 96;
    const step = MECH_STRIDE / steps;
    for (let k = 1; k <= steps; k++) {
      const before = soles();
      fx.syncMechs(mech(-k * step));
      const after = soles();
      // the foot on the ground is the lower one; how far did it move over the street, and is it on it?
      const i = before[0]!.y <= before[1]!.y ? 0 : 1;
      slip += Math.hypot(after[i]!.x - before[i]!.x, after[i]!.z - before[i]!.z);
      sunk = Math.max(sunk, -after[i]!.y);
      floated = Math.max(floated, after[i]!.y);
      lifted = Math.max(lifted, after[1 - i]!.y);
    }
    expect(slip, `the planted foot slid ${slip.toFixed(3)} m over a ${MECH_STRIDE} m stride`).toBeLessThan(0.02 * MECH_STRIDE);
    expect(sunk, "the planted foot sank into the street").toBeLessThan(0.02);
    expect(floated, "the planted foot floated off the street").toBeLessThan(0.03);
    expect(lifted, "the stepping foot never left the ground").toBeGreaterThan(0.15);
  });
});

describe("what you see is what you shoot", () => {
  it("the mech fills its hit capsule: feet on the ground, head at the capsule's top, shoulders at its edge", () => {
    const g = mechGeometry();
    const hull = reach(g.hull);
    // the legs hang from the hip; the head sits on the turret pivot
    const legs = reach(g.leg);
    const head = reach(g.head);
    expect(1.85 + legs.y0).toBeGreaterThan(-0.02);
    expect(1.85 + legs.y0).toBeLessThan(0.05);
    const top = 3.2 + head.y1;
    expect(top / MECH_HEIGHT).toBeGreaterThan(0.95);
    expect(top / MECH_HEIGHT).toBeLessThan(1.1);
    expect(hull.r / MECH_RADIUS).toBeGreaterThan(0.9);
    expect(hull.r / MECH_RADIUS).toBeLessThan(1.3);
  });

  it("the Wasp stays inside its capsule's height, and reaches no further out than the old rotor discs did", () => {
    const w = waspGeometry();
    const hull = reach(w.hull);
    expect(hull.y1).toBeLessThan(WASP_HEIGHT / 2);
    expect(hull.y0).toBeGreaterThan(-WASP_HEIGHT / 2);
    // the Stage-4 discs were 0.22 m round a rotor at (0.35, 0.3): 0.68 m out
    expect(hull.r).toBeLessThanOrEqual(Math.hypot(0.35, 0.3) + 0.22 + 0.01);
  });
});

describe("the searchlight and the budget", () => {
  it("the searchlight's lens faces the street it lights (the old one faced into its own housing)", () => {
    const scene = new THREE.Scene();
    const fx = new ArsenalFx(scene);
    fx.syncMechs(mech(0));
    const lens = meshesOf(scene).find((m) => m.geometry.type === "CircleGeometry")!;
    lens.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(lens.matrixWorld);
    // the mech faces -z at yaw 0, and so does its light
    expect(n.z).toBeLessThan(-0.9);
  });

  it("a Wasp and a mech each cost fewer draw calls than the boxes did (10 and 9)", () => {
    const s1 = new THREE.Scene();
    new ArsenalFx(s1).syncWasps([{ id: 1, pos: { x: 0, y: 3, z: 0 }, yaw: 0, alive: true, state: 0 }]);
    expect(meshesOf(s1).length).toBeLessThanOrEqual(6);
    const s2 = new THREE.Scene();
    new ArsenalFx(s2).syncMechs(mech(0));
    expect(meshesOf(s2).length).toBeLessThanOrEqual(7);
  });

  it("the geometry is shared: a wave of drones builds one body", () => {
    const scene = new THREE.Scene();
    const fx = new ArsenalFx(scene);
    fx.syncWasps([1, 2, 3].map((id) => ({ id, pos: { x: id * 3, y: 3, z: 0 }, yaw: 0, alive: true, state: 0 })));
    const bodies = new Set(meshesOf(scene).map((m) => m.geometry));
    expect(bodies.size).toBe(3); // hull, eye, rotor
  });
});
