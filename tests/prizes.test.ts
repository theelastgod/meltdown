import { describe, expect, it, beforeAll } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { parseEther } from "viem";
import { buildEpoch, leafHash, verifyProof } from "../server/chain/merkle";
import { auditPrizes, seasonPrizes, AUDIT_POOL, SEASON_POOL, SEASON_CAP_SHARE } from "../shared/economy/prizes";
import { applyRound, emptySeason, SEASON_DEPTH } from "../shared/endgame/season";
import { bootDevnetLedger, DEV_KEYS } from "../server/chain/boot";
import { ARTIFACTS } from "../server/chain/deploy";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { SIWE_STATEMENT } from "../shared/economy/counter";
import { Room, type Conn } from "../server/room";
import { MemoryEndgameStore } from "../server/endgame";
import { AUDITS } from "../shared/endgame/audits";
import { encodeJoin } from "../shared/net/protocol";
import { SIM_HZ } from "../shared/sim/constants";

describe("the prize maths", () => {
  it("the Audit pays the top 10% on a 1/rank curve, at least one; the season pays by sqrt share, capped", () => {
    const board = Array.from({ length: 25 }, (_, i) => ({ account: `f${i}`, score: 1000 - i * 10 }));
    const a = auditPrizes(board);
    expect(a.length).toBe(2);
    expect(a[0]!.account).toBe("f0");
    expect(a[0]!.amount).toBeGreaterThan(a[1]!.amount);
    expect(a[0]!.amount + a[1]!.amount).toBeLessThanOrEqual(AUDIT_POOL);
    expect(auditPrizes([{ account: "only", score: 1 }])[0]!.amount).toBe(AUDIT_POOL);
    const s = seasonPrizes({ whale: 400, a: 4, b: 4 });
    const whale = s.find((x) => x.account === "whale")!;
    expect(whale.amount).toBe(Math.floor(SEASON_POOL * SEASON_CAP_SHARE));
    expect(s.reduce((x, y) => x + y.amount, 0)).toBeLessThanOrEqual(SEASON_POOL);
    expect(seasonPrizes({})).toEqual([]);
  });
  it("the season records contributions per file and the room gates them at Depth 15", () => {
    const st = emptySeason(7);
    applyRound(st, { level: "lease_row", flips: [], winners: [], contributors: { a: 3, b: 0 } }, 0);
    applyRound(st, { level: "lease_row", flips: [], winners: [], contributors: { a: 2, c: 1 } }, 0);
    expect(st.contributors).toEqual({ a: 5, c: 1 });
    const store = new MemoryAccountStore(devSeed);
    const eg = new MemoryEndgameStore();
    const room = new Room({ ai: false, seed: 3, level: "lease_row", accounts: store, endgame: eg, audit: { week: 9, def: AUDITS[0]! }, warmupSeconds: 0.5, roundSeconds: 4 });
    const conn: Conn = { send: () => {}, close: () => {} };
    room.onOpen(conn);
    room.onMessage(conn, encodeJoin("A", "", "sandbox-season", JSON.stringify({ primary: "repo_hammer", secondary: "clockeater", attested: [] }), ""));
    const conn2: Conn = { send: () => {}, close: () => {} };
    room.onOpen(conn2);
    room.onMessage(conn2, encodeJoin("B", "", "fresh-season", JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] }), ""));
    const B = room.world.level.nodes.find((n) => n.label === "B")!.pos;
    for (let t = 0; t < SIM_HZ * 6; t++) {
      const p = room.world.players.get(1)!;
      p.pos.x = B.x;
      p.pos.z = B.z;
      room.step();
    }
    expect(store.accounts.get("sandbox-season")!.depth).toBeGreaterThanOrEqual(SEASON_DEPTH);
    expect(eg.season().contributors["sandbox-season"]).toBeGreaterThan(0);
    expect(eg.season().contributors["fresh-season"]).toBeUndefined();
  });
});

describe("the PrizeVault on the devnet", () => {
  let b: Awaited<ReturnType<typeof bootDevnetLedger>>;
  beforeAll(async () => {
    b = await bootDevnetLedger({ onLog: () => {}, seedMarket: false });
  }, 60_000);
  it("builds a Merkle epoch the contract verifies; a file with a wallet claims (sponsored), a second claim reverts, a file without a wallet is skipped", async () => {
    const store = new MemoryAccountStore(devSeed);
    const a = store.load("sandbox-prize", "P");
    const player = privateKeyToAccount(DEV_KEYS.player);
    const nonce = await b.ledger.nonce(a.id);
    const message = createSiweMessage({ address: player.address, chainId: b.devnet.chainId, domain: "127.0.0.1", nonce, uri: "http://127.0.0.1/", version: "1", statement: SIWE_STATEMENT });
    expect((await b.ledger.link(a, message, await player.signMessage({ message }))).ok).toBe(true);
    // the tree itself
    const tree = buildEpoch(5, [{ account: player.address, amount: parseEther("10") }, { account: privateKeyToAccount(DEV_KEYS.player2).address, amount: parseEther("3") }, { account: b.ledger.relayerAccount.address, amount: parseEther("1") }]);
    expect(tree.leaves.length).toBe(3);
    for (const l of tree.leaves) expect(verifyProof(5, l.account, l.amount, l.proof, tree.root)).toBe(true);
    expect(verifyProof(5, player.address, parseEther("11"), tree.leaves[0]!.proof, tree.root)).toBe(false);
    expect(leafHash(5, player.address, parseEther("10"))).toMatch(/^0x[0-9a-f]{64}$/);
    // post an audit epoch: one file linked, one not
    const post = await b.ledger.postEpoch("audit", 42, [{ account: a.id, amount: 100, reason: "AUDIT PLACEMENT #1" }, { account: "nobody", amount: 50, reason: "AUDIT PLACEMENT #2" }]);
    expect(post.ok).toBe(true);
    expect(post.skipped).toEqual(["nobody"]);
    expect(post.epoch!.leaves.length).toBe(1);
    const vaultBal = (await b.pub.readContract({ address: b.contracts.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName: "epochs", args: [BigInt(post.epoch!.epoch)] })) as [string, bigint, bigint, bigint];
    expect(vaultBal[1]).toBe(parseEther("100"));
    expect((await b.ledger.postEpoch("audit", 42, [])).reason).toMatch(/already posted/);
    const before = (await b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "balanceOf", args: [player.address] })) as bigint;
    const list = await b.ledger.prizes(a);
    expect(list).toEqual([{ epoch: post.epoch!.epoch, kind: "audit", period: 42, amount: "100", reason: "AUDIT PLACEMENT #1", claimed: false }]);
    const claim = await b.ledger.claimPrize(a, post.epoch!.epoch);
    expect(claim.ok).toBe(true);
    const after = (await b.pub.readContract({ address: b.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "balanceOf", args: [player.address] })) as bigint;
    expect(after - before).toBe(parseEther("100"));
    expect((await b.ledger.prizes(a))[0]!.claimed).toBe(true);
    expect((await b.ledger.claimPrize(a, post.epoch!.epoch)).ok).toBe(false);
    expect(a.ledger.some((l) => /PRIZE · AUDIT PLACEMENT #1/.test(l))).toBe(true);
    expect((await b.ledger.claimPrize(store.load("fresh-np", "N"), post.epoch!.epoch)).reason).toMatch(/no wallet/);
  }, 90_000);
});
