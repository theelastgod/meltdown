/**
 * The client aims at a fractional tick and tells the server a whole one (Stage 34).
 *
 * `NetClient.remoteViews()` poses remote players at a *continuous* view time
 * `t = serverTickNow() - INTERP_DELAY_TICKS`, interpolating between the two snapshots either side
 * of it. That is the position the player sees, and therefore the position they aim at.
 *
 * `NetClient.viewTick()` then reports `Math.floor(t)`, and `Room.rewindFor` rewinds to exactly that
 * integer snapshot — `history.get(floor(t))`, no interpolation. So the server reconstructs the
 * target where it was up to one whole tick *before* the place the shooter was aiming.
 *
 * These cases pin the size of that gap. It is not a rounding nicety: at the speeds a strafing
 * player moves, one tick at 60 Hz is more than a body's width of lateral travel.
 */
import { describe, expect, it } from "vitest";
import { SIM_HZ } from "../shared/sim/constants";
import { INTERP_DELAY_TICKS } from "../client/net/netclient";

/** A remote's sampled positions, one per server tick, strafing along +x at a constant speed. */
function samples(speed: number, ticks = 32): { tick: number; x: number }[] {
  return Array.from({ length: ticks }, (_, i) => ({ tick: i, x: (i / SIM_HZ) * speed }));
}

/** What the client draws, and aims at: linear interpolation at the continuous view time. */
function seenAt(list: readonly { tick: number; x: number }[], t: number): number {
  const a = list[Math.floor(t)]!;
  const b = list[Math.min(list.length - 1, Math.floor(t) + 1)]!;
  return a.x + (b.x - a.x) * (t - a.tick);
}

/** What the server rewinds to today: the integer snapshot named by `Math.floor(t)`. */
function rewoundTo(list: readonly { tick: number; x: number }[], t: number): number {
  return list[Math.floor(t)]!.x;
}

describe("the shooter's view and the server's rewind are not the same instant", () => {
  it("a strafing target is reconstructed behind where the shooter saw it, by the tick's fraction", () => {
    const s = samples(7); // 7 m/s, a sprinting strafe
    const t = 20.5;
    const seen = seenAt(s, t);
    const rewound = rewoundTo(s, t);
    expect(seen - rewound).toBeCloseTo((0.5 / SIM_HZ) * 7, 6); // half a tick of travel
  });

  it("the error is the fraction, so it is worst just before a tick boundary and zero on it", () => {
    const s = samples(7);
    const err = (t: number) => seenAt(s, t) - rewoundTo(s, t);
    expect(err(20.0)).toBeCloseTo(0, 9);
    expect(err(20.99)).toBeGreaterThan(err(20.5));
    expect(err(20.99)).toBeLessThan((1 / SIM_HZ) * 7 + 1e-9);
  });

  it("at a strafe's speed one tick is wider than a player's hitbox is deep", () => {
    // the gap is not a rounding nicety: this is why a shot that looked centred misses
    const oneTick = (1 / SIM_HZ) * 7;
    expect(oneTick).toBeGreaterThan(0.11); // ~11.7 cm
  });

  it("averaged over uniformly distributed shot times it is half a tick of travel", () => {
    const s = samples(7);
    let sum = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      const t = 15 + i / n;
      sum += seenAt(s, t) - rewoundTo(s, t);
    }
    expect(sum / n).toBeCloseTo((0.5 / SIM_HZ) * 7, 3);
  });

  it("interpolating the rewind to the same fractional tick closes it exactly", () => {
    // the whole basis of the fix: the server holds both snapshots the client interpolated between,
    // so it can reconstruct the same point rather than the one before it
    const s = samples(7);
    const fixed = (t: number): number => {
      const a = s[Math.floor(t)]!;
      const b = s[Math.min(s.length - 1, Math.floor(t) + 1)]!;
      return a.x + (b.x - a.x) * (t - a.tick);
    };
    for (const t of [20.0, 20.25, 20.5, 20.75, 20.99]) expect(fixed(t) - seenAt(s, t)).toBeCloseTo(0, 12);
  });

  it("the interpolation delay is a whole number of ticks, so the fraction comes from the clock alone", () => {
    // `viewTick()` floors `serverTickNow() - INTERP_DELAY_TICKS`; the delay contributes nothing to
    // the fraction, which is why the gap tracks wall-clock drift rather than anything tunable
    expect(Number.isInteger(INTERP_DELAY_TICKS)).toBe(true);
  });
});
