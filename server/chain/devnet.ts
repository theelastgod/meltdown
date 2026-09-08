/**
 * An in-process Orbit-compatible devnet: a real EVM (ethereumjs) behind the JSON-RPC subset viem
 * needs, mining one block per transaction. It stands in for Robinhood Chain wherever a host has no
 * RPC configured (the Node host, tests, the probe). Nothing about it is game logic: it exists so the
 * contracts run for real — signatures, reverts, fee splits — without a network.
 */
import { createVM, runTx, type VM } from "@ethereumjs/vm";
import { createBlock, type Block } from "@ethereumjs/block";
import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
import { createTxFromRLP, type TypedTransaction } from "@ethereumjs/tx";
import { bytesToHex, createAddressFromString, createZeroAddress, hexToBytes, createAccount, bigIntToHex } from "@ethereumjs/util";
import { keccak256 } from "viem";

export const DEVNET_CHAIN_ID = 31_911;
/** the devnet funds these at genesis (the relayer, the treasury, the probe) */
const GENESIS_ETH = 10_000n * 10n ** 18n;

interface Receipt {
  transactionHash: `0x${string}`;
  transactionIndex: `0x${string}`;
  blockHash: `0x${string}`;
  blockNumber: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  contractAddress: `0x${string}` | null;
  cumulativeGasUsed: `0x${string}`;
  gasUsed: `0x${string}`;
  effectiveGasPrice: `0x${string}`;
  status: `0x${string}`;
  logs: { address: `0x${string}`; topics: `0x${string}`[]; data: `0x${string}`; blockNumber: `0x${string}`; transactionHash: `0x${string}`; transactionIndex: `0x${string}`; blockHash: `0x${string}`; logIndex: `0x${string}`; removed: boolean }[];
  logsBloom: `0x${string}`;
  type: `0x${string}`;
}

export class RpcError extends Error {
  constructor(message: string, readonly code = -32000, readonly data?: unknown) {
    super(message);
  }
}

export class Devnet {
  private vm!: VM;
  private blocks: { hash: `0x${string}`; number: bigint; timestamp: bigint; txs: `0x${string}`[]; parent: `0x${string}` }[] = [];
  private receipts = new Map<string, Receipt>();
  private txs = new Map<string, TypedTransaction>();
  private readonly common = createCustomCommon({ chainId: DEVNET_CHAIN_ID, name: "meltdown-devnet" }, Mainnet, { hardfork: Hardfork.Cancun });
  /** when true every call fails like a dead RPC (the probe's "chain unreachable" drill) */
  outage = false;
  calls = 0;

  static async create(funded: `0x${string}`[]): Promise<Devnet> {
    const d = new Devnet();
    d.vm = await createVM({ common: d.common });
    for (const a of funded) await d.vm.stateManager.putAccount(createAddressFromString(a), createAccount({ balance: GENESIS_ETH, nonce: 0n }));
    const genesis = { hash: keccak256("0x4d454c54444f574e"), number: 0n, timestamp: BigInt(Math.floor(Date.now() / 1000)), txs: [], parent: `0x${"0".repeat(64)}` as const };
    d.blocks.push(genesis);
    return d;
  }

  get chainId(): number {
    return DEVNET_CHAIN_ID;
  }

  /** The devnet faucet (anvil's setBalance): gas for a player's own transactions. Sponsorship is separate — vouchers cost the wallet nothing. */
  async fund(address: `0x${string}`, wei = 10n * 10n ** 18n): Promise<void> {
    const addr = createAddressFromString(address);
    const acc = (await this.vm.stateManager.getAccount(addr)) ?? createAccount({ balance: 0n, nonce: 0n });
    acc.balance += wei;
    await this.vm.stateManager.putAccount(addr, acc);
  }

  private head() {
    return this.blocks[this.blocks.length - 1]!;
  }

  /**
   * Seconds added to every block's timestamp (Stage 41).
   *
   * The PrizeVault will not sweep an unclaimed epoch until ninety days after it was posted, and
   * until now this chain had no way to reach that: block timestamps came straight from `Date.now()`.
   * So the only two tests of `reclaim` were the ones that do NOT move money — "too early" and "no
   * such epoch" — and the path where the treasury actually gets its emission back had never once
   * been run. anvil and hardhat both expose `evm_increaseTime` for exactly this; so does this now.
   */
  private timeOffset = 0n;

  private nowSeconds(): bigint {
    return BigInt(Math.floor(Date.now() / 1000)) + this.timeOffset;
  }

  private blockFor(n: bigint): Block {
    return createBlock({ header: { number: n, timestamp: this.nowSeconds(), gasLimit: 30_000_000n, baseFeePerGas: 1n } }, { common: this.common });
  }

  private blockJson(b: (typeof this.blocks)[number], full = false) {
    return { number: bigIntToHex(b.number), hash: b.hash, parentHash: b.parent, timestamp: bigIntToHex(b.timestamp), gasLimit: "0x1c9c380", gasUsed: "0x0", baseFeePerGas: "0x1", miner: `0x${"0".repeat(40)}`, difficulty: "0x0", totalDifficulty: "0x0", extraData: "0x", nonce: "0x0000000000000000", size: "0x0", sha3Uncles: `0x${"0".repeat(64)}`, stateRoot: `0x${"0".repeat(64)}`, transactionsRoot: `0x${"0".repeat(64)}`, receiptsRoot: `0x${"0".repeat(64)}`, logsBloom: `0x${"0".repeat(512)}`, transactions: full ? b.txs.map((h) => this.txJson(h)) : b.txs, uncles: [], mixHash: `0x${"0".repeat(64)}` };
  }

  private txJson(hash: `0x${string}`) {
    const tx = this.txs.get(hash);
    const r = this.receipts.get(hash);
    if (!tx || !r) return null;
    const j = tx.toJSON();
    return { ...j, hash, from: r.from, blockHash: r.blockHash, blockNumber: r.blockNumber, transactionIndex: r.transactionIndex, type: r.type, gasPrice: j.gasPrice ?? j.maxFeePerGas ?? "0x1" };
  }

  /** JSON-RPC dispatch. Throws RpcError (mapped to a JSON-RPC error by the transport). */
  async rpc(method: string, params: unknown[] = []): Promise<unknown> {
    this.calls++;
    if (this.outage) throw new RpcError("CHAIN UNREACHABLE (devnet outage drill)", -32603);
    const p = params as unknown[];
    switch (method) {
      case "eth_chainId":
        return `0x${DEVNET_CHAIN_ID.toString(16)}`;
      case "net_version":
        return String(DEVNET_CHAIN_ID);
      case "eth_blockNumber":
        return bigIntToHex(this.head().number);
      // dev-chain time travel, the same two calls anvil offers. Only reachable by a caller holding
      // this object — the production hosts talk to a real RPC and have no such method.
      case "evm_increaseTime": {
        this.timeOffset += BigInt(Number(p[0] ?? 0));
        return bigIntToHex(this.timeOffset);
      }
      case "evm_mine": {
        const n = this.head().number + 1n;
        this.blocks.push({ hash: keccak256(`0x${n.toString(16).padStart(64, "0")}`), number: n, timestamp: this.nowSeconds(), txs: [], parent: this.head().hash });
        return "0x0";
      }
      case "eth_gasPrice":
      case "eth_maxPriorityFeePerGas":
        return "0x1";
      case "eth_feeHistory":
        return { oldestBlock: bigIntToHex(this.head().number), baseFeePerGas: ["0x1", "0x1"], gasUsedRatio: [0], reward: [["0x1"]] };
      case "eth_getBlockByNumber": {
        const tag = p[0] as string;
        const b = tag === "latest" || tag === "pending" || tag === "safe" || tag === "finalized" ? this.head() : this.blocks[Number(BigInt(tag))];
        return b ? this.blockJson(b, p[1] as boolean) : null;
      }
      case "eth_getBlockByHash": {
        const b = this.blocks.find((x) => x.hash === p[0]);
        return b ? this.blockJson(b, p[1] as boolean) : null;
      }
      case "eth_getBalance": {
        const acc = await this.vm.stateManager.getAccount(createAddressFromString(p[0] as string));
        return bigIntToHex(acc?.balance ?? 0n);
      }
      case "eth_getTransactionCount": {
        const acc = await this.vm.stateManager.getAccount(createAddressFromString(p[0] as string));
        return bigIntToHex(acc?.nonce ?? 0n);
      }
      case "eth_getCode": {
        const code = await this.vm.stateManager.getCode(createAddressFromString(p[0] as string));
        return bytesToHex(code);
      }
      case "eth_estimateGas":
        return "0x2dc6c0"; // 3,000,000: the devnet's block has room, and the wallet is not paying the gas anyway
      case "eth_call": {
        const c = p[0] as { from?: string; to?: string; data?: string; value?: string };
        const res = await this.vm.evm.runCall({
          caller: c.from ? createAddressFromString(c.from) : createZeroAddress(),
          to: c.to ? createAddressFromString(c.to) : undefined,
          data: c.data ? hexToBytes(c.data as `0x${string}`) : new Uint8Array(),
          value: c.value ? BigInt(c.value) : 0n,
          gasLimit: 30_000_000n,
          block: this.blockFor(this.head().number + 1n),
        });
        if (res.execResult.exceptionError) throw new RpcError(`execution reverted`, 3, bytesToHex(res.execResult.returnValue));
        return bytesToHex(res.execResult.returnValue);
      }
      case "eth_sendRawTransaction":
        return this.mine(p[0] as `0x${string}`);
      case "eth_getTransactionReceipt":
        return this.receipts.get(p[0] as string) ?? null;
      case "eth_getTransactionByHash":
        return this.txJson(p[0] as `0x${string}`);
      case "eth_getLogs":
        return [];
      default:
        throw new RpcError(`method ${method} not supported by the devnet`, -32601);
    }
  }

  private async mine(raw: `0x${string}`): Promise<`0x${string}`> {
    const tx = createTxFromRLP(hexToBytes(raw), { common: this.common });
    const hash = bytesToHex(tx.hash()) as `0x${string}`;
    const number = this.head().number + 1n;
    const block = this.blockFor(number);
    const res = await runTx(this.vm, { tx, block, skipBlockGasLimitValidation: true, skipHardForkValidation: true });
    const blockHash = keccak256(`0x${number.toString(16).padStart(64, "0")}`);
    const bn = bigIntToHex(number);
    const from = tx.getSenderAddress().toString() as `0x${string}`;
    const receipt: Receipt = {
      transactionHash: hash,
      transactionIndex: "0x0",
      blockHash,
      blockNumber: bn,
      from,
      to: tx.to ? (tx.to.toString() as `0x${string}`) : null,
      contractAddress: res.createdAddress ? (res.createdAddress.toString() as `0x${string}`) : null,
      cumulativeGasUsed: bigIntToHex(res.totalGasSpent),
      gasUsed: bigIntToHex(res.totalGasSpent),
      effectiveGasPrice: "0x1",
      status: res.execResult.exceptionError ? "0x0" : "0x1",
      logs: res.execResult.logs?.map((l, i) => ({ address: bytesToHex(l[0]) as `0x${string}`, topics: l[1].map((t) => bytesToHex(t) as `0x${string}`), data: bytesToHex(l[2]) as `0x${string}`, blockNumber: bn, transactionHash: hash, transactionIndex: "0x0", blockHash, logIndex: `0x${i.toString(16)}`, removed: false })) ?? [],
      logsBloom: `0x${"0".repeat(512)}`,
      type: `0x${tx.type.toString(16)}`,
    };
    this.receipts.set(hash, receipt);
    this.txs.set(hash, tx);
    this.blocks.push({ hash: blockHash, number, timestamp: block.header.timestamp, txs: [hash], parent: this.head().hash });
    return hash;
  }

  /** HTTP handler body → JSON-RPC response object (single or batch). */
  async handle(body: unknown): Promise<unknown> {
    const one = async (req: { id?: unknown; method: string; params?: unknown[] }) => {
      try {
        return { jsonrpc: "2.0", id: req.id ?? null, result: await this.rpc(req.method, req.params ?? []) };
      } catch (e) {
        const err = e instanceof RpcError ? e : new RpcError(String((e as Error)?.message ?? e));
        return { jsonrpc: "2.0", id: req.id ?? null, error: { code: err.code, message: err.message, data: err.data } };
      }
    };
    return Array.isArray(body) ? Promise.all(body.map(one)) : one(body as { method: string });
  }
}
