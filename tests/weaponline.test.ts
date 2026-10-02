import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { heldGateLine, heldWeaponLine } from "../client/hud/weaponline";

describe("the gun in hand", () => {
  it("says the rank the file has with it", () => {
    expect(heldWeaponLine("LEASE-BREAKER", 1, "")).toBe("LEASE-BREAKER · R01");
    expect(heldWeaponLine("REPO HAMMER", 12, " · CHOKED")).toBe("REPO HAMMER · R12 · CHOKED");
    expect(heldWeaponLine("LONGWAVE", 30, " · CHARGE 40%")).toBe("LONGWAVE · R30 · CHARGE 40%");
    expect(heldWeaponLine("PHAGE", 0, "")).toBe("PHAGE · R01");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/heldWeaponLine\(def\.name, rank, tail\)/);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/this\.file\.mastery\[weaponDefOf\(p\)\.id\]\?\.rank \?\? 1/);
  });

  it("says the challenge holding that rank", () => {
    expect(heldGateLine("10 headshot kills")).toBe("GATE · 10 HEADSHOT KILLS");
    expect(heldGateLine("2 double kills (two files within 4 s)")).toBe("GATE · 2 DOUBLE KILLS (TWO FILES WITHIN 4 S)");
    expect(heldGateLine("")).toBe("");
    expect(heldGateLine("  ")).toBe("");
    expect(heldGateLine(null)).toBe("");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/heldGateLine\(gate/);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/gateFor\(weaponDefOf\(p\)\.id, held\)/);
  });

  it("says how far through that challenge", () => {
    expect(heldGateLine("10 headshot kills", 3, 10)).toBe("GATE · 10 HEADSHOT KILLS · 3/10");
    expect(heldGateLine("5 kills mid-slide", 0, 5)).toBe("GATE · 5 KILLS MID-SLIDE · 0/5");
    expect(heldGateLine("10 headshot kills", 12, 10)).toBe("GATE · 10 HEADSHOT KILLS · 12/10");
    expect(heldGateLine("", 3, 10)).toBe("");
    expect(heldGateLine("10 headshot kills", 3, 0)).toBe("GATE · 10 HEADSHOT KILLS");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/heldGateLine\(gate, have, need\)/);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/held\.counters\[ch\.counter\]/);
    expect(game).toMatch(/ch\?\.need/);
  });
});