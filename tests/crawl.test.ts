import { describe, expect, it } from "vitest";
import { CRAWL_TEXT, DEFAULT_CRAWL, OPENING_TEXT } from "../client/crawl-text";
import { buildSchedule, crawlAt, crawlDuration, crawlShape, CUT_SECONDS, TEAR_SECONDS, TYPE_CPS } from "../client/crawl-schedule";

describe("the opening crawl's schedule", () => {
  it("runs about 35 seconds from the first keystroke to the title, typed then held, a tear between every pair of paragraphs, a cut before the title", () => {
    const d = crawlDuration(CRAWL_TEXT);
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d).toBeLessThanOrEqual(40);
    const s = buildSchedule(CRAWL_TEXT);
    expect(s.filter((x) => x.kind === "type").length).toBe(CRAWL_TEXT.length);
    expect(s.filter((x) => x.kind === "hold").length).toBe(CRAWL_TEXT.length);
    expect(s.filter((x) => x.kind === "tear").length).toBe(CRAWL_TEXT.length - 1);
    expect(s.filter((x) => x.kind === "cut").length).toBe(1);
    // segments abut: no gaps, no overlaps
    for (let i = 1; i < s.length; i++) expect(s[i]!.start).toBeCloseTo(s[i - 1]!.end, 9);
    // typed-then-held: the first paragraph types at TYPE_CPS then holds complete
    const p0 = CRAWL_TEXT[0]!;
    expect(crawlAt(s, CRAWL_TEXT, 1).typed).toBe(Math.floor(TYPE_CPS));
    const holdStart = s.find((x) => x.kind === "hold")!.start;
    expect(crawlAt(s, CRAWL_TEXT, holdStart + 0.1)).toMatchObject({ phase: "hold", paragraph: 0, typed: p0.length });
    const tear0 = s.find((x) => x.kind === "tear")!;
    expect(crawlAt(s, CRAWL_TEXT, tear0.start + TEAR_SECONDS / 2).phase).toBe("tear");
    expect(crawlAt(s, CRAWL_TEXT, tear0.end + 0.01)).toMatchObject({ phase: "type", paragraph: 1, tears: 1 });
    const cut = s.find((x) => x.kind === "cut")!;
    expect(crawlAt(s, CRAWL_TEXT, cut.start + CUT_SECONDS / 2)).toMatchObject({ phase: "cut", typed: 0, done: false });
    expect(crawlAt(s, CRAWL_TEXT, cut.end + 0.01)).toMatchObject({ phase: "title", done: true, tears: CRAWL_TEXT.length - 1 });
  });

  it("ships the owner's text verbatim when supplied, else the original copy in the register: paragraphs shorten and the last is one isolated line", () => {
    expect(CRAWL_TEXT).toBe(OPENING_TEXT ?? DEFAULT_CRAWL);
    const shape = crawlShape(DEFAULT_CRAWL);
    expect(shape.count).toBeGreaterThanOrEqual(5);
    expect(shape.shortening).toBe(true);
    expect(shape.isolatedLast).toBe(true);
    // the register: no lowercase prose, no quotation marks (nothing quoted from anywhere)
    for (const p of DEFAULT_CRAWL) {
      expect(p).toBe(p.toUpperCase());
      expect(p).not.toMatch(/["“”]/);
    }
  });
});
