/**
 * The rack called the DIRECTIVE "THE" (Stage 109): the one-word label for every weapon.
 */
import { describe, expect, it } from "vitest";
import { WEAPON_LIST } from "../shared/weapons/manifest";
import { rackLabel } from "../client/hud/rack";

describe("rackLabel", () => {
  it("is the first word for a name that starts with one", () => {
    expect(rackLabel("REPO HAMMER")).toBe("REPO");
    expect(rackLabel("LEASE-BREAKER")).toBe("LEASE-BREAKER");
  });
  it("skips a leading article", () => {
    expect(rackLabel("THE DIRECTIVE")).toBe("DIRECTIVE");
    expect(rackLabel("a Ledger")).toBe("Ledger");
  });
  it("no weapon on the rack is labelled by an article", () => {
    for (const w of WEAPON_LIST) expect(["THE", "A", "AN"]).not.toContain(rackLabel(w.name).toUpperCase());
  });
  it("a name that is nothing but an article keeps it, and an empty name is empty", () => {
    expect(rackLabel("THE")).toBe("THE");
    expect(rackLabel("  ")).toBe("");
  });
});
