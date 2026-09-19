/**
 * Is anything on the HUD cut? (Stage 162)
 *
 * Three stages found the same defect in three places: content that was right and a fit that nobody
 * checked. Stage 148 and 151, the event log's entries; Stage 150, the file's own header line, cut
 * at every width this game has ever been drawn at; Stage 160, the map's footer, cut in every
 * district since it was written, with a green check over it that asserted the text exactly and the
 * width never.
 *
 * Each was found by looking at a picture. This is the same question asked of every text on the HUD
 * at once, in whatever state the probe calling it has set up — because the states are where the
 * defects were: a room joined, a mission running, the contracts open. The base HUD is clean at
 * 1920, 1280, 960 and 800; the cut ones were all somewhere a player had got to.
 *
 * It reports an element as cut when its text is wider than the box it is drawn in, and that box
 * either holds it to one line or clips it. Both halves are needed: the map's footer is a single
 * nowrap line, while the file's header is five spans that each fit inside a line that does not — a
 * first version of this swept leaves only and walked straight past the second.
 */
import type { Page } from "playwright";

export interface HudCut {
  cls: string;
  over: number;
  wrap: string;
  text: string;
}

/** Every leaf on the drawn HUD whose text does not fit its box. Empty is what it should be. */
export async function hudCuts(page: Page): Promise<HudCut[]> {
  return page.evaluate(() => {
    const out: { cls: string; over: number; wrap: string; text: string }[] = [];
    for (const node of document.querySelectorAll("#hud *")) {
      const el = node as HTMLElement;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (el.offsetParent === null && style.position !== "fixed") continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      // a line held to one line, or a box that clips. Not "leaves only": the file's header line is
      // five spans that each fit inside a line that does not, and a leaves-only sweep walked past
      // exactly the element Stage 150 had to fix
      const holds = style.whiteSpace === "nowrap" || style.whiteSpace === "pre";
      const clips = style.overflowX !== "visible";
      if (!holds && !clips) continue;
      const over = el.scrollWidth - el.clientWidth;
      if (over > 0) out.push({ cls: el.className || el.tagName.toLowerCase(), over, wrap: style.whiteSpace, text: text.slice(0, 48) });
    }
    return out;
  });
}

/** One line naming what is cut, for a check's detail. */
export function cutDetail(cuts: readonly HudCut[], where: string): string {
  if (!cuts.length) return `nothing cut on the HUD ${where}`;
  return `${cuts.length} cut ${where}: ` + cuts.map((c) => `".${c.cls}" by ${c.over}px ("${c.text}")`).join(" · ");
}
