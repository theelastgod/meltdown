/**
 * A screenshot is a claim, so check it before writing it (Stage 33).
 *
 * Nine of the project's proof artifacts were pictures of the opening crawl. `stage7-graph-after.png`
 * did not show the Ledger Graph; `stage8-dossier.png` did not show a dossier; `stage6-file.png` did
 * not show a file. Each was a full-screen cyan overlay reading NEO-CHINA. FOUNDED AS A DRAINAGE
 * CONCESSION, because the crawl only stands down for `?crawl=0` or `?headless`, and those probes
 * passed neither. The checks beside them all passed — they read the DOM, and the DOM was right. It
 * was only the picture that was wrong, and a picture is the one artifact nothing was asserting on.
 *
 * So the screenshot gets an assertion too. Nothing may cover the frame, and the thing the file is
 * named for has to be on screen when the shutter opens.
 */
import type { Page } from "playwright";

/**
 * Full-screen chrome that legitimately exists but must never be in a shot of the game.
 *
 * Deliberately just these two. `#hud .card` is also `inset: 0` over everything, but it is the
 * *subject* of `stage10-ending.png` and of stage13's title cards, so a blanket rule against it
 * would be wrong; those shots name it in `mustShow` instead. A cover list is only worth having if
 * every entry can actually fire — an earlier draft carried a `.titlecard` selector that matches
 * nothing in this client at all.
 */
const COVERS = ["#crawl", "#menu"];

export interface ShotResult {
  ok: boolean;
  detail: string;
  /** the PNG itself, for the probes that measure pixels rather than just file it as proof */
  png: Buffer;
}

/**
 * Take `path`, first proving the frame is the frame the name promises.
 *
 * `mustShow` is a selector the picture is supposed to contain — pass the panel, not the page. The
 * result is returned rather than thrown so a bad artifact is one failed check among many and not a
 * stop that hides everything after it (Stage 30's lesson).
 */
export async function shot(page: Page, path: string, mustShow?: string): Promise<ShotResult> {
  // No named function consts in here: tsx builds the probes with --keep-names, which injects a
  // `__name` helper that does not exist inside the page. Everything is inlined for that reason.
  const seen = await page.evaluate(
    ([covers, want]) => {
      const vis = (covers as string[]).concat(want ? [want as string] : []).map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.02) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      });
      return {
        covered: (covers as string[]).filter((_c, i) => vis[i]),
        shown: want ? vis[vis.length - 1]! : true,
      };
    },
    [COVERS, mustShow ?? null] as const,
  );
  const png = await page.screenshot({ path });
  const name = path.split("/").pop() ?? path;
  if (seen.covered.length) return { ok: false, png, detail: `${name} is a picture of ${seen.covered.join(" + ")}, not of ${mustShow ?? "the game"}` };
  if (!seen.shown) return { ok: false, png, detail: `${name} does not show ${mustShow} — the panel was not up when the shutter opened` };
  return { ok: true, png, detail: `${name}${mustShow ? ` shows ${mustShow}` : ""}, nothing over it` };
}
