/**
 * A distant crack does not cross every street at the same speed.
 * Lease Row, the yard, and the indoor rooms keep the 340 the crack shipped with.
 * Gain, pan, muffle, and range stay put. The slap stays shotSlap.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SOUND_SPEED, gunCue, soundSpeed } from "../client/gunfire";
import { CITY_DISTRICTS } from "../shared/net/city";

const me = { x: 0, z: 0, yaw: 0 };

describe("each district carries a crack at its own speed", () => {
  it("keeps the street speed and gives the other nineteen their own", () => {
    expect(SOUND_SPEED).toBe(340);
    expect(soundSpeed(undefined)).toBe(SOUND_SPEED);
    expect(soundSpeed("lease_row")).toBe(SOUND_SPEED);
    expect(soundSpeed("drainage_yard")).toBe(SOUND_SPEED);
    expect(soundSpeed("deadletter_office")).toBe(SOUND_SPEED);
    expect(soundSpeed("white_office")).toBe(SOUND_SPEED);
    const speeds = CITY_DISTRICTS.map((id) => soundSpeed(id));
    expect(new Set(speeds).size).toBe(CITY_DISTRICTS.length);
    expect(soundSpeed("night_market")).toBeLessThan(SOUND_SPEED);
    expect(soundSpeed("deadletter_docks")).toBeLessThan(soundSpeed("relay_heights"));
  });

  it("a crack at ninety metres waits on that speed, and loudness stays put", () => {
    const lease = gunCue(0, -90, me, "lease_row")!;
    const market = gunCue(0, -90, me, "night_market")!;
    const plain = gunCue(0, -90, me)!;
    expect(lease.delay).toBeCloseTo(90 / SOUND_SPEED, 6);
    expect(market.delay).toBeCloseTo(90 / soundSpeed("night_market"), 6);
    expect(market.delay).toBeGreaterThan(lease.delay);
    expect(gunCue(0, -90, me, "deadletter_docks")!.delay).toBeGreaterThan(gunCue(0, -90, me, "relay_heights")!.delay);
    expect(lease.gain).toBe(plain.gain);
    expect(market.gain).toBe(plain.gain);
    expect(lease.muffle).toBe(plain.muffle);
    expect(market.pan).toBe(plain.pan);
  });

  it("fails closed if the read is removed from the crack", () => {
    const gun = readFileSync(new URL("../client/gunfire.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(gun).toContain("function soundSpeed");
    expect(gun).toContain("distance / soundSpeed(name)");
    expect(game).toContain("gunCue(ev.fx, ev.fz, this.listenPoint(), this.world.level.name)");
    expect(game).toContain("gunCue(ev.from.x, ev.from.z, this.listenPoint(), this.world.level.name)");
  });
});
