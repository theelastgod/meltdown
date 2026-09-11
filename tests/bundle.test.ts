/**
 * The first download does not carry the chain client (Stage 48).
 *
 * viem, its curve and hash libraries and the contract ABIs were a quarter of the bundle's source,
 * in the one file a phone fetches before it can draw a frame — and a player needs none of it to
 * wake, walk and shoot. client/counter.ts is now reached only through a dynamic import, so Vite
 * emits it as its own chunk that loads the first time the ledger is opened, asked about or acted
 * on. These cases pin that: the static value-import graph from the entry never reaches a module
 * that imports viem, and the lazy edge is really there.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Static VALUE-import graph. `import type` lines are skipped on purpose: a type import is erased
 * at build time and pulls nothing into the bundle, and file.ts keeps one for CounterClient's type.
 */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [resolve(entry)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    let src: string;
    try {
      src = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const re = /^\s*(?:import|export)\s+(?!type\s)[^;]*?\bfrom\s+["']([^"']+)["']/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const spec = m[1]!;
      if (spec.startsWith(".")) stack.push(resolve(dirname(f), /\.(ts|json)$/.test(spec) ? spec : spec + ".ts"));
      else if (spec.startsWith("@shared/")) stack.push(resolve("shared", spec.slice(8) + ".ts"));
      else if (spec.startsWith("@client/")) stack.push(resolve("client", spec.slice(8) + ".ts"));
    }
  }
  return seen;
}

const importsChain = (f: string): boolean => {
  if (!f.endsWith(".ts")) return false;
  const src = readFileSync(f, "utf8");
  return /^\s*import\s+(?!type\s)[^;]*?\bfrom\s+["'](viem|ox|abitype|@noble\/)/m.test(src);
};

describe("the first download does not carry the chain client", () => {
  it("the client entry's static import graph never reaches a module that imports viem", () => {
    const seen = reachable("client/main.ts");
    expect(seen.size).toBeGreaterThan(30); // the walk actually walked
    expect([...seen].filter(importsChain).map((f) => f.slice(resolve(".").length + 1))).toEqual([]);
    expect([...seen].some((f) => /client[\\/]counter\.ts$/.test(f))).toBe(false);
  });

  it("the chain client is still reachable — through a dynamic import, from the file that owns it", () => {
    const file = readFileSync("client/file.ts", "utf8");
    expect(file).toMatch(/import\("\.\/counter"\)/);
    expect(importsChain("client/counter.ts")).toBe(true); // the walk's negative above is not because viem moved
  });

  it("and the walk is not blind: it does reach the modules the game needs at once", () => {
    const seen = [...reachable("client/main.ts")];
    expect(seen.some((f) => /shared[\\/]sim[\\/]world\.ts$/.test(f))).toBe(true);
    expect(seen.some((f) => /client[\\/]render[\\/]renderer\.ts$/.test(f))).toBe(true);
    expect(seen.some((f) => /client[\\/]file\.ts$/.test(f))).toBe(true);
  });
});
