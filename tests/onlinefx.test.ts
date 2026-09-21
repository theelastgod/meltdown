/**
 * Online FX uses the same voices as offline (Stage 196).
 *
 * toNetEvent already put waspDeath, mechDeath, fullWake, swap, throw, chargeFull, lunge and melee
 * on the wire. The client's FX switch had no case for them (or a HUD-only case), so a wasp going
 * down online was a log line and no bang.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FX } from "../shared/net/protocol";

const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
const fxSwitch = src.slice(src.indexOf("switch (ev.kind)"), src.indexOf("case \"kill\":"));

describe("online FX has a case for every kind the room sends", () => {
  it("every FX id is handled, not dropped on default", () => {
    for (const name of Object.keys(FX) as (keyof typeof FX)[]) {
      expect(fxSwitch, `${name} is on the wire and has no online case`).toMatch(new RegExp(`case FX\\.${name}`));
    }
  });

  it("a wasp downed online is heard, not only logged", () => {
    const block = fxSwitch.slice(fxSwitch.indexOf("case FX.waspDeath"), fxSwitch.indexOf("case FX.mechDeath"));
    expect(block).toMatch(/this\.audio\.explosion\(false\)/);
  });

  it("a mech disabled online is heard", () => {
    const block = fxSwitch.slice(fxSwitch.indexOf("case FX.mechDeath"), fxSwitch.indexOf("case FX.nodeFlip"));
    expect(block).toMatch(/this\.audio\.explosion\(true\)/);
  });
});
