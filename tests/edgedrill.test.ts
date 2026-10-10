/**
 * One scrip skill. The Neon Edge hits harder. Nothing else does, and max health stays.
 */
import { describe, expect, it } from "vitest";
import { campaignOf, emptyCampaign } from "../shared/campaign/save";
import { campaignRequest } from "../shared/campaign/endpoint";
import { createAccount } from "../shared/progression/account";
import { buyEdgeDrill, DRILL_SCRIP } from "../shared/sim/edgedrill";
import { Btn } from "../shared/sim/input";
import { drainageYard } from "../shared/sim/level";
import { createPlayer } from "../shared/sim/player";
import { createWeaponState, EDGE_DRILL, stepWeapon } from "../shared/sim/weapons";
import { World } from "../shared/sim/world";
import { yawDir, v3 } from "../shared/math/vec3";
import { WEAPONS } from "../shared/weapons/manifest";
import { createCityRoom } from "../server/city-room";
import { createCampaignRoom } from "../server/campaign-room";
import { Room, type Conn } from "../server/room";
import { MemoryAccountStore } from "../server/accounts";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

function join(room: Room, store: MemoryAccountStore, id: string): number {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  room.onOpen(c);
  room.onMessage(c, encodeJoin(id, "", id, LOADOUT));
  for (const m of msgs) if (m?.type === "welcome") return m.playerId;
  throw new Error(`no welcome for ${id} in ${store.accounts.size}`);
}

describe("edge drill", () => {
  it("spends 400 scrip once and does not touch chits, depth, or max health", () => {
    const a = createAccount("drill");
    a.wallet.scrip = 400;
    const health = createPlayer(1, "A", { pos: v3(), yaw: 0 }).maxHealth;
    expect(buyEdgeDrill(a)).toEqual({ ok: true });
    expect(campaignOf(a).edgeDrill).toBe(true);
    expect(a.wallet.scrip).toBe(0);
    expect(a.chits).toBe(0);
    expect(a.depth).toBe(1);
    expect(a.xp).toBe(0);
    expect(DRILL_SCRIP).toBe(400);
    expect(buyEdgeDrill(a)).toEqual({ ok: false, reason: "ALREADY DRILLED" });
    expect(a.wallet.scrip).toBe(0);
    expect(createPlayer(1, "A", { pos: v3(), yaw: 0 }).maxHealth).toBe(health);
    const old = createAccount("old");
    const saved = emptyCampaign();
    delete (saved as { edgeDrill?: boolean }).edgeDrill;
    old.campaign = saved;
    expect(campaignOf(old).edgeDrill).toBe(false);
    expect(emptyCampaign().edgeDrill).toBe(false);
  });

  it("399 scrip does not drill, and the campaign op spends 400", () => {
    const a = createAccount("short");
    a.wallet.scrip = 399;
    expect(buyEdgeDrill(a)).toEqual({ ok: false, reason: "NEEDS SCRIP" });
    expect(campaignOf(a).edgeDrill).toBe(false);
    expect(campaignRequest(a, { op: "drill" }).ok).toBe(false);
    a.wallet.scrip = 400;
    expect(campaignRequest(a, { op: "drill" }).ok).toBe(true);
    expect(a.wallet.scrip).toBe(0);
    expect(campaignOf(a).edgeDrill).toBe(true);
    expect(campaignRequest(a, { op: "drill" }).reason).toBe("ALREADY DRILLED");
  });

  it("the sword's swing and lunge hit harder, and the lease-breaker does not", () => {
    expect(WEAPONS.neon_edge.damage).toBe(34);
    expect(WEAPONS.neon_edge.alt.damage).toBe(52);
    const swing = (slot: number, drilled: boolean, alt = false) => {
      const w = createWeaponState();
      w.slot = slot;
      const frame = { tick: 0, buttons: alt ? Btn.Alt : Btn.Fire, yaw: 0, pitch: 0 };
      const first = stepWeapon(w, frame, 0, 0, 0, true, 1, 1, [], undefined, undefined, drilled);
      if (!alt) return first.find((r) => r.kind === "melee");
      const second = stepWeapon(w, { ...frame, tick: 1, buttons: 0 }, Btn.Alt, 0, 0, true, 1, 1, [], undefined, undefined, drilled);
      return second.find((r) => r.kind === "melee");
    };
    const stock = swing(WEAPONS.neon_edge.slot, false);
    const drilled = swing(WEAPONS.neon_edge.slot, true);
    const stockLunge = swing(WEAPONS.neon_edge.slot, false, true);
    const drilledLunge = swing(WEAPONS.neon_edge.slot, true, true);
    const gun = swing(WEAPONS.lease_breaker.slot, true);
    expect(stock && stock.kind === "melee" && stock.damage).toBe(34);
    expect(drilled && drilled.kind === "melee" && drilled.damage).toBe(Math.round(34 * EDGE_DRILL));
    expect(drilled && drilled.kind === "melee" && drilled.chainDamage).toBe(12);
    expect(stockLunge && stockLunge.kind === "melee" && stockLunge.damage).toBe(52);
    expect(drilledLunge && drilledLunge.kind === "melee" && drilledLunge.damage).toBe(Math.round(52 * EDGE_DRILL));
    expect(gun).toBeUndefined();
    const ray = createWeaponState();
    const fired = stepWeapon(ray, { tick: 0, buttons: Btn.Fire, yaw: 0, pitch: 0 }, 0, 0, 0, true, 1, 1, [], undefined, undefined, true);
    expect(fired.find((r) => r.kind === "ray")?.damage).toBe(WEAPONS.lease_breaker.damage);
  });

  it("a drilled edge drops a dummy harder than the stock sword", () => {
    const drop = (drilled: boolean) => {
      const world = new World(drainageYard(), { ai: false, seed: 1, wakePhase: "off", pvp: false });
      const p = world.addPlayer(1, "A", 1);
      p.weapon.slot = WEAPONS.neon_edge.slot;
      p.edgeDrill = drilled;
      const f = yawDir(p.yaw);
      const dummy = world.spawnDummy(v3(p.pos.x + f.x * 1.1, p.pos.y, p.pos.z + f.z * 1.1));
      const before = dummy.health;
      world.step(new Map([[1, { tick: 0, buttons: Btn.Fire, yaw: p.yaw, pitch: 0 }]]));
      return before - dummy.health;
    };
    expect(drop(false)).toBe(34);
    expect(drop(true)).toBe(Math.round(34 * EDGE_DRILL));
    expect(EDGE_DRILL).toBe(1.5);
  });

  it("a city room and a campaign room copy the drill, and a match room does not", () => {
    const store = new MemoryAccountStore(createAccount);
    const file = createAccount("drilled", "D");
    campaignOf(file).edgeDrill = true;
    store.accounts.set(file.id, file);
    const city = createCityRoom({ district: "lease_row", accounts: store, seed: 7 });
    const cityId = join(city.room, store, file.id);
    expect(city.room.world.players.get(cityId)?.edgeDrill).toBe(true);
    expect(city.room.world.pvp).toBe(false);
    const plain = createAccount("plain", "P");
    store.accounts.set(plain.id, plain);
    const plainId = join(city.room, store, plain.id);
    expect(city.room.world.players.get(plainId)?.edgeDrill).toBe(false);
    const camp = createCampaignRoom({ mission: "g_rescue_row", accounts: store, seed: 3, level: "lease_row" });
    const campId = join(camp.room, store, file.id);
    expect(camp.room.world.players.get(campId)?.edgeDrill).toBe(true);
    const match = new Room({ ai: false, seed: 1, level: "lease_row", wakePhase: "off", accounts: store });
    const matchId = join(match, store, file.id);
    expect(match.world.players.get(matchId)?.edgeDrill).toBe(false);
    expect(match.world.players.get(matchId)?.maxHealth).toBe(city.room.world.players.get(cityId)?.maxHealth);
  });
});
