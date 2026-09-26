/**
 * The campaign says something about what you did, before the last screen (Stage 661).
 *
 * Stage 656 made the ending answer every choice. This is the same question asked of the hours
 * before it, and the answer was worse. Measured across the whole script graph:
 *
 *   scripts 10 · nodes 32 · spoken lines 54 · choices 21
 *   choices that WRITE testimony: 21
 *   choices GATED on prior testimony: 3 (14.3%)
 *   script nodes whose LINES vary on prior testimony: 0 — ScriptNode had no gate field
 *
 * Not one of the 54 lines anyone speaks could depend on anything the player had done. Every
 * reaction the campaign had was mechanical — a wasp count, a swapped objective, a gig that did or
 * did not appear — or waited for the final card. A handler could not mention the choice you made
 * an hour ago because the data model had nowhere to put the sentence.
 *
 * A first pass at this measurement said `faction` was read by nothing, which would have made the
 * opening choice of the game inert. It was wrong: `Gate` carries faction in its own field, not in
 * `all`/`not`/`any`, and the extractor only walked those three. Two endings are faction-gated. The
 * same shape of mistake as Stage 656's grep, caught the same way — by deriving from the type.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { linesAt, recallIndex, recalledTestimony, scriptById, spokenLines, SCRIPTS } from "../shared/campaign/script";
import { producibleTestimony, lintCampaign } from "../shared/campaign/lint";

describe("the campaign answers a choice before the last screen", () => {
  it("the campaign lint is clean, including the new rule", () => {
    expect(lintCampaign().filter((x) => x.severity === "error")).toEqual([]);
  });

  it("every key a choice can write has a spoken line for every value it can take", () => {
    const recalled = recalledTestimony();
    for (const [key, values] of producibleTestimony()) {
      if (key.endsWith(":ending") || key === "faction") continue;
      expect(recalled.get(key), `nothing anyone says depends on "${key}"`).toBeDefined();
      for (const v of values) expect(recalled.get(key)!.has(v), `"${key}" = "${v}" is never spoken to`).toBe(true);
    }
  });

  it("a node says more once the file has something to say back, and says it in that node's voice", () => {
    const m2 = scriptById("m2_informant")!.nodes.find((n) => n.id === "a")!;
    const blank = spokenLines(m2, {}, null);
    const kept = spokenLines(m2, { "m1:lease": "keep" }, null);
    const burned = spokenLines(m2, { "m1:lease": "burn" }, null);
    expect(blank).toEqual(m2.lines);
    expect(kept).toHaveLength(m2.lines.length + 1);
    expect(kept.slice(0, m2.lines.length), "the briefing is never lost to a variant").toEqual(m2.lines);
    expect(kept).not.toEqual(burned);
    expect(kept[kept.length - 1]).toMatch(/STILL ON YOU/);
    expect(burned[burned.length - 1]).toMatch(/GAP WHERE YOUR FORECAST WAS/);
  });

  it("a handler, not only the terminal, reacts: Wern answers the lattice and Vessel the depot logs", () => {
    const office = scriptById("m7_office")!.nodes.find((n) => n.id === "a")!;
    expect(office.speaker).toBe("wern");
    const blind = spokenLines(office, { "m5:lattice": "all" }, null);
    const docks = spokenLines(office, { "m5:lattice": "spare_docks" }, null);
    expect(blind).not.toEqual(docks);
    expect(blind.join(" ")).toMatch(/blind for nine days/i);

    const leak = scriptById("m4_leak")!.nodes.find((n) => n.id === "a")!;
    expect(leak.speaker).toBe("vessel");
    expect(spokenLines(leak, { "m3:volatility": "publish" }, null)).not.toEqual(spokenLines(leak, { "m3:volatility": "hold" }, null));
  });

  it("only the first open recall speaks, so two open gates cannot stack two sentences", () => {
    const office = scriptById("m7_office")!.nodes.find((n) => n.id === "a")!;
    const both = spokenLines(office, { "m5:lattice": "all", "m6:broadcast": "full" }, null);
    expect(both).toHaveLength(office.lines.length + 1);
  });

  it("co-op carries an index, never lines: a host cannot put its own text on a guest's terminal", () => {
    const m2 = scriptById("m2_informant")!.nodes.find((n) => n.id === "a")!;
    // the guest renders from the host's index against its own copy of the manifest
    const hostIndex = recallIndex(m2, { "m1:lease": "keep" }, null);
    expect(hostIndex).toBeGreaterThanOrEqual(0);
    expect(linesAt(m2, hostIndex)).toEqual(spokenLines(m2, { "m1:lease": "keep" }, null));
    // a guest with no testimony of its own still reads the host's screen
    expect(linesAt(m2, hostIndex)).not.toEqual(spokenLines(m2, {}, null));
    // and an index that names nothing is simply the plain node, never a crash
    expect(linesAt(m2, -1)).toEqual(m2.lines);
    expect(linesAt(m2, 99)).toEqual(m2.lines);
  });

  it("and the client actually renders it, rather than computing it and dropping it", () => {
    // the Stage 654 lesson, and the reason Stage 656 pinned the same thing for the coda
    const src = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(src).toMatch(/const recall = recallIndex\(n, all, this\.save\.faction\)/);
    expect(src).toMatch(/hud\.terminal\(speaker\.name, speaker\.sigil, speaker\.color, linesAt\(n, recall\)/);
    // both screens: the host's own, and the mirror the crew reads
    expect(src).toMatch(/hud\.terminal\(speaker\.name, speaker\.sigil, speaker\.color, linesAt\(n, ev\.recall\)/);
    expect(src).toMatch(/sendTerminal\(\{ script: p\.script, node: n\.id, choices, picked: this\.lastPick, recall \}\)/);
    expect(src).not.toMatch(/hud\.terminal\(speaker\.name, speaker\.sigil, speaker\.color, n\.lines/);
  });

  it("the recall gates name keys that exist and values that can actually be written", () => {
    const producible = producibleTestimony();
    for (const s of SCRIPTS) {
      for (const n of s.nodes) {
        for (const r of n.recall ?? []) {
          for (const [k, v] of Object.entries(r.gate.all ?? {})) {
            expect(producible.get(k), `${s.id}/${n.id} recalls unknown key "${k}"`).toBeDefined();
            expect(producible.get(k)!.has(v), `${s.id}/${n.id} recalls "${k}" = "${v}", which no choice writes`).toBe(true);
          }
        }
      }
    }
  });
});
