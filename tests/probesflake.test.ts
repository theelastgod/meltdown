/**
 * Probe thresholds that land on a boundary are not guards (Stages 195–196).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("probe thresholds", () => {
  it("earshot does not require far.d > 30 when the bot lands on 30.0", () => {
    const src = readFileSync(new URL("../probe/stage2.ts", import.meta.url), "utf8");
    expect(src).toMatch(/far\.d >= 29\.5/);
    expect(src).not.toMatch(/far\.d > 30 && nearest > 28/);
  });

  it("a Debt is the enemy who closed you most, not a floor of two kills", () => {
    const src = readFileSync(new URL("../probe/stage8.ts", import.meta.url), "utf8");
    expect(src).toMatch(/owed\.kills >= 1/);
    expect(src).not.toMatch(/owed\.kills >= 2/);
  });
});
