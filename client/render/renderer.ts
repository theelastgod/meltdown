import * as THREE from "three";
import type { LevelDef } from "@shared/sim/level";
import type { Dummy } from "@shared/sim/world";
import { MOVE } from "@shared/sim/constants";
import type { Vec3 } from "@shared/math/vec3";
import { PostChain } from "./post";
import { Rain } from "./rain";
import { makeWetFloor } from "./wetfloor";
import { buildSkyline, dressArena, PALETTE } from "./city";
import { ArsenalFx, buildViewmodel } from "./weapons";
import { WakeFx } from "./wake";
import { WEAPON_LIST, type WeaponId } from "@shared/weapons/manifest";

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
  slot: number;
  /** ADS zoom factor (1 = none). */
  zoom: number;
  charge: number;
  stunned: boolean;
}

/** Layer for things the wet-floor mirror must not see (rain, far skyline): cheaper and no blown-out sky. */
export const FAR_LAYER = 1;

/** District colour casts: fog colour, ambient tint, and the two rig lights. */
export const DISTRICTS = {
  magenta: { fog: 0x0b0610, ambient: 0x2c2238, sky: 0x3a2a55, keyA: PALETTE.magenta, keyB: PALETTE.cyan },
  cyan: { fog: 0x05090f, ambient: 0x1e2a38, sky: 0x224055, keyA: PALETTE.cyan, keyB: PALETTE.magenta },
  amber: { fog: 0x0e0904, ambient: 0x362a1a, sky: 0x554020, keyA: PALETTE.amber, keyB: PALETTE.cyan },
} as const;
export type DistrictId = keyof typeof DISTRICTS;

/**
 * The look: neon kitbash on a near-black wet city, rain, fog, and a full-screen
 * CRT post chain. Geometry is low-poly by design; lighting, fog, and post do
 * the work.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly post: PostChain;
  readonly district: DistrictId;
  private rain: Rain;
  private dummyMeshes = new Map<number, { group: THREE.Group; mat: THREE.MeshStandardMaterial; flash: number }>();
  private tracers: { line: THREE.Line; mat: THREE.LineBasicMaterial; born: number; life: number }[] = [];
  private sparks: { mesh: THREE.Mesh; born: number }[] = [];
  private muzzle: THREE.PointLight;
  private muzzleT = 0;
  private viewmodel: THREE.Group;
  private viewmodels = new Map<WeaponId, THREE.Group>();
  private vmSlot = 1;
  private vmSwap = 0;
  readonly fx: ArsenalFx;
  readonly wake: WakeFx;
  private baseFov = 80;
  private fovNow = 80;
  private vmKick = 0;
  private eyeSmooth = MOVE.eyeStand;
  private bobPhase = 0;
  private clock = 0;
  frames = 0;

  constructor(canvas: HTMLCanvasElement, level: LevelDef, district: DistrictId = "magenta") {
    this.district = district;
    const cast = DISTRICTS[district];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.background = new THREE.Color(PALETTE.bg);
    const fogColor = new THREE.Color(cast.fog);
    const fogDensity = 0.013;
    this.scene.fog = new THREE.FogExp2(cast.fog, fogDensity);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 900);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    dressArena(this.scene, level);
    const skyline = buildSkyline(this.scene);
    skyline.traverse((o) => o.layers.set(FAR_LAYER));
    this.buildLights(cast);
    this.rain = new Rain();
    this.rain.object.layers.set(FAR_LAYER);
    this.scene.add(this.rain.object);
    this.camera.layers.enable(FAR_LAYER);
    const floor = level.boxes.find((b) => b.tag === "floor")!;
    this.scene.add(makeWetFloor(floor.max.x - floor.min.x, floor.max.z - floor.min.z, floor.max.y + 0.002, fogColor, fogDensity));

    this.muzzle = new THREE.PointLight(PALETTE.cyan, 0, 7, 2);
    this.camera.add(this.muzzle);
    this.muzzle.position.set(0.25, -0.2, -0.8);

    for (const w of WEAPON_LIST) {
      const vm = buildViewmodel(w.id);
      vm.visible = false;
      this.camera.add(vm);
      this.viewmodels.set(w.id, vm);
    }
    this.viewmodel = this.viewmodels.get("lease_breaker")!;
    this.viewmodel.visible = true;
    this.fx = new ArsenalFx(this.scene);
    this.wake = new WakeFx(this.scene);

    this.post = new PostChain(this.renderer, this.scene, this.camera, window.innerWidth, window.innerHeight, 0.6);
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.post.resize(this.renderer, w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildLights(cast: (typeof DISTRICTS)[DistrictId]): void {
    this.scene.add(new THREE.AmbientLight(cast.ambient, 1.35));
    this.scene.add(new THREE.HemisphereLight(cast.sky, 0x06070b, 1.0));
    const key = new THREE.DirectionalLight(0x8fc8ff, 1.1);
    key.position.set(-20, 40, 10);
    this.scene.add(key);
    // district rig: two big casts on opposite corners, two local pools
    const a = new THREE.PointLight(cast.keyA, 60, 80, 1.5);
    a.position.set(22, 9, 18);
    this.scene.add(a);
    const b = new THREE.PointLight(cast.keyB, 60, 80, 1.5);
    b.position.set(-20, 9, -20);
    this.scene.add(b);
    const deck = new THREE.PointLight(PALETTE.cyan, 14, 22, 1.6);
    deck.position.set(0, 4.5, -6);
    this.scene.add(deck);
    const lane = new THREE.PointLight(PALETTE.cyan, 12, 20, 1.6);
    lane.position.set(0, 4.3, 14);
    this.scene.add(lane);
    const crates = new THREE.PointLight(PALETTE.amber, 8, 12, 1.8);
    crates.position.set(-11, 2.5, 21);
    this.scene.add(crates);
  }

  syncDummies(dummies: readonly Dummy[]): void {
    for (const d of dummies) {
      let e = this.dummyMeshes.get(d.id);
      if (!e) {
        // VANTAGE repo unit: hooded dark silhouette, amber servo light, never a lit face
        const mat = new THREE.MeshStandardMaterial({ color: 0x0d0a06, emissive: PALETTE.amber, emissiveIntensity: 0.12, roughness: 0.7 });
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(MOVE.capsuleRadius, MOVE.standHeight - MOVE.capsuleRadius * 2, 4, 10), mat);
        cap.position.y = MOVE.standHeight / 2;
        const group = new THREE.Group();
        group.add(cap);
        const hood = new THREE.Mesh(new THREE.ConeGeometry(MOVE.capsuleRadius + 0.08, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.9 }));
        hood.position.y = MOVE.standHeight - 0.05;
        group.add(hood);
        const band = new THREE.Mesh(new THREE.TorusGeometry(MOVE.capsuleRadius + 0.02, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
        band.rotation.x = Math.PI / 2;
        band.position.y = MOVE.standHeight * 0.82;
        group.add(band);
        const servo = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
        servo.position.set(0, 1.0, -MOVE.capsuleRadius);
        group.add(servo);
        this.scene.add(group);
        e = { group, mat, flash: 0 };
        this.dummyMeshes.set(d.id, e);
      }
      e.group.visible = d.alive;
      e.group.position.set(d.pos.x, d.pos.y, d.pos.z);
      e.flash = Math.max(0, e.flash - 0.08);
      e.mat.emissiveIntensity = 0.12 + e.flash * 0.9;
    }
  }

  flashDummy(id: number): void {
    const e = this.dummyMeshes.get(id);
    if (e) e.flash = 1;
  }

  private remoteMeshes = new Map<number, { group: THREE.Group; mat: THREE.MeshStandardMaterial }>();

  /** Other players: hooded silhouettes with cyan Blank trim. Zero mechanical data touches this. */
  syncRemotes(views: readonly { id: number; x: number; y: number; z: number; yaw: number; height: number; alive: boolean; stance: string }[]): void {
    const seen = new Set<number>();
    for (const v of views) {
      seen.add(v.id);
      let e = this.remoteMeshes.get(v.id);
      if (!e) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x0a0c12, emissive: PALETTE.cyan, emissiveIntensity: 0.08, roughness: 0.8 });
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(MOVE.capsuleRadius - 0.02, MOVE.standHeight - MOVE.capsuleRadius * 2, 4, 10), mat);
        body.position.y = MOVE.standHeight / 2;
        group.add(body);
        const hood = new THREE.Mesh(new THREE.ConeGeometry(MOVE.capsuleRadius + 0.06, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.9 }));
        hood.position.y = MOVE.standHeight - 0.05;
        group.add(hood);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
        trim.position.set(MOVE.capsuleRadius - 0.02, 1.05, 0);
        group.add(trim);
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.5, metalness: 0.6 }));
        gun.position.set(0.25, 1.35, -0.35);
        group.add(gun);
        this.scene.add(group);
        e = { group, mat };
        this.remoteMeshes.set(v.id, e);
      }
      e.group.visible = v.alive;
      e.group.position.set(v.x, v.y, v.z);
      e.group.rotation.y = v.yaw;
      const crouch = v.stance === "slide" || v.stance === "crouch";
      e.group.scale.y = crouch ? 0.65 : 1;
    }
    for (const [id, e] of this.remoteMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(e.group);
        this.remoteMeshes.delete(id);
      }
    }
  }

  /** Cyan tracer from the muzzle (or a world-space origin for other players) to the impact point, plus a muzzle flash. */
  tracer(from: Vec3, to: Vec3, hitWorld: boolean, worldOrigin = false, color: number = PALETTE.cyan): void {
    const start = new THREE.Vector3();
    if (worldOrigin) start.set(from.x, from.y, from.z);
    else {
      this.viewmodel.getWorldPosition(start);
      start.add(new THREE.Vector3(0, 0.03, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints([start, new THREE.Vector3(to.x, to.y, to.z)]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, mat, born: this.clock, life: 0.12 });
    if (!worldOrigin) {
      this.muzzleT = 1;
      this.vmKick = 1;
    }
    if (hitWorld) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color }));
      s.position.set(to.x, to.y, to.z);
      this.scene.add(s);
      this.sparks.push({ mesh: s, born: this.clock });
    }
  }

  render(v: ViewState, rawDt: number): void {
    // VFX age on a hitch-capped clock so tracers and sparks never vanish between two slow frames.
    const dt = Math.min(rawDt, 1 / 30);
    this.clock += dt;
    this.frames++;
    this.eyeSmooth += (v.eye - this.eyeSmooth) * Math.min(1, dt * 18);
    if (v.grounded && v.speed > 0.5 && v.stance !== "slide") this.bobPhase += dt * (6 + v.speed * 0.9);
    const bobY = v.grounded && v.stance !== "slide" ? Math.sin(this.bobPhase * 2) * 0.012 * Math.min(1, v.speed / 5) : 0;
    const bobX = v.grounded && v.stance !== "slide" ? Math.sin(this.bobPhase) * 0.008 * Math.min(1, v.speed / 5) : 0;
    this.camera.position.set(v.x, v.y + this.eyeSmooth + bobY, v.z);
    this.camera.rotation.set(v.pitch + v.kickPitch, v.yaw + v.kickYaw, v.stance === "slide" ? 0.03 : bobX * 0.6);

    this.vmKick = Math.max(0, this.vmKick - dt * 14);
    const dip = v.reloading > 0 ? Math.sin(v.reloading * Math.PI) * 0.18 : 0;
    this.viewmodel.position.set(0.28 + bobX * 0.5, -0.26 - dip + bobY * 0.5, -0.55 + this.vmKick * 0.06);
    this.viewmodel.rotation.x = this.vmKick * 0.08 - dip * 0.8;
    this.muzzleT = Math.max(0, this.muzzleT - dt * 18);
    this.muzzle.intensity = this.muzzleT * 8;
    // weapon swap: hide/show viewmodels with a quick dip
    const wantId = WEAPON_LIST[v.slot - 1]?.id ?? "lease_breaker";
    const want = this.viewmodels.get(wantId)!;
    if (want !== this.viewmodel) {
      this.viewmodel.visible = false;
      this.viewmodel = want;
      this.viewmodel.visible = true;
      this.vmSwap = 1;
      this.muzzle.color.set(WEAPON_LIST[v.slot - 1]?.tracer ?? PALETTE.cyan);
    }
    this.vmSwap = Math.max(0, this.vmSwap - dt * 4);
    this.viewmodel.position.y -= this.vmSwap * 0.25;
    this.viewmodel.rotation.x -= this.vmSwap * 0.5;
    if (v.charge > 0) {
      this.viewmodel.position.z += Math.sin(this.clock * 60) * 0.004 * v.charge;
      this.muzzle.intensity = Math.max(this.muzzle.intensity, v.charge * 5);
    }
    if (v.stunned) this.camera.rotation.z += Math.sin(this.clock * 25) * 0.02;
    // ADS zoom
    const targetFov = this.baseFov / v.zoom;
    this.fovNow += (targetFov - this.fovNow) * Math.min(1, dt * 14);
    if (Math.abs(this.camera.fov - this.fovNow) > 0.01) {
      this.camera.fov = this.fovNow;
      this.camera.updateProjectionMatrix();
    }
    this.fx.update(dt);
    this.wake.update(dt);

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
    this.rain.update(this.clock, this.camera);
    this.post.render(this.clock, dt);
  }
}
