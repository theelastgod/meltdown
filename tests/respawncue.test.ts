/**
 * Online respawn is a snapshot edge (Stage 191).
 *
 * audio.respawn and BACK ON THE LEDGER lived on the sim's `respawn` event. Online the client
 * never steps the world, and the server does not put `respawn` on the wire, so the cue never
 * fired. onSnapshot already computed `wasAlive` and threw the dead→alive edge away.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");

describe("back on the ledger online", () => {
  it("the snapshot path fires on the dead-to-alive edge, not only on a sim event", () => {
    expect(src).toMatch(/if \(!wasAlive && p\.alive\) this\.backOnTheLedger\(\)/);
    expect(src).toMatch(/private backOnTheLedger\(\): void/);
    expect(src).toMatch(/this\.audio\.respawn\(\)/);
    expect(src).toMatch(/BACK ON THE LEDGER/);
  });

  it("the sim event still uses the same door, so offline is not a second copy of the line", () => {
    expect(src).toMatch(/case "respawn":\s*if \(ev\.playerId === this\.player\.id\) this\.backOnTheLedger\(\)/);
  });
});
