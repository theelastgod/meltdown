import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { markSharedAll, release } from "./dispose";
import { WEAPON_LIST, type WeaponId } from "@shared/weapons/manifest";
import { bindPlate, PALETTE } from "./city";
import type { Vec3 } from "@shared/math/vec3";
import { MECH_HEAD_Y, MECH_HIP, mechBob, mechGait, mechGeometry, WASP_ROTORS, waspGeometry } from "./machines";

/** Distinct kitbash silhouettes per weapon. Cheap boxes; the strip colour is the read. */
/**
 * `mastered` (Stage 675): a weapon at mastery rank 30 carries its finish — inlay lines in its own
 * tracer colour set into both flanks of the receiver, nose to heel. Cosmetic only; nothing about the
 * gun changes. The inlays are merged into the weapon's first strip mesh, so the finish costs no draw
 * call, and they take the worn skin's tint with the strip.
 */
export function buildViewmodel(id: WeaponId, mastered = false): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.5, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0f15, roughness: 0.7, metalness: 0.3 });
  bindPlate(body, "tex_weapon_body");
  bindPlate(dark, "tex_weapon_dark");
  const def = WEAPON_LIST.find((w) => w.id === id)!;
  const strip = new THREE.MeshBasicMaterial({ color: def.tracer });
  // the rig tint (a worn skin) recolours the strip and nothing else — the read stays the silhouette
  g.userData.strip = strip;
  g.userData.tracer = def.tracer;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  switch (id) {
    case "lease_breaker": {
      add(new THREE.BoxGeometry(0.09, 0.12, 0.42), body, 0, 0, 0);
      add(new THREE.BoxGeometry(0.035, 0.035, 0.36), body, 0, 0.03, -0.36);
      add(new THREE.BoxGeometry(0.06, 0.16, 0.07), body, 0, -0.12, 0.08);
      add(new THREE.BoxGeometry(0.012, 0.012, 0.3), strip, 0.05, 0.03, -0.1);
      const mgRail = new THREE.MeshBasicMaterial({ color: PALETTE.magenta });
      bindPlate(mgRail, "tex_lamp");
      add(new THREE.BoxGeometry(0.1, 0.008, 0.03), mgRail, 0, 0.065, 0.1);
      break;
    }
    case "repo_hammer":
      add(new THREE.BoxGeometry(0.11, 0.13, 0.5), body, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8).rotateX(Math.PI / 2), dark, 0, 0.04, -0.42);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8).rotateX(Math.PI / 2), dark, 0, -0.03, -0.4);
      add(new THREE.BoxGeometry(0.08, 0.05, 0.18), dark, 0, -0.03, -0.25);
      add(new THREE.BoxGeometry(0.07, 0.18, 0.08), body, 0, -0.13, 0.1);
      add(new THREE.BoxGeometry(0.115, 0.015, 0.12), strip, 0, 0.07, -0.05);
      break;
    case "stack_smg":
      add(new THREE.BoxGeometry(0.08, 0.1, 0.3), body, 0, 0, 0);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.16), body, 0, 0.02, -0.22);
      add(new THREE.BoxGeometry(0.05, 0.22, 0.05), dark, 0, -0.16, -0.02);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.06), body, 0, -0.1, 0.1);
      add(new THREE.BoxGeometry(0.085, 0.01, 0.2), strip, 0, 0.055, -0.03);
      add(new THREE.BoxGeometry(0.01, 0.06, 0.01), strip, 0.045, -0.12, -0.02);
      break;
    case "longwave":
      add(new THREE.BoxGeometry(0.1, 0.11, 0.5), body, 0, 0, 0);
      add(new THREE.BoxGeometry(0.05, 0.05, 0.55), dark, 0, 0.02, -0.5);
      for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.05, 0.008, 6, 16), strip, 0, 0.02, -0.32 - i * 0.12);
      add(new THREE.BoxGeometry(0.06, 0.16, 0.07), body, 0, -0.12, 0.1);
      break;
    case "phage":
      add(new THREE.BoxGeometry(0.12, 0.12, 0.34), body, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.065, 0.065, 0.3, 10).rotateX(Math.PI / 2), dark, 0, 0.01, -0.3);
      add(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 10).rotateX(Math.PI / 2), dark, 0, -0.02, 0.05);
      add(new THREE.TorusGeometry(0.07, 0.01, 6, 16), strip, 0, 0.01, -0.44);
      add(new THREE.BoxGeometry(0.06, 0.16, 0.07), body, 0, -0.13, 0.1);
      break;
    case "shock_baton":
      add(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 8).rotateX(Math.PI / 2), dark, 0, -0.02, -0.25);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8).rotateX(Math.PI / 2), body, 0, -0.02, 0.05);
      add(new THREE.BoxGeometry(0.012, 0.012, 0.36), strip, 0.02, -0.005, -0.3);
      add(new THREE.BoxGeometry(0.012, 0.012, 0.36), strip, -0.02, -0.005, -0.3);
      add(new THREE.SphereGeometry(0.03, 8, 8), strip, 0, -0.02, -0.51);
      break;
    case "directive":
      // a long marksman rifle: slab receiver, long barrel, a boxy optic, an amber strip down the rail
      add(new THREE.BoxGeometry(0.09, 0.12, 0.5), body, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8).rotateX(Math.PI / 2), dark, 0, 0.03, -0.52);
      add(new THREE.BoxGeometry(0.05, 0.06, 0.16), dark, 0, 0.1, -0.02);
      add(new THREE.BoxGeometry(0.012, 0.012, 0.44), strip, 0.05, 0.04, -0.2);
      add(new THREE.BoxGeometry(0.06, 0.18, 0.08), body, 0, -0.13, 0.12);
      const optic = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
      bindPlate(optic, "tex_directive_core");
      add(new THREE.BoxGeometry(0.03, 0.03, 0.03), optic, 0, 0.1, -0.11);
      break;
    case "clockeater":
      // a burst pistol: short, wide, three magenta slits across the slide
      add(new THREE.BoxGeometry(0.08, 0.09, 0.26), body, 0, 0, 0);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.12), dark, 0, 0.02, -0.18);
      add(new THREE.BoxGeometry(0.06, 0.15, 0.06), body, 0, -0.11, 0.06);
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.085, 0.01, 0.02), strip, 0, 0.05, -0.08 + i * 0.05);
      break;
  }
  if (mastered) inlay(g, body, strip);
  g.userData.mastered = mastered;
  g.userData.body = body;
  g.position.set(0.28, -0.26, -0.55);
  g.rotation.y = -0.04;
  return g;
}

/** the receiver: the largest part of the body material (a barrel or a grip can share it) */
export function receiverBox(g: THREE.Group, body: THREE.Material): THREE.Box3 {
  let best = new THREE.Box3();
  let vol = -1;
  for (const c of g.children) {
    const m = c as THREE.Mesh;
    if (m.material !== body) continue;
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!.clone().translate(m.position);
    const v = b.getSize(new THREE.Vector3());
    if (v.x * v.y * v.z > vol) {
      vol = v.x * v.y * v.z;
      best = b;
    }
  }
  return best;
}

/** the mastery finish: two inlay lines down each flank of the receiver, merged into the first strip mesh */
function inlay(g: THREE.Group, body: THREE.Material, strip: THREE.Material): void {
  const box = receiverBox(g, body);
  const host = g.children.find((c) => (c as THREE.Mesh).material === strip) as THREE.Mesh | undefined;
  if (box.isEmpty() || !host) return;
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const lines: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const dy of [-0.22, 0.22]) {
      lines.push(new THREE.BoxGeometry(0.004, 0.006, size.z * 0.86).translate(mid.x + sx * (size.x / 2 + 0.002) - host.position.x, mid.y + dy * size.y - host.position.y, mid.z - host.position.z));
    }
  }
  // indexed, like every other part of the gun: the held model merges its parts by material, and
  // three.js will not merge indexed with non-indexed — the whole strip would drop out of the hand
  const merged = mergeGeometries([host.geometry, ...lines], false);
  for (const l of lines) l.dispose();
  if (!merged) return;
  host.geometry.dispose();
  host.geometry = merged;
  host.name = "strip+finish";
}

/** World-space effects: beams, explosions, smoke, EMP rings, projectiles, wasps, mechs. */
export class ArsenalFx {
  private beams: { mesh: THREE.Mesh; born: number; life: number; mat: THREE.MeshBasicMaterial }[] = [];
  private blasts: { mesh: THREE.Mesh; light: THREE.PointLight; born: number; life: number; peak: number; mat: THREE.MeshBasicMaterial; color: THREE.Color }[] = [];
  private clouds = new Map<number, { group: THREE.Group; mats: THREE.MeshBasicMaterial[]; born: number }>();
  private projectiles = new Map<number, THREE.Mesh>();
  private wasps = new Map<number, { group: THREE.Group; rotors: THREE.Mesh[]; light: THREE.PointLight }>();
  private mechs = new Map<number, { group: THREE.Group; head: THREE.Group; spot: THREE.SpotLight; cone: THREE.Mesh; target: THREE.Object3D; legs: THREE.Mesh[]; walk: number; at: { x: number; z: number } }>();
  /** a mech's hip angles, for tests and probes: [left, right] */
  mechLegs(id: number): [number, number] | null {
    const e = this.mechs.get(id);
    return e ? [e.legs[0]!.rotation.x, e.legs[1]!.rotation.x] : null;
  }
  private clock = 0;
  /** one material per projectile kind, shared by every projectile of it */
  private projMats = markSharedAll({
    phage: new THREE.MeshBasicMaterial({ color: PALETTE.violet }),
    sticky: new THREE.MeshBasicMaterial({ color: PALETTE.violet }),
    frag: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.5 }),
    smoke: new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.7 }),
    emp: new THREE.MeshStandardMaterial({ color: 0x142230, emissive: PALETTE.cyan, emissiveIntensity: 0.5 }),
  });
  constructor(private scene: THREE.Scene) {
    bindPlate(this.projMats.frag, "tex_weapon_dark");
    bindPlate(this.projMats.smoke, "tex_weapon_dark");
    bindPlate(this.projMats.emp, "tex_metal");
    bindPlate(this.projMats.phage, "skin_phage_plate");
    bindPlate(this.projMats.sticky, "skin_phage_plate");
  }

  /** live explosion light intensities — the 60 Hz / 144 Hz guard reads these */
  blastLights(): number[] {
    return this.blasts.map((b) => b.light.intensity);
  }

  beam(from: Vec3, to: Vec3, color: number, radius = 0.035, life = 0.45): void {
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    bindPlate(beamMat, "tex_tracer");
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6, 1, true), beamMat);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.scene.add(mesh);
    this.beams.push({ mesh, born: this.clock, life, mat: beamMat });
  }

  explosion(pos: Vec3, radius: number, color: number, big = true): void {
    const c = new THREE.Color(color);
    const blastMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    bindPlate(blastMat, "tex_blast");
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), blastMat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.setScalar(0.2);
    const peak = big ? 120 : 40;
    const light = new THREE.PointLight(color, peak, radius * 4, 1.6);
    light.position.set(pos.x, pos.y + 0.3, pos.z);
    this.scene.add(mesh, light);
    this.blasts.push({ mesh, light, born: this.clock, life: big ? 0.45 : 0.3, peak, mat: blastMat, color: c });
  }

  cloud(id: number, pos: Vec3, radius: number): void {
    if (this.clouds.has(id)) return;
    const group = new THREE.Group();
    const mats: THREE.MeshBasicMaterial[] = [];
    let s = id * 7919 + 13;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0xffffffff);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8a97a8, transparent: true, opacity: 0.0, depthWrite: false });
      bindPlate(mat, "tex_weapon_dark");
      const m = new THREE.Mesh(new THREE.SphereGeometry(radius * (0.35 + rnd() * 0.3), 8, 6), mat);
      const a = rnd() * Math.PI * 2;
      const r = rnd() * radius * 0.6;
      m.position.set(Math.cos(a) * r, 0.4 + rnd() * radius * 0.6, Math.sin(a) * r);
      group.add(m);
      mats.push(mat);
    }
    group.position.set(pos.x, pos.y, pos.z);
    this.scene.add(group);
    this.clouds.set(id, { group, mats, born: this.clock });
  }

  removeCloud(id: number): void {
    const c = this.clouds.get(id);
    if (!c) return;
    release(c.group);
    this.clouds.delete(id);
  }

  syncClouds(list: readonly { id: number; pos: Vec3; radius: number }[]): void {
    const seen = new Set<number>();
    for (const c of list) {
      seen.add(c.id);
      this.cloud(c.id, c.pos, c.radius);
    }
    for (const id of [...this.clouds.keys()]) if (!seen.has(id)) this.removeCloud(id);
  }

  syncProjectiles(list: readonly { id: number; kind: keyof ArsenalFx["projMats"]; pos: Vec3; stuck: boolean }[]): void {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let m = this.projectiles.get(p.id);
      if (!m) {
        const r = p.kind === "phage" || p.kind === "sticky" ? 0.12 : 0.09;
        m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), this.projMats[p.kind]);
        if (p.kind === "phage" || p.kind === "sticky") {
          const l = new THREE.PointLight(PALETTE.violet, 6, 6, 2);
          m.add(l);
        }
        this.scene.add(m);
        this.projectiles.set(p.id, m);
      }
      m.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.stuck) m.scale.setScalar(1 + 0.25 * Math.sin(this.clock * 12));
    }
    for (const [id, m] of this.projectiles) {
      if (!seen.has(id)) {
        release(m);
        this.projectiles.delete(id);
      }
    }
  }

  syncWasps(list: readonly { id: number; pos: Vec3; yaw: number; alive: boolean; state: number }[]): void {
    const seen = new Set<number>();
    for (const w of list) {
      seen.add(w.id);
      let e = this.wasps.get(w.id);
      if (!e) {
        // the Wasp's body, eye and rotors (Stage 668): shared geometry, this drone's own materials
        const group = new THREE.Group();
        const geo = waspGeometry();
        const waspMat = new THREE.MeshStandardMaterial({ color: 0x14120e, roughness: 0.6, metalness: 0.5 });
        bindPlate(waspMat, "tex_wasp_hull");
        group.add(new THREE.Mesh(geo.hull, waspMat));
        const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber });
        bindPlate(eyeMat, "tex_lamp");
        group.add(new THREE.Mesh(geo.eye, eyeMat));
        const rotors: THREE.Mesh[] = [];
        const rotorMat = new THREE.MeshBasicMaterial({ color: 0x2b2618, transparent: true, opacity: 0.55 });
        bindPlate(rotorMat, "tex_wasp_hull");
        for (const [x, y, z] of WASP_ROTORS) {
          const rotor = new THREE.Mesh(geo.rotor, rotorMat);
          rotor.position.set(x, y, z);
          group.add(rotor);
          rotors.push(rotor);
        }
        const light = new THREE.PointLight(PALETTE.amber, 8, 9, 2);
        light.position.set(0, -0.2, -0.2);
        group.add(light);
        this.scene.add(group);
        e = { group, rotors, light };
        this.wasps.set(w.id, e);
      }
      e.group.visible = w.alive;
      e.group.position.set(w.pos.x, w.pos.y + Math.sin(this.clock * 3 + w.id) * 0.08, w.pos.z);
      e.group.rotation.y = w.yaw;
      e.group.rotation.z = Math.sin(this.clock * 2.2 + w.id) * 0.06;
      for (const r of e.rotors) r.rotation.y += 0.9;
      e.light.intensity = w.state === 2 ? 1 : w.state === 1 ? 14 : 8;
      e.light.color.set(w.state === 1 ? 0xff5a2e : PALETTE.amber);
    }
    for (const [id, e] of this.wasps) {
      if (!seen.has(id)) {
        release(e.group);
        this.wasps.delete(id);
      }
    }
  }

  syncMechs(list: readonly { id: number; pos: Vec3; yaw: number; lightYaw: number; alive: boolean; locked: boolean }[]): void {
    const seen = new Set<number>();
    for (const m of list) {
      seen.add(m.id);
      let e = this.mechs.get(m.id);
      if (!e) {
        // the repo mech (Stage 668): a hull, two legs that swing from the hip, the searchlight turret
        const group = new THREE.Group();
        const geo = mechGeometry();
        const hull = new THREE.MeshStandardMaterial({ color: 0x1a1710, roughness: 0.55, metalness: 0.6 });
        bindPlate(hull, "tex_mech_hull");
        group.add(new THREE.Mesh(geo.hull, hull));
        const legs: THREE.Mesh[] = [];
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(geo.leg, hull);
          leg.position.set(s * MECH_HIP.x, MECH_HIP.y, 0);
          leg.name = s < 0 ? "legL" : "legR";
          group.add(leg);
          legs.push(leg);
        }
        const stripMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber });
        bindPlate(stripMat, "tex_lamp");
        group.add(new THREE.Mesh(geo.visor, stripMat));
        const head = new THREE.Group();
        head.position.set(0, MECH_HEAD_Y, 0);
        head.add(new THREE.Mesh(geo.head, hull));
        const lensMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
        bindPlate(lensMat, "tex_lamp");
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), lensMat);
        lens.position.set(0, 0, -0.335);
        lens.rotation.y = Math.PI;
        head.add(lens);
        const spot = new THREE.SpotLight(0xffc46a, 90, 34, 0.22, 0.6, 1.4);
        spot.position.set(0, 0, -0.2);
        const target = new THREE.Object3D();
        target.position.set(0, -1.2, -30);
        head.add(target);
        spot.target = target;
        head.add(spot);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        bindPlate(coneMat, "tex_lamp");
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(6.5, 30, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -15),
          coneMat,
        );
        cone.rotation.x = 0.04;
        head.add(cone);
        group.add(head);
        this.scene.add(group);
        e = { group, head, spot, cone, target, legs, walk: 0, at: { x: m.pos.x, z: m.pos.z } };
        this.mechs.set(m.id, e);
      }
      e.group.visible = m.alive;
      // the walk is driven by ground covered, not by time, so a mech that stops stops mid-stride
      // and one pushed faster strides faster; a jump (a respawn, a teleport) is not a step
      const moved = Math.hypot(m.pos.x - e.at.x, m.pos.z - e.at.z);
      if (moved < 2) e.walk += moved;
      e.at.x = m.pos.x;
      e.at.z = m.pos.z;
      for (const [k, side] of [[0, -1], [1, 1]] as const) {
        const g = mechGait(e.walk, side);
        e.legs[k]!.rotation.x = g.angle;
        e.legs[k]!.position.y = MECH_HIP.y + g.lift;
      }
      e.group.position.set(m.pos.x, m.pos.y + mechBob(e.walk), m.pos.z);
      e.group.rotation.y = m.yaw;
      e.head.rotation.y = m.lightYaw - m.yaw;
      const c = m.locked ? 0xffa050 : 0xffc46a;
      e.spot.color.set(c);
      e.spot.intensity = m.locked ? 130 : 90;
      (e.cone.material as THREE.MeshBasicMaterial).color.set(c);
      (e.cone.material as THREE.MeshBasicMaterial).opacity = m.locked ? 0.09 : 0.045;
    }
    for (const [id, e] of this.mechs) {
      if (!seen.has(id)) {
        release(e.group);
        this.mechs.delete(id);
      }
    }
  }

  update(dt: number): void {
    this.clock += dt;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]!;
      const a = 1 - (this.clock - b.born) / b.life;
      if (a <= 0) {
        release(b.mesh);
        this.beams.splice(i, 1);
      } else {
        b.mat.opacity = a * 0.95;
        b.mesh.scale.x = b.mesh.scale.z = 1 + (1 - a) * 2.5;
      }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i]!;
      const t = (this.clock - b.born) / b.life;
      if (t >= 1) {
        release(b.mesh);
        release(b.light);
        this.blasts.splice(i, 1);
      } else {
        b.mesh.scale.setScalar(0.3 + t * 3.2);
        b.mat.opacity = (1 - t) * 0.9;
        // same clock as the sphere: a per-frame 0.85 made 144 Hz delete the light before 60 Hz did
        b.light.intensity = b.peak * (1 - t);
      }
    }
    for (const c of this.clouds.values()) {
      const age = this.clock - c.born;
      const o = Math.min(0.55, age * 1.2);
      for (const m of c.mats) m.opacity = o;
      c.group.rotation.y += dt * 0.08;
      c.group.scale.setScalar(1 + Math.min(0.4, age * 0.08));
    }
  }
}
