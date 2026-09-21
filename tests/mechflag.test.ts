/**
 * A mech lock is heard online (Stage 194).
 *
 * FX.flagged played the HUD flag and not the two-tone. Offline already did both, once a second.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");

describe("a repo mech acquiring you", () => {
  it("the online FX.flagged path uses the same door as the sim event", () => {
    expect(src).toMatch(/case FX\.flagged:\s*if \(ev\.playerId === me\) this\.mechHasYou\(\)/);
    expect(src).toMatch(/case "flagged":\s*if \(ev\.playerId === this\.player\.id\) this\.mechHasYou\(\)/);
    expect(src).toMatch(/this\.audio\.flagged\(\)/);
  });
});
