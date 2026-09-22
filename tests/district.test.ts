/** Every district was the yard (Stage 131). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { districtName, enteredLine, fullWakeLine, roundOverLine, wakeBeginsLine } from "../client/hud/district";
import { districtPickLine } from "../client/menu";
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
  it("the HUD zone line calls districtName, not the level id", () => {
    const src = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(src).toMatch(/this\.zone = districtName\(level\)/);
    expect(src).not.toMatch(/this\.zone = \(level\.displayName \?\? level\.name\.replace/);
  });
  it("the PA and the ledger line call districtName, not the level id", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/const district = districtName\(this\.world\.level\)/);
    expect(src).toMatch(/BACK ON THE LEDGER · \$\{districtName\(this\.world\.level\)\}/);
    expect(src).not.toMatch(/displayName \?\? this\.levelId/);
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

describe("the WAKE picker names the district, not the room", () => {
  it("prints LEASE ROW, not neochina-lease_row", () => {
    const row = { displayName: "LEASE ROW", cast: "magenta" };
    expect(districtPickLine("wake", row)).toBe("MAGENTA CAST · LEASE ROW");
    expect(districtPickLine("wake", row)).not.toMatch(/neochina/);
    expect(districtPickLine("wake", row)).not.toMatch(/lease_row/);
    expect(districtPickLine("run", row)).toBe("MAGENTA CAST · PVP ZONE WITH TWO GATES · LEASE ROW");
    expect(districtPickLine("run", row)).not.toMatch(/neochina/);
    const src = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(src).toMatch(/districtPickLine\(this\.pick, l\)/);
    expect(src).not.toMatch(/public room \$\{HOSTS\.publicRoom\}/);
  });
});

describe("the main menu CRT-cases its lines", () => {
  it("WAKE's subtitle is the signature mode in CRT", () => {
    const src = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(src).toMatch(/id: "wake", label: "WAKE", line: "THE SIGNATURE MODE: FLIP THE NODES, HOLD THE DISTRICT, BEAT THE KERNEL'S CLOCK"/);
    expect(src).not.toMatch(/id: "wake", label: "WAKE", line: "the signature mode:/);
  });
  it("THE RUN's subtitle is play to earn in CRT", () => {
    const src = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(src).toMatch(/id: "run", label: "THE RUN", line: "PLAY TO EARN: CARRY \$CAPITAL CLAIMS OUT OF THE PVP ZONE TO A GATE; DIE AND THEY DROP"/);
    expect(src).not.toMatch(/id: "run", label: "THE RUN", line: "play to earn:/);
  });
  it("CAMPAIGN's subtitle is the desk in CRT", () => {
    const src = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(src).toMatch(/id: "campaign", label: "CAMPAIGN", line: "THE DESK AT THE DEADLETTER OFFICE: FIXERS, GIGS, THE SEVEN-MISSION ARC"/);
    expect(src).not.toMatch(/id: "campaign", label: "CAMPAIGN", line: "the desk at the Deadletter Office:/);
  });
  it("THE OFFICE's subtitle is the hub in CRT", () => {
    const src = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(src).toMatch(/id: "office", label: "THE OFFICE", line: "THE HUB: YOUR FILE ON THE WALL, THE RANGE GHOSTS, THE DOSSIER"/);
    expect(src).not.toMatch(/id: "office", label: "THE OFFICE", line: "the hub:/);
  });
  it("THE RANGE's subtitle is the drainage yard in CRT", () => {
    const src = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(src).toMatch(/id: "range", label: "THE RANGE", line: "THE DRAINAGE YARD, OFFLINE, WITH DUMMIES"/);
    expect(src).not.toMatch(/id: "range", label: "THE RANGE", line: "the drainage yard,/);
  });
  it("FILE's subtitle is the Ghostfile in CRT", () => {
    const src = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(src).toMatch(/id: "file", label: "FILE", line: "THE GHOSTFILE: NODES, MASTERY, STAMPS, THE COUNTER-LEDGER"/);
    expect(src).not.toMatch(/id: "file", label: "FILE", line: "the Ghostfile:/);
  });
});
