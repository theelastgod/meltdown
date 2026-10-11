/**
 * Buying or finding the Neon Edge puts it in the hand. The swap does not heal.
 * A death in this room comes back holding it. Another gun still respawns on the primary.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { campaignOf } from "../shared/campaign/save";
import { campaignRequest } from "../shared/campaign/endpoint";
import { withSlot } from "../shared/sim/input";
import { drainageYard } from "../shared/sim/level";
import { respawnPlayer } from "../shared/sim/player";
import { World } from "../shared/sim/world";
import { WEAPONS } from "../shared/weapons/manifest";
import { createAccount } from "../shared/progression/account";
import { createCityRoom } from "../server/city-room";
import { createCampaignRoom } from "../server/campaign-room";
import { Room, type Conn } from "../server/room";
import { MemoryAccountStore } from "../server/accounts";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

function join(room: Room, id: string): number {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  room.onOpen(c);
  room.onMessage(c, encodeJoin(id, "", id, LOADOUT));
  for (const m of msgs) if (m?.type === "welcome") return m.playerId;
  throw new Error(`no welcome for ${id}`);
}

describe("the neon edge in the hand", () => {
  it("a slot request draws the sword without healing, and a death in this room keeps it", () => {
    const world = new World(drainageYard(), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const p = world.addPlayer(1, "A", 1);
    expect(p.weapon.slot).toBe(WEAPONS.lease_breaker.slot);
    expect(p.kit.primarySlot).toBe(WEAPONS.lease_breaker.slot);
    p.health = 40;
    const max = p.maxHealth;
    world.step(new Map([[1, { tick: 0, buttons: withSlot(0, WEAPONS.neon_edge.slot), yaw: p.yaw, pitch: 0 }]]));
    expect(p.weapon.slot).toBe(WEAPONS.neon_edge.slot);
    expect(p.kit.primarySlot).toBe(WEAPONS.neon_edge.slot);
    expect(p.health).toBe(40);
    expect(p.maxHealth).toBe(max);
    respawnPlayer(p, world.level.spawns[0]!);
    expect(p.weapon.slot).toBe(WEAPONS.neon_edge.slot);
  });

  it("swapping to another gun does not change the gun a death hands back", () => {
    const world = new World(drainageYard(), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const p = world.addPlayer(1, "A", 1);
    p.health = 40;
    world.step(new Map([[1, { tick: 0, buttons: withSlot(0, WEAPONS.stack_smg.slot), yaw: p.yaw, pitch: 0 }]]));
    expect(p.weapon.slot).toBe(WEAPONS.stack_smg.slot);
    expect(p.kit.primarySlot).toBe(WEAPONS.lease_breaker.slot);
    expect(p.health).toBe(40);
    respawnPlayer(p, world.level.spawns[0]!);
    expect(p.weapon.slot).toBe(WEAPONS.lease_breaker.slot);
  });

  it("the desk op spends 600 once and leaves the join loadout on the lease breaker", () => {
    const a = createAccount("edge");
    a.wallet.scrip = 599;
    expect(campaignRequest(a, { op: "edge" }).ok).toBe(false);
    expect(a.wallet.scrip).toBe(599);
    expect(campaignOf(a).weapons).toEqual([]);
    a.wallet.scrip = 600;
    expect(campaignRequest(a, { op: "edge" }).ok).toBe(true);
    expect(a.wallet.scrip).toBe(0);
    expect(campaignOf(a).weapons).toEqual(["neon_edge"]);
    expect(a.owned).toContain("weapon:neon_edge");
    expect(a.loadout.primary).toBe("lease_breaker");
    expect(a.chits).toBe(0);
    expect(campaignRequest(a, { op: "edge" }).reason).toBe("ALREADY OWNED");
    expect(a.wallet.scrip).toBe(0);
  });

  it("a city room and a campaign room start on the sword, and a match does not", () => {
    const store = new MemoryAccountStore(createAccount);
    const file = createAccount("edge", "E");
    file.wallet.scrip = 600;
    expect(campaignRequest(file, { op: "edge" }).ok).toBe(true);
    store.accounts.set(file.id, file);
    const city = createCityRoom({ district: "lease_row", accounts: store, seed: 7 });
    const held = city.room.world.players.get(join(city.room, file.id))!;
    expect(held.weapon.slot).toBe(WEAPONS.neon_edge.slot);
    expect(held.kit.primarySlot).toBe(WEAPONS.neon_edge.slot);
    expect(held.health).toBe(held.maxHealth);
    expect(city.room.world.pvp).toBe(false);
    const plain = createAccount("plain", "P");
    store.accounts.set(plain.id, plain);
    const other = city.room.world.players.get(join(city.room, plain.id))!;
    expect(other.weapon.slot).toBe(WEAPONS.lease_breaker.slot);
    expect(other.maxHealth).toBe(held.maxHealth);
    const camp = createCampaignRoom({ mission: "g_rescue_row", accounts: store, seed: 3, level: "lease_row" });
    expect(camp.room.world.players.get(join(camp.room, file.id))?.weapon.slot).toBe(WEAPONS.neon_edge.slot);
    const match = new Room({ ai: false, seed: 1, level: "lease_row", wakePhase: "off", accounts: store });
    const matched = match.world.players.get(join(match, file.id))!;
    expect(matched.weapon.slot).toBe(WEAPONS.lease_breaker.slot);
    expect(matched.kit.primarySlot).toBe(WEAPONS.lease_breaker.slot);
    expect(matched.maxHealth).toBe(held.maxHealth);
  });

  it("the desk and the rescue gig ask for the sword", () => {
    const camp = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    const input = readFileSync(new URL("../client/input.ts", import.meta.url), "utf8");
    const player = readFileSync(new URL("../shared/sim/player.ts", import.meta.url), "utf8");
    expect(input).toMatch(/requestSlot\(slot: number\)/);
    expect(camp.match(/this\.drawEdge\(\)/g)?.length).toBe(2);
    expect(camp).toMatch(/p\.weapon\.slot = slot/);
    expect(camp).toMatch(/p\.kit\.primarySlot = slot/);
    expect(camp).toMatch(/if \(this\.game\.online\) return/);
    expect(player).toMatch(/p\.weapon\.slot === WEAPONS\.neon_edge\.slot && p\.weapon\.slot !== held/);
    expect(player).toMatch(/export function holdNeonEdge/);
    const city = readFileSync(new URL("../server/city-room.ts", import.meta.url), "utf8");
    const coop = readFileSync(new URL("../server/campaign-room.ts", import.meta.url), "utf8");
    expect(city).toMatch(/if \(c\.weapons\.includes\("neon_edge"\)\) holdNeonEdge\(p\)/);
    expect(coop).toMatch(/if \(c\.weapons\.includes\("neon_edge"\)\) holdNeonEdge\(p\)/);
    expect(camp).toMatch(/postCampaign\(\{ op: "edge" \}\)/);
    expect(camp).toMatch(/keepEdge\(\)/);
  });
});
