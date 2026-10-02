import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { heldWeaponLine } from "../client/hud/weaponline";

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
});