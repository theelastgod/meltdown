/**
 * Rejoining after a drop (Stage 153, Stage 183).
 *
 * The waits are bounded by the same grace window the room keeps the seat for, so the last try
 * lands while the seat is still there. Stage 153 refused the next double once the geometric sum
 * would overshoot, which ended the plan at 31.5 s of a 60 s hold. Stage 183 spends the remainder.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { REJOIN_FIRST_MS, REJOIN_GRACE_SECONDS, REJOIN_MAX_TRIES, rejoinDelay, rejoinTries, triesWord } from "../shared/net/rejoin";

/** successive waits and the time each knock lands, summing the rule itself rather than the closed form */
function plan(graceSeconds = REJOIN_GRACE_SECONDS) {
  const rows: { n: number; wait: number; at: number }[] = [];
  let at = 0;
  for (let n = 1; n <= REJOIN_MAX_TRIES; n++) {
    const wait = rejoinDelay(n, graceSeconds);
    if (wait === null) break;
    at += wait;
    rows.push({ n, wait, at });
  }
  return rows;
}

describe("the rejoin plan", () => {
  it("waits half a second, then doubles", () => {
    expect(rejoinDelay(1)).toBe(REJOIN_FIRST_MS);
    expect(rejoinDelay(2)).toBe(REJOIN_FIRST_MS * 2);
    expect(rejoinDelay(3)).toBe(REJOIN_FIRST_MS * 4);
  });

  it("the last knock lands on the room's grace window, not halfway through it", () => {
    const windowMs = REJOIN_GRACE_SECONDS * 1000;
    const rows = plan();
    expect(rows.length, "no knocks").toBeGreaterThan(0);
    const last = rows[rows.length - 1]!;
    expect(rejoinDelay(last.n)).not.toBeNull();
    expect(rejoinDelay(last.n + 1)).toBeNull();
    expect(rejoinTries()).toBe(last.n);
    expect(last.at, "last knock after the seat is gone").toBeLessThanOrEqual(windowMs);
    expect(last.at, "last knock left the window unused").toBe(windowMs);
    // the geometric-sum gate that Stage 153 shipped lands at 31.5 s and then stops
    const geometricHalt = REJOIN_FIRST_MS * (2 ** 6 - 1);
    expect(last.at, "still the 31.5 s geometric halt").toBeGreaterThan(geometricHalt);
    expect(last.n, "still six tries").toBeGreaterThan(6);
  });

  it("a knock never lands after the window, for the windows the room might hold", () => {
    for (const grace of [0, 1, 5, 15, 60, 120]) {
      const windowMs = grace * 1000;
      const rows = plan(grace);
      expect(rejoinTries(grace)).toBe(rows.length);
      for (const row of rows) {
        expect(row.at, `try ${row.n} at grace ${grace}s landed after the seat`).toBeLessThanOrEqual(windowMs);
        expect(row.wait, `try ${row.n} at grace ${grace}s waited nothing`).toBeGreaterThan(0);
      }
      if (windowMs > 0) {
        expect(rows.at(-1)?.at, `grace ${grace}s left unused`).toBe(windowMs);
      } else {
        expect(rows.length).toBe(0);
      }
    }
  });

  it("knocks more than once, and not forever", () => {
    expect(rejoinTries()).toBeGreaterThan(3);
    expect(rejoinTries()).toBeLessThan(12);
  });

  it("scales with the window it is given", () => {
    expect(rejoinTries(0)).toBe(0);
    expect(rejoinTries(1)).toBeGreaterThan(0);
    expect(plan(1).at(-1)?.at).toBe(1000);
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

  it("one try is TRY, not TRIES", () => {
    expect(triesWord(1)).toBe("1 TRY");
    expect(triesWord(2)).toBe("2 TRIES");
    expect(triesWord(0)).toBe("0 TRIES");
    expect(triesWord(1)).not.toBe("1 TRIES");
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/triesWord\(this\.rejoins\)/);
    expect(src).not.toMatch(/this\.rejoins\} TRIES/);
  });
});
