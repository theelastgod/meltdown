/**
 * The file id was a bearer credential, and the game published it.
 *
 * A Ghostfile is named by an id the client claims. Nothing proved the claim. And the id was not
 * secret: `GET /prizes` named every winning file *with the amount it won*, and the dev host's
 * `/stats` named every file in every live room. So the attack was: read the richest file off the
 * leaderboard, and `POST /file/<id>/rewrite` — resetting a Depth-50 file, sixty hours of
 * progression, to Depth 1. No credential, no rate limit that would matter, no trace beyond the
 * victim's own ledger.
 *
 * These cases are that attack and the wall now in front of it.
 */
import { describe, expect, it } from "vitest";
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { encodeJoin, decodeClientMessage } from "../shared/net/protocol";
import { createAccount, fileAuth, newFileSecret, publicLabel, upgradeAccount } from "../shared/progression/account";
import { rewrite } from "../shared/endgame/rewrite";

const KIT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

describe("a file's secret", () => {
  it("is issued fresh and is not guessable", () => {
    const a = newFileSecret();
    const b = newFileSecret();
    expect(a).toHaveLength(24);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-km-np-z2-9]{24}$/); // 32 symbols: no 0/1, no l or o
    // 32^24 is well past anything worth brute-forcing
    expect(Math.log2(32 ** 24)).toBeGreaterThan(110);
  });

  it("adopts the first secret a file is shown, and refuses every other one after", () => {
    const a = createAccount("victim");
    expect(a.secret).toBeUndefined();
    // trust on first use: a file made before secrets existed is claimed by its owner's first request
    expect(fileAuth(a, "mine")).toEqual({ ok: true, adopted: true });
    expect(a.secret).toBe("mine");
    expect(fileAuth(a, "mine").ok).toBe(true);
    expect(fileAuth(a, "theirs").ok).toBe(false);
    expect(fileAuth(a, "").ok).toBe(false);
    expect(fileAuth(a, undefined).ok).toBe(false);
    // and adoption does not happen twice
    expect(fileAuth(a, "theirs")).toEqual({ ok: false, adopted: false });
    expect(a.secret).toBe("mine");
  });

  it("leaves an anonymous file anonymous rather than locking it out", () => {
    const a = createAccount("old");
    expect(fileAuth(a, "").ok).toBe(true);
    expect(a.secret).toBeUndefined();
  });

  it("survives the round trip through a stored row", () => {
    const a = createAccount("round");
    fileAuth(a, "kept");
    const back = upgradeAccount(JSON.parse(JSON.stringify(a)) as typeof a);
    expect(back.secret).toBe("kept");
    expect(fileAuth(back, "kept").ok).toBe(true);
  });
});

describe("the attack: claim a published id and wreck the file", () => {
  /** A Depth-50 file with everything to lose, and its owner's secret. */
  const victim = () => {
    const store = new MemoryAccountStore(devSeed);
    const a = store.load("sandbox-victim", "VICTIM");
    fileAuth(a, "the-owners-secret");
    store.save(a);
    return { store, a };
  };

  it("the thing that used to work: a Rewrite is still one call once you are past the door", () => {
    // the damage is real, which is why the door matters — this is the payload, not the hole
    const { a } = victim();
    expect(a.depth).toBe(50);
    expect(rewrite(a).ok).toBe(true);
    expect(a.depth).toBe(1);
    expect(a.wallet.scrip).toBe(0);
  });

  it("a room join with the wrong secret plays a guest, and never touches the file", () => {
    const { store } = victim();
    const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: store, warmupSeconds: 0, roundSeconds: 600 });
    const conn: Conn = { send: () => {}, close: () => {} };
    room.onOpen(conn);
    room.onMessage(conn, encodeJoin("THIEF", "", "sandbox-victim", KIT, "", "wrong"));

    const rec = room.stats().clients[0]!;
    expect(rec.file?.account).not.toBe("sandbox-victim");
    expect(rec.file?.account.startsWith("guest:")).toBe(true);
    // the victim's file is untouched: still Depth 50, still its own secret
    const after = store.accounts.get("sandbox-victim")!;
    expect(after.depth).toBe(50);
    expect(after.secret).toBe("the-owners-secret");
    // and the thief was not kicked — a published id must not become a way to deny someone a game
    expect(room.stats().kicks).toBe(0);
  });

  it("the owner's own join gets the owner's file", () => {
    const { store } = victim();
    const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: store, warmupSeconds: 0, roundSeconds: 600 });
    const conn: Conn = { send: () => {}, close: () => {} };
    room.onOpen(conn);
    room.onMessage(conn, encodeJoin("VICTIM", "", "sandbox-victim", KIT, "", "the-owners-secret"));
    expect(room.stats().clients[0]!.file?.account).toBe("sandbox-victim");
    expect(room.stats().clients[0]!.file?.depth).toBe(50);
  });

  it("a join with no secret at all also plays a guest, once the file has one", () => {
    const { store } = victim();
    const room = new Room({ ai: false, seed: 5, level: "drainage_yard", accounts: store, warmupSeconds: 0, roundSeconds: 600 });
    const conn: Conn = { send: () => {}, close: () => {} };
    room.onOpen(conn);
    room.onMessage(conn, encodeJoin("THIEF", "", "sandbox-victim", KIT, "", ""));
    expect(room.stats().clients[0]!.file?.account.startsWith("guest:")).toBe(true);
  });
});

describe("what a public board may say", () => {
  it("labels a file without naming it, stably", () => {
    const label = publicLabel("sandbox-victim");
    expect(label).toBe(publicLabel("sandbox-victim"));
    expect(label).not.toContain("sandbox-victim");
    expect(label).toMatch(/^FILE-[0-9A-Z]{7}$/);
    expect(publicLabel("sandbox-victim")).not.toBe(publicLabel("sandbox-other"));
  });
});

describe("the wire still decodes what it used to", () => {
  it("a join carries the secret, and an older join without one still parses", () => {
    const withSecret = decodeClientMessage(encodeJoin("A", "", "file", KIT, "", "shh"));
    expect(withSecret).toMatchObject({ type: "join", account: "file", secret: "shh" });
    const without = decodeClientMessage(encodeJoin("A", "", "file", KIT, ""));
    expect(without).toMatchObject({ type: "join", account: "file", secret: "" });
  });
});
