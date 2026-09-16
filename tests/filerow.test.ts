/**
 * A file row's `extras` is the whole account minus the ledger (Stage 51).
 *
 * The PlayerFile Durable Object writes through to D1 on every save and reads D1 only on a cold
 * load; its `extras` column used to carry three fields, so a cold load came back without the
 * secret, the campaign, the wallet link and the cosmetics. This drives the real Durable Object
 * against a D1 shaped over Node's SQLite: save from one object, load from a fresh one with no
 * storage, and compare the whole account.
 */
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { PlayerFile, type PlayerEnv } from "../server/player-do";
import { createAccount, type Account } from "../shared/progression/account";
import { extrasOf, freshLedgerLines } from "../server/file-row";
import { fakeD1, fakeState } from "./helpers/d1";

describe("a cold load from D1 is the whole file", () => {
  it("what one Durable Object saved, a fresh one with no storage loads back: secret, campaign, wallet link, cosmetics, mastery", async () => {
    const db = new DatabaseSync(":memory:");
    const env: PlayerEnv = { DB: fakeD1(db) };
    const a: Account = createAccount("cold", "COLD");
    a.secret = "kept";
    a.xp = 999;
    a.campaign = { ...(a.campaign ?? {}), faction: "estate" } as typeof a.campaign;
    a.counter = { address: "0xabc", linkedAt: 1, ghostfile: 2, stamps: [], name: null, rig: [3], worn: 3, capital: "0" };
    a.theme = "phosphor";
    a.counters["runBanked"] = 7;
    a.ledger.push("ONE");
    const warm = new PlayerFile(fakeState(), env);
    await warm.fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) }));
    const cold = new PlayerFile(fakeState(), env);
    const b = (await (await cold.fetch(new Request("https://file/load", { method: "POST", body: JSON.stringify({ id: "cold", name: "BLANK" }) }))).json()) as Account;
    expect(b.secret).toBe("kept");
    expect(b.xp).toBe(999);
    expect(b.campaign?.faction).toBe("estate");
    expect(b.counter?.rig).toEqual([3]);
    expect(b.theme).toBe("phosphor");
    expect(b.counters["runBanked"]).toBe(7);
    expect(b.ledger).toEqual(["ONE"]);
    // the rule itself: every field but the ledger is in extras
    const extras = JSON.parse(extrasOf(a)) as Record<string, unknown>;
    expect(Object.keys(extras).sort()).toEqual(Object.keys(a).filter((k) => k !== "ledger").sort());
  });
});

describe("the ledger lines written since the last save survive the room's trim", () => {
  const lines = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `LINE ${from + i}`);
  it("with no trim it is everything past the saved count; with the list full it is exactly the lines pushed since, however many the trim dropped", () => {
    expect(freshLedgerLines([], ["A", "B"])).toEqual(["A", "B"]);
    expect(freshLedgerLines(["A"], ["A", "B"])).toEqual(["B"]);
    expect(freshLedgerLines(["A", "B"], ["A", "B"])).toEqual([]);
    // a full file: 200 saved, one banked, the oldest dropped — the old slice-by-count found nothing here
    const saved = lines(200);
    const after = [...saved.slice(1), "BANKED 40 AT GATE"];
    expect(freshLedgerLines(saved, after)).toEqual(["BANKED 40 AT GATE"]);
    // three pushed between saves
    const three = [...saved.slice(3), "X", "Y", "Z"];
    expect(freshLedgerLines(saved, three)).toEqual(["X", "Y", "Z"]);
    // repeated text: the overlap is by position, so a bank that reads like the last one is still new
    expect(freshLedgerLines(["BANKED 40 AT GATE"], ["BANKED 40 AT GATE", "BANKED 40 AT GATE"])).toEqual(["BANKED 40 AT GATE"]);
  });
  it("the Durable Object persists the line a full file banks", async () => {
    const db = new DatabaseSync(":memory:");
    const env: PlayerEnv = { DB: fakeD1(db) };
    const a: Account = createAccount("full", "FULL");
    a.ledger = lines(200);
    const file = new PlayerFile(fakeState(), env);
    await file.fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) }));
    a.ledger = [...a.ledger.slice(1), "BANKED 40 AT GATE"]; // what the room does at the cap
    await file.fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) }));
    const stored = (db.prepare("SELECT line FROM ledger WHERE account = 'full' ORDER BY seq").all() as { line: string }[]).map((r) => r.line);
    expect(stored).toHaveLength(201);
    expect(stored[200]).toBe("BANKED 40 AT GATE");
  });
});

describe("a cold load is written back to storage (Stage 58)", () => {
  it("so the save after it appends only the new line, instead of every line the row already held", async () => {
    const db = new DatabaseSync(":memory:");
    const env: PlayerEnv = { DB: fakeD1(db) };
    const a: Account = createAccount("cold2", "COLD");
    a.ledger = ["ONE", "TWO", "THREE"];
    await new PlayerFile(fakeState(), env).fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) }));
    // a fresh object with empty storage: the load comes from the row
    const cold = new PlayerFile(fakeState(), env);
    const b = (await (await cold.fetch(new Request("https://file/load", { method: "POST", body: JSON.stringify({ id: "cold2", name: "BLANK" }) }))).json()) as Account;
    b.ledger.push("FOUR");
    await cold.fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(b) }));
    const stored = (db.prepare("SELECT line FROM ledger WHERE account = 'cold2' ORDER BY seq").all() as { line: string }[]).map((r) => r.line);
    expect(stored).toEqual(["ONE", "TWO", "THREE", "FOUR"]);
  });
});
