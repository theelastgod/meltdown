/**
 * THE RUN's visuals: claims as amber octahedra hovering and turning over the street (a dropped
 * one burns magenta), safe zones as a cyan ring on the ground with a slow column of light and a
 * label. Render only; the sim owns the truth.
 */
import * as THREE from "three";
import { PALETTE } from "./city";

export interface RunClaimView {
  id: number;
  x: number;
  y: number;
  z: number;
  value: number;
  dropped: boolean;
}
export interface RunZoneView {
  label: string;
  x: number;
  z: number;
  radius: number;
}

export class RunFx {
  private claims = new Map<number, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; light: THREE.PointLight; value: number; dropped: boolean }>();
  private zones: { group: THREE.Group; ring: THREE.Mesh; column: THREE.Mesh; colMat: THREE.MeshBasicMaterial }[] = [];
  private zoneKey = "";
  private clock = 0;
  private geo = new THREE.OctahedronGeometry(0.28, 0);

  constructor(private scene: THREE.Scene) {}

  private labelSprite(text: string): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 48;
    const g = c.getContext("2d")!;
    g.font = "bold 28px Courier New, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffffff";
    g.fillText(text, 128, 26);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: PALETTE.cyan }));
    s.scale.set(5, 0.95, 1);
    return s;
  }

  syncZones(views: readonly RunZoneView[]): void {
    const key = views.map((z) => `${z.label}:${z.x}:${z.z}:${z.radius}`).join("|");
    if (key === this.zoneKey) return;
    this.zoneKey = key;
    for (const z of this.zones) this.scene.remove(z.group);
    this.zones = [];
    for (const z of views) {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.radius - 0.35, z.radius, 48), new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      group.add(ring);
      const colMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
      const column = new THREE.Mesh(new THREE.CylinderGeometry(z.radius, z.radius, 9, 32, 1, true), colMat);
      column.position.y = 4.5;
      group.add(column);
      const label = this.labelSprite(`SAFE · ${z.label}`);
      label.position.y = 3.2;
      group.add(label);
      group.position.set(z.x, 0, z.z);
      this.scene.add(group);
      this.zones.push({ group, ring, column, colMat });
    }
  }

  syncClaims(views: readonly RunClaimView[]): void {
    const seen = new Set<number>();
    for (const v of views) {
      seen.add(v.id);
      let e = this.claims.get(v.id);
      if (!e) {
        const mat = new THREE.MeshBasicMaterial({ color: v.dropped ? PALETTE.magenta : PALETTE.amber });
        const mesh = new THREE.Mesh(this.geo, mat);
        const light = new THREE.PointLight(v.dropped ? PALETTE.magenta : PALETTE.amber, 0.9, 5, 2);
        mesh.add(light);
        this.scene.add(mesh);
        e = { mesh, mat, light, value: v.value, dropped: v.dropped };
        this.claims.set(v.id, e);
      }
      e.value = v.value;
      const scale = 0.8 + Math.min(4, v.value) * 0.18;
      e.mesh.scale.setScalar(scale);
      e.mesh.position.set(v.x, v.y + 1.0, v.z);
    }
    for (const [id, e] of this.claims) {
      if (seen.has(id)) continue;
      this.scene.remove(e.mesh);
      this.claims.delete(id);
    }
  }

  update(dt: number): void {
    this.clock += dt;
    for (const e of this.claims.values()) {
      e.mesh.rotation.y += dt * 1.6;
      e.mesh.position.y += Math.sin(this.clock * 2.2 + e.mesh.position.x) * dt * 0.12;
      e.light.intensity = 0.7 + 0.3 * Math.sin(this.clock * 3 + e.mesh.position.z);
    }
    for (const z of this.zones) z.colMat.opacity = 0.05 + 0.03 * Math.sin(this.clock * 0.8);
  }

  get count(): number {
    return this.claims.size;
  }
}
