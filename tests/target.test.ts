/**
 * What you put into the mech (Stage 103): which body is read, for how long, and what the read says.
 */
import { describe, expect, it } from "vitest";
import type { LandedHit } from "../client/hud/kill";
import { freshestVantage, TARGET_BLOCKS, TARGET_HOLD, targetRead, vantageLabel } from "../client/hud/target";

const hit = (at: number): LandedHit => ({ at, zone: "body", distance: 6, weapon: "lease_breaker" });

describe("freshestVantage", () => {
  it("is the VANTAGE body my latest round landed on, within the hold", () => {
    const book = new Map([["wasp:3", hit(10)], ["mech:1", hit(10.4)]]);
    expect(freshestVantage(book, 11)).toEqual({ kind: "mech", id: 1, at: 10.4 });
    expect(freshestVantage(book, 10.4 + TARGET_HOLD + 0.01)).toBeNull();
  });
  it("passes over files and dummies: their integrity is theirs", () => {
    const book = new Map([["player:2", hit(10.9)], ["dummy:1", hit(10.8)], ["wasp:1", hit(10)]]);
    expect(freshestVantage(book, 11)).toEqual({ kind: "wasp", id: 1, at: 10 });
  });
  it("a hit from the future is not read", () => {
    expect(freshestVantage(new Map([["wasp:1", hit(12)]]), 11)).toBeNull();
  });
});

describe("targetRead", () => {
  it("names the body and reads its health as blocks and a fraction", () => {
    const r = targetRead("mech", 1, 250, 400, 10, 10.5);
    expect(r.label).toBe("MECH-01");
    expect(r.frac).toBeCloseTo(0.625, 6);
    expect(r.blocks).toBe("▮▮▮▮▮▯▯▯");
    expect(r.blocks.length).toBe(TARGET_BLOCKS);
    expect(r.age).toBeCloseTo(0.5, 6);
  });
  it("clamps: a dead body reads empty, and health past the max reads full", () => {
    expect(targetRead("wasp", 4, -3, 40, 0, 0).blocks).toBe("▯".repeat(TARGET_BLOCKS));
    expect(targetRead("wasp", 4, 50, 40, 0, 0).frac).toBe(1);
  });
  it("labels", () => {
    expect(vantageLabel("wasp", 12)).toBe("WASP-12");
    expect(vantageLabel("mech", 3)).toBe("MECH-03");
  });
});
