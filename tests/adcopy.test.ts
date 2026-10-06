/**
 * The hologram tickers do not share a script.
 * Lease Row keeps the eight lines the street already scrolled.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HoloAds, adCopy } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district scrolls its own ticker", () => {
  it("keeps the street copy and gives the other nineteen their own eight lines", () => {
    const street = [...HoloAds.COPY];
    expect(street[0]).toBe("LEASE RENEWAL IS AUTOMATIC");
    expect(adCopy(undefined)).toEqual(street);
    expect(adCopy("lease_row")).toEqual(street);
    expect(adCopy("drainage_yard")).toEqual(street);
    expect(adCopy("deadletter_office")).toEqual(street);
    expect(adCopy("white_office")).toEqual(street);
    const seen = new Set(street);
    for (const id of CITY_DISTRICTS) {
      const lines = adCopy(id);
      if (id === "lease_row") continue;
      expect(lines, id).toHaveLength(street.length);
      expect(lines, id).not.toEqual(street);
      for (const line of lines) {
        expect(seen.has(line), `${id}: ${line}`).toBe(false);
        seen.add(line);
      }
    }
    expect(adCopy("night_market")).not.toEqual(adCopy("lease_row"));
    expect(adCopy("deadletter_docks")).not.toEqual(adCopy("relay_heights"));
    expect(adCopy("night_market")[0]).toBe("STALL RENT IS DUE AT DUSK");
  });

  it("the ticker draws the copy for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("const copy = adCopy(this.district);");
    expect(life).toContain("copy[p.line % copy.length]");
    expect(life).toContain("(p.line + 1) % copy.length");
  });
});
