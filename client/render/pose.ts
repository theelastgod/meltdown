/**
 * The body's pose, as maths (Stage 63): every joint of the hooded silhouette from what the
 * renderer knows about the player — speed, where it is moving, where it aims, the stance the sim
 * put it in, whether it is on the ground, reloading, hit, alive. Pure and three-free, so the rules
 * are unit-tested; rig.ts writes the answers into bones.
 *
 * Everything eases toward its target over about 70 ms except what must not lag: the stride (added
 * on top of the eased base), the weapon socket's pitch (the reticle contract: the socket points
 * where the sim fires, exactly), and the recoil. The sim and the wire are untouched by any of this.
 */
import { addScaled, clamp, dot, len, normalize, scale, sub, v3, wrapAngle, type Vec3 } from "../../shared/math/vec3";

export type Stance = "stand" | "crouch" | "slide" | "mantle";

export interface PoseInput {
  /** horizontal speed, m/s */
  speed: number;
  /** the direction of travel (yaw); the aim's yaw when standing still */
  moveYaw: number;
  yaw: number;
  pitch: number;
  /** vertical velocity, m/s */
  vy: number;
  /** yaw rate, rad/s */
  turnRate: number;
  grounded: boolean;
  stance: Stance;
  /** the capsule's height (stand 1.8, low 1.15) */
  height: number;
  /** 0..1 through a reload, 0 when idle */
  reloading: number;
  ads: 0 | 1;
  /** recoil 0..1, decayed by the caller */
  kick: number;
  alive: boolean;
  stunned: boolean;
  /** seconds */
  clock: number;
  /** the walk phase, advanced by the caller with speed */
  phase: number;
}

/** the eased values between frames: one per body */
export interface PoseState {
  hipsY: number;
  hipsRx: number;
  chestRx: number;
  chestRy: number;
  headRx: number;
  legLRx: number;
  legRRx: number;
  legRy: number;
  legSyL: number;
  legSyR: number;
  stride: number;
  socketX: number;
  socketY: number;
  socketZ: number;
  socketCarry: number;
  flare: number;
  swayX: number;
  swayY: number;
  swayZ: number;
  flap: number;
  lagYaw: number;
  crouch: number;
  adsT: number;
  corpseT: number;
  landT: number;
  wasGrounded: boolean;
  wasAlive: boolean;
}

export interface PoseOut {
  hips: { y: number; rx: number };
  chest: { rx: number; ry: number };
  head: { rx: number };
  legL: { rx: number; ry: number; sy: number };
  legR: { rx: number; ry: number; sy: number };
  /** the weapon socket: position in the body frame; rx is the pitch plus the carry, never eased */
  socket: { x: number; y: number; z: number; rx: number };
  /** where the hands go: socket-local when on the weapon, body-frame otherwise */
  armTargetR: Vec3;
  armTargetL: Vec3;
  armsOnWeapon: boolean;
  /** 0..1: how far the support hand has left the fore-end for the magazine well */
  leftReloadMix: number;
  sway: { x: number; y: number; z: number };
  flap: number;
  phase: number;
  flare: number;
  /** the strip-light's brightness: 1 alive, fading as the file dies */
  trimScale: number;
  visible: boolean;
  state: string;
  speed: number;
  corpseT: number;
}

export const REST: { hipsY: number; socket: { x: number; y: number; z: number } } = { hipsY: 0.95, socket: { x: 0.22, y: 1.32, z: -0.16 } };
/** the pistol grip and the fore-end, socket-local; the magazine well the support hand visits on a reload */
export const GRIP_R = v3(0, -0.12, -0.18);
export const FORE_A = v3(0, -0.07, -0.3);
export const FORE_B = v3(0, -0.07, -0.5);
export const MAG_WELL = v3(0, -0.22, -0.14);
export const CORPSE_SECONDS = 1.2;
/** the leg bone hangs this far under the hips and the boot this far under it (rig.ts's rest table) */
const LEG_UNDER_HIPS = 0.37;
const LEG_LEN = 0.58;
/**
 * The leg angle that rests the boot on the ground, for the hips' height and lean as they are on
 * this frame. Poses that drop the hips and swing a leg out at the same time (a slide, a death)
 * ease the two apart and put the boot through the floor halfway in, whatever their end points are;
 * taking the angle from the hips instead plants the boot at every frame of the blend.
 */
const plantLeg = (hipsY: number, hipsRx: number, sy: number): number => {
  const root = hipsY - LEG_UNDER_HIPS * Math.cos(hipsRx);
  return Math.acos(clamp(root / Math.max(1e-3, LEG_LEN * Math.max(0.05, sy)), -1, 1)) - hipsRx;
};

export function createPoseState(): PoseState {
  return { hipsY: REST.hipsY, hipsRx: 0, chestRx: 0, chestRy: 0, headRx: 0, legLRx: 0, legRRx: 0, legRy: 0, legSyL: 1, legSyR: 1, stride: 0, socketX: REST.socket.x, socketY: REST.socket.y, socketZ: REST.socket.z, socketCarry: 0, flare: 0, swayX: 0, swayY: 0, swayZ: 0, flap: 0, lagYaw: 0, crouch: 0, adsT: 0, corpseT: 0, landT: 0, wasGrounded: true, wasAlive: true };
}

const ease = (cur: number, target: number, rate: number, dt: number): number => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export function poseBody(inp: PoseInput, st: PoseState, rawDt: number): PoseOut {
  const dt = Math.min(rawDt, 1 / 30);
  const K = 14;
  // ---- edges ----
  if (st.wasAlive && !inp.alive) st.corpseT = 1e-6;
  if (!st.wasAlive && inp.alive) {
    Object.assign(st, createPoseState());
    st.lagYaw = inp.yaw;
  }
  st.wasAlive = inp.alive;
  if (!st.wasGrounded && inp.grounded && inp.alive) st.landT = 0.18;
  st.wasGrounded = inp.grounded;
  if (st.corpseT > 0) st.corpseT = Math.min(CORPSE_SECONDS + 1, st.corpseT + dt);
  st.landT = Math.max(0, st.landT - dt);

  // ---- derived ----
  const crouchTarget = clamp((1.8 - inp.height) / 0.65, 0, 1);
  st.crouch = ease(st.crouch, crouchTarget, K, dt);
  const c = st.crouch;
  const s = Math.min(1, inp.speed / 7.2);
  const rel = wrapAngle(inp.moveYaw - inp.yaw);
  st.adsT = ease(st.adsT, inp.ads, 12, dt);

  // targets, in the order the spec evaluates them: later states override earlier ones
  let hipsY = REST.hipsY, hipsRx = 0, chestRx = 0, chestRy = 0, headRx = 0;
  let legRy = 0, legSyL = 1, legSyR = 1, stride = 0;
  let legLBase = 0, legRBase = 0;
  let socketX = REST.socket.x, socketY = REST.socket.y, socketZ = REST.socket.z, carry = 0;
  let swayX = 0, swayY = 0, swayZ = 0, flap = 0, flare = 0;
  let armsOnWeapon = true;
  let armTargetR: Vec3 = GRIP_R;
  let armTargetL: Vec3 = FORE_A;
  let phaseOut = inp.phase;
  let state = "idle";

  const moving = inp.grounded && inp.speed >= 0.5 && inp.stance !== "slide";
  if (inp.grounded && inp.stance === "stand" && inp.speed < 0.5) {
    state = "idle";
    hipsY += 0.006 * Math.sin(1.4 * inp.clock);
    flap = 0.01;
    phaseOut = 0.7 * inp.clock;
    st.lagYaw = inp.yaw + wrapAngle(st.lagYaw - inp.yaw) * Math.exp(-8 * dt);
    legRy = clamp(wrapAngle(st.lagYaw - inp.yaw), -0.6, 0.6);
  }
  if (moving) {
    state = inp.speed > 6 && inp.stance === "stand" ? "sprint" : "walk";
    stride = 0.7 * s * (1 - 0.5 * c);
    // Running directly backwards, +pi and -pi are the same direction and the clamp sends the legs
    // to opposite sides of the body, so a travel angle that dithers around the back swings them
    // across and back. Near the back the legs keep the side they are already on (Stage 65).
    const relLeg = Math.abs(rel) > 2.4 && Math.abs(st.legRy) > 0.05 ? Math.sign(st.legRy) * Math.abs(rel) : rel;
    legRy = clamp(relLeg, -1.2, 1.2);
    st.lagYaw = inp.yaw;
    hipsRx = -Math.min(0.12, inp.speed * 0.015); // forward: negative tilts the top toward -z
    swayX = 0.08 * s * Math.sin(rel) - 0.1 * clamp(inp.turnRate / 8, -1, 1);
    swayZ = 0.08 * s * Math.cos(rel);
    flap = 0.01 + 0.04 * s;
    phaseOut = 2 * inp.phase;
    if (state === "sprint") {
      carry = -0.45;
      socketY -= 0.08;
    }
  }
  if (inp.stance === "crouch" || c > 0.01) {
    if (inp.stance === "crouch") state = moving ? "crouch-walk" : "crouch";
    hipsY -= 0.52 * c;
    chestRx -= 0.95 * c;
    headRx -= 0.45 * c;
    legSyL = legSyR = Math.max(0.1, 1 - 0.9 * c);
    socketY -= 0.52 * c;
    socketZ += 0.06 * c;
  }
  if (inp.stance === "slide") {
    state = "slide";
    hipsY = 0.45;
    hipsRx = 0.35;
    chestRx = -0.55;
    headRx = -0.35;
    // the legs hang from the leaned hips, so their own angle is the pose's less the lean: the lead
    // boot lies flat at 1.45 in the body frame, the tucked one at 1.2
    legRBase = 1.45 - 0.35;
    legSyR = 1;
    legLBase = 1.2 - 0.35;
    legSyL = 0.3;
    legRy = 0;
    stride = 0;
    flare = 0.15;
    swayY = 0.1;
    swayZ = 0.12;
    socketY = 0.95;
    socketZ = -0.14;
  }
  if (!inp.grounded && inp.stance !== "mantle") {
    state = "air";
    legLBase = 0.5;
    legRBase = -0.3;
    legSyL = legSyR = 0.85;
    stride = 0;
    flare = 0.25;
    swayY = clamp(-inp.vy * 0.02, -0.06, 0.16);
  }
  if (inp.stance === "mantle") {
    state = "mantle";
    armsOnWeapon = false;
    armTargetR = v3(0.28, 1.95, -0.45);
    armTargetL = v3(-0.28, 1.95, -0.45);
    legLBase = legRBase = 0.9;
    legSyL = legSyR = 0.85;
    hipsY = 0.85;
    socketX = 0.3;
    socketY = 1.05;
    socketZ = -0.1;
    carry = -0.4;
  }
  // the landing is an impulse, applied after the easing below rather than eased into
  const land = st.landT > 0 ? st.landT / 0.18 : 0;
  // aim: the torso bows with the pitch, the hood follows; the socket takes the pitch exactly
  chestRx += 0.35 * clamp(inp.pitch, -0.9, 0.9);
  headRx += 0.5 * inp.pitch;
  // ADS: the rifle rises to the shoulder line
  headRx -= 0.1 * st.adsT;
  chestRy -= 0.2 * st.adsT;
  socketY += 0.06 * st.adsT;
  socketX -= 0.04 * st.adsT;
  // reload: the muzzle dips and the support hand leaves the fore-end for the well
  const d = Math.sin(Math.PI * clamp(inp.reloading, 0, 1));
  carry -= 0.3 * d;
  const leftReloadMix = d;
  if (inp.stunned) chestRy += 0.05 * Math.sin(25 * inp.clock);

  // death: the file falls back, the strip-light dies with it, the body goes after a moment
  let trimScale = 1;
  let visible = true;
  if (!inp.alive) {
    state = "corpse";
    const u = Math.min(1, st.corpseT / 0.45) ** 2;
    hipsY = REST.hipsY + (0.30 - REST.hipsY) * u;
    hipsRx = 1.35 * u;
    legLBase = 0.15 * u;
    legRBase = 0.55 * u;
    legSyL = legSyR = 1;
    headRx = 0.4 * u;
    chestRx = 0;
    armsOnWeapon = false;
    armTargetR = v3(0.45, 0.3, 0.3);
    armTargetL = v3(-0.45, 0.3, 0.3);
    socketX = 0.25;
    socketY = 0.4;
    socketZ = -0.2;
    carry = -1 - inp.pitch; // rx = pitch + carry = -1
    stride = 0;
    swayX = swayY = swayZ = 0;
    flap = 0;
    trimScale = 1 - 0.8 * u;
    visible = st.corpseT < CORPSE_SECONDS;
  }

  // ---- ease into the state ----
  st.hipsY = ease(st.hipsY, hipsY, K, dt);
  st.hipsRx = ease(st.hipsRx, hipsRx, K, dt);
  st.chestRx = ease(st.chestRx, chestRx, K, dt);
  st.chestRy = ease(st.chestRy, chestRy, K, dt);
  st.headRx = ease(st.headRx, headRx, K, dt);
  st.legLRx = ease(st.legLRx, legLBase, K, dt);
  st.legRRx = ease(st.legRRx, legRBase, K, dt);
  st.legRy = ease(st.legRy, legRy, K, dt);
  st.legSyL = ease(st.legSyL, legSyL, K, dt);
  st.legSyR = ease(st.legSyR, legSyR, K, dt);
  st.stride = ease(st.stride, stride, K, dt);
  st.socketX = ease(st.socketX, socketX, K, dt);
  st.socketY = ease(st.socketY, socketY, K, dt);
  st.socketZ = ease(st.socketZ, socketZ, K, dt);
  st.socketCarry = ease(st.socketCarry, carry, K, dt);
  st.swayX = ease(st.swayX, swayX, 10, dt);
  st.swayY = ease(st.swayY, swayY, 10, dt);
  st.swayZ = ease(st.swayZ, swayZ, 10, dt);
  st.flap = ease(st.flap, flap, 10, dt);
  st.flare = flare > st.flare ? ease(st.flare, flare, 10, dt) : ease(st.flare, flare, 6, dt);

  const stridePhase = Math.sin(inp.phase);
  const legLrx = st.legLRx + st.stride * stridePhase;
  let legRrx = st.legRRx - st.stride * stridePhase;
  const hipsOut = st.hipsY - 0.08 * land;
  // A slide drops the hips half a metre while the lead leg swings out ahead. Eased apart, the two
  // put the boot a hand's width through the floor halfway into the entry, whatever their ends are:
  // the leg's angle is taken from the hips' height instead, so the boot is planted at every point
  // of the blend rather than only at its end.
  let legLrxOut = legLrx;
  if (inp.stance === "slide") legRrx = plantLeg(hipsOut, st.hipsRx, st.legSyR);
  // a file laid down rests on the ground too: both boots are planted and the legs splay about the
  // vertical, which does not lift them (Stage 65 — the left boot used to lie 41 cm under the floor)
  let legRyR = st.legRy;
  let legRyL = st.legRy;
  if (!inp.alive) {
    legRrx = plantLeg(hipsOut, st.hipsRx, st.legSyR);
    legLrxOut = plantLeg(hipsOut, st.hipsRx, st.legSyL);
    legRyR = 0.22;
    legRyL = -0.3;
  }
  // the recoil: unblended, the weapon shoves back and the chest takes it
  const kick = clamp(inp.kick, 0, 1);
  return {
    hips: { y: hipsOut, rx: st.hipsRx },
    chest: { rx: st.chestRx + 0.02 * kick, ry: st.chestRy },
    head: { rx: st.headRx },
    legL: { rx: legLrxOut, ry: legRyL, sy: st.legSyL * (1 - 0.1 * land) },
    legR: { rx: legRrx, ry: legRyR, sy: st.legSyR * (1 - 0.1 * land) },
    socket: { x: st.socketX, y: st.socketY, z: st.socketZ + 0.05 * kick, rx: inp.pitch + st.socketCarry },
    armTargetR,
    armTargetL,
    armsOnWeapon,
    leftReloadMix,
    sway: { x: st.swayX, y: st.swayY, z: st.swayZ },
    flap: st.flap,
    phase: phaseOut,
    flare: st.flare,
    trimScale,
    visible,
    state,
    speed: inp.speed,
    corpseT: st.corpseT,
  };
}

/** The point on the segment AB nearest to P. */
export function nearestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / Math.max(1e-9, dot(ab, ab)), 0, 1);
  return addScaled(a, ab, t);
}

/**
 * Two-bone IK: the elbow for an upper arm of length `a` and a forearm of `b`, from the shoulder S
 * to the target T, bending toward `pole`. A target out of reach is pulled in to 97% of the reach;
 * a target too close is pushed out so the arm never folds through itself.
 */
export function twoBoneIK(S: Vec3, T: Vec3, pole: Vec3, a = 0.28, b = 0.3): { elbow: Vec3; wrist: Vec3; clamped: boolean } {
  const raw = sub(T, S);
  const rawLen = len(raw);
  const d = clamp(rawLen, 0.05, 0.97 * (a + b));
  const dir = rawLen > 1e-9 ? scale(raw, 1 / rawLen) : v3(0, -1, 0);
  const target = addScaled(S, dir, d);
  const poleFlat = sub(pole, scale(dir, dot(pole, dir)));
  const u = len(poleFlat) > 1e-6 ? normalize(poleFlat) : normalize(sub(v3(1, 0, 0), scale(dir, dir.x)));
  const cosS = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const theta = Math.acos(cosS);
  const elbow = addScaled(addScaled(S, dir, a * Math.cos(theta)), u, a * Math.sin(theta));
  const wrist = addScaled(elbow, normalize(sub(target, elbow)), b);
  return { elbow, wrist, clamped: d !== rawLen };
}
