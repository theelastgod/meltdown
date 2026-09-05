/**
 * Kernel Protocols must never be reachable from the PvP room. Walk the
 * static import graph from server/room.ts and the shared sim.
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
