/**
 * Who the player walks home (Stage 677).
 *
 * Until this stage every escort was the same amber capsule under a cone, tagged IDA VESSEL: in
 * mission 4, where it is Ida, and in the three wake-cell rescues, where it is a cell of woken people
 * and not Ida at all. Each is drawn as who it is now.
 *
 * - **Ida Vessel** walks in her own body (figures.ts), her legs swung by the planted-foot walk
 *   (gait.ts) and her arms against them, facing along the street she is walking.
 * - **A wake cell** is three citizens of the leased crowd who have woken: the crowd's own coats,
 *   hoods and striding limbs, walking close together, with the lease lamp on the chest gone out and
 *   the cells' cyan in its place.
 *
 * Both stand still, legs together, while they wait for the player to come back within the leash.
 * Render only: where they are and which way they face is the mission runtime's.
 */
import * as THREE from "three";
import type { EscortWho } from "@shared/campaign/missions";
import { bindPlate, PALETTE } from "./city";
import { FIXER_SCALE, FIXER_TRIM, VESSEL_ARM_SWING, VESSEL_HIP, VESSEL_LIFT, VESSEL_SHOULDER, VESSEL_STRIDE, armSwingPatch, fixerGeometry, vesselLegLength, vesselWalkerGeometry, type ArmUniforms } from "./figures";
import { armSwing, plantedBob, plantedGait, type PlantedWalk } from "./gait";
import { CITIZEN_LIMBS, citizenBodyGeometry, citizenHoodGeometry, citizenSwing, paintCitizenLimbs } from "./life";

/** where the mission runtime has the escort, and which way it faces (a sim yaw: front -z at 0) */
export interface EscortPose {
  x: number;
  z: number;
  heading: number;
  who: EscortWho;
  waiting: boolean;
}

/**
 * The cell's three, in the escort's own frame (front -z): one at the point the runtime walks, two a
 * pace behind and to either side, inside the leash. `phase` staggers their steps; `h` their height.
 */
export const CELL = [
  { x: 0, z: 0, phase: 0, h: 1.0 },
  { x: -0.55, z: 0.8, phase: 2.2, h: 0.94 },
  { x: 0.6, z: 0.95, phase: 4.1, h: 1.04 },
] as const;

/** how fast a stopped escort settles its legs together, and starts walking again (per second) */
const SETTLE = 4;

type Tag = (text: string, colour: number) => THREE.Object3D;

export class EscortFigures {
  readonly group = new THREE.Group();
  readonly vessel = new THREE.Group();
  readonly cell = new THREE.Group();
  /** Ida's two legs (left, right), each about its hip */
  readonly vesselLegs: THREE.InstancedMesh;
  /** the pitch of Ida's two arms (left, right) about her shoulder, as her body's shader reads it */
  readonly vesselArms: ArmUniforms = { uArm: { value: new THREE.Vector2() }, uShoulder: { value: VESSEL_SHOULDER } };
  /** the cell's shins, shoes and arms, CITIZEN_LIMBS.length per citizen */
  readonly cellLimbs: THREE.InstancedMesh;
  private vesselPose = new THREE.Group();
  private cellBody: THREE.InstancedMesh;
  private cellHood: THREE.InstancedMesh;
  private cellMark: THREE.InstancedMesh;
  private tags: THREE.Object3D[] = [];
  private pose: EscortPose | null = null;
  /** metres walked, for the stride; a jump (a new objective, a new path) is not a step */
  private walked = 0;
  private at: { x: number; z: number } | null = null;
  /** 0 walking, 1 standing with the legs together */
  private rest = 1;
  private time = 0;
  private readonly walk: PlantedWalk;
  private m = new THREE.Matrix4();
  private r = new THREE.Matrix4();
  private t = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(tag: Tag) {
    this.group.name = "escort";
    // ---- Ida ----
    const vg = vesselWalkerGeometry();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x06070b, roughness: 0.95 });
    // the body's own material swings her arms; the legs keep the plain one
    const armedMat = bodyMat.clone();
    armSwingPatch(armedMat, this.vesselArms);
    const body = new THREE.Mesh(vg.body, armedMat);
    const trim = new THREE.Mesh(fixerGeometry("vessel").trim, new THREE.MeshBasicMaterial({ color: FIXER_TRIM.vessel }));
    this.vesselLegs = new THREE.InstancedMesh(vg.leg, bodyMat, 2);
    this.vesselLegs.frustumCulled = false;
    this.vesselPose.add(body, trim, this.vesselLegs);
    this.vessel.add(this.vesselPose);
    this.vessel.scale.setScalar(FIXER_SCALE.vessel);
    this.vessel.name = "escort:vessel";
    const vt = tag("IDA VESSEL", FIXER_TRIM.vessel);
    vt.position.y = 2.1;
    this.vessel.add(vt);
    this.tags.push(vt);
    this.walk = { stride: VESSEL_STRIDE, leg: vesselLegLength(), lift: VESSEL_LIFT };
    // ---- the cell ----
    const n = CELL.length;
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0d13, roughness: 0.9, metalness: 0.05 });
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x090a0f, roughness: 1, vertexColors: true });
    const markMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan });
    bindPlate(dark, "tex_crowd_coat");
    bindPlate(hoodMat, "tex_cloak");
    bindPlate(markMat, "tex_lamp");
    this.cellBody = new THREE.InstancedMesh(citizenBodyGeometry(), dark, n);
    this.cellLimbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dark, n * CITIZEN_LIMBS.length);
    paintCitizenLimbs(this.cellLimbs, n);
    this.cellHood = new THREE.InstancedMesh(citizenHoodGeometry(), hoodMat, n);
    // where the crowd wears VANTAGE's amber lease lamp, the woken wear a thin cyan bar
    this.cellMark = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.022, 0.03), markMat, n);
    for (const mesh of [this.cellBody, this.cellLimbs, this.cellHood, this.cellMark]) {
      mesh.frustumCulled = false;
      this.cell.add(mesh);
    }
    this.cell.name = "escort:cell";
    const ct = tag("WAKE CELL", PALETTE.cyan);
    ct.position.y = 2.0;
    this.cell.add(ct);
    this.tags.push(ct);
    this.vessel.visible = false;
    this.cell.visible = false;
    this.group.add(this.vessel, this.cell);
    this.update(0);
  }

  /** where the runtime has the escort now; null when no escort is being walked */
  set(pose: EscortPose | null): void {
    if (!pose) {
      this.pose = null;
      this.at = null;
      this.vessel.visible = this.cell.visible = false;
      return;
    }
    if (this.at) {
      const moved = Math.hypot(pose.x - this.at.x, pose.z - this.at.z);
      if (moved < 2) this.walked += moved;
    }
    this.at = { x: pose.x, z: pose.z };
    this.pose = pose;
    this.vessel.visible = pose.who === "vessel";
    this.cell.visible = pose.who === "cell";
    const fig = pose.who === "vessel" ? this.vessel : this.cell;
    fig.position.set(pose.x, 0, pose.z);
    fig.rotation.y = pose.heading;
    this.pose_();
  }

  update(dt: number): void {
    this.time += dt;
    const waiting = this.pose?.waiting ?? true;
    const step = SETTLE * Math.max(0, dt);
    this.rest = waiting ? Math.min(1, this.rest + step) : Math.max(0, this.rest - step);
    // a waiting escort's tag pulses: come back
    for (const t of this.tags) t.visible = !waiting || Math.sin(this.time * 7) > -0.3;
    this.pose_();
  }

  /** Ida's two sole points in world space (left, right), for the checks that her feet stay put */
  vesselSoles(): THREE.Vector3[] {
    this.vessel.updateWorldMatrix(true, true);
    const out: THREE.Vector3[] = [];
    for (let k = 0; k < 2; k++) {
      this.vesselLegs.getMatrixAt(k, this.m);
      out.push(new THREE.Vector3(0, -this.walk.leg, 0).applyMatrix4(this.m).applyMatrix4(this.vesselLegs.matrixWorld));
    }
    return out;
  }

  private pose_(): void {
    const go = 1 - this.rest;
    // ---- Ida: the planted-foot walk, the arms against it, eased to her standing pose while she waits ----
    const local = this.walked / FIXER_SCALE.vessel;
    for (const [k, side] of [[0, -1], [1, 1]] as const) {
      const g = plantedGait(this.walk, local, side);
      this.m.makeTranslation(side * VESSEL_HIP.x, VESSEL_HIP.y + g.lift * go, 0);
      this.m.multiply(this.r.makeRotationX(g.angle * go));
      this.vesselLegs.setMatrixAt(k, this.m);
      this.vesselArms.uArm.value.setComponent(k, armSwing(this.walk, local, side, VESSEL_ARM_SWING) * go);
    }
    this.vesselLegs.instanceMatrix.needsUpdate = true;
    this.vesselPose.position.y = plantedBob(this.walk, local) * go;
    // ---- the cell: the crowd's stride, driven by ground covered ----
    for (let i = 0; i < CELL.length; i++) {
      const c = CELL[i]!;
      const swing = citizenSwing(this.walked, 1, c.phase, false) * go;
      const bob = Math.abs(Math.sin(this.walked * 6 + c.phase)) * 0.04 * go;
      // citizens are built facing +z; the escort's frame faces -z
      this.q.setFromAxisAngle(this.up, Math.PI);
      this.s.set(c.h, c.h, c.h);
      this.p.set(c.x, bob, c.z);
      this.m.compose(this.p, this.q, this.s);
      this.cellBody.setMatrixAt(i, this.m);
      this.cellHood.setMatrixAt(i, this.m);
      for (let k = 0; k < CITIZEN_LIMBS.length; k++) {
        const L = CITIZEN_LIMBS[k]!;
        this.r.makeTranslation(L.pivot[0], L.pivot[1], L.pivot[2]);
        this.r.multiply(this.t.makeRotationX(swing * L.swing * L.side));
        this.r.multiply(this.t.makeTranslation(L.centre[0] - L.pivot[0], L.centre[1] - L.pivot[1], L.centre[2] - L.pivot[2]));
        if (L.tilt) this.r.multiply(this.t.makeRotationZ(L.tilt));
        this.r.multiply(this.t.makeScale(L.size[0], L.size[1], L.size[2]));
        this.r.premultiply(this.m);
        this.cellLimbs.setMatrixAt(i * CITIZEN_LIMBS.length + k, this.r);
      }
      // the mark sits where the lease lamp would, on the coat's chest (+z in the citizen's frame)
      this.r.makeTranslation(0, 1.12, 0.19);
      this.r.premultiply(this.m);
      this.cellMark.setMatrixAt(i, this.r);
    }
    for (const mesh of [this.cellBody, this.cellHood, this.cellLimbs, this.cellMark]) mesh.instanceMatrix.needsUpdate = true;
  }
}
