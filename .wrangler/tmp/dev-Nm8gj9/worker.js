var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// shared/sim/constants.ts
var SIM_HZ = 60;
var SIM_DT = 1 / SIM_HZ;
var MOVE = {
  walkSpeed: 5.2,
  sprintSpeed: 7.2,
  crouchSpeed: 2.6,
  groundAccel: 64,
  /** exponential friction coefficient when no input on ground (1/s) */
  groundFriction: 9,
  airAccel: 14,
  gravity: 22,
  jumpVel: 7.4,
  jumpBuffer: 0.1,
  coyoteTime: 0.08,
  terminalVel: 42,
  capsuleRadius: 0.4,
  standHeight: 1.8,
  lowHeight: 1.15,
  eyeStand: 1.62,
  eyeLow: 0.9,
  stepHeight: 0.4,
  groundProbe: 0.08,
  /** Slide: momentum-preserving. Enter from a sprint, boost, decay, exit keeps velocity. */
  slideEntrySpeed: 5.6,
  slideBoost: 2.2,
  slideMaxSpeed: 10.5,
  slideFriction: 3.4,
  slideMinTime: 0.25,
  slideExitSpeed: 3,
  slideSteerRate: 1.6,
  slideCooldown: 0.45,
  /** Above-sprint momentum decays toward sprint speed at this rate once standing. */
  momentumDecay: 4.5,
  slideJumpVel: 6.9,
  /** Mantle: grab a ledge whose top is within [min,max] above the feet and pull up. */
  mantleMinHeight: 0.45,
  mantleMaxHeight: 1.7,
  mantleReach: 0.55,
  mantleTime: 0.34,
  mantleExitSpeed: 2.5
};
var LEASE_BREAKER = {
  id: "lease_breaker",
  name: "LEASE-BREAKER",
  rpm: 500,
  damage: 16,
  headMult: 1.5,
  legMult: 0.85,
  magSize: 30,
  reloadTime: 1.9,
  range: 120,
  /** Visual view-kick per shot (radians), recovered exponentially. Full recoil model in Stage 4. */
  kickPitch: 55e-4,
  kickYaw: 18e-4,
  kickRecover: 12
};
var PLAYER_MAX_HEALTH = 100;
var DUMMY_MAX_HEALTH = 100;
var DUMMY_RESPAWN_SECONDS = 2.5;

// shared/math/vec3.ts
var v3 = /* @__PURE__ */ __name((x = 0, y = 0, z = 0) => ({ x, y, z }), "v3");
var clone = /* @__PURE__ */ __name((a) => ({ x: a.x, y: a.y, z: a.z }), "clone");
var set = /* @__PURE__ */ __name((o, x, y, z) => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}, "set");
var copy = /* @__PURE__ */ __name((o, a) => set(o, a.x, a.y, a.z), "copy");
var sub = /* @__PURE__ */ __name((a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z), "sub");
var scale = /* @__PURE__ */ __name((a, s) => v3(a.x * s, a.y * s, a.z * s), "scale");
var addScaled = /* @__PURE__ */ __name((a, b, s) => v3(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s), "addScaled");
var dot = /* @__PURE__ */ __name((a, b) => a.x * b.x + a.y * b.y + a.z * b.z, "dot");
var len = /* @__PURE__ */ __name((a) => Math.sqrt(dot(a, a)), "len");
var lenXZ = /* @__PURE__ */ __name((a) => Math.sqrt(a.x * a.x + a.z * a.z), "lenXZ");
var dist = /* @__PURE__ */ __name((a, b) => len(sub(a, b)), "dist");
var normalize = /* @__PURE__ */ __name((a) => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3();
}, "normalize");
var hyp2 = /* @__PURE__ */ __name((x, y) => Math.sqrt(x * x + y * y), "hyp2");
var clamp = /* @__PURE__ */ __name((x, lo, hi) => x < lo ? lo : x > hi ? hi : x, "clamp");
var yawDir = /* @__PURE__ */ __name((yaw) => v3(-Math.sin(yaw), 0, -Math.cos(yaw)), "yawDir");
var yawRight = /* @__PURE__ */ __name((yaw) => v3(Math.cos(yaw), 0, -Math.sin(yaw)), "yawRight");
var viewDir = /* @__PURE__ */ __name((yaw, pitch) => {
  const c = Math.cos(pitch);
  return v3(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
}, "viewDir");
var wrapAngle = /* @__PURE__ */ __name((a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}, "wrapAngle");

// shared/sim/level.ts
var box = /* @__PURE__ */ __name((x0, y0, z0, x1, y1, z1, tag) => ({
  min: v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
  max: v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
  tag
}), "box");
function drainageYard() {
  const boxes = [];
  const H = 32;
  boxes.push(box(-H, -1, -H, H, 0, H, "floor"));
  boxes.push(box(-H, 0, -H - 1, H, 6, -H, "wall"));
  boxes.push(box(-H, 0, H, H, 6, H + 1, "wall"));
  boxes.push(box(-H - 1, 0, -H, -H, 6, H, "wall"));
  boxes.push(box(H, 0, -H, H + 1, 6, H, "wall"));
  boxes.push(box(-3, 0, 11.6, 3, 0.3, 12.4, "curb"));
  boxes.push(box(-4, 0, -8, 4, 1.2, -2, "deck"));
  boxes.push(box(-4, 0, -14, 4, 2.7, -8, "upperdeck"));
  boxes.push(box(-8, 0, -6, -4.5, 0.4, -3, "crate"));
  boxes.push(box(-8, 0, -9.5, -4.5, 0.8, -6.5, "crate"));
  boxes.push(box(-H, 0, 5.6, -6, 0.5, 6.4, "kerb"));
  boxes.push(box(6, 0, 5.6, H, 0.5, 6.4, "kerb"));
  for (let i = 0; i < 4; i++) {
    const x = 12 + i * 5;
    boxes.push(box(x - 0.6, 0, -0.6, x + 0.6, 4.5, 0.6, "pillar"));
  }
  boxes.push(box(10, 0, -18, 26, 1, -16, "lowwall"));
  boxes.push(box(14, 0, 14, 22, 2.2, 15, "highwall"));
  boxes.push(box(26, 3.2, -26, 30, 3.5, 26, "gantry"));
  boxes.push(box(26, 0, 22, 30, 3.2, 26, "gantrystair"));
  boxes.push(box(-28, 0, -26, -16, 5, -14, "block"));
  boxes.push(box(-28, 0, 10, -18, 3, 22, "block"));
  boxes.push(box(-14, 0, 18, -8, 1.6, 24, "crate"));
  boxes.push(box(-14, 1.6, 21, -11, 2.4, 24, "crate"));
  boxes.push(box(-6.3, 0, 13.7, -5.7, 4.6, 14.3, "post"));
  boxes.push(box(5.7, 0, 13.7, 6.3, 4.6, 14.3, "post"));
  boxes.push(box(-6.3, 4.4, 13.8, 6.3, 4.6, 14.2, "bar"));
  boxes.push(box(-15.5, 0, -15.3, -14.9, 0.9, -14.7, "barrel"));
  boxes.push(box(-14.8, 0, -15.9, -14.2, 0.9, -15.3, "barrel"));
  boxes.push(box(10.4, 0, -15.6, 11, 0.9, -15, "barrel"));
  boxes.push(box(23.2, 0, 12.6, 23.8, 0.9, 13.2, "barrel"));
  boxes.push(box(26.6, 0, 13.8, 27.2, 0.7, 14.4, "cone"));
  boxes.push(box(-9.5, 0, 25, -8.9, 0.7, 25.6, "cone"));
  const spawns = [
    { pos: v3(0, 0, 24), yaw: 0 },
    { pos: v3(20, 0, 20), yaw: Math.PI / 2 },
    { pos: v3(-20, 0, 0), yaw: -Math.PI / 2 },
    { pos: v3(0, 3.5, -24), yaw: Math.PI }
  ];
  const dummies = [
    { id: 1, pos: v3(0, 2.7, -12) },
    // on the upper deck, the probe's target
    { id: 2, pos: v3(18, 0, -10), patrolTo: v3(18, 0, 8) },
    { id: 3, pos: v3(-12, 0, -4) },
    { id: 4, pos: v3(6, 0, 18), patrolTo: v3(-6, 0, 18) },
    { id: 5, pos: v3(28, 3.5, 0) }
  ];
  return { name: "drainage_yard", boxes, spawns, dummies, killY: -20 };
}
__name(drainageYard, "drainageYard");

// shared/sim/input.ts
var Btn = {
  Forward: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Sprint: 1 << 5,
  Crouch: 1 << 6,
  Fire: 1 << 7,
  Reload: 1 << 8,
  Alt: 1 << 9
};
var emptyInput = /* @__PURE__ */ __name((tick) => ({ tick, buttons: 0, yaw: 0, pitch: 0 }), "emptyInput");
var has = /* @__PURE__ */ __name((buttons, b) => (buttons & b) !== 0, "has");

// shared/sim/collision.ts
function closestPointAABB(p, b) {
  return v3(clamp(p.x, b.min.x, b.max.x), clamp(p.y, b.min.y, b.max.y), clamp(p.z, b.min.z, b.max.z));
}
__name(closestPointAABB, "closestPointAABB");
function capsuleBoxContact(feet, r, h, b) {
  const ay = feet.y + r;
  const by = feet.y + h - r;
  if (feet.x + r <= b.min.x || feet.x - r >= b.max.x) return null;
  if (feet.z + r <= b.min.z || feet.z - r >= b.max.z) return null;
  if (feet.y + h <= b.min.y || feet.y >= b.max.y) return null;
  if (b.max.y < ay || b.min.y > by) {
    const dhx = Math.max(b.min.x - feet.x, 0, feet.x - b.max.x);
    const dhz = Math.max(b.min.z - feet.z, 0, feet.z - b.max.z);
    if (dhx * dhx + dhz * dhz <= r * r) {
      if (b.max.y < ay) return { normal: v3(0, 1, 0), depth: b.max.y - feet.y, box: b };
      return { normal: v3(0, -1, 0), depth: feet.y + h - b.min.y, box: b };
    }
  }
  const lo = Math.max(ay, b.min.y);
  const hi = Math.min(by, b.max.y);
  const segY = lo <= hi ? 0.5 * (lo + hi) : b.max.y < ay ? ay : by;
  const sp = v3(feet.x, segY, feet.z);
  const q = closestPointAABB(sp, b);
  const dx = sp.x - q.x;
  const dy = sp.y - q.y;
  const dz = sp.z - q.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    return { normal: v3(dx / d, dy / d, dz / d), depth: r - d, box: b };
  }
  const px = Math.min(feet.x + r - b.min.x, b.max.x - (feet.x - r));
  const pz = Math.min(feet.z + r - b.min.z, b.max.z - (feet.z - r));
  const pyUp = b.max.y - feet.y;
  const pyDown = feet.y + h - b.min.y;
  const py = Math.min(pyUp, pyDown);
  if (py <= px && py <= pz) {
    return pyUp <= pyDown ? { normal: v3(0, 1, 0), depth: pyUp, box: b } : { normal: v3(0, -1, 0), depth: pyDown, box: b };
  }
  if (px <= pz) {
    const left = feet.x + r - b.min.x;
    const right = b.max.x - (feet.x - r);
    return left <= right ? { normal: v3(-1, 0, 0), depth: left, box: b } : { normal: v3(1, 0, 0), depth: right, box: b };
  }
  const back = feet.z + r - b.min.z;
  const front = b.max.z - (feet.z - r);
  return back <= front ? { normal: v3(0, 0, -1), depth: back, box: b } : { normal: v3(0, 0, 1), depth: front, box: b };
}
__name(capsuleBoxContact, "capsuleBoxContact");
function resolveCapsule(feet, r, h, boxes, maxIter = 4) {
  const out = [];
  for (let it = 0; it < maxIter; it++) {
    let any = false;
    for (const b of boxes) {
      const c = capsuleBoxContact(feet, r, h, b);
      if (!c) continue;
      any = true;
      const push = c.depth + 1e-4;
      feet.x += c.normal.x * push;
      feet.y += c.normal.y * push;
      feet.z += c.normal.z * push;
      out.push(c);
    }
    if (!any) break;
  }
  return out;
}
__name(resolveCapsule, "resolveCapsule");
function capsuleFree(feet, r, h, boxes, tol = 0.01) {
  for (const b of boxes) {
    const c = capsuleBoxContact(feet, r, h, b);
    if (c && c.depth > tol) return false;
  }
  return true;
}
__name(capsuleFree, "capsuleFree");
function groundContact(feet, r, h, boxes) {
  const probe = v3(feet.x, feet.y - MOVE.groundProbe, feet.z);
  let best = null;
  for (const b of boxes) {
    const c = capsuleBoxContact(probe, r, h, b);
    if (c && c.normal.y > 0.7 && (!best || c.depth > best.depth)) best = c;
  }
  return best;
}
__name(groundContact, "groundContact");
function rayBox(o, d, b, maxT) {
  let tmin = 0;
  let tmax = maxT;
  const oa = [o.x, o.y, o.z];
  const da = [d.x, d.y, d.z];
  const mn = [b.min.x, b.min.y, b.min.z];
  const mx = [b.max.x, b.max.y, b.max.z];
  for (let i = 0; i < 3; i++) {
    const oi = oa[i];
    const di = da[i];
    if (Math.abs(di) < 1e-9) {
      if (oi < mn[i] || oi > mx[i]) return null;
      continue;
    }
    const inv = 1 / di;
    let t1 = (mn[i] - oi) * inv;
    let t2 = (mx[i] - oi) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}
__name(rayBox, "rayBox");
function rayCapsule(o, d, feet, r, h, maxT) {
  const a = v3(feet.x, feet.y + r, feet.z);
  const b = v3(feet.x, feet.y + h - r, feet.z);
  const ox = o.x - a.x;
  const oz = o.z - a.z;
  const A = d.x * d.x + d.z * d.z;
  const B = 2 * (ox * d.x + oz * d.z);
  const C = ox * ox + oz * oz - r * r;
  let best = null;
  if (A > 1e-9) {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const t = (-B - s) / (2 * A);
      if (t >= 0 && t <= maxT) {
        const y = o.y + d.y * t;
        if (y >= a.y && y <= b.y) best = t;
      }
    }
  } else if (C > 0) {
    return null;
  }
  for (const c of [a, b]) {
    const px = o.x - c.x;
    const py = o.y - c.y;
    const pz = o.z - c.z;
    const bb = 2 * (px * d.x + py * d.y + pz * d.z);
    const cc = px * px + py * py + pz * pz - r * r;
    const disc = bb * bb - 4 * cc;
    if (disc < 0) continue;
    const t = (-bb - Math.sqrt(disc)) / 2;
    if (t >= 0 && t <= maxT && (best === null || t < best)) best = t;
  }
  return best;
}
__name(rayCapsule, "rayCapsule");

// shared/sim/player.ts
function createPlayer(id, name, spawn) {
  return {
    id,
    name,
    pos: clone(spawn.pos),
    vel: v3(),
    yaw: spawn.yaw,
    pitch: 0,
    stance: "stand",
    height: MOVE.standHeight,
    grounded: false,
    airTime: 0,
    jumpBuffer: 0,
    slideTime: 0,
    slideCooldown: 0,
    slideDir: v3(0, 0, -1),
    mantleFrom: v3(),
    mantleTo: v3(),
    mantleT: 0,
    health: PLAYER_MAX_HEALTH,
    alive: true,
    respawnTimer: 0,
    ammo: LEASE_BREAKER.magSize,
    reloadTimer: 0,
    fireCooldown: 0,
    kickPitch: 0,
    kickYaw: 0,
    prevButtons: 0,
    firedThisTick: false,
    stats: { jumps: 0, slides: 0, slideJumps: 0, mantles: 0, shots: 0, hits: 0, kills: 0, deaths: 0, topSpeed: 0 },
    firstDamageTick: -1,
    lastAttacker: -1
  };
}
__name(createPlayer, "createPlayer");
function respawnPlayer(p, spawn) {
  copy(p.pos, spawn.pos);
  set(p.vel, 0, 0, 0);
  p.yaw = spawn.yaw;
  p.pitch = 0;
  p.stance = "stand";
  p.height = MOVE.standHeight;
  p.health = PLAYER_MAX_HEALTH;
  p.alive = true;
  p.ammo = LEASE_BREAKER.magSize;
  p.reloadTimer = 0;
  p.fireCooldown = 0;
  p.slideTime = 0;
  p.slideCooldown = 0;
  p.firstDamageTick = -1;
  p.lastAttacker = -1;
}
__name(respawnPlayer, "respawnPlayer");
var eyeHeight = /* @__PURE__ */ __name((p) => p.height < MOVE.standHeight - 0.01 ? MOVE.eyeLow : MOVE.eyeStand, "eyeHeight");
var eyePos = /* @__PURE__ */ __name((p) => v3(p.pos.x, p.pos.y + eyeHeight(p), p.pos.z), "eyePos");
var MOVE_SUBSTEPS = 3;
function wishDirection(input) {
  const f = yawDir(input.yaw);
  const r = yawRight(input.yaw);
  let x = 0;
  let z = 0;
  if (has(input.buttons, Btn.Forward)) {
    x += f.x;
    z += f.z;
  }
  if (has(input.buttons, Btn.Back)) {
    x -= f.x;
    z -= f.z;
  }
  if (has(input.buttons, Btn.Right)) {
    x += r.x;
    z += r.z;
  }
  if (has(input.buttons, Btn.Left)) {
    x -= r.x;
    z -= r.z;
  }
  const l = hyp2(x, z);
  return l > 1e-6 ? v3(x / l, 0, z / l) : v3();
}
__name(wishDirection, "wishDirection");
function findMantle(p, boxes) {
  const r = MOVE.capsuleRadius;
  const f = yawDir(p.yaw);
  const probeDist = r + MOVE.mantleReach;
  const px = p.pos.x + f.x * probeDist;
  const pz = p.pos.z + f.z * probeDist;
  let best = null;
  for (const b of boxes) {
    if (px < b.min.x || px > b.max.x || pz < b.min.z || pz > b.max.z) continue;
    const rise = b.max.y - p.pos.y;
    if (rise < MOVE.mantleMinHeight || rise > MOVE.mantleMaxHeight) continue;
    if (p.pos.y + 0.3 < b.min.y) continue;
    if (!best || b.max.y > best.max.y) best = b;
  }
  if (!best) return null;
  const land = v3(p.pos.x + f.x * (probeDist + 0.35), best.max.y + 0.01, p.pos.z + f.z * (probeDist + 0.35));
  if (!capsuleFree(land, r, MOVE.standHeight, boxes, 0.02)) return null;
  return land;
}
__name(findMantle, "findMantle");
function stepPlayer(p, input, boxes, events) {
  const dt = SIM_DT;
  const r = MOVE.capsuleRadius;
  p.firedThisTick = false;
  p.yaw = wrapAngle(input.yaw);
  p.pitch = clamp(input.pitch, -1.55, 1.55);
  p.kickPitch *= Math.max(0, 1 - LEASE_BREAKER.kickRecover * dt);
  p.kickYaw *= Math.max(0, 1 - LEASE_BREAKER.kickRecover * dt);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.slideCooldown = Math.max(0, p.slideCooldown - dt);
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 0;
      p.ammo = LEASE_BREAKER.magSize;
      events.push({ type: "reloadEnd" });
    }
  }
  const pressed = input.buttons & ~p.prevButtons;
  p.prevButtons = input.buttons;
  if (!p.alive) return;
  const jumpPressed = has(pressed, Btn.Jump);
  const crouchPressed = has(pressed, Btn.Crouch);
  const crouchHeld = has(input.buttons, Btn.Crouch);
  const sprintHeld = has(input.buttons, Btn.Sprint);
  if (jumpPressed) p.jumpBuffer = MOVE.jumpBuffer;
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.stance === "mantle") {
    p.mantleT = Math.min(1, p.mantleT + dt / MOVE.mantleTime);
    const t = p.mantleT;
    const ty = Math.min(1, t / 0.6);
    const tf = Math.max(0, (t - 0.4) / 0.6);
    const ey = 1 - (1 - ty) * (1 - ty);
    const ef = tf * tf;
    p.pos.x = p.mantleFrom.x + (p.mantleTo.x - p.mantleFrom.x) * ef;
    p.pos.z = p.mantleFrom.z + (p.mantleTo.z - p.mantleFrom.z) * ef;
    p.pos.y = p.mantleFrom.y + (p.mantleTo.y - p.mantleFrom.y) * ey;
    set(p.vel, 0, 0, 0);
    if (t >= 1) {
      p.stance = "stand";
      p.height = MOVE.standHeight;
      const f = yawDir(p.yaw);
      set(p.vel, f.x * MOVE.mantleExitSpeed, 0, f.z * MOVE.mantleExitSpeed);
      p.grounded = true;
      events.push({ type: "mantleEnd" });
    }
    return;
  }
  const wish = wishDirection(input);
  const wasGrounded = p.grounded;
  const forward = yawDir(p.yaw);
  const forwardHeld = has(input.buttons, Btn.Forward) && dot(wish, forward) > 0.5;
  if (p.stance === "slide") {
    p.slideTime += dt;
    let speed = lenXZ(p.vel);
    const canStand = capsuleFree(p.pos, r, MOVE.standHeight, boxes);
    const slideJumping = p.jumpBuffer > 0 && p.grounded && canStand;
    if (p.grounded && !slideJumping) speed = Math.max(0, speed - MOVE.slideFriction * dt);
    if (wish.x !== 0 || wish.z !== 0) {
      const cur = Math.atan2(p.slideDir.x, p.slideDir.z);
      const want = Math.atan2(wish.x, wish.z);
      const delta = wrapAngle(want - cur);
      const step = clamp(delta, -MOVE.slideSteerRate * dt, MOVE.slideSteerRate * dt);
      const a = cur + step;
      set(p.slideDir, Math.sin(a), 0, Math.cos(a));
    }
    p.vel.x = p.slideDir.x * speed;
    p.vel.z = p.slideDir.z * speed;
    if (slideJumping) {
      p.jumpBuffer = 0;
      p.vel.y = MOVE.slideJumpVel;
      p.grounded = false;
      p.stance = "stand";
      p.height = MOVE.standHeight;
      p.slideCooldown = MOVE.slideCooldown;
      p.stats.slideJumps++;
      p.stats.jumps++;
      events.push({ type: "slideJump" });
    } else if ((speed < MOVE.slideExitSpeed || !crouchHeld && p.slideTime >= MOVE.slideMinTime) && canStand) {
      p.stance = crouchHeld ? "crouch" : "stand";
      p.height = crouchHeld ? MOVE.lowHeight : MOVE.standHeight;
      p.slideCooldown = MOVE.slideCooldown;
      events.push({ type: "slideEnd" });
    }
  } else {
    const hspeed = lenXZ(p.vel);
    const canSlide = crouchPressed && p.grounded && sprintHeld && hspeed >= MOVE.slideEntrySpeed && p.slideCooldown <= 0 && (wish.x !== 0 || wish.z !== 0);
    if (canSlide) {
      p.stance = "slide";
      p.height = MOVE.lowHeight;
      p.slideTime = 0;
      const d = hspeed > 1e-6 ? v3(p.vel.x / hspeed, 0, p.vel.z / hspeed) : wish;
      copy(p.slideDir, d);
      const s = Math.min(hspeed + MOVE.slideBoost, MOVE.slideMaxSpeed);
      p.vel.x = d.x * s;
      p.vel.z = d.z * s;
      p.stats.slides++;
      events.push({ type: "slide" });
    } else {
      if (crouchHeld && p.grounded) {
        p.stance = "crouch";
        p.height = MOVE.lowHeight;
      } else if (p.stance === "crouch" && (!crouchHeld || !p.grounded)) {
        if (capsuleFree(p.pos, r, MOVE.standHeight, boxes)) {
          p.stance = "stand";
          p.height = MOVE.standHeight;
        }
      }
      const maxSpeed = p.stance === "crouch" ? MOVE.crouchSpeed : sprintHeld && forwardHeld ? MOVE.sprintSpeed : MOVE.walkSpeed;
      if (p.grounded) {
        if (hspeed > maxSpeed + 0.05) {
          const ns = Math.max(maxSpeed, hspeed - MOVE.momentumDecay * dt);
          if (wish.x !== 0 || wish.z !== 0) {
            p.vel.x += wish.x * MOVE.airAccel * dt;
            p.vel.z += wish.z * MOVE.airAccel * dt;
          }
          const k = ns / Math.max(1e-6, hyp2(p.vel.x, p.vel.z));
          p.vel.x *= k;
          p.vel.z *= k;
        } else if (wish.x !== 0 || wish.z !== 0) {
          const tx = wish.x * maxSpeed;
          const tz = wish.z * maxSpeed;
          const dx = tx - p.vel.x;
          const dz = tz - p.vel.z;
          const dl = hyp2(dx, dz);
          const maxStep = MOVE.groundAccel * dt;
          if (dl <= maxStep) {
            p.vel.x = tx;
            p.vel.z = tz;
          } else {
            p.vel.x += dx / dl * maxStep;
            p.vel.z += dz / dl * maxStep;
          }
        } else {
          const f = Math.max(0, 1 - MOVE.groundFriction * dt);
          p.vel.x *= f;
          p.vel.z *= f;
          if (hyp2(p.vel.x, p.vel.z) < 0.05) {
            p.vel.x = 0;
            p.vel.z = 0;
          }
        }
      } else if (wish.x !== 0 || wish.z !== 0) {
        const along = p.vel.x * wish.x + p.vel.z * wish.z;
        const cap = MOVE.walkSpeed;
        if (along < cap) {
          const add = Math.min(MOVE.airAccel * dt, cap - along);
          const limit = Math.max(hspeed, cap);
          p.vel.x += wish.x * add;
          p.vel.z += wish.z * add;
          const ns = hyp2(p.vel.x, p.vel.z);
          if (ns > limit) {
            p.vel.x *= limit / ns;
            p.vel.z *= limit / ns;
          }
        }
      }
      if (p.jumpBuffer > 0 && (p.grounded || p.airTime < MOVE.coyoteTime) && p.stance !== "crouch") {
        p.jumpBuffer = 0;
        p.vel.y = MOVE.jumpVel;
        p.grounded = false;
        p.airTime = MOVE.coyoteTime;
        p.stats.jumps++;
        events.push({ type: "jump" });
      }
    }
  }
  if (!p.grounded && forwardHeld && p.stance !== "slide") {
    const land = findMantle(p, boxes);
    if (land) {
      p.stance = "mantle";
      p.height = MOVE.standHeight;
      copy(p.mantleFrom, p.pos);
      copy(p.mantleTo, land);
      p.mantleT = 0;
      set(p.vel, 0, 0, 0);
      p.stats.mantles++;
      events.push({ type: "mantle", from: clone(p.mantleFrom), to: clone(p.mantleTo) });
      return;
    }
  }
  if (!p.grounded) p.vel.y = Math.max(-MOVE.terminalVel, p.vel.y - MOVE.gravity * dt);
  else if (p.vel.y < 0) p.vel.y = 0;
  const sub2 = dt / MOVE_SUBSTEPS;
  for (let i = 0; i < MOVE_SUBSTEPS; i++) {
    const pre = clone(p.pos);
    p.pos.x += p.vel.x * sub2;
    p.pos.y += p.vel.y * sub2;
    p.pos.z += p.vel.z * sub2;
    const contacts = resolveCapsule(p.pos, r, p.height, boxes);
    let hitWall = false;
    for (const c of contacts) {
      if (Math.abs(c.normal.y) < 0.3) hitWall = true;
    }
    if (hitWall && (wasGrounded || p.grounded) && (p.vel.x !== 0 || p.vel.z !== 0)) {
      const up = v3(pre.x, pre.y + MOVE.stepHeight, pre.z);
      if (capsuleFree(up, r, p.height, boxes)) {
        up.x += p.vel.x * sub2;
        up.z += p.vel.z * sub2;
        const c2 = resolveCapsule(up, r, p.height, boxes);
        const blocked = c2.some((c) => Math.abs(c.normal.y) < 0.3);
        if (!blocked) {
          const top = up.y;
          const N = 8;
          for (let k = 1; k <= N; k++) {
            const y = top - MOVE.stepHeight * k / N;
            if (!capsuleFree(v3(up.x, y, up.z), r, p.height, boxes, 5e-4)) break;
            up.y = y;
          }
          resolveCapsule(up, r, p.height, boxes);
          const g2 = groundContact(up, r, p.height, boxes);
          const progOrig = (p.pos.x - pre.x) * p.vel.x + (p.pos.z - pre.z) * p.vel.z;
          const progStep = (up.x - pre.x) * p.vel.x + (up.z - pre.z) * p.vel.z;
          if (g2 && progStep > progOrig + 1e-6 && up.y <= pre.y + MOVE.stepHeight + 0.01) {
            copy(p.pos, up);
            if (p.vel.y < 0) p.vel.y = 0;
            continue;
          }
        }
      }
    }
    for (const c of contacts) {
      const vn = p.vel.x * c.normal.x + p.vel.y * c.normal.y + p.vel.z * c.normal.z;
      if (vn < 0) {
        p.vel.x -= c.normal.x * vn;
        p.vel.y -= c.normal.y * vn;
        p.vel.z -= c.normal.z * vn;
      }
    }
  }
  const g = groundContact(p.pos, r, p.height, boxes);
  const nowGrounded = !!g && p.vel.y <= 0.01;
  if (nowGrounded && !wasGrounded) {
    events.push({ type: "land", speed: lenXZ(p.vel) });
  }
  p.grounded = nowGrounded;
  p.airTime = nowGrounded ? 0 : p.airTime + dt;
  if (nowGrounded && g) {
    const surfaceY = p.pos.y - MOVE.groundProbe + g.depth + 1e-4;
    if (surfaceY < p.pos.y) p.pos.y = surfaceY;
    if (p.vel.y < 0) p.vel.y = 0;
  }
  const hs = lenXZ(p.vel);
  if (hs > p.stats.topSpeed) p.stats.topSpeed = hs;
  const wantReload = has(pressed, Btn.Reload) || has(input.buttons, Btn.Fire) && p.ammo === 0;
  if (wantReload && p.reloadTimer <= 0 && p.ammo < LEASE_BREAKER.magSize) {
    p.reloadTimer = LEASE_BREAKER.reloadTime;
    events.push({ type: "reloadStart" });
  }
  if (has(input.buttons, Btn.Fire) && p.fireCooldown <= 0 && p.reloadTimer <= 0) {
    if (p.ammo > 0) {
      p.ammo--;
      p.fireCooldown = 60 / LEASE_BREAKER.rpm;
      p.firedThisTick = true;
      p.stats.shots++;
      p.kickPitch += LEASE_BREAKER.kickPitch;
      p.kickYaw += (p.stats.shots & 1 ? 1 : -1) * LEASE_BREAKER.kickYaw;
    } else if (has(pressed, Btn.Fire)) {
      events.push({ type: "dryFire" });
    }
  }
}
__name(stepPlayer, "stepPlayer");

// shared/sim/world.ts
var DUMMY_RADIUS = MOVE.capsuleRadius;
var DUMMY_HEIGHT = MOVE.standHeight;
function zoneOf(hitY, feetY, height) {
  const f = (hitY - feetY) / height;
  if (f > 0.82) return "head";
  if (f < 0.42) return "legs";
  return "body";
}
__name(zoneOf, "zoneOf");
function zoneMult(z) {
  return z === "head" ? LEASE_BREAKER.headMult : z === "legs" ? LEASE_BREAKER.legMult : 1;
}
__name(zoneMult, "zoneMult");
var World = class {
  static {
    __name(this, "World");
  }
  tick = 0;
  level;
  players = /* @__PURE__ */ new Map();
  dummies = [];
  pending = [];
  nextSpawn = 0;
  constructor(level) {
    this.level = level;
    for (const d of level.dummies) {
      this.dummies.push({
        id: d.id,
        def: d,
        pos: clone(d.pos),
        health: DUMMY_MAX_HEALTH,
        alive: true,
        respawnTimer: 0,
        phase: 0,
        dir: 1,
        firstDamageTick: -1,
        hitsTaken: 0
      });
    }
  }
  get time() {
    return this.tick / SIM_HZ;
  }
  addPlayer(id, name = "BLANK") {
    const spawn = this.level.spawns[this.nextSpawn % this.level.spawns.length];
    this.nextSpawn++;
    const p = createPlayer(id, name, spawn);
    this.players.set(id, p);
    return p;
  }
  removePlayer(id) {
    this.players.delete(id);
  }
  /** Drain events produced since the last drain. */
  drainEvents() {
    const e = this.pending;
    this.pending = [];
    return e;
  }
  /**
   * Advance exactly one tick. Each player may carry several inputs (server
   * catch-up after loss) or none (online: freeze; offline: idle). A player's
   * movement depends only on their own inputs and the static level, so
   * applying inputs strictly in order keeps client prediction and server
   * simulation bit-identical.
   */
  step(inputs, opts = {}) {
    for (const p of this.players.values()) {
      const raw = inputs.get(p.id);
      const list = raw === void 0 ? [] : Array.isArray(raw) ? raw : [raw];
      if (list.length === 0) {
        if (opts.online) continue;
        list.push({ ...emptyInput(this.tick), yaw: p.yaw, pitch: p.pitch });
      }
      for (const input of list) this.applyInput(p, input, opts);
    }
    for (const p of this.players.values()) {
      if (p.pos.y < this.level.killY && p.alive) this.killPlayer(p, -1, opts);
      if (!p.alive && !opts.predictOnly) {
        p.respawnTimer -= SIM_DT;
        if (p.respawnTimer <= 0) {
          respawnPlayer(p, this.level.spawns[(p.id + this.tick) % this.level.spawns.length]);
          if (!opts.silent) this.pending.push({ tick: this.tick, playerId: p.id, type: "respawn" });
        }
      }
    }
    this.stepDummies();
    this.tick++;
  }
  /** Apply one input to one player: movement, then hitscan if a shot fired. */
  applyInput(p, input, opts = {}) {
    const events = [];
    stepPlayer(p, input, this.level.boxes, events);
    if (!opts.silent) for (const ev of events) this.pending.push({ tick: this.tick, playerId: p.id, ...ev });
    if (p.firedThisTick && p.alive) this.resolveShot(p, input.viewTick ?? this.tick, opts);
  }
  /** Exact local-player state for reconciliation (server → owning client). */
  exportLocal(p, seq) {
    return {
      seq,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      vx: p.vel.x,
      vy: p.vel.y,
      vz: p.vel.z,
      yaw: p.yaw,
      pitch: p.pitch,
      stance: p.stance === "stand" ? 0 : p.stance === "crouch" ? 1 : p.stance === "slide" ? 2 : 3,
      height: p.height,
      grounded: p.grounded ? 1 : 0,
      airTime: p.airTime,
      jumpBuffer: p.jumpBuffer,
      slideTime: p.slideTime,
      slideCooldown: p.slideCooldown,
      sdx: p.slideDir.x,
      sdz: p.slideDir.z,
      mfx: p.mantleFrom.x,
      mfy: p.mantleFrom.y,
      mfz: p.mantleFrom.z,
      mtx: p.mantleTo.x,
      mty: p.mantleTo.y,
      mtz: p.mantleTo.z,
      mantleT: p.mantleT,
      health: p.health,
      alive: p.alive ? 1 : 0,
      respawnTimer: p.respawnTimer,
      ammo: p.ammo,
      reloadTimer: p.reloadTimer,
      fireCooldown: p.fireCooldown,
      kickPitch: p.kickPitch,
      kickYaw: p.kickYaw,
      prevButtons: p.prevButtons,
      kills: p.stats.kills,
      deaths: p.stats.deaths,
      shots: p.stats.shots,
      hits: p.stats.hits
    };
  }
  importLocal(p, l) {
    set(p.pos, l.x, l.y, l.z);
    set(p.vel, l.vx, l.vy, l.vz);
    p.yaw = l.yaw;
    p.pitch = l.pitch;
    p.stance = l.stance === 0 ? "stand" : l.stance === 1 ? "crouch" : l.stance === 2 ? "slide" : "mantle";
    p.height = l.height;
    p.grounded = l.grounded === 1;
    p.airTime = l.airTime;
    p.jumpBuffer = l.jumpBuffer;
    p.slideTime = l.slideTime;
    p.slideCooldown = l.slideCooldown;
    set(p.slideDir, l.sdx, 0, l.sdz);
    set(p.mantleFrom, l.mfx, l.mfy, l.mfz);
    set(p.mantleTo, l.mtx, l.mty, l.mtz);
    p.mantleT = l.mantleT;
    p.health = l.health;
    p.alive = l.alive === 1;
    p.respawnTimer = l.respawnTimer;
    p.ammo = l.ammo;
    p.reloadTimer = l.reloadTimer;
    p.fireCooldown = l.fireCooldown;
    p.kickPitch = l.kickPitch;
    p.kickYaw = l.kickYaw;
    p.prevButtons = l.prevButtons;
    p.stats.kills = l.kills;
    p.stats.deaths = l.deaths;
    p.stats.shots = l.shots;
    p.stats.hits = l.hits;
  }
  /** Poses of every player right now (recorded per tick by the server for rewinds). */
  poses() {
    const m = /* @__PURE__ */ new Map();
    for (const p of this.players.values()) m.set(p.id, { pos: clone(p.pos), height: p.height, alive: p.alive });
    return m;
  }
  stepDummies() {
    for (const d of this.dummies) {
      if (!d.alive) {
        d.respawnTimer -= SIM_DT;
        if (d.respawnTimer <= 0) {
          d.alive = true;
          d.health = DUMMY_MAX_HEALTH;
          d.firstDamageTick = -1;
          d.hitsTaken = 0;
          this.pending.push({ tick: this.tick, playerId: -1, type: "dummyRespawn", dummyId: d.id });
        }
        continue;
      }
      const to = d.def.patrolTo;
      if (to) {
        const length = dist(d.def.pos, to);
        const speed = 1.6;
        d.phase += d.dir * speed * SIM_DT / Math.max(0.01, length);
        if (d.phase >= 1) {
          d.phase = 1;
          d.dir = -1;
        } else if (d.phase <= 0) {
          d.phase = 0;
          d.dir = 1;
        }
        d.pos.x = d.def.pos.x + (to.x - d.def.pos.x) * d.phase;
        d.pos.y = d.def.pos.y + (to.y - d.def.pos.y) * d.phase;
        d.pos.z = d.def.pos.z + (to.z - d.def.pos.z) * d.phase;
      }
    }
  }
  /**
   * Cast the shooter's view ray against the level, dummies and other players.
   * With `opts.rewind`, other players are tested at the poses they had at the
   * shooter's view tick (lag compensation, capped by the provider).
   */
  resolveShot(shooter, viewTick, opts) {
    const origin = eyePos(shooter);
    const dir = viewDir(shooter.yaw + shooter.kickYaw, shooter.pitch + shooter.kickPitch);
    const maxT = LEASE_BREAKER.range;
    let bestT = maxT;
    let hit = { kind: "none", id: -1, damage: 0 };
    for (const b of this.level.boxes) {
      const t = rayBox(origin, dir, b, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        hit = { kind: "world", id: -1, damage: 0 };
      }
    }
    const rewound = opts.predictOnly ? null : opts.rewind?.(shooter.id, viewTick) ?? null;
    let nearMiss = Infinity;
    for (const d of this.dummies) {
      if (!d.alive || opts.predictOnly) continue;
      const t = rayCapsule(origin, dir, d.pos, DUMMY_RADIUS, DUMMY_HEIGHT, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        const zone = zoneOf(origin.y + dir.y * t, d.pos.y, DUMMY_HEIGHT);
        hit = { kind: "dummy", id: d.id, zone, damage: Math.round(LEASE_BREAKER.damage * zoneMult(zone)) };
      }
    }
    for (const other of this.players.values()) {
      if (other === shooter || opts.predictOnly) continue;
      const pose = rewound?.get(other.id);
      if (!other.alive || pose && !pose.alive) continue;
      const pos = pose ? pose.pos : other.pos;
      const height = pose ? pose.height : other.height;
      {
        const cx = pos.x - origin.x, cy = pos.y + height * 0.5 - origin.y, cz = pos.z - origin.z;
        const along = cx * dir.x + cy * dir.y + cz * dir.z;
        if (along > 0) {
          const px = origin.x + dir.x * along, py = origin.y + dir.y * along, pz = origin.z + dir.z * along;
          const d = Math.sqrt((px - pos.x) ** 2 + (py - (pos.y + height * 0.5)) ** 2 + (pz - pos.z) ** 2);
          if (d < nearMiss) nearMiss = d;
        }
      }
      const t = rayCapsule(origin, dir, pos, MOVE.capsuleRadius, height, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        const zone = zoneOf(origin.y + dir.y * t, pos.y, height);
        hit = { kind: "player", id: other.id, zone, damage: Math.round(LEASE_BREAKER.damage * zoneMult(zone)) };
      }
    }
    const to = addScaled(origin, dir, bestT);
    if (!opts.silent) this.pending.push({ tick: this.tick, playerId: shooter.id, type: "shot", from: origin, to, hit, nearMiss: Number.isFinite(nearMiss) ? nearMiss : -1, rewindTicks: this.tick - viewTick });
    if (opts.predictOnly) return;
    if (hit.kind === "dummy") {
      const d = this.dummies.find((x) => x.id === hit.id);
      shooter.stats.hits++;
      if (d.firstDamageTick < 0) d.firstDamageTick = this.tick;
      d.hitsTaken++;
      d.health -= hit.damage;
      if (d.health <= 0) {
        d.alive = false;
        d.respawnTimer = DUMMY_RESPAWN_SECONDS;
        shooter.stats.kills++;
        const ttk = this.tick - d.firstDamageTick;
        this.pending.push({ tick: this.tick, playerId: shooter.id, type: "kill", victimKind: "dummy", victimId: d.id, ttkTicks: ttk, ttkSeconds: ttk / SIM_HZ });
      }
    } else if (hit.kind === "player") {
      const v = this.players.get(hit.id);
      shooter.stats.hits++;
      if (v.firstDamageTick < 0) v.firstDamageTick = this.tick;
      v.lastAttacker = shooter.id;
      v.health -= hit.damage;
      if (v.health <= 0) {
        const ttk = this.tick - v.firstDamageTick;
        this.killPlayer(v, shooter.id, opts);
        shooter.stats.kills++;
        if (!opts.silent) this.pending.push({ tick: this.tick, playerId: shooter.id, type: "kill", victimKind: "player", victimId: v.id, ttkTicks: ttk, ttkSeconds: ttk / SIM_HZ });
      }
    }
  }
  killPlayer(v, killerId, opts = {}) {
    v.alive = false;
    v.health = 0;
    v.respawnTimer = 3;
    v.stats.deaths++;
    if (!opts.silent) this.pending.push({ tick: this.tick, playerId: v.id, type: "death", killerId });
  }
  /** Direction from a player's eye to a dummy's chest; used by bots and tests. */
  aimAt(p, target) {
    const e = eyePos(p);
    const d = normalize(sub(target, e));
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))) };
  }
};

// shared/net/protocol.ts
var PROTOCOL_VERSION = 2;
var SNAPSHOT_EVERY = 2;
var MAX_REWIND_TICKS = 12;
var MAX_INPUT_QUEUE = 24;
var Msg = {
  Join: 1,
  Input: 2,
  Ping: 3,
  Welcome: 10,
  Snapshot: 11,
  Pong: 12,
  Kick: 13
};
var W = class {
  static {
    __name(this, "W");
  }
  buf = new ArrayBuffer(2048);
  dv = new DataView(this.buf);
  o = 0;
  grow(n) {
    if (this.o + n <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(new Uint8Array(this.buf));
    this.buf = nb;
    this.dv = new DataView(nb);
  }
  u8(v) {
    this.grow(1);
    this.dv.setUint8(this.o, v);
    this.o += 1;
  }
  u16(v) {
    this.grow(2);
    this.dv.setUint16(this.o, v, true);
    this.o += 2;
  }
  i16(v) {
    this.grow(2);
    this.dv.setInt16(this.o, Math.max(-32768, Math.min(32767, Math.round(v))), true);
    this.o += 2;
  }
  u32(v) {
    this.grow(4);
    this.dv.setUint32(this.o, v >>> 0, true);
    this.o += 4;
  }
  f32(v) {
    this.grow(4);
    this.dv.setFloat32(this.o, v, true);
    this.o += 4;
  }
  f64(v) {
    this.grow(8);
    this.dv.setFloat64(this.o, v, true);
    this.o += 8;
  }
  str(s) {
    const b = new TextEncoder().encode(s);
    this.u16(b.length);
    this.grow(b.length);
    new Uint8Array(this.buf, this.o, b.length).set(b);
    this.o += b.length;
  }
  done() {
    return this.buf.slice(0, this.o);
  }
};
var R = class {
  static {
    __name(this, "R");
  }
  dv;
  o = 0;
  constructor(buf) {
    this.dv = new DataView(buf);
  }
  get remaining() {
    return this.dv.byteLength - this.o;
  }
  u8() {
    const v = this.dv.getUint8(this.o);
    this.o += 1;
    return v;
  }
  u16() {
    const v = this.dv.getUint16(this.o, true);
    this.o += 2;
    return v;
  }
  i16() {
    const v = this.dv.getInt16(this.o, true);
    this.o += 2;
    return v;
  }
  u32() {
    const v = this.dv.getUint32(this.o, true);
    this.o += 4;
    return v;
  }
  f32() {
    const v = this.dv.getFloat32(this.o, true);
    this.o += 4;
    return v;
  }
  f64() {
    const v = this.dv.getFloat64(this.o, true);
    this.o += 8;
    return v;
  }
  str() {
    const n = this.u16();
    const b = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.o, n);
    this.o += n;
    return new TextDecoder().decode(b);
  }
};
var Q_POS = 100;
var Q_VEL = 100;
var Q_ANG = 1e4;
function encodeWelcome(playerId, tick, token, levelName) {
  const w = new W();
  w.u8(Msg.Welcome);
  w.u8(playerId);
  w.u32(tick);
  w.str(token);
  w.str(levelName);
  return w.done();
}
__name(encodeWelcome, "encodeWelcome");
function encodePong(clientTime, tick) {
  const w = new W();
  w.u8(Msg.Pong);
  w.u32(clientTime);
  w.u32(tick);
  return w.done();
}
__name(encodePong, "encodePong");
function encodeKick(reason) {
  const w = new W();
  w.u8(Msg.Kick);
  w.str(reason);
  return w.done();
}
__name(encodeKick, "encodeKick");
var F_POS = 1;
var F_VEL = 2;
var F_VIEW = 4;
var F_STATE = 8;
var F_NAME = 16;
function quantizeRemote(p) {
  return {
    ...p,
    x: Math.round(p.x * Q_POS) / Q_POS,
    y: Math.round(p.y * Q_POS) / Q_POS,
    z: Math.round(p.z * Q_POS) / Q_POS,
    vx: Math.round(p.vx * Q_VEL) / Q_VEL,
    vy: Math.round(p.vy * Q_VEL) / Q_VEL,
    vz: Math.round(p.vz * Q_VEL) / Q_VEL,
    yaw: Math.round(p.yaw * Q_ANG) / Q_ANG,
    pitch: Math.round(p.pitch * Q_ANG) / Q_ANG,
    height: Math.round(p.height * Q_POS) / Q_POS
  };
}
__name(quantizeRemote, "quantizeRemote");
function encodeSnapshot(s, baseline) {
  const w = new W();
  w.u8(Msg.Snapshot);
  w.u32(s.tick);
  w.u32(baseline ? baseline.tick : 0);
  w.u32(s.serverTimeMs >>> 0);
  if (s.local) {
    w.u8(1);
    const l = s.local;
    w.u32(l.seq);
    for (const v of [l.x, l.y, l.z, l.vx, l.vy, l.vz, l.yaw, l.pitch, l.height, l.airTime, l.jumpBuffer, l.slideTime, l.slideCooldown, l.sdx, l.sdz, l.mfx, l.mfy, l.mfz, l.mtx, l.mty, l.mtz, l.mantleT, l.respawnTimer, l.reloadTimer, l.fireCooldown, l.kickPitch, l.kickYaw]) w.f64(v);
    w.u8(l.stance);
    w.u8(l.grounded);
    w.u8(l.alive);
    w.i16(l.health);
    w.u8(l.ammo);
    w.u16(l.prevButtons);
    w.u16(l.kills);
    w.u16(l.deaths);
    w.u32(l.shots);
    w.u32(l.hits);
  } else w.u8(0);
  w.u8(s.players.length);
  for (const p of s.players) {
    const b = baseline?.players.find((x) => x.id === p.id);
    let mask = 0;
    if (!b || b.x !== p.x || b.y !== p.y || b.z !== p.z) mask |= F_POS;
    if (!b || b.vx !== p.vx || b.vy !== p.vy || b.vz !== p.vz) mask |= F_VEL;
    if (!b || b.yaw !== p.yaw || b.pitch !== p.pitch) mask |= F_VIEW;
    if (!b || b.health !== p.health || b.ammo !== p.ammo || b.alive !== p.alive || b.grounded !== p.grounded || b.stance !== p.stance || b.height !== p.height) mask |= F_STATE;
    if (!b || b.name !== p.name) mask |= F_NAME;
    w.u8(p.id);
    w.u8(mask);
    if (mask & F_POS) {
      w.i16(p.x * Q_POS);
      w.i16(p.y * Q_POS);
      w.i16(p.z * Q_POS);
    }
    if (mask & F_VEL) {
      w.i16(p.vx * Q_VEL);
      w.i16(p.vy * Q_VEL);
      w.i16(p.vz * Q_VEL);
    }
    if (mask & F_VIEW) {
      w.i16(p.yaw * Q_ANG);
      w.i16(p.pitch * Q_ANG);
    }
    if (mask & F_STATE) {
      w.i16(p.health);
      w.u8(p.ammo);
      w.u8((p.alive ? 1 : 0) | (p.grounded ? 2 : 0) | p.stance << 2);
      w.i16(p.height * Q_POS);
    }
    if (mask & F_NAME) w.str(p.name);
  }
  w.u8(s.dummies.length);
  for (const d of s.dummies) {
    w.u8(d.id);
    w.u8(d.alive ? 1 : 0);
    w.i16(d.health);
    w.i16(d.x * Q_POS);
    w.i16(d.y * Q_POS);
    w.i16(d.z * Q_POS);
  }
  w.u8(Math.min(255, s.events.length));
  for (const e of s.events.slice(0, 255)) {
    switch (e.type) {
      case "shot":
        w.u8(1);
        w.u8(e.playerId);
        w.i16(e.fx * Q_POS);
        w.i16(e.fy * Q_POS);
        w.i16(e.fz * Q_POS);
        w.i16(e.tx * Q_POS);
        w.i16(e.ty * Q_POS);
        w.i16(e.tz * Q_POS);
        w.u8(e.hitKind);
        w.u8(e.zone === "head" ? 1 : e.zone === "legs" ? 2 : 0);
        w.u8(e.victimId & 255);
        break;
      case "kill":
        w.u8(2);
        w.u8(e.playerId);
        w.u8(e.victimKind);
        w.u8(e.victimId & 255);
        w.u16(e.ttkTicks);
        break;
      case "death":
        w.u8(3);
        w.u8(e.playerId);
        w.u8(e.killerId & 255);
        break;
      case "join":
        w.u8(4);
        w.u8(e.playerId);
        w.str(e.name);
        break;
      case "leave":
        w.u8(5);
        w.u8(e.playerId);
        break;
    }
  }
  return w.done();
}
__name(encodeSnapshot, "encodeSnapshot");
function decodeClientMessage(buf) {
  try {
    const r = new R(buf);
    const t = r.u8();
    if (t === Msg.Join) return { type: "join", version: r.u8(), name: r.str(), token: r.str() };
    if (t === Msg.Input) {
      const ackTick = r.u32();
      const n = r.u8();
      if (n > 32) return null;
      const inputs = [];
      for (let i = 0; i < n; i++) {
        inputs.push({ seq: r.u32(), tick: r.u32(), buttons: r.u16(), yaw: r.i16() / Q_ANG, pitch: r.i16() / Q_ANG, viewTick: r.u32(), px: r.f64(), py: r.f64(), pz: r.f64() });
      }
      if (r.remaining !== 0) return null;
      return { type: "input", ackTick, inputs };
    }
    if (t === Msg.Ping) return { type: "ping", clientTime: r.u32() };
    return null;
  } catch {
    return null;
  }
}
__name(decodeClientMessage, "decodeClientMessage");
var stanceToNum = /* @__PURE__ */ __name((s) => s === "stand" ? 0 : s === "crouch" ? 1 : s === "slide" ? 2 : 3, "stanceToNum");

// server/room.ts
var MAX_INPUTS_PER_TICK = 6;
var MAX_INPUT_RATE_PER_SEC = 95;
var MAX_STRIKES = 3;
var Room = class {
  static {
    __name(this, "Room");
  }
  world = new World(drainageYard());
  opts;
  clients = /* @__PURE__ */ new Map();
  byConn = /* @__PURE__ */ new Map();
  history = /* @__PURE__ */ new Map();
  nextId = 1;
  tickTimes = [];
  tickCount = 0;
  startedAt;
  lastRateAt;
  lastRateTick = 0;
  tickHz = 0;
  kicks = 0;
  /** Last few large prediction/server divergences, for diagnosis. */
  traceLog = [];
  shotDiag = { shots: 0, playerHits: 0, rewindSum: 0, rewindMax: 0, clamped: 0, nearMissSum: 0, nearMissN: 0, nearMissMax: 0 };
  constructor(opts = {}) {
    this.opts = {
      lagComp: opts.lagComp ?? true,
      maxPlayers: opts.maxPlayers ?? 8,
      rejoinGraceSeconds: opts.rejoinGraceSeconds ?? 60,
      now: opts.now ?? (() => Date.now()),
      onLog: opts.onLog ?? (() => {
      })
    };
    this.startedAt = this.opts.now();
    this.lastRateAt = this.startedAt;
  }
  get tick() {
    return this.world.tick;
  }
  // ---- connection lifecycle ----
  onOpen(_conn) {
  }
  onMessage(conn, buf) {
    const msg = decodeClientMessage(buf);
    const rec = this.byConn.get(conn);
    if (!msg) {
      if (rec) this.strike(rec, "malformed message");
      else this.kickConn(conn, "malformed message before join");
      return;
    }
    if (msg.type === "join") {
      if (rec) return this.strike(rec, "duplicate join");
      if (msg.version !== PROTOCOL_VERSION) return this.kickConn(conn, `protocol ${msg.version} != ${PROTOCOL_VERSION}`);
      this.join(conn, msg.name, msg.token);
      return;
    }
    if (!rec) return this.kickConn(conn, "message before join");
    if (msg.type === "ping") {
      conn.send(encodePong(msg.clientTime, this.tick));
      return;
    }
    rec.ackTick = Math.max(rec.ackTick, msg.ackTick);
    const now = this.opts.now();
    if (now - rec.inputWindowStart >= 1e3) {
      rec.inputWindowStart = now;
      rec.inputCount = 0;
    }
    for (const i of msg.inputs) {
      if (i.seq <= rec.lastSeq) continue;
      if (i.seq !== rec.lastSeq + 1 && rec.lastSeq !== 0) {
      }
      if (!this.validInput(i)) {
        rec.inputsRejected++;
        this.strike(rec, "invalid input");
        continue;
      }
      rec.inputCount++;
      if (rec.inputCount > MAX_INPUT_RATE_PER_SEC) {
        rec.inputsRejected++;
        this.strike(rec, "input rate");
        continue;
      }
      if (rec.queue.length >= MAX_INPUT_QUEUE) {
        rec.queue.shift();
        rec.inputsRejected++;
      }
      rec.lastSeq = i.seq;
      rec.queue.push(i);
    }
  }
  onClose(conn) {
    const rec = this.byConn.get(conn);
    if (!rec) return;
    this.byConn.delete(conn);
    rec.conn = null;
    rec.disconnectedAt = this.opts.now();
    rec.queue.length = 0;
    this.opts.onLog(`player ${rec.playerId} (${rec.name}) disconnected; rejoin window ${this.opts.rejoinGraceSeconds}s`);
  }
  validInput(i) {
    if (!Number.isFinite(i.yaw) || !Number.isFinite(i.pitch)) return false;
    if (Math.abs(i.pitch) > 1.6) return false;
    if (i.buttons < 0 || i.buttons > 1023) return false;
    if (!Number.isFinite(i.px) || !Number.isFinite(i.py) || !Number.isFinite(i.pz)) return false;
    return true;
  }
  strike(rec, why) {
    const now = this.opts.now();
    if (now - rec.strikeWindowStart > 5e3) {
      rec.strikeWindowStart = now;
      rec.strikes = 0;
    }
    rec.strikes++;
    this.opts.onLog(`strike ${rec.strikes}/${MAX_STRIKES} on player ${rec.playerId}: ${why}`);
    if (rec.strikes >= MAX_STRIKES) this.kick(rec, why);
  }
  kick(rec, reason) {
    this.kicks++;
    this.opts.onLog(`kick player ${rec.playerId}: ${reason}`);
    if (rec.conn) {
      try {
        rec.conn.send(encodeKick(reason));
        rec.conn.close(4001, reason.slice(0, 100));
      } catch {
      }
      this.byConn.delete(rec.conn);
      rec.conn = null;
    }
    this.removePlayer(rec);
  }
  kickConn(conn, reason) {
    this.kicks++;
    this.opts.onLog(`kick connection: ${reason}`);
    try {
      conn.send(encodeKick(reason));
      conn.close(4001, reason.slice(0, 100));
    } catch {
    }
  }
  removePlayer(rec) {
    this.clients.delete(rec.playerId);
    this.world.removePlayer(rec.playerId);
    for (const other of this.clients.values()) other.pendingEvents.push({ type: "leave", playerId: rec.playerId });
  }
  join(conn, name, token) {
    const safeName = (name || "BLANK").replace(/[^\x20-\x7e]/g, "").slice(0, 16) || "BLANK";
    if (token) {
      for (const rec2 of this.clients.values()) {
        if (rec2.token === token && rec2.conn === null) {
          rec2.conn = conn;
          rec2.queue.length = 0;
          rec2.sent.clear();
          rec2.ackTick = 0;
          rec2.lastSeq = 0;
          rec2.lastAppliedSeq = 0;
          rec2.traceSkipUntilSeq = 0;
          rec2.strikes = 0;
          this.byConn.set(conn, rec2);
          conn.send(encodeWelcome(rec2.playerId, this.tick, rec2.token, this.world.level.name));
          this.opts.onLog(`player ${rec2.playerId} rejoined`);
          return;
        }
      }
    }
    if (this.clients.size >= this.opts.maxPlayers) return this.kickConn(conn, "room full");
    const playerId = this.nextId++;
    const newToken = `${playerId}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
    const rec = {
      conn,
      playerId,
      token: newToken,
      name: safeName,
      joined: true,
      queue: [],
      lastSeq: 0,
      lastAppliedSeq: 0,
      ackTick: 0,
      strikes: 0,
      strikeWindowStart: 0,
      inputWindowStart: this.opts.now(),
      inputCount: 0,
      disconnectedAt: 0,
      pendingEvents: [],
      sent: /* @__PURE__ */ new Map(),
      bytesOut: 0,
      traceMaxErr: 0,
      traceSamples: 0,
      inputsApplied: 0,
      inputsRejected: 0,
      traceSkipUntilSeq: 0
    };
    this.clients.set(playerId, rec);
    this.byConn.set(conn, rec);
    this.world.addPlayer(playerId, safeName);
    conn.send(encodeWelcome(playerId, this.tick, newToken, this.world.level.name));
    for (const other of this.clients.values()) if (other !== rec) other.pendingEvents.push({ type: "join", playerId, name: safeName });
    this.opts.onLog(`player ${playerId} (${safeName}) joined`);
  }
  // ---- simulation ----
  /** Advance one tick. Hosts call this at SIM_HZ. */
  step() {
    const t0 = performance.now();
    const now = this.opts.now();
    for (const rec of [...this.clients.values()]) {
      if (rec.conn === null && now - rec.disconnectedAt > this.opts.rejoinGraceSeconds * 1e3) this.removePlayer(rec);
    }
    const inputs = /* @__PURE__ */ new Map();
    const applied = /* @__PURE__ */ new Map();
    for (const rec of this.clients.values()) {
      if (rec.queue.length === 0) continue;
      const list = rec.queue.splice(0, Math.min(MAX_INPUTS_PER_TICK, rec.queue.length));
      inputs.set(rec.playerId, list);
      applied.set(rec.playerId, list);
    }
    const wasAlive = /* @__PURE__ */ new Map();
    for (const p of this.world.players.values()) wasAlive.set(p.id, p.alive);
    this.world.step(inputs, { online: true, rewind: this.opts.lagComp ? (id, viewTick) => this.rewindFor(id, viewTick) : void 0 });
    for (const p of this.world.players.values()) {
      const rec = this.clients.get(p.id);
      if (rec && !wasAlive.get(p.id) && p.alive) rec.traceSkipUntilSeq = rec.lastSeq + 120;
    }
    for (const [id, list] of applied) {
      const rec = this.clients.get(id);
      const p = this.world.players.get(id);
      const last = list[list.length - 1];
      rec.lastAppliedSeq = last.seq;
      rec.inputsApplied += list.length;
      if (p.alive && last.seq > rec.traceSkipUntilSeq) {
        const err = Math.hypot(p.pos.x - last.px, p.pos.y - last.py, p.pos.z - last.pz);
        rec.traceSamples++;
        if (err > rec.traceMaxErr) rec.traceMaxErr = err;
        if (err > 0.02 && this.traceLog.length < 12) this.traceLog.push({ tick: this.tick, id, seq: last.seq, err, batch: list.length, queue: rec.queue.length, alive: p.alive, stance: p.stance, srv: [+p.pos.x.toFixed(3), +p.pos.y.toFixed(3), +p.pos.z.toFixed(3)], cli: [+last.px.toFixed(3), +last.py.toFixed(3), +last.pz.toFixed(3)], buttons: last.buttons, yawIn: +last.yaw.toFixed(4), yawP: +p.yaw.toFixed(4), vel: [+p.vel.x.toFixed(2), +p.vel.z.toFixed(2)] });
      }
    }
    this.history.set(this.tick, this.world.poses());
    this.history.delete(this.tick - 64);
    for (const ev of this.world.drainEvents()) {
      if (ev.type === "death" || ev.type === "respawn" || ev.type === "kill") {
        const p = this.world.players.get(ev.playerId);
        this.opts.onLog(`t${this.tick} ${ev.type} player ${ev.playerId} at (${p?.pos.x.toFixed(1)},${p?.pos.y.toFixed(1)},${p?.pos.z.toFixed(1)}) lastSeq ${this.clients.get(ev.playerId)?.lastSeq}`);
      }
      if (ev.type === "shot") {
        const d = this.shotDiag;
        d.shots++;
        if (ev.hit.kind === "player") d.playerHits++;
        d.rewindSum += ev.rewindTicks;
        if (ev.rewindTicks > d.rewindMax) d.rewindMax = ev.rewindTicks;
        if (ev.rewindTicks > MAX_REWIND_TICKS) d.clamped++;
        if (ev.nearMiss >= 0 && ev.hit.kind !== "player") {
          d.nearMissSum += ev.nearMiss;
          d.nearMissN++;
          if (ev.nearMiss > d.nearMissMax) d.nearMissMax = ev.nearMiss;
        }
      }
      const ne = this.toNetEvent(ev);
      if (!ne) continue;
      for (const rec of this.clients.values()) rec.pendingEvents.push(ne);
    }
    if (this.tick % SNAPSHOT_EVERY === 0) this.broadcast();
    const dt = performance.now() - t0;
    this.tickTimes.push(dt);
    if (this.tickTimes.length > 600) this.tickTimes.shift();
    this.tickCount++;
    if (now - this.lastRateAt >= 1e3) {
      this.tickHz = (this.tick - this.lastRateTick) * 1e3 / (now - this.lastRateAt);
      this.lastRateAt = now;
      this.lastRateTick = this.tick;
    }
  }
  rewindFor(shooterId, viewTick) {
    const target = Math.max(this.tick - MAX_REWIND_TICKS, Math.min(this.tick, viewTick));
    const poses = this.history.get(target);
    if (!poses) return null;
    void shooterId;
    return poses;
  }
  toNetEvent(ev) {
    switch (ev.type) {
      case "shot":
        return {
          type: "shot",
          playerId: ev.playerId,
          fx: ev.from.x,
          fy: ev.from.y,
          fz: ev.from.z,
          tx: ev.to.x,
          ty: ev.to.y,
          tz: ev.to.z,
          hitKind: ev.hit.kind === "none" ? 0 : ev.hit.kind === "world" ? 1 : ev.hit.kind === "dummy" ? 2 : 3,
          zone: ev.hit.zone,
          victimId: ev.hit.id < 0 ? 255 : ev.hit.id
        };
      case "kill":
        return { type: "kill", playerId: ev.playerId, victimKind: ev.victimKind === "dummy" ? 0 : 1, victimId: ev.victimId, ttkTicks: ev.ttkTicks };
      case "death":
        return { type: "death", playerId: ev.playerId, killerId: ev.killerId < 0 ? 255 : ev.killerId };
      default:
        return null;
    }
  }
  broadcast() {
    const serverTimeMs = this.opts.now();
    for (const rec of this.clients.values()) {
      if (!rec.conn) {
        rec.pendingEvents.length = 0;
        continue;
      }
      const me = this.world.players.get(rec.playerId);
      const players = [...this.world.players.values()].filter((p) => p.id !== rec.playerId).map((p) => this.quantized(p));
      const dummies = this.world.dummies.map((d) => ({ id: d.id, alive: d.alive, health: d.health, x: d.pos.x, y: d.pos.y, z: d.pos.z }));
      const snap = {
        tick: this.tick,
        serverTimeMs,
        // exact local state at 15 Hz is plenty for reconciliation and halves the snapshot
        local: this.tick % (SNAPSHOT_EVERY * 2) === 0 ? this.world.exportLocal(me, rec.lastAppliedSeq) : null,
        players,
        dummies,
        events: rec.pendingEvents.splice(0)
      };
      const baseline = rec.ackTick ? rec.sent.get(rec.ackTick) ?? null : null;
      const buf = encodeSnapshot(snap, baseline);
      rec.bytesOut += buf.byteLength;
      const stored = { ...snap, bytes: buf.byteLength, events: [] };
      rec.sent.set(this.tick, stored);
      rec.sent.delete(this.tick - 40 * SNAPSHOT_EVERY);
      try {
        rec.conn.send(buf);
      } catch {
      }
    }
  }
  quantized(p) {
    const rec = this.clients.get(p.id);
    return quantizeRemote({
      id: p.id,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      vx: p.vel.x,
      vy: p.vel.y,
      vz: p.vel.z,
      yaw: p.yaw,
      pitch: p.pitch,
      health: Math.max(0, Math.round(p.health)),
      ammo: p.ammo,
      alive: p.alive,
      grounded: p.grounded,
      stance: stanceToNum(p.stance),
      height: p.height,
      name: rec?.name ?? p.name
    });
  }
  stats() {
    const times = this.tickTimes;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const max = times.length ? Math.max(...times) : 0;
    let inputsRejected = 0;
    let bytesOut = 0;
    const clients = [...this.clients.values()].map((c) => {
      inputsRejected += c.inputsRejected;
      bytesOut += c.bytesOut;
      const p = this.world.players.get(c.playerId);
      return {
        id: c.playerId,
        name: c.name,
        connected: c.conn !== null,
        traceMaxErr: c.traceMaxErr,
        traceSamples: c.traceSamples,
        inputsApplied: c.inputsApplied,
        inputsRejected: c.inputsRejected,
        kills: p.stats.kills,
        deaths: p.stats.deaths,
        shots: p.stats.shots,
        hits: p.stats.hits,
        queue: c.queue.length
      };
    });
    return {
      tick: this.tick,
      players: this.clients.size,
      connected: this.byConn.size,
      tickHz: this.tickHz || this.tick * 1e3 / Math.max(1, this.opts.now() - this.startedAt),
      avgTickMs: avg,
      maxTickMs: max,
      kicks: this.kicks,
      inputsRejected,
      bytesOut,
      clients,
      traceLog: this.traceLog,
      shotDiag: { ...this.shotDiag, avgRewind: this.shotDiag.shots ? this.shotDiag.rewindSum / this.shotDiag.shots : 0, avgNearMiss: this.shotDiag.nearMissN ? this.shotDiag.nearMissSum / this.shotDiag.nearMissN : 0 }
    };
  }
};
var SERVER_TICK_MS = 1e3 / SIM_HZ;

// server/worker.ts
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,32})$/);
    if (m) {
      const id = env.MATCH_ROOM.idFromName(m[1]);
      return env.MATCH_ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("meltdown worker", { status: 404 });
  }
};
var MatchRoom = class {
  static {
    __name(this, "MatchRoom");
  }
  room;
  timer = null;
  next = 0;
  sockets = 0;
  idleSince = 0;
  constructor(_state) {
    this.room = new Room({});
  }
  ensureLoop() {
    if (this.timer) return;
    this.next = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      let n = 0;
      while (now >= this.next && n < 10) {
        this.room.step();
        this.next += SERVER_TICK_MS;
        n++;
      }
      if (n === 10) this.next = now;
      if (this.sockets === 0) {
        if (!this.idleSince) this.idleSince = now;
        else if (now - this.idleSince > 1e4 && this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      } else this.idleSince = 0;
    }, SERVER_TICK_MS / 2);
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/stats")) return Response.json(this.room.stats());
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const conn = {
      send: /* @__PURE__ */ __name((buf) => server.send(buf), "send"),
      close: /* @__PURE__ */ __name((code, reason) => server.close(code, reason), "close")
    };
    this.sockets++;
    this.room.onOpen(conn);
    server.addEventListener("message", (ev) => {
      if (ev.data instanceof ArrayBuffer) this.room.onMessage(conn, ev.data);
      else this.room.onMessage(conn, new ArrayBuffer(0));
    });
    const closed = /* @__PURE__ */ __name(() => {
      this.sockets = Math.max(0, this.sockets - 1);
      this.room.onClose(conn);
    }, "closed");
    server.addEventListener("close", closed);
    server.addEventListener("error", closed);
    this.ensureLoop();
    return new Response(null, { status: 101, webSocket: client });
  }
};

// ../../../root/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../root/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-W0YXhV/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../root/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-W0YXhV/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  MatchRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
