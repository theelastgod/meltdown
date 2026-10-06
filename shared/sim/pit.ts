/**
 * The scrip pit: one indoor room off the contracts desk. Not a district.
 * Not a city room. One dummy. The purse pays wallet scrip, once a visit.
 */
import { v3 } from "../math/vec3";
import type { Account } from "../progression/account";
import { box, type Box } from "./box";
import type { LevelDef, LightDef } from "./level";

export const SCRIP_PIT_ID = "scrip_pit";

/** Wallet scrip for dropping the dummy. Not chits, not a stat. */
export const PIT_SCRIP = 25;

const paidThisVisit = new WeakSet<Account>();

/**
 * Pay 25 scrip once this visit when the dummy is dead.
 * A living dummy pays nothing and does not close the purse.
 * A second call on the same account does not pay again.
 */
export function pitPurse(account: Account, dummyAlive: boolean): boolean {
  if (dummyAlive) return false;
  if (paidThisVisit.has(account)) return false;
  paidThisVisit.add(account);
  account.wallet.scrip += PIT_SCRIP;
  return true;
}

export function scripPit(): LevelDef {
  const boxes: Box[] = [];
  const x0 = -5, x1 = 5, z0 = -5, z1 = 5;
  boxes.push(box(x0 - 1, -1, z0 - 1, x1 + 1, 0.01, z1 + 1, "floor"));
  boxes.push(box(x0 - 0.4, 0, z0 - 0.4, x1 + 0.4, 3.2, z0, "wall"));
  boxes.push(box(x0 - 0.4, 0, z1, x1 + 0.4, 3.2, z1 + 0.4, "wall"));
  boxes.push(box(x0 - 0.4, 0, z0, x0, 3.2, z1, "wall"));
  boxes.push(box(x1, 0, z0, x1 + 0.4, 3.2, z1, "wall"));
  const spawns = [{ pos: v3(0, 0, 2), yaw: Math.PI }];
  const lights: LightDef[] = [{ x: 0, y: 2.8, z: 0, color: "amber", intensity: 16, range: 14 }];
  return {
    name: SCRIP_PIT_ID,
    displayName: "SCRIP PIT",
    district: "amber",
    bounds: 8,
    boxes,
    spawns,
    dummies: [{ id: 1, pos: v3(0, 0, -2) }],
    killY: -20,
    wasps: [],
    mechs: [],
    nodes: [],
    lights,
    skylineSeed: 7,
  };
}
