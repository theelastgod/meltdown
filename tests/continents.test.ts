import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { castCoversCity, STREET_CAST, streetCast } from "../shared/city/continents";
import { worldMapDetails } from "../client/worldmap";

describe("continent districts", () => {
  it("gives every existing district one role and one stadium", () => {
    expect(castCoversCity()).toBe(true);
    expect(STREET_CAST).toHaveLength(20);
    expect(new Set(STREET_CAST.map((c) => c.id)).size).toBe(20);
    expect(new Set(STREET_CAST.map((c) => c.role)).size).toBe(20);
    expect(new Set(STREET_CAST.map((c) => c.stadium)).size).toBe(20);
    expect(new Set(STREET_CAST.map((c) => c.continent)).size).toBe(4);
    expect(streetCast("lease_row")?.role).toBe("CLERK");
    expect(streetCast("night_market")?.continent).toBe("SAHARA");
    expect(streetCast("deadletter_docks")?.role).not.toBe(streetCast("relay_heights")?.role);
    expect(streetCast("not_a_district")).toBeNull();
  });

  it("the world map names the role and the shooting contest", () => {
    const html = worldMapDetails({ here: "lease_row", selected: "night_market", seen: ["lease_row"], presence: null, status: "loading", touch: false });
    expect(html).toMatch(/SAHARA · STALLHAND · STADIUM MARKET PIT · SHOOTING CONTEST WHEN BOTH FILES ARE INSIDE/);
  });

  it("stepping into the block names that street's stadium", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/STADIUM \$\{stadium\} · SHOOTING CONTEST · FALL AND THE CHITS HIT THE GROUND/);
    expect(src).not.toMatch(/pvp:\s*true/);
  });
});
