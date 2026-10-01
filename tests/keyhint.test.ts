/**
 * The words a control uses for itself (Stage 145): the key on a keyboard, the gesture on a phone.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cityArrivalLine, cityContractsLine, closeHint, closedCityLine, closedContractLine, DISTRICT_FOOTER, failedContractLine, menuFooter, openHint, receiptSignLine, reloadHint, safeZoneLine, settingsLine, tabOpens } from "../client/hud/keyhint";

describe("a frame's close marker", () => {
  it("names the key on a keyboard", () => {
    expect(closeHint("TAB", false)).toBe("[TAB] CLOSE");
    expect(closeHint("C", false)).toBe("[C] CLOSE");
    expect(closeHint("G", false)).toBe("[G] CLOSE");
    expect(closeHint("M", false)).toBe("[M] CLOSE");
  });
  it("names the gesture on a phone, whatever the key would have been", () => {
    for (const k of ["TAB", "C", "G", "M"]) expect(closeHint(k, true)).toBe("TAP TO CLOSE");
  });
  it("never puts a bracketed key in front of a thumb", () => {
    for (const k of ["TAB", "C", "G", "M"]) expect(closeHint(k, true)).not.toMatch(/\[[A-Z]+\]/);
  });
});

describe("the MARKET tab", () => {
  it("opens the market, not a dead label", () => {
    expect(tabOpens("MARKET·")).toBe("market");
    expect(tabOpens("MARKET·")).not.toBeNull();
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/op === "market" && this\.marketToggle/);
    expect(game).toMatch(/marketToggle = \(\) => this\.file\.toggle\(true, "market"\)/);
  });
});

describe("the CONTRACTS tab", () => {
  it("opens the contracts desk, not a dead label", () => {
    expect(tabOpens("CONTRACTS·")).toBe("contracts");
    expect(tabOpens("CONTRACTS·")).not.toBeNull();
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/op === "contracts" && this\.contractsToggle/);
    expect(game).toMatch(/contractsToggle = \(\) => this\.campaign\.toggleContracts\(\)/);
  });
});

describe("the NAME tab", () => {
  it("opens the name desk, not a dead label", () => {
    expect(tabOpens("NAME·")).toBe("name");
    expect(tabOpens("NAME·")).not.toBeNull();
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/class="tab">NAME<span/);
    expect(hud).toMatch(/op === "name" && this\.nameToggle/);
    expect(game).toMatch(/nameToggle = \(\) => this\.file\.toggle\(true, "name"\)/);
  });
});

describe("a safe zone", () => {
  it("names the market and the name desk, and a phone is not told to press a key", () => {
    expect(safeZoneLine(true)).toBe("SAFE ZONE · TAP MARKET · TAP NAME");
    expect(safeZoneLine(true)).not.toMatch(/\[[A-Z]+\]/);
    expect(safeZoneLine(false)).toBe("SAFE ZONE · [TAB] MARKET · [N] NAME");
    expect(safeZoneLine(false)).not.toBe("SAFE ZONE · [TAB] MARKET");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/safeZoneLine\(this\.touch\)/);
    expect(hud).not.toMatch(/SAFE ZONE · <span class="zone">\$\{openHint\("TAB", "MARKET"/);
  });
});

describe("the district select", () => {
  it("prints its footer as the terminal, not a sentence", () => {
    expect(DISTRICT_FOOTER).toBe("TRAVEL RELOADS THE CLIENT. ONLINE, THE ROOM DECIDES THE DISTRICT.");
    expect(DISTRICT_FOOTER).not.toBe("travel reloads the client; online, the room decides the district");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/\$\{DISTRICT_FOOTER\}/);
    expect(hud).not.toMatch(/travel reloads the client/);
  });
});

describe("a hint that opens something else", () => {
  it("names the key on a keyboard and the gesture on a phone", () => {
    expect(openHint("TAB", "MARKET", false)).toBe("[TAB] MARKET");
    expect(openHint("TAB", "MARKET", true)).toBe("TAP MARKET");
    expect(openHint("TAB", "MARKET", true)).not.toMatch(/\[[A-Z]+\]/);
  });
});

describe("the menu's footer (Stages 152, 163)", () => {
  // the settings screen: a list, with things to adjust, and somewhere to go back to
  const settings = { adjustable: true, canBack: true };
  // the main menu: a list, nothing adjustable, and nothing behind it
  const root = { adjustable: false, canBack: false };

  it("names the keys on a keyboard, for what the screen offers", () => {
    expect(menuFooter(false, settings.adjustable, settings.canBack)).toBe("↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK");
    expect(menuFooter(false, root.adjustable, root.canBack)).toBe("↑↓ MOVE · ENTER SELECT");
  });

  it("never offers a control the screen has not got", () => {
    const first = menuFooter(false, root.adjustable, root.canBack);
    expect(first).not.toMatch(/ADJUST/);
    expect(first).not.toMatch(/BACK/);
    expect(menuFooter(false, true, false)).not.toMatch(/BACK/);
    expect(menuFooter(false, false, true)).not.toMatch(/ADJUST/);
  });

  it("always says how to move and how to choose, because every screen is a list", () => {
    for (const adj of [true, false]) {
      for (const back of [true, false]) {
        expect(menuFooter(false, adj, back)).toContain("MOVE");
        expect(menuFooter(false, adj, back)).toContain("SELECT");
        expect(menuFooter(true, adj, back)).toContain("TAP A LINE TO CHOOSE");
      }
    }
  });

  it("names the gestures on a phone, and no key it cannot press", () => {
    const touch = menuFooter(true, settings.adjustable, settings.canBack);
    expect(touch).toBe("TAP A LINE TO CHOOSE · TAP [−] [+] TO ADJUST");
    expect(touch).not.toMatch(/ENTER|ESC|\u2191\u2193|\u2190 \u2192/);
    // a phone has no ESC either way, so going back is never named on touch
    expect(menuFooter(true, false, true)).toBe("TAP A LINE TO CHOOSE");
  });

  it("and the settings line follows it", () => {
    expect(settingsLine(false)).toBe("← → ADJUSTS · APPLIED LIVE · KEPT IN THIS BROWSER");
    expect(settingsLine(true)).toBe("TAP [−] [+] · APPLIED LIVE · KEPT IN THIS BROWSER");
    expect(settingsLine(false)).not.toBe("← → adjusts · applied live · kept in this browser");
    expect(settingsLine(true)).not.toBe("tap [−] [+] · applied live · kept in this browser");
    expect(settingsLine(true)).not.toMatch(/\u2190|\u2192/);
    const src = readFileSync(new URL("../client/hud/keyhint.ts", import.meta.url), "utf8");
    expect(src).toMatch(/APPLIED LIVE · KEPT IN THIS BROWSER/);
    expect(src).not.toMatch(/applied live · kept in this browser/);
  });

  it("keeps the two chips a thumb actually presses where there is anything to adjust", () => {
    expect(menuFooter(true, true, true)).toContain("[−]");
    expect(menuFooter(true, true, true)).toContain("[+]");
    expect(menuFooter(true, false, true)).not.toContain("[−]");
  });
});

describe("a closed contract", () => {
  it("names the contracts tab on a phone and the key on a keyboard", () => {
    expect(closedContractLine(true)).toBe("TAP CONTRACTS");
    expect(closedContractLine(true)).not.toMatch(/\[[A-Z]+\]/);
    expect(closedContractLine(false)).toBe("[J] CONTRACTS");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(campaign).toMatch(/closedContractLine\(this\.game\.hud\.touch\)/);
  });
});

describe("the way back to the city", () => {
  it("names the walk on a phone and the key on a keyboard", () => {
    expect(closedCityLine(true)).toBe("TAP CONTRACTS · BACK TO THE CITY");
    expect(closedCityLine(true)).not.toMatch(/\[[A-Z]+\]/);
    expect(closedCityLine(false)).toBe("[J] CONTRACTS · [B] BACK TO THE CITY");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(campaign).toMatch(/closedCityLine\(this\.game\.hud\.touch\)/);
    expect(campaign).not.toMatch(/\[J\] CONTRACTS · \[B\] BACK TO THE CITY/);
  });
});

describe("a failed contract", () => {
  it("names the contracts tab on a phone and the keys on a keyboard", () => {
    expect(failedContractLine(true)).toBe("TAP CONTRACTS");
    expect(failedContractLine(true)).not.toMatch(/\[[A-Z]+\]/);
    expect(failedContractLine(false)).toBe("[J] CONTRACTS · [R] RUN IT AGAIN");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(campaign).toMatch(/failedContractLine\(this\.game\.hud\.touch\)/);
  });
});

describe("the city objective", () => {
  it("names the contracts tab on a phone and the key on a keyboard", () => {
    expect(cityContractsLine(true)).toBe("TAP CONTRACTS · NO ONE HERE CAN HURT YOU BUT VANTAGE");
    expect(cityContractsLine(true)).not.toMatch(/\[[A-Z]+\]/);
    expect(cityContractsLine(false)).toBe("[J] CONTRACTS · NO ONE HERE CAN HURT YOU BUT VANTAGE");
    expect(cityArrivalLine("LEASE ROW", true)).toBe("THE CITY · LEASE ROW · EVERYONE ONLINE WALKS THESE STREETS · TAP CONTRACTS");
    expect(cityArrivalLine("LEASE ROW", true)).not.toMatch(/\[[A-Z]+\]/);
    expect(cityArrivalLine("LEASE ROW", false)).toBe("THE CITY · LEASE ROW · EVERYONE ONLINE WALKS THESE STREETS · [J] CONTRACTS");
    const campaign = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(campaign).toMatch(/cityContractsLine\(this\.game\.hud\.touch\)/);
    expect(campaign).toMatch(/cityArrivalLine\(levelDisplayName\(this\.game\.levelId\), this\.game\.hud\.touch\)/);
  });
});

describe("an empty magazine", () => {
  it("names the pad on a phone and the key on a keyboard", () => {
    expect(reloadHint(true)).toBe("▼ TAP RLD");
    expect(reloadHint(true)).not.toMatch(/\[[A-Z]+\]/);
    expect(reloadHint(false)).toBe("▼ RELOAD [R]");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/reloadHint\(this\.touch\)/);
  });
});

describe("the ledger receipt", () => {
  it("tells a phone to tap, and a keyboard to press enter", () => {
    expect(receiptSignLine(true)).toBe("TAP TO SIGN");
    expect(receiptSignLine(true)).not.toMatch(/\[[A-Z]+\]/);
    expect(receiptSignLine(false)).toBe("[ENTER] SIGN");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    const game = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/receiptSignLine\(this\.touch\)/);
    expect(hud).toMatch(/if \(this\.touch && this\.receiptTap\) this\.receiptTap\(\)/);
    expect(css).toMatch(/#hud\.touch \.receipt \{ pointer-events: auto; \}/);
    expect(game).toMatch(/receiptTap = \(\) => this\.sign\(\)/);
  });
});
