import { Btn, type InputFrame } from "@shared/sim/input";

/** Pointer-lock mouse look + keyboard → InputFrame per simulation tick. */
export class InputController {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  private keys = new Set<string>();
  private mouseDown = new Set<number>();
  private locked = false;
  private canvas: HTMLCanvasElement;
  onLockChange: ((locked: boolean) => void) | null = null;
  onGesture: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("click", () => {
      this.onGesture?.();
      if (!this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.keys.clear();
        this.mouseDown.clear();
      }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    });
    document.addEventListener("mousedown", (e) => {
      if (this.locked) this.mouseDown.add(e.button);
    });
    document.addEventListener("mouseup", (e) => this.mouseDown.delete(e.button));
    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (["Space", "Tab", "ControlLeft", "KeyR"].includes(e.code)) e.preventDefault();
    });
    document.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown.clear();
    });
  }

  get isLocked(): boolean {
    return this.locked;
  }

  sample(tick: number): InputFrame {
    let b = 0;
    const k = this.keys;
    if (k.has("KeyW") || k.has("ArrowUp")) b |= Btn.Forward;
    if (k.has("KeyS") || k.has("ArrowDown")) b |= Btn.Back;
    if (k.has("KeyA") || k.has("ArrowLeft")) b |= Btn.Left;
    if (k.has("KeyD") || k.has("ArrowRight")) b |= Btn.Right;
    if (k.has("Space")) b |= Btn.Jump;
    if (k.has("ShiftLeft") || k.has("ShiftRight")) b |= Btn.Sprint;
    if (k.has("ControlLeft") || k.has("KeyC")) b |= Btn.Crouch;
    if (k.has("KeyR")) b |= Btn.Reload;
    if (this.mouseDown.has(0)) b |= Btn.Fire;
    if (this.mouseDown.has(2)) b |= Btn.Alt;
    return { tick, buttons: b, yaw: this.yaw, pitch: this.pitch };
  }
}
