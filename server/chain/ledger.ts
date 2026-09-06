/**
 * The counter-ledger service behind both hosts: wallet link (SIWE), the Ghostfile mint and the
 * stamp attestations (game-signed vouchers, gas sponsored by the relayer), name vouchers, the
 * market listings, and the cache reconcile that turns on-chain ownership into the file's rig.
 * Chain down, game up: every chain call fails soft with a reason; the file keeps its cache.
 *
 * The match room never imports this module (tests/counter.test.ts walks the graph).
 */
import { createPublicClient, createWalletClient, defineChain, formatEther, parseEther, verifyMessage, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import type { Account, CounterRecord } from "../../shared/progression/account";
import { CAPITAL_PER_UNIT, emptyCounter, LAUNCH_GRANT, LAUNCH_GRANT_DEPTH, NAME_DEPTH, nameFee, SIWE_STATEMENT, validName } from "../../shared/economy/counter";
import { SKINS } from "../../shared/economy/catalog";
import { ARTIFACTS, type Contracts } from "./deploy";
import { GameSigner } from "./signer";
import type { WalletStore } from "./wallets";
import { buildEpoch } from "./merkle";
import type { PrizeStore, StoredEpoch } from "./prizes-store";
import type { PrizeLine } from "../../shared/economy/prizes";

export interface LedgerOptions {
  chainId: number;
  transport: Transport;
  signerKey: Hex;
  relayerKey: Hex;
  contracts: Contracts;
  wallets: WalletStore;
  /** devnet / testnet: the launch grant at link and the seeded market */
  devnet: boolean;
  /** SIWE domains the host accepts (empty: any) */
  domains?: string[];
  /** posted prize epochs (Stage 15) */
  prizes?: PrizeStore;
  now?: () => number;
  onLog?: (line: string) => void;
}

export interface Result {
  ok: boolean;
  reason?: string;
}

export interface Listing {
  listing: number;
  token: number;
  amount: number;
  /** whole $CAPITAL per unit */
  price: number;
  seller: Hex;
}

const soft = (e: unknown): Result => {
  const msg = String((e as Error)?.message ?? e);
  const lines = msg.split("\n");
  const line = lines.find((l) => /UNREACHABLE/.test(l)) ?? lines.find((l) => /reverted|Error|fetch|ECONNREFUSED|timeout/i.test(l)) ?? msg.slice(0, 120);
  const clean = line.trim().replace(/^CHAIN UNREACHABLE:?\s*/, "").slice(0, 100);
  return { ok: false, reason: /UNREACHABLE|fetch failed|ECONNREFUSED|HTTP request failed|timeout|not supported/i.test(msg) ? `CHAIN UNREACHABLE: ${clean}` : line.trim().slice(0, 140) };
};

export class CounterLedger {
  readonly pub: PublicClient;
  readonly relayer: WalletClient;
  readonly relayerAccount: PrivateKeyAccount;
  readonly signer: GameSigner;
  readonly chain;
  private granted = new Set<string>();
  constructor(readonly opts: LedgerOptions) {
    this.chain = defineChain({ id: opts.chainId, name: opts.devnet ? "MELTDOWN devnet" : "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } });
    this.pub = createPublicClient({ chain: this.chain, transport: opts.transport });
    this.relayerAccount = privateKeyToAccount(opts.relayerKey);
    this.relayer = createWalletClient({ chain: this.chain, transport: opts.transport, account: this.relayerAccount });
    this.signer = new GameSigner(opts.signerKey, opts.chainId, opts.contracts, opts.now ?? Date.now);
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }
  private log(line: string): void {
    this.opts.onLog?.(line);
  }

  /** What the panel needs to talk to the chain itself: id, addresses, the signer it should expect. */
  info() {
    return { chainId: this.opts.chainId, devnet: this.opts.devnet, contracts: this.opts.contracts, signer: this.signer.address, relayer: this.relayerAccount.address, statement: SIWE_STATEMENT };
  }

  // ---- SIWE link ----

  nonce(account: string): string | Promise<string> {
    return this.opts.wallets.issueNonce(account);
  }

  /** Verify the SIWE message, bind 1:1, then mint the Ghostfile, grant (devnet), attest the stamps and reconcile. */
  async link(a: Account, message: string, signature: Hex): Promise<Result & { counter?: CounterRecord }> {
    let parsed: ReturnType<typeof parseSiweMessage>;
    try {
      parsed = parseSiweMessage(message);
    } catch {
      return { ok: false, reason: "malformed SIWE message" };
    }
    if (!parsed.address || !parsed.nonce) return { ok: false, reason: "malformed SIWE message" };
    if (parsed.statement !== SIWE_STATEMENT) return { ok: false, reason: "wrong statement: the link signs nothing else" };
    if (parsed.chainId !== this.opts.chainId) return { ok: false, reason: `wrong chain: expected ${this.opts.chainId}` };
    if (this.opts.domains?.length && !this.opts.domains.includes(parsed.domain ?? "")) return { ok: false, reason: "wrong domain" };
    if (!validateSiweMessage({ message: parsed, time: new Date(this.now()) })) return { ok: false, reason: "SIWE message expired or not yet valid" };
    if (!(await this.opts.wallets.takeNonce(a.id, parsed.nonce))) return { ok: false, reason: "stale nonce" };
    if (!(await verifyMessage({ address: parsed.address, message, signature }))) return { ok: false, reason: "bad signature" };
    const address = parsed.address;
    const prev = a.counter?.address;
    if (prev && prev.toLowerCase() !== address.toLowerCase()) return { ok: false, reason: "file already bound to another wallet" };
    try {
      await this.opts.wallets.bind(a.id, address, this.now());
    } catch (e) {
      return { ok: false, reason: String((e as Error).message) };
    }
    a.counter = { ...(a.counter ?? emptyCounter()), address, linkedAt: a.counter?.linkedAt || this.now() };
    this.log(`link ${a.id} ↔ ${address}`);
    // sponsored: the relayer pays; the wallet signs nothing beyond the SIWE message
    const mint = await this.mintGhostfile(a);
    if (!mint.ok) return { ok: true, reason: mint.reason, counter: a.counter };
    if (this.opts.devnet) await this.grant(a);
    await this.attestStamps(a);
    await this.reconcile(a);
    return { ok: true, counter: a.counter };
  }

  /** The soulbound Ghostfile, minted by the relayer against a game voucher (gas sponsored). */
  async mintGhostfile(a: Account): Promise<Result> {
    const c = a.counter;
    if (!c?.address) return { ok: false, reason: "no wallet linked" };
    if (c.ghostfile) return { ok: true };
    try {
      const wallet = c.address as Hex;
      const have = (await this.pub.readContract({ address: this.opts.contracts.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "tokenOf", args: [wallet] })) as bigint;
      if (have === 0n) {
        const v = await this.signer.link(wallet, a.id);
        const hash = await this.relayer.writeContract({ account: this.relayerAccount, chain: this.chain, address: this.opts.contracts.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "mint", args: [v.message.wallet, v.message.fileId, v.message.nonce, v.message.deadline, v.signature] });
        const r = await this.pub.waitForTransactionReceipt({ hash });
        if (r.status !== "success") return { ok: false, reason: "mint reverted" };
      }
      const token = (await this.pub.readContract({ address: this.opts.contracts.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "tokenOf", args: [wallet] })) as bigint;
      a.counter = { ...c, ghostfile: Number(token) };
      this.log(`ghostfile #${token} → ${a.id}`);
      return { ok: true };
    } catch (e) {
      return soft(e);
    }
  }

  /** Every stamp on the file that is not yet on chain: one voucher, one sponsored attestation each (bounded per call). */
  async attestStamps(a: Account, max = 12): Promise<Result & { attested: string[] }> {
    const c = a.counter;
    if (!c?.address) return { ok: false, reason: "no wallet linked", attested: [] };
    const attested: string[] = [];
    try {
      const wallet = c.address as Hex;
      for (const id of a.stamps) {
        if (attested.length >= max) break;
        if (c.stamps.includes(id)) continue;
        const v = await this.signer.stamp(wallet, a.id, id);
        const hash = await this.relayer.writeContract({ account: this.relayerAccount, chain: this.chain, address: this.opts.contracts.stamps, abi: ARTIFACTS.Stamps!.abi, functionName: "attest", args: [v.message.wallet, v.message.fileId, v.message.stampId, v.message.nonce, v.message.deadline, v.signature] });
        const r = await this.pub.waitForTransactionReceipt({ hash });
        if (r.status === "success") attested.push(id);
      }
      a.counter = { ...c, stamps: [...c.stamps, ...attested] };
      if (attested.length) this.log(`attested ${attested.length} stamp(s) for ${a.id}`);
      return { ok: true, attested };
    } catch (e) {
      a.counter = { ...c, stamps: [...c.stamps, ...attested] };
      return { ...soft(e), attested };
    }
  }

  /** devnet / testnet: the launch distribution — once, to a Depth-10+ file, from the treasury. */
  async grant(a: Account): Promise<Result> {
    const c = a.counter;
    if (!c?.address || !this.opts.devnet || a.depth < LAUNCH_GRANT_DEPTH || this.granted.has(a.id)) return { ok: false, reason: "no grant" };
    try {
      const bal = (await this.pub.readContract({ address: this.opts.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "balanceOf", args: [c.address as Hex] })) as bigint;
      if (bal > 0n) return { ok: false, reason: "already funded" };
      const hash = await this.relayer.writeContract({ account: this.relayerAccount, chain: this.chain, address: this.opts.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "transfer", args: [c.address as Hex, parseEther(String(LAUNCH_GRANT))] });
      await this.pub.waitForTransactionReceipt({ hash });
      this.granted.add(a.id);
      this.log(`launch grant ${LAUNCH_GRANT} $CAPITAL → ${a.id}`);
      return { ok: true };
    } catch (e) {
      return soft(e);
    }
  }

  /** A name voucher at Depth 50: the player submits `register` and pays the burn themselves. */
  async nameVoucher(a: Account, name: string): Promise<Result & { voucher?: { name: string; nonce: string; deadline: string; signature: Hex; fee: number } }> {
    const c = a.counter;
    if (!c?.address) return { ok: false, reason: "no wallet linked" };
    if (a.depth < NAME_DEPTH) return { ok: false, reason: `the registry opens at Depth ${NAME_DEPTH}` };
    if (c.name) return { ok: false, reason: "this file already has a name" };
    const n = name.trim().toUpperCase();
    if (!validName(n)) return { ok: false, reason: "3–24 characters: A–Z, 0–9, _ -" };
    const fee = nameFee(n.length)!;
    const v = await this.signer.name(c.address as Hex, n);
    return { ok: true, voucher: { name: n, nonce: v.message.nonce.toString(), deadline: v.message.deadline.toString(), signature: v.signature, fee } };
  }

  // ---- the PrizeVault (Stage 15): the emission channels as Merkle epochs ----

  /** Post an epoch: resolve each file's wallet, build the tree, fund the vault from the treasury (the relayer) and set the root. Files without a wallet are left out and named in the answer. */
  async postEpoch(kind: "audit" | "season", period: number, lines: readonly PrizeLine[]): Promise<Result & { epoch?: StoredEpoch; skipped?: string[] }> {
    const store = this.opts.prizes;
    if (!store) return { ok: false, reason: "no prize store" };
    const epoch = (kind === "audit" ? 1_000_000 : 2_000_000) + period;
    if (await store.get(epoch)) return { ok: false, reason: `epoch ${epoch} already posted` };
    const skipped: string[] = [];
    const leaves: { account: Hex; file: string; amount: bigint; reason: string }[] = [];
    for (const l of lines) {
      const address = await this.opts.wallets.addressOf(l.account);
      if (!address || l.amount <= 0) {
        skipped.push(l.account);
        continue;
      }
      leaves.push({ account: address as Hex, file: l.account, amount: parseEther(String(l.amount)), reason: l.reason });
    }
    // one leaf per wallet: merge files that share one
    const byWallet = new Map<string, (typeof leaves)[number]>();
    for (const l of leaves) {
      const k = l.account.toLowerCase();
      const cur = byWallet.get(k);
      if (cur) cur.amount += l.amount;
      else byWallet.set(k, { ...l });
    }
    const merged = [...byWallet.values()];
    const tree = buildEpoch(epoch, merged);
    try {
      if (tree.total > 0n) {
        const k = this.opts.contracts;
        const approve = await this.relayer.writeContract({ account: this.relayerAccount, chain: this.chain, address: k.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "approve", args: [k.vault, tree.total] });
        await this.pub.waitForTransactionReceipt({ hash: approve });
        const hash = await this.relayer.writeContract({ account: this.relayerAccount, chain: this.chain, address: k.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName: "post", args: [BigInt(epoch), tree.root, tree.total] });
        const r = await this.pub.waitForTransactionReceipt({ hash });
        if (r.status !== "success") return { ok: false, reason: "post reverted" };
      }
      const stored: StoredEpoch = { epoch, kind, period, root: tree.root, total: tree.total.toString(), postedAt: this.now(), leaves: tree.leaves.map((l) => ({ account: l.account, file: merged.find((m) => m.account.toLowerCase() === l.account.toLowerCase())!.file, amount: l.amount.toString(), reason: merged.find((m) => m.account.toLowerCase() === l.account.toLowerCase())!.reason, proof: l.proof })) };
      await store.put(stored);
      this.log(`prizes · ${kind} ${period} posted as epoch ${epoch}: ${stored.leaves.length} leaves, ${formatEther(tree.total)} $CAPITAL`);
      return { ok: true, epoch: stored, skipped };
    } catch (e) {
      return { ...soft(e), skipped };
    }
  }

  /** What a file can claim: every posted epoch with a leaf for its wallet, claimed or not (read from the chain). */
  async prizes(a: Account): Promise<{ epoch: number; kind: string; period: number; amount: string; reason: string; claimed: boolean }[]> {
    const store = this.opts.prizes;
    const c = a.counter;
    if (!store || !c?.address) return [];
    const out: { epoch: number; kind: string; period: number; amount: string; reason: string; claimed: boolean }[] = [];
    for (const e of await store.list()) {
      const leaf = e.leaves.find((l) => l.account.toLowerCase() === c.address!.toLowerCase());
      if (!leaf) continue;
      let claimed = false;
      try {
        claimed = (await this.pub.readContract({ address: this.opts.contracts.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName: "claimedBy", args: [BigInt(e.epoch), leaf.account] })) as boolean;
      } catch {
        claimed = false;
      }
      out.push({ epoch: e.epoch, kind: e.kind, period: e.period, amount: formatEther(BigInt(leaf.amount)), reason: leaf.reason, claimed });
    }
    return out;
  }

  /** A claim, submitted by the relayer (sponsored): the vault pays the wallet in the leaf. */
  async claimPrize(a: Account, epoch: number): Promise<Result & { amount?: string }> {
    const store = this.opts.prizes;
    const c = a.counter;
    if (!store || !c?.address) return { ok: false, reason: "no wallet linked" };
    const e = await store.get(epoch);
    const leaf = e?.leaves.find((l) => l.account.toLowerCase() === c.address!.toLowerCase());
    if (!e || !leaf) return { ok: false, reason: "no prize in that epoch" };
    try {
      const hash = await this.relayer.writeContract({ account: this.relayerAccount, chain: this.chain, address: this.opts.contracts.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName: "claim", args: [BigInt(e.epoch), leaf.account, BigInt(leaf.amount), leaf.proof] });
      const r = await this.pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") return { ok: false, reason: "claim reverted" };
      this.log(`prizes · ${a.id} claimed epoch ${epoch}: ${formatEther(BigInt(leaf.amount))} $CAPITAL`);
      a.ledger.push(`PRIZE · ${leaf.reason} · ${formatEther(BigInt(leaf.amount))} $CAPITAL TO THE WALLET`);
      await this.reconcile(a);
      return { ok: true, amount: formatEther(BigInt(leaf.amount)) };
    } catch (e2) {
      return soft(e2);
    }
  }

  /** THE RUN's payout: what the file is owed goes from the treasury to the wallet (the devnet's relayer is the treasury; production posts a PrizeVault Merkle root). */
  async payout(a: Account): Promise<Result & { paid?: number }> {
    const c = a.counter;
    if (!c?.address) return { ok: false, reason: "no wallet linked" };
    const run = c.run ?? { day: 0, banked: 0, owed: 0, paid: 0 };
    if (run.owed <= 0) return { ok: false, reason: "nothing owed" };
    try {
      const units = run.owed;
      const hash = await this.relayer.writeContract({ account: this.relayerAccount, chain: this.chain, address: this.opts.contracts.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "transfer", args: [c.address as Hex, parseEther(String(units * CAPITAL_PER_UNIT))] });
      const r = await this.pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") return { ok: false, reason: "payout reverted" };
      a.counter = { ...c, run: { ...run, owed: 0, paid: run.paid + units } };
      this.log(`payout ${units} $CAPITAL → ${a.id}`);
      await this.reconcile(a);
      return { ok: true, paid: units };
    } catch (e) {
      return soft(e);
    }
  }

  /** Read the chain into the file's cache: $CAPITAL balance, Ghostfile, name, and the rig from the skin balances. */
  async reconcile(a: Account): Promise<Result & { counter?: CounterRecord }> {
    const c = a.counter;
    if (!c?.address) return { ok: false, reason: "no wallet linked" };
    try {
      const wallet = c.address as Hex;
      const k = this.opts.contracts;
      const [capital, token, name, balances] = await Promise.all([
        this.pub.readContract({ address: k.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "balanceOf", args: [wallet] }) as Promise<bigint>,
        this.pub.readContract({ address: k.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "tokenOf", args: [wallet] }) as Promise<bigint>,
        this.pub.readContract({ address: k.names, abi: ARTIFACTS.Names!.abi, functionName: "nameOf", args: [wallet] }) as Promise<string>,
        this.pub.readContract({ address: k.cosmetics, abi: ARTIFACTS.Cosmetics!.abi, functionName: "balanceOfBatch", args: [SKINS.map(() => wallet), SKINS.map((s) => BigInt(s.token))] }) as Promise<bigint[]>,
      ]);
      const rig = SKINS.filter((_, i) => (balances[i] ?? 0n) > 0n).map((s) => s.token);
      const worn = rig.includes(c.worn) ? c.worn : 0;
      a.counter = { ...c, capital: formatEther(capital), ghostfile: Number(token), name: name || null, rig, worn };
      return { ok: true, counter: a.counter };
    } catch (e) {
      return soft(e);
    }
  }

  /** The market's open listings (view). */
  async listings(): Promise<Listing[]> {
    const k = this.opts.contracts;
    const next = (await this.pub.readContract({ address: k.market, abi: ARTIFACTS.LedgerMarket!.abi, functionName: "nextListing" })) as bigint;
    const out: Listing[] = [];
    for (let i = 1n; i < next; i++) {
      const [seller, id, amount, price] = (await this.pub.readContract({ address: k.market, abi: ARTIFACTS.LedgerMarket!.abi, functionName: "listings", args: [i] })) as [Hex, bigint, bigint, bigint];
      if (amount > 0n) out.push({ listing: Number(i), token: Number(id), amount: Number(amount), price: Number(formatEther(price)), seller });
    }
    return out;
  }

  /** Treasury figures for the NET DELTA line: supply, burned, market volume. */
  async treasury() {
    const k = this.opts.contracts;
    const [supply, burned, volume] = await Promise.all([
      this.pub.readContract({ address: k.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "totalSupply" }) as Promise<bigint>,
      this.pub.readContract({ address: k.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "burned" }) as Promise<bigint>,
      this.pub.readContract({ address: k.market, abi: ARTIFACTS.LedgerMarket!.abi, functionName: "volume" }) as Promise<bigint>,
    ]);
    return { supply: formatEther(supply), burned: formatEther(burned), volume: formatEther(volume) };
  }

  /** devnet: the studio mints each skin to the treasury and lists it, so there is something to buy. */
  async seedMarket(units = 100): Promise<void> {
    const k = this.opts.contracts;
    const me = this.relayerAccount.address;
    const w = async (address: Hex, abi: typeof ARTIFACTS[string]["abi"], functionName: string, args: unknown[]) => {
      const hash = await this.relayer.writeContract({ account: this.relayerAccount, chain: this.chain, address, abi, functionName, args });
      const r = await this.pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`${functionName} reverted`);
    };
    for (const s of SKINS) await w(k.cosmetics, ARTIFACTS.Cosmetics!.abi, "mint", [me, BigInt(s.token), BigInt(units), me, s.wearSeed]);
    await w(k.cosmetics, ARTIFACTS.Cosmetics!.abi, "setApprovalForAll", [k.market, true]);
    for (const s of SKINS) await w(k.market, ARTIFACTS.LedgerMarket!.abi, "list", [BigInt(s.token), BigInt(units), parseEther(String(s.capital))]);
    this.log(`market seeded: ${SKINS.length} skins × ${units}`);
  }
}
