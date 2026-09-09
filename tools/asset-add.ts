/**
 * Condition a source image into a game-ready asset, and print its manifest line (Stage 43).
 *
 *   npm run assets:add -- <source png|jpg|url> <id> [edge]
 *
 * Generator output is not shippable art. The texture this pipeline was built around arrived from
 * Higgsfield at 2048² and 8.7 MB — sixteen times the per-asset ceiling and twice the edge the GPU
 * budget allows — which is exactly what `lint:assets` exists to catch. Something has to do the
 * reducing, and doing it by hand is how a manifest drifts from the files it describes.
 *
 * It uses the Chromium that Playwright already installs for the probes rather than adding an image
 * library: draw to a square power-of-two canvas, re-encode, write, and print the `bytes` and
 * `sha256` for the manifest so those two numbers are never typed by a person.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { chromium } from "playwright";

const [source, id, edgeArg] = process.argv.slice(2);
if (!source || !id) {
  console.error("usage: npm run assets:add -- <source> <id> [edge=512]");
  process.exit(2);
}
const edge = Number(edgeArg ?? 512);
if (!Number.isInteger(edge) || edge <= 0 || (edge & (edge - 1)) !== 0) {
  console.error(`edge must be a power of two, got ${edge}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  const page = await browser.newPage();
  // a data: URL keeps this working for a local file and needs no server; a remote URL is passed through
  const src = /^https?:\/\//.test(source!) ? source! : `data:image/${basename(source!).endsWith(".jpg") ? "jpeg" : "png"};base64,${readFileSync(source!).toString("base64")}`;
  const dataUrl = await page.evaluate(async ({ src, edge }) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("could not decode the source"));
      img.src = src;
    });
    const c = document.createElement("canvas");
    c.width = c.height = edge;
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    // square-crop from the centre first, so a non-square source is not stretched
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, edge, edge);
    return c.toDataURL("image/png");
  }, { src, edge });
  await browser.close();

  const buf = Buffer.from(dataUrl.split(",")[1]!, "base64");
  const file = `${id}.png`;
  mkdirSync("public/assets", { recursive: true });
  writeFileSync(resolve("public/assets", file), buf);
  const sha256 = createHash("sha256").update(buf).digest("hex");

  console.log(`wrote public/assets/${file} — ${edge}×${edge}, ${(buf.length / 1024).toFixed(1)} KB`);
  console.log("\nmanifest line:\n");
  console.log(`  { id: "${id}", kind: "texture", file: "${file}", size: ${edge}, bytes: ${buf.length}, sha256: "${sha256}", provenance: "…" },`);
}

void main();
