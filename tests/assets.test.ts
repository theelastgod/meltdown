/**
 * An asset is a picture, and it stays on the far side of the simulation (Stage 43).
 *
 * MELTDOWN reached Stage 42 with no source art: every texture is drawn at runtime, the audio is
 * synthesised, and the geometry is primitives. docs/ECONOMY.md §6.1 counts the Forge — the creator
 * cosmetics sink — at zero for exactly that reason, and the blocker was never the pictures. It was
 * that there was nowhere to put one, and no rule about what putting one there would be allowed to
 * change.
 *
 * These are the rules. The load-bearing one is the quarantine: an asset that cannot be reached from
 * the sim cannot alter a shot, a hitbox or a hash, whoever authored it and however it got in. The
 * rest keep the manifest honest about what is actually on disk, because a declared budget that has
 * drifted from the files is worse than no budget.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ASSETS, ASSET_BUDGET_BYTES, MAX_ASSET_BYTES, MAX_TEXTURE_EDGE, assetById, assetUrl, totalAssetBytes, type AssetDef } from "../shared/assets/manifest";
import { lintAssets, pngSize } from "../shared/assets/lint";
import { SKINS } from "../shared/economy/catalog";

/** Static import graph, the same walk tests/quarantine.test.ts uses. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [resolve(entry)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    let src: string;
    try {
      src = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const re = /from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const spec = m[1]!;
      if (spec.startsWith(".")) stack.push(resolve(dirname(f), spec.endsWith(".ts") ? spec : spec + ".ts"));
      else if (spec.startsWith("@shared/")) stack.push(resolve("shared", spec.slice(8) + ".ts"));
    }
  }
  return seen;
}

const isAssetModule = (f: string) => /shared[\\/]assets[\\/](manifest|lint)\.ts$/.test(f) || /client[\\/]render[\\/]assets\.ts$/.test(f);

describe("an asset can never reach the simulation", () => {
  it("the shared sim does not import the asset registry", () => {
    const seen = reachable("shared/sim/world.ts");
    expect([...seen].filter(isAssetModule)).toEqual([]);
    expect(seen.size).toBeGreaterThan(10); // the walk actually walked
  });

  it("nor does the authoritative room", () => {
    const seen = reachable("server/room.ts");
    expect([...seen].filter(isAssetModule)).toEqual([]);
    expect(seen.size).toBeGreaterThan(10);
  });

  it("nor the PvP match Worker, which must stay small as well as pure", () => {
    const seen = reachable("server/worker.ts");
    expect([...seen].filter(isAssetModule)).toEqual([]);
  });

  it("and an asset carries nothing a sim could read even if it could see one", () => {
    // the shape is the second line of defence behind the quarantine: there is no stat to smuggle
    const allowed = ["id", "kind", "file", "size", "bytes", "sha256", "provenance"];
    const forbidden = /damage|health|speed|range|rate|cooldown|armou?r|recoil|spread|ammo|mods?|stat/i;
    for (const a of ASSETS) {
      expect(Object.keys(a).sort(), `${a.id} keys`).toEqual([...allowed].sort());
      expect(Object.keys(a).filter((k) => forbidden.test(k)), `${a.id} has a mechanical key`).toEqual([]);
    }
    // and the declared type has exactly those fields, so a new one cannot appear unnoticed
    const sample: AssetDef = { id: "x", kind: "texture", file: "x.png", size: 256, bytes: 1, sha256: "0", provenance: "test" };
    expect(Object.keys(sample).sort()).toEqual([...allowed].sort());
  });
});

describe("the manifest is honest about what is on disk", () => {
  it("lints clean as it stands", () => {
    expect(lintAssets()).toEqual([]);
  });

  it("every id is unique and every url is under /assets", () => {
    expect(new Set(ASSETS.map((a) => a.id)).size).toBe(ASSETS.length);
    for (const a of ASSETS) expect(assetUrl(a)).toBe(`/assets/${a.file}`);
    for (const a of ASSETS) expect(assetById(a.id)).toBe(a);
  });

  it("and the whole set fits the download budget", () => {
    expect(totalAssetBytes()).toBeLessThanOrEqual(ASSET_BUDGET_BYTES);
    for (const a of ASSETS) expect(a.bytes, a.id).toBeLessThanOrEqual(MAX_ASSET_BYTES);
  });
});

describe("the lint catches what an art pipeline actually gets wrong", () => {
  const real = ASSETS[0];
  const fake = (over: Partial<AssetDef>): AssetDef => ({ id: "probe", kind: "texture", file: "nope.png", size: 256, bytes: 10, sha256: "0".repeat(64), provenance: "test", ...over });

  it("a file the manifest names and disk does not have", () => {
    const v = lintAssets([fake({})]);
    expect(v.map((x) => x.rule)).toContain("file-exists");
  });

  it("a manifest whose byte count has drifted from the file", () => {
    if (!real) return; // nothing shipped yet: the rule is exercised by the size case below
    const v = lintAssets([{ ...real, bytes: real.bytes + 1 }]);
    expect(v.map((x) => x.rule)).toContain("declared-bytes");
  });

  it("a file whose contents changed after it was reviewed", () => {
    if (!real) return;
    const v = lintAssets([{ ...real, sha256: "f".repeat(64) }]);
    expect(v.map((x) => x.rule)).toContain("sha256");
  });

  it("a texture that is not the square power of two the GPU wants", () => {
    if (!real) return;
    expect(lintAssets([{ ...real, size: real.size + 1 }]).map((x) => x.rule)).toContain("declared-size");
    // and the edge ceiling is about GPU memory, not download: a 4096² PNG can be small on disk
    expect(MAX_TEXTURE_EDGE).toBeLessThanOrEqual(1024);
  });

  it("a set that fits individually and busts the budget together", () => {
    if (!real) return;
    const many = Array.from({ length: Math.ceil(ASSET_BUDGET_BYTES / Math.max(1, real.bytes)) + 1 }, (_, i) => ({ ...real, id: `${real.id}-${i}` }));
    expect(lintAssets(many).map((x) => x.rule)).toContain("total-budget");
  });

  it("and it can read a PNG's real dimensions rather than trusting the manifest", () => {
    expect(pngSize(Buffer.alloc(4))).toBeNull();
    expect(pngSize(Buffer.from("not a png at all, but long enough to index into"))).toBeNull();
  });
});

describe("a cosmetic may name a texture, and that is all it may name", () => {
  it("the skin that carries one still lints clean as a cosmetic", () => {
    // lint:economy already runs over the whole manifest; this pins the specific worry, which is
    // that adding an art field to a priced item is how a stat gets in behind it
    const withTex = SKINS.filter((s) => s.texture);
    expect(withTex.length).toBeGreaterThan(0);
    for (const s of withTex) {
      expect(assetById(s.texture!), `${s.id} names an asset that is not declared`).toBeDefined();
      const keys = Object.keys(s);
      expect(keys.filter((k) => /damage|health|speed|range|rate|cooldown|armou?r|recoil|spread|ammo/i.test(k)), `${s.id}`).toEqual([]);
    }
  });

  it("and every texture a skin names is one the budget knows about", () => {
    for (const s of SKINS) if (s.texture) expect(ASSETS.some((a) => a.id === s.texture)).toBe(true);
  });
});
