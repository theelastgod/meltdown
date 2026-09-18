/**
 * The claims fell without a sound (Stage 101): pickup, bank and drop read from two views of the run.
 */
import { describe, expect, it } from "vitest";
import { momentLine, runMoments } from "../client/runcue";

describe("runMoments", () => {
  it("a rise in carried is a pickup, with the new total", () => {
    expect(runMoments({ carried: 2, banked: 0 }, { carried: 5, banked: 0 })).toEqual([{ kind: "pickup", value: 3, carried: 5 }]);
  });
  it("a bank moves carried into banked and is not a drop", () => {
    expect(runMoments({ carried: 5, banked: 1 }, { carried: 0, banked: 6 })).toEqual([{ kind: "bank", value: 5, banked: 6 }]);
  });
  it("a fall in carried with nothing banked is a drop", () => {
    expect(runMoments({ carried: 5, banked: 1 }, { carried: 0, banked: 1 })).toEqual([{ kind: "drop", value: 5 }]);
  });
  it("nothing happened, nothing said; and the first view has nothing to compare against", () => {
    expect(runMoments({ carried: 3, banked: 2 }, { carried: 3, banked: 2 })).toEqual([]);
    expect(runMoments(null, { carried: 3, banked: 2 })).toEqual([]);
  });
  it("a bank the view caught late, with a pickup in the same frame, is both and no drop", () => {
    // banked 5 of the 5, then took 2 more before the next view: carried 5 → 2, banked +5
    expect(runMoments({ carried: 5, banked: 0 }, { carried: 2, banked: 5 })).toEqual([{ kind: "bank", value: 5, banked: 5 }]);
  });
});

describe("momentLine", () => {
  it("says which moment and how much", () => {
    expect(momentLine({ kind: "pickup", value: 3, carried: 5 }, null)).toBe("◈ CLAIM +3 · CARRYING 5");
    expect(momentLine({ kind: "bank", value: 5, banked: 6 }, "EAST GATE")).toBe("BANKED 5 ◈ AT EAST GATE");
    expect(momentLine({ kind: "bank", value: 5, banked: 6 }, null)).toBe("BANKED 5 ◈ AT THE GATE");
    expect(momentLine({ kind: "drop", value: 5 }, null)).toBe("◈ 5 UNITS DROPPED WHERE YOU FELL");
  });
});
