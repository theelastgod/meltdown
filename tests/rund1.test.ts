/**
 * The run store on D1, driven through the real Worker class over a D1 shaped on Node's SQLite
 * (Stage 55): a bank is one batch, not two statements, and a repair touches the ledger only.
 */
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { D1RunStore } from "../server/run-d1";
import { SCHEMA } from "../server/schema";
import { fakeD1 } from "./helpers/d1";

const fresh = () => {
  const db = new DatabaseSync(":memory:");
  for (const q of SCHEMA) db.exec(q);
  const spy = { batches: 0, runs: 0 };
  return { db, spy, store: new D1RunStore(fakeD1(db, spy)) };
};

describe("D1RunStore", () => {
  it("a bank is one batch: the ledger row and the gross record land together", async () => {
    const { store, spy } = fresh();
    await store.add(20000, "f1", 40);
    expect(spy.batches).toBe(1);
    expect(spy.runs).toBe(0);
    expect(await store.day(20000)).toEqual([{ file: "f1", units: 40 }]);
    expect((await store.stat(20000)).grossUnits).toBe(40);
  });

  it("a repair restores the ledger and leaves the gross record exactly as banked", async () => {
    const { store } = fresh();
    await store.add(20000, "f1", 40);
    await store.spend(20000, "f1", 40);
    await store.restore(20000, "f1", 40);
    expect(await store.day(20000)).toEqual([{ file: "f1", units: 40 }]);
    expect((await store.stat(20000)).grossUnits).toBe(40); // through add() it would read 80
  });
});
