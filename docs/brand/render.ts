/** Renders the OMERTÀ SVGs to PNG at the sizes a token listing and a storefront want. `npx tsx docs/brand/render.ts` */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const jobs: [string, number, number, string][] = [
  ["omerta-mark.svg", 1024, 1024, "omerta-mark-1024.png"],
  ["omerta-mark.svg", 256, 256, "omerta-mark-256.png"],
  ["omerta-mark.svg", 64, 64, "omerta-mark-64.png"],
  ["omerta-mark-mono.svg", 512, 512, "omerta-mark-mono-512.png"],
  ["omerta-coin.svg", 1024, 1024, "omerta-coin-1024.png"],
  ["omerta-lockup.svg", 1400, 512, "omerta-lockup.png"],
];
async function main() {
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  for (const [src, w, h, out] of jobs) {
    const svg = readFileSync(`docs/brand/${src}`, "utf8").replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
    await page.screenshot({ path: `docs/brand/${out}`, omitBackground: true });
    await page.close();
  }
  await browser.close();
}
main();
