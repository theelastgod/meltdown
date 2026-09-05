import { describe, expect, it } from "vitest";
import { Btn, SPRINT, makeWorld, run } from "./helpers";
import { MOVE, SIM_HZ, LEASE_BREAKER, DUMMY_MAX_HEALTH } from "../shared/sim/constants";
import { hashWorld, World } from "../shared/sim/world";
import { drainageYard } from "../shared/sim/level";
import { capsuleBoxContact, rayBox, rayCapsule } from "../shared/sim/collision";
import { v3 } from "../shared/math/vec3";

describe("collision primitives", () => {
  const b = { min: v3(-1, 0, -1), max: v3(1, 2, 1) };
  it("capsule beside a box is separated", () => {
    expect(capsuleBoxContact(v3(2, 0, 0), 0.4, 1.8, b)).toBeNull();
  });
  it("capsule overlapping a wall gets a horizontal normal", () => {
    const c = capsuleBoxContact(v3(1.2, 0, 0), 0.4, 1.8, b)!;
    expect(c).not.toBeNull();
    expect(c.normal.x).toBeCloseTo(1);
    expect(c.depth).toBeCloseTo(0.2, 5);
  });
  it("capsule standing on top gets an upward normal", () => {
    const c = capsuleBoxContact(v3(0, 1.95, 0), 0.4, 1.8, b)!;
    expect(c.normal.y).toBeCloseTo(1);
    expect(c.depth).toBeCloseTo(0.05, 5);
  });
  it("ray hits a box and a capsule at the right distances", () => {
    expect(rayBox(v3(-5, 1, 0), v3(1, 0, 0), b, 100)).toBeCloseTo(4);
    expect(rayBox(v3(-5, 5, 0), v3(1, 0, 0), b, 100)).toBeNull();
    expect(rayCapsule(v3(-5, 0.9, 0), v3(1, 0, 0), v3(0, 0, 0), 0.4, 1.8, 100)).toBeCloseTo(4.6);
    expect(rayCapsule(v3(-5, 1.9, 0), v3(1, 0, 0), v3(0, 0, 0), 0.4, 1.8, 100)).toBeNull();
  });
});

describe("determinism", () => {
  it("same input trace produces identical world hashes", () => {
    const script = [
      { ticks: 60, buttons: SPRINT, yaw: 0 },
      { ticks: 30, buttons: SPRINT | Btn.Crouch },
      { ticks: 10, buttons: SPRINT | Btn.Crouch | Btn.Jump },
      { ticks: 60, buttons: Btn.Forward | Btn.Left, yaw: 0.4 },
      { ticks: 40, buttons: Btn.Fire, aimAt: { x: 0, y: 3.6, z: -12 } },
      { ticks: 120, buttons: SPRINT | Btn.Jump, yaw: 0 },
      { ticks: 60, buttons: Btn.Back | Btn.Right, yaw: -1.2 },
    ];
    const a = makeWorld();
    const b = makeWorld();
    const hashesA: string[] = [];
    const hashesB: string[] = [];
    for (const s of script) {
      run(a.world, a.player, [s]);
      run(b.world, b.player, [s]);
      hashesA.push(hashWorld(a.world));
      hashesB.push(hashWorld(b.world));
    }
    expect(hashesA).toEqual(hashesB);
    // and the run actually did something
    expect(a.player.pos.z).toBeLessThan(20);
    expect(a.player.stats.shots).toBeGreaterThan(0);
  });
});

describe("movement", () => {
  it("settles onto the floor and reaches sprint speed", () => {
    const { world, player } = makeWorld();
    run(world, player, [{ ticks: 30, buttons: 0 }]);
    expect(player.grounded).toBe(true);
    expect(player.pos.y).toBeCloseTo(0, 2);
    run(world, player, [{ ticks: 60, buttons: SPRINT, yaw: 0 }]);
    expect(Math.hypot(player.vel.x, player.vel.z)).toBeCloseTo(MOVE.sprintSpeed, 1);
    expect(player.pos.z).toBeLessThan(24 - 5);
  });

  it("never penetrates a wall when sprinting into it", () => {
    const { world, player } = makeWorld();
    player.pos.z = 10;
    run(world, player, [{ ticks: 30 }, { ticks: 600, buttons: SPRINT, yaw: -Math.PI / 2 }]); // run +X into east wall (x=32)
    expect(player.pos.x + MOVE.capsuleRadius).toBeLessThanOrEqual(32 + 1e-3);
    expect(player.pos.x + MOVE.capsuleRadius).toBeGreaterThan(31.9);
    expect(Math.hypot(player.vel.x, player.vel.z)).toBeLessThan(0.5);
  });

  it("steps up the 0.3 m curb without jumping", () => {
    const { world, player } = makeWorld();
    const r = run(world, player, [{ ticks: 30 }, { ticks: 150, buttons: SPRINT, yaw: 0 }]);
    // spawn z=24 → curb at z=12: ~12 m at ~7 m/s ≈ 1.7 s
    expect(player.pos.z).toBeLessThan(11);
    expect(r.events.some((e) => e.type === "jump")).toBe(false);
    expect(player.grounded).toBe(true);
    // crossed the curb and came back down
    expect(player.pos.y).toBeCloseTo(0, 2);
  });

  it("jumps ~1.2 m and lands", () => {
    const { world, player } = makeWorld();
    let peak = 0;
    run(world, player, [{ ticks: 30 }]);
    const r = run(world, player, [{ ticks: 1, buttons: Btn.Jump }]);
    expect(r.events.some((e) => e.type === "jump")).toBe(true);
    for (let i = 0; i < 90; i++) {
      run(world, player, [{ ticks: 1 }]);
      peak = Math.max(peak, player.pos.y);
    }
    expect(peak).toBeGreaterThan(1.0);
    expect(peak).toBeLessThan(1.5);
    expect(player.grounded).toBe(true);
  });

  it("slides from a sprint, boosts, decays, and preserves momentum on exit", () => {
    const { world, player } = makeWorld();
    run(world, player, [{ ticks: 30 }, { ticks: 60, buttons: SPRINT, yaw: 0 }]);
    const r = run(world, player, [{ ticks: 1, buttons: SPRINT | Btn.Crouch }]);
    expect(r.events.some((e) => e.type === "slide")).toBe(true);
    expect(player.stance).toBe("slide");
    const entry = Math.hypot(player.vel.x, player.vel.z);
    expect(entry).toBeGreaterThan(MOVE.sprintSpeed + 1);
    run(world, player, [{ ticks: 20, buttons: SPRINT | Btn.Crouch }]);
    const later = Math.hypot(player.vel.x, player.vel.z);
    expect(later).toBeLessThan(entry);
    expect(later).toBeGreaterThan(MOVE.sprintSpeed); // still faster than a sprint after 1/3 s
    // release crouch: stand up but keep the velocity vector
    const r2 = run(world, player, [{ ticks: 1, buttons: SPRINT }]);
    expect(r2.events.some((e) => e.type === "slideEnd")).toBe(true);
    expect(player.stance).toBe("stand");
    expect(Math.hypot(player.vel.x, player.vel.z)).toBeCloseTo(later, 0);
  });

  it("slide-jump launches with the full slide velocity", () => {
    const { world, player } = makeWorld();
    run(world, player, [{ ticks: 30 }, { ticks: 60, buttons: SPRINT, yaw: 0 }, { ticks: 6, buttons: SPRINT | Btn.Crouch }]);
    const before = Math.hypot(player.vel.x, player.vel.z);
    const r = run(world, player, [{ ticks: 1, buttons: SPRINT | Btn.Crouch | Btn.Jump }]);
    expect(r.events.some((e) => e.type === "slideJump")).toBe(true);
    expect(player.vel.y).toBeCloseTo(MOVE.slideJumpVel - MOVE.gravity / SIM_HZ, 3); // gravity already applied this tick
    expect(Math.hypot(player.vel.x, player.vel.z)).toBeCloseTo(before, 3);
    run(world, player, [{ ticks: 30, buttons: SPRINT | Btn.Crouch }]);
    // still carrying > sprint speed in the air
    expect(Math.hypot(player.vel.x, player.vel.z)).toBeGreaterThan(MOVE.sprintSpeed);
    expect(player.stats.slideJumps).toBe(1);
  });

  it("post-slide momentum on the ground decays and never grows while sprinting", () => {
    const { world, player } = makeWorld();
    run(world, player, [{ ticks: 30 }, { ticks: 60, buttons: SPRINT, yaw: 0 }, { ticks: 6, buttons: SPRINT | Btn.Crouch }]);
    run(world, player, [{ ticks: 1, buttons: SPRINT | Btn.Crouch | Btn.Jump }]);
    expect(player.stats.slideJumps).toBe(1);
    for (let i = 0; i < 120 && !player.grounded; i++) run(world, player, [{ ticks: 1, buttons: SPRINT }]);
    expect(player.grounded).toBe(true);
    const landed = Math.hypot(player.vel.x, player.vel.z);
    expect(landed).toBeGreaterThan(MOVE.sprintSpeed);
    let prev = landed;
    for (let i = 0; i < 60; i++) {
      run(world, player, [{ ticks: 1, buttons: SPRINT, yaw: 0 }]);
      const s = Math.hypot(player.vel.x, player.vel.z);
      expect(s).toBeLessThanOrEqual(prev + 1e-6);
      prev = s;
    }
    expect(player.stats.topSpeed).toBeLessThanOrEqual(MOVE.slideMaxSpeed + 0.01);
  });

  it("air control cannot manufacture speed by turning", () => {
    const { world, player } = makeWorld();
    player.pos.x = 15;
    player.pos.z = 20;
    run(world, player, [{ ticks: 30 }]);
    const r = run(world, player, [{ ticks: 1, buttons: Btn.Forward | Btn.Jump, yaw: 0 }]);
    expect(r.events.some((e) => e.type === "jump")).toBe(true);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      // rotate the wish direction every tick while airborne (strafe-turn)
      run(world, player, [{ ticks: 1, buttons: Btn.Forward | Btn.Right, yaw: i * 0.25 }]);
      peak = Math.max(peak, Math.hypot(player.vel.x, player.vel.z));
    }
    expect(peak).toBeLessThanOrEqual(MOVE.walkSpeed + 0.01);
  });

  it("mantles the 1.2 m deck when jumping into it", () => {
    const { world, player } = makeWorld();
    // stand at z=4 facing -Z; deck front face is at z=-2
    player.pos.z = 2;
    run(world, player, [{ ticks: 30 }]);
    const r = run(world, player, [
      { ticks: 6, buttons: Btn.Forward, yaw: 0 },
      { ticks: 1, buttons: Btn.Forward | Btn.Jump },
      { ticks: 90, buttons: Btn.Forward },
    ]);
    expect(r.events.some((e) => e.type === "mantle")).toBe(true);
    expect(r.events.some((e) => e.type === "mantleEnd")).toBe(true);
    expect(player.pos.y).toBeCloseTo(1.2, 1);
    expect(player.grounded).toBe(true);
    expect(player.stance).toBe("stand");
    expect(player.stats.mantles).toBe(1);
  });

  it("does not mantle a wall that is too tall", () => {
    const { world, player } = makeWorld();
    player.pos.x = -22;
    player.pos.z = 26; // block at z 10..22, height 3 → face at z=22, 3 m tall
    run(world, player, [{ ticks: 30 }]);
    const r = run(world, player, [
      { ticks: 20, buttons: SPRINT, yaw: 0 },
      { ticks: 1, buttons: SPRINT | Btn.Jump },
      { ticks: 90, buttons: SPRINT },
    ]);
    expect(r.events.some((e) => e.type === "mantle")).toBe(false);
    expect(player.pos.y).toBeCloseTo(0, 1);
  });

  it("falls off the deck and lands on the floor", () => {
    const { world, player } = makeWorld();
    player.pos.x = 0;
    player.pos.y = 1.2;
    player.pos.z = -3; // on the deck, near its front edge at z=-2
    run(world, player, [{ ticks: 10 }]);
    expect(player.pos.y).toBeCloseTo(1.2, 2);
    const r = run(world, player, [{ ticks: 90, buttons: Btn.Back, yaw: 0 }]);
    expect(r.events.some((e) => e.type === "land")).toBe(true);
    expect(player.pos.y).toBeCloseTo(0, 2);
  });
});

describe("hitscan + TTK", () => {
  it("kills a dummy inside the 0.6–1.0 s TTK band with body shots", () => {
    const { world, player } = makeWorld();
    // stand on the upper deck's approach and shoot dummy 1 (upper deck z=-12, y=2.7) from the deck
    player.pos.x = 0;
    player.pos.y = 1.2;
    player.pos.z = -4;
    run(world, player, [{ ticks: 10 }]);
    const chest = { x: 0, y: 2.7 + 0.95, z: -12 };
    const r = run(world, player, [{ ticks: 120, buttons: Btn.Fire, aimAt: chest }]);
    const kill = r.events.find((e) => e.type === "kill");
    expect(kill).toBeDefined();
    if (kill && kill.type === "kill") {
      expect(kill.ttkSeconds).toBeGreaterThanOrEqual(0.6);
      expect(kill.ttkSeconds).toBeLessThanOrEqual(1.0);
    }
    const shots = r.events.filter((e) => e.type === "shot" && e.tick <= (kill?.tick ?? 0));
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((s) => s.type === "shot" && s.hit.kind === "dummy" && s.hit.zone === "body")).toBe(true);
    const needed = Math.ceil(DUMMY_MAX_HEALTH / LEASE_BREAKER.damage);
    expect(player.stats.hits).toBeGreaterThanOrEqual(needed);
  });

  it("headshots deal more, legs deal less, world blocks the ray", () => {
    const { world, player } = makeWorld();
    player.pos.y = 1.2;
    player.pos.z = -4;
    run(world, player, [{ ticks: 10 }]);
    const head = run(world, player, [{ ticks: 1, buttons: Btn.Fire, aimAt: { x: 0, y: 2.7 + 1.7, z: -12 } }]);
    const hs = head.events.find((e) => e.type === "shot");
    expect(hs && hs.type === "shot" && hs.hit.zone).toBe("head");
    expect(hs && hs.type === "shot" && hs.hit.damage).toBe(Math.round(LEASE_BREAKER.damage * LEASE_BREAKER.headMult));
    run(world, player, [{ ticks: 10 }]);
    const legs = run(world, player, [{ ticks: 1, buttons: Btn.Fire, aimAt: { x: 0, y: 2.7 + 0.3, z: -12 } }]);
    const ls = legs.events.find((e) => e.type === "shot");
    expect(ls && ls.type === "shot" && ls.hit.zone).toBe("legs");
    run(world, player, [{ ticks: 10 }]);
    // aim into the upper deck's front face (below the dummy)
    const wall = run(world, player, [{ ticks: 1, buttons: Btn.Fire, aimAt: { x: 0, y: 2.0, z: -8 } }]);
    const ws = wall.events.find((e) => e.type === "shot");
    expect(ws && ws.type === "shot" && ws.hit.kind).toBe("world");
  });

  it("reloads when empty and the dummy respawns", () => {
    const { world, player } = makeWorld();
    player.pos.y = 1.2;
    player.pos.z = -4;
    run(world, player, [{ ticks: 10 }]);
    const r = run(world, player, [{ ticks: 60 * 9, buttons: Btn.Fire, aimAt: { x: 0, y: 3.6, z: -12 } }]);
    expect(r.events.some((e) => e.type === "reloadStart")).toBe(true);
    expect(r.events.some((e) => e.type === "reloadEnd")).toBe(true);
    expect(r.events.some((e) => e.type === "dummyRespawn")).toBe(true);
    expect(r.events.filter((e) => e.type === "kill").length).toBeGreaterThanOrEqual(2);
  });
});

describe("world", () => {
  it("runs at the fixed rate and patrols dummies deterministically", () => {
    const w = new World(drainageYard());
    for (let i = 0; i < SIM_HZ * 5; i++) w.step(new Map());
    expect(w.tick).toBe(300);
    expect(w.time).toBeCloseTo(5);
    const d2 = w.dummies.find((d) => d.id === 2)!;
    expect(d2.pos.z).not.toBeCloseTo(-10, 1);
  });
});
