/**
 * The metro booth is the city's ledger desk (Stage 714).
 *
 * Standing at it names the market. Standing in its mouth holds into THE RUN of the same district.
 * A city spawn is not in that mouth. The market is a sink. The walk pays nothing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { districtById, generateDistrict } from "../shared/sim/city";
import { deskHit, inLedgerMouth, LEDGER_HOLD_GATE, LEDGER_HOLD_M, ledgerDeskHtml, ledgerDistance, ledgerHudLine, ledgerSpot, nearLedgerDesk } from "../shared/net/cityledger";
import { holdProgress, stepGateHold } from "../shared/net/citygates";
import { SIM_DT } from "../shared/sim/constants";
import { runPageUrl } from "../client/runpage";
import { cityPageUrl } from "../shared/net/city";
import { crewButton } from "../client/hud/keyhint";

const night = generateDistrict(districtById("night_market")!);
const lease = generateDistrict(districtById("lease_row")!);

describe("the plaza booth", () => {
  it("stands a step south of the metro door, in every district that has one", () => {
    for (const level of [night, lease]) {
      const spot = ledgerSpot(level);
      const door = level.boxes.find((b) => b.tag === "metro")!;
      expect(spot).not.toBeNull();
      expect(spot!.x).toBeCloseTo((door.min.x + door.max.x) / 2);
      expect(spot!.z).toBeCloseTo(door.max.z + 1.4);
      expect(inLedgerMouth(spot!, level)).toBe(true);
      expect(nearLedgerDesk({ x: spot!.x + 20, z: spot!.z }, level)).toBe(false);
    }
  });

  it("does not catch a file that just spawned on the perimeter", () => {
    for (const level of [night, lease]) {
      for (const s of level.spawns) expect(inLedgerMouth(s.pos, level)).toBe(false);
    }
  });

  it("holds for a second in the mouth, and the phone is not told to press a key", () => {
    const spot = ledgerSpot(night)!;
    expect(ledgerDistance(spot, night)!).toBeLessThanOrEqual(LEDGER_HOLD_M);
    let hold = stepGateHold(null, LEDGER_HOLD_GATE, SIM_DT);
    let ticks = 1;
    while (!hold.go && ticks < 120) {
      hold = stepGateHold(hold.hold, LEDGER_HOLD_GATE, SIM_DT);
      ticks++;
    }
    expect(hold.go).toBe(true);
    expect(ticks).toBe(Math.round(1 / SIM_DT));
    expect(holdProgress(hold.hold)).toBe(1);
    expect(ledgerHudLine(0, false, true)).toBe("LEDGER DESK · TAP MARKET · TAP NAME · WALK IN TO ENTER THE RUN");
    expect(ledgerHudLine(0, false, true)).not.toMatch(/\[[A-Z]+\]/);
    expect(ledgerHudLine(0, false, false)).toBe("LEDGER DESK · [TAB] MARKET · [N] NAME · WALK IN TO ENTER THE RUN");
    expect(ledgerHudLine(0, false, false)).not.toBe("LEDGER DESK · [TAB] MARKET · WALK IN TO ENTER THE RUN");
    expect(ledgerHudLine(0.5, true, false)).toContain("ENTERING THE RUN");
    const phone = ledgerHudLine(0, false, true);
    expect(ledgerDeskHtml(phone)).toContain('data-desk="market"');
    expect(ledgerDeskHtml(phone)).toContain('data-desk="name"');
    expect(ledgerDeskHtml(ledgerHudLine(0, false, false))).not.toContain("data-desk");
    const hit = (which: string | null) => ({ closest: (sel: string) => (sel === "[data-desk]" && which ? { getAttribute: () => which } : null) });
    expect(deskHit(hit("market"))).toBe("market");
    expect(deskHit(hit("name"))).toBe("name");
    expect(deskHit(hit(null))).toBe(null);
    expect(deskHit(null)).toBe(null);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(hud.includes('if (which === "market" && this.marketToggle) this.marketToggle()')).toBe(true);
    expect(hud.includes('else if (which === "name" && this.gateTap) this.gateTap()')).toBe(true);
    expect(css.includes("#hud.touch .gatehint.desk { pointer-events: auto; }")).toBe(true);
  });
});

describe("the trip", () => {
  const page = cityPageUrl("http://127.0.0.1:5173/?account=sandbox-t", { wsBase: "ws://127.0.0.1:8787", level: "night_market", shop: "http://127.0.0.1:8787" });

  it("enters THE RUN of this district and keeps the shop", () => {
    const url = runPageUrl(page, "night_market")!;
    const u = new URL(url);
    expect(u.searchParams.get("level")).toBe("night_market");
    expect(u.searchParams.get("mode")).toBe("run");
    expect(u.searchParams.get("city")).toBeNull();
    expect(u.searchParams.get("shop")).toBe("http://127.0.0.1:8787");
    const net = new URL(u.searchParams.get("net")!);
    expect(net.pathname).toMatch(/-run-night_market$/);
    expect(net.searchParams.get("mode")).toBe("run");
    expect(runPageUrl(page, "drainage_yard")).toBeNull();
    expect(runPageUrl("not a url", "lease_row")).toBeNull();
  });

  it("Tab at the desk opens the market, and taking that out of the client fails here", () => {
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/this\.runView\?\.inSafe \|\| this\.campaign\.atLedgerDesk \? "market" : "top"/);
    const map = readFileSync(new URL("../client/worldmap.ts", import.meta.url), "utf8");
    expect(map).toMatch(/data-wm-run="/);
    expect(map).toMatch(/LEDGER DESK AT THE METRO · MARKET SPENDS · THE NAME DESK BURNS · THE RUN PAYS/);
    expect(map).not.toMatch(/LEDGER DESK AT THE METRO · MARKET SPENDS · THE RUN PAYS/);
  });

  it("setting an alias names a tap on a phone", () => {
    expect(crewButton("SET", true)).toBe("TAP SET");
    expect(crewButton("SET", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("SET", false)).toBe("[SET]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const aliases =");
    const row = file.slice(start, file.indexOf("return `<div class=\"sh\">DAILY CONTRACTS", start));
    expect(row).toMatch(/data-act="setAlias" data-id="\$\{i \+ 1\}">\$\{crewButton\("SET", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[SET\]/);
  });

  it("saving a preset names a tap on a phone", () => {
    expect(crewButton("SAVE CURRENT", true)).toBe("TAP SAVE CURRENT");
    expect(crewButton("SAVE CURRENT", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("SAVE CURRENT", false)).toBe("[SAVE CURRENT]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const presets =");
    const row = file.slice(start, file.indexOf("const aliases", start));
    expect(row).toMatch(/data-act="savePreset" data-id="\$\{i \+ 1\}">\$\{crewButton\("SAVE CURRENT", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[SAVE CURRENT\]/);
  });

  it("loading a preset names a tap on a phone", () => {
    expect(crewButton("LOAD", true)).toBe("TAP LOAD");
    expect(crewButton("LOAD", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("LOAD", false)).toBe("[LOAD]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const presets =");
    const row = file.slice(start, file.indexOf("const aliases", start));
    expect(row).toMatch(/data-act="loadPreset" data-id="\$\{i \+ 1\}">\$\{crewButton\("LOAD", this\.touchHud\)\}/);
    expect(row).not.toMatch(/data-act="loadPreset"[^>]*>\[LOAD\]/);
  });

  it("wearing a season-pass theme names a tap on a phone", () => {
    expect(crewButton("WEAR", true)).toBe("TAP WEAR");
    expect(crewButton("WORN", true)).toBe("TAP WORN");
    expect(crewButton("WEAR", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("WORN", false)).toBe("[WORN]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const passShop =");
    const row = file.slice(start, file.indexOf("const presets =", start));
    expect(row).toMatch(/data-act="theme" data-id="\$\{c\.id\}">\$\{crewButton\(a\?\.theme === c\.id \? "WORN" : "WEAR", this\.touchHud\)\}/);
    expect(row).not.toMatch(/data-act="theme"[^>]*>\[/);
  });

  it("wearing an owned theme names a tap on a phone", () => {
    expect(crewButton("WEAR", true)).toBe("TAP WEAR");
    expect(crewButton("WORN", true)).toBe("TAP WORN");
    expect(crewButton("WEAR", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("WEAR", false)).toBe("[WEAR]");
    expect(crewButton("WORN", false)).toBe("[WORN]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const shop = COSMETICS.map");
    const row = file.slice(start, file.indexOf("const passShop", start));
    expect(row).toMatch(/data-act="theme" data-id="\$\{c\.id\}">\$\{crewButton\(a\?\.theme === c\.id \? "WORN" : "WEAR", this\.touchHud\)\}/);
    expect(row).not.toMatch(/data-act="theme"[^>]*>\[/);
  });

  it("buying a cosmetic names a tap on a phone", () => {
    expect(crewButton("40◆", true)).toBe("TAP 40◆");
    expect(crewButton("40◆", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("40◆", false)).toBe("[40◆]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const shop = COSMETICS.map");
    const row = file.slice(start, file.indexOf("const passShop", start));
    expect(row).toMatch(/data-act="buyCosmetic" data-id="\$\{c\.id\}">\$\{crewButton\(`\$\{c\.wakelight\}◆`, this\.touchHud\)\}/);
    expect(row).not.toMatch(/data-act="buyCosmetic"[^>]*>\[/);
  });

  it("burning the file names a tap on a phone", () => {
    const label = "BURN THE FILE — KEEP THE STAMPS AND THE GLYPH'S AGE — +500 WAKELIGHT";
    expect(crewButton(label, true)).toBe(`TAP ${label}`);
    expect(crewButton(label, true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton(label, false)).toBe(`[${label}]`);
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const rewriteBox");
    const row = file.slice(start, file.indexOf("const slots =", start));
    expect(row).toMatch(/data-act="rewrite">\$\{crewButton\("BURN THE FILE — KEEP THE STAMPS AND THE GLYPH'S AGE — \+500 WAKELIGHT", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[BURN THE FILE/);
  });

  it("claiming a finished daily names a tap on a phone", () => {
    expect(crewButton("CLAIM", true)).toBe("TAP CLAIM");
    expect(crewButton("CLAIM", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("CLAIM", false)).toBe("[CLAIM]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const contracts =");
    const row = file.slice(start, file.indexOf("const au =", start));
    expect(row).toMatch(/data-act="claim" data-id="\$\{c\.id\}">\$\{crewButton\("CLAIM", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[CLAIM\]/);
  });

  it("joining the audit names a tap on a phone", () => {
    expect(crewButton("JOIN THE AUDIT", true)).toBe("TAP JOIN THE AUDIT");
    expect(crewButton("JOIN THE AUDIT", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("JOIN THE AUDIT", false)).toBe("[JOIN THE AUDIT]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const audit =");
    const row = file.slice(start, file.indexOf("const rw =", start));
    expect(row).toMatch(/data-act="joinAudit">\$\{crewButton\("JOIN THE AUDIT", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[JOIN THE AUDIT\]/);
  });

  it("wearing a rig plate names a tap on a phone", () => {
    expect(crewButton("TEARDROP", true)).toBe("TAP TEARDROP");
    expect(crewButton("TEARDROP · WORN", true)).toBe("TAP TEARDROP · WORN");
    expect(crewButton("TEARDROP", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("TEARDROP", false)).toBe("[TEARDROP]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const rig =");
    const row = file.slice(start, file.indexOf("const market", start));
    expect(row).toMatch(/data-act="wear" data-id="\$\{r\.worn \? 0 : r\.token\}">\$\{crewButton\(`\$\{r\.name\}\$\{r\.worn \? " · WORN" : ""\}`, this\.touchHud\)\}/);
    expect(row).not.toMatch(/data-act="wear"[^>]*>\[/);
  });

  it("selling a rig plate names a tap on a phone", () => {
    expect(crewButton("SELL", true)).toBe("TAP SELL");
    expect(crewButton("SELL", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("SELL", false)).toBe("[SELL]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const rig =");
    const row = file.slice(start, file.indexOf("const market", start));
    expect(row).toMatch(/data-act="sell" data-id="\$\{r\.token\}">\$\{crewButton\("SELL", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[SELL\]/);
  });

  it("buying a listing names a tap on a phone", () => {
    expect(crewButton("48 $CAPITAL", true)).toBe("TAP 48 $CAPITAL");
    expect(crewButton("48 $CAPITAL", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("48 $CAPITAL", false)).toBe("[48 $CAPITAL]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf('data-act="buyListing"');
    const row = file.slice(start, file.indexOf("</span></div>`", start));
    expect(row).toMatch(/data-id="\$\{l\.listing\}">\$\{crewButton\(`\$\{l\.price\} \$CAPITAL`, this\.touchHud\)\}/);
    expect(row).not.toMatch(/data-id="\$\{l\.listing\}">\[/);
  });

  it("buying a room-hour names a tap on a phone", () => {
    expect(crewButton("+1 · 8 $CAPITAL", true)).toBe("TAP +1 · 8 $CAPITAL");
    expect(crewButton("+1 · 8 $CAPITAL", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("+1 · 8 $CAPITAL", false)).toBe("[+1 · 8 $CAPITAL]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const sinkBlock");
    const row = file.slice(start, file.indexOf("const runBlock", start));
    expect(row).toMatch(/data-act="buyroom">\$\{crewButton\(`\+1 · \$\{prices\.roomHour\} \$CAPITAL`, this\.touchHud\)\}/);
    expect(row).not.toMatch(/data-act="buyroom">\[/);
  });

  it("buying out the season names a tap on a phone", () => {
    expect(crewButton("BUY OUT · 48 $CAPITAL", true)).toBe("TAP BUY OUT · 48 $CAPITAL");
    expect(crewButton("BUY OUT · 48 $CAPITAL", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("BUY OUT · 48 $CAPITAL", false)).toBe("[BUY OUT · 48 $CAPITAL]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const sinkBlock");
    const row = file.slice(start, file.indexOf("const runBlock", start));
    expect(row).toMatch(/data-act="buyseason">\$\{crewButton\(`BUY OUT · \$\{prices\.seasonPass\} \$CAPITAL`, this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[BUY OUT/);
  });

  it("opening a private room names a tap on a phone", () => {
    expect(crewButton("OPEN A PRIVATE ROOM", true)).toBe("TAP OPEN A PRIVATE ROOM");
    expect(crewButton("OPEN A PRIVATE ROOM", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("OPEN A PRIVATE ROOM", false)).toBe("[OPEN A PRIVATE ROOM]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const sinkBlock");
    const row = file.slice(start, file.indexOf("const runBlock", start));
    expect(row).toMatch(/data-act="openroom">\$\{crewButton\("OPEN A PRIVATE ROOM", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[OPEN A PRIVATE ROOM\]/);
  });

  it("withdrawing owed units names a tap on a phone", () => {
    expect(crewButton("WITHDRAW TO WALLET", true)).toBe("TAP WITHDRAW TO WALLET");
    expect(crewButton("WITHDRAW TO WALLET", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("WITHDRAW TO WALLET", false)).toBe("[WITHDRAW TO WALLET]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const runBlock");
    const row = file.slice(start, file.indexOf("const prizes", start));
    expect(row).toMatch(/data-act="payout">\$\{crewButton\("WITHDRAW TO WALLET", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[WITHDRAW TO WALLET\]/);
  });

  it("claiming a posted prize names a tap on a phone", () => {
    expect(crewButton("CLAIM", true)).toBe("TAP CLAIM");
    expect(crewButton("CLAIM", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("CLAIM", false)).toBe("[CLAIM]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const prizeBlock");
    const row = file.slice(start, file.indexOf("const t =", start));
    expect(row).toMatch(/data-act="claimPrize" data-id="\$\{p\.epoch\}">\$\{crewButton\("CLAIM", this\.touchHud\)\}/);
    expect(row).not.toMatch(/\[CLAIM\]/);
  });

  it("refreshing prizes names a tap on a phone", () => {
    expect(crewButton("REFRESH", true)).toBe("TAP REFRESH");
    expect(crewButton("REFRESH", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("REFRESH", false)).toBe("[REFRESH]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const prizeBlock");
    const row = file.slice(start, file.indexOf("const t =", start));
    expect(row).toMatch(/data-act="prizes">\$\{crewButton\("REFRESH", this\.touchHud\)\}/);
    expect(row).not.toMatch(/data-act="prizes">\[REFRESH\]/);
  });

  it("reconciling the book names a tap on a phone", () => {
    expect(crewButton("RECONCILE", true)).toBe("TAP RECONCILE");
    expect(crewButton("RECONCILE", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("RECONCILE", false)).toBe("[RECONCILE]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const linked =");
    const row = file.slice(start, file.indexOf("const name =", start));
    expect(row).toMatch(/crewButton\("RECONCILE", this\.touchHud\)/);
    expect(row).not.toMatch(/\[RECONCILE\]/);
  });

  it("attesting stamps names a tap on a phone", () => {
    expect(crewButton("ATTEST", true)).toBe("TAP ATTEST");
    expect(crewButton("ATTEST", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("ATTEST", false)).toBe("[ATTEST]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const linked =");
    const row = file.slice(start, file.indexOf("const name =", start));
    expect(row).toMatch(/crewButton\("ATTEST", this\.touchHud\)/);
    expect(row).not.toMatch(/\[ATTEST\]/);
  });

  it("signing the link names a tap on a phone", () => {
    expect(crewButton("SIGN THE LINK", true)).toBe("TAP SIGN THE LINK");
    expect(crewButton("SIGN THE LINK", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("SIGN THE LINK", false)).toBe("[SIGN THE LINK]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const start = file.indexOf("const linked =");
    const row = file.slice(start, file.indexOf("const name =", start));
    expect(row).toMatch(/crewButton\("SIGN THE LINK", this\.touchHud\)/);
    expect(row).not.toMatch(/\[SIGN THE LINK\]/);
  });

  it("the wallet row names a tap on a phone", () => {
    expect(crewButton("LINK A WALLET", true)).toBe("TAP LINK A WALLET");
    expect(crewButton("LINK A WALLET", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("LINK A WALLET", false)).toBe("[LINK A WALLET]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const row = file.slice(file.indexOf("const wallet ="), file.indexOf("const linked ="));
    expect(row).toMatch(/crewButton\("LINK A WALLET", this\.touchHud\)/);
    expect(row).not.toMatch(/\[LINK A WALLET\]/);
  });

  it("the name desk's write control names a tap on a phone", () => {
    expect(crewButton("WRITE IT", true)).toBe("TAP WRITE IT");
    expect(crewButton("WRITE IT", true)).not.toMatch(/\[[A-Z]/);
    expect(crewButton("WRITE IT", false)).toBe("[WRITE IT]");
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const row = file.slice(file.indexOf("nameLine():"), file.indexOf("nameDeskHtml():"));
    expect(row).toMatch(/crewButton\("WRITE IT", this\.touchHud\)/);
    expect(row).not.toMatch(/\[WRITE IT\]/);
  });

  it("the name desk is not the market panel", () => {
    const file = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    const desk = file.slice(file.indexOf("nameDeskHtml():"), file.indexOf("counterHtml():"));
    expect(desk).toMatch(/▲ NAME DESK/);
    expect(desk).not.toMatch(/LEDGER MARKET/);
    expect(file).toMatch(/e\.code === "KeyN"/);
    expect(file).toMatch(/panelSection === "name"/);
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(game).toMatch(/gateTap = \(\) => this\.file\.toggle\(true, "name"\)/);
  });
});
