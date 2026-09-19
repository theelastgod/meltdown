/**
 * The phone's grenade pads (Stage 143): what a tap throws, and what the next cycle selects.
 */
import { describe, expect, it } from "vitest";
import { grenadePad, nextGrenade } from "../client/hud/grenadepad";

const NAMES = ["FRAG", "SMOKE", "EMP"];

describe("the cycle the sim performs", () => {
  it("is the list's next, wrapping, whatever the counts", () => {
    expect(nextGrenade(0, 3)).toBe(1);
    expect(nextGrenade(1, 3)).toBe(2);
    expect(nextGrenade(2, 3)).toBe(0);
  });
  it("is nothing with no list", () => {
    expect(nextGrenade(0, 0)).toBe(0);
  });
});

describe("the pads' labels", () => {
  it("name what a tap throws and what the next tap selects, with the counts", () => {
    expect(grenadePad(0, [2, 1, 1], NAMES)).toEqual({ throwLabel: "FRAG 2", cycleLabel: "▸SMOKE 1" });
    expect(grenadePad(1, [2, 1, 1], NAMES)).toEqual({ throwLabel: "SMOKE 1", cycleLabel: "▸EMP 1" });
    expect(grenadePad(2, [2, 1, 1], NAMES)).toEqual({ throwLabel: "EMP 1", cycleLabel: "▸FRAG 2" });
  });
  it("tells the truth about an empty type rather than skipping it, because the sim does not skip", () => {
    expect(grenadePad(0, [2, 0, 1], NAMES)).toEqual({ throwLabel: "FRAG 2", cycleLabel: "▸SMOKE 0" });
    expect(grenadePad(1, [0, 0, 0], NAMES).throwLabel).toBe("SMOKE 0");
  });
  it("falls back to the bare word with no list", () => {
    expect(grenadePad(0, [], [])).toEqual({ throwLabel: "NADE", cycleLabel: "NADE" });
  });
});
