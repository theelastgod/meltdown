/**
 * The street is easier. Patrols hit for less and less often. The file has more
 * health, a thicker shield, and a shorter wait before that shield comes back.
 * The guns did not get stronger.
 */
import { describe, expect, it } from "vitest";
import { MECH, WASP } from "../shared/sim/ai";
import { BASE_HEALTH, BASE_SHIELD, SHIELD_REGEN_DELAY, SHIELD_REGEN_RATE } from "../shared/sim/player";
import { STREET_SHIELD_SECONDS } from "../shared/sim/world";
import { WEAPONS } from "../shared/weapons/manifest";

describe("an easier street", () => {
  it("cuts the patrols and leaves the lease-breaker where it was", () => {
    expect(WASP.damage).toBe(2);
    expect(WASP.health).toBe(24);
    expect(WASP.fireInterval).toBeGreaterThan(1);
    expect(WASP.detect).toBe(18);
    expect(WASP.fireRange).toBe(25);
    expect(MECH.damage).toBe(8);
    expect(MECH.health).toBe(220);
    expect(MECH.lockTime).toBeGreaterThan(1);
    expect(BASE_HEALTH).toBe(110);
    expect(BASE_SHIELD).toBe(50);
    expect(SHIELD_REGEN_DELAY).toBeLessThan(2);
    expect(SHIELD_REGEN_RATE).toBeGreaterThan(20);
    expect(STREET_SHIELD_SECONDS).toBe(16);
    expect(WEAPONS.lease_breaker.damage).toBe(16);
  });
});
