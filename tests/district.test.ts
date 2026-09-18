/** Every district was the yard (Stage 131). */
import { describe, expect, it } from "vitest";
import { districtName, enteredLine, fullWakeLine, roundOverLine, wakeBeginsLine } from "../client/hud/district";

describe("districtName", () => {
  it("is the display name in capitals, or the id spelt out", () => {
    expect(districtName({ name: "drainage_yard", displayName: "Drainage Yard" })).toBe("DRAINAGE YARD");
    expect(districtName({ name: "lease_row" })).toBe("LEASE ROW");
  });
});

describe("the wake's lines name their district", () => {
  it("names the cell that woke it, or no one", () => {
    expect(roundOverLine(1, "LEASE ROW")).toBe("◆ ROUND OVER — CELL ONE WOKE LEASE ROW");
    expect(roundOverLine(2, "DEADLETTER DOCKS")).toBe("◆ ROUND OVER — CELL TWO WOKE DEADLETTER DOCKS");
    expect(roundOverLine(0, "LEASE ROW")).toBe("◆ ROUND OVER — NO ONE WOKE LEASE ROW");
  });
  it("names the district in the full wake and the entry", () => {
    expect(fullWakeLine("LEASE ROW")).toBe("◆ FULL WAKE — LEASE ROW IS OFF THE MODEL");
    expect(enteredLine(3, "CHARLIE", "LEASE ROW")).toBe("FILE #3 (CHARLIE) ENTERED LEASE ROW");
    expect(wakeBeginsLine()).toBe("◆ THE WAKE BEGINS — PULL THE NODES OFF THE MODEL");
  });
  it("never says the yard for a district that is not one", () => {
    for (const line of [roundOverLine(1, "LEASE ROW"), roundOverLine(0, "LEASE ROW"), fullWakeLine("LEASE ROW"), enteredLine(1, "A", "LEASE ROW")]) expect(line).not.toMatch(/THE YARD/);
  });
});
