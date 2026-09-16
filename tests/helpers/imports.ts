/**
 * One static import-graph walker for every quarantine test (Stage 55). Three tests had grown
 * three copies with three sets of resolution rules, so an import form one copy understood could
 * slip past another. This is the only one now.
 *
 * `valueOnly` skips `import type` lines: a type import is erased at build time and pulls nothing
 * into a bundle, which is what the bundle test asks; the sim and Kernel Protocol quarantines want
 * every edge, type or not, because the question there is what a module may know about at all.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface WalkOptions {
  valueOnly?: boolean;
}

/** The local files a file imports, resolved to absolute paths: relative specifiers, `@shared/` and `@client/`. */
export function localImports(file: string, opts: WalkOptions = {}): string[] {
  const src = readFileSync(file, "utf8");
  const re = opts.valueOnly ? /^\s*(?:import|export)\s+(?!type\s)[^;]*?\bfrom\s+["']([^"']+)["']/gm : /from\s+["']([^"']+)["']/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const spec = m[1]!;
    const withExt = /\.(ts|json)$/.test(spec) ? spec : spec + ".ts";
    if (spec.startsWith(".")) out.push(resolve(dirname(file), withExt));
    else if (spec.startsWith("@shared/")) out.push(resolve("shared", withExt.slice(8)));
    else if (spec.startsWith("@client/")) out.push(resolve("client", withExt.slice(8)));
  }
  return out;
}

/** Every local file reachable from an entry, the entry included. A specifier that is not a local file is skipped. */
export function reachable(entry: string, opts: WalkOptions = {}): Set<string> {
  const seen = new Set<string>();
  const stack = [resolve(entry)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    let deps: string[];
    try {
      deps = localImports(f, opts);
    } catch {
      continue; // not a local file
    }
    seen.add(f);
    stack.push(...deps);
  }
  return seen;
}
