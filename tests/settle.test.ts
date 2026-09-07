/**
 * The nightly settlement, end to end against a real EVM.
 *
 * Stage 17 built the arithmetic; this is the job that runs it unattended every night, which means
 * the interesting cases are not the happy path but the ones nobody watches: a day settled twice, a
 * post that reverts, a file with no wallet, a quiet day, a file that banked again after the day it
 * is being paid for. Money that moves on a cron needs its failure modes pinned harder than money a
 * player clicks for.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { bootDevnetLedger, DEV_KEYS } from "../server/chain/boot";
import { ARTIFACTS } from "../server/chain/deploy";
import { settleRunDay } from "../server/chain/settle-run";
import { reconcileRunDay } from "../server/chain/reconcile-run";
import { MemoryRunStore } from "../server/run-store";
import { EPOCH_BASE } from "../server/chain/prizes-store";
import { MemoryAccountStore, devSeed } from "../server/accounts";
import { SIWE_STATEMENT } from "../shared/economy/counter";
import { runPot } from "../shared/economy/settlement";
import { MAX_CAPITAL_PER_UNIT, RUN_DAILY_CAP } from "../shared/sim/run";
import type { Account } from "../shared/progression/account";

const DAY = 5150;

/** A booted devnet, a store of files, and a run store — the shape the cron sees. */
async function rig() {
  const runs = new MemoryRunStore();
  // the ledger shares it: the direct withdrawal must spend out of the same store the night reads
  const b = await bootDevnetLedger({ runs, onLog: () => {}, seedMarket: false });
  const store = new MemoryAccountStore(devSeed);
  const logs: string[] = [];
  const deps = { ledger: b.ledger, runs, load: (id: string) => store.load(id, "BLANK"), save: (a: Account) => store.save(a), log: (l: string) => logs.push(l) };
  const recon = { ...deps, wallets: b.wallets };
  const link = async (id: string, key: `0x${string}`) => {
    const a = store.load(id, id.toUpperCase());
    const w = privateKeyToAccount(key);
    const message = createSiweMessage({ address: w.address, chainId: b.devnet.chainId, domain: "127.0.0.1", nonce: await b.ledger.nonce(a.id), uri: "http://127.0.0.1/", version: "1", statement: SIWE_STATEMENT });
    expect((await b.ledger.link(a, message, await w.signMessage({ message }))).ok).toBe(true);
    return { a, w };
  };
  const bank = (a: Account, units: number, day = DAY) => {
    runs.add(day, a.id, units);
    a.counter = { ...a.counter!, run: { day, banked: units, owed: (a.counter!.run?.owed ?? 0) + units, paid: a.counter!.run?.paid ?? 0 } };
    store.save(a);
  };
  const balance = (addr: `0x${string}`) => b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "balanceOf", args: [addr] }) as Promise<bigint>;
  return { b, store, runs, deps, recon, logs, link, bank, balance };
}

describe("the nightly settlement", () => {
  it("settles a day, posts it as an epoch, and spends the units it paid for", async () => {
    const r = await rig();
    const { a, w } = await r.link("sandbox-s1", DEV_KEYS.player);
    r.bank(a, 40);
    const s = await settleRunDay(DAY, r.deps);

    expect(s.ok).toBe(true);
    expect(s.units).toBe(40);
    expect(s.rate).toBe(MAX_CAPITAL_PER_UNIT); // one file: nowhere near the crossover
    expect(s.minted).toBe(40);
    expect(s.epoch).toBe(EPOCH_BASE.run + DAY);
    expect(s.paid).toBe(1);
    expect(s.stranded).toEqual([]);
    // the units are spent, and `paid` records the $CAPITAL rather than the units
    const after = r.store.accounts.get("sandbox-s1")!;
    expect(after.counter!.run!.owed).toBe(0);
    expect(after.counter!.run!.paid).toBe(40);
    // and the epoch is claimable for exactly that
    const before = await r.balance(w.address);
    expect((await r.b.ledger.claimPrize(after, s.epoch!)).ok).toBe(true);
    expect((await r.balance(w.address)) - before).toBe(40n * 10n ** 18n);
  }, 60_000);

  it("refuses to settle the same day twice — the cron may fire again and must cost nothing", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-s2", DEV_KEYS.player);
    r.bank(a, 25);
    expect((await settleRunDay(DAY, r.deps)).ok).toBe(true);
    const again = await settleRunDay(DAY, r.deps);
    expect(again.ok).toBe(false);
    expect(again.reason).toMatch(/already settled/);
    expect(again.minted).toBe(0);
    // and the file's units are not spent a second time
    expect(r.store.accounts.get("sandbox-s2")!.counter!.run!.paid).toBe(25);
  }, 60_000);

  it("refuses a day whose epoch is already on chain, even if the store forgot", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-s3", DEV_KEYS.player);
    r.bank(a, 10);
    expect((await settleRunDay(DAY, r.deps)).ok).toBe(true);
    // a restored-from-backup store that lost its settled row still cannot pay twice
    r.runs.settlements.clear();
    const again = await settleRunDay(DAY, r.deps);
    expect(again.ok).toBe(false);
    expect(again.reason).toMatch(/already has an epoch/);
  }, 60_000);

  it("marks a quiet day settled rather than retrying it forever", async () => {
    const r = await rig();
    const s = await settleRunDay(DAY, r.deps);
    expect(s.ok).toBe(true);
    expect(s.units).toBe(0);
    expect(s.epoch).toBeUndefined(); // nothing was posted: there was nothing to post
    expect(r.runs.settled(DAY)).not.toBeNull();
    expect((await settleRunDay(DAY, r.deps)).reason).toMatch(/already settled/);
  }, 60_000);

  it("names a file that banked but has no wallet, and does not spend its units", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-s5", DEV_KEYS.player);
    r.bank(a, 30);
    const orphan = r.store.load("sandbox-orphan", "ORPHAN");
    orphan.counter = { address: null, linkedAt: 0, ghostfile: 0, stamps: [], name: null, rig: [], worn: 0, capital: "0", run: { day: DAY, banked: 20, owed: 20, paid: 0 } };
    r.store.save(orphan);
    r.runs.add(DAY, orphan.id, 20);

    const s = await settleRunDay(DAY, r.deps);
    expect(s.ok).toBe(true);
    expect(s.units).toBe(50); // the orphan's units still count toward the day's split
    expect(s.skipped).toContain("sandbox-orphan");
    expect(s.paid).toBe(1);
    // it keeps what it is owed: linking a wallet later must not have cost it the day
    expect(r.store.accounts.get("sandbox-orphan")!.counter!.run!.owed).toBe(20);
  }, 60_000);

  it("spends only the units the settled day paid for, not what a file banked afterwards", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-s6", DEV_KEYS.player);
    r.bank(a, 30);
    // the file plays again the next day before the cron gets to yesterday
    a.counter = { ...a.counter!, run: { day: DAY + 1, banked: 15, owed: 45, paid: 0 } };
    r.store.save(a);

    const s = await settleRunDay(DAY, r.deps);
    expect(s.ok).toBe(true);
    expect(s.minted).toBe(30);
    // 45 owed minus the 30 yesterday paid for: today's 15 survive to be settled tomorrow
    expect(r.store.accounts.get("sandbox-s6")!.counter!.run!.owed).toBe(15);
  }, 60_000);

  it("splits a day that outgrows its pot pro rata, and never mints past it", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-s7", DEV_KEYS.player);
    r.bank(a, 200);
    // the rest of the population. Each file is held to the day's cap by the settlement itself, so
    // outgrowing the pot takes files, not one huge number — which is the anti-bot cap working.
    const files = Math.ceil((runPot(DAY) / RUN_DAILY_CAP) * 2);
    for (let i = 0; i < files; i++) r.runs.add(DAY, `crowd-${i}`, RUN_DAILY_CAP);

    const s = await settleRunDay(DAY, r.deps);
    expect(s.ok).toBe(true);
    expect(s.rate).toBeLessThan(MAX_CAPITAL_PER_UNIT);
    expect(s.minted).toBeLessThanOrEqual(s.pot);
    // the linked file is paid its share of the day, not its unit count
    const paid = r.store.accounts.get("sandbox-s7")!.counter!.run!.paid;
    expect(paid).toBeLessThan(200);
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeCloseTo(200 * s.rate, 5);
  }, 60_000);

  it("does not spend a file's units when the epoch could not be posted", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-s8", DEV_KEYS.player);
    r.bank(a, 12);
    // a ledger whose post fails: the money never moved, so neither may the units
    const broken = { ...r.deps, ledger: { ...r.b.ledger, epoch: () => Promise.resolve(null), postEpoch: () => Promise.resolve({ ok: false, reason: "post reverted" }) } as unknown as typeof r.b.ledger };
    const s = await settleRunDay(DAY, broken);
    expect(s.ok).toBe(false);
    expect(s.reason).toBe("post reverted");
    expect(r.store.accounts.get("sandbox-s8")!.counter!.run!.owed).toBe(12);
    // and the day is not marked settled, so the next cron retries it
    expect(r.runs.settled(DAY)).toBeNull();
    expect((await settleRunDay(DAY, r.deps)).ok).toBe(true);
  }, 60_000);
  it("a direct withdrawal spends the day's units, so the night does not pay for them again", async () => {
    const r = await rig();
    const { a, w } = await r.link("sandbox-s9", DEV_KEYS.player);
    r.bank(a, 50);
    const before = await r.balance(w.address);
    // the player does not wait for the night
    const pay = await r.b.ledger.payout(a);
    expect(pay.ok).toBe(true);
    expect((await r.balance(w.address)) - before).toBe(50n * 10n ** 18n);
    r.store.save(a);

    const s = await settleRunDay(DAY, r.deps);
    expect(s.ok).toBe(true);
    expect(s.units).toBe(0); // the units are gone: they were paid for
    expect(s.minted).toBe(0);
    // 50 $CAPITAL left the treasury, once
    expect((await r.balance(w.address)) - before).toBe(50n * 10n ** 18n);
    expect(r.store.accounts.get("sandbox-s9")!.counter!.run!.paid).toBe(50);
  }, 60_000);

  it("and the guard runs the other way too: a settled day cannot then be withdrawn", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-s10", DEV_KEYS.player);
    r.bank(a, 50);
    expect((await settleRunDay(DAY, r.deps)).ok).toBe(true);
    // a file that banked again after the settlement still cannot withdraw the settled day
    const after = r.store.accounts.get("sandbox-s10")!;
    after.counter = { ...after.counter!, run: { ...after.counter!.run!, owed: 5 } };
    const pay = await r.b.ledger.payout(after);
    expect(pay.ok).toBe(false);
    expect(pay.reason).toMatch(/settled/);
  }, 60_000);
});

describe("reconciling the two records", () => {
  /**
   * A file's `owed` and its `run_day` row are written by different paths and neither write can be
   * made atomic with the other. Both failures are logged; neither is self-healing. These are the
   * two shapes, and they fail in opposite directions.
   */
  it("finds units the banking table lost, and restores them so the night pays after all", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-r1", DEV_KEYS.player);
    // the bank reached the file and the D1 write did not
    a.counter = { ...a.counter!, run: { day: DAY, banked: 35, owed: 35, paid: 0 } };
    r.store.save(a);

    const report = await reconcileRunDay(DAY, r.recon);
    expect(report.drift).toHaveLength(1);
    expect(report.drift[0]).toMatchObject({ file: "sandbox-r1", kind: "unrecorded", units: 35, recorded: 0, fixed: false });
    expect(report.restored).toBe(0); // a report changes nothing

    const fixed = await reconcileRunDay(DAY, r.recon, { fix: true });
    expect(fixed.restored).toBe(35);
    expect(fixed.drift[0]!.fixed).toBe(true);
    // and now the night pays them
    const s = await settleRunDay(DAY, r.deps);
    expect(s.units).toBe(35);
    expect(r.store.accounts.get("sandbox-r1")!.counter!.run!.paid).toBe(35);
  }, 60_000);

  it("frees a file stranded by a settlement that posted but could not clear it", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-r2", DEV_KEYS.player);
    r.bank(a, 20);
    const s = await settleRunDay(DAY, r.deps);
    expect(s.ok).toBe(true);
    // the epoch was posted and the clear failed: the units are paid for and still owed on the file
    const after = r.store.accounts.get("sandbox-r2")!;
    after.counter = { ...after.counter!, run: { ...after.counter!.run!, owed: 20, paid: 0 } };
    r.store.save(after);
    // and now unpayable in both directions
    expect((await r.b.ledger.payout(after)).reason).toMatch(/settled/);

    const report = await reconcileRunDay(DAY, r.recon, { fix: true });
    expect(report.settled).toBe(true);
    expect(report.drift[0]).toMatchObject({ file: "sandbox-r2", kind: "stranded", units: 20, fixed: true });
    expect(report.cleared).toBe(20);
    const done = r.store.accounts.get("sandbox-r2")!;
    expect(done.counter!.run!.owed).toBe(0);
    expect(done.counter!.run!.paid).toBe(20);
    // the money was always there: the epoch still pays it
    expect((await r.b.ledger.claimPrize(done, s.epoch!)).ok).toBe(true);
  }, 60_000);

  it("says nothing about a day that agrees with itself", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-r3", DEV_KEYS.player);
    r.bank(a, 12);
    const report = await reconcileRunDay(DAY, r.recon, { fix: true });
    expect(report.drift).toEqual([]);
    expect(report.checked).toBeGreaterThan(0);
    expect(report.settled).toBe(false);
  }, 60_000);

  it("walks every linked file, not only the ones the table happens to know about", async () => {
    const r = await rig();
    await r.link("sandbox-r4", DEV_KEYS.player);
    // a file with no banking at all must not be reported, and must still be walked
    const report = await reconcileRunDay(DAY, r.recon);
    expect(report.checked).toBe(1);
    expect(report.drift).toEqual([]);
  }, 60_000);
});

describe("epochs nobody claimed", () => {
  it("cannot be swept before the vault's own deadline", async () => {
    const r = await rig();
    const { a } = await r.link("sandbox-r5", DEV_KEYS.player);
    r.bank(a, 15);
    const s = await settleRunDay(DAY, r.deps);
    const swept = await r.b.ledger.reclaimEpoch(s.epoch!);
    expect(swept.ok).toBe(false);
    expect(swept.reason).toMatch(/too early|reverted/i);
    // the deadline is the contract's, not the caller's, so the epoch is still claimable
    expect((await r.b.ledger.claimPrize(r.store.accounts.get("sandbox-r5")!, s.epoch!)).ok).toBe(true);
  }, 60_000);

  it("refuses an epoch that was never posted", async () => {
    const r = await rig();
    expect((await r.b.ledger.reclaimEpoch(123_456)).reason).toMatch(/no epoch/);
  }, 60_000);
});
