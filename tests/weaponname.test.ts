/** The log called the gun by its id (Stage 123). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { weaponName } from "../client/hud/kill";
import { WEAPON_LIST } from "../shared/weapons/manifest";

describe("weaponName", () => {
  it("is the manifest's name for every weapon id", () => {
    for (const w of WEAPON_LIST) expect(weaponName(w.id)).toBe(w.name);
    expect(weaponName("lease_breaker")).toBe("LEASE-BREAKER");
    expect(weaponName("repo_hammer")).toBe("REPO HAMMER");
  });
  it("never shows an underscore, even for an id the manifest does not know", () => {
    expect(weaponName("some_new_gun")).toBe("SOME NEW GUN");
    for (const w of WEAPON_LIST) expect(weaponName(w.id)).not.toMatch(/_/);
  });
});

describe("the campaign quotes that name, not the id", () => {
  it("the close card and the contracts list call weaponName", () => {
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/weaponName\(rw\.weapon\)/);
    expect(src).toMatch(/weaponName\(m\.reward\.weapon\)/);
    expect(src).not.toMatch(/rw\.weapon\.toUpperCase\(\)/);
    expect(src).not.toMatch(/m\.reward\.weapon\.toUpperCase\(\)/);
  });

  it("the ledger line is the manifest name", () => {
    const src = readFileSync(new URL("../shared/campaign/save.ts", import.meta.url), "utf8");
    expect(src).toMatch(/WEAPONS\[m\.reward\.weapon/);
    expect(src).not.toMatch(/WEAPON \$\{m\.reward\.weapon\.toUpperCase\(\)\}/);
  });
});

describe("the FILE tab names the gun the city does", () => {
  it("PRIMARY calls weaponName, not String(id)", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/weaponName\(String\(id\)\)/);
    expect(src).not.toMatch(/\?\? String\(id\)/);
  });
});
