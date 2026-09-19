/**
 * Rejoining after a drop (Stage 153): the waits are bounded by the same grace window the room
 * keeps the seat for, so the last try lands while the seat is still there.
 */
import { describe, expect, it } from "vitest";
import { REJOIN_FIRST_MS, REJOIN_GRACE_SECONDS, REJOIN_MAX_TRIES, rejoinDelay, rejoinTries } from "../shared/net/rejoin";

describe("the rejoin plan", () => {
  it("waits half a second, then doubles", () => {
    expect(rejoinDelay(1)).toBe(REJOIN_FIRST_MS);
    expect(rejoinDelay(2)).toBe(REJOIN_FIRST_MS * 2);
    expect(rejoinDelay(3)).toBe(REJOIN_FIRST_MS * 4);
  });

  it("stops when the waits before it have spent the room's grace window", () => {
    const tries = rejoinTries();
    expect(rejoinDelay(tries)).not.toBeNull();
    expect(rejoinDelay(tries + 1)).toBeNull();
    const spent = REJOIN_FIRST_MS * (2 ** tries - 1);
    expect(spent).toBeLessThanOrEqual(REJOIN_GRACE_SECONDS * 1000);
    const over = REJOIN_FIRST_MS * (2 ** (tries + 1) - 1);
    expect(over).toBeGreaterThan(REJOIN_GRACE_SECONDS * 1000);
  });

  it("knocks more than once, and not forever", () => {
    expect(rejoinTries()).toBeGreaterThan(3);
    expect(rejoinTries()).toBeLessThan(12);
  });

  it("scales with the window it is given", () => {
    expect(rejoinTries(1)).toBe(1);
    expect(rejoinTries(0)).toBe(0);
    expect(rejoinTries(600)).toBeGreaterThan(rejoinTries(60));
  });

  it("counts within a bound, so a rule that never says no cannot hang the count", () => {
    expect(rejoinTries(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(REJOIN_MAX_TRIES);
  });

  it("is nothing for a try that is not a try", () => {
    expect(rejoinDelay(0)).toBeNull();
    expect(rejoinDelay(-2)).toBeNull();
    expect(rejoinDelay(1.5)).toBeNull();
  });
});
