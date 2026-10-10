/**
 * Four streets say one line, in the role they already have. The rest stay quiet.
 * Hearing it is standing on the fixer's post. It is not a testimony key.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { streetCast } from "../shared/city/continents";
import { fixerOf } from "../shared/city/contest";
import { inStreetTalk, STREET_REACH, streetLine } from "../shared/city/talk";
import { levelById } from "../shared/sim/level";

const TALKING = ["lease_row", "glass_mile", "relay_heights", "night_market"] as const;

describe("street talk", () => {
  it("four roles speak, and a fifth street does not", () => {
    for (const id of TALKING) {
      const cast = streetCast(id)!;
      const line = streetLine(id);
      expect(line, id).toMatch(new RegExp(`^${cast.role}:`));
      expect(fixerOf(levelById(id)), id).toBeTruthy();
    }
    expect(streetLine("paper_wharf")).toBeNull();
    expect(streetLine("drainage_yard")).toBeNull();
    expect(streetLine(undefined)).toBeNull();
    expect(streetLine("lease_row")).not.toBe(streetLine("night_market"));
  });

  it("the post is heard at 8 metres and not past it", () => {
    const spot = { x: 10, z: -4 };
    expect(inStreetTalk(10, -4, spot)).toBe(true);
    expect(inStreetTalk(10 + STREET_REACH, -4, spot)).toBe(true);
    expect(inStreetTalk(10 + STREET_REACH + 0.05, -4, spot)).toBe(false);
    expect(STREET_REACH).toBe(8);
  });

  it("the city says the line from the fixer's post, and the campaign save is not involved", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    const talk = readFileSync(new URL("../shared/city/talk.ts", import.meta.url), "utf8");
    expect(game).toMatch(/streetLine\(this\.world\.level\.name\)/);
    expect(game).toMatch(/fixerOf\(this\.world\.level\)/);
    expect(game).toMatch(/inStreetTalk\(/);
    expect([...talk.matchAll(/from "([^"]+)"/g)].map((m) => m[1])).toEqual(["./continents"]);
  });
});
