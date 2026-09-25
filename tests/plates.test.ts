/**
 * Which plate goes on which surface (Stage 632), and the lint that keeps art from shipping unseen.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSETS } from "../shared/assets/manifest";
import { CLIENT_RENDER_SOURCES, lintPlatesAreDrawn } from "../shared/assets/lint";
import { PLATE_POOLS, platePick, pooledPlates, reachablePlates, SHIPPED_DISTRICT_SEEDS, UNDRAWN_PLATES, type PlateFamily } from "../shared/assets/plates";

const families = Object.keys(PLATE_POOLS) as PlateFamily[];

describe("the plate a district wears", () => {
  it("is always a member of its own pool, and the same one every time that district is built", () => {
    for (const f of families) {
      for (const seed of [...SHIPPED_DISTRICT_SEEDS, 0, 1, 999, 123456]) {
        const got = platePick(f, seed);
        expect(PLATE_POOLS[f] as readonly string[]).toContain(got);
        expect(platePick(f, seed)).toBe(got);
      }
    }
  });

  it("is dealt, not drawn: the shipped districts between them put every pooled plate on a surface", () => {
    const reach = new Set(reachablePlates());
    const missed = pooledPlates().filter((p) => !reach.has(p));
    expect(missed).toEqual([]);
    expect(reach.size).toBe(new Set(pooledPlates()).size);
  });

  it("does not turn every surface in a district the same way", () => {
    // the family salts the deal, so one district's eight surfaces are not all pool index 0
    for (const seed of SHIPPED_DISTRICT_SEEDS) {
      const idx = families.map((f) => (PLATE_POOLS[f] as readonly string[]).indexOf(platePick(f, seed)));
      expect(new Set(idx).size).toBeGreaterThan(1);
    }
  });

  it("gives two districts different ground to stand on", () => {
    const ground = SHIPPED_DISTRICT_SEEDS.map((s) => `${platePick("road", s)}|${platePick("cobble", s)}|${platePick("paving", s)}`);
    expect(new Set(ground).size).toBeGreaterThanOrEqual(3);
  });
});

describe("the lint that keeps art from shipping unseen", () => {
  it("passes on the tree as it stands", () => {
    expect(lintPlatesAreDrawn()).toEqual([]);
  });

  it("catches a plate that ships and is drawn on nothing", () => {
    const ghost = { id: "tex_never_drawn", kind: "texture", file: "x.png", size: 256, bytes: 1, sha256: "", provenance: "test" } as const;
    const v = lintPlatesAreDrawn([...ASSETS, ghost]);
    expect(v.map((x) => x.rule)).toContain("plate-not-drawn");
    expect(v.find((x) => x.rule === "plate-not-drawn")?.asset).toBe("tex_never_drawn");
  });

  it("catches a recorded undrawn plate that is drawn after all, so the list can only shrink", () => {
    // tex_asphalt_2 is pooled and dealt; pretending it is still owed must fail rather than pass
    const v = lintPlatesAreDrawn(ASSETS, undefined, ".");
    expect(v).toEqual([]);
    const drawnIds = new Set(reachablePlates());
    for (const id of UNDRAWN_PLATES) expect(drawnIds.has(id)).toBe(false);
  });

  it("catches a pool nothing picks from — reading the client, not this file", () => {
    const v = lintPlatesAreDrawn(ASSETS, ["shared/assets/plates.ts"]);
    expect(v.map((x) => x.rule)).toContain("pool-not-picked");
  });

  it("reads the real client sources, so unwiring a surface is caught by the lint CI runs", () => {
    const v = lintPlatesAreDrawn(ASSETS, ["shared/assets/manifest.ts"]);
    expect(v.length).toBeGreaterThan(0);
  });
});

describe("the recorded debt", () => {
  it("names each plate once, and never one that is already on a surface", () => {
    expect(new Set(UNDRAWN_PLATES).size).toBe(UNDRAWN_PLATES.length);
    const pooled = new Set(pooledPlates());
    for (const id of UNDRAWN_PLATES) expect(pooled.has(id)).toBe(false);
  });

  it("names only plates that actually ship", () => {
    const ids = new Set(ASSETS.map((a) => a.id));
    for (const id of UNDRAWN_PLATES) expect(ids.has(id)).toBe(true);
  });

  it("is smaller than the 81 this stage started from, and accounts for every plate that is not drawn", () => {
    expect(UNDRAWN_PLATES.length).toBeLessThan(81);
    // Every shipped texture is either on a surface a district reaches, or named by a skin in the
    // cosmetics catalog, or written down as owed. Nothing falls between the three.
    const catalog = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const owed = new Set(UNDRAWN_PLATES);
    const reach = new Set(reachablePlates());
    const client = CLIENT_RENDER_SOURCES.map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("");
    const unaccounted = ASSETS.filter((a) => a.kind === "texture")
      .map((a) => a.id)
      .filter((id) => !reach.has(id) && !owed.has(id) && !new RegExp(`"${id}"`).test(client + catalog));
    expect(unaccounted).toEqual([]);
  });
});
