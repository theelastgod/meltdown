/**
 * Private rooms, and the rule that makes them safe.
 *
 * A room-hour costs 5 $CAPITAL. A file may bank 200 units a day, worth roughly 86 $CAPITAL at the
 * doc-population settled rate — and a private room is one you control, with your own claims and
 * only your friends in it. Five in, eighty-six out, repeatable: the economy's cheapest sink would
 * be its largest mint. So a private room mints nothing, and the room enforces that itself rather
 * than trusting a host to pass the right flags.
 *
 * See shared/net/private.ts and docs/ECONOMY.md.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { MemoryEndgameStore } from "../server/endgame";
import { encodeJoin } from "../shared/net/protocol";
import { currentAudit } from "../shared/endgame/audits";
import { CODE_SPACE, DEFAULT_RULES, isPrivateRoom, makeInviteCode, privateRoomName, ROUND_SECONDS, sanitiseRules, validInviteCode, WARMUP_SECONDS } from "../shared/net/private";
import { RUN_DAILY_CAP, RUN_SCRIP_PER_UNIT } from "../shared/sim/run";

const KIT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

/** A room and one joined Depth-50 file, public or private. */
function room(opts: { private: boolean; run?: boolean; level?: string }) {
  const store = new MemoryAccountStore(devSeed);
  const endgame = new MemoryEndgameStore();
  const banked: { day: number; file: string; units: number }[] = [];
  const r = new Room({
    ai: false, seed: 5, level: opts.level ?? "drainage_yard", accounts: store, endgame,
    warmupSeconds: 0, roundSeconds: 600, run: opts.run ?? false,
    // a caller that tries to make a paid room a prize channel; the room must ignore it
    audit: { week: currentAudit().week, def: currentAudit().audit },
    private: opts.private,
    onRunBank: (day, file, units) => banked.push({ day, file, units }),
  });
  const conn: Conn = { send: () => {}, close: () => {} };
  r.onOpen(conn);
  r.onMessage(conn, encodeJoin("ALPHA", "", "sandbox-priv", KIT, ""));
  const playerId = Math.max(...r.world.players.keys());
  const account = store.accounts.get("sandbox-priv")!;
  return { r, store, endgame, banked, playerId, account };
}

describe("a room you paid for cannot be a room that pays you", () => {
  it("banks Scrip instead of $CAPITAL units, and tells the file why", () => {
    const priv = room({ private: true, run: true });
    const scrip0 = priv.account.wallet.scrip;
    (priv.r as unknown as { onBank(id: number, v: number, z: string): void }).onBank(priv.playerId, 40, "GATE");

    expect(priv.account.counter?.run?.owed ?? 0).toBe(0);
    expect(priv.account.wallet.scrip - scrip0).toBe(40 * RUN_SCRIP_PER_UNIT);
    expect(priv.account.ledger.some((l) => /private room pays no \$CAPITAL/.test(l))).toBe(true);
    // and nothing reached the day's settlement, which is the part that would have minted
    expect(priv.banked).toEqual([]);
  });

  it("while the same bank in a public room owes units, which is the comparison that matters", () => {
    const pub = room({ private: false, run: true });
    (pub.r as unknown as { onBank(id: number, v: number, z: string): void }).onBank(pub.playerId, 40, "GATE");
    expect(pub.account.counter?.run?.owed).toBe(40);
    expect(pub.banked).toEqual([{ day: expect.any(Number), file: "sandbox-priv", units: 40 }]);
  });

  it("refuses to be an Audit room even when the host passes one", () => {
    const priv = room({ private: true });
    // the caller asked for the week's playlist; a paid room is not a prize channel
    expect(priv.r.stats().audit).toBeNull();
    expect(priv.r.mode().startsWith("private:")).toBe(true);
    const pub = room({ private: false });
    expect(pub.r.stats().audit).not.toBeNull();
  });

  it("writes neither endgame board at settlement, even with a round's worth of flips to report", () => {
    // the season is fed by flips, so a room that reported them would still be a prize channel even
    // with its Audit forced off. Give the file real flips and settle.
    const flip = (r: ReturnType<typeof room>) => {
      const p = r.r.world.players.get(r.playerId)!;
      p.stats.flips = 6;
      (r.r as unknown as { roundFlips: Map<number, Map<number, number>> }).roundFlips.set(1, new Map([[p.team, 6]]));
      (r.r as unknown as { pushEndgame(w: number): void }).pushEndgame(p.team);
    };
    // a Deep Wake district: the season only records flips in one, so the yard would prove nothing
    const priv = room({ private: true, level: "lease_row" });
    flip(priv);
    expect(priv.endgame.audit(currentAudit().week)).toEqual([]);
    expect(priv.endgame.season().contributors ?? {}).toEqual({});

    // the same settlement in a public room does feed it, which is what makes the refusal mean something
    const pub = room({ private: false, level: "lease_row" });
    flip(pub);
    expect(Object.keys(pub.endgame.season().contributors ?? {})).toContain("sandbox-priv");
    expect(pub.endgame.audit(currentAudit().week).length).toBeGreaterThan(0);
  });

  it("tells the client, so nobody plays an hour before finding out", () => {
    expect(room({ private: true, run: true }).r.mode()).toBe("private:run");
    expect(room({ private: true }).r.mode()).toBe("private:");
    expect(room({ private: false, run: true }).r.mode()).toBe("run");
  });

  it("the day's cap is unchanged in a public room: the private rule is the only thing that moved", () => {
    const pub = room({ private: false, run: true });
    const bank = (v: number) => (pub.r as unknown as { onBank(id: number, v: number, z: string): void }).onBank(pub.playerId, v, "GATE");
    bank(RUN_DAILY_CAP);
    bank(50);
    expect(pub.account.counter!.run!.banked).toBe(RUN_DAILY_CAP);
  });
});

describe("what a room-hour buys", () => {
  it("only knobs that cannot change a fight", () => {
    const keys = Object.keys(sanitiseRules({})).sort();
    expect(keys).toEqual(["ai", "district", "mode", "roundSeconds", "warmupSeconds"]);
  });

  it("clamps a round into something that starts and ends", () => {
    expect(sanitiseRules({ roundSeconds: 1 }).roundSeconds).toBe(ROUND_SECONDS.min);
    expect(sanitiseRules({ roundSeconds: 99_999 }).roundSeconds).toBe(ROUND_SECONDS.max);
    expect(sanitiseRules({ warmupSeconds: -5 }).warmupSeconds).toBe(WARMUP_SECONDS.min);
    expect(sanitiseRules({ warmupSeconds: 10_000 }).warmupSeconds).toBe(WARMUP_SECONDS.max);
    expect(sanitiseRules({ roundSeconds: Number.NaN }).roundSeconds).toBe(DEFAULT_RULES.roundSeconds);
  });

  it("ignores anything it was not offered, including a district that is not one", () => {
    const r = sanitiseRules({ district: "../../etc/passwd", mode: "audit" } as never);
    expect(r.district).toBe(DEFAULT_RULES.district);
    expect(r.mode).toBe("wake");
    expect((r as unknown as Record<string, unknown>).damage).toBeUndefined();
  });
});

describe("the invite code is the access control", () => {
  it("names the room, so a room cannot be guessed into without one", () => {
    const code = makeInviteCode();
    expect(validInviteCode(code)).toBe(true);
    expect(isPrivateRoom(privateRoomName(code))).toBe(true);
    expect(privateRoomName(code)).toBe(`priv-${code.toLowerCase()}`);
    expect(CODE_SPACE).toBeGreaterThan(1e11);
  });

  it("has no character anyone argues about reading aloud", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const ch of makeInviteCode()) seen.add(ch);
    for (const bad of ["0", "O", "1", "I", "L"]) expect(seen.has(bad)).toBe(false);
    expect(seen.size).toBeGreaterThan(20); // and the alphabet is actually being used
  });

  it("refuses a malformed one rather than guessing at it", () => {
    for (const bad of ["", "SHORT", "toolongcode", "AAAA0AAA", "AAAA AAA", "priv-abcd"]) expect(validInviteCode(bad)).toBe(false);
    expect(isPrivateRoom("neochina-lease_row")).toBe(false);
  });
});
