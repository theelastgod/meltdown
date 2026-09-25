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
import { PLATE_POOLS, pooledPlates, reachablePlates, UNDRAWN_PLATES } from "./plates";
import { MAX_VIDEO_BYTES, MAX_VIDEO_EDGE, VIDEO_BUDGET_BYTES, VIDEOS, type VideoDef } from "./video";

/** Every file that may name a plate: the renderer, and the cosmetics catalog a player's equipped
 *  skin is bound from. Read as text, never imported, so listing the catalog here does not put
 *  `shared/economy` on any bundle's import graph (tests/quarantine.test.ts). A file added here
 *  widens what counts as drawn. */
export const CLIENT_RENDER_SOURCES: readonly string[] = [
  "client/render/city.ts",
  "client/render/campaign.ts",
  "client/render/hub.ts",
  "client/render/life.ts",
  "client/render/renderer.ts",
  "client/render/rig.ts",
  "client/render/run.ts",
  "client/render/vfx.ts",
  "client/render/wake.ts",
  "client/render/weapons.ts",
  "shared/economy/catalog.ts",
  "client/menu.ts",
];

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

/**
 * Is every plate we ship actually drawn on something? (Stage 632)
 *
 * The rules above check that a plate is a well-formed file of the declared weight. None of them
 * checks the thing that actually went wrong: 81 of 143 generated plates were in every download and
 * bound to no material, so players paid for art the renderer never asked for. This reads the client
 * for `bindPlate` ids and the family pools, and holds the difference against a recorded list.
 *
 * The list is a ratchet in both directions. A plate that goes undrawn without being on it is a
 * regression — new art shipped with nowhere to go. A plate on it that turns out to be drawn is also
 * a failure, because the list must shrink as surfaces are found: that is what stops it becoming a
 * place to park art forever.
 */
export function lintPlatesAreDrawn(assets: readonly AssetDef[] = ASSETS, sources = CLIENT_RENDER_SOURCES, root = "."): AssetViolation[] {
  const out: AssetViolation[] = [];
  let text = "";
  for (const rel of sources) {
    try {
      text += readFileSync(resolve(root, rel), "utf8");
    } catch {
      out.push({ asset: "(all)", rule: "drawn-source", detail: `${rel} is not there, so the lint cannot tell what is drawn` });
      return out;
    }
  }
  // Being in a pool is not being in the game: a plate no shipped district deals itself is as
  // invisible as one in no pool at all. Only what a district can actually reach counts as drawn.
  const reachable = new Set(reachablePlates());
  for (const id of pooledPlates()) if (!reachable.has(id)) out.push({ asset: id, rule: "plate-unreachable", detail: "is pooled but no shipped district seed deals it — it is still drawn on nothing" });
  const pooled = reachable;
  const recorded = new Set(UNDRAWN_PLATES);
  const drawn = (id: string): boolean => pooled.has(id) || new RegExp(`["'\`]${id}["'\`]`).test(text);

  for (const a of assets) {
    if (a.kind !== "texture") continue;
    if (drawn(a.id)) {
      if (recorded.has(a.id)) out.push({ asset: a.id, rule: "stale-undrawn", detail: "is drawn now — take it off UNDRAWN_PLATES, the list only shrinks" });
    } else if (!recorded.has(a.id)) {
      out.push({ asset: a.id, rule: "plate-not-drawn", detail: "ships in every download and is bound to no material — give it a surface or do not ship it" });
    }
  }
  // A pool only counts as drawn because something picks from it. A family nothing picks from is the
  // same parking lot in a different file, so it fails here rather than quietly absolving its members.
  for (const family of Object.keys(PLATE_POOLS)) {
    if (!new RegExp(`platePick\\(\\s*["'\`]${family}["'\`]`).test(text)) out.push({ asset: family, rule: "pool-not-picked", detail: `no surface calls platePick("${family}"), so its plates are pooled and still drawn on nothing` });
  }

  const ids = new Set(assets.map((a) => a.id));
  for (const id of recorded) if (!ids.has(id)) out.push({ asset: id, rule: "undrawn-ghost", detail: "is on UNDRAWN_PLATES but is not an asset any more" });
  return out;
}

/**
 * The clips, against the files on disk and against what plays them (Stage 633).
 *
 * Same shape as the picture rules, because a clip that has drifted from its file or that ships with
 * no screen to play on is the same failure: bytes in every download that the game never asks for.
 */
export function lintVideos(videos: readonly VideoDef[] = VIDEOS, sources = CLIENT_RENDER_SOURCES, root = "."): AssetViolation[] {
  const out: AssetViolation[] = [];
  let text = "";
  for (const rel of sources) {
    try {
      text += readFileSync(resolve(root, rel), "utf8");
    } catch {
      out.push({ asset: "(all)", rule: "clip-source", detail: `${rel} is not there, so the lint cannot tell what plays` });
      return out;
    }
  }
  const seen = new Set<string>();
  let total = 0;
  for (const v of videos) {
    if (seen.has(v.id)) out.push({ asset: v.id, rule: "unique-id", detail: "declared twice" });
    seen.add(v.id);
    if (!v.provenance.trim()) out.push({ asset: v.id, rule: "provenance", detail: "no note on where it came from" });

    const path = resolve(root, "public/video", v.file);
    let buf: Buffer;
    try {
      buf = readFileSync(path);
    } catch {
      out.push({ asset: v.id, rule: "file-exists", detail: `${path} is not there` });
      continue;
    }
    total += buf.length;
    if (buf.length !== v.bytes) out.push({ asset: v.id, rule: "declared-bytes", detail: `manifest says ${v.bytes}, the file is ${buf.length}` });
    if (buf.length > MAX_VIDEO_BYTES) out.push({ asset: v.id, rule: "per-clip-budget", detail: `${buf.length} bytes over the ${MAX_VIDEO_BYTES} ceiling` });
    const sha = createHash("sha256").update(buf).digest("hex");
    if (sha !== v.sha256) out.push({ asset: v.id, rule: "sha256", detail: `manifest says ${v.sha256.slice(0, 12)}…, the file is ${sha.slice(0, 12)}…` });
    // EBML magic — a clip the codec-free CI browser cannot decode is a clip nothing can check
    if (buf.length < 4 || buf[0] !== 0x1a || buf[1] !== 0x45 || buf[2] !== 0xdf || buf[3] !== 0xa3) {
      out.push({ asset: v.id, rule: "clip-webm", detail: "is not a WebM; H.264 in MP4 cannot be decoded by the browser CI runs" });
    }
    if (Math.max(v.width, v.height) > MAX_VIDEO_EDGE) out.push({ asset: v.id, rule: "clip-edge", detail: `${v.width}×${v.height} over the ${MAX_VIDEO_EDGE} edge` });
  }
  if (total > VIDEO_BUDGET_BYTES) out.push({ asset: "(all)", rule: "clip-budget", detail: `${total} bytes over the ${VIDEO_BUDGET_BYTES} budget` });

  // Every screen family the manifest names must be one something actually attaches a clip to.
  // A family nothing plays is the picture problem again, in a heavier format.
  for (const screen of new Set(videos.map((v) => v.screen))) {
    if (!new RegExp(`["'\`]${screen}["'\`]`).test(text)) {
      out.push({ asset: screen, rule: "screen-not-played", detail: `no renderer attaches a clip to "${screen}", so its clips ship and never play` });
    }
  }
  return out;
}
