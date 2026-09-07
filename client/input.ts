import { Btn, withSlot, type InputFrame } from "@shared/sim/input";
import type { TouchControls } from "./touch";

/** Pointer-lock mouse look + keyboard → InputFrame per simulation tick. */
export class InputController {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  private keys = new Set<string>();
  private mouseDown = new Set<number>();
  /** One-shot slot request (1–6), consumed by the next sample. */
  private slotRequest = 0;
  private grenadeTap = false;
  private grenadeNextTap = false;
  private locked = false;
  private canvas: HTMLCanvasElement;
  onLockChange: ((locked: boolean) => void) | null = null;
  onGesture: (() => void) | null = null;
  /**
   * On a touch device the same controller is fed by thumbs instead of a keyboard and a locked
   * pointer (Stage 32). It merges rather than replaces: a tablet with a keyboard attached should
   * get both, and the probe drives touch in a desktop browser.
   */
  touch: TouchControls | null = null;

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
      const m = e.code.match(/^Digit([1-8])$/);
      if (m) this.slotRequest = Number(m[1]);
      if (e.code === "KeyG") this.grenadeTap = true;
      if (e.code === "KeyQ") this.grenadeNextTap = true;
      if (["Space", "Tab", "ControlLeft", "KeyR", "KeyQ"].includes(e.code)) e.preventDefault();
    });
    document.addEventListener("wheel", (e) => {
      if (!this.locked) return;
      this.slotRequest = ((this.currentSlot - 1 + (e.deltaY > 0 ? 1 : 7)) % 8) + 1;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown.clear();
    });
  }

  /**
   * Is the game taking input? Pointer lock is the desktop answer and does not exist on a phone, so
   * a touch session counts as engaged from the first thumb down.
   */
  get isLocked(): boolean {
    return this.locked || !!this.touch?.engaged;
  }

  /** Mirrors the player's current slot so the wheel can cycle relative to it. */
  currentSlot = 1;

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
    if (this.grenadeTap || k.has("KeyG")) b |= Btn.Grenade;
    if (this.grenadeNextTap) b |= Btn.GrenadeNext;
    this.grenadeTap = false;
    this.grenadeNextTap = false;
    let slot = this.slotRequest;
    this.slotRequest = 0;
    if (this.touch) {
      const t = this.touch.take();
      b |= t.buttons;
      this.yaw += t.yaw;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch + t.pitch));
      if (t.slot) slot = t.slot;
    }
    if (slot) b = withSlot(b, slot);
    return { tick, buttons: b, yaw: this.yaw, pitch: this.pitch };
  }
}
