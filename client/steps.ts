/**
 * The footsteps of everyone else (Stage 80).
 *
 * The file has heard its own boots since the first stage and nobody else's: another player could
 * cross the street behind you at seven metres a second in total silence. Stage 74 gave being shot a
 * direction; this is the half that comes before it — the sound that says someone is there at all,
 * and roughly where, while there is still time to turn around.
 *
 * Pure and audio-free so the rule is unit-tested: this decides which steps land this tick and how
 * loud and how far to the side they are, and `audio.ts` makes the noise. The bearing is
 * `hud/damage.ts`'s — one rule for "where is that, relative to where I am looking" across the
 * client. The simulation is untouched: this reads the same positions the bodies are drawn at.
 */
import { bearing } from "./hud/damage";

/** anything that walks: another file, over the wire or in the offline world */
export interface Walker {
  id: number;
  x: number;
  z: number;
  /** ground speed, metres a second */
  speed: number;
  stance: string;
  grounded: boolean;
  alive: boolean;
}

export interface StepCue {
  id: number;
  /** 0..1 */
  gain: number;
  /** −1 hard left, +1 hard right, relative to where the listener is looking */
  pan: number;
  speed: number;
  distance: number;
}

/** past this a step is not worth a voice: the city is louder than a boot at thirty metres */
export const STEP_RANGE = 26;
/** a crouched file is nearly silent — which is what crouching is for */
export const CROUCH_GAIN = 0.3;
/** below this a body is not walking, it is standing still and shuffling */
export const STEP_MIN_SPEED = 0.8;

/** how far a body covers between steps: a crouch is short and quiet, a sprint is long and loud */
export function strideOf(speed: number, stance: string): number {
  return stance === "crouch" ? 1.2 : 1.9 + speed * 0.06;
}

/**
 * The steps that land this tick. `covered` is the caller's own book-keeping — metres walked since
 * each body's last step — and is updated in place, so a body that stops mid-stride does not bank a
 * step and fire it the moment it moves again.
 */
export function stepCues(walkers: readonly Walker[], listener: { x: number; z: number; yaw: number }, covered: Map<number, number>, dt: number): StepCue[] {
  const out: StepCue[] = [];
  const seen = new Set<number>();
  for (const w of walkers) {
    seen.add(w.id);
    const walking = w.alive && w.grounded && w.speed >= STEP_MIN_SPEED && w.stance !== "slide" && w.stance !== "mantle";
    if (!walking) {
      // hold what it had, capped, so stopping and starting does not fire a step immediately
      covered.set(w.id, Math.min(covered.get(w.id) ?? 0, 0.5));
      continue;
    }
    const d = (covered.get(w.id) ?? 0) + w.speed * dt;
    const stride = strideOf(w.speed, w.stance);
    if (d < stride) {
      covered.set(w.id, d);
      continue;
    }
    covered.set(w.id, 0);
    const distance = Math.hypot(w.x - listener.x, w.z - listener.z);
    if (distance >= STEP_RANGE) continue;
    const fall = 1 - distance / STEP_RANGE;
    const gain = fall * fall * (w.stance === "crouch" ? CROUCH_GAIN : 1);
    const b = bearing(w.x, w.z, listener.x, listener.z, listener.yaw);
    out.push({ id: w.id, gain, pan: Math.sin(b), speed: w.speed, distance });
  }
  // a body that left takes its book-keeping with it
  for (const id of [...covered.keys()]) if (!seen.has(id)) covered.delete(id);
  return out;
}
