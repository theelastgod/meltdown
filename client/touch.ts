/**
 * Touch controls (Stage 32).
 *
 * A phone has no pointer lock, no keyboard and no mouse, so before this the game was not merely
 * awkward on one — it was unplayable: there was no way to move or to aim.
 *
 * The layout is the one a thumb-driven shooter converges on for good reasons. The left thumb owns a
 * floating stick that appears wherever it lands, so it never has to find a fixed spot it cannot see;
 * the right thumb owns look-by-drag anywhere in its half, so aiming is never confined to a pad. The
 * action buttons sit under the right thumb's arc, and the two that are held rather than tapped —
 * fire and aim — are the ones nearest it.
 *
 * **The stick is digital, deliberately.** `InputFrame` is a button bitfield, and the sim is a
 * deterministic function of those bits shared by client and server. Giving touch an analog axis
 * would mean a mobile player moved at speeds a desktop player cannot reach, in a game whose PvP
 * pays $CAPITAL. So a thumb pushes the same eight directions a keyboard does, and pushing past the
 * ring is the sprint key. Mobile gets a different *input device*, not a different *sim*.
 *
 * Nothing here touches the sim. It produces the same `InputFrame` the keyboard does.
 */
import { Btn } from "@shared/sim/input";

/** Radius the stick travels before it is at full deflection, in CSS pixels. */
const STICK_RADIUS = 46;
/** Fraction of the radius below which the stick reads as centred. */
const DEADZONE = 0.22;
/** Push past this fraction of the radius and the Blank sprints. */
const SPRINT_AT = 0.82;

export interface TouchState {
  /** button bits held this frame */
  buttons: number;
  /** look delta accumulated since the last read, in radians */
  yaw: number;
  pitch: number;
  /** one-shot weapon slot request, 0 for none */
  slot: number;
}

/**
 * Is this a device that wants touch controls?
 *
 * `?touch=1` forces them on and `?touch=0` off — the probe needs to drive them in a desktop
 * browser, and a laptop with a touchscreen should not lose its mouse to a stray coarse pointer.
 */
export function wantsTouch(search = location.search): boolean {
  const q = new URLSearchParams(search).get("touch");
  if (q === "1") return true;
  if (q === "0") return false;
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && (navigator.maxTouchPoints ?? 0) > 0;
}

interface Held {
  /** the pointer that is driving this control */
  id: number;
}

interface Pad {
  el: HTMLElement;
  /** bits held while the pad is down */
  bits: number;
  /** bits emitted for exactly one frame on press */
  tap: number;
  /** slot cycle request on press */
  cycle?: boolean;
  held: Held | null;
}

export class TouchControls {
  readonly root: HTMLElement;
  private stick: { id: number; ox: number; oy: number; dx: number; dy: number } | null = null;
  private look: { id: number; x: number; y: number } | null = null;
  private pads: Pad[] = [];
  private yawAcc = 0;
  private pitchAcc = 0;
  private tapBits = 0;
  private slotReq = 0;
  private knob: HTMLElement;
  private ring: HTMLElement;
  /** radians per CSS pixel of drag, before the player's sensitivity multiplier */
  lookScale = 0.0032;
  sensitivity = 1;
  /** mirrors the player's slot so the cycle button can step relative to it */
  currentSlot = 1;
  onGesture: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    // Not "tc": the campaign terminal already owns `.tc` for its choice list, inside the same #hud
    // subtree, and `#hud .tc { position: absolute; inset: 0 }` was landing on it too (Stage 33).
    this.root.className = "touch";
    this.root.innerHTML = `
      <div class="tc-stick"><i class="tc-ring"></i><i class="tc-knob"></i></div>
      <div class="tc-pads">
        <button class="tc-b tc-fire" data-b="fire">FIRE</button>
        <button class="tc-b tc-alt" data-b="alt">ALT</button>
        <button class="tc-b tc-jump" data-b="jump">JUMP</button>
        <button class="tc-b tc-crouch" data-b="crouch">SLIDE</button>
        <button class="tc-b tc-reload" data-b="reload">RLD</button>
        <button class="tc-b tc-nade" data-b="nade">NADE</button>
        <button class="tc-b tc-slot" data-b="slot">WPN</button>
      </div>`;
    host.appendChild(this.root);
    this.ring = this.root.querySelector(".tc-ring")!;
    this.knob = this.root.querySelector(".tc-knob")!;

    const spec: Record<string, { bits?: number; tap?: number; cycle?: boolean }> = {
      fire: { bits: Btn.Fire },
      alt: { bits: Btn.Alt },
      crouch: { bits: Btn.Crouch },
      jump: { tap: Btn.Jump },
      reload: { tap: Btn.Reload },
      nade: { tap: Btn.Grenade },
      slot: { cycle: true },
    };
    for (const el of [...this.root.querySelectorAll<HTMLElement>(".tc-b")]) {
      const s = spec[el.dataset.b!]!;
      this.pads.push({ el, bits: s.bits ?? 0, tap: s.tap ?? 0, cycle: s.cycle, held: null });
    }

    // One listener set on the window: a finger that starts on a button and slides off must keep
    // working, and a finger lifted outside the element must still release. Per-element handlers
    // lose both.
    window.addEventListener("pointerdown", this.down, { passive: false });
    window.addEventListener("pointermove", this.move, { passive: false });
    window.addEventListener("pointerup", this.up, { passive: true });
    window.addEventListener("pointercancel", this.up, { passive: true });
  }

  destroy(): void {
    window.removeEventListener("pointerdown", this.down);
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.up);
    window.removeEventListener("pointercancel", this.up);
    this.root.remove();
  }

  /** True once any control has been touched, so the game can treat the session as engaged. */
  engaged = false;

  private padAt(x: number, y: number): Pad | null {
    for (const p of this.pads) {
      const r = p.el.getBoundingClientRect();
      // a generous hit box: thumbs are not precise and the visual button is the small part of it
      if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8) return p;
    }
    return null;
  }

  private down = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && !this.root.classList.contains("forced")) return;
    const pad = this.padAt(e.clientX, e.clientY);
    if (pad) {
      if (pad.held) return;
      pad.held = { id: e.pointerId };
      pad.el.classList.add("on");
      this.tapBits |= pad.tap;
      if (pad.cycle) this.slotReq = (this.currentSlot % 8) + 1;
      this.engage(e);
      return;
    }
    if (e.clientX < innerWidth / 2) {
      if (this.stick) return;
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      this.placeStick(e.clientX, e.clientY);
      this.root.classList.add("stick-on");
    } else {
      if (this.look) return;
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    this.engage(e);
  };

  private engage(e: PointerEvent): void {
    e.preventDefault();
    if (!this.engaged) {
      this.engaged = true;
      this.onGesture?.();
    }
  }

  private move = (e: PointerEvent): void => {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.dx = e.clientX - this.stick.ox;
      this.stick.dy = e.clientY - this.stick.oy;
      const d = Math.hypot(this.stick.dx, this.stick.dy);
      if (d > STICK_RADIUS) {
        // the stick follows a thumb that travels: the origin slides so full deflection is kept
        const k = (d - STICK_RADIUS) / d;
        this.stick.ox += this.stick.dx * k;
        this.stick.oy += this.stick.dy * k;
        this.stick.dx -= this.stick.dx * k;
        this.stick.dy -= this.stick.dy * k;
        this.placeStick(this.stick.ox, this.stick.oy);
      }
      this.knob.style.transform = `translate(calc(-50% + ${this.stick.dx}px), calc(-50% + ${this.stick.dy}px))`;
      e.preventDefault();
      return;
    }
    if (this.look && e.pointerId === this.look.id) {
      const s = this.lookScale * this.sensitivity;
      this.yawAcc -= (e.clientX - this.look.x) * s;
      this.pitchAcc -= (e.clientY - this.look.y) * s;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
      e.preventDefault();
    }
  };

  private up = (e: PointerEvent): void => {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.root.classList.remove("stick-on");
      this.knob.style.transform = "translate(-50%, -50%)";
    }
    if (this.look && e.pointerId === this.look.id) this.look = null;
    for (const p of this.pads) {
      if (p.held && p.held.id === e.pointerId) {
        p.held = null;
        p.el.classList.remove("on");
      }
    }
  };

  private placeStick(x: number, y: number): void {
    this.ring.style.left = `${x}px`;
    this.ring.style.top = `${y}px`;
    this.knob.style.left = `${x}px`;
    this.knob.style.top = `${y}px`;
  }

  /** Read and clear the accumulated look and one-shot taps. */
  take(): TouchState {
    let buttons = this.tapBits;
    this.tapBits = 0;
    for (const p of this.pads) if (p.held) buttons |= p.bits;
    if (this.stick) {
      const d = Math.hypot(this.stick.dx, this.stick.dy) / STICK_RADIUS;
      if (d > DEADZONE) {
        // eight-way, the same set a keyboard can produce: a diagonal is two bits, never a
        // fractional speed the sim has no way to express
        const a = Math.atan2(-this.stick.dy, this.stick.dx); // screen y grows downward
        const oct = Math.round((a / Math.PI) * 4);
        if (oct === 0 || oct === 1 || oct === -1) buttons |= Btn.Right;
        if (oct === 2 || oct === 1 || oct === 3) buttons |= Btn.Forward;
        if (oct === 4 || oct === -4 || oct === 3 || oct === -3) buttons |= Btn.Left;
        if (oct === -2 || oct === -1 || oct === -3) buttons |= Btn.Back;
        if (d > SPRINT_AT) buttons |= Btn.Sprint;
      }
    }
    const out: TouchState = { buttons, yaw: this.yawAcc, pitch: this.pitchAcc, slot: this.slotReq };
    this.yawAcc = 0;
    this.pitchAcc = 0;
    this.slotReq = 0;
    return out;
  }
}
