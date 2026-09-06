/**
 * The burn side.
 *
 * `docs/TOKENOMICS.md` §4.4 publishes a burn ratio, and until Stage 19 that ratio counted a season
 * buyout whose contract had never been written — 79% of the burn in the table. These cases hold
 * both halves: the contracts do what the doc says (100% burned, cosmetics or a server back, never a
 * number the sim reads), and the model may only publish a ratio built from sinks that exist.
 */
import { describe, expect, it } from "vitest";
import { parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bootDevnetLedger, DEV_KEYS } from "../server/chain/boot";
import { ARTIFACTS } from "../server/chain/deploy";
import { DOC_POPULATION, project } from "../shared/economy/model";
import { ROOM_HOUR_PRICE, SEASON_PASS_PRICE, SINKS, isBuilt } from "../shared/economy/sinks";
import { SEASON_PASS_COSMETICS, SEASON_PASS_GRANTS, economyManifest } from "../shared/economy/catalog";
import { lintEconomy } from "../shared/economy/lint";

async function rig() {
  const b = await bootDevnetLedger({ onLog: () => {}, seedMarket: false });
  const player = privateKeyToAccount(DEV_KEYS.player);
  const relayer = privateKeyToAccount(DEV_KEYS.relayer);
  // gas for the player's own transactions; the sinks are bought by the player, not sponsored
  await b.devnet.fund(player.address);
  // the treasury funds the player so it has something to burn
  const fund = async (whole: number) => {
    const hash = await b.ledger.relayer.writeContract({ account: relayer, chain: b.ledger.chain, address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "transfer", args: [player.address, parseEther(String(whole))] });
    await b.pub.waitForTransactionReceipt({ hash });
  };
  const send = async (address: Hex, artifact: string, fn: string, args: unknown[]) => {
    const wal = b.ledger.relayer;
    const hash = await wal.writeContract({ account: player, chain: b.ledger.chain, address, abi: ARTIFACTS[artifact]!.abi, functionName: fn, args });
    return b.pub.waitForTransactionReceipt({ hash });
  };
  const read = <T,>(address: Hex, artifact: string, fn: string, args: unknown[] = []) => b.pub.readContract({ address, abi: ARTIFACTS[artifact]!.abi, functionName: fn, args }) as Promise<T>;
  /**
   * Did it revert? The devnet mines a failing transaction and reports `reverted` on the receipt
   * rather than throwing at send, so a bare `.rejects` would pass on a transaction that succeeded.
   */
  const reverts = async (p: Promise<{ status: string }>): Promise<boolean> => p.then((r) => r.status === "reverted", () => true);
  const steward = async (address: Hex, artifact: string, fn: string, args: unknown[]) => b.pub.waitForTransactionReceipt({ hash: await b.ledger.relayer.writeContract({ account: relayer, chain: b.ledger.chain, address, abi: ARTIFACTS[artifact]!.abi, functionName: fn, args }) });
  return { b, player, relayer, fund, send, read, reverts, steward };
}

describe("SeasonBuyout — the Deep Wake pass", () => {
  it("burns the fee in full: the buyer pays, the supply falls, nobody receives it", async () => {
    const r = await rig();
    await r.fund(1000);
    const supply0 = await r.read<bigint>(r.b.contracts.capital, "$CAPITAL", "totalSupply");
    const burned0 = await r.read<bigint>(r.b.contracts.capital, "$CAPITAL", "burned");
    const price = parseEther(String(SEASON_PASS_PRICE));

    await r.send(r.b.contracts.capital, "$CAPITAL", "approve", [r.b.contracts.buyout, price]);
    expect((await r.send(r.b.contracts.buyout, "SeasonBuyout", "buy", [7n, price])).status).toBe("success");

    expect(await r.read<boolean>(r.b.contracts.buyout, "SeasonBuyout", "holds", [7n, r.player.address])).toBe(true);
    expect(await r.read<bigint>(r.b.contracts.buyout, "SeasonBuyout", "burned")).toBe(price);
    // the whole fee left the supply rather than moving to a treasury
    expect(supply0 - (await r.read<bigint>(r.b.contracts.capital, "$CAPITAL", "totalSupply"))).toBe(price);
    expect((await r.read<bigint>(r.b.contracts.capital, "$CAPITAL", "burned")) - burned0).toBe(price);
    expect(await r.read<bigint>(r.b.contracts.buyout, "SeasonBuyout", "sold", [7n])).toBe(1n);
  }, 60_000);

  it("sells a season once, and only the season asked for", async () => {
    const r = await rig();
    await r.fund(2000);
    const price = parseEther(String(SEASON_PASS_PRICE));
    await r.send(r.b.contracts.capital, "$CAPITAL", "approve", [r.b.contracts.buyout, price * 4n]);
    await r.send(r.b.contracts.buyout, "SeasonBuyout", "buy", [7n, price]);
    expect(await r.reverts(r.send(r.b.contracts.buyout, "SeasonBuyout", "buy", [7n, price]))).toBe(true);
    // a different season is a different pass
    expect((await r.send(r.b.contracts.buyout, "SeasonBuyout", "buy", [8n, price])).status).toBe("success");
    expect(await r.read<boolean>(r.b.contracts.buyout, "SeasonBuyout", "holds", [9n, r.player.address])).toBe(false);
  }, 60_000);

  it("refuses a price the buyer did not agree to, so a retune cannot front-run a purchase", async () => {
    const r = await rig();
    await r.fund(2000);
    const price = parseEther(String(SEASON_PASS_PRICE));
    await r.send(r.b.contracts.capital, "$CAPITAL", "approve", [r.b.contracts.buyout, price * 4n]);
    // the steward doubles the price while a purchase at the old one is in flight
    await r.steward(r.b.contracts.buyout, "SeasonBuyout", "setPrice", [price * 2n]);
    expect(await r.reverts(r.send(r.b.contracts.buyout, "SeasonBuyout", "buy", [7n, price]))).toBe(true);
    // at the price it now is, it goes through
    expect((await r.send(r.b.contracts.buyout, "SeasonBuyout", "buy", [7n, price * 2n])).status).toBe("success");
  }, 60_000);

  it("lets nobody but the steward move the price or the role", async () => {
    const r = await rig();
    await r.b.devnet.fund(r.player.address);
    expect(await r.reverts(r.send(r.b.contracts.buyout, "SeasonBuyout", "setPrice", [1n]))).toBe(true);
    expect(await r.reverts(r.send(r.b.contracts.buyout, "SeasonBuyout", "setSteward", [r.player.address]))).toBe(true);
    // and the steward itself can, which is what makes the refusal meaningful
    expect((await r.steward(r.b.contracts.buyout, "SeasonBuyout", "setPrice", [parseEther("1")])).status).toBe("success");
  }, 60_000);
});

describe("RoomCredits — a server of your own, by the hour", () => {
  it("burns per hour and credits the buyer, and the host spends the credit down", async () => {
    const r = await rig();
    await r.fund(1000);
    const unit = parseEther(String(ROOM_HOUR_PRICE));
    const burned0 = await r.read<bigint>(r.b.contracts.capital, "$CAPITAL", "burned");

    await r.send(r.b.contracts.capital, "$CAPITAL", "approve", [r.b.contracts.rooms, unit * 10n]);
    expect((await r.send(r.b.contracts.rooms, "RoomCredits", "buy", [10n, unit])).status).toBe("success");
    expect(await r.read<bigint>(r.b.contracts.rooms, "RoomCredits", "hoursOf", [r.player.address])).toBe(10n);
    expect((await r.read<bigint>(r.b.contracts.capital, "$CAPITAL", "burned")) - burned0).toBe(unit * 10n);

    // the spender (the host; the treasury at deploy) draws an hour down when a room opens
    const room = `0x${"ab".repeat(32)}` as Hex;
    expect((await r.steward(r.b.contracts.rooms, "RoomCredits", "spend", [r.player.address, 3n, room])).status).toBe("success");
    expect(await r.read<bigint>(r.b.contracts.rooms, "RoomCredits", "hoursOf", [r.player.address])).toBe(7n);
  }, 60_000);

  it("refuses a spend by anyone but the host, and refuses to go negative", async () => {
    const r = await rig();
    await r.fund(1000);
    const unit = parseEther(String(ROOM_HOUR_PRICE));
    await r.send(r.b.contracts.capital, "$CAPITAL", "approve", [r.b.contracts.rooms, unit * 2n]);
    await r.send(r.b.contracts.rooms, "RoomCredits", "buy", [2n, unit]);
    const room = `0x${"cd".repeat(32)}` as Hex;
    // the player cannot spend its own credit: only the host opens a room
    expect(await r.reverts(r.send(r.b.contracts.rooms, "RoomCredits", "spend", [r.player.address, 1n, room]))).toBe(true);
    // and the host cannot spend more than the player bought
    expect(await r.reverts(r.steward(r.b.contracts.rooms, "RoomCredits", "spend", [r.player.address, 3n, room]))).toBe(true);
    expect(await r.read<bigint>(r.b.contracts.rooms, "RoomCredits", "hoursOf", [r.player.address])).toBe(2n);
  }, 60_000);

  it("refuses an absurd purchase rather than overflowing the fee", async () => {
    const r = await rig();
    await r.fund(10_000);
    const unit = parseEther(String(ROOM_HOUR_PRICE));
    expect(await r.reverts(r.send(r.b.contracts.rooms, "RoomCredits", "buy", [0n, unit]))).toBe(true);
    expect(await r.reverts(r.send(r.b.contracts.rooms, "RoomCredits", "buy", [1001n, unit]))).toBe(true);
    // 1000 is the edge, and it is allowed
    await r.send(r.b.contracts.capital, "$CAPITAL", "approve", [r.b.contracts.rooms, unit * 1000n]);
    expect((await r.send(r.b.contracts.rooms, "RoomCredits", "buy", [1000n, unit])).status).toBe("success");
  }, 60_000);
});

describe("what the pass may grant", () => {
  it("grants cosmetics only, and the lint refuses anything else", () => {
    const manifest = economyManifest();
    expect(SEASON_PASS_GRANTS.length).toBeGreaterThan(0);
    for (const id of SEASON_PASS_GRANTS) {
      const item = manifest.find((i) => i.id === id);
      expect(item, `${id} is granted but not in the manifest`).toBeDefined();
      expect(item!.mechanical, `${id} carries a mechanical block`).toBeNull();
      // and not on chain: a pass that minted a tradable token would make the biggest sink a market
      expect(item!.market).toBeNull();
    }
    expect(lintEconomy(manifest)).toEqual([]);
  });

  it("would fail the lint if a grant ever carried a stat", () => {
    const manifest = economyManifest();
    const i = manifest.findIndex((x) => x.id === SEASON_PASS_COSMETICS[0]!.id);
    const bad = [...manifest];
    bad[i] = { ...bad[i]!, market: { capital: 400, onChain: true, tradable: true, randomness: "none" }, mechanical: { benefits: [{ stat: "damage", delta: 5 }], costs: [] } };
    expect(lintEconomy(bad).some((v) => v.rule === "no-paid-power")).toBe(true);
  });
});

describe("the published burn ratio counts only what exists", () => {
  it("the model's total is built sinks; the rest is reported separately", () => {
    const r = project(DOC_POPULATION);
    const built = SINKS.filter((s) => s.built).map((s) => s.id);
    const unbuilt = SINKS.filter((s) => !s.built).map((s) => s.id);
    expect(built).toContain("buyout"); // built in this stage — the reason the ratio is now honest
    expect(unbuilt).toContain("forge");
    expect(r.sinks.total).toBe(r.sinks.names + r.sinks.market + r.sinks.buyout + r.sinks.rooms);
    expect(r.sinks.specified).toBe(r.sinks.forge);
    expect(r.burnRatioSpecified).toBeGreaterThan(r.burnRatio);
  });

  it("meets the doc's month-12 target on built sinks alone", () => {
    expect(project(DOC_POPULATION).burnRatio).toBeGreaterThan(0.6);
  });

  it("would not, if the season buyout were still unbuilt — which is what the old table was claiming", () => {
    // the same arithmetic with the buyout excluded: 79% of the burn was one unwritten contract
    const r = project(DOC_POPULATION);
    const withoutBuyout = (r.sinks.total - r.sinks.buyout) / r.settled.total;
    expect(withoutBuyout).toBeLessThan(0.2);
  });

  it("every sink marked built names a contract that compiles", () => {
    const CONTRACT_OF: Record<string, string | null> = { buyout: "SeasonBuyout", rooms: "RoomCredits", names: "Names", market: "LedgerMarket", forge: "Forge" };
    for (const s of SINKS) {
      const name = CONTRACT_OF[s.id];
      expect(name, `${s.id} has no contract mapping`).toBeTruthy();
      // `built: true` is a claim about an artifact, so check the artifact
      expect(Boolean(ARTIFACTS[name!]), `${s.id} claims built: ${s.built}`).toBe(s.built);
      expect(isBuilt(s.id)).toBe(s.built);
    }
  });
});
