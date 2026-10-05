/**
 * Campaign render pieces: the objective beam, the escort (escort.ts), markers
 * over destroy targets, and the blood-red Kernel filament that corrupts the
 * viewmodel while a Protocol is worn — the visual promise that campaign
 * power can never be mistaken for PvP-legal. Render only.
 */
import * as THREE from "three";
import { MOVE } from "@shared/sim/constants";
import { bindPlate, PALETTE } from "./city";
import { EscortFigures, type EscortPose } from "./escort";

const RED = 0xff1e3c;

function beam(color: number, height = 40, radius = 0.25): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  bindPlate(mat, "tex_lamp");
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8, 1, true), mat);
  m.position.y = height / 2;
  return m;
}

export class CampaignFx {
  readonly group = new THREE.Group();
  private marker: THREE.Group;
  private ring: THREE.Mesh;
  /** Ida, or a wake cell: whoever the contract is walking home (Stage 677) */
  readonly escort: EscortFigures;
  private targets: THREE.Group[] = [];
  private targetPool: THREE.Group[] = [];
  private filament: THREE.Group;
  private filamentMat: THREE.MeshBasicMaterial;
  private filamentOn = false;
  private time = 0;
  /** The district's contest block, drawn on the street that is already there. Not a sim box. */
  private contest: THREE.Group;
  private contestEdges: THREE.Mesh[] = [];
  private contestHot = false;

  constructor(private scene: THREE.Scene, camera: THREE.Camera) {
    scene.add(this.group);
    this.marker = new THREE.Group();
    this.marker.add(beam(PALETTE.cyan));
    const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    bindPlate(ringMat, "tex_lamp");
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.marker.add(this.ring);
    this.marker.visible = false;
    this.group.add(this.marker);
    // the escort: who it is, in their own body, with a name over them in their own colour
    this.escort = new EscortFigures((text, colour) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 48;
      const g = canvas.getContext("2d")!;
      g.font = "bold 26px 'Courier New', monospace";
      g.fillStyle = `#${colour.toString(16).padStart(6, "0")}`;
      g.textBaseline = "middle";
      g.fillText(text, 8, 24);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
      tag.scale.set(1.6, 0.3, 1);
      return tag;
    });
    this.group.add(this.escort.group);
    // the filament: red strands over the weapon, pulsing
    this.filament = new THREE.Group();
    // depthTest is flipped per host in setFilamentHost; depth is never written, because additive
    // strands that write depth punch a hole in whatever is drawn after them
    const fm = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    bindPlate(fm, "tex_lamp");
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
    this.contest = new THREE.Group();
    this.contest.visible = false;
    const lay = (w: number, d: number, x: number, z: number) => {
      const mat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      bindPlate(mat, "tex_lamp");
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      this.contestEdges.push(m);
      this.contest.add(m);
    };
    lay(1, 0.045, 0, 0.5);
    lay(1, 0.045, 0, -0.5);
    lay(0.045, 1, 0.5, 0);
    lay(0.045, 1, -0.5, 0);
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.92),
      new THREE.MeshBasicMaterial({ color: PALETTE.magenta, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.01;
    fill.name = "contest-fill";
    this.contest.add(fill);
    this.group.add(this.contest);
    if (typeof document !== "undefined" && typeof document.createElementNS === "function") {
      const tex = new THREE.TextureLoader().load("/icons/contest-ground.png");
      tex.colorSpace = THREE.SRGBColorSpace;
      (fill.material as THREE.MeshBasicMaterial).map = tex;
      (fill.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    }
  }

  /** Paint the district's contest block on the ground. `half` is metres. Null hides it. */
  setContest(vol: { x: number; z: number; half: number } | null): void {
    this.contest.visible = vol !== null;
    if (!vol) return;
    const span = vol.half * 2;
    this.contest.position.set(vol.x, 0.08, vol.z);
    this.contest.scale.set(span, 1, span);
  }

  /** The painted square's width in metres, or 0 when the block is hidden. */
  contestSpan(): number {
    if (!this.contest.visible) return 0;
    return this.contest.scale.x;
  }

  /** Inside the block the paint runs hot. Outside it stays the street colour. */
  setContestHot(on: boolean): void {
    this.contestHot = on;
    const color = on ? PALETTE.magenta : PALETTE.cyan;
    for (const e of this.contestEdges) (e.material as THREE.MeshBasicMaterial).color.setHex(color);
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

  setEscort(pose: EscortPose | null): void {
    this.escort.set(pose);
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
    this.escort.update(dt);
    if (this.marker.visible) {
      const s = 1 + Math.sin(this.time * 3) * 0.15;
      this.ring.scale.set(s, s, 1);
      this.marker.rotation.y += dt * 0.6;
    }
    if (this.contest.visible) {
      const k = this.contestHot ? 0.55 + Math.sin(this.time * 5) * 0.35 : 0.45;
      for (const e of this.contestEdges) (e.material as THREE.MeshBasicMaterial).opacity = k;
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
