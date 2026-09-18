/** The log called the gun by its id (Stage 123). */
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
