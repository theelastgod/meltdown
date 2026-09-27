/**
 * Who the player walks home (Stage 677).
 *
 * Every escort in the game was Ida Vessel: an amber capsule under a cone, tagged IDA VESSEL, in
 * mission 4 where it is her and in the three wake-cell rescues where it is not; the feed told a
 * file walking a cell home that IDA IS MOVING. These tests run the real mission runtime on a real
 * district, feed its view to the real `EscortFigures` the renderer draws, and read what was built:
 * who is shown, which way they face, and whether Ida's feet stay where she puts them.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { SIM_HZ } from "../shared/sim/constants";
import { createMission, drainMissionEvents, missionView, resolveDialogue, stepMission, type MissionState } from "../shared/campaign/runtime";
import { MISSIONS, variantObjectives, type Objective } from "../shared/campaign/missions";
import { resolveSpot } from "../shared/campaign/runtime";
import { EscortFigures } from "../client/render/escort";
import { CITIZEN_LIMBS } from "../client/render/life";
import { VESSEL_STRIDE } from "../client/render/figures";

const stubTag = () => new THREE.Object3D();
const meshesOf = (g: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};

/** run a contract to its escort on a real district with the player standing on the escort, feeding the figures every tick */
function walk(id: string, level: string, answers: Record<string, string>, seconds: number) {
  const L = levelById(level);
  const w = new World(L, { ai: false, seed: 5, wakePhase: "off", dummyRespawn: false });
  const p = w.addPlayer(1, "BLANK", 1);
  const st = createMission(id, w, {}, "cells", 0)!;
  const fig = new EscortFigures(stubTag);
  const texts: string[] = [];
  const tick = (st: MissionState) => {
    w.step(new Map());
    stepMission(st, w, w.drainEvents());
    for (const e of drainMissionEvents(st)) if (e.type === "escort") texts.push(e.text);
    fig.set(missionView(st).escort);
    fig.update(1 / SIM_HZ);
  };
  // get through whatever comes before the escort: talk, reach, and kill what must be killed
  for (let guard = 0; guard < 20 && missionView(st).kind !== "escort"; guard++) {
    const o = st.objectives[st.index]!;
    if (o.kind === "dialogue") resolveDialogue(st, answers);
    if (o.kind === "reach") Object.assign(p.pos, { x: resolveSpot(L, o.at).x, z: resolveSpot(L, o.at).z });
    if (o.kind === "kill") for (const m of o.target === "mech" ? w.mechs : w.wasps) w.applyDamage(o.target === "mech" ? "mech" : "wasp", m.id, 1e4, 1, "lease_breaker", "shot");
    tick(st);
    tick(st);
  }
  expect(missionView(st).kind, `${id} never reached its escort`).toBe("escort");
  const path = (st.objectives[st.index] as Extract<Objective, { kind: "escort" }>).path.map((s) => resolveSpot(L, s));
  // the player walks beside them the whole way
  for (let i = 0; i < seconds * SIM_HZ; i++) {
    Object.assign(p.pos, { x: st.escort!.pos.x, z: st.escort!.pos.z });
    tick(st);
  }
  return { st, fig, texts, path, p, tick };
}

describe("every escort says who it is", () => {
  it("an escort is Ida exactly when its objective names her, in every contract and every variant", () => {
    const escorts: Extract<Objective, { kind: "escort" }>[] = [];
    for (const m of MISSIONS) for (const o of [...m.objectives, ...(m.variants ?? []).flatMap(variantObjectives)]) if (o.kind === "escort") escorts.push(o);
    expect(escorts.length).toBeGreaterThanOrEqual(6);
    for (const o of escorts) expect(o.who === "vessel", `"${o.text}" walks ${o.who}`).toBe(/\bIDA\b/.test(o.text));
    expect(new Set(escorts.map((o) => o.who))).toEqual(new Set(["vessel", "cell"]));
  });
});

describe("a wake cell walked home is a wake cell", () => {
  it("the feed names the cell, never Ida, and the three woken walk facing home", () => {
    const { fig, texts, path, st } = walk("g_rescue_docks", "deadletter_docks", {}, 2);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t).not.toMatch(/IDA/);
    expect(texts.some((t) => /THE CELL IS MOVING/.test(t))).toBe(true);
    // the cell is shown, not Ida
    expect(fig.cell.visible).toBe(true);
    expect(fig.vessel.visible).toBe(false);
    // they face along the path from E to A: a citizen is built facing +z, and its body instance carries its facing
    fig.cell.updateWorldMatrix(true, true);
    const leg = { x: path[1]!.x - path[0]!.x, z: path[1]!.z - path[0]!.z };
    const len = Math.hypot(leg.x, leg.z);
    const body = fig.cell.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh && (c as THREE.InstancedMesh).count === 3) as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    for (let i = 0; i < 3; i++) {
      body.getMatrixAt(i, m);
      const f = new THREE.Vector3(0, 0, 1).transformDirection(m.premultiply(body.matrixWorld));
      expect((f.x * leg.x + f.z * leg.z) / len, `citizen ${i} walks backwards or sideways`).toBeGreaterThan(0.95);
    }
    // and they walk where the runtime has them: the figure is on the escort
    expect(Math.hypot(fig.cell.position.x - st.escort!.pos.x, fig.cell.position.z - st.escort!.pos.z)).toBeLessThan(1e-9);
  });

  it("their legs stride while they walk and come together while they wait", () => {
    const { fig, p, tick, st, path } = walk("g_rescue_docks", "deadletter_docks", {}, 1);
    const dir = new THREE.Vector3(path[1]!.x - path[0]!.x, 0, path[1]!.z - path[0]!.z).normalize();
    // how far apart each citizen's two shoes are along the way they walk, read off the built instances
    const apart = (): number[] => {
      const m = new THREE.Matrix4();
      fig.cell.updateWorldMatrix(true, true);
      const at = (i: number) => {
        fig.cellLimbs.getMatrixAt(i, m);
        return new THREE.Vector3().setFromMatrixPosition(m.premultiply(fig.cellLimbs.matrixWorld));
      };
      const out: number[] = [];
      for (let c = 0; c < 3; c++) {
        const shoes = CITIZEN_LIMBS.map((L, k) => ({ L, k })).filter(({ L }) => L.kind === "shoe");
        const [a, b] = shoes.map(({ k }) => at(c * CITIZEN_LIMBS.length + k));
        out.push(Math.abs(a!.clone().sub(b!).dot(dir)));
      }
      return out;
    };
    let widest = 0;
    for (let i = 0; i < SIM_HZ / 2; i++) {
      Object.assign(p.pos, { x: st.escort!.pos.x, z: st.escort!.pos.z });
      tick(st);
      widest = Math.max(widest, ...apart());
    }
    expect(widest, "the cell glides with its feet together").toBeGreaterThan(0.15);
    // the player walks off: they stop, and their feet come together
    Object.assign(p.pos, { x: 60, z: 60 });
    for (let i = 0; i < SIM_HZ; i++) tick(st);
    expect(st.escort!.waiting).toBe(true);
    for (const d of apart()) expect(d, "a waiting citizen stands mid-stride").toBeLessThan(0.01);
  });
});

describe("Ida walks in her own body", () => {
  it("mission 4 shows Ida, not the cell, and the feed names her", () => {
    const { fig, texts } = walk("m4_the_leak", "deadletter_docks", { "m4:directive": "kept", "m4:vessel": "shield" }, 1);
    expect(fig.vessel.visible).toBe(true);
    expect(fig.cell.visible).toBe(false);
    expect(texts.some((t) => /^IDA IS MOVING/.test(t))).toBe(true);
    // her own figure: body, gold, and legs that move; not the capsule and cone
    const meshes = meshesOf(fig.vessel);
    expect(meshes.length).toBeLessThanOrEqual(4);
    expect(meshes.some((m) => m.geometry.type === "CapsuleGeometry" || m.geometry.type === "ConeGeometry")).toBe(false);
    expect(meshes.reduce((n, m) => n + m.geometry.getAttribute("position").count * ((m as THREE.InstancedMesh).count ?? 1), 0)).toBeGreaterThan(1000);
  });

  it("faces the way she walks, on every leg of the path", () => {
    const fig = new EscortFigures(stubTag);
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.6, -0.8]] as const) {
      const heading = Math.atan2(-dx, -dz);
      fig.set({ x: 0, z: 0, heading, who: "vessel", waiting: false });
      fig.vessel.updateWorldMatrix(true, true);
      // the figure's front is its -z
      const f = new THREE.Vector3(0, 0, -1).transformDirection(fig.vessel.matrixWorld);
      expect(f.x * dx + f.z * dz).toBeGreaterThan(0.999);
    }
  });

  it("the planted foot stays where she puts it and on the street, and the stepping foot lifts", () => {
    const fig = new EscortFigures(stubTag);
    fig.set({ x: 3, z: 0, heading: Math.atan2(-1, 0), who: "vessel", waiting: false }); // walking +x
    for (let i = 0; i < 60; i++) fig.update(1 / 60); // settle into the walk
    let slip = 0, sunk = 0, floated = 0, lifted = 0;
    const steps = 120;
    for (let k = 1; k <= steps; k++) {
      const before = fig.vesselSoles();
      fig.set({ x: 3 + (k * VESSEL_STRIDE) / steps, z: 0, heading: Math.atan2(-1, 0), who: "vessel", waiting: false });
      const after = fig.vesselSoles();
      const i = before[0]!.y <= before[1]!.y ? 0 : 1;
      slip += Math.hypot(after[i]!.x - before[i]!.x, after[i]!.z - before[i]!.z);
      sunk = Math.max(sunk, -after[i]!.y);
      floated = Math.max(floated, after[i]!.y);
      lifted = Math.max(lifted, after[1 - i]!.y);
    }
    expect(slip, `the planted foot slid ${slip.toFixed(3)} m over a ${VESSEL_STRIDE} m stride`).toBeLessThan(0.02 * VESSEL_STRIDE);
    expect(sunk, "the planted foot sank into the street").toBeLessThan(0.01);
    expect(floated, "the planted foot floated").toBeLessThan(0.015);
    expect(lifted, "the stepping foot never left the street").toBeGreaterThan(0.04);
  });

  it("while she waits both feet come down together, on the street", () => {
    const fig = new EscortFigures(stubTag);
    for (let k = 0; k <= 20; k++) {
      fig.set({ x: 0, z: -k * 0.03, heading: 0, who: "vessel", waiting: false });
      fig.update(1 / 60);
    }
    const walking = fig.vesselSoles();
    expect(Math.abs(walking[0]!.z - walking[1]!.z), "she was not mid-stride to begin with").toBeGreaterThan(0.1);
    fig.set({ x: 0, z: -0.6, heading: 0, who: "vessel", waiting: true });
    for (let i = 0; i < 60; i++) fig.update(1 / 60);
    const [l, r] = fig.vesselSoles();
    expect(Math.abs(l!.z - r!.z)).toBeLessThan(0.01);
    expect(Math.abs(l!.y)).toBeLessThan(0.005);
    expect(Math.abs(r!.y)).toBeLessThan(0.005);
  });
});
