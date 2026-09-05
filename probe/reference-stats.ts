/**
 * One-off: compute look statistics from the reference clip frames and write
 * docs/proof/stage3/reference-stats.json. The frames themselves are not
 * committed (they belong to the project owner); only the numbers are.
 *
 *   npx tsx probe/reference-stats.ts <dir-with-frames> [glob-prefix]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { computeLookStatsSource, type LookStats } from "./look-metrics";

async function main(): Promise<void> {
  const dir = process.argv[2] ?? ".";
  const prefix = process.argv[3] ?? "s_";
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && /\.(jpg|jpeg|png)$/i.test(f))
    .sort();
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  const page = await browser.newPage();
  const results: Record<string, LookStats> = {};
  for (const f of files) {
    const b64 = readFileSync(join(dir, f)).toString("base64");
    const stats = await page.evaluate(
      async ({ src, fn }) => {
        const compute = new Function("return " + fn)() as (i: ImageData) => LookStats;
        const img = new Image();
        img.src = "data:image/jpeg;base64," + src;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return compute(ctx.getImageData(0, 0, c.width, c.height));
      },
      { src: b64, fn: computeLookStatsSource },
    );
    results[f] = stats;
    console.log(f, JSON.stringify({ meanLuma: +stats.meanLuma.toFixed(3), darkFrac: +stats.darkFrac.toFixed(3), neonFrac: +stats.neonFrac.toFixed(3), hue: Object.fromEntries(Object.entries(stats.hue).map(([k, v]) => [k, +v.toFixed(2)])) }));
  }
  await browser.close();
  const list = Object.values(results);
  const avg = (sel: (s: LookStats) => number) => list.reduce((a, s) => a + sel(s), 0) / list.length;
  const summary = {
    frames: files.length,
    meanLuma: avg((s) => s.meanLuma),
    darkFrac: avg((s) => s.darkFrac),
    neonFrac: avg((s) => s.neonFrac),
    hue: {
      cyan: avg((s) => s.hue.cyan),
      magenta: avg((s) => s.hue.magenta),
      yellow: avg((s) => s.hue.yellow),
      green: avg((s) => s.hue.green),
      red: avg((s) => s.hue.red),
      blue: avg((s) => s.hue.blue),
      other: avg((s) => s.hue.other),
    },
    perFrame: results,
  };
  writeFileSync("docs/proof/stage3/reference-stats.json", JSON.stringify(summary, null, 2));
  console.log("summary", JSON.stringify({ meanLuma: summary.meanLuma, darkFrac: summary.darkFrac, neonFrac: summary.neonFrac, hue: summary.hue }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
