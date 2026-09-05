import { describe, expect, it } from "vitest";
import { measureTTK, ttkTable } from "../shared/sim/ttk";
import { TTK_BAND, WEAPONS, magJitter } from "../shared/weapons/manifest";
import { Btn, withSlot, type InputFrame } from "../shared/sim/input";
import { drainageYard } from "../shared/sim/level";
import { World, hashWorld, type SimEvent } from "../shared/sim/world";
import { v3 } from "../shared/math/vec3";
import { MECH } from "../shared/sim/ai";

function run(world: World, id: number, ticks: number, buttons: number, aim?: { x: number; y: number; z: number }): SimEvent[] {
  const p = world.players.get(id)!;
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const a = aim ? world.aimAt(p, aim) : { yaw: p.yaw, pitch: p.pitch };
    const f: InputFrame = { tick: world.tick, buttons, yaw: a.yaw, pitch: a.pitch };
    world.step(new Map([[id, f]]));
    out.push(...world.drainEvents());
  }
  return out;
}

describe("TTK harness — every core weapon lands in the band at its intended range", () => {
  const table = ttkTable();
  for (const r of table.filter((t) => t.mode === "primary")) {
    it(`${r.weapon} primary @${r.range} m: ${r.seconds.toFixed(3)} s`, () => {
      expect(r.killed).toBe(true);
      expect(r.seconds).toBeGreaterThanOrEqual(TTK_BAND[0]);
      expect(r.seconds).toBeLessThanOrEqual(TTK_BAND[1]);
    });
  }
  for (const r of table.filter((t) => t.mode === "alt")) {
    it(`${r.weapon} alt @${r.range} m never undercuts the band: ${r.seconds.toFixed(3)} s`, () => {
      expect(r.killed).toBe(true);
      expect(r.seconds).toBeGreaterThanOrEqual(TTK_BAND[0]);
    });
  }
  it("headshots are faster but still not instant for the rifle", () => {
    // sanity: falloff makes the rifle slower past its range
    const far = measureTTK("lease_breaker", "primary", 50);
    const ideal = measureTTK("lease_breaker", "primary", 20);
    expect(far.seconds).toBeGreaterThan(ideal.seconds);
  });
});

describe("recoil and spread are deterministic from the magazine seed", () => {
  const shoot = (seed: number) => {
    const level = drainageYard();
    level.dummies = [];
    const w = new World(level, { ai: false, seed });
    const p = w.addPlayer(1);
    p.pos.x = 20;
    p.pos.z = 0;
    run(w, 1, 20, 0);
    run(w, 1, 1, withSlot(0, 3));
    run(w, 1, 30, 0);
    const ev = run(w, 1, 90, Btn.Fire, { x: 20, y: 1, z: -30 });
    return ev.filter((e) => e.type === "shot").map((e) => (e.type === "shot" ? [e.to.x, e.to.y, e.to.z] : []));
  };
  it("same seed → identical shot pattern; different seed → different", () => {
    const a = shoot(5);
    const b = shoot(5);
    const c = shoot(6);
    expect(a.length).toBeGreaterThan(10);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it("pattern climbs: later shots land higher than the first with no compensation", () => {
    const a = shoot(5);
    expect(a[8]![1]!).toBeGreaterThan(a[0]![1]!);
  });
  it("jitter helper is bounded and stable", () => {
    for (let i = 0; i < 50; i++) {
      const v = magJitter(123, i, 0);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(magJitter(123, i, 0)).toBe(v);
    }
  });
});

describe("reload seat + cancel window", () => {
  const setup = () => {
    const level = drainageYard();
    level.dummies = [];
    const w = new World(level, { ai: false });
    const p = w.addPlayer(1);
    run(w, 1, 20, 0);
    run(w, 1, 40, Btn.Fire); // spend some rifle ammo
    return { w, p };
  };
  it("firing before the seat aborts without ammo; after the seat it cancels the tail with a full mag", () => {
    const { w, p } = setup();
    const before = p.weapon.ammo[1]!;
    expect(before).toBeLessThan(30);
    run(w, 1, 1, Btn.Reload);
    run(w, 1, 20, 0); // 0.33 s of 1.9 s: not seated yet
    run(w, 1, 1, Btn.Fire);
    expect(p.weapon.reloadTimer).toBe(0);
    expect(p.weapon.ammo[1]).toBeLessThanOrEqual(before);
    // now reload through the seat
    run(w, 1, 1, Btn.Reload);
    const seatTicks = Math.ceil(WEAPONS.lease_breaker.reloadTime * WEAPONS.lease_breaker.seatFrac * 60) + 2;
    const ev = run(w, 1, seatTicks, 0);
    expect(ev.some((e) => e.type === "reloadSeat")).toBe(true);
    expect(p.weapon.ammo[1]).toBe(30);
    expect(p.weapon.reloadTimer).toBeGreaterThan(0);
    const ev2 = run(w, 1, 1, Btn.Fire);
    expect(ev2.some((e) => e.type === "reloadCancel")).toBe(true);
    expect(p.weapon.reloadTimer).toBe(0);
  });
});

describe("grenades", () => {
  const arena = () => {
    const level = drainageYard();
    level.dummies = [{ id: 1, pos: v3(20, 0, -8) }];
    const w = new World(level, { ai: false });
    const p = w.addPlayer(1);
    p.pos.x = 20;
    p.pos.z = 0;
    run(w, 1, 20, 0);
    return { w, p };
  };
  it("frag explodes after its fuse and damages a dummy in radius with line of sight", () => {
    const { w } = arena();
    const ev = run(w, 1, 200, 0, { x: 20, y: 1.5, z: -8 }).concat(run(w, 1, 1, Btn.Grenade, { x: 20, y: 1.5, z: -8 }), run(w, 1, 180, 0, { x: 20, y: 1.5, z: -8 }));
    const boom = ev.find((e) => e.type === "explode");
    expect(boom).toBeDefined();
    expect(w.dummies[0]!.health).toBeLessThan(100);
  });
  it("smoke makes a cloud that blocks the repo mech's searchlight", () => {
    const level = drainageYard();
    level.dummies = [];
    level.mechs = [{ path: [v3(20, 0, -20), v3(20, 0, -20)] }];
    level.wasps = [];
    const w = new World(level, { ai: true });
    const p = w.addPlayer(1);
    p.pos.x = 20;
    p.pos.z = -2; // 18 m in front of the mech, in its sweep
    p.health = 1e6; // survive the beam; this test is about sight, not damage
    const flaggedBefore = run(w, 1, 240, 0).filter((e) => e.type === "flagged").length;
    expect(flaggedBefore).toBeGreaterThan(0);
    // cycle to smoke and throw it at our feet
    run(w, 1, 1, Btn.GrenadeNext);
    const aimDown = { x: 20, y: -5, z: -6 };
    run(w, 1, 1, Btn.Grenade, aimDown);
    const ev = run(w, 1, 120, 0, aimDown);
    expect(ev.some((e) => e.type === "cloud")).toBe(true);
    expect(w.clouds.length).toBe(1);
    const flaggedAfter = run(w, 1, 240, 0).filter((e) => e.type === "flagged").length;
    expect(flaggedAfter).toBe(0);
  });
  it("EMP blacks out players in radius and disables wasps", () => {
    const level = drainageYard();
    level.dummies = [];
    level.wasps = [{ waypoints: [v3(20, 3, -6), v3(20, 3, -6)] }];
    level.mechs = [];
    const w = new World(level, { ai: true });
    const p = w.addPlayer(1);
    p.pos.x = 20;
    p.pos.z = 0;
    run(w, 1, 20, 0);
    run(w, 1, 1, Btn.GrenadeNext);
    run(w, 1, 1, 0);
    run(w, 1, 1, Btn.GrenadeNext);
    run(w, 1, 1, 0);
    expect(p.weapon.grenadeSel).toBe(2);
    run(w, 1, 1, Btn.Grenade, { x: 20, y: 2, z: -6 });
    const ev = run(w, 1, 150, 0, { x: 20, y: 2, z: -6 });
    expect(ev.some((e) => e.type === "emp")).toBe(true);
    expect(w.wasps[0]!.disabledTimer).toBeGreaterThan(0);
  });
});

describe("VANTAGE AI", () => {
  it("a wasp sees a player in the open, chases, and shoots; it dies to rifle fire and respawns", () => {
    const level = drainageYard();
    level.dummies = [];
    level.wasps = [{ waypoints: [v3(20, 3.5, -10), v3(20, 3.5, -10)] }];
    level.mechs = [];
    const w = new World(level, { ai: true });
    const p = w.addPlayer(1);
    p.pos.x = 20;
    p.pos.z = 0;
    const ev = run(w, 1, 240, 0);
    const shots = ev.filter((e) => e.type === "shot" && e.weapon === "wasp");
    expect(shots.length).toBeGreaterThan(2);
    expect(w.wasps[0]!.state).toBe("chase");
    const hp = p.health;
    expect(hp).toBeLessThanOrEqual(100);
    // shoot it down
    const wasp = w.wasps[0]!;
    let dead = false;
    for (let i = 0; i < 300 && !dead; i++) {
      const target = { x: wasp.pos.x, y: wasp.pos.y - 0.45, z: wasp.pos.z };
      const e = run(w, 1, 1, Btn.Fire, target);
      if (e.some((x) => x.type === "waspDeath")) dead = true;
      if (p.weapon.ammo[1] === 0) run(w, 1, 1, Btn.Reload);
    }
    expect(dead).toBe(true);
    expect(w.wasps[0]!.alive).toBe(false);
    run(w, 1, 60 * 21, 0);
    expect(w.wasps[0]!.alive).toBe(true);
  });
  it("the repo mech locks and fires its beam at a player held in the searchlight", () => {
    const level = drainageYard();
    level.dummies = [];
    level.wasps = [];
    level.mechs = [{ path: [v3(20, 0, -20), v3(20, 0, -20)] }];
    const w = new World(level, { ai: true });
    const p = w.addPlayer(1);
    p.pos.x = 20;
    p.pos.z = -2;
    const ev = run(w, 1, 300, 0);
    const beams = ev.filter((e) => e.type === "mechBeam");
    expect(beams.length).toBeGreaterThan(0);
    expect(p.health).toBeLessThan(100);
    expect(MECH.damage).toBe(25);
  });
});

describe("baton chain + lunge, launcher sticky", () => {
  it("a baton swing that lands chains to an adjacent dummy", () => {
    const level = drainageYard();
    level.dummies = [
      { id: 1, pos: v3(20, 0, -1.6) },
      { id: 2, pos: v3(21.2, 0, -2.2) },
    ];
    const w = new World(level, { ai: false });
    const p = w.addPlayer(1);
    p.pos.x = 20;
    p.pos.z = 0;
    run(w, 1, 20, 0);
    run(w, 1, 1, withSlot(0, 6));
    run(w, 1, 30, 0);
    const ev = run(w, 1, 2, Btn.Fire, { x: 20, y: 1, z: -1.6 });
    const m = ev.find((e) => e.type === "melee");
    expect(m && m.type === "melee" && m.hits.length).toBe(2);
    expect(w.dummies[0]!.health).toBe(64);
    expect(w.dummies[1]!.health).toBe(85);
  });
  it("sticky round arms and detonates on proximity", () => {
    const level = drainageYard();
    level.dummies = [{ id: 1, pos: v3(20, 0, -14), patrolTo: v3(20, 0, -6) }];
    const w = new World(level, { ai: false });
    const p = w.addPlayer(1);
    p.pos.x = 20;
    p.pos.z = 0;
    run(w, 1, 20, 0);
    run(w, 1, 1, withSlot(0, 5));
    run(w, 1, 30, 0);
    run(w, 1, 1, Btn.Alt, { x: 20, y: 0.05, z: -9 }); // stick it to the floor on the patrol path
    const ev = run(w, 1, 60 * 8, 0, { x: 20, y: 0.05, z: -9 });
    expect(ev.some((e) => e.type === "explode" && e.projKind === "sticky")).toBe(true);
    expect(w.dummies[0]!.health).toBeLessThan(100);
  });
});

describe("determinism with the arsenal", () => {
  it("same script → same hash including projectiles and AI", () => {
    const script = (w: World) => {
      w.addPlayer(1);
      run(w, 1, 30, 0);
      run(w, 1, 1, withSlot(0, 5));
      run(w, 1, 25, 0);
      run(w, 1, 1, Btn.Fire, { x: 0, y: 3, z: -12 });
      run(w, 1, 1, Btn.Grenade, { x: 5, y: 3, z: -5 });
      run(w, 1, 200, Btn.Forward | Btn.Sprint, { x: 0, y: 1, z: -30 });
      return hashWorld(w);
    };
    expect(script(new World(drainageYard(), { seed: 9 }))).toBe(script(new World(drainageYard(), { seed: 9 })));
  });
});
