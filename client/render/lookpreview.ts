/**
 * The CHARACTER page's turntable (Stage 689): the Blank in the look being built, turning slowly on
 * black under a cyan key and a magenta rim, in its own small WebGL canvas so the page does not need
 * the city behind it. The body is the game's own rig, cut by the same code every player's body is.
 */
import * as THREE from "three";
import { buildRig, disposeRig, setRigLook, type Rig } from "./rig";
import { PALETTE } from "./city";

export class LookPreview {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private rig: Rig;
  private raf = 0;
  private yaw = 2.6;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement, look: number) {
    this.rig = buildRig(null, look);
    this.rig.trim.color.set(PALETTE.cyan);
    this.scene.add(this.rig.group);
    this.scene.add(new THREE.HemisphereLight(0x35f2ff, 0x000000, 0.35));
    const key = new THREE.DirectionalLight(0x35f2ff, 1.6);
    key.position.set(-2, 3, -3);
    const rim = new THREE.DirectionalLight(0xff3ec9, 2.2);
    rim.position.set(2.5, 2, 3);
    this.scene.add(key, rim);
    this.camera.position.set(0, 1.05, -4.1);
    this.camera.lookAt(0, 0.92, 0);
  }

  /** the look shown: recut in place, the turn keeps going */
  set(look: number): void {
    setRigLook(this.rig, look);
  }

  /** the look the turntable is wearing, for the probe */
  get look(): number {
    return this.rig.look;
  }

  start(): void {
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
      } catch {
        return;
      }
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    }
    const frame = (t: number): void => {
      const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
      this.last = t;
      this.yaw += dt * 0.6;
      this.rig.group.rotation.y = this.yaw;
      const w = this.canvas.clientWidth || this.canvas.width;
      const h = this.canvas.clientHeight || this.canvas.height;
      this.renderer!.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer!.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }

  dispose(): void {
    this.stop();
    disposeRig(this.rig);
    this.renderer?.dispose();
    this.renderer = null;
  }
}
