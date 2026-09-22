/**
 * What 400 $CAPITAL buys (Stage 176).
 *
 * The Deep Wake pass is the game's largest sink: the token is burned, and in return the file gets
 * a theme and two slots — DEEP WAKE, ALIAS SLOT IV and PRESET SLOT VI, all three off-chain on
 * purpose so the biggest sink can never become a trading vehicle. The counter-ledger wrote those
 * three ids to `a.owned`, which is the progression list for nodes, chips, keystones and weapons.
 * Every consumer of a cosmetic reads `a.cosmetics`. Measured on an account holding exactly what
 * the reconcile wrote: `slotsOf` → 1 alias and 1 preset, `setTheme("theme_deep_wake")` → false,
 * `savePreset(6)` → "SLOT 6 NOT OWNED (1 SLOT)", `setAlias(4)` → "SLOT 4 NOT OWNED (1 SLOT)".
 * The pass bought nothing at all.
 *
 * Half of the repair is the list. The other half is `slotsOf`, which counted ids: it works for
 * anything bought in the shop, where `buyCosmetic` forces slot n-1 before slot n and the ids are
 * therefore contiguous, and it does not work for a pass that grants `alias_4` and `preset_6`
 * outright — one past the top of the shop, and the only way to reach either.
 */
import { describe, expect, it } from "vitest";
import { COSMETICS, buyCosmetic, setAlias, setTheme, savePreset, slotsOf, cosmeticById } from "../shared/endgame/rewrite";
import { SEASON_PASS_COSMETICS, SEASON_PASS_GRANTS, grantSeasonPass, passThemePalette } from "../shared/economy/catalog";
import { SEASON_PASS_PRICE } from "../shared/economy/sinks";
import { createAccount, type Account } from "../shared/progression/account";
import { readFileSync } from "node:fs";

const holder = (): Account => {
  const a = createAccount("pass-holder");
  grantSeasonPass(a);
  return a;
};

describe("the Deep Wake pass — what it grants is what the game reads", () => {
  it("the grants land on the cosmetics list, not on the progression list", () => {
    const a = holder();
    for (const id of SEASON_PASS_GRANTS) {
      expect(a.cosmetics, `${id} did not reach the cosmetics list`).toContain(id);
      expect(a.owned, `${id} was written to the progression list instead`).not.toContain(id);
    }
  });

  it("every grant actually does the thing its name says, kind by kind", () => {
    // the structural half: a fourth grant added later has to work, not merely be present
    const a = holder();
    for (const c of SEASON_PASS_COSMETICS) {
      if (c.kind === "theme") {
        expect(setTheme(a, c.id), `${c.id} (${c.name}) could not be applied`).toBe(true);
        expect(a.theme).toBe(c.id);
      } else if (c.kind === "alias") {
        const n = Number(c.id.split("_")[1]);
        expect(slotsOf(a).aliases, `${c.id} (${c.name})`).toBeGreaterThanOrEqual(n);
        expect(setAlias(a, n, "GHOST"), `${c.id} (${c.name}) could not be used`).toEqual({ ok: true });
      } else {
        const n = Number(c.id.split("_")[1]);
        expect(slotsOf(a).presets, `${c.id} (${c.name})`).toBeGreaterThanOrEqual(n);
        expect(savePreset(a, n, "RUN", {}), `${c.id} (${c.name}) could not be used`).toEqual({ ok: true });
      }
    }
  });

  it("a file without the pass has none of it", () => {
    const a = createAccount("no-pass");
    expect(slotsOf(a)).toEqual({ aliases: 1, presets: 1 });
    expect(setTheme(a, "theme_deep_wake")).toBe(false);
    expect(savePreset(a, 6, "RUN", {}).ok).toBe(false);
    expect(setAlias(a, 4, "GHOST").ok).toBe(false);
  });

  it("granting twice grants nothing twice — a reconcile runs on every counter refresh", () => {
    const a = holder();
    const before = [...a.cosmetics!];
    expect(grantSeasonPass(a)).toEqual([]);
    expect(a.cosmetics).toEqual(before);
  });

  it("the price is real money leaving the supply, which is why this mattered", () => {
    expect(SEASON_PASS_PRICE).toBeGreaterThan(0);
    expect(SEASON_PASS_GRANTS.length).toBe(3);
  });

  it("the Deep Wake theme has a HUD palette, not an empty wear", () => {
    const c = SEASON_PASS_COSMETICS.find((x) => x.id === "theme_deep_wake")!;
    expect(c.palette).toEqual({ cy: "#7ad4ff", gr: "#4aa8a0", mg: "#b070e8", ye: "#d4dde8", am: "#7c90b0" });
    expect(passThemePalette("theme_deep_wake")).toEqual(c.palette);
    expect(passThemePalette("alias_4")).toBeNull();
    expect(cosmeticById("theme_deep_wake")).toBeUndefined();
    const a = holder();
    a.wallet.wakelight = 10_000;
    expect(buyCosmetic(a, "theme_deep_wake").reason).toBe("UNKNOWN COSMETIC");
  });

  it("DEEP WAKE's shop line is CRT, not the colour the graph goes", () => {
    const src = readFileSync(new URL("../shared/economy/catalog.ts", import.meta.url), "utf8");
    const line = SEASON_PASS_COSMETICS.find((c) => c.id === "theme_deep_wake")!.line;
    expect(line).toBe("THE COLOUR THE GRAPH GOES WHEN A SEASON ENDS AND NOBODY WINS");
    expect(line).not.toBe("the colour the graph goes when a season ends and nobody wins");
    expect(src).toMatch(/id: "theme_deep_wake".*line: "THE COLOUR THE GRAPH GOES WHEN A SEASON ENDS AND NOBODY WINS"/s);
    expect(src).not.toMatch(/id: "theme_deep_wake".*line: "the colour the graph goes when a season ends and nobody wins"/s);
  });

  it("the FILE tab wears the pass theme and lists owned pass cosmetics", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/passThemePalette\(id\)/);
    expect(src).not.toMatch(/return id \? cosmeticById\(id\)\?\.palette \?\? null : null;/);
    expect(src).toMatch(/SEASON_PASS_COSMETICS\.filter\(\(c\) => owned\.includes\(c\.id\)\)/);
    expect(src).toMatch(/\$\{shop\}\$\{passShop\}/);
  });
});

describe("slots — the highest owned, not a count of ids", () => {
  it("counting and highest agree for every combination the shop can sell", () => {
    // buyCosmetic forces slot n-1 before slot n, so shop-bought ids are contiguous and the two
    // readings must be identical; this is what makes the change safe for existing files
    for (const kind of ["alias", "preset"] as const) {
      const sellable = COSMETICS.filter((c) => c.kind === kind).map((c) => Number(c.id.split("_")[1])).sort((x, y) => x - y);
      const a = createAccount("shopper");
      a.cosmetics = [];
      for (const n of sellable) {
        a.cosmetics.push(`${kind}_${n}`);
        const counted = 1 + a.cosmetics.filter((id) => id.startsWith(`${kind}_`)).length;
        const highest = kind === "alias" ? slotsOf(a).aliases : slotsOf(a).presets;
        expect(highest, `${kind} after ${a.cosmetics.join(",")}`).toBe(counted);
      }
    }
  });

  it("a pass grant one past the top of the shop reads as the slot it names", () => {
    const a = createAccount("x");
    a.cosmetics = ["alias_4"];
    expect(slotsOf(a).aliases).toBe(4);
    a.cosmetics = ["preset_6"];
    expect(slotsOf(a).presets).toBe(6);
  });

  it("a file with nothing has one of each, and junk in the list changes nothing", () => {
    const a = createAccount("x");
    a.cosmetics = ["theme_ice", "skin_kernel", "alias_"];
    expect(slotsOf(a)).toEqual({ aliases: 1, presets: 1 });
  });
});

describe("the shop — a slot the file already has is not for sale", () => {
  it("a pass holder cannot be charged Wakelight for a slot underneath the one they were granted", () => {
    const a = holder();
    a.wallet.wakelight = 10_000;
    const before = a.wallet.wakelight;
    const r = buyCosmetic(a, "alias_2");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("ALREADY OWNED");
    expect(a.wallet.wakelight, "Wakelight was spent on a slot the file already had").toBe(before);
  });

  it("but the ordinary ladder still sells, in order, and takes the Wakelight", () => {
    const a = createAccount("shopper");
    a.wallet.wakelight = 10_000;
    expect(buyCosmetic(a, "alias_3").ok, "slot 3 before slot 2").toBe(false);
    expect(buyCosmetic(a, "alias_2")).toEqual({ ok: true });
    expect(slotsOf(a).aliases).toBe(2);
    expect(buyCosmetic(a, "alias_3")).toEqual({ ok: true });
    expect(slotsOf(a).aliases).toBe(3);
    expect(a.wallet.wakelight).toBeLessThan(10_000);
  });

  it("buying the same cosmetic twice is still refused, and themes are unaffected", () => {
    const a = createAccount("shopper");
    a.wallet.wakelight = 10_000;
    expect(buyCosmetic(a, "theme_ice")).toEqual({ ok: true });
    expect(buyCosmetic(a, "theme_ice").reason).toBe("ALREADY OWNED");
    expect(buyCosmetic(a, "theme_amber")).toEqual({ ok: true });
  });
});

describe("the counter-ledger — the pass grant is actually wired to the pass", () => {
  const ledger = readFileSync(new URL("../server/chain/ledger.ts", import.meta.url), "utf8");

  it("reconcile calls the grant when the file holds this season's pass", () => {
    // Without this, the grant could be disconnected from the only thing that calls it and every
    // other test here would stay green: they call it by name. probe:run proves it end to end
    // against a real chain, and that takes minutes; this costs nothing and says the same thing.
    expect(ledger).toMatch(/bought\.includes\(season\)\)\s*grantSeasonPass\(a\)/);
  });

  it("and the grant is not also being written to the progression list somewhere else", () => {
    expect(ledger).not.toMatch(/a\.owned\.push\(id\)/);
  });
});
