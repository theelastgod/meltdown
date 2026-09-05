import * as THREE from "three";
import { PALETTE } from "./city";
import type { Vec3 } from "@shared/math/vec3";
import { WAKE } from "@shared/sim/wake";

export interface NodeView {
  id: number;
  label: string;
  pos: Vec3;
  owner: number;
  hold: number;
  contested: boolean;
  puller: number;
  boost: boolean;
  links: number[];
}

const VIOLET = new THREE.Color(PALETTE.violet);
const GREEN = new THREE.Color(PALETTE.green);
const TEAM2 = new THREE.Color(PALETTE.cyan);

/**
 * Hex city nodes on the floor: a hex ring of neon, a fill that lerps violet →
 * green with the hold, a light column, and link lines along the district
 * graph. Flipping a node fires the same ring VFX the campaign uses to
 * liberate a district.
 */
export class WakeFx {
  private nodes = new Map<number, { group: THREE.Group; ring: THREE.Mesh; fill: THREE.Mesh; fillMat: THREE.MeshBasicMaterial; ringMat: THREE.MeshBasicMaterial; light: THREE.PointLight; column: THREE.Mesh; colMat: THREE.MeshBasicMaterial; label: THREE.Sprite }>();
  private links: THREE.LineSegments | null = null;
  private pulses: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; born: number }[] = [];
  private clock = 0;

  constructor(private scene: THREE.Scene) {}

  private hexShape(r: number, inner: number): THREE.ShapeGeometry {
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    if (inner > 0) {
      const hole = new THREE.Path();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const x = Math.cos(a) * inner;
        const y = Math.sin(a) * inner;
        if (i === 0) hole.moveTo(x, y);
        else hole.lineTo(x, y);
      }
      hole.closePath();
      shape.holes.push(hole);
    }
    return new THREE.ShapeGeometry(shape);
  }

  private labelSprite(text: string): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(0,0,0,0)";
    g.fillRect(0, 0, 64, 64);
    g.font = "bold 44px Courier New, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffffff";
    g.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: PALETTE.violet }));
    s.scale.set(1.6, 1.6, 1);
    return s;
  }

  sync(views: readonly NodeView[]): void {
    for (const v of views) {
      let e = this.nodes.get(v.id);
      if (!e) {
        const group = new THREE.Group();
        const ringMat = new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(this.hexShape(WAKE.nodeRadius, WAKE.nodeRadius - 0.18), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        const fillMat = new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
        const fill = new THREE.Mesh(this.hexShape(WAKE.nodeRadius - 0.25, 0), fillMat);
        fill.rotation.x = -Math.PI / 2;
        fill.position.y = 0.02;
        const colMat = new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 12, 12, 1, true), colMat);
        column.position.y = 7;
        // no per-node point light: every point light multiplies shader cost on every lit surface; the pad reads by emissives
        const light = new THREE.PointLight(PALETTE.violet, 0, 0.1, 2);
        light.visible = false;
        light.position.y = 2.2;
        const label = this.labelSprite(v.label);
        label.position.y = 3.2;
        group.add(ring, fill, column, light, label);
        group.position.set(v.pos.x, v.pos.y, v.pos.z);
        this.scene.add(group);
        e = { group, ring, fill, fillMat, ringMat, light, column, colMat, label };
        this.nodes.set(v.id, e);
      }
      const ownerColor = v.owner === 0 ? VIOLET : v.owner === 1 ? GREEN : TEAM2;
      const pullerColor = v.puller === 1 ? GREEN : v.puller === 2 ? TEAM2 : VIOLET;
      // fill lerps from owner colour toward the puller's colour as hold drains
      const c = ownerColor.clone().lerp(pullerColor, v.puller && v.puller !== v.owner ? 1 - v.hold : 0);
      e.fillMat.color.copy(c);
      e.ringMat.color.copy(v.contested ? new THREE.Color(PALETTE.amber) : ownerColor);
      e.colMat.color.copy(c);
      e.light.color.copy(c);
      (e.label.material as THREE.SpriteMaterial).color.copy(ownerColor);
      const pulse = v.contested ? 0.5 + 0.5 * Math.sin(this.clock * 10) : v.puller ? 0.6 + 0.4 * Math.sin(this.clock * 4) : 1;
      e.ringMat.opacity = 0.5 + 0.45 * pulse;
      e.fillMat.opacity = 0.04 + 0.08 * (1 - v.hold) + (v.boost ? 0.06 : 0);
      e.colMat.opacity = 0.02 + 0.03 * pulse + (v.boost ? 0.05 : 0);
      void pulse;
      e.label.position.y = 3.2 + Math.sin(this.clock * 1.5) * 0.15;
    }
    if (!this.links && views.length) {
      const pts: THREE.Vector3[] = [];
      for (const v of views) for (const l of v.links) {
        const o = views.find((x) => x.id === l);
        if (o && o.id > v.id) pts.push(new THREE.Vector3(v.pos.x, v.pos.y + 0.06, v.pos.z), new THREE.Vector3(o.pos.x, o.pos.y + 0.06, o.pos.z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.links = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: PALETTE.violet, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.45 }));
      this.links.computeLineDistances();
      this.scene.add(this.links);
    }
  }

  /** The liberation ring: expands from the node and fades. */
  flip(pos: Vec3, team: number): void {
    const color = team === 1 ? PALETTE.green : team === 2 ? PALETTE.cyan : PALETTE.violet;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 6, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.PI / 6;
    mesh.position.set(pos.x, pos.y + 0.08, pos.z);
    this.scene.add(mesh);
    this.pulses.push({ mesh, mat, born: this.clock });
  }

  update(dt: number): void {
    this.clock += dt;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]!;
      const t = (this.clock - p.born) / 1.4;
      if (t >= 1) {
        this.scene.remove(p.mesh);
        this.pulses.splice(i, 1);
      } else {
        p.mesh.scale.setScalar(1 + t * 22);
        p.mat.opacity = (1 - t) * 0.9;
      }
    }
  }
}
