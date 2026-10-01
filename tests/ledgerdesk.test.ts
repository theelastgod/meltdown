/**
 * The metro booth is the city's ledger desk (Stage 714).
 *
 * Standing at it names the market. Standing in its mouth holds into THE RUN of the same district.
 * A city spawn is not in that mouth. The market is a sink. The walk pays nothing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { districtById, generateDistrict } from "../shared/sim/city";
import { inLedgerMouth, LEDGER_HOLD_GATE, LEDGER_HOLD_M, ledgerDistance, ledgerHudLine, ledgerSpot, nearLedgerDesk } from "../shared/net/cityledger";
import { holdProgress, stepGateHold } from "../shared/net/citygates";
import { SIM_DT } from "../shared/sim/constants";
import { runPageUrl } from "../client/runpage";
import { cityPageUrl } from "../shared/net/city";

const night = generateDistrict(districtById("night_market")!);
const lease = generateDistrict(districtById("lease_row")!);

describe("the plaza booth", () => {
  it("stands a step south of the metro door, in every district that has one", () => {
    for (const level of [night, lease]) {
      const spot = ledgerSpot(level);
      const door = level.boxes.find((b) => b.tag === "metro")!;
      expect(spot).not.toBeNull();
      expect(spot!.x).toBeCloseTo((door.min.x + door.max.x) / 2);
      expect(spot!.z).toBeCloseTo(door.max.z + 1.4);
      expect(inLedgerMouth(spot!, level)).toBe(true);
      expect(nearLedgerDesk({ x: spot!.x + 20, z: spot!.z }, level)).toBe(false);
    }
  });

  it("does not catch a file that just spawned on the perimeter", () => {
    for (const level of [night, lease]) {
      for (const s of level.spawns) expect(inLedgerMouth(s.pos, level)).toBe(false);
    }
  });

  it("holds for a second in the mouth, and the phone is not told to press a key", () => {
    const spot = ledgerSpot(night)!;
    expect(ledgerDistance(spot, night)!).toBeLessThanOrEqual(LEDGER_HOLD_M);
    let hold = stepGateHold(null, LEDGER_HOLD_GATE, SIM_DT);
    let ticks = 1;
    while (!hold.go && ticks < 120) {
      hold = stepGateHold(hold.hold, LEDGER_HOLD_GATE, SIM_DT);
      ticks++;
    }
    expect(hold.go).toBe(true);
    expect(ticks).toBe(Math.round(1 / SIM_DT));
    expect(holdProgress(hold.hold)).toBe(1);
    expect(ledgerHudLine(0, false, true)).toBe("LEDGER DESK · TAP MARKET · TAP NAME · WALK IN TO ENTER THE RUN");
    expect(ledgerHudLine(0, false, true)).not.toMatch(/\[[A-Z]+\]/);
    expect(ledgerHudLine(0, false, false)).toBe("LEDGER DESK · [TAB] MARKET · [N] NAME · WALK IN TO ENTER THE RUN");
    expect(ledgerHudLine(0, false, false)).not.toBe("LEDGER DESK · [TAB] MARKET · WALK IN TO ENTER THE RUN");
    expect(ledgerHudLine(0.5, true, false)).toContain("ENTERING THE RUN");
  });
});

describe("the trip", () => {
  const page = cityPageUrl("http://127.0.0.1:5173/?account=sandbox-t", { wsBase: "ws://127.0.0.1:8787", level: "night_market", shop: "http://127.0.0.1:8787" });

  it("enters THE RUN of this district and keeps the shop", () => {
    const url = runPageUrl(page, "night_market")!;
    const u = new URL(url);
    expect(u.searchParams.get("level")).toBe("night_market");
    expect(u.searchParams.get("mode")).toBe("run");
    expect(u.searchParams.get("city")).toBeNull();
    expect(u.searchParams.get("shop")).toBe("http://127.0.0.1:8787");
    const net = new URL(u.searchParams.get("net")!);
    expect(net.pathname).toMatch(/-run-night_market$/);
    expect(net.searchParams.get("mode")).toBe("run");
    expect(runPageUrl(page, "drainage_yard")).toBeNull();
    expect(runPageUrl("not a url", "lease_row")).toBeNull();
  });

  it("Tab at the desk opens the market, and taking that out of the client fails here", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/this\.runView\?\.inSafe \|\| this\.campaign\.atLedgerDesk \? "market" : "top"/);
    const map = readFileSync(new URL("../client/worldmap.ts", import.meta.url), "utf8");
    expect(map).toMatch(/data-wm-run="/);
    expect(map).toMatch(/LEDGER DESK AT THE METRO · MARKET SPENDS · THE RUN PAYS/);
  });

  it("the name desk is not the market panel", () => {
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const desk = file.slice(file.indexOf("nameDeskHtml():"), file.indexOf("counterHtml():"));
    expect(desk).toMatch(/▲ NAME DESK/);
    expect(desk).not.toMatch(/LEDGER MARKET/);
    expect(file).toMatch(/e\.code === "KeyN"/);
    expect(file).toMatch(/panelSection === "name"/);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/gateTap = \(\) => this\.file\.toggle\(true, "name"\)/);
  });
});
