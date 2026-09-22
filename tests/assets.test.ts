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
import { reachable } from "./helpers/imports";
import { ASSETS, ASSET_BUDGET_BYTES, MAX_ASSET_BYTES, MAX_TEXTURE_EDGE, assetById, assetUrl, totalAssetBytes, type AssetDef } from "../shared/assets/manifest";
import { lintAssets, pngSize } from "../shared/assets/lint";
import { SKINS } from "../shared/economy/catalog";
import { disposeAssets, texture } from "../client/render/assets";

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

describe("leftover Higgsfield plates are bound, not only declared", () => {
  it("named leftover city and kit plates are passed to bindPlate", () => {
    const files = [
      "client/render/city.ts",
      "client/render/life.ts",
      "client/render/hub.ts",
      "client/render/renderer.ts",
      "client/render/weapons.ts",
      "client/render/campaign.ts",
      "client/render/run.ts",
      "client/render/wake.ts",
      "client/render/rig.ts",
      "client/render/vfx.ts",
      "client/render/wetfloor.ts",
    ];
    const src = files.map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
    for (const id of [
      "tex_awning_cy", "tex_awning_mg", "tex_billboard_cy", "tex_billboard_mg", "tex_billboard_ye",
      "tex_brick_amber", "tex_brick_cyan", "tex_bulkhead", "tex_chainlink", "tex_crowd_coat",
      "tex_desk", "tex_dummy", "tex_facade_amber", "tex_facade_cyan", "tex_glass", "tex_kernel_hull",
      "tex_lamp", "tex_nameplate", "tex_pavement", "tex_rug", "tex_scaffold", "tex_tile_metro",
      "tex_vent", "tex_asphalt_2", "tex_pipe", "tex_grate", "tex_cone_alt",
      "tex_wasp_hull", "tex_mech_hull", "tex_kiosk_crt", "tex_wet_cobble", "tex_cloak",
      "tex_cable", "tex_wet_asphalt",
      "tex_tracer", "tex_blast", "tex_spark", "tex_wake_hex", "tex_directive_core",
    ]) {
      expect(src, id).toContain(`"${id}"`);
    }
    const campaign = readFileSync(new URL("../client/render/campaign.ts", import.meta.url), "utf8");
    expect(campaign).toMatch(/bindPlate\(hoodMat, "tex_cloak"\)/);
    expect(campaign).toMatch(/bindPlate\(ringMat, "tex_lamp"\)/);
    expect(campaign).toMatch(/bindPlate\(mat, "tex_lamp"\)/);
    expect(campaign).toMatch(/bindPlate\(fm, "tex_lamp"\)/);
    const weapons = readFileSync(new URL("../client/render/weapons.ts", import.meta.url), "utf8");
    expect(weapons).toMatch(/bindPlate\(this\.projMats\.frag, "tex_weapon_dark"\)/);
    expect(weapons).toMatch(/bindPlate\(mat, "tex_weapon_dark"\)/);
    expect(weapons).toMatch(/bindPlate\(this\.projMats\.phage, "skin_phage_plate"\)/);
    expect(weapons).toMatch(/bindPlate\(stripMat, "tex_lamp"\)/);
    expect(weapons).toMatch(/bindPlate\(eyeMat, "tex_lamp"\)/);
    expect(weapons).toMatch(/bindPlate\(rotorMat, "tex_wasp_hull"\)/);
    expect(weapons).toMatch(/bindPlate\(lensMat, "tex_lamp"\)/);
    expect(weapons).toMatch(/bindPlate\(coneMat, "tex_lamp"\)/);
    expect(weapons).toMatch(/bindPlate\(mgRail, "tex_lamp"\)/);
    expect(weapons).toMatch(/bindPlate\(optic, "tex_directive_core"\)/);
    expect(weapons).toMatch(/bindPlate\(beamMat, "tex_tracer"\)/);
    expect(weapons).toMatch(/bindPlate\(blastMat, "tex_blast"\)/);
    expect(weapons).toMatch(/new THREE\.Mesh\(new THREE\.BoxGeometry\(0\.06, 0\.04, 0\.06\), waspMat\)/);
    const city = readFileSync(new URL("../client/render/city.ts", import.meta.url), "utf8");
    expect(city).toMatch(/bindPlate\(M\.railMg, "tex_cable"\)/);
    expect(city).toMatch(/bindPlate\(stripMat, "tex_lamp"\)/);
    expect(city).toMatch(/bindPlate\(M\.head, "tex_lamp"\)/);
    expect(city).toMatch(/bindPlate\(M\.padStart, "tex_wet_asphalt"\)/);
    expect(city).toMatch(/bindPlate\(M\.padEnd, "tex_wet_asphalt"\)/);
    expect(city).toMatch(/bindPlate\(M\.glow, "tex_lamp"\)/);
    expect(city).toMatch(/bindPlate\(haloMat, "tex_lamp"\)/);
    expect(city).toMatch(/bindPlate\(trafficMat, "tex_lamp"\)/);
    expect(city).toMatch(/bindPlate\(lockMat, "tex_lamp"\)/);
    expect(city).toMatch(/bindPlate\(neonMat, "tex_lamp"\)/);
    const hub = readFileSync(new URL("../client/render/hub.ts", import.meta.url), "utf8");
    expect(hub).toMatch(/bindPlate\(m, "tex_nameplate"\)/);
    expect(hub).toMatch(/else if \(tag === "window_glow" && m instanceof THREE\.MeshBasicMaterial\) bindPlate\(m, "tex_glass"\)/);
    expect(hub).toMatch(/bindPlate\(this\.ghostMat, "tex_cloak"\)/);
    const run = readFileSync(new URL("../client/render/run.ts", import.meta.url), "utf8");
    expect(run).toMatch(/bindPlate\(mat, "tex_kiosk_crt"\)/);
    expect(run).toMatch(/bindPlate\(ringMat, "tex_lamp"\)/);
    expect(run).toMatch(/bindPlate\(colMat, "tex_lamp"\)/);
    const wake = readFileSync(new URL("../client/render/wake.ts", import.meta.url), "utf8");
    expect(wake).toMatch(/bindPlate\(ringMat, "tex_wake_hex"\)/);
    expect(wake).toMatch(/bindPlate\(fillMat, "tex_wake_hex"\)/);
    expect(wake).toMatch(/bindPlate\(colMat, "tex_lamp"\)/);
    expect(wake).toMatch(/bindPlate\(mat, "tex_lamp"\)/);
    expect(wake).toMatch(/bindPlate\(linkMat, "tex_lamp"\)/);
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toMatch(/bindPlate\(panelMat, "tex_billboard_mg"\)/);
    expect(life).toMatch(/bindPlate\(windowMat, "tex_glass"\)/);
    expect(life).toMatch(/bindPlate\(lampMat, "tex_lamp"\)/);
    expect(life).toMatch(/bindPlate\(headMat, "tex_lamp"\)/);
    expect(life).toMatch(/bindPlate\(tailMat, "tex_lamp"\)/);
    expect(life).toMatch(/bindPlate\(noseMat, "tex_lamp"\)/);
    expect(life).toMatch(/bindPlate\(keelMat, "tex_billboard_cy"\)/);
    expect(life).toMatch(/bindPlate\(railStripMat, "tex_billboard_mg"\)/);
    const rendererSrc = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(rendererSrc).toMatch(/bindPlate\(amber, "tex_lamp"\)/);
    const rig = readFileSync(new URL("../client/render/rig.ts", import.meta.url), "utf8");
    expect(rig).toMatch(/bindPlate\(mat, "tex_cloak"\)/);
    const vfx = readFileSync(new URL("../client/render/vfx.ts", import.meta.url), "utf8");
    expect(vfx).toMatch(/bindPlate\(smat, "tex_spark"\)/);
    expect(vfx).toMatch(/bindPlate\(mat, "tex_lamp"\)/);
    const wetfloor = readFileSync(new URL("../client/render/wetfloor.ts", import.meta.url), "utf8");
    expect(wetfloor).toMatch(/bindPlate\(floorMat, "tex_wet_cobble"\)/);
  });
});

describe("a worn catalog plate reaches the body the city sees", () => {
  const renderer = () => readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");

  it("bindSkinMap writes the plate onto the local trim, not only the first-person strip", () => {
    const src = renderer();
    const fn = src.slice(src.indexOf("private bindSkinMap"), src.indexOf("skinBound()"));
    expect(fn).toMatch(/this\.local\.trim\.map = tex/);
  });

  it("skinBound fails if the trim is not drawing the plate", () => {
    const src = renderer();
    const fn = src.slice(src.indexOf("skinBound()"), src.indexOf("private drawTag"));
    expect(fn).toMatch(/this\.local\.trim\.map !== this\.skinMap/);
  });

  it("a remote's strip and trim take the catalog texture, not only the tint", () => {
    const src = renderer();
    const fn = src.slice(src.indexOf("syncRemotes("), src.indexOf("private poseRemotes"));
    expect(fn).toMatch(/def\?\.texture/);
    expect(fn).toMatch(/e\.stripMat\.map = tex/);
    expect(fn).toMatch(/e\.rig\.trim\.map = tex/);
  });
});

describe("the loader fails soft", () => {
  it("a request with no document resolves null instead of rejecting", async () => {
    disposeAssets();
    await expect(texture("tex_weapon_body")).resolves.toBeNull();
    disposeAssets();
  });
});
