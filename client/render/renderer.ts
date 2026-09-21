import { texture as assetTexture } from "./assets";
import * as THREE from "three";
import type { LevelDef } from "@shared/sim/level";
import type { Dummy } from "@shared/sim/world";
import { MOVE } from "@shared/sim/constants";
import type { Vec3 } from "@shared/math/vec3";
import { PostChain } from "./post";
import { Rain } from "./rain";
import { makeFlatWetFloor, makeWetFloor } from "./wetfloor";
import { bindPlate, buildSkyline, dressLevel, PALETTE, Traffic } from "./city";
import { VfxPool } from "./vfx";
import { markShared, release } from "./dispose";
import { CityLife, flickerMaterial } from "./life";
import { HubDressing } from "./hub";
import { CampaignFx } from "./campaign";
import { drawGlyph, glyphFor } from "@shared/identity/glyph";
import { parseTag } from "@shared/identity/identity";
import { skinByToken } from "@shared/economy/catalog";
import { ArsenalFx, buildViewmodel } from "./weapons";
import { RunFx } from "./run";
import { WakeFx } from "./wake";
import { WEAPON_LIST, type WeaponId } from "@shared/weapons/manifest";
import { mergeByMaterial } from "./body";
import { applyPose, buildRig, disposeRig, rigReport, setRigSlot, WEAPON_IN_SOCKET, weaponStripGeometry, type Rig, type RigReport, RIG_EMISSIVE } from "./rig";
import { poseBody, type PoseInput, type Stance } from "./pose";
import { clamp, wrapAngle } from "../../shared/math/vec3";
import { decay, FLASH_LIFE, FLINCH_LIFE, HIT_GLOW, type ImpactRead } from "../hit";
import { spawnCurve, spawnEdge, SPAWN_TIME } from "./spawn";
import { aimPoint, speedPush, SPRINT_FOV, SPRINT_PULL, thirdPersonCamera, TPS_ADS, TPS_DEFAULT, type AimTarget } from "./tps";
import { arcPoint, type ArcSpec } from "./ballistic";
import { DEATH_TURN, fallSpeed, landDip, landHardness, LAND_TIME, lookYawPitch, stanceRoll } from "./feel";
import type { Box } from "../../shared/sim/box";

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
  /** the body is drawn only while the file is alive (third person) */
  alive: boolean;
  /** the direction of travel (yaw), for the legs; the aim's yaw when still (Stage 63) */
  moveYaw: number;
  /** the sim's capsule height, so the crouched body fits under the capsule the shots test */
  height: number;
  /** the yaw the next shot leaves along: the aim plus the recoil the sim is carrying (Stage 66) */
  aimYaw: number;
  /** the round's flight, when the weapon throws one instead of firing a ray (Stage 78) */
  arc?: ArcSpec | null;
  /** the pitch the next shot leaves along */
  aimPitch: number;
  /** how far the held weapon's shot reaches (m) */
  aimRange: number;
  /** the bodies a shot can hit, as the sim's hitscan tests them */
  targets: readonly AimTarget[];
}

/** A remote player as the body needs it: the wire's fields, straight through (Stage 63). */
export interface RemoteBodyView {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  height: number;
  alive: boolean;
  stance: string;
  name?: string;
  tag?: string;
  debt?: boolean;
  vx?: number;
  vy?: number;
  vz?: number;
  grounded?: boolean;
  slot?: number;
}

/** What the third-person camera did this frame, for the HUD's reticle and the probes. */
export interface CameraView {
  third: boolean;
  camera: { x: number; y: number; z: number };
  /** distance from the pivot after whatever the camera backed into */
  distance: number;
  blocked: boolean;
  bodyVisible: boolean;
  /** where the eye's ray lands on screen (CSS px); the screen's centre in first person */
  reticle: { x: number; y: number; visible: boolean };
  /** how far along the eye's ray the reticle is, and whether it is on a wall */
  aim: { distance: number; hit: boolean; onTarget: boolean; arc: boolean; point: { x: number; y: number; z: number } };
  /** where the camera's segment starts: the shoulder after a wall beside the player moved it in */
  anchor: { x: number; y: number; z: number };
  /** the lens this frame was drawn with, in degrees: speed widens it (Stage 77) */
  fov: number;
  /** how far the landing has the camera down, in metres, and the lean of a slide (Stage 79) */
  dip: number;
  roll: number;
  /** where the camera is looking, which is the player's aim until the file is closed (Stage 83) */
  look: { yaw: number; pitch: number };
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
  /** Draw calls the level dressing added (probes budget this). */
  readonly levelCalls: number;
  private rain: Rain;
  private traffic: Traffic | null = null;
  /** crowds, monorail, steam, ads, skyline blinkers, airship (render-only) */
  readonly life: CityLife;
  /** the Deadletter Office's renovation, trophies and ghost (null outside the hub) */
  readonly hub: HubDressing | null;
  readonly campaignFx: CampaignFx;
  /** sign atlas flicker (null when the level has no signs) */
  signFlicker: { setTime: (t: number) => void } | null = null;
  private listener = new THREE.Vector3();
  private dummyMeshes = new Map<number, { group: THREE.Group; mat: THREE.MeshStandardMaterial; flash: number }>();
  /** Tracers and impact sparks, pooled: two draw calls for all of them, and nothing allocated per shot. */
  private vfxPool!: VfxPool;
  /** live tracers + sparks, for the frame-budget probe */
  liveVfx = 0;
  /** scratch for the tracer origin: reused so a shot allocates nothing */
  private tmpStart = new THREE.Vector3();
  private muzzle: THREE.PointLight;
  private muzzleT = 0;
  private viewmodel: THREE.Group;
  private viewmodels = new Map<WeaponId, THREE.Group>();
  /**
   * The local body (Stage 60): the same silhouette the city sees, drawn when the camera stands
   * behind it. Its hand holds one weapon per slot, built like the viewmodels so a worn skin's tint
   * and plate reach it the same way.
   */
  private local: Rig;
  private localWeapons = new Map<WeaponId, THREE.Group>();
  /** the previous frame's height and yaw, for the body's vertical speed and turn rate */
  private lastViewY = NaN;
  private lastViewYaw = NaN;
  private localWeapon: THREE.Group;
  private handMuzzle: THREE.PointLight;
  /** third person is the game's view (the trailer's); first person is a setting */
  thirdPerson = true;
  /** the probe's ruler: hide the body and keep the camera, so the body's cost is the difference and nothing else is */
  bodyHidden = false;
  private boxes: readonly Box[];
  private camSmooth = { d: TPS_DEFAULT.distance, x: 0, y: 0, z: 0, set: false };
  /** the eased shoulder offset: pulling in against a wall beside the player is immediate, sliding back out is not */
  private shoulderSmooth = 0;
  private lastView: CameraView = { third: true, fov: 80, dip: 0, roll: 0, look: { yaw: 0, pitch: 0 }, anchor: { x: 0, y: 0, z: 0 }, camera: { x: 0, y: 0, z: 0 }, distance: 0, blocked: false, bodyVisible: false, reticle: { x: 0, y: 0, visible: true }, aim: { distance: 0, hit: false, onTarget: false, arc: false, point: { x: 0, y: 0, z: 0 } } };
  private tmpProj = new THREE.Vector3();
  private vmSlot = 1;
  private vmSwap = 0;
  readonly fx: ArsenalFx;
  readonly wake: WakeFx;
  /** THE RUN: claims and safe zones */
  readonly run: RunFx;
  private baseFov = 80;
  /** Settings: field of view and the CRT intensity. */
  setFov(fov: number): void {
    this.baseFov = Math.max(60, Math.min(110, fov));
  }
  get fov(): number {
    return this.baseFov;
  }
  setCrt(k: number): void {
    this.post.setCrt(k);
  }
  crtLevel() {
    return this.post.crtLevel();
  }
  /** Third person (the trailer's view) or first; a setting, never the sim's business. */
  /** the Kernel's filament belongs to the weapon being drawn, not to the camera (Stage 69) */
  private hostFilament(): void {
    // whichever weapon is drawn — and when the camera is pulled in against the body, that is the
    // camera's, exactly as the muzzle light falls back. Hosted on `thirdPerson` alone, the strands
    // went out with the body (Stage 73).
    const onHand = this.thirdPerson && this.local.group.visible;
    if (onHand === this.filamentOnHand) return;
    this.filamentOnHand = onHand;
    this.campaignFx.setFilamentHost(onHand ? this.local.hand : this.camera, onHand);
  }
  private filamentOnHand: boolean | null = null;

  setView(third: boolean): void {
    this.thirdPerson = third;
    this.camSmooth.set = false;
    this.hostFilament();
  }
  /** the renderer's own clock, which is what the HUD's fading marks are aged against */
  get clockNow(): number {
    return this.clock;
  }

  /** A world point on screen (CSS px), by this frame's camera — the probe's ruler for the reticle. */
  project(p: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    this.camera.updateMatrixWorld(true);
    const v = this.tmpProj.set(p.x, p.y, p.z).project(this.camera);
    return { x: (v.x + 1) * 0.5 * window.innerWidth, y: (1 - v.y) * 0.5 * window.innerHeight, z: v.z };
  }
  /** What the camera did last frame (the HUD's reticle, the probes). */
  view(): CameraView {
    return this.lastView;
  }
  private fovNow = 80;
  /** the speed the lens is carrying, in degrees (Stage 77) */
  private fovPush = 0;
  /** the spawn-in (Stage 96): seconds since the file came back on the ledger, and whether it was alive last frame */
  private spawnT = SPAWN_TIME;
  private lastAlive = true;
  /** how far into the spawn-in this frame is, for the probe: 0 on the first live frame, SPAWN_TIME once settled */
  get spawnClock(): number {
    return this.spawnT;
  }
  /** the landing the camera is still taking, and the lean of a slide (Stage 79) */
  private landT = 0;
  private landHard = 0;
  private fallSpeed = 0;
  private wasAir = false;
  private lastY: number | null = null;
  private rollNow = 0;
  private dipNow = 0;
  private vmKick = 0;
  private eyeSmooth = MOVE.eyeStand;
  /** the warm-up sprite's material, kept alive so its program stays in the cache (Stage 63) */
  private readonly warmed: THREE.SpriteMaterial;
  private bobPhase = 0;
  private clock = 0;
  frames = 0;

  /** Set on a touch device: the mirror is skipped and the post chain runs smaller (Stage 32). */
  readonly mobile: boolean;

  constructor(canvas: HTMLCanvasElement, level: LevelDef, district: DistrictId = level.district ?? "magenta", mobile = false) {
    this.mobile = mobile;
    this.district = district;
    const cast = DISTRICTS[district];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false; // counts cover the whole frame (mirror + scene + post), reset in render()
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.background = new THREE.Color(PALETTE.bg);
    const fogColor = new THREE.Color(cast.fog);
    const fogDensity = 0.013;
    this.scene.fog = new THREE.FogExp2(cast.fog, fogDensity);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 900);
    this.camera.rotation.order = "YXZ";
    this.camera.name = "viewmodel";
    this.scene.add(this.camera);

    const dressed = dressLevel(this.scene, level);
    this.levelCalls = dressed.calls;
    if (dressed.signMat) this.signFlicker = flickerMaterial(dressed.signMat);
    const skyline = buildSkyline(this.scene, level.skylineSeed ?? 42, (level.bounds ?? 32) + 44, district);
    skyline.name ||= "skyline";
    skyline.traverse((o) => o.layers.set(FAR_LAYER));
    this.life = new CityLife(level, skyline);
    this.life.group.name = "city life";
    this.scene.add(this.life.group);
    this.hub = level.hub ? new HubDressing(this.scene, level) : null;
    this.campaignFx = new CampaignFx(this.scene, this.camera);
    if (level.traffic?.length) {
      this.traffic = new Traffic(level.traffic, level.skylineSeed ?? 5);
      this.traffic.object.layers.set(FAR_LAYER);
      this.traffic.object.name = "traffic";
      this.scene.add(this.traffic.object);
    }
    this.buildLights(cast, level);
    this.rain = new Rain();
    this.rain.object.layers.set(FAR_LAYER);
    this.rain.object.name = "rain";
    this.scene.add(this.rain.object);
    // tracers and sparks: two draw calls for the lot, allocated once (client/render/vfx.ts)
    this.vfxPool = new VfxPool(this.scene);
    // Compile every shader now rather than on the frame that first needs it. The pools are hidden
    // when empty, so without this the first shot of a match compiles two programs mid-frame — one
    // 500 ms stutter, measured, at exactly the moment a duel starts. `compile` only walks visible
    // objects, so they are shown for the call and hidden again on the first update.
    this.vfxPool.tracers.name = "tracers";
    this.vfxPool.sparks.name = "sparks";
    this.vfxPool.tracers.visible = true;
    this.vfxPool.sparks.visible = true;
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
    this.boxes = level.boxes;
    // the body (Stage 63): a hooded cloak on ten bones, its weapon in the socket bone
    this.local = buildRig(null);
    this.local.group.name = "rig";
    this.scene.add(this.local.group);
    for (const w of WEAPON_LIST) {
      const held = buildViewmodel(w.id);
      // the viewmodel's pose is the camera's; in the socket the weapon sits a little across the body so the support hand reaches the fore-end
      held.position.set(...WEAPON_IN_SOCKET.position);
      held.rotation.set(0, WEAPON_IN_SOCKET.rotationY, 0);
      mergeByMaterial(held); // one mesh per material: a held weapon costs what its materials count, not its parts
      held.visible = false;
      this.local.hand.add(held);
      this.localWeapons.set(w.id, held);
    }
    this.localWeapon = this.localWeapons.get("lease_breaker")!;
    this.localWeapon.visible = true;
    // drawn once: the mirror does not see the rig (FAR_LAYER), which keeps the body's eight drawables
    // from costing sixteen calls — lease_row sat at 181 of the 180 budget with the reflection in
    this.local.group.traverse((o) => o.layers.set(FAR_LAYER));
    this.handMuzzle = new THREE.PointLight(PALETTE.cyan, 0, 7, 2);
    this.handMuzzle.position.set(0, 0.03, -0.7);
    this.local.hand.add(this.handMuzzle);
    const warmCanvas = document.createElement("canvas");
    warmCanvas.width = warmCanvas.height = 1;
    const warmTex = new THREE.CanvasTexture(warmCanvas);
    warmTex.colorSpace = THREE.SRGBColorSpace; // the tag's texture is sRGB, and the decode is in the program's cache key
    const warm = new THREE.Sprite(new THREE.SpriteMaterial({ map: warmTex, transparent: true, depthTest: false, depthWrite: false }));
    this.warmed = warm.material;
    this.camera.layers.enable(FAR_LAYER);
    const floor = level.boxes.find((b) => b.tag === "floor" || b.tag === "white_floor") ?? level.boxes[0]!;
    this.scene.add(
      mobile
        ? makeFlatWetFloor(floor.max.x - floor.min.x, floor.max.z - floor.min.z, floor.max.y + 0.002, fogColor)
        : makeWetFloor(floor.max.x - floor.min.x, floor.max.z - floor.min.z, floor.max.y + 0.002, fogColor, fogDensity),
    );

    this.fx = new ArsenalFx(this.scene);
    this.wake = new WakeFx(this.scene);
    this.run = new RunFx(this.scene);

    // a phone renders the post chain smaller again: it is already an offscreen 0.6 of the canvas,
    // and the CRT look survives the drop because it is grain, scanlines and bloom rather than detail
    this.post = new PostChain(this.renderer, this.scene, this.camera, window.innerWidth, window.innerHeight, mobile ? 0.45 : 0.6);

    // The cloak's two sway programs and the name tag's compile here, not on the frame a remote
    // arrives. A program's cache key carries the output it was compiled for, and the scene is drawn
    // into the post chain's buffer, not the canvas: compiling against the canvas builds programs
    // (sRGB output, tone mapping on) that the frame then cannot use and compiles again. So the
    // warm-up binds the buffer the scene is actually drawn into, and the sprite's material is kept
    // alive afterwards — disposing a material releases its program, which is the thing being warmed.
    const target = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.post.composer.renderTarget1);
    this.scene.add(warm);
    this.renderer.compile(this.scene, this.camera);
    warm.removeFromParent();
    this.renderer.setRenderTarget(target);
    this.hostFilament();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.post.resize(this.renderer, w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildLights(cast: (typeof DISTRICTS)[DistrictId], level: LevelDef): void {
    this.scene.add(new THREE.AmbientLight(cast.ambient, 1.35));
    this.scene.add(new THREE.HemisphereLight(cast.sky, 0x06070b, 1.0));
    const key = new THREE.DirectionalLight(0x8fc8ff, 1.1);
    key.position.set(-20, 40, 10);
    this.scene.add(key);
    // district rig from level data: the strongest lights win the point-light budget
    const colors = { cyan: PALETTE.cyan, magenta: PALETTE.magenta, amber: PALETTE.amber, violet: PALETTE.violet, yellow: PALETTE.yellow, green: PALETTE.green } as const;
    const defs = [...(level.lights ?? [])].sort((a, b) => b.intensity * b.range - a.intensity * a.range).slice(0, 8);
    for (const l of defs) {
      const pl = new THREE.PointLight(colors[l.color], l.intensity, l.range, 1.5);
      pl.position.set(l.x, l.y, l.z);
      this.scene.add(pl);
    }
  }

  syncDummies(dummies: readonly Dummy[]): void {
    for (const d of dummies) {
      let e = this.dummyMeshes.get(d.id);
      if (!e) {
        // VANTAGE repo unit: hooded dark silhouette, amber servo light, never a lit face
        const mat = new THREE.MeshStandardMaterial({ color: 0x0d0a06, emissive: PALETTE.amber, emissiveIntensity: 0.12, roughness: 0.7 });
        bindPlate(mat, "tex_dummy");
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(MOVE.capsuleRadius, MOVE.standHeight - MOVE.capsuleRadius * 2, 4, 10), mat);
        cap.position.y = MOVE.standHeight / 2;
        const group = new THREE.Group();
        group.add(cap);
        // the hood wears the cloak's material and the band and servo share one amber, so a unit is two
        // meshes rather than four (Stage 60) — drawn twice, once in the mirror, that is four calls back each
        const hood = new THREE.Mesh(new THREE.ConeGeometry(MOVE.capsuleRadius + 0.08, 0.5, 8), mat);
        hood.position.y = MOVE.standHeight - 0.05;
        group.add(hood);
        const amber = new THREE.MeshBasicMaterial({ color: PALETTE.amber });
        const band = new THREE.Mesh(new THREE.TorusGeometry(MOVE.capsuleRadius + 0.02, 0.02, 6, 24), amber);
        band.rotation.x = Math.PI / 2;
        band.position.y = MOVE.standHeight * 0.82;
        group.add(band);
        const servo = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), amber);
        servo.position.set(0, 1.0, -MOVE.capsuleRadius);
        group.add(servo);
        mergeByMaterial(group);
        this.scene.add(group);
        e = { group, mat, flash: 0 };
        this.dummyMeshes.set(d.id, e);
      }
      e.group.visible = d.alive;
      e.group.position.set(d.pos.x, d.pos.y, d.pos.z);
    }
  }

  flashDummy(id: number): void {
    const e = this.dummyMeshes.get(id);
    if (e) e.flash = 1;
  }

  /**
   * A shot landed on a body (Stage 89): a spark at the impact point sized by what it was worth, the
   * body lit, and — on another file — the flinch the pose rig has had since Stage 74 and has never
   * once been given. `fromYaw` is the world bearing back toward the muzzle, the same convention
   * `takeHit` uses. Every client runs this for every shot in the room, its own and everybody
   * else's, so a firefight across the street reads as hits landing rather than as lights going off.
   */
  hitBody(kind: "dummy" | "player" | "wasp" | "mech", id: number, at: Vec3, read: ImpactRead, fromYaw: number, color: number = PALETTE.amber): void {
    this.vfxPool.addSpark(at.x, at.y, at.z, color, this.clock, read.spark);
    if (kind === "dummy") {
      const d = this.dummyMeshes.get(id);
      if (d) d.flash = Math.max(d.flash, read.flash);
      return;
    }
    if (kind !== "player") return;
    const e = this.remoteMeshes.get(id);
    if (!e) return;
    e.flash = Math.max(e.flash, read.flash);
    // a graze never overrides the bend a heavier round is still in the middle of
    if (read.flinch > e.hurt) {
      e.hurt = read.flinch;
      e.hurtFrom = fromYaw;
    }
  }

  /**
   * Fade what a hit left behind, by elapsed time. The dummies' flash had been stepped by a fixed
   * amount per frame since Stage 1, which makes a hit linger four times as long on a phone as on a
   * desktop.
   */
  private decayHits(dt: number): void {
    for (const e of this.dummyMeshes.values()) {
      e.flash = decay(e.flash, dt, FLASH_LIFE);
      e.mat.emissiveIntensity = 0.12 + e.flash * 0.9;
    }
    for (const e of this.remoteMeshes.values()) {
      e.flash = decay(e.flash, dt, FLASH_LIFE);
      e.hurt = decay(e.hurt, dt, FLINCH_LIFE);
      // lit above its resting glow, whatever the range: a body too far away to pose still shows
      // that the round landed
      e.rig.mat.emissiveIntensity = RIG_EMISSIVE + e.flash * HIT_GLOW;
    }
  }

  private remoteMeshes = new Map<number, { group: THREE.Group; rig: Rig; strip: THREE.Mesh; stripMat: THREE.MeshBasicMaterial; slot: number; skin: number; tint: string | null; tag: THREE.Sprite; tagKey: string; canvas: HTMLCanvasElement; view: RemoteBodyView | null; prev: { x: number; y: number; z: number; yaw: number } | null; speedEst: number; phase: number; kick: number; flash: number; hurt: number; hurtFrom: number }>();
  /** the local rig's worn skin tint (null: stock) */
  skinTint: string | null = null;

  /** the worn skin's plate texture once it has loaded, or null (Stage 43) */
  skinMap: THREE.Texture | null = null;
  private skinMapId: string | null = null;

  /**
   * Wear a skin on the local rig: the viewmodel strips take the tint. Cosmetic; nothing in the sim
   * reads it.
   *
   * The optional plate texture (Stage 43) is applied the same way and with the same standing: it
   * arrives asynchronously, a failure leaves `skinMap` null, and the strips keep the tint they
   * already have. A cosmetic that cannot load is a cosmetic that does not appear — never an error
   * a player sees, and never anything the simulation is told about.
   */
  setSkin(tint: string | null, textureId?: string | null): void {
    this.skinTint = tint;
    for (const vm of [...this.viewmodels.values(), ...this.localWeapons.values()]) {
      const strip = vm.userData.strip as THREE.MeshBasicMaterial | undefined;
      if (strip) strip.color.set(tint ?? (vm.userData.tracer as string));
    }
    // the cloak wears it too, as the city sees it on everyone else; the trim's colour is written each
    // frame from this tint and the strip-light's life
    this.local.mat.emissive.set(tint ?? PALETTE.cyan);
    this.local.tint.set(tint ?? PALETTE.cyan);
    const want = textureId ?? null;
    if (want === this.skinMapId) return;
    this.skinMapId = want;
    this.skinMap = null;
    this.bindSkinMap(null);
    if (!want) return;
    void assetTexture(want).then((tex) => {
      // a slower load that lands after the player changed skin again must not overwrite the new one
      if (this.skinMapId !== want) return; // the cache owns the texture; nothing to dispose here
      this.skinMap = tex;
      this.bindSkinMap(tex);
    });
  }

  /**
   * The plate on the strips (Stage 55). From Stage 43 to Stage 54 the texture was downloaded, held
   * in `skinMap`, and never assigned to a material: the probe asserted it had loaded, not that
   * anything drew it, and the four plates the game sells were invisible. It is bound here, on the
   * strip material every viewmodel carries, and `skinBound()` answers whether it is.
   */
  private bindSkinMap(tex: THREE.Texture | null): void {
    for (const vm of [...this.viewmodels.values(), ...this.localWeapons.values()]) {
      const strip = vm.userData.strip as THREE.MeshBasicMaterial | undefined;
      if (!strip) continue;
      strip.map = tex;
      strip.needsUpdate = true;
    }
  }

  /** true when a plate is loaded and every viewmodel's strip material is drawing it */
  skinBound(): boolean {
    if (!this.skinMap) return false;
    for (const vm of [...this.viewmodels.values(), ...this.localWeapons.values()]) {
      const strip = vm.userData.strip as THREE.MeshBasicMaterial | undefined;
      if (!strip || strip.map !== this.skinMap) return false;
    }
    return this.viewmodels.size > 0 && this.localWeapons.size > 0;
  }

  /** Other players: hooded silhouettes with cyan Blank trim. Zero mechanical data touches this. */
  /** The over-the-head tag: glyph, what the city calls them, and the Debt marker. Identity only; redrawn when the tag changes. */
  private drawTag(e: { tag: THREE.Sprite; tagKey: string; canvas: HTMLCanvasElement }, name: string, tag: string, debt: boolean): void {
    const key = `${name}|${tag}|${debt ? 1 : 0}`;
    if (e.tagKey === key) return;
    e.tagKey = key;
    const c = e.canvas;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    const pi = parseTag(tag, name);
    const glyph = glyphFor("", pi.chapter >= 3 ? 50 : pi.chapter >= 2 ? 25 : pi.chapter >= 1 ? 10 : 1);
    glyph.seed = pi.glyph;
    // the glyph is regenerated from the seed on the wire (the id itself never travels)
    const color = debt ? "#ff3ec9" : "#35f2ff";
    if (tag) drawGlyph(g, { ...glyphFor(String(pi.glyph), pi.chapter >= 3 ? 50 : pi.chapter >= 2 ? 25 : pi.chapter >= 1 ? 10 : 1), seed: pi.glyph }, 22, 22, 18, color);
    g.font = "bold 22px 'Courier New', monospace";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 6;
    g.fillText(name, 48, 22);
    if (debt) {
      g.font = "bold 14px 'Courier New', monospace";
      g.fillText("◆ DEBT", 48, 44);
    }
    (e.tag.material as THREE.SpriteMaterial).map!.needsUpdate = true;
  }

  /** the weapon id a wire slot names, or null when the slot is not one of the rack */
  private static slotId(slot: number | undefined): WeaponId | null {
    return slot !== undefined && slot >= 1 && slot <= WEAPON_LIST.length ? WEAPON_LIST[slot - 1]!.id : null;
  }

  /**
   * Other players: the same cloak on the same bones, holding the weapon of their slot (baked into the
   * cloak, plus its strip in the tracer colour), posed each frame in render() from what the wire
   * carries — position, velocity, footing, pitch, stance. Zero mechanical data touches this.
   */
  syncRemotes(views: readonly RemoteBodyView[]): void {
    const seen = new Set<number>();
    for (const v of views) {
      seen.add(v.id);
      let e = this.remoteMeshes.get(v.id);
      if (!e) {
        const slotId = Renderer.slotId(v.slot);
        const rig = buildRig(slotId);
        const stripMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan });
        const strip = new THREE.Mesh(slotId ? weaponStripGeometry(slotId) : new THREE.BufferGeometry(), stripMat);
        strip.visible = !!slotId;
        rig.hand.add(strip);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 56;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        // three gives every Sprite the same module-level geometry: releasing this one with the
        // player who left would take every other player's tag with it (Stage 64)
        markShared(tag.geometry);
        tag.scale.set(1.6, 0.35, 1);
        tag.position.y = MOVE.standHeight + 0.45;
        tag.center.set(0.1, 0.5);
        rig.group.add(tag);
        this.scene.add(rig.group);
        e = { group: rig.group, rig, strip, stripMat, slot: v.slot ?? 0, skin: -1, tint: null, tag, tagKey: "", canvas, view: null, prev: null, speedEst: 0, phase: 0, kick: 0, flash: 0, hurt: 0, hurtFrom: 0 };
        this.remoteMeshes.set(v.id, e);
      }
      this.drawTag(e, v.name ?? "BLANK", v.tag ?? "", !!v.debt);
      // the worn skin travels as a token id in the tag; the palette it names is the client's catalog
      const skin = v.tag ? parseTag(v.tag, "").skin : 0;
      const slot = v.slot ?? e.slot;
      if (skin !== e.skin || slot !== e.slot) {
        e.skin = skin;
        e.slot = slot;
        const tint = skinByToken(skin)?.tint ?? null;
        e.tint = tint;
        e.rig.mat.emissive.set(tint ?? PALETTE.cyan);
        e.rig.tint.set(tint ?? PALETTE.cyan);
        const slotId = Renderer.slotId(slot);
        setRigSlot(e.rig, slotId, e.strip);
        e.stripMat.color.set(tint ?? (slotId ? WEAPON_LIST[slot - 1]!.tracer : PALETTE.cyan));
      }
      e.group.position.set(v.x, v.y, v.z);
      e.group.rotation.y = v.yaw;
      e.view = v;
    }
    for (const [id, e] of this.remoteMeshes) {
      if (!seen.has(id)) {
        disposeRig(e.rig);
        this.remoteMeshes.delete(id);
      }
    }
  }

  /** the probe's read of the third-person presentation: what is lit, and where the filament hangs */
  presentation(): { onBody: boolean; muzzle: number; handMuzzle: number; filament: { x: number; y: number; z: number }; filamentDepth: boolean; hand: { x: number; y: number; z: number }; camera: { x: number; y: number; z: number } } {
    const hand = this.local.hand.getWorldPosition(new THREE.Vector3());
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    return {
      onBody: this.thirdPerson && this.local.group.visible,
      muzzle: this.muzzle.intensity,
      handMuzzle: this.handMuzzle.intensity,
      filament: this.campaignFx.filamentAt(),
      filamentDepth: this.campaignFx.filamentDepthTest(),
      hand: { x: hand.x, y: hand.y, z: hand.z },
      camera: { x: cam.x, y: cam.y, z: cam.z },
    };
  }

  /**
   * The file closed (Stage 83): the camera stops taking the mouse and turns onto whatever did it,
   * over about a second. A death with no killer to name — a fall, a hazard — holds the look it had.
   */
  die(killer: { x: number; y: number; z: number } | null): void {
    this.deathAt = killer;
    this.deathBlend = 0;
  }

  private deathAt: { x: number; y: number; z: number } | null = null;
  private deathBlend = 0;

  /** a hit landed on the local file: the body takes it, from the bearing given (Stage 74) */
  takeHit(fromYaw: number, amount: number): void {
    this.hurtT = Math.max(this.hurtT, clamp(amount, 0, 1));
    this.hurtYaw = fromYaw;
  }
  private hurtT = 0;
  private hurtYaw = 0;

  /** a remote fired: its weapon shoves back (the wire carries the shot, not the recoil) */
  kickRemote(id: number): void {
    const e = this.remoteMeshes.get(id);
    if (e) e.kick = 1;
  }

  /** pose every remote from its last view and what it did since the previous frame */
  private poseRemotes(rawDt: number): void {
    // two frames can share a timestamp: dividing a displacement by zero puts Infinity into the
    // speed estimate, and one NaN there is permanent (Stage 65)
    const dt = Math.max(1e-4, rawDt);
    for (const e of this.remoteMeshes.values()) {
      const v = e.view;
      if (!v) continue;
      const prev = e.prev ?? { x: v.x, y: v.y, z: v.z, yaw: v.yaw };
      const dx = v.x - prev.x, dz = v.z - prev.z;
      const seen = Math.min(12, Math.hypot(dx, dz) / dt);
      e.speedEst += (seen - e.speedEst) * Math.min(1, 12 * dt);
      // the lesser of what the wire says and what the position did: a held extrapolation sample
      // with a stale velocity can stop the feet but never start them on a body that is not moving
      const wire = v.vx !== undefined && v.vz !== undefined ? Math.hypot(v.vx, v.vz) : e.speedEst;
      const speed = Math.min(wire, e.speedEst);
      const grounded = v.grounded ?? true;
      if (grounded && speed >= 0.5 && v.stance !== "slide") e.phase += dt * (6 + speed * 0.9);
      e.kick = Math.max(0, e.kick - dt * 14);
      e.prev = { x: v.x, y: v.y, z: v.z, yaw: v.yaw };
      // Far from the camera the pose holds: at that range the read is the silhouette, not the stride.
      // The hold covers the stride only — a file that dies or respawns out there still has to fall
      // down and stand up, so a body whose last pose no longer matches what the wire says is posed
      // whatever the range (Stage 64: four reviewers found a dead player left standing at 40 m).
      const far = Math.hypot(v.x - this.camera.position.x, v.z - this.camera.position.z) > 40;
      if (far && e.rig.last && v.alive && e.rig.last.visible) {
        e.group.visible = true;
        continue;
      }
      // a held position is not a direction: atan2(-0, -0) is -pi, which would face the legs
      // backwards for as long as the interpolator repeats a sample (Stage 65)
      const moved = Math.hypot(dx, dz) > 1e-4;
      const inp: PoseInput = { speed, moveYaw: moved && speed > 0.5 ? Math.atan2(-dx, -dz) : v.yaw, yaw: v.yaw, pitch: v.pitch ?? 0, vy: clamp((v.y - prev.y) / dt, -12, 12), turnRate: clamp(wrapAngle(v.yaw - prev.yaw) / dt, -20, 20), grounded, stance: v.stance as Stance, height: v.height, reloading: 0, ads: 0, kick: e.kick, swap: 0, charge: 0, hurt: e.hurt, hurtFrom: wrapAngle(e.hurtFrom - v.yaw), alive: v.alive, stunned: false, clock: this.clock, phase: e.phase };
      const out = poseBody(inp, e.rig.state, dt);
      applyPose(e.rig, out, v.yaw);
      e.group.visible = out.visible;
    }
  }

  /** the probe's read of a body: the local rig, or a remote's by id */
  rig(id?: number): RigReport {
    if (id === undefined) return { ...rigReport(this.local), calls: this.breakdown()["rig"] ?? 0 };
    const e = this.remoteMeshes.get(id);
    if (!e) throw new Error(`no remote ${id}`);
    let calls = 0;
    e.group.traverse((o) => {
      if (o.visible && (o.type === "Mesh" || o.type === "SkinnedMesh" || o.type === "Sprite")) calls++;
    });
    return { ...rigReport(e.rig), hurt: e.hurt, hurtFrom: e.hurtFrom, slot: e.slot, stripColor: e.strip.visible ? e.stripMat.color.getHex() : null, calls };
  }

  /** Cyan tracer from the muzzle (or a world-space origin for other players) to the impact point, plus a muzzle flash. */
  tracer(from: Vec3, to: Vec3, hitWorld: boolean, worldOrigin = false, color: number = PALETTE.cyan): void {
    if (worldOrigin) this.tmpStart.set(from.x, from.y, from.z);
    else if (this.thirdPerson) {
      this.handMuzzle.getWorldPosition(this.tmpStart);
    } else {
      this.viewmodel.getWorldPosition(this.tmpStart);
      this.tmpStart.y += 0.03;
    }
    this.vfxPool.addTracer(this.tmpStart.x, this.tmpStart.y, this.tmpStart.z, to.x, to.y, to.z, color, this.clock);
    if (!worldOrigin) {
      this.muzzleT = 1;
      this.vmKick = 1;
    }
    if (hitWorld) this.vfxPool.addSpark(to.x, to.y, to.z, color, this.clock);
  }

  /**
   * Visible renderables per top-level scene group — near enough a draw-call breakdown, and the
   * thing a budget check needs when it fails. "180 calls, over budget" says nothing; "the dressing
   * is 96 of them" says where to look. Walked on demand, never per frame.
   */
  breakdown(): Record<string, number> {
    const out: Record<string, number> = {};
    const drawable = new Set(["Mesh", "InstancedMesh", "SkinnedMesh", "Line", "LineSegments", "LineLoop", "Points", "Sprite"]);
    // `traverse` walks into hidden subtrees; the renderer does not. Counting with it reports every
    // stowed weapon's viewmodel as drawn — 51 of the camera's children, none of them rendered.
    const count = (o: THREE.Object3D): number => {
      if (!o.visible) return 0;
      let n = drawable.has(o.type) ? 1 : 0;
      for (const c of o.children) n += count(c);
      return n;
    };
    for (const child of this.scene.children) {
      const n = count(child);
      if (n === 0) continue;
      const key = child.name || child.type;
      out[key] = (out[key] ?? 0) + n;
    }
    return out;
  }

  /**
   * The camera behind the body (Stage 60). The pivot is the eye the sim fires from; the camera sits
   * behind it over the right shoulder, backs off any box in its way (tps.ts), and eases distance
   * changes so a doorway does not snap it. The body stands on the player's feet, faces the aim, and
   * its hand turns with the pitch; it is hidden when the camera is pulled in against it. The
   * reticle goes where the eye's ray lands on screen, so what it covers is what a shot hits.
   */
  private placeThirdPerson(v: ViewState, dt: number, bobY: number, rawDt: number): void {
    const pivot = { x: v.x, y: v.y + this.eyeSmooth, z: v.z };
    // the death camera: the body's own yaw still belongs to the file (it is a corpse, it keeps the
    // facing it fell with), but the camera turns onto whatever closed it (Stage 83)
    const look = this.deathLook(v, pivot, dt);
    const base = v.zoom > 1 ? TPS_ADS : TPS_DEFAULT;
    // the camera drifts back as the file runs, the other half of the speed cue: the distance is
    // eased below anyway, so this arrives over a few frames rather than on one (Stage 77)
    const opts = this.fovPush > 0.01 ? { ...base, distance: base.distance + SPRINT_PULL * (this.fovPush / SPRINT_FOV) } : base;
    const cam = thirdPersonCamera(pivot, look.yaw, look.pitch, this.boxes, opts);
    // ease the distance only: pulling in against a wall is immediate (the wall is there now), letting back out is eased
    const k = Math.min(1, dt * 10);
    this.camSmooth.d = !this.camSmooth.set || cam.distance < this.camSmooth.d ? cam.distance : this.camSmooth.d + (cam.distance - this.camSmooth.d) * k;
    this.camSmooth.set = true;
    // the eased distance runs along the segment that was cast — from the shoulder, not from the eye.
    // Scaling the whole offset toward the pivot instead swept the camera along a line nobody cast,
    // which can pass through the edge of the very box that pulled it in (Stage 66).
    // the shoulder itself is a cast result, and a wall it clears returns it 0.78 m sideways in one
    // frame: ease the offset the same way the distance is eased, so clearing a corner slides the
    // camera back over the shoulder rather than snapping it (Stage 73)
    const wantOff = cam.anchor.x - pivot.x === 0 && cam.anchor.z - pivot.z === 0 ? 0 : Math.hypot(cam.anchor.x - pivot.x, cam.anchor.z - pivot.z, cam.anchor.y - pivot.y);
    this.shoulderSmooth = !this.camSmooth.set || wantOff < this.shoulderSmooth ? wantOff : this.shoulderSmooth + (wantOff - this.shoulderSmooth) * k;
    const full = Math.hypot(cam.anchor.x - pivot.x, cam.anchor.y - pivot.y, cam.anchor.z - pivot.z);
    const s = full > 1e-6 ? this.shoulderSmooth / full : 0;
    const anchor = { x: pivot.x + (cam.anchor.x - pivot.x) * s, y: pivot.y + (cam.anchor.y - pivot.y) * s, z: pivot.z + (cam.anchor.z - pivot.z) * s };
    const ax = anchor.x + cam.dir.x * this.camSmooth.d, ay = anchor.y + cam.dir.y * this.camSmooth.d + bobY * 0.4, az = anchor.z + cam.dir.z * this.camSmooth.d;
    this.camera.position.set(ax, ay, az);
    this.camera.rotation.set(look.pitch + v.kickPitch, look.yaw + v.kickYaw, this.rollNow + (v.stunned ? Math.sin(this.clock * 25) * 0.02 : 0));
    // the body
    const g = this.local.group;
    const close = this.camSmooth.d < 0.9;
    g.position.set(v.x, v.y, v.z);
    g.rotation.y = v.yaw;
    // the pose (Stage 63): everything the body does comes from pose.ts, from what this frame knows
    const vy = Number.isNaN(this.lastViewY) ? 0 : clamp((v.y - this.lastViewY) / Math.max(1e-4, rawDt), -12, 12);
    const turnRate = Number.isNaN(this.lastViewYaw) ? 0 : clamp(wrapAngle(v.yaw - this.lastViewYaw) / Math.max(1e-4, rawDt), -20, 20);
    this.lastViewY = v.y;
    this.lastViewYaw = v.yaw;
    const inp: PoseInput = { speed: v.speed, moveYaw: v.moveYaw, yaw: v.yaw, pitch: v.pitch, vy, turnRate, grounded: v.grounded, stance: v.stance as Stance, height: v.height, reloading: v.reloading, ads: v.zoom > 1 ? 1 : 0, kick: this.vmKick, swap: this.vmSwap, charge: clamp(v.charge, 0, 1), hurt: this.hurtT, hurtFrom: wrapAngle(this.hurtYaw - v.yaw), alive: v.alive, stunned: v.stunned, clock: this.clock, phase: this.bobPhase };
    const out = poseBody(inp, this.local.state, dt);
    applyPose(this.local, out, v.yaw);
    g.visible = out.visible && !close && !this.bodyHidden;
    // the reticle: the eye's ray, projected
    // a launcher's round falls: the mark is where the arc ends, not where the ray would have gone
    const eye = { x: v.x, y: v.y + v.eye, z: v.z };
    const aim = v.arc ? arcPoint(eye, v.aimYaw, v.aimPitch, v.arc, this.boxes, v.targets) : aimPoint(eye, v.aimYaw, v.aimPitch, this.boxes, v.targets, v.aimRange);
    this.camera.updateMatrixWorld(true);
    this.tmpProj.set(aim.point.x, aim.point.y, aim.point.z).project(this.camera);
    const visible = this.tmpProj.z < 1 && Math.abs(this.tmpProj.x) <= 1.2 && Math.abs(this.tmpProj.y) <= 1.2;
    const rx = (this.tmpProj.x + 1) * 0.5 * window.innerWidth;
    const ry = (1 - this.tmpProj.y) * 0.5 * window.innerHeight;
    this.lastView = { third: true, fov: this.camera.fov, dip: this.dipNow, roll: this.rollNow, look: { yaw: look.yaw, pitch: look.pitch }, anchor: { x: anchor.x, y: anchor.y, z: anchor.z }, camera: { x: ax, y: ay, z: az }, distance: this.camSmooth.d, blocked: cam.blocked, bodyVisible: g.visible, reticle: { x: rx, y: ry, visible }, aim: { distance: aim.distance, hit: aim.hit, onTarget: aim.onTarget, arc: !!v.arc, point: { x: aim.point.x, y: aim.point.y, z: aim.point.z } } };
  }

  /**
   * Where the camera is looking this frame: the player's own aim, or — once the file is closed and
   * there is something to name — an eased turn onto it. The blend is on the render clock, so it
   * takes the same second wherever it runs.
   */
  private deathLook(v: ViewState, pivot: { x: number; y: number; z: number }, dt: number): { yaw: number; pitch: number } {
    // a file back on the ledger has its camera back, and the next death arms the swing again from
    // wherever it is looking then: `die` is the only place that sets this up
    if (v.alive || !this.deathAt) return { yaw: v.yaw, pitch: v.pitch };
    this.deathBlend = Math.min(1, this.deathBlend + dt * DEATH_TURN);
    const want = lookYawPitch(pivot, this.deathAt, v.yaw, v.pitch);
    const k = this.deathBlend * this.deathBlend * (3 - 2 * this.deathBlend); // smoothstep, so it starts and ends still
    return { yaw: v.yaw + wrapAngle(want.yaw - v.yaw) * k, pitch: v.pitch + (want.pitch - v.pitch) * k };
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
    this.vmKick = Math.max(0, this.vmKick - dt * 14);
    this.hurtT = Math.max(0, this.hurtT - dt * 3.5);
    // the camera takes the landing the legs have been taking since Stage 63. The fall speed is the
    // frame before touchdown, because on the frame itself the sim has already stopped the file
    // (Stage 79)
    const fell = this.lastY === null ? 0 : fallSpeed(this.lastY, v.y, rawDt);
    if (v.grounded && this.wasAir && v.alive) {
      this.landHard = landHardness(this.fallSpeed);
      this.landT = this.landHard > 0 ? LAND_TIME : 0;
    }
    if (!v.grounded) this.fallSpeed = fell;
    this.wasAir = !v.grounded;
    this.lastY = v.y;
    this.landT = Math.max(0, this.landT - rawDt);
    const dip = this.landT > 0 ? landDip(this.landHard, LAND_TIME - this.landT) : 0;
    this.dipNow = dip;
    // and it leans into a slide in both views: the first-person one always did, by a fixed amount
    // that snapped on and off; it eases now, and the camera behind the body does it too
    const wantRoll = stanceRoll(v.stance);
    this.rollNow += (wantRoll - this.rollNow) * Math.min(1, dt * (wantRoll > this.rollNow ? 12 : 7));
    // the ADS ease changes the projection, and the reticle is projected through it: move the lens
    // before the frame is placed, or for the half second of the zoom the reticle is drawn with the
    // previous frame's field of view and sits off the ray it claims to mark (Stage 66)
    // and speed reads as field of view: the street widens as the file runs and closes back in as it
    // stops. It eases in over about a fifth of a second and back out more slowly, because a lens
    // that snapped with the speed would read as a stutter rather than as acceleration (Stage 77).
    const push = speedPush(v.speed, v.zoom) * SPRINT_FOV;
    this.fovPush += (push - this.fovPush) * Math.min(1, dt * (push > this.fovPush ? 5 : 3));
    // the spawn-in (Stage 96): on the frame a closed file is back on the ledger the camera used to
    // cut — a new place, the old heading, nothing in between. Now the CRT comes up heavy and
    // settles and the lens opens out, over a second, and the cut itself is a tear
    if (spawnEdge(this.lastAlive, v.alive)) {
      this.spawnT = 0;
      this.post.kick(0.6);
    } else this.spawnT = Math.min(SPAWN_TIME, this.spawnT + dt);
    this.lastAlive = v.alive;
    const spawn = spawnCurve(this.spawnT);
    this.post.spawnBoost(spawn.crt);
    const targetFov = this.baseFov / v.zoom + this.fovPush + spawn.fov;
    this.fovNow += (targetFov - this.fovNow) * Math.min(1, dt * 14);
    if (Math.abs(this.camera.fov - this.fovNow) > 0.01) {
      this.camera.fov = this.fovNow;
      this.camera.updateProjectionMatrix();
    }
    if (this.thirdPerson) this.placeThirdPerson(v, dt, bobY - dip, rawDt);
    else {
      this.camera.position.set(v.x, v.y + this.eyeSmooth + bobY - dip, v.z);
      this.camera.rotation.set(v.pitch + v.kickPitch, v.yaw + v.kickYaw, this.rollNow + (this.rollNow > 0.005 ? 0 : bobX * 0.6) + (v.stunned ? Math.sin(this.clock * 25) * 0.02 : 0));
      this.local.group.visible = false;
      // the crosshair is the screen's centre in this view because the eye's ray is — but a
      // launcher's round falls here too, and leaving the mark at the centre would tell in one view
      // the straight-ray lie the other has just stopped telling (Stage 78)
      let mark = { x: window.innerWidth / 2, y: window.innerHeight / 2, visible: true };
      let fired = { distance: 0, hit: false, onTarget: false, arc: false, point: { x: v.x, y: v.y + v.eye, z: v.z } };
      if (v.arc) {
        const a = arcPoint({ x: v.x, y: v.y + v.eye, z: v.z }, v.aimYaw, v.aimPitch, v.arc, this.boxes, v.targets);
        this.camera.updateMatrixWorld(true);
        this.tmpProj.set(a.point.x, a.point.y, a.point.z).project(this.camera);
        mark = { x: (this.tmpProj.x + 1) * 0.5 * window.innerWidth, y: (1 - this.tmpProj.y) * 0.5 * window.innerHeight, visible: this.tmpProj.z < 1 && Math.abs(this.tmpProj.x) <= 1.2 && Math.abs(this.tmpProj.y) <= 1.2 };
        fired = { distance: a.distance, hit: a.hit, onTarget: a.onTarget, arc: true, point: { x: a.point.x, y: a.point.y, z: a.point.z } };
      }
      this.lastView = { third: false, fov: this.camera.fov, dip: this.dipNow, roll: this.rollNow, look: { yaw: v.yaw, pitch: v.pitch }, anchor: { x: 0, y: 0, z: 0 }, camera: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }, distance: 0, blocked: false, bodyVisible: false, reticle: mark, aim: fired };
    }
    // the viewmodel is the first-person weapon; behind the body the hand holds it instead
    this.viewmodel.visible = !this.thirdPerson;

    const reloadDip = v.reloading > 0 ? Math.sin(v.reloading * Math.PI) * 0.18 : 0;
    this.viewmodel.position.set(0.28 + bobX * 0.5, -0.26 - reloadDip + bobY * 0.5, -0.55 + this.vmKick * 0.06);
    this.viewmodel.rotation.x = this.vmKick * 0.08 - reloadDip * 0.8;
    this.muzzleT = Math.max(0, this.muzzleT - dt * 18);
    // the hand's light is a child of the body, and three skips a hidden subtree entirely: with the
    // camera pulled in against the body there was no muzzle flash at all, which is exactly when the
    // player is in a doorway and needs to see they are firing. Fall back to the camera's (Stage 69).
    const onBody = this.thirdPerson && this.local.group.visible;
    this.hostFilament();
    this.muzzle.intensity = onBody ? 0 : this.muzzleT * 8;
    this.handMuzzle.intensity = onBody ? this.muzzleT * 8 : 0;
    // weapon swap: hide/show viewmodels with a quick dip
    const wantId = WEAPON_LIST[v.slot - 1]?.id ?? "lease_breaker";
    const want = this.viewmodels.get(wantId)!;
    if (want !== this.viewmodel) {
      this.viewmodel.visible = false;
      this.viewmodel = want;
      this.viewmodel.visible = !this.thirdPerson;
      this.vmSwap = 1;
      this.muzzle.color.set(WEAPON_LIST[v.slot - 1]?.tracer ?? PALETTE.cyan);
      this.handMuzzle.color.set(WEAPON_LIST[v.slot - 1]?.tracer ?? PALETTE.cyan);
      const held = this.localWeapons.get(wantId)!;
      this.localWeapon.visible = false;
      this.localWeapon = held;
      this.localWeapon.visible = true;
    }
    this.vmSlot = v.slot;
    this.vmSwap = Math.max(0, this.vmSwap - dt * 4);
    this.viewmodel.position.y -= this.vmSwap * 0.25;
    this.viewmodel.rotation.x -= this.vmSwap * 0.5;
    if (v.charge > 0) {
      this.viewmodel.position.z += Math.sin(this.clock * 60) * 0.004 * v.charge;
      // the glow belongs to whichever weapon is being drawn: on the body's, it was lighting the
      // camera instead and the held weapon stayed dark while it charged (Stage 69)
      const glow = onBody ? this.handMuzzle : this.muzzle;
      glow.intensity = Math.max(glow.intensity, v.charge * 5);
    }
    // (the stun roll is applied in placeThirdPerson, before the reticle is projected through it)
    this.decayHits(dt);
    this.poseRemotes(rawDt);
    this.fx.update(dt);
    this.wake.update(dt);
    this.run.update(dt);

    this.vfxPool.update(this.clock);
    this.liveVfx = this.vfxPool.live(this.clock);
    this.renderer.info.reset();
    this.rain.update(this.clock, this.camera);
    // the city runs on wall time (capped at a hitch): a slow frame still moves the crowd and the tram their full distance
    const cityDt = Math.min(rawDt, 0.5);
    this.traffic?.update(cityDt);
    this.listener.copy(this.camera.position);
    this.life.update(cityDt, this.listener);
    this.campaignFx.update(cityDt);
    this.signFlicker?.setTime(this.clock);
    this.post.render(this.clock, dt);
  }
}
