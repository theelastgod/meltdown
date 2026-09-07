/**
 * The probes' page URLs, linted as source (Stage 33).
 *
 * Nine proof screenshots across four probes were pictures of the opening crawl, because the crawl
 * stands down only for `?crawl=0` or `?headless` and those probes passed neither. `probe/shot.ts`
 * catches it at the shutter now, but only for the shots that go through it — a new probe that opens
 * a page and screenshots it directly would be back where we started. This is the cheap mechanical
 * half: every page a probe opens says what it wants from the crawl.
 *
 * `probe/stage12.ts` is the crawl's own probe and is exempt by name.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "probe";
/** the one probe whose subject is the crawl */
const EXEMPT = new Set(["stage12.ts"]);

interface Site {
  file: string;
  line: number;
  url: string;
}

function gotoSites(): Site[] {
  const out: Site[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".ts"))) {
    if (EXEMPT.has(f)) continue;
    const lines = readFileSync(join(DIR, f), "utf8").split("\n");
    lines.forEach((l, i) => {
      // Match the URL wherever it is written, not only inline in `.goto()`. probe/stage2.ts builds
      // its page URL into a `const url` first, and an earlier version of this lint that only read
      // `.goto(\`…\`)` gave that page a clean bill while it was still showing the crawl. The shot
      // guard caught it at runtime; the lint should not have needed rescuing.
      const m = l.match(/`(https?:\/\/[^`]*\$\{VITE_PORT\}\/\?[^`]*)`/);
      if (m) out.push({ file: f, line: i + 1, url: m[1]! });
    });
  }
  return out;
}

describe("a probe page says what it wants from the opening crawl", () => {
  const sites = gotoSites();

  it("finds the probe pages at all (so an empty pass cannot happen)", () => {
    expect(sites.length).toBeGreaterThan(20);
  });

  it("every page a probe opens either suppresses the crawl or is the crawl probe", () => {
    const loud = sites.filter((s) => !/crawl=0/.test(s.url) && !/headless/.test(s.url));
    expect(loud.map((s) => `${s.file}:${s.line}`)).toEqual([]);
  });
});

describe("proof screenshots go through the guard", () => {
  it("no probe writes a screenshot with a bare page.screenshot({ path }) any more", () => {
    // `shot()` proves the frame is the frame the filename promises. A raw call skips that, so the
    // artifact goes back to being an unchecked claim.
    const bare: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.endsWith(".ts"))) {
      const lines = readFileSync(join(DIR, f), "utf8").split("\n");
      lines.forEach((l, i) => {
        if (/\.screenshot\(\{\s*path:/.test(l) && !/probe\/shot\.ts/.test(f)) bare.push(`${f}:${i + 1}`);
      });
    }
    // Two exemptions, both principled: stage12 and stage13 are the probes whose *subject* is an
    // overlay — the crawl and the menu title cards — so for them a covered frame is the proof.
    // stage21, smoke and live have no check harness to report into; they shoot one frame each and
    // their pages already carry the crawl suppression the lint above enforces.
    const allowed = /^(stage12|stage13|stage21|smoke|live)\.ts:/;
    expect(bare.filter((b) => !allowed.test(b))).toEqual([]);
  });
});
