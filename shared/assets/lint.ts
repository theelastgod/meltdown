/**
 * The asset rules, as a lint the build runs (Stage 43).
 *
 * Everything here is checkable without a browser: the file exists, it weighs what the manifest says
 * it weighs, it hashes to what was reviewed, it is a square power of two the GPU will take, and the
 * whole set fits the download budget. A manifest that has drifted from the files on disk is the
 * failure mode an art pipeline has that a procedural renderer does not, so it is the one the lint
 * is built around.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ASSETS, ASSET_BUDGET_BYTES, MAX_ASSET_BYTES, MAX_TEXTURE_EDGE, type AssetDef } from "./manifest";

export interface AssetViolation {
  asset: string;
  rule: string;
  detail: string;
}

const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** PNG header: width and height are big-endian u32 at byte 16 and 20 of an IHDR-first file. */
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function lintAssets(assets: readonly AssetDef[] = ASSETS, root = "public/assets"): AssetViolation[] {
  const out: AssetViolation[] = [];
  const seen = new Set<string>();
  let total = 0;

  for (const a of assets) {
    if (seen.has(a.id)) out.push({ asset: a.id, rule: "unique-id", detail: `declared twice` });
    seen.add(a.id);
    if (!a.provenance.trim()) out.push({ asset: a.id, rule: "provenance", detail: "no note on where it came from" });

    const path = resolve(root, a.file);
    let buf: Buffer;
    try {
      buf = readFileSync(path);
    } catch {
      out.push({ asset: a.id, rule: "file-exists", detail: `${path} is not there` });
      continue;
    }

    const bytes = statSync(path).size;
    total += bytes;
    if (bytes !== a.bytes) out.push({ asset: a.id, rule: "declared-bytes", detail: `manifest says ${a.bytes}, the file is ${bytes}` });
    if (bytes > MAX_ASSET_BYTES) out.push({ asset: a.id, rule: "per-asset-budget", detail: `${bytes} bytes over the ${MAX_ASSET_BYTES} ceiling` });

    const sha = createHash("sha256").update(buf).digest("hex");
    if (sha !== a.sha256) out.push({ asset: a.id, rule: "sha256", detail: `manifest says ${a.sha256.slice(0, 12)}…, the file is ${sha.slice(0, 12)}…` });

    if (a.kind === "texture") {
      const dim = pngSize(buf);
      if (!dim) out.push({ asset: a.id, rule: "texture-format", detail: "not a PNG the lint can read" });
      else if (dim.width !== dim.height) out.push({ asset: a.id, rule: "texture-square", detail: `${dim.width}×${dim.height} is not square` });
      else if (dim.width !== a.size) out.push({ asset: a.id, rule: "declared-size", detail: `manifest says ${a.size}, the file is ${dim.width}` });
      else if (!isPowerOfTwo(dim.width)) out.push({ asset: a.id, rule: "texture-pot", detail: `${dim.width} is not a power of two` });
      else if (dim.width > MAX_TEXTURE_EDGE) out.push({ asset: a.id, rule: "texture-edge", detail: `${dim.width} over the ${MAX_TEXTURE_EDGE} edge, which is GPU memory rather than download` });
    }
  }

  if (total > ASSET_BUDGET_BYTES) out.push({ asset: "(all)", rule: "total-budget", detail: `${total} bytes over the ${ASSET_BUDGET_BYTES} budget` });
  return out;
}
