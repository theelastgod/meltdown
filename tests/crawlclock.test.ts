/**
 * The crawl's clock has a front edge, and running off it used to mean "the crawl is over".
 *
 * probe:crawl went red on CI reporting a state the code could not produce: the skip hint hidden
 * while the crawl was still typing and still skippable. The hint is only ever hidden by the title
 * branch, and the title branch only runs at the title — where the crawl reports itself done, which
 * would have made it un-skippable. Both at once was impossible, so the crawl had to have BEEN at
 * the title and left again, and the only clock that runs backwards is one fed a negative dt.
 *
 * OpeningCrawl.frame took its dt from the rAF timestamp, which is the start of the frame in
 * progress and can predate the performance.now() the constructor stored a moment earlier. One such
 * frame put `t` below zero, crawlAt's fallback handed back the LAST segment — the title — and the
 * damage outlived the frame: the hint latched hidden, and the title branch wrote the "seen" flag,
 * marking a first-time player's opening as already watched.
 *
 * seek() had clamped its clock to zero since Stage 12. The frame loop had not. These cases hold
 * the schedule itself against any t a caller can produce, which is the layer that makes the rest
 * unreachable rather than merely unlikely.
 */
import { describe, expect, it } from "vitest";
import { CRAWL_TEXT } from "../client/crawl-text";
import { buildSchedule, crawlAt, crawlDuration } from "../client/crawl-schedule";

const s = buildSchedule(CRAWL_TEXT);
const at = (t: number) => crawlAt(s, CRAWL_TEXT, t);

describe("a time before the first keystroke is the beginning, not the end", () => {
  it("does not report the crawl finished before it has started", () => {
    for (const t of [-0.001, -0.5, -16, -1e6]) {
      expect(at(t).done, `t=${t}`).toBe(false);
      expect(at(t).phase, `t=${t}`).toBe("type");
    }
  });

  it("shows nothing typed yet rather than a negative count", () => {
    for (const t of [-0.001, -0.5, -16]) {
      expect(at(t).typed, `t=${t}`).toBe(0);
      expect(at(t).paragraph, `t=${t}`).toBe(0);
    }
  });

  it("and no tear has played yet", () => {
    expect(at(-1).tears).toBe(0);
  });
});

describe("the far edge still behaves — the fallback was not simply removed", () => {
  it("past the last segment the crawl is at the title and done", () => {
    const d = crawlDuration(CRAWL_TEXT);
    for (const t of [d + 0.01, d + 100, 1e6]) {
      expect(at(t).phase, `t=${t}`).toBe("title");
      expect(at(t).done, `t=${t}`).toBe(true);
    }
  });
});

describe("`done` belongs to the title and nowhere else", () => {
  it("is false everywhere before the title and true from it on", () => {
    const title = s[s.length - 1]!;
    for (let t = -2; t < title.start; t += 0.25) expect(at(t).done, `t=${t.toFixed(2)}`).toBe(false);
    expect(at(title.start).done).toBe(true);
  });

  it("so the crawl is skippable-shaped for its whole run: exactly one done-transition, at the end", () => {
    // `skippable` is `seen && !done`, so a spurious `done` anywhere is a hint that vanishes and a
    // SPACE that stops working. Walk the clock and count the flips.
    let flips = 0;
    let prev = at(-3).done;
    for (let t = -3; t <= crawlDuration(CRAWL_TEXT) + 3; t += 0.1) {
      const d = at(t).done;
      if (d !== prev) flips++;
      prev = d;
    }
    expect(flips).toBe(1);
  });
});
