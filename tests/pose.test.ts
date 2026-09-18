/**
 * The silhouette's pose (Stage 63): the state machine and the arm IK, off the renderer.
 */
import { describe, expect, it } from "vitest";
import { CORPSE_SECONDS, createPoseState, GRIP_R, nearestOnSegment, poseBody, REST, twoBoneIK, type PoseInput } from "../client/render/pose";
import { dist, len, sub, v3 } from "../shared/math/vec3";

const base = (over: Partial<PoseInput> = {}): PoseInput => ({ speed: 0, moveYaw: 0, yaw: 0, pitch: 0, vy: 0, turnRate: 0, grounded: true, stance: "stand", height: 1.8, reloading: 0, ads: 0, kick: 0, swap: 0, charge: 0, hurt: 0, hurtFrom: 0, alive: true, stunned: false, clock: 0, phase: 0, ...over });
/** run the pose to rest on an input: enough frames for every ease to settle */
const settle = (inp: PoseInput, frames = 120, st = createPoseState()) => {
  let out = poseBody(inp, st, 1 / 60);
  for (let i = 1; i < frames; i++) out = poseBody({ ...inp, clock: i / 60, phase: inp.phase + (inp.speed >= 0.5 ? (i / 60) * (6 + inp.speed * 0.9) : 0) }, st, 1 / 60);
  return { out, st };
};

describe("standing, walking, sprinting", () => {
  it("idle: the legs hang, the socket sits at rest, the hips breathe a few millimetres", () => {
    const { out } = settle(base());
    expect(Math.abs(out.legL.rx)).toBeLessThan(0.02);
    expect(Math.abs(out.legR.rx)).toBeLessThan(0.02);
    expect(out.socket.x).toBeCloseTo(REST.socket.x, 3);
    expect(Math.abs(out.hips.y - REST.hipsY)).toBeLessThan(0.01);
    expect(out.state).toBe("idle");
    expect(out.armsOnWeapon).toBe(true);
    expect(out.armTargetR).toEqual(GRIP_R);
  });

  it("walking: the legs alternate at the stride's amplitude, and the body leans forward (negative), never back", () => {
    const st = createPoseState();
    let flips = 0;
    let peak = 0;
    let last = 0;
    for (let i = 0; i < 120; i++) {
      const out = poseBody(base({ speed: 5.2, phase: (i / 60) * (6 + 5.2 * 0.9), clock: i / 60 }), st, 1 / 60);
      if (i > 30) {
        const sgn = Math.sign(out.legL.rx - out.legR.rx);
        if (last !== 0 && sgn !== 0 && sgn !== last) flips++;
        last = sgn || last;
        peak = Math.max(peak, Math.abs(out.legL.rx));
        expect(out.legL.rx).toBeCloseTo(-out.legR.rx, 6);
        expect(out.hips.rx).toBeLessThan(-0.02);
      }
    }
    expect(flips).toBeGreaterThanOrEqual(3);
    expect(peak).toBeGreaterThanOrEqual(0.35);
    expect(peak).toBeLessThanOrEqual(0.7 * (5.2 / 7.2) + 0.01);
  });

  it("sprinting carries the rifle low; walking does not", () => {
    const sprint = settle(base({ speed: 7.2 })).out;
    const walk = settle(base({ speed: 5 })).out;
    expect(sprint.state).toBe("sprint");
    expect(sprint.socket.rx).toBeLessThan(-0.4); // pitch 0 + carry -0.45
    expect(Math.abs(walk.socket.rx)).toBeLessThan(0.01);
    expect(sprint.socket.y).toBeLessThan(walk.socket.y);
  });

  it("a strafe steps the boots sideways under a torso that faces the aim", () => {
    const out = settle(base({ speed: 5, moveYaw: Math.PI / 2 })).out;
    expect(Math.abs(out.legL.ry)).toBeGreaterThanOrEqual(0.8);
    expect(settle(base({ speed: 5, moveYaw: 0 })).out.legL.ry).toBeCloseTo(0, 3);
  });

  it("the socket's pitch is the aim's, exactly and at once, whatever the torso is doing", () => {
    const st = createPoseState();
    const a = poseBody(base({ pitch: 0.5, speed: 5 }), st, 1 / 60);
    expect(a.socket.rx).toBeCloseTo(0.5, 9);
    const b = poseBody(base({ pitch: -0.6, speed: 5 }), st, 1 / 60);
    expect(b.socket.rx).toBeCloseTo(-0.6, 9);
    // the hood follows at half the pitch, eased
    const { out } = settle(base({ pitch: 0.5 }));
    expect(out.head.rx).toBeCloseTo(0.25, 2);
  });
});

describe("crouch, slide, air, mantle", () => {
  it("crouch drops the hips to 0.43 without a jump: no frame moves them more than 0.12 m", () => {
    const st = createPoseState();
    let prev = REST.hipsY;
    let maxStep = 0;
    let out = poseBody(base(), st, 1 / 60);
    for (let i = 0; i < 90; i++) {
      out = poseBody(base({ stance: "crouch", height: 1.15 }), st, 1 / 60);
      maxStep = Math.max(maxStep, Math.abs(out.hips.y - prev));
      prev = out.hips.y;
    }
    expect(out.hips.y).toBeLessThanOrEqual(0.5);
    expect(out.hips.y).toBeCloseTo(0.43, 1);
    expect(maxStep).toBeLessThanOrEqual(0.12);
    expect(out.legL.sy).toBeLessThan(0.2);
    expect(out.head.rx).toBeLessThan(-0.25);
    // and back up
    const up = settle(base(), 120, st).out;
    expect(up.hips.y).toBeCloseTo(REST.hipsY, 1);
  });

  it("slide: leaning back, the lead boot flat ahead, the hem flared and lifted", () => {
    const { out } = settle(base({ stance: "slide", height: 1.15, speed: 9, grounded: true }));
    expect(out.state).toBe("slide");
    expect(out.hips.rx).toBeGreaterThanOrEqual(0.3);
    expect(out.legR.rx + out.hips.rx).toBeGreaterThanOrEqual(1.3); // the boot's angle in the body frame: leg plus the lean it hangs from
    expect(out.legL.sy).toBeCloseTo(0.3, 1);
    expect(out.flare).toBeGreaterThanOrEqual(0.12);
    expect(out.sway.y).toBeGreaterThan(0.05);
    expect(Math.abs(out.legL.rx - out.legR.rx)).toBeGreaterThan(0.1); // no stride
  });

  it("in the air the legs split and the hem lifts against a fall; landing dips the hips and recovers", () => {
    const st = createPoseState();
    const air = settle(base({ grounded: false, vy: -8 }), 60, st).out;
    expect(air.state).toBe("air");
    expect(air.legL.rx).toBeGreaterThanOrEqual(0.4);
    expect(air.legR.rx).toBeLessThanOrEqual(-0.2);
    expect(air.flare).toBeGreaterThanOrEqual(0.15);
    expect(air.sway.y).toBeGreaterThanOrEqual(0.08);
    const landed = poseBody(base({ grounded: true }), st, 1 / 60);
    let low = landed.hips.y;
    for (let i = 0; i < 6; i++) low = Math.min(low, poseBody(base({ grounded: true, clock: i / 60 }), st, 1 / 60).hips.y);
    expect(low).toBeLessThanOrEqual(0.9);
    const later = settle(base(), 30, st).out;
    expect(later.hips.y).toBeGreaterThanOrEqual(0.94);
  });

  it("a mantle takes the hands off the weapon and up to the ledge", () => {
    const { out } = settle(base({ stance: "mantle", grounded: false }));
    expect(out.armsOnWeapon).toBe(false);
    expect(out.armTargetR.y).toBeCloseTo(1.95, 6);
    expect(out.armTargetL.x).toBeLessThan(0);
    expect(out.socket.rx).toBeLessThan(-0.3);
  });
});

describe("hits, reloads, death", () => {
  it("recoil shoves the socket back on the frame it lands, unblended, and the reload dips the muzzle and sends the support hand to the well", () => {
    const st = createPoseState();
    const still = poseBody(base(), st, 1 / 60);
    const kicked = poseBody(base({ kick: 1 }), st, 1 / 60);
    expect(kicked.socket.z - still.socket.z).toBeGreaterThan(0.04);
    const mid = settle(base({ reloading: 0.5 }), 60).out;
    expect(mid.leftReloadMix).toBeCloseTo(1, 6);
    expect(mid.socket.rx).toBeCloseTo(-0.3, 1);
    expect(settle(base({ reloading: 0 })).out.leftReloadMix).toBe(0);
  });

  it("death: the file falls back, the strip-light fades to a fifth by half a second, the body goes after 1.2 s, and a respawn restores everything", () => {
    const st = createPoseState();
    poseBody(base(), st, 1 / 60);
    let out = poseBody(base({ alive: false }), st, 1 / 60);
    expect(out.visible).toBe(true);
    for (let i = 0; i < 30; i++) out = poseBody(base({ alive: false, clock: i / 60 }), st, 1 / 60); // ~0.5 s
    expect(out.state).toBe("corpse");
    expect(out.hips.rx).toBeGreaterThanOrEqual(1.2);
    expect(out.trimScale).toBeLessThanOrEqual(0.25);
    expect(out.armsOnWeapon).toBe(false);
    expect(out.visible).toBe(true);
    for (let i = 0; i < 50; i++) out = poseBody(base({ alive: false, clock: 1 + i / 60 }), st, 1 / 60); // past 1.2 s
    expect(out.visible).toBe(false);
    expect(st.corpseT).toBeGreaterThan(CORPSE_SECONDS);
    const back = poseBody(base({ alive: true }), st, 1 / 60);
    expect(back.visible).toBe(true);
    expect(back.trimScale).toBe(1);
    expect(back.hips.y).toBeGreaterThanOrEqual(0.94);
    expect(back.state).toBe("idle");
  });

  it("local and remote parity: the same inputs give the same pose", () => {
    const a = settle(base({ speed: 4, pitch: 0.3, phase: 1 })).out;
    const b = settle(base({ speed: 4, pitch: 0.3, phase: 1 })).out;
    expect(a).toEqual(b);
  });
});

describe("the arm", () => {
  const S = v3(0.21, 1.47, 0.12);
  it("reaches a target inside its reach exactly, bending toward the pole", () => {
    const T = v3(0.22, 1.2, -0.34);
    const { elbow, wrist, clamped } = twoBoneIK(S, T, v3(1, -0.5, 0.3));
    expect(clamped).toBe(false);
    expect(dist(wrist, T)).toBeLessThan(1e-6);
    expect(dist(S, elbow)).toBeCloseTo(0.28, 6);
    expect(dist(elbow, wrist)).toBeCloseTo(0.3, 6);
    expect(elbow.x).toBeGreaterThan(S.x); // the elbow went out to the right, toward the pole
  });
  it("a target past the reach is pulled in to 97% of it; a target on the shoulder is pushed out", () => {
    const far = twoBoneIK(S, v3(0.21, 0.2, 0.12), v3(1, -0.5, 0.3));
    expect(far.clamped).toBe(true);
    expect(dist(S, far.wrist)).toBeCloseTo(0.97 * 0.58, 6);
    const near = twoBoneIK(S, S, v3(1, -0.5, 0.3));
    expect(near.clamped).toBe(true);
    expect(len(sub(near.wrist, S))).toBeCloseTo(0.05, 6);
  });
  it("the nearest point on the fore-end keeps the support hand on the barrel line", () => {
    const p = nearestOnSegment(v3(-0.19, 1.19, -0.16), v3(0, -0.07, -0.3), v3(0, -0.07, -0.5));
    expect(p.z).toBeCloseTo(-0.3, 6);
    const q = nearestOnSegment(v3(0, 0, -9), v3(0, -0.07, -0.3), v3(0, -0.07, -0.5));
    expect(q.z).toBeCloseTo(-0.5, 6);
  });

  it("a travel direction dithering around the back does not swing the legs from side to side", () => {
    // +pi and -pi are the same direction; clamping them sends the legs to opposite sides
    const st = createPoseState();
    let out = poseBody(base({ speed: 5, yaw: 0, moveYaw: Math.PI - 0.05 }), st, 1 / 60);
    for (let i = 0; i < 60; i++) out = poseBody(base({ speed: 5, yaw: 0, moveYaw: Math.PI - 0.05, clock: i / 60 }), st, 1 / 60);
    const side = Math.sign(out.legL.ry);
    expect(Math.abs(out.legL.ry)).toBeGreaterThan(1.0);
    for (let i = 0; i < 60; i++) {
      // the direction wobbles across the back, a tenth of a radian either side
      const moveYaw = Math.PI + (i % 2 === 0 ? 0.05 : -0.05);
      out = poseBody(base({ speed: 5, yaw: 0, moveYaw, clock: i / 60 }), st, 1 / 60);
      expect(Math.sign(out.legL.ry)).toBe(side);
    }
  });

  it("a held sample is not a direction: a body whose position repeats faces where it aims", () => {
    // the renderer takes the travel direction from the frame-to-frame displacement; when that is
    // exactly zero, atan2(-0, -0) is -pi and the legs would face backwards
    const st = createPoseState();
    const out = poseBody(base({ speed: 5, yaw: 1.1, moveYaw: 1.1 }), st, 1 / 60);
    expect(Math.abs(out.legL.ry)).toBeLessThan(0.01);
  });

  it("a weapon swap dips the held weapon and a charge shakes it — on the body, not only on the hidden viewmodel", () => {
    const st = createPoseState();
    let rest = poseBody(base(), st, 1 / 60);
    for (let i = 0; i < 60; i++) rest = poseBody(base({ clock: i / 60 }), st, 1 / 60);
    const restY = rest.socket.y;
    // through a swap the weapon is down and pitched away, and it comes back up when it is over
    let swapped = rest;
    for (let i = 0; i < 12; i++) swapped = poseBody(base({ swap: 1, clock: 1 + i / 60 }), st, 1 / 60);
    expect(swapped.socket.y).toBeLessThan(restY - 0.1);
    expect(swapped.socket.rx).toBeLessThan(rest.socket.rx - 0.2);
    let back = swapped;
    for (let i = 0; i < 60; i++) back = poseBody(base({ clock: 2 + i / 60 }), st, 1 / 60);
    expect(back.socket.y).toBeCloseTo(restY, 2);
    // a charge shakes it: two moments of the same charge do not sit in the same place
    const a = poseBody(base({ charge: 1, clock: 4 }), st, 1 / 60);
    const b = poseBody(base({ charge: 1, clock: 4 + 0.026 }), st, 1 / 60);
    expect(Math.abs(a.socket.z - b.socket.z)).toBeGreaterThan(0.004);
    const still1 = poseBody(base({ charge: 0, clock: 5 }), st, 1 / 60);
    const still2 = poseBody(base({ charge: 0, clock: 5 + 0.026 }), st, 1 / 60);
    expect(Math.abs(still1.socket.z - still2.socket.z)).toBeLessThan(0.0005);
  });

  it("a hit throws the chest away from whatever landed it, and the body recovers", () => {
    const st = createPoseState();
    let rest = poseBody(base(), st, 1 / 60);
    for (let i = 0; i < 60; i++) rest = poseBody(base({ clock: i / 60 }), st, 1 / 60);
    // from straight ahead: the chest goes back
    const front = poseBody(base({ hurt: 1, hurtFrom: 0, clock: 2 }), st, 1 / 60);
    expect(front.chest.rx).toBeGreaterThan(rest.chest.rx + 0.15);
    expect(Math.abs(front.chest.ry - rest.chest.ry)).toBeLessThan(0.02);
    // from the right: the shoulder swings, and the other way for a hit from the left
    const right = poseBody(base({ hurt: 1, hurtFrom: Math.PI / 2, clock: 2 }), st, 1 / 60);
    const left = poseBody(base({ hurt: 1, hurtFrom: -Math.PI / 2, clock: 2 }), st, 1 / 60);
    expect(Math.sign(right.chest.ry - rest.chest.ry)).toBe(-Math.sign(left.chest.ry - rest.chest.ry));
    expect(Math.abs(right.chest.ry - rest.chest.ry)).toBeGreaterThan(0.2);
    // and with the flinch spent the body is where it was
    const done = poseBody(base({ hurt: 0, clock: 3 }), st, 1 / 60);
    expect(done.chest.rx).toBeCloseTo(rest.chest.rx, 3);
    expect(done.chest.ry).toBeCloseTo(rest.chest.ry, 3);
  });
});
