/**
 * Stage 7: the Ledger Graph at full size, chips and firmwares as paired
 * trades the sim actually runs, challenge-gated mastery, and stamps that
 * un-redact only when the server has seen the thing.
 */
import { describe, expect, it } from "vitest";
import { ALL_ITEMS, KEYSTONES, LEDGER_ITEMS, lintItemSchema } from "../shared/manifest/items";
import { CHIPS, lintChipSchema } from "../shared/manifest/chips";
import { FIRMWARES, weaponWithFirmware } from "../shared/manifest/firmwares";
import { DEFAULT_LOADOUT, kitFor, SANDBOX_RANKS, validateLoadout } from "../shared/manifest/loadout";
import { addXp, bump, CURRICULA, emptyMastery, GATES, rankFor, xpForRank } from "../shared/progression/mastery";
import { redact, STAMPS } from "../shared/progression/stamps";
import { certifyFirmwares } from "../shared/sim/ttk";
import { World, hashWorld } from "../shared/sim/world";
import { drainageYard } from "../shared/sim/level";
import { Btn, withSlot } from "../shared/sim/input";
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";
import { WEAPON_LIST, WEAPONS, type WeaponDef } from "../shared/weapons/manifest";
import { modsFor, weaponDefOf } from "../shared/sim/player";

const owned = ALL_ITEMS.map((i) => i.id);

describe("the Ledger Graph at launch size", () => {
  it("ships 48 nodes in three rings and three keystones, all reconciled and mutually linked", () => {
    expect(LEDGER_ITEMS.length).toBe(48);
    expect(KEYSTONES.length).toBe(3);
    expect([1, 2, 3].map((r) => LEDGER_ITEMS.filter((n) => n.ring === r).length)).toEqual([12, 18, 18]);
    expect(lintItemSchema()).toEqual([]);
    for (const n of LEDGER_ITEMS) expect(n.links.length, n.id).toBeGreaterThanOrEqual(3);
    // no node touches damage or health: every weapon's shot count holds for every build
    for (const n of LEDGER_ITEMS) for (const m of [...n.benefits, ...n.costs]) expect(["damage", "maxHealth", "maxShield"]).not.toContain(m.stat);
  });
  it("the whole graph is one connected constellation, and deeper rings gate on Depth", () => {
    const seen = new Set<string>(["slipfile"]);
    const stack = ["slipfile"];
    while (stack.length) {
      const id = stack.pop()!;
      for (const l of ALL_ITEMS.find((i) => i.id === id)!.links) if (!seen.has(l)) {
        seen.add(l);
        stack.push(l);
      }
    }
    expect([...seen].filter((id) => ALL_ITEMS.find((i) => i.id === id)?.kind === "node").length).toBe(48);
    expect(Math.min(...LEDGER_ITEMS.filter((n) => n.ring === 3).map((n) => n.requiresDepth))).toBeGreaterThanOrEqual(16);
  });
  it("attest-7-connected still holds across rings", () => {
    const chain = ["slipfile", "escrow", "wake_lung", "static_skin", "curb_weight", "repo_grip", "lease_lapse"];
    const r = validateLoadout({ ...DEFAULT_LOADOUT, attested: chain }, owned, 50);
    expect(r.errors).toEqual([]);
    const split = validateLoadout({ ...DEFAULT_LOADOUT, attested: ["slipfile", "black_swan"] }, owned, 50);
    expect(split.errors.map((e) => e.rule)).toContain("connected");
  });
});

describe("chips and firmwares", () => {
  it("160 chips: three sockets × eight weapons, every one a reconciled paired trade, no damage or health", () => {
    expect(CHIPS.length).toBe(160);
    expect(lintChipSchema()).toEqual([]);
    for (const w of WEAPON_LIST) expect(CHIPS.filter((c) => c.weapon === w.id).length).toBe(20);
    expect(new Set(CHIPS.map((c) => c.socket)).size).toBe(3);
  });
  it("chips are validated: one per socket, right weapon, right socket, unlocked by rank", () => {
    const ranks = { lease_breaker: 12 };
    const ok = validateLoadout({ ...DEFAULT_LOADOUT, chips: { lease_breaker: { muzzle: "lease_breaker:long_barrel", kinetic: "lease_breaker:sling" } } }, owned, 50, ranks);
    expect(ok.errors).toEqual([]);
    const wrongWeapon = validateLoadout({ ...DEFAULT_LOADOUT, chips: { lease_breaker: { muzzle: "stack_smg:long_barrel" } } }, owned, 50, ranks);
    expect(wrongWeapon.errors.map((e) => e.rule)).toContain("chip-weapon");
    const wrongSocket = validateLoadout({ ...DEFAULT_LOADOUT, chips: { lease_breaker: { kinetic: "lease_breaker:long_barrel" } } }, owned, 50, ranks);
    expect(wrongSocket.errors.map((e) => e.rule)).toContain("chip-socket");
    const locked = validateLoadout({ ...DEFAULT_LOADOUT, chips: { lease_breaker: { muzzle: "lease_breaker:flash_cut" } } }, owned, 50, ranks); // rank 22
    expect(locked.errors.map((e) => e.rule)).toContain("chip-rank");
    const fw = validateLoadout({ ...DEFAULT_LOADOUT, firmware: { lease_breaker: "lease_breaker:three_count" } }, owned, 50, ranks); // rank 20
    expect(fw.errors.map((e) => e.rule)).toContain("firmware-rank");
    const fwOk = validateLoadout({ ...DEFAULT_LOADOUT, firmware: { lease_breaker: "lease_breaker:three_count" } }, owned, 50, SANDBOX_RANKS);
    expect(fwOk.errors).toEqual([]);
  });
  it("a chip's mods apply only while its weapon is held; a firmware patches the definition the sim runs", () => {
    const world = new World(drainageYard(), { ai: false, seed: 1 });
    const p = world.addPlayer(1, "A", 1, { ...DEFAULT_LOADOUT, chips: { lease_breaker: { muzzle: "lease_breaker:long_barrel" } }, firmware: { stack_smg: "stack_smg:dump_stage" } });
    expect(modsFor(p, 1).range).toBeCloseTo(1.03, 5);
    expect(modsFor(p, 3).range).toBe(1);
    expect(weaponDefOf(p, 3).rpm).toBeGreaterThan(weaponWithFirmware("stack_smg", null).rpm);
    expect(p.weapon.ammo[3]).toBe(weaponDefOf(p, 3).magSize);
    expect(kitFor(DEFAULT_LOADOUT).lease_breaker.mechanics).toEqual([]);
  });
  it("every firmware is certified inside the TTK band at its weapon's ideal range", () => {
    expect(FIRMWARES.length).toBe(12);
    const certs = certifyFirmwares();
    for (const c of certs) expect(c.ok, `${c.firmware} ${c.seconds.toFixed(3)} s`).toBe(true);
  }, 60000);
  it("the burst firmware is deterministic and fires three rounds per trigger", () => {
    const run = () => {
      const world = new World(drainageYard(), { ai: false, seed: 3 });
      const p = world.addPlayer(1, "A", 1, { ...DEFAULT_LOADOUT, firmware: { lease_breaker: "lease_breaker:three_count" } });
      let fires = 0;
      for (let t = 0; t < 90; t++) {
        world.step(new Map([[1, { tick: t, buttons: t === 0 ? withSlot(0, 1) : t > 30 && t < 34 ? Btn.Fire : 0, yaw: p.yaw, pitch: 0 }]]));
        for (const e of world.drainEvents()) if (e.type === "fire") fires++;
      }
      return { fires, hash: hashWorld(world) };
    };
    const a = run();
    const b = run();
    expect(a.fires).toBe(3);
    expect(a.hash).toBe(b.hash);
  });
});

describe("mastery — challenge-gated ranks", () => {
  it("XP alone cannot pass a gate; the gate's challenge does", () => {
    const m = emptyMastery();
    let xp = 0;
    for (let r = 1; r < 8; r++) xp += xpForRank(r);
    addXp("lease_breaker", m, xp);
    expect(m.rank).toBe(5); // held at the first gate
    expect(GATES[0]).toBe(5);
    const gate = CURRICULA.lease_breaker[0]!;
    for (let i = 0; i < gate.need; i++) bump("lease_breaker", m, gate.counter);
    expect(m.done).toContain(gate.id);
    expect(m.rank).toBe(8);
    expect(rankFor("lease_breaker", 10_000_000, CURRICULA.lease_breaker.map((c) => c.id))).toBe(30);
  });
  it("stamps redact to blocks and un-redact by id; the catalogue is ~120 firsts", () => {
    expect(STAMPS.length).toBeGreaterThanOrEqual(110);
    expect(new Set(STAMPS.map((s) => s.id)).size).toBe(STAMPS.length);
    expect(redact("FIRST SLIDE-JUMP KILL")).toBe("█████ █████-████ ████");
  });
});

describe("the server verifies firsts", () => {
  function conn() {
    const msgs: ReturnType<typeof decodeServerMessage>[] = [];
    const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
    return { c, msgs };
  }
  it("a kill in a room feeds mastery XP and un-redacts FIRST FILE CLOSED; a wasp kill stamps FIRST WASP DOWNED", () => {
    const store = new MemoryAccountStore(devSeed);
    const room = new Room({ ai: true, seed: 3, level: "drainage_yard", accounts: store, warmupSeconds: 1, roundSeconds: 60 });
    const a = conn();
    room.onOpen(a.c);
    room.onMessage(a.c, encodeJoin("ALPHA", "", "fresh-a", JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] })));
    const b = conn();
    room.onOpen(b.c);
    room.onMessage(b.c, encodeJoin("BRAVO", "", "fresh-b", JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] })));
    const pa = room.world.players.get(1)!;
    const pb = room.world.players.get(2)!;
    pa.pos.x = -20; pa.pos.z = 0; pb.pos.x = -12; pb.pos.z = 0;
    // ALPHA shoots BRAVO with the sim's own aim helper
    for (let t = 0; t < 300 && pb.alive; t++) {
      const aim = room.world.aimAt(pa, { x: pb.pos.x, y: pb.pos.y + 0.95, z: pb.pos.z });
      room.world.applyInput(pa, { tick: t, buttons: Btn.Fire, yaw: aim.yaw - (pa.weapon.kickYaw + pa.weapon.patX), pitch: aim.pitch - (pa.weapon.kickPitch + pa.weapon.patY) }, { online: true });
      room.step();
    }
    expect(pb.alive).toBe(false);
    const acc = store.accounts.get("fresh-a")!;
    expect(acc.mastery.lease_breaker.xp).toBeGreaterThan(0);
    expect(acc.stamps).toContain("first_kill:lease_breaker");
    const stampMsgs = a.msgs.filter((m) => m?.type === "file" && m.file.reason === "stamp");
    expect(stampMsgs.length).toBeGreaterThan(0);
    expect((stampMsgs[0] as { file: { newStamps: string[] } }).file.newStamps).toContain("first_kill:lease_breaker");
  });
});

/**
 * A rifle's firmware and chips belong to the rifle (Stage 42).
 *
 * probe:mastery asserts this end to end and has failed twice on CI reporting a leak the sim cannot
 * produce — both times because the networked page had reconciled the held slot back between the
 * probe confirming the swap and reading the numbers. `weaponDefOf` and `modsFor` are pure functions
 * of `p.weapon.slot`, so a mismatch between the two is not a thing the game can do; it is only ever
 * a thing a probe can observe.
 *
 * These cases hold the property where it actually lives, with no client, no server and no clock. If
 * the firmware ever really does reach another weapon, this is what fails — and it fails the same way
 * on every machine.
 */
describe("a firmware patches the weapon it was fitted to, and nothing else", () => {
  const kitted = () => {
    const world = new World(drainageYard(), { ai: false, seed: 5 });
    return world.addPlayer(1, "A", 1, {
      ...DEFAULT_LOADOUT,
      chips: { lease_breaker: { muzzle: "lease_breaker:long_barrel", kinetic: "lease_breaker:sling" } },
      firmware: { lease_breaker: "lease_breaker:three_count" },
    });
  };

  it("the rifle's slot carries the burst and the chip mods", () => {
    const p = kitted();
    const rifle = WEAPONS.lease_breaker!.slot;
    expect(weaponDefOf(p, rifle).burst?.count).toBe(3);
    expect(modsFor(p, rifle).range).toBeGreaterThan(1.02);
    expect(modsFor(p, rifle).moveSpeed).toBeGreaterThan(1.01);
  });

  it("and no other slot does — checked across every weapon, not just the one the probe switches to", () => {
    const p = kitted();
    const rifle = WEAPONS.lease_breaker!.slot;
    const base = p.mods;
    for (const w of Object.values(WEAPONS) as WeaponDef[]) {
      if (w.slot === rifle) continue;
      expect(weaponDefOf(p, w.slot).burst ?? null, `${w.id} burst`).toBe(w.burst ?? null);
      expect(modsFor(p, w.slot).range, `${w.id} range`).toBe(base.range);
      expect(modsFor(p, w.slot).moveSpeed, `${w.id} move`).toBe(base.moveSpeed);
    }
  });

  it("switching the held slot switches which numbers apply, with nothing left over", () => {
    const p = kitted();
    const rifle = WEAPONS.lease_breaker!.slot;
    const other = (Object.values(WEAPONS) as WeaponDef[]).find((w) => w.slot !== rifle)!.slot;
    p.weapon.slot = rifle;
    expect(weaponDefOf(p).burst?.count).toBe(3);
    expect(modsFor(p).range).toBeGreaterThan(1.02);
    // the accessors read the slot directly, so the change is complete the instant the slot moves —
    // there is no tick in which the SMG is holding the rifle's numbers
    p.weapon.slot = other;
    expect(weaponDefOf(p).burst ?? null).toBe((Object.values(WEAPONS) as WeaponDef[]).find((w) => w.slot === other)!.burst ?? null);
    expect(modsFor(p).range).toBe(p.mods.range);
    expect(modsFor(p).moveSpeed).toBe(p.mods.moveSpeed);
  });
});
