/** Every district was the yard (Stage 131). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { districtName, enteredLine, fullWakeLine, roundOverLine, wakeBeginsLine } from "../client/hud/district";
import { levelDisplayName } from "../shared/sim/level";
import { MISSIONS } from "../shared/campaign/missions";

describe("districtName", () => {
  it("is the display name in capitals, or the id spelt out", () => {
    expect(districtName({ name: "drainage_yard", displayName: "Drainage Yard" })).toBe("DRAINAGE YARD");
    expect(districtName({ name: "lease_row" })).toBe("LEASE ROW");
  });
});

describe("a contract names the district the city does", () => {
  it("does not print the underscore id", () => {
    expect(levelDisplayName("deadletter_docks")).toBe("DEADLETTER DOCKS");
    expect(levelDisplayName("lease_row")).toBe("LEASE ROW");
    expect(levelDisplayName("repo_depot")).toBe("REPO DEPOT");
    expect(levelDisplayName("white_office")).toBe("THE WHITE OFFICE");
    expect(levelDisplayName("deadletter_docks")).not.toMatch(/_/);
    for (const m of MISSIONS) expect(levelDisplayName(m.level), m.id).not.toMatch(/_/);
  });

  it("the wrong-district note and the contracts list both call it", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/PLAYS IN \$\{levelDisplayName\(def\.level\)\}/);
    expect(src).toMatch(/levelDisplayName\(m\.level\)/);
    expect(src).not.toMatch(/def\.level\.toUpperCase\(\)/);
  });

  it("the travelling alert names the district the city does", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/TRAVELLING — \$\{levelDisplayName\(net\.levelName\)\}/);
    expect(src).not.toMatch(/TRAVELLING — \$\{net\.levelName\.replace/);
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
