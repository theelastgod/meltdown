/**
 * Draw the app icons (Stage 45). Procedural, like every other picture the game makes: a black
 * square, the terminal cyan, and a bar that has started to melt. No generator, no credits.
 *
 *   npm run icons:make
 *
 * Both sizes carry the maskable safe zone (the glyph inside the central 80%), so Android can crop
 * a circle and iOS can round the corners without losing the mark.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

async function main(): Promise<void> {
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  const page = await browser.newPage();
  mkdirSync("public/icons", { recursive: true });
  for (const size of [192, 512]) {
    const dataUrl = await page.evaluate((s) => {
      const c = document.createElement("canvas");
      c.width = c.height = s;
      const g = c.getContext("2d")!;
      g.fillStyle = "#000";
      g.fillRect(0, 0, s, s);
      // scanlines, faint
      g.fillStyle = "rgba(53,242,255,0.06)";
      for (let y = 0; y < s; y += Math.max(2, Math.round(s / 64))) g.fillRect(0, y, s, 1);
      // the mark: a heavy monospace M whose right leg is melting into a drip
      const u = s / 100;
      g.fillStyle = "#35f2ff";
      g.font = `bold ${58 * u}px "Courier New", "Lucida Console", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("M", s / 2, s / 2 - 4 * u);
      // the drip under the right leg
      g.beginPath();
      g.moveTo(s / 2 + 14 * u, s / 2 + 18 * u);
      g.quadraticCurveTo(s / 2 + 20 * u, s / 2 + 34 * u, s / 2 + 16 * u, s / 2 + 40 * u);
      g.quadraticCurveTo(s / 2 + 12 * u, s / 2 + 34 * u, s / 2 + 14 * u, s / 2 + 18 * u);
      g.fill();
      g.beginPath();
      g.arc(s / 2 + 16 * u, s / 2 + 41 * u, 3.2 * u, 0, Math.PI * 2);
      g.fill();
      // a thin magenta rule, the CRT's other colour
      g.fillStyle = "#ff3ec9";
      g.fillRect(s * 0.18, s * 0.79, s * 0.64, Math.max(1, 1.2 * u));
      return c.toDataURL("image/png");
    }, size);
    const buf = Buffer.from(dataUrl.split(",")[1]!, "base64");
    writeFileSync(`public/icons/icon-${size}.png`, buf);
    console.log(`wrote public/icons/icon-${size}.png — ${(buf.length / 1024).toFixed(1)} KB`);
  }
  await browser.close();
}
void main();
