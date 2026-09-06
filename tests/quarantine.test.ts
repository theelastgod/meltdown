/**
 * Two things must never be reachable from the PvP match bundle, and both were previously only
 * promised in comments: the campaign's Kernel Protocols (paid-power quarantine) and the chain
 * client (a Durable Object that streams 60 Hz should not carry viem and an economy manifest).
 * Walk the static import graph and hold them to it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function imports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const spec = m[1]!;
    if (spec.startsWith(".")) out.push(resolve(dirname(file), spec.endsWith(".ts") ? spec : spec + ".ts"));
    else if (spec.startsWith("@shared/")) out.push(resolve("shared", spec.slice(8) + ".ts"));
  }
  return out;
}

/** Bare specifiers (npm packages) reachable from a file, which the file walk above cannot see. */
function packages(entry: string): Set<string> {
  const out = new Set<string>();
  for (const f of reachable(entry)) {
    const re = /from\s+["']([^".'@][^"']*|@[^"'/]+\/[^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(readFileSync(f, "utf8")))) {
      const spec = m[1]!;
      if (!spec.startsWith(".") && !spec.startsWith("@shared/")) out.add(spec.split("/")[0]!);
    }
  }
  return out;
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [resolve(entry)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const dep of imports(f)) {
      try {
        readFileSync(dep);
        stack.push(dep);
      } catch {
        /* not a local ts file */
      }
    }
  }
  return seen;
}

describe("Kernel Protocols quarantine", () => {
  it("server/room.ts (the PvP match) never imports the campaign power table", () => {
    const seen = reachable("server/room.ts");
    const bad = [...seen].filter((f) => /campaign[\\/]kernelProtocols\.ts$/.test(f));
    expect(bad).toEqual([]);
    expect(seen.size).toBeGreaterThan(10);
  });
  it("the shared simulation never imports it either", () => {
    const seen = reachable("shared/sim/world.ts");
    expect([...seen].some((f) => /kernelProtocols\.ts$/.test(f))).toBe(false);
  });
});

describe("the PvP match bundle carries no chain client", () => {
  /**
   * `wrangler.counter.toml` says the counter-ledger is a separate script "so the PvP Durable Object
   * bundle never carries an economy module or a chain client". That was a sentence in a comment.
   * Stage 18 gave the match Worker a write on every bank, which is exactly the kind of change that
   * drags a chain client in behind it, so the sentence is a test now.
   */
  it("server/worker.ts reaches neither viem nor the ledger", () => {
    const files = [...reachable("server/worker.ts")];
    expect(files.filter((f) => /server[\\/]chain[\\/](ledger|deploy|devnet|boot|signer)\.ts$/.test(f))).toEqual([]);
    expect([...packages("server/worker.ts")].filter((p) => ["viem", "ethereumjs", "@ethereumjs", "solc"].includes(p))).toEqual([]);
  });

  it("and no economy module: the room knows units, not prices", () => {
    const files = [...reachable("server/worker.ts")];
    expect(files.filter((f) => /shared[\\/]economy[\\/](manifest|catalog|settlement|model|chain)\.ts$/.test(f))).toEqual([]);
  });

  it("the day's banking store is reachable, because that is the point of the hook", () => {
    const files = [...reachable("server/worker.ts")];
    expect(files.some((f) => /server[\\/]run-d1\.ts$/.test(f))).toBe(true);
    expect(files.some((f) => /server[\\/]run-store\.ts$/.test(f))).toBe(true);
  });
});
