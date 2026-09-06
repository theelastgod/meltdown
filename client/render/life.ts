/**
 * City life: everything that moves in Neo-China and touches nothing in the sim.
 * Crowds of leased citizens on the sidewalks, the monorail over the walkway
 * street, steam from the grates, holographic ad tickers, blinking warning
 * lights on the skyline, an airship, and the shader flicker on the signs.
 * All of it is render-only; the collision boxes it needs (gates, posts)
 * live in the level as boxes.
 */
import * as THREE from "three";
import type { LevelDef, TramLine, WalkLoop } from "@shared/sim/level";
import { PALETTE } from "./city";
import { FAR_LAYER } from "./renderer";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface Ped {
  loop: WalkLoop;
  /** distance along the loop perimeter */
  t: number;
  dir: 1 | -1;
  speed: number;
  bob: number;
  /** standing still (leaning at a storefront) */
  idle: boolean;
  umbrella: boolean;
  x: number;
  z: number;
  yaw: number;
}

const perimeter = (l: WalkLoop) => 2 * (l.x1 - l.x0 + (l.z1 - l.z0));

/** Point and heading at distance t around a rectangle loop (clockwise from the NW corner). */
function onLoop(l: WalkLoop, t: number): { x: number; z: number; yaw: number } {
  const w = l.x1 - l.x0;
  const d = l.z1 - l.z0;
  const P = 2 * (w + d);
  let s = ((t % P) + P) % P;
  if (s < w) return { x: l.x0 + s, z: l.z0, yaw: Math.PI / 2 };
  s -= w;
  if (s < d) return { x: l.x1, z: l.z0 + s, yaw: 0 };
  s -= d;
  if (s < w) return { x: l.x1 - s, z: l.z1, yaw: -Math.PI / 2 };
  s -= w;
  return { x: l.x0, z: l.z1 - s, yaw: Math.PI };
}

/** Hooded silhouettes walking the sidewalks. Faces never lit; one amber lease-light on the chest. */
export class Crowd {
  readonly group = new THREE.Group();
  private peds: Ped[] = [];
  private body: THREE.InstancedMesh;
  private hood: THREE.InstancedMesh;
  private lamp: THREE.InstancedMesh;
  private brolly: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private time = 0;

  constructor(loops: readonly WalkLoop[], count: number, seed = 11) {
    const rnd = lcg(seed);
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0d13, roughness: 0.9, metalness: 0.05 });
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x090a0f, roughness: 1 });
    const lampMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber });
    const brollyMat = new THREE.MeshStandardMaterial({ color: 0x0e1218, roughness: 0.8, side: THREE.DoubleSide });
    this.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 1.0, 3, 8), dark, count);
    this.hood = new THREE.InstancedMesh(new THREE.ConeGeometry(0.36, 0.5, 7), hoodMat, count);
    this.lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), lampMat, count);
    this.brolly = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 0.25, 8, 1, true), brollyMat, count);
    for (const mesh of [this.body, this.hood, this.lamp, this.brolly]) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    for (let i = 0; i < count; i++) {
      const loop = loops[Math.floor(rnd() * loops.length)]!;
      this.peds.push({ loop, t: rnd() * perimeter(loop), dir: rnd() < 0.5 ? 1 : -1, speed: 0.8 + rnd() * 0.7, bob: rnd() * 6.28, idle: rnd() < 0.12, umbrella: rnd() < 0.3, x: 0, z: 0, yaw: 0 });
    }
    this.update(0);
  }

  get count(): number {
    return this.peds.length;
  }

  /** Positions for probes (and later, for the campaign's Threat Rating). */
  sample(n = 8): { x: number; z: number }[] {
    return this.peds.slice(0, n).map((p) => ({ x: p.x, z: p.z }));
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.peds.length; i++) {
      const ped = this.peds[i]!;
      if (!ped.idle) ped.t += ped.dir * ped.speed * dt;
      const o = onLoop(ped.loop, ped.t);
      ped.x = o.x;
      ped.z = o.z;
      ped.yaw = ped.dir > 0 ? o.yaw : o.yaw + Math.PI;
      const bob = ped.idle ? 0 : Math.abs(Math.sin(this.time * 6 * ped.speed + ped.bob)) * 0.04;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ped.yaw);
      this.sc.set(1, 1, 1);
      this.p.set(o.x, 0.8 + bob, o.z);
      this.m.compose(this.p, this.q, this.sc);
      this.body.setMatrixAt(i, this.m);
      this.p.set(o.x, 1.62 + bob, o.z);
      this.m.compose(this.p, this.q, this.sc);
      this.hood.setMatrixAt(i, this.m);
      // lease light on the chest, facing the way they walk
      this.p.set(o.x + Math.sin(ped.yaw) * 0.3, 1.15 + bob, o.z + Math.cos(ped.yaw) * 0.3);
      this.m.compose(this.p, this.q, this.sc);
      this.lamp.setMatrixAt(i, this.m);
      this.p.set(o.x, ped.umbrella ? 2.05 + bob : -5, o.z);
      this.m.compose(this.p, this.q, this.sc);
      this.brolly.setMatrixAt(i, this.m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.hood.instanceMatrix.needsUpdate = true;
    this.lamp.instanceMatrix.needsUpdate = true;
    this.brolly.instanceMatrix.needsUpdate = true;
  }
}

/** The monorail: a lit car passing along the beam over the walkway street, both directions on a period. */
export class Tram {
  readonly group = new THREE.Group();
  private cars: { mesh: THREE.Group; dir: 1 | -1; phase: number }[] = [];
  private time = 0;
  /** true on the frame a car is within `near` of the listener (audio cue) */
  passing = false;
  private lastPassing = false;
  constructor(private line: TramLine) {
    for (const dir of [1, -1] as const) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(14, 2.6, 2.4), new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.4, metalness: 0.6 }));
      g.add(body);
      const windows = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.9, 2.46), new THREE.MeshBasicMaterial({ color: 0xbfefff }));
      windows.position.y = 0.35;
      g.add(windows);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(14.05, 0.08, 2.45), new THREE.MeshBasicMaterial({ color: PALETTE.magenta }));
      strip.position.y = -1.2;
      g.add(strip);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
      head.position.set(dir * 7.05, -0.4, 0);
      g.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 1.2), new THREE.MeshBasicMaterial({ color: PALETTE.red }));
      tail.position.set(-dir * 7.05, -0.4, 0);
      g.add(tail);
      const light = new THREE.PointLight(0xbfefff, 6, 18, 1.8);
      light.position.y = -1.5;
      g.add(light);
      if (line.axis === "z") g.rotation.y = Math.PI / 2;
      this.group.add(g);
      this.cars.push({ mesh: g, dir, phase: dir > 0 ? 0 : line.period / 2 });
    }
    this.update(0, new THREE.Vector3());
  }

  /** Distance from the listener to the nearest visible car (Infinity when none is on the line). */
  distanceTo(listener: { x: number; y: number; z: number }): number {
    let d = Infinity;
    for (const c of this.cars) if (c.mesh.visible) d = Math.min(d, c.mesh.position.distanceTo(listener as THREE.Vector3));
    return d;
  }

  /** true while a car is within earshot (the cue fires on the rising edge) */
  get near(): boolean {
    return this.lastPassing;
  }

  /** Position of the first car along its axis (probes). */
  get position(): number {
    const c = this.cars[0]!;
    return this.line.axis === "x" ? c.mesh.position.x : c.mesh.position.z;
  }

  update(dt: number, listener: THREE.Vector3): void {
    this.time += dt;
    const L = this.line.to - this.line.from;
    const speed = 17;
    let near = false;
    for (const c of this.cars) {
      const t = ((this.time + c.phase) % this.line.period) * speed;
      const visible = t < L;
      c.mesh.visible = visible;
      const s = c.dir > 0 ? this.line.from + t : this.line.to - t;
      if (this.line.axis === "x") c.mesh.position.set(s, this.line.y, this.line.at);
      else c.mesh.position.set(this.line.at, this.line.y, s);
      if (visible && c.mesh.position.distanceTo(listener) < 40) near = true;
    }
    this.passing = near && !this.lastPassing;
    this.lastPassing = near;
  }
}

/** Steam from the grates: additive points rising and fading, one cloud per vent. */
export class Steam {
  readonly object: THREE.Points;
  private mat: THREE.ShaderMaterial;
  constructor(vents: readonly { x: number; y: number; z: number }[], per = 28, seed = 3) {
    const rnd = lcg(seed);
    const n = vents.length * per;
    const pos = new Float32Array(n * 3);
    const info = new Float32Array(n * 3); // phase, drift x, drift z
    for (let v = 0; v < vents.length; v++) {
      for (let i = 0; i < per; i++) {
        const k = v * per + i;
        pos[k * 3] = vents[v]!.x + (rnd() - 0.5) * 0.6;
        pos[k * 3 + 1] = vents[v]!.y;
        pos[k * 3 + 2] = vents[v]!.z + (rnd() - 0.5) * 0.6;
        info[k * 3] = rnd();
        info[k * 3 + 1] = (rnd() - 0.5) * 0.8;
        info[k * 3 + 2] = (rnd() - 0.5) * 0.8;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("info", new THREE.BufferAttribute(info, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime; attribute vec3 info; varying float vA;
        void main() {
          float life = fract(uTime * 0.28 + info.x);
          vec3 p = position + vec3(info.y * life * 2.5, life * 3.2, info.z * life * 2.5);
          vA = (1.0 - life) * smoothstep(0.0, 0.15, life);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (18.0 + life * 60.0) * (30.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vA * 0.16;
          gl_FragColor = vec4(0.62, 0.72, 0.8, a);
        }`,
    });
    this.object = new THREE.Points(geo, this.mat);
    this.object.frustumCulled = false;
  }
  update(time: number): void {
    this.mat.uniforms.uTime!.value = time;
  }
}

/** Holographic ad tickers: VANTAGE copy scrolling on translucent panels that cycle colour. */
export class HoloAds {
  readonly group = new THREE.Group();
  private panels: { mesh: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; mat: THREE.MeshBasicMaterial; offset: number; line: number }[] = [];
  private acc = 0;
  /** ticker redraws so far (probes) */
  redraws = 0;
  static readonly COPY = ["LEASE RENEWAL IS AUTOMATIC", "COMPLY · COMPLY · COMPLY", "VANTAGE INTEGRITY SYSTEMS", "YOUR FUTURE HAS BEEN PRICED", "STABILITY IS A SERVICE", "REPORT UNLISTED FILES", "SLEEP IS COLLATERAL", "THE KERNEL SEES THE CITY WHOLE"];
  constructor(ads: readonly { x: number; y: number; z: number; rotY: number; w: number; h: number }[]) {
    ads.forEach((a, i) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.h), mat);
      mesh.position.set(a.x, a.y, a.z);
      mesh.rotation.y = a.rotY;
      this.group.add(mesh);
      this.panels.push({ mesh, canvas, tex, mat, offset: i * 137, line: i % HoloAds.COPY.length });
    });
    this.redraw(0);
  }
  private redraw(time: number): void {
    for (const p of this.panels) {
      const g = p.canvas.getContext("2d")!;
      const hue = (time * 12 + p.offset) % 360;
      const fg = hue < 120 ? "#35f2ff" : hue < 240 ? "#ff3ec9" : "#ffe34a";
      g.clearRect(0, 0, 512, 128);
      g.fillStyle = "rgba(6,10,18,0.55)";
      g.fillRect(0, 0, 512, 128);
      g.strokeStyle = fg;
      g.lineWidth = 3;
      g.strokeRect(3, 3, 506, 122);
      g.fillStyle = fg;
      g.font = "bold 44px 'Courier New', monospace";
      g.textBaseline = "middle";
      const text = HoloAds.COPY[p.line]! + "   ▸   ";
      const w = g.measureText(text).width;
      const x = 512 - ((time * 70 + p.offset) % (w + 512));
      g.fillText(text, x, 64);
      g.fillText(text, x + w, 64);
      // scanlines
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 512, 1);
      if (((time + p.offset) % 9) < 0.15) g.fillRect(0, 0, 512, 128); // a dropout frame
      p.tex.needsUpdate = true;
    }
  }
  update(dt: number, time: number): void {
    this.acc += dt;
    if (this.acc >= 1 / 12) {
      this.acc = 0;
      this.redraws++;
      this.redraw(time);
      for (const p of this.panels) if (Math.floor(time / 11 + p.offset) !== Math.floor((time - 1 / 12) / 11 + p.offset)) p.line = (p.line + 1) % HoloAds.COPY.length;
    }
  }
}

/** Aircraft-warning blinkers on the tallest slabs and an airship drifting over the district. */
export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private ship: THREE.Group;
  private shipAngle = 0;
  /** blinkers on the skyline */
  readonly blinkers: number;
  constructor(skyline: THREE.Group, seed = 9) {
    const rnd = lcg(seed);
    const tops: number[] = [];
    const phase: number[] = [];
    const slabs = (skyline.userData.slabs ?? []) as { x: number; z: number; top: number }[];
    for (const s of slabs) {
      if (s.top > 60 && rnd() < 0.6) {
        tops.push(s.x, s.top + 1.5, s.z);
        phase.push(rnd() * 6.28);
      }
    }
    this.blinkers = phase.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(tops, 3));
    geo.setAttribute("phase", new THREE.Float32BufferAttribute(phase, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime; attribute float phase; varying float vOn; void main(){ vOn = step(0.92, fract(uTime * 0.5 + phase)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 9.0 * (120.0 / max(1.0, -mv.z)) + 2.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vOn; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 0.1, 0.18, vOn * smoothstep(0.5, 0.15, d)); }`,
    });
    const pts = new THREE.Points(geo, this.mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    // airship: a dark hull with a magenta ad panel underneath, drifting in a slow circle
    this.ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(9, 40, 4, 10), new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.8 }));
    hull.rotation.z = Math.PI / 2;
    this.ship.add(hull);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 0.4), new THREE.MeshBasicMaterial({ color: PALETTE.magenta }));
    panel.position.y = -10;
    this.ship.add(panel);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(34.4, 0.3, 0.6), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
    strip.position.y = -14.2;
    this.ship.add(strip);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshBasicMaterial({ color: PALETTE.red }));
    nose.position.x = 29;
    this.ship.add(nose);
    this.group.add(this.ship);
    this.group.traverse((o) => o.layers.set(FAR_LAYER));
  }
  /** where the airship is (probes) */
  get shipPos(): { x: number; y: number; z: number } {
    return { x: this.ship.position.x, y: this.ship.position.y, z: this.ship.position.z };
  }
  update(dt: number, time: number): void {
    this.mat.uniforms.uTime!.value = time;
    this.shipAngle += dt * 0.012;
    const r = 210;
    this.ship.position.set(Math.cos(this.shipAngle) * r, 150 + Math.sin(time * 0.2) * 3, Math.sin(this.shipAngle) * r - 60);
    this.ship.rotation.y = -this.shipAngle;
  }
}

/** Sign flicker: the atlas material takes a time uniform; each sign quad carries a phase attribute. */
export function flickerMaterial(mat: THREE.MeshBasicMaterial): { setTime: (t: number) => void } {
  let uniforms: { uTime: { value: number } } | null = null;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    uniforms = shader.uniforms as unknown as { uTime: { value: number } };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float flick; varying float vFlick;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlick = flick;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; varying float vFlick;")
      .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n{ float b = 0.86 + 0.14 * sin(uTime * 2.3 + vFlick * 9.0); float drop = step(0.985, fract(sin(floor(uTime * 6.0) + vFlick * 31.7) * 43758.5)); gl_FragColor.rgb *= b * (1.0 - 0.7 * drop); }");
  };
  mat.needsUpdate = true;
  return { setTime: (t) => { if (uniforms) uniforms.uTime.value = t; } };
}

/** Everything above, owned together. */
export class CityLife {
  readonly group = new THREE.Group();
  readonly crowd: Crowd | null;
  readonly tram: Tram | null;
  readonly steam: Steam | null;
  readonly ads: HoloAds | null;
  readonly sky: Sky;
  private time = 0;
  constructor(level: LevelDef, skyline: THREE.Group) {
    this.crowd = level.walks?.length && level.pedestrians ? new Crowd(level.walks, level.pedestrians, (level.skylineSeed ?? 1) + 7) : null;
    if (this.crowd) this.group.add(this.crowd.group);
    this.tram = level.tram ? new Tram(level.tram) : null;
    if (this.tram) this.group.add(this.tram.group);
    this.steam = level.vents?.length ? new Steam(level.vents) : null;
    if (this.steam) this.group.add(this.steam.object);
    this.ads = level.ads?.length ? new HoloAds(level.ads) : null;
    if (this.ads) this.group.add(this.ads.group);
    this.sky = new Sky(skyline, (level.skylineSeed ?? 1) + 3);
    this.group.add(this.sky.group);
  }
  update(dt: number, listener: THREE.Vector3): void {
    this.time += dt;
    this.crowd?.update(dt);
    this.tram?.update(dt, listener);
    this.steam?.update(this.time);
    this.ads?.update(dt, this.time);
    this.sky.update(dt, this.time);
  }
}
