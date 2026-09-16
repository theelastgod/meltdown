/** D1's surface — prepare/bind/first/all/run/batch — over Node's synchronous SQLite, for driving the real Worker code in tests. */
import type { DatabaseSync } from "node:sqlite";

export function fakeD1(db: DatabaseSync, spy?: { batches: number; runs: number }): D1Database {
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async <T>() => (db.prepare(sql).get(...(args as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => {
      if (spy) spy.runs++;
      db.prepare(sql).run(...(args as never[]));
      return { success: true };
    },
    exec: () => db.prepare(sql).run(...(args as never[])),
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: { exec: () => unknown }[]) => {
      if (spy) spy.batches++;
      // atomic, as D1 batches are
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s.exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
}

export function fakeState(): DurableObjectState {
  const m = new Map<string, unknown>();
  return { storage: { get: async (k: string) => m.get(k), put: async (k: string, v: unknown) => void m.set(k, v), delete: async (k: string) => m.delete(k) } } as unknown as DurableObjectState;
}
