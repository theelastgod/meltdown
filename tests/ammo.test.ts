/**
 * The magazine that ran out without a word (Stage 100): the low line, the four states, the reload
 * fraction, and the one edge that is heard.
 */
import { describe, expect, it } from "vitest";
import { ammoRead, lastRoundsEdge, LOW_FRAC, lowLine } from "../client/hud/ammo";

describe("lowLine", () => {
  it("is the last quarter, rounded up, and never under a round", () => {
    expect(lowLine(30)).toBe(Math.ceil(30 * LOW_FRAC));
    expect(lowLine(6)).toBe(2);
    expect(lowLine(2)).toBe(1);
  });
  it("a magazine of one has no last quarter", () => {
    expect(lowLine(1)).toBe(0);
    expect(lowLine(0)).toBe(0);
  });
});

describe("ammoRead", () => {
  it("reads ok above the line, low at it, empty at nothing", () => {
    expect(ammoRead(9, 30, 0, 0, false).state).toBe("ok");
    expect(ammoRead(8, 30, 0, 0, false).state).toBe("low");
    expect(ammoRead(1, 30, 0, 0, false).state).toBe("low");
    expect(ammoRead(0, 30, 0, 0, false).state).toBe("empty");
  });
  it("a reload is a reload whatever the count, with how far along it is", () => {
    const r = ammoRead(0, 30, 1.2, 1.6, false);
    expect(r.state).toBe("reloading");
    expect(r.reloadFrac).toBeCloseTo(0.25, 6);
    expect(r.seated).toBe(false);
    const late = ammoRead(30, 30, 0.2, 1.6, true);
    expect(late.state).toBe("reloading");
    expect(late.reloadFrac).toBeCloseTo(0.875, 6);
    expect(late.seated).toBe(true);
  });
  it("a bottomless weapon is always ok", () => {
    expect(ammoRead(0, 0, 0, 0, false).state).toBe("ok");
  });
});

describe("lastRoundsEdge", () => {
  it("fires on the round that crosses the line, and only that one", () => {
    const line = lowLine(30);
    expect(lastRoundsEdge(line + 1, line, 30)).toBe(true);
    expect(lastRoundsEdge(line, line - 1, 30)).toBe(false);
    expect(lastRoundsEdge(line + 2, line + 1, 30)).toBe(false);
  });
  it("a burst that jumps the line still counts once", () => {
    expect(lastRoundsEdge(lowLine(30) + 3, 2, 30)).toBe(true);
  });
  it("not going up, not into empty, not on a magazine of one", () => {
    expect(lastRoundsEdge(0, 30, 30)).toBe(false);
    expect(lastRoundsEdge(2, 8, 30)).toBe(false);
    expect(lastRoundsEdge(1, 0, 30)).toBe(false);
    expect(lastRoundsEdge(1, 0, 1)).toBe(false);
  });
});
