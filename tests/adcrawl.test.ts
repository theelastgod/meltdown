/**
 * A hologram line does not share a crawl.
 * Lease Row keeps the pace the ticker shipped with.
 * Ink and copy stay where adInk and adCopy left them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_CRAWL, adCrawl } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district crawls its own ticker", () => {
  it("keeps the street pace and gives the other nineteen their own", () => {
    expect(STREET_CRAWL).toBe(70);
    expect(adCrawl(undefined)).toBe(STREET_CRAWL);
    expect(adCrawl("lease_row")).toBe(STREET_CRAWL);
    expect(adCrawl("drainage_yard")).toBe(STREET_CRAWL);
    expect(adCrawl("deadletter_office")).toBe(STREET_CRAWL);
    expect(adCrawl("white_office")).toBe(STREET_CRAWL);
    const paces = CITY_DISTRICTS.map((id) => adCrawl(id));
    expect(new Set(paces).size).toBe(CITY_DISTRICTS.length);
    expect(adCrawl("night_market")).not.toBe(STREET_CRAWL);
    expect(adCrawl("deadletter_docks")).not.toBe(adCrawl("relay_heights"));
  });

  it("the ticker uses the crawl for the level it was built in", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("const crawl = adCrawl(this.district)");
    expect(life).toContain("time * crawl + p.offset");
    expect(life).not.toContain("time * 70");
  });
});
