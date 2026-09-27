/**
 * The opening (Stage 691): a trailer of the opening text, shown once.
 *
 * The typed crawl played on every visit because the gate that decides whether it plays never read
 * the "only until seen" flag it was meant to honour. These hold the gate to the owner's rule, the
 * trailer's lines to the opening text word for word, and the trailer itself to thirty seconds.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CRAWL_TEXT, DEFAULT_CRAWL, OPENING_TEXT, TRAILER_LINES } from "../client/crawl-text";
import { crawlWanted } from "../client/crawl";
import { TITLE_CARDS } from "../client/menu";
import { MAX_TRAILER_SECONDS, TRAILER } from "../shared/assets/video";
import { lintTrailer } from "../shared/assets/lint";

const q = (s = "") => new URLSearchParams(s);

describe("the opening plays once", () => {
  it("a browser's first visit gets it; once seen, never again, unless the setting asks for every visit", () => {
    expect(crawlWanted(q(), false, false)).toBe(true);
    expect(crawlWanted(q(), true, false)).toBe(false);
    expect(crawlWanted(q(), true, true)).toBe(true);
  });

  it("?crawl=0 never shows it and ?crawl=1 always does; headless probes skip it by default", () => {
    expect(crawlWanted(q("crawl=0"), false, true)).toBe(false);
    expect(crawlWanted(q("crawl=1"), true, false)).toBe(true);
    expect(crawlWanted(q("headless=1"), false, false)).toBe(false);
    expect(crawlWanted(q("headless=1&crawl=1"), true, false)).toBe(true);
  });

  it("the boot reads the seen flag and the setting, rather than a gate that ignores both", () => {
    const main = readFileSync(new URL("../client/main.ts", import.meta.url), "utf8");
    expect(main).toMatch(/crawlWanted\(bootQ, crawlSeen\(\), game\.settings\.crawlEveryTime\)/);
  });
});

describe("the trailer", () => {
  it("runs no longer than the owner's thirty seconds, and is the file it says it is", () => {
    expect(TRAILER.seconds).toBeGreaterThan(20);
    expect(TRAILER.seconds).toBeLessThanOrEqual(MAX_TRAILER_SECONDS);
    expect(MAX_TRAILER_SECONDS).toBe(30);
    expect(lintTrailer()).toEqual([]);
  });

  it("types the opening text's own sentences, word for word, in order, inside its length, ending on the text's last line", () => {
    const sources = [...CRAWL_TEXT, ...TITLE_CARDS.map((c) => c.toUpperCase())];
    let last = 0;
    for (const l of TRAILER_LINES) {
      expect(sources.some((p) => p.includes(l.text)), `"${l.text}" is not a sentence of the opening text`).toBe(true);
      expect(l.at).toBeGreaterThanOrEqual(last);
      expect(l.until).toBeGreaterThan(l.at);
      expect(l.until).toBeLessThan(TRAILER.seconds);
      last = l.until;
    }
    expect(CRAWL_TEXT[CRAWL_TEXT.length - 1]!.endsWith(TRAILER_LINES[TRAILER_LINES.length - 1]!.text)).toBe(true);
  });

  it("ships the owner's text verbatim when supplied, else the original copy in the register", () => {
    expect(CRAWL_TEXT).toBe(OPENING_TEXT ?? DEFAULT_CRAWL);
    for (const p of DEFAULT_CRAWL) {
      expect(p).toBe(p.toUpperCase());
      expect(p).not.toMatch(/["“”]/);
    }
  });
});
