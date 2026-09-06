/**
 * Tracers and impact sparks, pooled.
 *
 * They used to be allocated per shot: a `BufferGeometry` and a `LineBasicMaterial` for every tracer,
 * disposed 120 ms later, and for every world hit a `SphereGeometry` and a `MeshBasicMaterial` that
 * were removed from the scene and **never disposed** — so each hit leaked a GPU buffer for the life
 * of the tab. At a 600 RPM rifle that is ten leaked buffers a second per shooter, and with twelve
 * players in view the same again for every one of them.
 *
 * Now both are fixed pools written in place:
 *
 * - every tracer is two vertices in one `LineSegments`, so `MAX_TRACERS` of them cost **one draw
 *   call** rather than one each, and a dead tracer is a degenerate segment rather than a scene
 *   removal;
 * - every spark is one instance of an `InstancedMesh`, likewise one draw call for all of them.
 *
 * Nothing is created or destroyed after construction, which is the property that matters: no
 * allocation in the frame path, no GPU churn, and no leak possible because there is nothing to
 * forget to dispose. The pools are ring buffers — the oldest effect is overwritten when they are
 * full, which is the right failure for a visual effect and the wrong one for anything else.
 */
import * as THREE from "three";
import { PALETTE } from "./city";

/** Enough for a full lobby firing at once for the tracer's whole life: 12 shooters × 600 RPM × 0.12 s ≈ 15. */
export const MAX_TRACERS = 64;
export const MAX_SPARKS = 64;
const TRACER_LIFE = 0.12;
const SPARK_LIFE = 0.12;

export class VfxPool {
  readonly tracers: THREE.LineSegments;
  readonly sparks: THREE.InstancedMesh;
  private tracerPos: Float32Array;
  private tracerColor: Float32Array;
  private tracerBorn: Float32Array;
  private tracerNext = 0;
  private sparkBorn: Float32Array;
  private sparkNext = 0;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    // ---- tracers: one LineSegments, two vertices per tracer ----
    const geo = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(MAX_TRACERS * 2 * 3);
    this.tracerColor = new Float32Array(MAX_TRACERS * 2 * 3);
    this.tracerBorn = new Float32Array(MAX_TRACERS).fill(-1e9);
    geo.setAttribute("position", new THREE.BufferAttribute(this.tracerPos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.tracerColor, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = new THREE.LineSegments(geo, mat);
    this.tracers.frustumCulled = false; // the segments move every frame; a stale bounding box would pop them
    scene.add(this.tracers);

    // ---- sparks: one InstancedMesh, one instance per spark ----
    const sgeo = new THREE.SphereGeometry(0.05, 6, 6);
    const smat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new THREE.InstancedMesh(sgeo, smat, MAX_SPARKS);
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.frustumCulled = false;
    this.sparkBorn = new Float32Array(MAX_SPARKS).fill(-1e9);
    // every instance starts collapsed to nothing rather than sitting at the origin
    for (let i = 0; i < MAX_SPARKS; i++) this.sparks.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPARKS * 3), 3);
    scene.add(this.sparks);
  }

  private liveTracers(clock: number): number {
    let n = 0;
    for (let i = 0; i < MAX_TRACERS; i++) if (clock - this.tracerBorn[i]! < TRACER_LIFE) n++;
    return n;
  }
  private liveSparks(clock: number): number {
    let n = 0;
    for (let i = 0; i < MAX_SPARKS; i++) if (clock - this.sparkBorn[i]! < SPARK_LIFE) n++;
    return n;
  }
  /** How many effects are alive, for the probe's budget line. */
  live(clock: number): number {
    return this.liveTracers(clock) + this.liveSparks(clock);
  }

  addTracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, clock: number): void {
    const i = this.tracerNext;
    this.tracerNext = (this.tracerNext + 1) % MAX_TRACERS;
    const p = i * 6;
    this.tracerPos[p] = ax; this.tracerPos[p + 1] = ay; this.tracerPos[p + 2] = az;
    this.tracerPos[p + 3] = bx; this.tracerPos[p + 4] = by; this.tracerPos[p + 5] = bz;
    this.c.set(color);
    for (let v = 0; v < 2; v++) {
      this.tracerColor[p + v * 3] = this.c.r;
      this.tracerColor[p + v * 3 + 1] = this.c.g;
      this.tracerColor[p + v * 3 + 2] = this.c.b;
    }
    this.tracerBorn[i] = clock;
  }

  addSpark(x: number, y: number, z: number, color: number, clock: number): void {
    const i = this.sparkNext;
    this.sparkNext = (this.sparkNext + 1) % MAX_SPARKS;
    this.sparks.setMatrixAt(i, this.m.makeTranslation(x, y, z));
    this.c.set(color);
    this.sparks.setColorAt(i, this.c);
    this.sparkBorn[i] = clock;
  }

  /**
   * Fade what is alive, collapse what is not. No allocation, no scene graph churn.
   *
   * Each pool is one draw call, and it is hidden when empty — so an idle frame costs nothing at all
   * (the old per-shot objects cost nothing when idle too, and a budget should not get worse in the
   * common case to get better in the rare one) and a frame full of tracers costs one.
   */
  update(clock: number): void {
    let anyTracer = false;
    for (let i = 0; i < MAX_TRACERS; i++) {
      const age = clock - this.tracerBorn[i]!;
      if (age >= TRACER_LIFE && this.tracerBorn[i]! > -1e8) {
        // a dead tracer is a degenerate segment: still drawn, costs nothing, needs no removal
        const p = i * 6;
        for (let k = 0; k < 6; k++) this.tracerPos[p + k] = 0;
        this.tracerBorn[i] = -1e9;
        anyTracer = true;
      } else if (age < TRACER_LIFE) anyTracer = true;
    }
    if (anyTracer) {
      this.tracers.geometry.attributes.position!.needsUpdate = true;
      this.tracers.geometry.attributes.color!.needsUpdate = true;
    }
    let anySpark = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const age = clock - this.sparkBorn[i]!;
      if (age >= SPARK_LIFE) {
        if (this.sparkBorn[i]! > -1e8) {
          this.sparks.setMatrixAt(i, this.m.makeScale(0, 0, 0));
          this.sparkBorn[i] = -1e9;
          anySpark = true;
        }
        continue;
      }
      anySpark = true;
    }
    if (anySpark) {
      this.sparks.instanceMatrix.needsUpdate = true;
      if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
    }
    this.tracers.visible = this.liveTracers(clock) > 0;
    this.sparks.visible = this.liveSparks(clock) > 0;
  }

  /** Only ever called when the renderer itself is torn down. */
  dispose(): void {
    this.tracers.geometry.dispose();
    (this.tracers.material as THREE.Material).dispose();
    this.sparks.geometry.dispose();
    (this.sparks.material as THREE.Material).dispose();
  }
}

export const DEFAULT_TRACER = PALETTE.cyan;
