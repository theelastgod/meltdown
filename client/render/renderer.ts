import { texture as assetTexture } from "./assets";
import * as THREE from "three";
import type { LevelDef } from "@shared/sim/level";
import type { Dummy } from "@shared/sim/world";
import { MOVE } from "@shared/sim/constants";
import type { Vec3 } from "@shared/math/vec3";
import { PostChain } from "./post";
import { Rain } from "./rain";
import { makeFlatWetFloor, makeWetFloor } from "./wetfloor";
import { buildSkyline, dressLevel, PALETTE, Traffic } from "./city";
import { VfxPool } from "./vfx";
import { release } from "./dispose";
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
import { buildBody, mergeByMaterial, type Body } from "./body";
import { aimPoint, thirdPersonCamera, TPS_ADS, TPS_DEFAULT } from "./tps";
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
  aim: { distance: number; hit: boolean };
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
  private local: Body;
  private localWeapons = new Map<WeaponId, THREE.Group>();
  private localWeapon: THREE.Group;
  private handMuzzle: THREE.PointLight;
  /** third person is the game's view (the trailer's); first person is a setting */
  thirdPerson = true;
  /** the probe's ruler: hide the body and keep the camera, so the body's cost is the difference and nothing else is */
  bodyHidden = false;
  private boxes: readonly Box[];
  private camSmooth = { d: TPS_DEFAULT.distance, x: 0, y: 0, z: 0, set: false };
  private lastView: CameraView = { third: true, camera: { x: 0, y: 0, z: 0 }, distance: 0, blocked: false, bodyVisible: false, reticle: { x: 0, y: 0, visible: true }, aim: { distance: 0, hit: false } };
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
  setView(third: boolean): void {
    this.thirdPerson = third;
    this.camSmooth.set = false;
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
  private vmKick = 0;
  private eyeSmooth = MOVE.eyeStand;
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
    this.renderer.compile(this.scene, this.camera);
    this.camera.layers.enable(FAR_LAYER);
    const floor = level.boxes.find((b) => b.tag === "floor" || b.tag === "white_floor") ?? level.boxes[0]!;
    this.scene.add(
      mobile
        ? makeFlatWetFloor(floor.max.x - floor.min.x, floor.max.z - floor.min.z, floor.max.y + 0.002, fogColor)
        : makeWetFloor(floor.max.x - floor.min.x, floor.max.z - floor.min.z, floor.max.y + 0.002, fogColor, fogDensity),
    );

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
    this.local = buildBody();
    this.local.group.name = "rig";
    this.scene.add(this.local.group);
    for (const w of WEAPON_LIST) {
      const held = buildViewmodel(w.id);
      // the viewmodel's pose is the camera's; in the hand the weapon sits on the socket and points where the body points
      held.position.set(0, 0, -0.26);
      held.rotation.set(0, 0, 0);
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
    this.fx = new ArsenalFx(this.scene);
    this.wake = new WakeFx(this.scene);
    this.run = new RunFx(this.scene);

    // a phone renders the post chain smaller again: it is already an offscreen 0.6 of the canvas,
    // and the CRT look survives the drop because it is grain, scanlines and bloom rather than detail
    this.post = new PostChain(this.renderer, this.scene, this.camera, window.innerWidth, window.innerHeight, mobile ? 0.45 : 0.6);
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
      e.flash = Math.max(0, e.flash - 0.08);
      e.mat.emissiveIntensity = 0.12 + e.flash * 0.9;
    }
  }

  flashDummy(id: number): void {
    const e = this.dummyMeshes.get(id);
    if (e) e.flash = 1;
  }

  private remoteMeshes = new Map<number, { group: THREE.Group; mat: THREE.MeshStandardMaterial; trim: THREE.MeshBasicMaterial; skin: number; tag: THREE.Sprite; tagKey: string; canvas: HTMLCanvasElement }>();
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
    // the cloak wears it too, as the city sees it on everyone else
    this.local.mat.emissive.set(tint ?? PALETTE.cyan);
    this.local.trim.color.set(tint ?? PALETTE.cyan);
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

  syncRemotes(views: readonly { id: number; x: number; y: number; z: number; yaw: number; height: number; alive: boolean; stance: string; name?: string; tag?: string; debt?: boolean }[]): void {
    const seen = new Set<number>();
    for (const v of views) {
      seen.add(v.id);
      let e = this.remoteMeshes.get(v.id);
      if (!e) {
        const { group, mat, trim: trimMat, hand } = buildBody();
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.5, metalness: 0.6 }));
        gun.position.set(0, 0.05, -0.25);
        hand.add(gun);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 56;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        tag.scale.set(1.6, 0.35, 1);
        tag.position.y = MOVE.standHeight + 0.45;
        tag.center.set(0.1, 0.5);
        group.add(tag);
        this.scene.add(group);
        e = { group, mat, trim: trimMat, skin: -1, tag, tagKey: "", canvas };
        this.remoteMeshes.set(v.id, e);
      }
      this.drawTag(e, v.name ?? "BLANK", v.tag ?? "", !!v.debt);
      // the worn skin travels as a token id in the tag; the palette it names is the client's catalog
      const skin = v.tag ? parseTag(v.tag, "").skin : 0;
      if (skin !== e.skin) {
        e.skin = skin;
        const tint = skinByToken(skin)?.tint;
        e.mat.emissive.set(tint ?? PALETTE.cyan);
        e.trim.color.set(tint ?? PALETTE.cyan);
      }
      e.group.visible = v.alive;
      e.group.position.set(v.x, v.y, v.z);
      e.group.rotation.y = v.yaw;
      const crouch = v.stance === "slide" || v.stance === "crouch";
      e.group.scale.y = crouch ? 0.65 : 1;
    }
    for (const [id, e] of this.remoteMeshes) {
      if (!seen.has(id)) {
        release(e.group);
        this.remoteMeshes.delete(id);
      }
    }
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
  private placeThirdPerson(v: ViewState, dt: number, bobY: number): void {
    const pivot = { x: v.x, y: v.y + this.eyeSmooth, z: v.z };
    const opts = v.zoom > 1 ? TPS_ADS : TPS_DEFAULT;
    const cam = thirdPersonCamera(pivot, v.yaw, v.pitch, this.boxes, opts);
    // ease the distance only: pulling in against a wall is immediate (the wall is there now), letting back out is eased
    const k = Math.min(1, dt * 10);
    this.camSmooth.d = !this.camSmooth.set || cam.distance < this.camSmooth.d ? cam.distance : this.camSmooth.d + (cam.distance - this.camSmooth.d) * k;
    this.camSmooth.set = true;
    const t = cam.distance > 1e-6 ? this.camSmooth.d / cam.distance : 1;
    const ax = pivot.x + (cam.pos.x - pivot.x) * t, ay = pivot.y + (cam.pos.y - pivot.y) * t + bobY * 0.4, az = pivot.z + (cam.pos.z - pivot.z) * t;
    this.camera.position.set(ax, ay, az);
    this.camera.rotation.set(v.pitch + v.kickPitch, v.yaw + v.kickYaw, 0);
    // the body
    const g = this.local.group;
    const close = this.camSmooth.d < 0.9;
    g.visible = v.alive && !close && !this.bodyHidden;
    g.position.set(v.x, v.y, v.z);
    g.rotation.y = v.yaw;
    const crouch = v.stance === "slide" || v.stance === "crouch";
    g.scale.y = crouch ? 0.65 : 1;
    g.rotation.x = v.stance === "slide" ? -0.25 : Math.min(0.12, v.speed * 0.015);
    this.local.hand.rotation.x = v.pitch;
    this.local.hand.position.z = -0.2 - this.vmKick * 0.05;
    // the reticle: the eye's ray, projected
    const aim = aimPoint({ x: v.x, y: v.y + v.eye, z: v.z }, v.yaw, v.pitch, this.boxes);
    this.camera.updateMatrixWorld(true);
    this.tmpProj.set(aim.point.x, aim.point.y, aim.point.z).project(this.camera);
    const visible = this.tmpProj.z < 1 && Math.abs(this.tmpProj.x) <= 1.2 && Math.abs(this.tmpProj.y) <= 1.2;
    const rx = (this.tmpProj.x + 1) * 0.5 * window.innerWidth;
    const ry = (1 - this.tmpProj.y) * 0.5 * window.innerHeight;
    this.lastView = { third: true, camera: { x: ax, y: ay, z: az }, distance: this.camSmooth.d, blocked: cam.blocked, bodyVisible: g.visible, reticle: { x: rx, y: ry, visible }, aim: { distance: aim.distance, hit: aim.hit } };
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
    if (this.thirdPerson) this.placeThirdPerson(v, dt, bobY);
    else {
      this.camera.position.set(v.x, v.y + this.eyeSmooth + bobY, v.z);
      this.camera.rotation.set(v.pitch + v.kickPitch, v.yaw + v.kickYaw, v.stance === "slide" ? 0.03 : bobX * 0.6);
      this.local.group.visible = false;
      this.lastView = { third: false, camera: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }, distance: 0, blocked: false, bodyVisible: false, reticle: { x: window.innerWidth / 2, y: window.innerHeight / 2, visible: true }, aim: { distance: 0, hit: false } };
    }
    // the viewmodel is the first-person weapon; behind the body the hand holds it instead
    this.viewmodel.visible = !this.thirdPerson;

    const dip = v.reloading > 0 ? Math.sin(v.reloading * Math.PI) * 0.18 : 0;
    this.viewmodel.position.set(0.28 + bobX * 0.5, -0.26 - dip + bobY * 0.5, -0.55 + this.vmKick * 0.06);
    this.viewmodel.rotation.x = this.vmKick * 0.08 - dip * 0.8;
    this.muzzleT = Math.max(0, this.muzzleT - dt * 18);
    this.muzzle.intensity = this.thirdPerson ? 0 : this.muzzleT * 8;
    this.handMuzzle.intensity = this.thirdPerson ? this.muzzleT * 8 : 0;
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
