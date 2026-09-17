/**
 * The schedule on the chain (Stage 59).
 *
 * The settlement's arithmetic bounds what a day pays; until this stage nothing on the chain did, so
 * a poster key — leaked, or fed a wrong tree — could fund an epoch with whatever the relayer's
 * allowance held. The vault now carries the same schedule the settlement uses, per channel per
 * year, and refuses a post over it before a token is drawn. These cases hold the contract to the
 * model, and the model to the calendar.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createWalletClient, defineChain, encodeDeployData, formatEther, parseEther, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bootDevnetLedger, DEV_KEYS } from "../server/chain/boot";
import { ARTIFACTS } from "../server/chain/deploy";
import { buildEpoch } from "../server/chain/merkle";
import { EPOCH_BASE } from "../server/chain/prizes-store";
import { channelCaps, channelParams, EPOCH_KIND, epochCap, KIND_SPAN, kindOf, PERIOD_DAYS } from "../shared/economy/schedule";
import { emissionSchedule, LAUNCH_DAY, RUN_EMISSION_SHARE } from "../shared/economy/model";
import { runPot } from "../shared/economy/settlement";
import { AUDIT_POOL, auditPrizes, SEASON_POOL, seasonPrizes } from "../shared/economy/prizes";
import { MemoryAccountStore, devSeed } from "../server/accounts";
import { createSiweMessage } from "viem/siwe";
import { SIWE_STATEMENT } from "../shared/economy/counter";

type Boot = Awaited<ReturnType<typeof bootDevnetLedger>>;
const relayer = privateKeyToAccount(DEV_KEYS.relayer);
const treasury = privateKeyToAccount(DEV_KEYS.treasury);
const player = privateKeyToAccount(DEV_KEYS.player);
const wei = (n: number) => BigInt(n) * 10n ** 18n;

describe("the model's side of the schedule", () => {
  it("names the channels the way the epoch ids do", () => {
    expect(EPOCH_BASE).toEqual({ audit: 1 * KIND_SPAN, season: 2 * KIND_SPAN, run: 3 * KIND_SPAN });
    expect(kindOf(EPOCH_BASE.run + 5)).toBe("run");
    expect(kindOf(EPOCH_BASE.audit + 5)).toBe("audit");
    expect(kindOf(9 * KIND_SPAN)).toBeNull();
  });

  it("THE RUN's cap is the day's pot, rounded up, in the day's schedule year; the boards' caps are their pools", () => {
    for (const day of [LAUNCH_DAY, LAUNCH_DAY + 364, LAUNCH_DAY + 365, LAUNCH_DAY + 3 * 365 + 7, LAUNCH_DAY + 20 * 365, 5150]) {
      expect(epochCap("run", day), `day ${day}`).toBe(Math.ceil(runPot(day)));
      expect(epochCap("run", day)).toBeGreaterThanOrEqual(runPot(day));
    }
    expect(channelCaps("run")).toEqual(emissionSchedule().map((y) => Math.ceil((y / 365) * RUN_EMISSION_SHARE)));
    expect(channelCaps("audit")).toEqual([AUDIT_POOL]);
    expect(channelCaps("season")).toEqual([SEASON_POOL]);
    expect(epochCap("audit", 3000)).toBe(AUDIT_POOL);
    expect(epochCap("season", 740)).toBe(SEASON_POOL);
  });

  it("what the game posts never exceeds what the chain allows", () => {
    const board = Array.from({ length: 500 }, (_, i) => ({ account: `f${i}`, score: 1000 - i }));
    expect(auditPrizes(board).reduce((a, l) => a + l.amount, 0)).toBeLessThanOrEqual(AUDIT_POOL);
    const contributors = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f${i}`, 1 + (i % 7)]));
    expect(seasonPrizes(contributors).reduce((a, l) => a + l.amount, 0)).toBeLessThanOrEqual(SEASON_POOL);
  });
});

describe("the vault's side of the schedule", () => {
  let b: Boot;
  let wal: WalletClient;
  let chain: ReturnType<typeof defineChain>;
  const read = <T>(functionName: string, args: unknown[] = []) => b.pub.readContract({ address: b.contracts.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName, args }) as Promise<T>;
  const balance = (addr: Hex) => b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "balanceOf", args: [addr] }) as Promise<bigint>;
  const send = async (address: Hex, artifact: string, functionName: string, args: unknown[], account = relayer) => {
    const hash = await wal.writeContract({ account, chain, address, abi: ARTIFACTS[artifact]!.abi, functionName, args });
    return b.pub.waitForTransactionReceipt({ hash });
  };
  const simulate = (functionName: string, args: unknown[], account = relayer) => b.pub.simulateContract({ address: b.contracts.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName, args, account });

  beforeAll(async () => {
    b = await bootDevnetLedger({ onLog: () => {}, seedMarket: false });
    chain = defineChain({ id: b.devnet.chainId, name: "devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } });
    wal = createWalletClient({ chain, transport: b.transport, account: relayer });
    await b.devnet.fund(treasury.address);
  }, 90_000);

  it("carries the model's numbers: the same launch day, and the same cap for every kind of epoch on every kind of day", async () => {
    expect(await read<bigint>("launchDay")).toBe(BigInt(LAUNCH_DAY));
    expect(await read<bigint>("KIND_SPAN")).toBe(BigInt(KIND_SPAN));
    const ch = channelParams();
    for (const [i, kind] of (Object.keys(EPOCH_KIND) as (keyof typeof EPOCH_KIND)[]).entries()) {
      const [periodDays, caps] = await read<[bigint, bigint[]]>("channel", [ch.kinds[i]]);
      expect(periodDays).toBe(BigInt(PERIOD_DAYS[kind]));
      expect(caps).toEqual(ch.caps[i]);
    }
    for (const day of [LAUNCH_DAY, LAUNCH_DAY + 364, LAUNCH_DAY + 365, LAUNCH_DAY + 7 * 365 + 2, LAUNCH_DAY + 30 * 365, 5150, 0]) {
      expect(await read<bigint>("capOf", [BigInt(EPOCH_BASE.run + day)]), `run day ${day}`).toBe(wei(epochCap("run", day)));
    }
    for (const week of [0, Math.floor(LAUNCH_DAY / 7), Math.floor(LAUNCH_DAY / 7) + 60]) expect(await read<bigint>("capOf", [BigInt(EPOCH_BASE.audit + week)])).toBe(wei(epochCap("audit", week)));
    for (const season of [0, Math.floor(LAUNCH_DAY / 28) + 3]) expect(await read<bigint>("capOf", [BigInt(EPOCH_BASE.season + season)])).toBe(wei(epochCap("season", season)));
  }, 60_000);

  it("refuses a post over the cap before a token is drawn, and an epoch of no channel at all", async () => {
    await send(b.contracts.capital, "$CAPITAL", "transfer", [relayer.address, parseEther("2000")], treasury);
    await send(b.contracts.capital, "$CAPITAL", "approve", [b.contracts.vault, parseEther("1000000")]);
    const week = Math.floor(LAUNCH_DAY / 7) + 1;
    const epoch = BigInt(EPOCH_BASE.audit + week);
    const over = buildEpoch(Number(epoch), [{ account: player.address, amount: wei(AUDIT_POOL + 1) }]);
    const before = { relayer: await balance(relayer.address), vault: await balance(b.contracts.vault) };
    await expect(simulate("post", [epoch, over.root, wei(AUDIT_POOL + 1)])).rejects.toThrow(/OverSchedule/);
    expect(await balance(relayer.address)).toBe(before.relayer);
    expect(await balance(b.contracts.vault)).toBe(before.vault);
    // exactly the cap is allowed
    const at = buildEpoch(Number(epoch), [{ account: player.address, amount: wei(AUDIT_POOL) }]);
    expect((await send(b.contracts.vault, "PrizeVault", "post", [epoch, at.root, wei(AUDIT_POOL)])).status).toBe("success");
    expect((await balance(b.contracts.vault)) - before.vault).toBe(wei(AUDIT_POOL));
    // a kind no channel was set for cannot be posted at all
    await expect(simulate("post", [BigInt(9 * KIND_SPAN + 1), at.root, 1n])).rejects.toThrow(/NoChannel/);
    await expect(read("capOf", [BigInt(9 * KIND_SPAN + 1)])).rejects.toThrow(/NoChannel/);
  }, 60_000);

  it("the poster cannot move the cap; the treasury can", async () => {
    const kind = BigInt(EPOCH_KIND.audit);
    await expect(simulate("setChannel", [kind, 7n, [wei(10)]])).rejects.toThrow(/NotTreasury/);
    expect((await send(b.contracts.vault, "PrizeVault", "setChannel", [kind, 7n, [wei(10)]], treasury)).status).toBe("success");
    expect(await read<bigint>("capOf", [BigInt(EPOCH_BASE.audit + 5)])).toBe(wei(10));
    await expect(simulate("setChannel", [kind, 7n, []], treasury)).rejects.toThrow(/NoChannel/);
    // put it back for the ledger case below
    expect((await send(b.contracts.vault, "PrizeVault", "setChannel", [kind, 7n, [wei(AUDIT_POOL)]], treasury)).status).toBe("success");
  }, 60_000);

  it("the ledger names an over-schedule post as a refusal and draws nothing, rather than paying for a revert", async () => {
    const store = new MemoryAccountStore(devSeed);
    const a = store.load("sandbox-sched", "S");
    const message = createSiweMessage({ address: player.address, chainId: b.devnet.chainId, domain: "127.0.0.1", nonce: await b.ledger.nonce(a.id), uri: "http://127.0.0.1/", version: "1", statement: SIWE_STATEMENT });
    expect((await b.ledger.link(a, message, await player.signMessage({ message }))).ok).toBe(true);
    const before = await balance(relayer.address);
    const r = await b.ledger.postEpoch("season", Math.floor(LAUNCH_DAY / 28) + 9, [{ account: a.id, amount: SEASON_POOL + 1, reason: "DEEP WAKE CONTRIBUTION" }]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/over the schedule's cap/);
    expect(r.reason).toContain(formatEther(wei(SEASON_POOL)));
    expect(await balance(relayer.address)).toBe(before);
    // and the same post at the pool goes through
    expect((await b.ledger.postEpoch("season", Math.floor(LAUNCH_DAY / 28) + 9, [{ account: a.id, amount: SEASON_POOL, reason: "DEEP WAKE CONTRIBUTION" }])).ok).toBe(true);
  }, 60_000);
});
