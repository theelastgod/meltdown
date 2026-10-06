/**
 * The monorail is a seat. Look up and jump under a car and the feet ride it.
 * Look ahead and jump and the file steps off the side. The seat is `input.tick`,
 * so a burst of inputs does not share one car.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Btn } from "../shared/sim/input";
import { SIM_DT } from "../shared/sim/constants";
import { drainageYard, type TramLine } from "../shared/sim/level";
import { createPlayer, stepPlayer } from "../shared/sim/player";
import { TRAM_ACROSS, TRAM_CABIN, TRAM_SPEED, TRAM_STEP_OFF, tramAboard, tramCars } from "../shared/sim/tram";
import { World } from "../shared/sim/world";
import { v3 } from "../shared/math/vec3";
import { Tram } from "../client/render/life";

const LINE: TramLine = { axis: "x", at: 2, y: 9.4, from: 0, to: 400, period: 26 };

/** Where the +x car's feet are, written out here rather than taken from `tramCars`. */
function plusFeet(time: number): { x: number; y: number; z: number } {
  const wrapped = ((time % LINE.period) + LINE.period) % LINE.period;
  return { x: LINE.from + wrapped * TRAM_SPEED, y: LINE.y + TRAM_CABIN, z: LINE.at };
}

const frame = (buttons: number, pitch: number, tick = 0) => ({ tick, buttons, yaw: 0, pitch });

describe("riding the monorail", () => {
  it("puts a look-up jump into the car and keeps the feet on it", () => {
    const seat = plusFeet(0);
    const [plus] = tramCars(LINE, 0);
    expect(plus.x).toBeCloseTo(seat.x, 6);
    expect(plus.y).toBeCloseTo(seat.y, 6);
    expect(plus.z).toBeCloseTo(seat.z, 6);
    expect(plus.vx).toBe(TRAM_SPEED);
    expect(plus.visible).toBe(true);

    const p = createPlayer(1, "A", { pos: v3(seat.x, 0, seat.z), yaw: 0 });
    stepPlayer(p, frame(Btn.Jump, 1), [], [], 1, 1, { line: LINE, time: 0 });
    expect(p.pos.x).toBeCloseTo(seat.x, 5);
    expect(p.pos.y).toBeCloseTo(seat.y, 5);
    expect(p.pos.z).toBeCloseTo(seat.z, 5);
    expect(p.vel.x).toBe(TRAM_SPEED);
    expect(p.grounded).toBe(true);

    for (let i = 1; i <= 30; i++) {
      stepPlayer(p, frame(0, 0, i), [], [], 1, 1, { line: LINE, time: i * SIM_DT });
    }
    const at = plusFeet(30 * SIM_DT);
    expect(p.pos.x).toBeCloseTo(at.x, 4);
    expect(p.pos.x).toBeCloseTo(TRAM_SPEED * 0.5, 4);
    expect(p.pos.y).toBeCloseTo(at.y, 4);
    expect(p.grounded).toBe(true);
  });

  it("does not board when looking down, and a level with no line does not lift anyone", () => {
    const down = createPlayer(1, "A", { pos: v3(0, 0, 2), yaw: 0 });
    stepPlayer(down, frame(Btn.Jump, -1), [], [], 1, 1, { line: LINE, time: 0 });
    expect(down.pos.y).toBeLessThan(3);

    const plain = createPlayer(1, "B", { pos: v3(0, 0, 2), yaw: 0 });
    stepPlayer(plain, frame(Btn.Jump, 1), [], [], 1, 1, null);
    expect(plain.pos.y).toBeLessThan(3);
  });

  it("steps off the side on a jump, and the next tick is not back in the cabin", () => {
    expect(TRAM_STEP_OFF).toBeGreaterThan(TRAM_ACROSS);
    const p = createPlayer(1, "A", { pos: v3(0, 0, 2), yaw: 0 });
    stepPlayer(p, frame(Btn.Jump, 1), [], [], 1, 1, { line: LINE, time: 0 });
    stepPlayer(p, frame(0, 0, 1), [], [], 1, 1, { line: LINE, time: SIM_DT });
    const y = p.pos.y;
    stepPlayer(p, frame(Btn.Jump, 0, 2), [], [], 1, 1, { line: LINE, time: 2 * SIM_DT });
    expect(p.pos.z).toBeCloseTo(LINE.at + TRAM_STEP_OFF, 4);
    expect(p.pos.y).toBeGreaterThan(y);
    stepPlayer(p, frame(0, 0, 3), [], [], 1, 1, { line: LINE, time: 3 * SIM_DT });
    expect(tramAboard(LINE, 3 * SIM_DT, p.pos)).toBeNull();
    expect(p.pos.y).not.toBeCloseTo(LINE.y + TRAM_CABIN, 2);
  });

  it("rides a z-running line along z", () => {
    const line: TramLine = { axis: "z", at: 5, y: 9.4, from: 0, to: 400, period: 26 };
    const p = createPlayer(1, "A", { pos: v3(5, 0, 0), yaw: 0 });
    stepPlayer(p, frame(Btn.Jump, 1), [], [], 1, 1, { line, time: 0 });
    expect(p.vel.z).toBe(TRAM_SPEED);
    expect(p.vel.x).toBe(0);
    for (let i = 1; i <= 30; i++) stepPlayer(p, frame(0, 0, i), [], [], 1, 1, { line, time: i * SIM_DT });
    expect(p.pos.z).toBeCloseTo(TRAM_SPEED * 0.5, 4);
    expect(p.pos.x).toBeCloseTo(5, 4);
  });

  it("follows each input's tick through a world step, including a burst", () => {
    const yard = drainageYard();
    const line: TramLine = { axis: "x", at: 0, y: 9.4, from: 0, to: 400, period: 26 };
    const level = { ...yard, boxes: [], dummies: [], wasps: [], mechs: [], nodes: [], tram: line };
    const w = new World(level, { ai: false, wakePhase: "off", pvp: false, dummyRespawn: false });
    const p = w.addPlayer(1, "A");
    p.pos.x = 0;
    p.pos.y = 0;
    p.pos.z = 0;
    w.step(new Map([[1, [
      { tick: 0, buttons: Btn.Jump, yaw: 0, pitch: 1 },
      { tick: 1, buttons: 0, yaw: 0, pitch: 0 },
    ]]]));
    expect(p.pos.x).toBeCloseTo(TRAM_SPEED * SIM_DT, 4);
    expect(p.pos.y).toBeCloseTo(line.y + TRAM_CABIN, 4);
    for (let t = 2; t <= 30; t++) w.step(new Map([[1, { tick: t, buttons: 0, yaw: 0, pitch: 0 }]]));
    expect(p.pos.x).toBeCloseTo(TRAM_SPEED * 30 * SIM_DT, 3);
    expect(p.pos.y).toBeCloseTo(line.y + TRAM_CABIN, 4);
  });

  it("pins the ridden car onto the sim seat after the render-time pass", () => {
    const tram = new Tram(LINE);
    const listener = new THREE.Vector3();
    tram.update(1, listener);
    const moved = tram.position;
    expect(Math.abs(moved - LINE.from)).toBeGreaterThan(10);
    tram.hold = { dir: 1, x: 12, y: LINE.y, z: LINE.at };
    tram.update(0.2, listener);
    expect(tram.position).toBeCloseTo(12, 5);
    tram.hold = null;
    tram.update(0.2, listener);
    expect(tram.position).not.toBeCloseTo(12, 1);
  });
});
