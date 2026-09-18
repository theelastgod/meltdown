/**
 * Campaign render pieces: the objective beam, the escort's figure, markers
 * over destroy targets, and the blood-red Kernel filament that corrupts the
 * viewmodel while a Protocol is worn — the visual promise that campaign
 * power can never be mistaken for PvP-legal. Render only.
 */
import * as THREE from "three";
import { MOVE } from "@shared/sim/constants";
import { PALETTE } from "./city";

const RED = 0xff1e3c;

function beam(color: number, height = 40, radius = 0.25): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.y = height / 2;
  return m;
}

export class CampaignFx {
  readonly group = new THREE.Group();
  private marker: THREE.Group;
  private ring: THREE.Mesh;
  private escort: THREE.Group;
  private escortTag: THREE.Sprite;
  private targets: THREE.Group[] = [];
  private targetPool: THREE.Group[] = [];
  private filament: THREE.Group;
  private filamentMat: THREE.MeshBasicMaterial;
  private filamentOn = false;
  private time = 0;

  constructor(private scene: THREE.Scene, camera: THREE.Camera) {
    scene.add(this.group);
    this.marker = new THREE.Group();
    this.marker.add(beam(PALETTE.cyan));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.marker.add(this.ring);
    this.marker.visible = false;
    this.group.add(this.marker);
    // the escort: an amber figure, a hood, a tag
    this.escort = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: PALETTE.amber, emissiveIntensity: 0.25, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(MOVE.capsuleRadius - 0.02, MOVE.standHeight - MOVE.capsuleRadius * 2, 4, 10), mat);
    body.position.y = MOVE.standHeight / 2;
    this.escort.add(body);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(MOVE.capsuleRadius + 0.06, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x120c04, roughness: 0.9 }));
    hood.position.y = MOVE.standHeight - 0.05;
    this.escort.add(hood);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 48;
    const g = canvas.getContext("2d")!;
    g.font = "bold 26px 'Courier New', monospace";
    g.fillStyle = "#ffb02e";
    g.textBaseline = "middle";
    g.fillText("IDA VESSEL", 8, 24);
    const tex = new THREE.CanvasTexture(canvas);
    this.escortTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    this.escortTag.scale.set(1.6, 0.3, 1);
    this.escortTag.position.y = MOVE.standHeight + 0.4;
    this.escort.add(this.escortTag);
    this.escort.visible = false;
    this.group.add(this.escort);
    // the filament: red strands over the weapon, pulsing
    this.filament = new THREE.Group();
    // depthTest is flipped per host in setFilamentHost; depth is never written, because additive
    // strands that write depth punch a hole in whatever is drawn after them
    const fm = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    this.filamentMat = fm;
    for (let i = 0; i < 5; i++) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(new THREE.Vector3(0.28 + Math.sin(t * 9 + i) * 0.05, -0.26 + Math.cos(t * 7 + i * 1.3) * 0.05, -0.35 - t * 0.55));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.004 + i * 0.001, 5, false), fm);
      this.filament.add(tube);
    }
    const glow = new THREE.PointLight(RED, 0, 3, 2);
    glow.position.set(0.25, -0.2, -0.7);
    this.filament.add(glow);
    this.filament.visible = false;
    camera.add(this.filament);
  }

  /**
   * Hang the Kernel's filament on whatever weapon is being drawn. Its strands were written in the
   * camera's space, over the first-person weapon; in third person that weapon is hidden behind the
   * body and the strands were left hanging in mid-air between the camera and the player (Stage 69).
   */
  setFilamentHost(host: THREE.Object3D, onHand: boolean): void {
    if (this.filament.parent !== host) host.add(this.filament);
    // on the hand the weapon runs down the socket's own -z, so the camera-space offsets come off
    this.filament.position.set(onHand ? -0.28 : 0, onHand ? 0.26 : 0, onHand ? -0.02 : 0);
    // and the strands stop being an overlay. On the camera they are drawn over the first-person
    // weapon and must ignore depth; on the hand they are ordinary world geometry three metres out,
    // and ignoring depth there paints them through the wall between them and the camera (Stage 76).
    this.filamentMat.depthTest = onHand;
  }

  /** what the strands are drawn with, for the check that they stop being an overlay off the camera */
  filamentDepthTest(): boolean {
    return this.filamentMat.depthTest;
  }

  setMarker(pos: { x: number; y: number; z: number } | null): void {
    this.marker.visible = pos !== null;
    if (pos) this.marker.position.set(pos.x, pos.y, pos.z);
  }

  setEscort(pos: { x: number; z: number } | null, waiting: boolean): void {
    this.escort.visible = pos !== null;
    if (pos) this.escort.position.set(pos.x, 0, pos.z);
    (this.escort.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.emissiveIntensity = waiting ? 0.6 : 0.25;
  }

  setTargets(positions: { x: number; y: number; z: number }[]): void {
    while (this.targets.length > positions.length) {
      const t = this.targets.pop()!;
      t.visible = false;
      this.targetPool.push(t);
    }
    while (this.targets.length < positions.length) {
      let t = this.targetPool.pop();
      if (!t) {
        t = new THREE.Group();
        t.add(beam(RED, 14, 0.12));
        this.group.add(t);
      }
      t.visible = true;
      this.targets.push(t);
    }
    positions.forEach((p, i) => this.targets[i]!.position.set(p.x, p.y, p.z));
  }

  get targetCount(): number {
    return this.targets.length;
  }

  setFilament(on: boolean): void {
    this.filamentOn = on;
    this.filament.visible = on;
  }

  get filamentVisible(): boolean {
    return this.filamentOn;
  }

  /** where the filament's strands actually are, for the probe: on the weapon, or hanging in the air */
  filamentAt(): { x: number; y: number; z: number } {
    const v = new THREE.Vector3();
    this.filament.getWorldPosition(v);
    return { x: v.x, y: v.y, z: v.z };
  }

  update(dt: number): void {
    this.time += dt;
    if (this.marker.visible) {
      const s = 1 + Math.sin(this.time * 3) * 0.15;
      this.ring.scale.set(s, s, 1);
      this.marker.rotation.y += dt * 0.6;
    }
    if (this.filamentOn) {
      const k = 0.7 + Math.sin(this.time * 6) * 0.3;
      for (const c of this.filament.children) {
        if (c instanceof THREE.PointLight) c.intensity = 1.2 * k;
        else ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.35 * k;
      }
    }
  }
}
