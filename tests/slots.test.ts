/**
 * Every weapon the game ships can be selected without the server striking the player (Stage 172).
 *
 * The slot select occupies bits 12–15 of the button bitfield, so slot 8 encodes as 0x8000. The
 * server's bound was `0x7fff` — one bit short — and the eighth weapon, CLOCKEATER, was the only
 * one of the eight a player could not ask for. Because a rejected input does not advance the
 * client's acknowledged sequence, each of the three redundant copies the client sends of a press
 * was struck again: one press of the `8` key cost two of three strikes, and a second press inside
 * the five-second window kicked the player out of the match.
 *
 * The walk below is over the manifest, not over a written-down list, so a ninth weapon added at
 * slot 9 fails here until MAX_SLOT and the sim's swap bound are raised to meet it.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { decodeServerMessage, encodeInputs, encodeJoin, INPUT_REDUNDANCY, type NetInput } from "../shared/net/protocol";
import { ACTION_MASK, Btn, cycleSlot, MAX_SLOT, SLOT_MASK, slotOf, validButtons, withSlot } from "../shared/sim/input";
import { WEAPONS } from "../shared/weapons/manifest";
import { SIM_HZ } from "../shared/sim/constants";

const loadout = { primary: "lease_breaker", secondary: "shock_baton", attested: [], keystone: null };

/** A room with one seated player, and the pieces needed to speak to it the way the client does. */
function seated() {
  const logs: string[] = [];
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  let closed: string | null = null;
  const conn: Conn = {
    send: (b) => {
      msgs.push(decodeServerMessage(b, () => null));
    },
    close: (_c, reason) => {
      closed = reason;
    },
  };
  const room = new Room({
    ai: false,
    seed: 3,
    level: "drainage_yard",
    accounts: new MemoryAccountStore(devSeed),
    warmupSeconds: 1,
    roundSeconds: 60,
    onLog: (s: string) => logs.push(s),
  } as never);
  room.onOpen(conn);
  room.onMessage(conn, encodeJoin("ALPHA", "", "sandbox-a", JSON.stringify(loadout)));
  const pending: NetInput[] = [];
  let seq = 0;
  /** one input frame, sent in a batch with the last few — exactly what NetClient.sendInput does */
  const press = (buttons: number) => {
    pending.push({ seq: ++seq, tick: room.tick, buttons, yaw: 0, pitch: 0, viewTick: 0, viewFrac: 0, px: 0, py: 0, pz: 0 });
    room.onMessage(conn, encodeInputs(pending.slice(-INPUT_REDUNDANCY), 0));
  };
  return {
    room,
    press,
    strikes: () => logs.filter((l) => l.startsWith("strike ")),
    kicked: () => msgs.some((m) => m?.type === "kick"),
    get closed() {
      return closed;
    },
    player: () => [...room.world.players.values()][0]!,
  };
}

describe("weapon slots — the server accepts every slot the game ships", () => {
  it("no slot in the manifest is above what the button field is validated for", () => {
    const highest = Math.max(...Object.values(WEAPONS).map((w) => w.slot));
    expect(highest).toBe(MAX_SLOT);
    for (const w of Object.values(WEAPONS)) expect(w.slot).toBeGreaterThanOrEqual(1);
  });

  it("selecting any shipped weapon draws no strike and does not kick", () => {
    for (const w of Object.values(WEAPONS)) {
      const s = seated();
      s.press(Btn.Forward);
      s.press(withSlot(Btn.Forward, w.slot));
      s.press(Btn.Forward);
      s.press(withSlot(Btn.Forward, w.slot)); // a second press, well inside the 5 s strike window
      s.press(Btn.Forward);
      expect(s.strikes(), `slot ${w.slot} (${w.name}) drew strikes`).toEqual([]);
      expect(s.kicked(), `slot ${w.slot} (${w.name}) kicked the player`).toBe(false);
      expect(s.closed).toBeNull();
      expect(s.room.stats().players).toBe(1);
    }
  });

  it("the sim actually swaps to every shipped slot the wire carried", () => {
    for (const w of Object.values(WEAPONS)) {
      const s = seated();
      s.press(withSlot(0, w.slot));
      for (let i = 0; i < Math.ceil(SIM_HZ); i++) s.room.step();
      expect(s.player().weapon.slot, `slot ${w.slot} (${w.name}) never became the held weapon`).toBe(w.slot);
    }
  });

  it("CLOCKEATER, the slot the bound used to exclude, survives the round trip", () => {
    expect(WEAPONS.clockeater.slot).toBe(8);
    expect(withSlot(0, 8)).toBe(0x8000);
    expect(validButtons(0x8000)).toBe(true);
    const s = seated();
    s.press(withSlot(Btn.Forward, 8));
    for (let i = 0; i < Math.ceil(SIM_HZ); i++) s.room.step();
    expect(s.strikes()).toEqual([]);
    expect(s.player().weapon.slot).toBe(8);
  });
});

describe("weapon slots — the bitfield is still held to what the sim defines", () => {
  it("accepts every action bit and every shipped slot together", () => {
    expect(validButtons(ACTION_MASK)).toBe(true);
    expect(validButtons(withSlot(ACTION_MASK, MAX_SLOT))).toBe(true);
    for (let slot = 0; slot <= MAX_SLOT; slot++) expect(validButtons(withSlot(ACTION_MASK, slot))).toBe(true);
  });

  it("rejects slots the game does not ship — the nibble holds 15, the arsenal holds 8", () => {
    for (let slot = MAX_SLOT + 1; slot <= 0xf; slot++) {
      expect(validButtons(withSlot(0, slot)), `slot ${slot} was accepted`).toBe(false);
      expect(slotOf(withSlot(0, slot))).toBe(slot);
    }
  });

  it("rejects bits above the field, and non-integers", () => {
    expect(validButtons((ACTION_MASK | SLOT_MASK) + 1)).toBe(false);
    expect(validButtons(1 << 16)).toBe(false);
    expect(validButtons(-1)).toBe(false);
    expect(validButtons(1.5)).toBe(false);
    expect(validButtons(NaN)).toBe(false);
    expect(validButtons(Infinity)).toBe(false);
  });

  it("a slot the game does not ship is refused at the room, not silently ignored", () => {
    const s = seated();
    s.press(withSlot(Btn.Forward, 9));
    expect(s.strikes()).toHaveLength(1);
  });
});

describe("weapon slots — cycling reaches every slot and only the slots that exist", () => {
  it("one lap forward visits all eight and comes home", () => {
    const seen: number[] = [];
    let slot = 1;
    for (let i = 0; i < MAX_SLOT; i++) {
      seen.push(slot);
      slot = cycleSlot(slot, 1);
    }
    expect(seen).toEqual(Array.from({ length: MAX_SLOT }, (_, i) => i + 1));
    expect(slot).toBe(1);
  });

  it("one lap backward visits all eight and comes home", () => {
    const seen: number[] = [];
    let slot = 1;
    for (let i = 0; i < MAX_SLOT; i++) {
      seen.push(slot);
      slot = cycleSlot(slot, -1);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: MAX_SLOT }, (_, i) => i + 1));
    expect(slot).toBe(1);
  });

  it("the wheel and the phone's WPN button walk into the excluded slot, so both are held to what the server takes", () => {
    for (let slot = 1; slot <= MAX_SLOT; slot++) {
      for (const dir of [1, -1] as const) {
        const next = cycleSlot(slot, dir);
        expect(validButtons(withSlot(Btn.Forward, next)), `cycling ${dir > 0 ? "up" : "down"} from ${slot} produced slot ${next}`).toBe(true);
      }
    }
  });

  it("a player cycling twice around is still in the match", () => {
    const s = seated();
    let slot = 1;
    for (let i = 0; i < MAX_SLOT * 2; i++) {
      slot = cycleSlot(slot, 1);
      s.press(withSlot(Btn.Forward, slot));
    }
    expect(s.strikes()).toEqual([]);
    expect(s.kicked()).toBe(false);
    expect(s.room.stats().players).toBe(1);
  });
});
