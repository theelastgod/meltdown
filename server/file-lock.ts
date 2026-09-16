/**
 * One request at a time per file, in this process (Stage 58).
 *
 * The money route loads a file, asks the chain, and saves. Two of those in flight for the same
 * file both read the same "owed", both move it, and both write "paid" — the Node host is a single
 * process, but every chain call is an await, and the second request runs inside the first one's
 * wait. The Workers host takes a lease on the file's Durable Object for the same reason
 * (`withLease` in player-do.ts); here a promise chain per id is enough.
 */
const tails = new Map<string, Promise<unknown>>();

export async function withFileLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(id) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(id, tail);
  try {
    return await run;
  } finally {
    if (tails.get(id) === tail) tails.delete(id);
  }
}

/** how many files have a request in flight (for /stats) */
export function locksHeld(): number {
  return tails.size;
}
