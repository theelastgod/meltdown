import * as THREE from "three";
import { markSharedAll, release } from "./dispose";
import { WEAPON_LIST, type WeaponId } from "@shared/weapons/manifest";
import { PALETTE } from "./city";
import type { Vec3 } from "@shared/math/vec3";

/** Distinct kitbash silhouettes per weapon. Cheap boxes; the strip colour is the read. */
export function buildViewmodel(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.5, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0f15, roughness: 0.7, metalness: 0.3 });
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
    case "lease_breaker":
      add(new THREE.BoxGeometry(0.09, 0.12, 0.42), body, 0, 0, 0);
      add(new THREE.BoxGeometry(0.035, 0.035, 0.36), body, 0, 0.03, -0.36);
      add(new THREE.BoxGeometry(0.06, 0.16, 0.07), body, 0, -0.12, 0.08);
      add(new THREE.BoxGeometry(0.012, 0.012, 0.3), strip, 0.05, 0.03, -0.1);
      add(new THREE.BoxGeometry(0.1, 0.008, 0.03), new THREE.MeshBasicMaterial({ color: PALETTE.magenta }), 0, 0.065, 0.1);
      break;
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
      add(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xff2a3a }), 0, 0.1, -0.11);
      break;
    case "clockeater":
      // a burst pistol: short, wide, three magenta slits across the slide
      add(new THREE.BoxGeometry(0.08, 0.09, 0.26), body, 0, 0, 0);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.12), dark, 0, 0.02, -0.18);
      add(new THREE.BoxGeometry(0.06, 0.15, 0.06), body, 0, -0.11, 0.06);
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.085, 0.01, 0.02), strip, 0, 0.05, -0.08 + i * 0.05);
      break;
  }
  g.position.set(0.28, -0.26, -0.55);
  g.rotation.y = -0.04;
  return g;
}

/** World-space effects: beams, explosions, smoke, EMP rings, projectiles, wasps, mechs. */
export class ArsenalFx {
  private beams: { mesh: THREE.Mesh; born: number; life: number; mat: THREE.MeshBasicMaterial }[] = [];
  private blasts: { mesh: THREE.Mesh; light: THREE.PointLight; born: number; life: number; mat: THREE.MeshBasicMaterial; color: THREE.Color }[] = [];
  private clouds = new Map<number, { group: THREE.Group; mats: THREE.MeshBasicMaterial[]; born: number }>();
  private projectiles = new Map<number, THREE.Mesh>();
  private wasps = new Map<number, { group: THREE.Group; rotors: THREE.Mesh[]; light: THREE.PointLight }>();
  private mechs = new Map<number, { group: THREE.Group; head: THREE.Group; spot: THREE.SpotLight; cone: THREE.Mesh; target: THREE.Object3D }>();
  private clock = 0;
  /** one material per projectile kind, shared by every projectile of it */
  private projMats = markSharedAll({
    phage: new THREE.MeshBasicMaterial({ color: PALETTE.violet }),
    sticky: new THREE.MeshBasicMaterial({ color: PALETTE.violet }),
    frag: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.5 }),
    smoke: new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.7 }),
    emp: new THREE.MeshStandardMaterial({ color: 0x142230, emissive: PALETTE.cyan, emissiveIntensity: 0.5 }),
  });

  constructor(private scene: THREE.Scene) {}

  beam(from: Vec3, to: Vec3, color: number, radius = 0.035, life = 0.45): void {
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6, 1, true), mat);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.scene.add(mesh);
    this.beams.push({ mesh, born: this.clock, life, mat });
  }

  explosion(pos: Vec3, radius: number, color: number, big = true): void {
    const c = new THREE.Color(color);
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.setScalar(0.2);
    const light = new THREE.PointLight(color, big ? 120 : 40, radius * 4, 1.6);
    light.position.set(pos.x, pos.y + 0.3, pos.z);
    this.scene.add(mesh, light);
    this.blasts.push({ mesh, light, born: this.clock, life: big ? 0.45 : 0.3, mat, color: c });
  }

  cloud(id: number, pos: Vec3, radius: number): void {
    if (this.clouds.has(id)) return;
    const group = new THREE.Group();
    const mats: THREE.MeshBasicMaterial[] = [];
    let s = id * 7919 + 13;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0xffffffff);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8a97a8, transparent: true, opacity: 0.0, depthWrite: false });
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
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), new THREE.MeshStandardMaterial({ color: 0x14120e, roughness: 0.6, metalness: 0.5 }));
        group.add(body);
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
        eye.position.set(0, 0, -0.36);
        group.add(eye);
        const rotors: THREE.Mesh[] = [];
        for (const [x, z] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x1a1812 }));
          arm.position.set(x!, 0.08, z!);
          group.add(arm);
          const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.01, 8), new THREE.MeshBasicMaterial({ color: 0x2b2618, transparent: true, opacity: 0.55 }));
          rotor.position.set(x!, 0.12, z!);
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
        const group = new THREE.Group();
        const hull = new THREE.MeshStandardMaterial({ color: 0x1a1710, roughness: 0.55, metalness: 0.6 });
        const torso = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 1.4), hull);
        torso.position.y = 2.2;
        group.add(torso);
        for (const s of [-0.7, 0.7]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.6), hull);
          leg.position.set(s, 0.75, 0);
          group.add(leg);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 1.0), hull);
          foot.position.set(s, 0.1, 0.1);
          group.add(foot);
        }
        const strip = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
        strip.position.set(0, 2.95, -0.7);
        group.add(strip);
        const head = new THREE.Group();
        head.position.set(0, 3.2, 0);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), hull);
        head.add(lamp);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
        lens.position.set(0, 0, -0.26);
        head.add(lens);
        const spot = new THREE.SpotLight(0xffc46a, 90, 34, 0.22, 0.6, 1.4);
        spot.position.set(0, 0, -0.2);
        const target = new THREE.Object3D();
        target.position.set(0, -1.2, -30);
        head.add(target);
        spot.target = target;
        head.add(spot);
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(6.5, 30, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -15),
          new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        cone.rotation.x = 0.04;
        head.add(cone);
        group.add(head);
        this.scene.add(group);
        e = { group, head, spot, cone, target };
        this.mechs.set(m.id, e);
      }
      e.group.visible = m.alive;
      e.group.position.set(m.pos.x, m.pos.y, m.pos.z);
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
        b.light.intensity *= 0.85;
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
