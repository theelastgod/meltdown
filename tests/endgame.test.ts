import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dayIndex, pickDistinct, seasonIndex, seasonWeek, weekIndex } from "../shared/endgame/clock";
import { claimContract, contractsFor, dailyView, CONTRACT_POOL } from "../shared/endgame/contracts";
import { AUDITS, auditErrors, auditFor, currentAudit, leaderboard } from "../shared/endgame/audits";
import { applyRound, emptySeason, houseName, rollSeason, seasonView, TURN_AT } from "../shared/endgame/season";
import { buyCosmetic, canRewrite, COSMETICS, rewrite, REWRITE_WAKELIGHT, savePreset, setAlias, setTheme, slotsOf, slotsWord } from "../shared/endgame/rewrite";
import { createAccount, sandboxAccount } from "../shared/progression/account";
import { itemById } from "../shared/manifest/items";
import { DAY_MS } from "../shared/endgame/clock";

describe("the endgame clock", () => {
  it("day, week and season indices are stable and seeded picks are deterministic", () => {
    const t = Date.UTC(2026, 8, 6, 12); // a Sunday
    expect(dayIndex(t)).toBe(Math.floor(t / DAY_MS));
    expect(weekIndex(t)).toBe(weekIndex(t - 6 * DAY_MS)); // Monday of the same week
    expect(weekIndex(t + DAY_MS)).toBe(weekIndex(t) + 1); // the next Monday starts a week
    expect(seasonIndex(t)).toBe(Math.floor(dayIndex(t) / 28));
    expect(seasonWeek(t)).toBeGreaterThanOrEqual(1);
    expect(pickDistinct(5, 10, 3)).toEqual(pickDistinct(5, 10, 3));
    expect(new Set(pickDistinct(9, 10, 3)).size).toBe(3);
  });
});

describe("daily contracts", () => {
  it("three a day from the pool, seeded by the day; progress is the counter delta since the day began; a claim pays once", () => {
    const day = 20700;
    const now = day * DAY_MS + 1000;
    const today = contractsFor(day);
    expect(today.length).toBe(3);
    expect(new Set(today.map((c) => c.id)).size).toBe(3);
    expect(contractsFor(day)).toEqual(today);
    expect(contractsFor(day + 1)).not.toEqual(today);
    expect(today.every((c) => CONTRACT_POOL.includes(c))).toBe(true);
    const a = createAccount("d:1", "D");
    a.counters[today[0]!.counter] = 100; // history before today does not count
    const v0 = dailyView(a, now);
    expect(v0.contracts[0]!.progress).toBe(0);
    a.counters[today[0]!.counter] = 100 + today[0]!.need;
    const v1 = dailyView(a, now);
    expect(v1.contracts[0]!.done).toBe(true);
    expect(claimContract(a, today[1]!.id, now).ok).toBe(false);
    const r = claimContract(a, today[0]!.id, now);
    expect(r.ok).toBe(true);
    expect(a.wallet.scrip).toBe(today[0]!.scrip);
    expect(a.wallet.wakelight).toBe(today[0]!.wakelight);
    expect(claimContract(a, today[0]!.id, now)).toEqual({ ok: false, reason: "already claimed" });
    // the next day rolls the base and the claims
    const v2 = dailyView(a, now + DAY_MS);
    expect(v2.day).toBe(day + 1);
    expect(v2.contracts.every((c) => !c.claimed && c.progress === 0)).toBe(true);
  });
});

describe("the FILE tab names the week's guns", () => {
  it("lists REPO HAMMER, not repo_hammer", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/au\.weapons\.map\(weaponName\)/);
    expect(src).not.toMatch(/au\.weapons\.join\(", "\)/);
  });
});

describe("audits", () => {
  it("playlist lines are CRT, not Repo Hammer and Clockeater only", () => {
    for (const a of AUDITS) expect(a.line).toBe(a.line.toUpperCase());
    const pellet = AUDITS.find((x) => x.id === "pellet_week")!;
    expect(pellet.line).toBe("REPO HAMMER AND CLOCKEATER ONLY. EVERY FILE IS A SHOTGUN FILE.");
    expect(pellet.line).not.toBe("Repo Hammer and Clockeater only. Every file is a shotgun file.");
  });

  it("the week picks a playlist; its rules refuse weapons, keystones and rings it bans; leaderboards keep the best per file", () => {
    expect(AUDITS.length).toBeGreaterThanOrEqual(8);
    expect(auditFor(3)).toBe(AUDITS[3]);
    expect(auditFor(3 + AUDITS.length)).toBe(AUDITS[3]);
    expect(currentAudit().audit).toBe(auditFor(weekIndex()));
    const ringOf = (id: string) => itemById(id)?.ring;
    const lo = { primary: "lease_breaker" as const, secondary: "shock_baton" as const, attested: ["slipfile"], keystone: "debtless", chips: {}, firmware: {} };
    const pellet = AUDITS.find((x) => x.id === "pellet_week")!;
    const banned = auditErrors(lo, pellet, ringOf);
    expect(banned.map((e) => e.rule)).toEqual(["audit-weapon"]);
    expect(banned[0]!.detail).toMatch(/LEASE-BREAKER/);
    expect(banned[0]!.detail).toMatch(/REPO HAMMER/);
    expect(banned[0]!.detail).not.toMatch(/lease_breaker/);
    expect(banned[0]!.detail).not.toMatch(/repo_hammer/);
    expect(auditErrors({ ...lo, primary: "repo_hammer" }, pellet, ringOf)).toEqual([]);
    const nk = AUDITS.find((x) => x.id === "no_keystone")!;
    expect(auditErrors(lo, nk, ringOf).map((e) => e.rule)).toEqual(["audit-keystone"]);
    const r1 = AUDITS.find((x) => x.id === "ring_one")!;
    expect(auditErrors({ ...lo, keystone: null, attested: ["slipfile"] }, r1, ringOf)).toEqual([]);
    const ringKick = auditErrors({ ...lo, keystone: null, attested: ["escrow"] }, r1, ringOf);
    expect(ringKick.map((e) => e.rule)).toEqual(["audit-ring"]);
    expect(ringKick[0]!.detail).toMatch(/ESCROW/);
    expect(ringKick[0]!.detail).not.toMatch(/^escrow /);
    const ring2 = itemById("slipfile") ? undefined : null;
    void ring2;
    const board = leaderboard([
      { account: "a", display: "A", score: 900, at: 1 },
      { account: "b", display: "B", score: 1200, at: 2 },
      { account: "a", display: "A", score: 1500, at: 3 },
      { account: "c", display: "C", score: 1200, at: 1 },
    ]);
    expect(board.map((e) => `${e.account}:${e.score}`)).toEqual(["a:1500", "c:1200", "b:1200"]);
  });
});

describe("the Deep Wake", () => {
  it("names the houses the city does, not the id", () => {
    expect(houseName("cells")).toBe("THE WAKE CELLS");
    expect(houseName("estate")).toBe("THE ESTATE");
    expect(houseName("clockeaters")).toBe("THE CLOCKEATERS");
    expect(houseName("cells")).not.toBe("CELLS");
    const src = readFileSync(new URL("../shared/endgame/season.ts", import.meta.url), "utf8");
    expect(src).toMatch(/TURNED \$\{houseName\(t\.to\)\}/);
    expect(src).toMatch(/levelDisplayName\(d\)/);
    expect(src).toMatch(/levelDisplayName\(push\.level\)/);
    expect(src).not.toMatch(/t\.to\.toUpperCase\(\)/);
    expect(src).not.toMatch(/d\.toUpperCase\(\)\.replace\(\/_\/g/);
    expect(src).not.toMatch(/push\.level\.toUpperCase\(\)\.replace\(\/_\/g/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/houseName\(h\)/);
    expect(hud).toMatch(/houseName\("cells"\)/);
    expect(hud).toMatch(/houseName\(n\.leader\)/);
    expect(hud).toMatch(/levelDisplayName\(d\)/);
    expect(hud).not.toMatch(/h === "unaligned" \? "—" : h\.toUpperCase\(\)/);
    expect(hud).not.toMatch(/n\.leader\.slice\(0, 3\)\.toUpperCase\(\)/);
    expect(hud).toMatch(/class='dim'>NO ROUNDS HAVE MOVED THE GRAPH YET/);
    expect(hud).not.toMatch(/no rounds have moved the graph yet/);
  });

  it("rounds push pressure toward the flipping files' houses; enough pressure turns a node; the season rolls with a history from real data", () => {
    const st = emptySeason(100);
    const now = 100 * 28 * DAY_MS + 1000;
    const turned = applyRound(st, { level: "lease_row", flips: [{ label: "B", house: "cells", count: 4 }], winners: ["cells"] }, now);
    expect(turned).toEqual([]);
    expect(st.districts["lease_row"]!["B"]!.pressure.cells).toBe(4);
    const t2 = applyRound(st, { level: "lease_row", flips: [{ label: "B", house: "cells", count: 2 }], winners: [] }, now);
    expect(t2).toEqual([{ label: "B", from: "unaligned", to: "cells" }]);
    expect(st.districts["lease_row"]!["B"]!.house).toBe("cells");
    expect(st.districts["lease_row"]!["B"]!.pressure.cells).toBe(0);
    expect(st.history.some((l) => /LEASE ROW B TURNED THE WAKE CELLS/.test(l))).toBe(true);
    expect(st.history.some((l) => /TURNED CELLS(?! )/.test(l))).toBe(false);
    // the holding house gets +1 on its nodes when its cell wins; the estate needs TURN_AT of its own to take it back
    for (let i = 0; i < TURN_AT; i++) applyRound(st, { level: "lease_row", flips: [{ label: "B", house: "estate", count: 1 }], winners: ["cells"] }, now);
    expect(st.districts["lease_row"]!["B"]!.house).toBe("cells"); // the winners' +1 kept pace: the holder defends a tie
    const t3 = applyRound(st, { level: "lease_row", flips: [{ label: "B", house: "estate", count: 3 }], winners: ["estate"] }, now);
    expect(t3).toEqual([{ label: "B", from: "cells", to: "estate" }]);
    const v = seasonView(st);
    expect(v.held.cells + v.held.estate + v.held.unaligned + v.held.clockeaters).toBe(15);
    expect(v.last).toMatch(/LEASE ROW/);
    expect(applyRound(st, { level: "nowhere", flips: [], winners: [] }, now)).toEqual([]);
    // roll: 28 days later the log is written and pressures reset, holdings carry
    const before = st.rounds;
    expect(before).toBeGreaterThan(0);
    expect(rollSeason(st, now + 28 * DAY_MS)).toBe(true);
    expect(st.season).toBe(101);
    expect(st.rounds).toBe(0);
    expect(st.history.some((l) => /SEASON 100 CLOSED/.test(l))).toBe(true);
    expect(st.districts["lease_row"]!["B"]!.house).not.toBe("unaligned");
    expect(rollSeason(st, now + 28 * DAY_MS)).toBe(false);
  });
});

describe("the FILE shop counts slots", () => {
  it("one slot is SLOT, not SLOTS", () => {
    expect(slotsWord(1)).toBe("1 SLOT");
    expect(slotsWord(2)).toBe("2 SLOTS");
    expect(slotsWord(0)).toBe("0 SLOTS");
    expect(slotsWord(1)).not.toBe("1 SLOTS");
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/PRESETS · \$\{slotsWord\(slots\.presets\)\}/);
    expect(src).toMatch(/ALIASES · \$\{slotsWord\(slots\.aliases\)\}/);
    expect(src).not.toMatch(/slots\.presets\} SLOTS/);
    expect(src).not.toMatch(/slots\.aliases\} SLOTS/);
  });

  it("an empty preset or alias is EMPTY, not empty", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/class='dim'>EMPTY/);
    expect(src).not.toMatch(/class='dim'>empty/);
  });

  it("an empty rig is NOTHING ON THE RIG YET, not nothing on the rig yet", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/class='dim'>NOTHING ON THE RIG YET/);
    expect(src).not.toMatch(/nothing on the rig yet/);
  });

  it("a missing treasury falls back to LOADING…, not loading…", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/info\?\.reason \?\? "LOADING…"/);
    expect(src).not.toMatch(/info\?\.reason \?\? "loading…"/);
  });

  it("a waiting Audit playlist is LOADING…, not loading…", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/joinAudit[\s\S]*class='dim'>LOADING…/);
    expect(src).not.toMatch(/joinAudit[\s\S]*class='dim'>loading…/);
  });

  it("a waiting contracts board is LOADING THE BOARD…, not loading the board…", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/class='dim'>LOADING THE BOARD…/);
    expect(src).not.toMatch(/class='dim'>loading the board…/);
  });

  it("an empty ledger is NO LINES YET, not no lines yet", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/class='dim'>NO LINES YET/);
    expect(src).not.toMatch(/class='dim'>no lines yet/);
  });

  it("the SIWE how-to is CRT, not one SIWE statement", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/ONE SIWE STATEMENT; THE GHOSTFILE MINTS WITH SPONSORED GAS/);
    expect(src).not.toMatch(/one SIWE statement; the Ghostfile mints with sponsored gas/);
  });

  it("a written name is WRITTEN WHERE THEY CAN'T REDACT IT, not sentence case", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/WRITTEN WHERE THEY CAN'T REDACT IT/);
    expect(src).not.toMatch(/written where they can't redact it/);
  });

  it("a closed name registry is THE REGISTRY OPENS AT DEPTH, not sentence case", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/THE REGISTRY OPENS AT DEPTH \$\{NAME_DEPTH\}/);
    expect(src).not.toMatch(/the registry opens at Depth \$\{NAME_DEPTH\}/);
  });

  it("a name fee is $CAPITAL BY LENGTH, BURNED, not by length, burned", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/\$CAPITAL BY LENGTH, BURNED/);
    expect(src).not.toMatch(/\$CAPITAL by length, burned/);
  });

  it("an unlinked wallet how-to is CRT, not Robinhood Wallet · WalletConnect · injected", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/ROBINHOOD WALLET · WALLETCONNECT · INJECTED/);
    expect(src).not.toMatch(/Robinhood Wallet · WalletConnect · injected/);
  });

  it("a gated node is NEEDS DEPTH, not needs Depth", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/NEEDS DEPTH \$\{/);
    expect(src).not.toMatch(/needs Depth \$\{/);
  });

  it("a locked chip or firmware is (LOCKED), not (locked)", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/ \(LOCKED\)/);
    expect(src).not.toMatch(/ \(locked\)/);
  });

  it("the other book is CRT, not VANTAGE priced you", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/VANTAGE PRICED YOU\. THIS IS THE OTHER BOOK\./);
    expect(src).not.toMatch(/VANTAGE priced you\. This is the other book\./);
  });

  it("a market row is LISTED BY, not listed by", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/LISTED BY \$\{mine \? "<span class='ye'>YOU<\/span>"/);
    expect(src).not.toMatch(/listed by \$\{mine/);
  });

  it("the Ledger Market heading is CRT, not settles only in", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/LEDGER MARKET · SETTLES ONLY IN \$CAPITAL · 5% FEE: 2% BURNED, 2% TREASURY, 1% CREATOR/);
    expect(src).not.toMatch(/LEDGER MARKET · settles only in \$CAPITAL/);
  });

  it("the prizes how-to is CRT, not THE RUN settles nightly", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/THE RUN SETTLES NIGHTLY, AUDIT PLACEMENTS WEEKLY, DEEP WAKE CONTRIBUTIONS AT SEASON END; CLAIMS ARE SPONSORED/);
    expect(src).not.toMatch(/THE RUN settles nightly, Audit placements weekly/);
  });

  it("the counter chain label is CHAIN, not chain", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/" · CHAIN " \+ info\.chainId/);
    expect(src).not.toMatch(/" · chain " \+ info\.chainId/);
  });

  it("the Ledger Graph shop footer is CRT, not click a leased node", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/CLICK A LEASED NODE TO BUY IT WITH SCRIP \(VIOLET → GREEN\); CLICK AN OWNED NODE TO ATTEST IT/);
    expect(src).not.toMatch(/click a leased node to buy it with Scrip/);
  });

  it("the Ledger Graph sandbox footer is CRT, not sandbox: every node", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/SANDBOX: EVERY NODE IS IN THE FILE — CLICK TO ATTEST/);
    expect(src).not.toMatch(/sandbox: every node is in the file — click to attest/);
  });

  it("the graph hint is G OPENS THE WHOLE GRAPH, not G opens the whole graph", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/\(G OPENS THE WHOLE GRAPH\)/);
    expect(src).not.toMatch(/\(G opens the whole graph\)/);
  });

  it("an alias field is CRT, not a name the city may call you", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/placeholder="A NAME THE CITY MAY CALL YOU"/);
    expect(src).not.toMatch(/placeholder="a name the city may call you"/);
  });

  it("an unowned node is NOT IN YOUR FILE, not not in your file", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/class="c">NOT IN YOUR FILE/);
    expect(src).not.toMatch(/class="c">not in your file/);
  });

  it("units settle nightly is CRT, not sentence case", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/UNITS SETTLE NIGHTLY AT UP TO \$\{MAX_CAPITAL_PER_UNIT\} \$CAPITAL EACH/);
    expect(src).not.toMatch(/units settle nightly at up to/);
  });

  it("an unlinked RUN is CRT, not pays the wallet", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/THE RUN PAYS THE WALLET: LINK ONE AND THE UNITS YOU BANK AT A GATE SETTLE INTO \$CAPITAL\./);
    expect(src).not.toMatch(/THE RUN pays the wallet:/);
  });

  it("ENDGAME without a host is CRT, not contracts, Audits", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/CONTRACTS, AUDITS, THE DEEP WAKE AND REWRITE NEED A LEDGER HOST \(LINK A ROOM OR OPEN WITH \?SHOP=\)/);
    expect(src).not.toMatch(/contracts, Audits, the Deep Wake and Rewrite need a ledger host/);
  });

  it("the sink how-to is CRT, not both burned in full", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/BOTH BURNED IN FULL; A PASS IS COSMETICS, AN HOUR IS A SERVER OF YOUR OWN — A PRIVATE ROOM BANKS SCRIP, NEVER \$CAPITAL/);
    expect(src).not.toMatch(/both burned in full; a pass is cosmetics/);
  });

  it("a private-room invite is CRT, not give it to whoever you want in", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/GIVE IT TO WHOEVER YOU WANT IN; IT IS THE ONLY WAY IN/);
    expect(src).not.toMatch(/give it to whoever you want in; it is the only way in/);
  });

  it("a Depth-gated RUN is CRT, not the run pays Scrip", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/BELOW DEPTH \$\{RUN_DEPTH\} THE RUN PAYS SCRIP/);
    expect(src).not.toMatch(/below Depth \$\{RUN_DEPTH\} the run pays Scrip/);
  });

  it("a waiting counter is FETCHING THE CHAIN CLIENT, not fetching the chain client", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/COUNTER-LEDGER \/\/ FETCHING THE CHAIN CLIENT…/);
    expect(src).not.toMatch(/fetching the chain client/);
  });

  it("an empty market is NO LISTINGS, not no listings", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/class='dim'>NO LISTINGS/);
    expect(src).not.toMatch(/class='dim'>no listings/);
  });

  it("an empty Audit board is NO SCORES YET THIS WEEK, not no scores yet this week", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/class='dim'>NO SCORES YET THIS WEEK/);
    expect(src).not.toMatch(/no scores yet this week/);
  });

  it("an unplayed Audit is NOT PLAYED YET, not not played yet", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/"NOT PLAYED YET"/);
    expect(src).not.toMatch(/"not played yet"/);
  });

  it("an empty prize row is NONE POSTED FOR THIS WALLET, not none posted", () => {
    const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");
    expect(src).toMatch(/class="dim">NONE POSTED FOR THIS WALLET/);
    expect(src).not.toMatch(/none posted for this wallet/);
  });
});

describe("rewrite and the Wakelight shop", () => {
  it("opens at Depth 50, burns the file, keeps stamps and the glyph's age, pays Wakelight; cosmetics are slots and themes, never power", () => {
    const fresh = createAccount("r:1", "R");
    expect(canRewrite(fresh).ok).toBe(false);
    const a = sandboxAccount("r:2");
    a.stamps.push("first_kill:lease_breaker");
    a.counters["kills"] = 400;
    a.moniker = "named";
    a.owned.push("weapon:directive");
    const r = rewrite(a);
    expect(r).toEqual({ ok: true, wakelight: REWRITE_WAKELIGHT });
    expect(a.depth).toBe(1);
    expect(a.xp).toBe(0);
    expect(a.wallet.scrip).toBe(0);
    expect(a.owned.every((id) => id.startsWith("weapon:"))).toBe(true); // campaign weapon unlocks are earned, not bought
    expect(a.owned).toContain("weapon:directive");
    expect(a.stamps).toContain("first_kill:lease_breaker");
    expect(a.counters["kills"]).toBe(400);
    expect(a.counters["rewrites"]).toBe(1);
    expect(a.moniker).toBe("named");
    expect(a.mastery.lease_breaker.rank).toBe(1);
    expect(a.wallet.wakelight).toBe(REWRITE_WAKELIGHT);
    expect(a.ledger.some((l) => l.startsWith("REWRITE 1"))).toBe(true);
    expect(canRewrite(a).ok).toBe(false);
    // the shop
    expect(COSMETICS.filter((c) => c.kind === "theme").length).toBe(4);
    expect(slotsOf(a)).toEqual({ aliases: 1, presets: 1 });
    expect(buyCosmetic(a, "preset_3").ok).toBe(false); // slot 2 first
    expect(buyCosmetic(a, "preset_2").ok).toBe(true);
    expect(buyCosmetic(a, "preset_3").ok).toBe(true);
    expect(slotsOf(a).presets).toBe(3);
    expect(buyCosmetic(a, "theme_amber").ok).toBe(true);
    expect(buyCosmetic(a, "theme_amber")).toEqual({ ok: false, reason: "already owned" });
    expect(setTheme(a, "theme_ice")).toBe(false);
    expect(setTheme(a, "theme_amber")).toBe(true);
    expect(a.wallet.wakelight).toBe(REWRITE_WAKELIGHT - 60 - 90 - 120);
    expect(buyCosmetic(a, "theme_bloodline").ok).toBe(false); // 230 left, needs 300
    expect(savePreset(a, 3, "docks kit", { primary: "longwave" }).ok).toBe(true);
    expect(savePreset(a, 4, "x", {}).ok).toBe(false);
    expect(a.presets![2]).toEqual({ name: "DOCKS KIT", loadout: { primary: "longwave" } });
    expect(setAlias(a, 1, "the breaker").ok).toBe(true);
    expect(setAlias(a, 2, "x").ok).toBe(false);
    expect(a.aliases).toEqual(["THE BREAKER"]);
  });
});

// ---- the room: an Audit playlist's rules at join, scores at settlement, the Deep Wake push ----
import { Room, type Conn } from "../server/room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { MemoryEndgameStore } from "../server/endgame";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";
import { SIM_HZ } from "../shared/sim/constants";

describe("room — audits and the Deep Wake", () => {
  const fake = () => {
    const msgs: ReturnType<typeof decodeServerMessage>[] = [];
    const conn: Conn = { send: (buf) => void msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
    return { conn, msgs, kick: () => msgs.find((m) => m?.type === "kick") as { type: "kick"; reason: string } | undefined, welcome: () => msgs.find((m) => m?.type === "welcome") as { type: "welcome"; mode: string } | undefined };
  };
  const join = (room: Room, name: string, account: string, loadout: unknown) => {
    const c = fake();
    room.onOpen(c.conn);
    room.onMessage(c.conn, encodeJoin(name, "", account, JSON.stringify(loadout), ""));
    return c;
  };
  it("refuses what the playlist bans, names the playlist in the Welcome, runs its gravity and sheet, scores the round to the board and pushes the flips to the season", () => {
    const store = new MemoryAccountStore(devSeed);
    const eg = new MemoryEndgameStore();
    const pellet = AUDITS.find((x) => x.id === "pellet_week")!;
    store.load("sandbox-a", "A").campaign = { faction: "cells", testimony: {}, missionsDone: [], gigsDone: [], protocols: [], worn: [], weapons: [], ending: null };
    const room = new Room({ ai: false, seed: 3, level: "lease_row", accounts: store, endgame: eg, audit: { week: 7, def: pellet }, warmupSeconds: 0.5, roundSeconds: 5 });
    const bad = join(room, "BAD", "sandbox-b", { primary: "lease_breaker", secondary: "shock_baton", attested: [] });
    expect(bad.kick()?.reason).toMatch(/audit-weapon/);
    const a = join(room, "A", "sandbox-a", { primary: "repo_hammer", secondary: "clockeater", attested: [] });
    // a Depth-1 file cannot hold the hammer at all (weapon-depth), so B is a Depth-10 "rich" file
    const b = join(room, "B", "rich-b", { primary: "repo_hammer", secondary: "shock_baton", attested: [] });
    expect(a.kick()).toBeUndefined();
    expect(b.kick()).toBeUndefined();
    expect(a.welcome()?.mode).toBe("audit:pellet_week:7");
    expect(room.world.gravityMult).toBe(pellet.gravityMult);
    // a sheet playlist: GLASS puts the shield to zero for everyone
    const glass = AUDITS.find((x) => x.id === "glass")!;
    const room2 = new Room({ ai: false, seed: 3, level: "lease_row", accounts: store, endgame: eg, audit: { week: 8, def: glass } });
    join(room2, "G", "sandbox-g", { primary: "lease_breaker", secondary: "shock_baton", attested: [] });
    const g = room2.world.players.get(1)!;
    expect(g.maxShield).toBe(0);
    expect(g.mods.moveSpeed).toBeCloseTo(1.2);
    // A stands on B for the round: the settlement scores both files and pushes the flips toward the cells
    const pa = room.world.players.get(1)!; // the banned join consumed no id: A is 1, B is 2
    const B = room.world.level.nodes.find((n) => n.label === "B")!.pos;
    pa.pos.x = B.x;
    pa.pos.z = B.z;
    for (let t = 0; t < SIM_HZ * 7; t++) {
      pa.pos.x = B.x;
      pa.pos.z = B.z;
      room.step();
    }
    const st = room.stats();
    expect((st.match as { phase: string }).phase).toBe("results");
    expect(st.audit?.scores.length).toBe(2);
    const board = eg.audit(7);
    expect(board.length).toBe(2);
    expect(board[0]!.score).toBeGreaterThanOrEqual(board[1]!.score);
    expect(store.accounts.get("sandbox-a")!.audits).toEqual({ week: 7, best: board.find((e) => e.account === "sandbox-a")!.score, played: 1 });
    const season = eg.season();
    expect(season.rounds).toBe(1);
    expect(season.districts["lease_row"]!["B"]!.pressure.cells).toBeGreaterThan(0);
    expect(st.seasonLast).toMatch(/LEASE ROW/);
  });
});
