import * as THREE from "three";
import type { LevelDef, Box } from "@shared/sim/level";
import type { Dummy } from "@shared/sim/world";
import { MOVE } from "@shared/sim/constants";
import type { Vec3 } from "@shared/math/vec3";

/** Interpolated view state handed to the renderer each frame. */
export interface ViewState {
  x: number;
  y: number;
  z: number;
  eye: number;
  yaw: number;
  pitch: number;
  kickPitch: number;
  kickYaw: number;
  speed: number;
  grounded: boolean;
  stance: string;
  reloading: number; // 0..1 progress, 0 when idle
}

const PALETTE = {
  bg: 0x04060a,
  fog: 0x05070c,
  cyan: 0x35f2ff,
  magenta: 0xff3ec9,
  amber: 0xffb02e,
  violet: 0x8f4dff,
  surface: 0x2e3646,
};

/**
 * Stage 1 renderer: grey-box kitbash with neon edge strips (the trailer's
 * silhouette language), fog, and a cheap wet-floor sheen. The full lighting
 * rig, GPU rain and the post chain arrive in Stage 3.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private dummyMeshes = new Map<number, { group: THREE.Group; mat: THREE.MeshStandardMaterial; flash: number }>();
  private tracers: { line: THREE.Line; mat: THREE.LineBasicMaterial; born: number; life: number }[] = [];
  private sparks: { mesh: THREE.Mesh; born: number }[] = [];
  private muzzle: THREE.PointLight;
  private muzzleT = 0;
  private viewmodel: THREE.Group;
  private vmKick = 0;
  private eyeSmooth = MOVE.eyeStand;
  private bobPhase = 0;
  private clock = 0;
  frames = 0;

  constructor(canvas: HTMLCanvasElement, level: LevelDef) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, 0.028);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 260);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.buildLevel(level);
    this.buildLights();

    this.muzzle = new THREE.PointLight(PALETTE.cyan, 0, 6, 2);
    this.camera.add(this.muzzle);
    this.muzzle.position.set(0.25, -0.2, -0.8);

    this.viewmodel = this.buildViewmodel();
    this.camera.add(this.viewmodel);

    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tint(tag: string | undefined): number {
    switch (tag) {
      case "deck":
      case "upperdeck":
      case "gantry":
      case "gantrystair":
        return PALETTE.cyan;
      case "block":
      case "highwall":
      case "lowwall":
        return PALETTE.magenta;
      case "pillar":
        return PALETTE.violet;
      case "crate":
      case "curb":
      case "kerb":
        return PALETTE.amber;
      case "wall":
        return PALETTE.magenta;
      default:
        return PALETTE.cyan;
    }
  }

  private buildLevel(level: LevelDef): void {
    const surf = new THREE.MeshStandardMaterial({ color: PALETTE.surface, roughness: 0.6, metalness: 0.25 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.3, metalness: 0.5 });
    for (const b of level.boxes) {
      const sx = b.max.x - b.min.x;
      const sy = b.max.y - b.min.y;
      const sz = b.max.z - b.min.z;
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const mesh = new THREE.Mesh(geo, b.tag === "floor" ? floorMat : surf);
      mesh.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      this.scene.add(mesh);
      if (b.tag === "floor") {
        this.addFloorGrid(b);
        continue;
      }
      const edges = new THREE.EdgesGeometry(geo);
      const col = this.tint(b.tag);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
      line.position.copy(mesh.position);
      this.scene.add(line);
      // neon tube along the top perimeter of taller pieces (the clip's ledge strips)
      if (sy >= 1 && b.tag !== "wall") {
        const stripMat = new THREE.MeshBasicMaterial({ color: col });
        const t = 0.06;
        const y = b.max.y + t / 2;
        const bars: [number, number, number, number][] = [
          [sx + t, t, mesh.position.x, b.min.z],
          [sx + t, t, mesh.position.x, b.max.z],
          [t, sz + t, b.min.x, mesh.position.z],
          [t, sz + t, b.max.x, mesh.position.z],
        ];
        for (const [w, d, x, z] of bars) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), stripMat);
          bar.position.set(x, y, z);
          this.scene.add(bar);
        }
      }
    }
  }

  private addFloorGrid(b: Box): void {
    const size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    const grid = new THREE.GridHelper(size, size / 2, PALETTE.cyan, 0x0d2a33);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.005, (b.min.z + b.max.z) / 2);
    this.scene.add(grid);
  }

  private buildLights(): void {
    this.scene.add(new THREE.AmbientLight(0x7080a0, 1.6));
    const hemi = new THREE.HemisphereLight(0x6a80b0, 0x101418, 1.4);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0x8fc8ff, 3.0);
    key.position.set(-20, 40, 10);
    this.scene.add(key);
    // district cast: a cyan and a magenta point light on opposite sides
    const cy = new THREE.PointLight(PALETTE.cyan, 40, 70, 1.4);
    cy.position.set(-20, 8, -20);
    this.scene.add(cy);
    const mg = new THREE.PointLight(PALETTE.magenta, 40, 70, 1.4);
    mg.position.set(22, 8, 18);
    this.scene.add(mg);
  }

  private buildViewmodel(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.5, metalness: 0.6 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.36), body);
    barrel.position.set(0, 0.03, -0.36);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), body);
    grip.position.set(0, -0.12, 0.08);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.3), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
    strip.position.set(0.05, 0.03, -0.1);
    g.add(receiver, barrel, grip, strip);
    g.position.set(0.28, -0.26, -0.55);
    g.rotation.y = -0.04;
    return g;
  }

  syncDummies(dummies: readonly Dummy[]): void {
    for (const d of dummies) {
      let e = this.dummyMeshes.get(d.id);
      if (!e) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: PALETTE.amber, emissiveIntensity: 0.55, roughness: 0.6 });
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(MOVE.capsuleRadius, MOVE.standHeight - MOVE.capsuleRadius * 2, 4, 10), mat);
        cap.position.y = MOVE.standHeight / 2;
        const group = new THREE.Group();
        group.add(cap);
        // head band, so zones read at a glance
        const band = new THREE.Mesh(new THREE.TorusGeometry(MOVE.capsuleRadius + 0.02, 0.015, 6, 24), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
        band.rotation.x = Math.PI / 2;
        band.position.y = MOVE.standHeight * 0.82;
        group.add(band);
        this.scene.add(group);
        e = { group, mat, flash: 0 };
        this.dummyMeshes.set(d.id, e);
      }
      e.group.visible = d.alive;
      e.group.position.set(d.pos.x, d.pos.y, d.pos.z);
      e.flash = Math.max(0, e.flash - 0.08);
      e.mat.emissiveIntensity = 0.55 + e.flash * 2.5;
    }
  }

  flashDummy(id: number): void {
    const e = this.dummyMeshes.get(id);
    if (e) e.flash = 1;
  }

  /** Cyan tracer from the muzzle to the impact point, plus a muzzle flash. */
  tracer(from: Vec3, to: Vec3, hitWorld: boolean): void {
    const start = new THREE.Vector3();
    this.viewmodel.getWorldPosition(start);
    start.add(new THREE.Vector3(0, 0.03, 0));
    const geo = new THREE.BufferGeometry().setFromPoints([start, new THREE.Vector3(to.x, to.y, to.z)]);
    const mat = new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, mat, born: this.clock, life: 0.12 });
    this.muzzleT = 1;
    this.vmKick = 1;
    if (hitWorld) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
      s.position.set(to.x, to.y, to.z);
      this.scene.add(s);
      this.sparks.push({ mesh: s, born: this.clock });
    }
    void from;
  }

  render(v: ViewState, rawDt: number): void {
    // VFX age on a hitch-capped clock so tracers and sparks never vanish between two slow frames.
    const dt = Math.min(rawDt, 1 / 30);
    this.clock += dt;
    this.frames++;
    // eye height smoothing (slides dip the camera)
    this.eyeSmooth += (v.eye - this.eyeSmooth) * Math.min(1, dt * 18);
    // view bob while grounded and moving
    if (v.grounded && v.speed > 0.5 && v.stance !== "slide") this.bobPhase += dt * (6 + v.speed * 0.9);
    const bobY = v.grounded && v.stance !== "slide" ? Math.sin(this.bobPhase * 2) * 0.012 * Math.min(1, v.speed / 5) : 0;
    const bobX = v.grounded && v.stance !== "slide" ? Math.sin(this.bobPhase) * 0.008 * Math.min(1, v.speed / 5) : 0;
    this.camera.position.set(v.x, v.y + this.eyeSmooth + bobY, v.z);
    this.camera.rotation.set(v.pitch + v.kickPitch, v.yaw + v.kickYaw, v.stance === "slide" ? 0.03 : bobX * 0.6);

    // viewmodel kick + reload dip
    this.vmKick = Math.max(0, this.vmKick - dt * 14);
    const dip = v.reloading > 0 ? Math.sin(v.reloading * Math.PI) * 0.18 : 0;
    this.viewmodel.position.set(0.28 + bobX * 0.5, -0.26 - dip + bobY * 0.5, -0.55 + this.vmKick * 0.06);
    this.viewmodel.rotation.x = this.vmKick * 0.08 - dip * 0.8;
    this.muzzleT = Math.max(0, this.muzzleT - dt * 18);
    this.muzzle.intensity = this.muzzleT * 6;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]!;
      const a = 1 - (this.clock - t.born) / t.life;
      if (a <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.mat.dispose();
        this.tracers.splice(i, 1);
      } else t.mat.opacity = a * 0.9;
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      const age = this.clock - s.born;
      if (age > 0.12) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      } else s.mesh.scale.setScalar(1 + age * 12);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
