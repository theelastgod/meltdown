import { describe, expect, it } from "vitest";
import { createWake, drainageYardNodes, stepWake, boostNodes, WAKE, type WakeEvent, type WakeOccupant } from "../shared/sim/wake";
import { drainageYard } from "../shared/sim/level";
import { World, hashWorld } from "../shared/sim/world";
import { Btn, type InputFrame } from "../shared/sim/input";

const at = (x: number, z: number, team: number, alive = true, flipMult = 1): WakeOccupant => ({ team, pos: { x, y: 0, z }, flipMult, alive });

function run(w: ReturnType<typeof createWake>, occ: WakeOccupant[], seconds: number, per: [number, number, number] = [0, 1, 1]): WakeEvent[] {
  const ev: WakeEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) stepWake(w, occ, per, ev, false);
  return ev;
}

describe("the wake — node rules", () => {
  it("one Blank flips a leased node in baseFlipSeconds/2 and holds it", () => {
    const w = createWake(drainageYardNodes(), "wake");
    const n = w.nodes[1]!; // B at (18,0)
    const ev = run(w, [at(18, 0, 1)], WAKE.baseFlipSeconds / 2 + 0.1);
    expect(ev.some((e) => e.type === "nodeFlip" && e.node === n.id && e.team === 1)).toBe(true);
    expect(n.owner).toBe(1);
    run(w, [at(18, 0, 1)], WAKE.baseFlipSeconds / 2 + 0.1);
    expect(n.hold).toBeCloseTo(1, 1);
  });
  it("two Blanks flip faster than one; a held neighbour spreads the wake faster still", () => {
    const flipTime = (occ: WakeOccupant[], pre?: (w: ReturnType<typeof createWake>) => void) => {
      const w = createWake(drainageYardNodes(), "wake");
      pre?.(w);
      let t = 0;
      const ev: WakeEvent[] = [];
      while (t < 30 * 60 && !ev.some((e) => e.type === "nodeFlip" && e.node === 2)) {
        stepWake(w, occ, [0, 2, 0], ev, false);
        t++;
      }
      return t / 60;
    };
    const solo = flipTime([at(18, 0, 1)]);
    const duo = flipTime([at(18, 0, 1), at(18.5, 0.5, 1)]);
    const spread = flipTime([at(18, 0, 1)], (w) => {
      w.nodes[0]!.owner = 1; // A held by cell one, adjacent to B
      w.nodes[3]!.owner = 1; // D too
    });
    expect(duo).toBeLessThan(solo);
    expect(spread).toBeLessThan(solo);
    expect(solo).toBeCloseTo(WAKE.baseFlipSeconds / 2, 0);
  });
  it("a contested node freezes; when one cell leaves the other takes it", () => {
    const w = createWake(drainageYardNodes(), "wake");
    const n = w.nodes[1]!;
    const ev = run(w, [at(18, 0, 1), at(19, 0, 2)], 6);
    expect(ev.some((e) => e.type === "nodeContest" && e.node === n.id)).toBe(true);
    expect(n.owner).toBe(0);
    expect(n.hold).toBe(1);
    run(w, [at(19, 0, 2)], 5);
    expect(n.owner).toBe(2);
  });
  it("dead players do not count and the wake perk multiplies the pull", () => {
    const w = createWake(drainageYardNodes(), "wake");
    run(w, [at(18, 0, 1, false)], 6);
    expect(w.nodes[1]!.owner).toBe(0);
    const w2 = createWake(drainageYardNodes(), "wake");
    const ev = run(w2, [at(18, 0, 1, true, 1.3)], 3.3);
    expect(ev.some((e) => e.type === "nodeFlip")).toBe(true);
  });
  it("phage burst boosts nodes in radius", () => {
    const w = createWake(drainageYardNodes(), "wake");
    expect(boostNodes(w, { x: 18, y: 0, z: 1 }, 3.5)).toBe(1);
    const ev = run(w, [at(18, 0, 1)], 2.2);
    expect(ev.some((e) => e.type === "nodeFlip")).toBe(true);
  });
  it("score accrues per held node per second, kills add points, and the timer ends the round", () => {
    const w = createWake(drainageYardNodes(), "wake");
    w.nodes[0]!.owner = 1;
    w.nodes[1]!.owner = 1;
    w.nodes[2]!.owner = 2;
    run(w, [], 10);
    expect(w.score[1]).toBeCloseTo(20, 0);
    expect(w.score[2]).toBeCloseTo(10, 0);
    w.timeLeft = 1;
    const ev = run(w, [], 1.1);
    expect(ev.some((e) => e.type === "phase" && e.phase === "results" && e.winner === 1)).toBe(true);
    expect(w.phase).toBe("results");
  });
  it("the KERNEL pulses every 75 s and drains the weakest held node, re-leasing it when it breaks", () => {
    const w = createWake(drainageYardNodes(), "wake");
    w.nodes[0]!.owner = 1;
    w.nodes[1]!.owner = 1;
    // unoccupied nodes settle to full hold before the pulse: the first pulse drains, not releases
    const ev = run(w, [], WAKE.kernelPulseSeconds + 0.5);
    const pulse = ev.find((e) => e.type === "kernelPulse");
    expect(pulse && pulse.type === "kernelPulse" && pulse.released).toBe(false);
    const drained = w.nodes.find((n) => n.id === (pulse as { node: number }).node)!;
    expect(drained.hold).toBeCloseTo(1 - WAKE.kernelPulseDrain, 1);
    // a weak hold at pulse time breaks and the node returns to VANTAGE
    w.kernelTimer = 0.01;
    w.nodes[0]!.hold = 0.2;
    const ev2 = run(w, [at(0, -5, 1)], 0.1); // a Blank standing on A keeps it from settling but cannot out-pull the pulse
    const p2 = ev2.find((e) => e.type === "kernelPulse");
    expect(p2 && p2.type === "kernelPulse" && p2.node).toBe(1);
    expect(p2 && p2.type === "kernelPulse" && p2.released).toBe(true);
    expect(w.nodes[0]!.owner).toBe(0);
  });
  it("holding every node for fullWakeHold seconds ends the round with a FULL WAKE", () => {
    const w = createWake(drainageYardNodes(), "wake");
    for (const n of w.nodes) n.owner = 2;
    const ev = run(w, [], WAKE.fullWakeHold + 0.5);
    expect(ev.some((e) => e.type === "fullWake" && e.team === 2)).toBe(true);
    expect(w.winner).toBe(2);
    expect(w.phase).toBe("results");
  });
  it("warm-up waits for both cells, then the round starts fresh", () => {
    const w = createWake(drainageYardNodes(), "warmup");
    run(w, [], WAKE.warmupSeconds + 1, [0, 1, 0]);
    expect(w.phase).toBe("warmup");
    run(w, [], 6, [0, 1, 1]);
    expect(w.phase).toBe("wake");
    expect(w.timeLeft).toBeGreaterThan(WAKE.roundSeconds - 6);
  });
});

describe("the wake inside the world", () => {
  it("a player standing on node A flips it; hash covers the mode", () => {
    const world = new World(drainageYard(), { ai: false, seed: 5 });
    const p = world.addPlayer(1, "BLANK", 1);
    p.pos.x = 0;
    p.pos.y = 1.2;
    p.pos.z = -5;
    const events: string[] = [];
    for (let i = 0; i < 60 * 5; i++) {
      const f: InputFrame = { tick: world.tick, buttons: 0, yaw: 0, pitch: 0 };
      world.step(new Map([[1, f]]));
      for (const e of world.drainEvents()) events.push(e.type);
    }
    expect(events).toContain("nodeFlip");
    expect(world.wake!.nodes[0]!.owner).toBe(1);
    expect(world.wake!.score[1]).toBeGreaterThan(0);
    const world2 = new World(drainageYard(), { ai: false, seed: 5 });
    const p2 = world2.addPlayer(1, "BLANK", 1);
    p2.pos.x = 0;
    p2.pos.y = 1.2;
    p2.pos.z = -5;
    for (let i = 0; i < 60 * 5; i++) world2.step(new Map([[1, { tick: world2.tick, buttons: 0, yaw: 0, pitch: 0 }]]));
    expect(hashWorld(world2)).toBe(hashWorld(world));
  });
  it("a phage detonation near a node boosts it", () => {
    const world = new World(drainageYard(), { ai: false, seed: 5 });
    const p = world.addPlayer(1, "BLANK", 1);
    p.pos.x = 18;
    p.pos.z = 8;
    for (let i = 0; i < 20; i++) world.step(new Map([[1, { tick: world.tick, buttons: 0, yaw: 0, pitch: 0 }]]));
    world.step(new Map([[1, { tick: world.tick, buttons: 5 << 12, yaw: 0, pitch: 0 }]]));
    for (let i = 0; i < 25; i++) world.step(new Map([[1, { tick: world.tick, buttons: 0, yaw: 0, pitch: 0 }]]));
    const aim = world.aimAt(p, { x: 18, y: 0.2, z: 0 });
    world.step(new Map([[1, { tick: world.tick, buttons: Btn.Fire, yaw: aim.yaw, pitch: aim.pitch }]]));
    for (let i = 0; i < 60; i++) world.step(new Map([[1, { tick: world.tick, buttons: 0, yaw: aim.yaw, pitch: aim.pitch }]]));
    expect(world.wake!.nodes[1]!.boost).toBeGreaterThan(0);
  });
});
