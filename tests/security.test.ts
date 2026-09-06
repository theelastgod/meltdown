/**
 * The money paths, read adversarially and pinned by test.
 *
 * Every case here fails on the code as it stood before the Stage 16 review: a zero signer that
 * validates garbage, an epoch that pays out of another epoch's pot, one file linked to two wallets,
 * supply destroyed without being counted as burned, and a name priced per byte bought with
 * multi-byte characters. See docs/SECURITY.md.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createWalletClient, defineChain, encodeDeployData, keccak256, parseEther, toHex, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bootDevnetLedger, DEV_KEYS } from "../server/chain/boot";
import { ARTIFACTS } from "../server/chain/deploy";
import { buildEpoch } from "../server/chain/merkle";
import { fileIdOf } from "../server/chain/signer";

type Boot = Awaited<ReturnType<typeof bootDevnetLedger>>;

const relayer = privateKeyToAccount(DEV_KEYS.relayer);
const player = privateKeyToAccount(DEV_KEYS.player);
const player2 = privateKeyToAccount(DEV_KEYS.player2);
const signer = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");

describe("the money paths, adversarially", () => {
  let b: Boot;
  let chain: ReturnType<typeof defineChain>;
  let wal: WalletClient;
  const send = async (address: Hex, artifact: string, functionName: string, args: unknown[], account = relayer) => {
    const hash = await wal.writeContract({ account, chain, address, abi: ARTIFACTS[artifact]!.abi, functionName, args });
    return b.pub.waitForTransactionReceipt({ hash });
  };
  const read = <T>(address: Hex, artifact: string, functionName: string, args: unknown[] = []) => b.pub.readContract({ address, abi: ARTIFACTS[artifact]!.abi, functionName, args }) as Promise<T>;
  const deploy = async (artifact: string, args: unknown[]): Promise<Hex> => {
    const hash = await wal.sendTransaction({ account: relayer, chain, data: encodeDeployData({ abi: ARTIFACTS[artifact]!.abi, bytecode: ARTIFACTS[artifact]!.bytecode, args }) });
    const r = await b.pub.waitForTransactionReceipt({ hash });
    // a constructor that reverts still mines a transaction: the receipt's status is the answer
    if (r.status !== "success") throw new Error(`${artifact} deploy reverted`);
    return r.contractAddress!;
  };

  beforeAll(async () => {
    b = await bootDevnetLedger({ onLog: () => {}, seedMarket: false });
    chain = defineChain({ id: b.devnet.chainId, name: "devnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } });
    wal = createWalletClient({ chain, transport: b.transport, account: relayer });
    await b.devnet.fund(player.address);
    await b.devnet.fund(player2.address);
  }, 90_000);

  it("a voucher contract refuses a malformed signature instead of recovering the zero address, and the signer can never be set to zero", async () => {
    const wallet = player.address;
    const fileId = fileIdOf("sec-garbage");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    // 65 bytes of nothing: `ecrecover` answers the zero address for it
    const garbage = `0x${"11".repeat(65)}` as Hex;
    await expect(b.pub.simulateContract({ address: b.contracts.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "mint", args: [wallet, fileId, 99n, deadline, garbage], account: relayer })).rejects.toThrow();
    // and the hole that would have made it pass is shut at the source
    await expect(b.pub.simulateContract({ address: b.contracts.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "setSigner", args: ["0x0000000000000000000000000000000000000000"], account: relayer })).rejects.toThrow();
    expect(await read<Hex>(b.contracts.ghostfile, "Ghostfile", "signer")).toBe(signer.address);
    // a well-formed voucher from the real signer still works
    const v = await b.ledger.signer.link(wallet, "sec-garbage");
    const r = await send(b.contracts.ghostfile, "Ghostfile", "mint", [v.message.wallet, v.message.fileId, v.message.nonce, v.message.deadline, v.signature]);
    expect(r.status).toBe("success");
  }, 60_000);

  it("one file is one wallet on chain, not only in the host's index; burning the Ghostfile frees the file again", async () => {
    const fileId = fileIdOf("sec-onefile");
    const a = await b.ledger.signer.link(player2.address, "sec-onefile");
    expect((await send(b.contracts.ghostfile, "Ghostfile", "mint", [a.message.wallet, a.message.fileId, a.message.nonce, a.message.deadline, a.signature])).status).toBe("success");
    // a second wallet claiming the same file is refused even with a perfectly valid voucher
    const third = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b");
    const c = await b.ledger.signer.link(third.address, "sec-onefile");
    await expect(b.pub.simulateContract({ address: b.contracts.ghostfile, abi: ARTIFACTS.Ghostfile!.abi, functionName: "mint", args: [c.message.wallet, c.message.fileId, c.message.nonce, c.message.deadline, c.signature], account: relayer })).rejects.toThrow();
    const token = await read<bigint>(b.contracts.ghostfile, "Ghostfile", "tokenOfFile", [fileId]);
    expect(token).toBeGreaterThan(0n);
    // the holder burns it: the file is free, and the third wallet may take it
    await b.devnet.fund(player2.address);
    expect((await send(b.contracts.ghostfile, "Ghostfile", "burn", [token], player2)).status).toBe("success");
    expect(await read<bigint>(b.contracts.ghostfile, "Ghostfile", "tokenOfFile", [fileId])).toBe(0n);
    expect((await send(b.contracts.ghostfile, "Ghostfile", "mint", [c.message.wallet, c.message.fileId, c.message.nonce, c.message.deadline, c.signature])).status).toBe("success");
  }, 60_000);

  it("a prize epoch is a ring-fenced pot: a root that claims more than the epoch was funded with cannot reach another epoch's money", async () => {
    const k = b.contracts;
    // Epoch 900 is funded with 10 but its root promises 300 — an off-chain tree bug, or a bad poster.
    // 300 is money the vault genuinely holds (epoch 901 put it there), so nothing but the epoch's own
    // ceiling stands between this claim and another epoch's pot.
    const bad = buildEpoch(900, [{ account: player.address, amount: parseEther("300") }]);
    await send(k.capital, "$CAPITAL", "approve", [k.vault, parseEther("100000")]);
    expect((await send(k.vault, "PrizeVault", "post", [900n, bad.root, parseEther("10")])).status).toBe("success");
    // epoch 901 is honest and holds real money in the same vault
    const good = buildEpoch(901, [{ account: player2.address, amount: parseEther("500") }]);
    expect((await send(k.vault, "PrizeVault", "post", [901n, good.root, parseEther("500")])).status).toBe("success");
    const vaultHeld = await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [k.vault]);
    expect(vaultHeld).toBe(parseEther("510"));
    // the overclaim is refused, and the honest epoch is untouched
    await expect(
      b.pub.simulateContract({ address: k.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName: "claim", args: [900n, player.address, parseEther("300"), bad.leaves[0]!.proof], account: relayer }),
    ).rejects.toThrow();
    expect(await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [k.vault])).toBe(vaultHeld);
    const before = await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [player2.address]);
    expect((await send(k.vault, "PrizeVault", "claim", [901n, player2.address, parseEther("500"), good.leaves[0]!.proof])).status).toBe("success");
    expect((await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [player2.address])) - before).toBe(parseEther("500"));
  }, 90_000);

  it("a prize is claimed once, by anyone, for the account in the leaf, and a forged amount fails the proof", async () => {
    const k = b.contracts;
    const tree = buildEpoch(902, [
      { account: player.address, amount: parseEther("40") },
      { account: player2.address, amount: parseEther("60") },
    ]);
    await send(k.vault, "PrizeVault", "post", [902n, tree.root, parseEther("100")]);
    const leaf = tree.leaves.find((l) => l.account.toLowerCase() === player.address.toLowerCase())!;
    // the same proof with a bigger number is a different leaf: the root does not know it
    await expect(
      b.pub.simulateContract({ address: k.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName: "claim", args: [902n, player.address, parseEther("100"), leaf.proof], account: relayer }),
    ).rejects.toThrow();
    // the relayer submits for the player: the tokens go to the leaf's account, not the sender
    const relayerBefore = await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [relayer.address]);
    const playerBefore = await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [player.address]);
    await send(k.vault, "PrizeVault", "claim", [902n, player.address, leaf.amount, leaf.proof]);
    expect((await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [player.address])) - playerBefore).toBe(parseEther("40"));
    expect(await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [relayer.address])).toBe(relayerBefore);
    await expect(
      b.pub.simulateContract({ address: k.vault, abi: ARTIFACTS.PrizeVault!.abi, functionName: "claim", args: [902n, player.address, leaf.amount, leaf.proof], account: relayer }),
    ).rejects.toThrow();
  }, 90_000);

  it("$CAPITAL: supply is only destroyed through burn, so the burn counter is the whole truth", async () => {
    const k = b.contracts;
    const supply0 = await read<bigint>(k.capital, "$CAPITAL", "totalSupply");
    const burned0 = await read<bigint>(k.capital, "$CAPITAL", "burned");
    await expect(
      b.pub.simulateContract({ address: k.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "transfer", args: ["0x0000000000000000000000000000000000000000", parseEther("1")], account: relayer }),
    ).rejects.toThrow();
    expect(await read<bigint>(k.capital, "$CAPITAL", "totalSupply")).toBe(supply0);
    await send(k.capital, "$CAPITAL", "burn", [parseEther("7")]);
    expect(supply0 - (await read<bigint>(k.capital, "$CAPITAL", "totalSupply"))).toBe(parseEther("7"));
    expect((await read<bigint>(k.capital, "$CAPITAL", "burned")) - burned0).toBe(parseEther("7"));
  }, 60_000);

  it("$CAPITAL: a signed permit sets the allowance in one transaction, once, and only for its own signer", async () => {
    const k = b.contracts;
    const spender = b.contracts.market;
    const value = parseEther("123");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const nonce = await read<bigint>(k.capital, "$CAPITAL", "nonces", [player.address]);
    const domain = { name: "$CAPITAL", version: "1", chainId: b.devnet.chainId, verifyingContract: k.capital } as const;
    const types = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] } as const;
    const message = { owner: player.address, spender, value, nonce, deadline };
    const sig = await player.signTypedData({ domain, types, primaryType: "Permit", message });
    const r = sig.slice(0, 66) as Hex;
    const s = `0x${sig.slice(66, 130)}` as Hex;
    const v = parseInt(sig.slice(130, 132), 16);
    // the relayer submits the player's permit: no transaction from the player at all
    await send(k.capital, "$CAPITAL", "permit", [player.address, spender, value, deadline, v, r, s]);
    expect(await read<bigint>(k.capital, "$CAPITAL", "allowance", [player.address, spender])).toBe(value);
    expect(await read<bigint>(k.capital, "$CAPITAL", "nonces", [player.address])).toBe(nonce + 1n);
    // replaying it is refused: the nonce moved on
    await expect(
      b.pub.simulateContract({ address: k.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "permit", args: [player.address, spender, value, deadline, v, r, s], account: relayer }),
    ).rejects.toThrow();
    // and a permit "from" someone who did not sign it is refused
    await expect(
      b.pub.simulateContract({ address: k.capital, abi: ARTIFACTS["$CAPITAL"]!.abi, functionName: "permit", args: [player2.address, spender, value, deadline, v, r, s], account: relayer }),
    ).rejects.toThrow();
  }, 60_000);

  it("Names: the fee is priced per byte, so a multi-byte name cannot buy characters it did not pay for", async () => {
    const k = b.contracts;
    // six characters, eighteen bytes: it would price as a 12+ name (150) instead of 400
    const cheat = "ЛЕТHЕЯ";
    expect(new TextEncoder().encode(cheat).length).toBeGreaterThan(cheat.length);
    const v = await b.ledger.signer.name(player.address, cheat);
    await expect(
      b.pub.simulateContract({ address: k.names, abi: ARTIFACTS.Names!.abi, functionName: "register", args: [cheat, v.message.nonce, v.message.deadline, v.signature], account: player }),
    ).rejects.toThrow();
    // the plain ASCII name the game actually signs goes through and burns its price
    const good = "THE_AUDITOR";
    const fee = await read<bigint>(k.names, "Names", "priceOf", [BigInt(good.length)]);
    const gv = await b.ledger.signer.name(player.address, good);
    await send(k.capital, "$CAPITAL", "transfer", [player.address, fee]);
    await send(k.capital, "$CAPITAL", "approve", [k.names, fee], player);
    const burned0 = await read<bigint>(k.capital, "$CAPITAL", "burned");
    expect((await send(k.names, "Names", "register", [good, gv.message.nonce, gv.message.deadline, gv.signature], player)).status).toBe("success");
    expect((await read<bigint>(k.capital, "$CAPITAL", "burned")) - burned0).toBe(fee);
    expect(await read<string>(k.names, "Names", "nameOf", [player.address])).toBe(good);
  }, 90_000);

  it("the market pays the exact 2/2/1 split, draws the escrow down before it hands the goods over, and a partial buy leaves the rest listed", async () => {
    const k = b.contracts;
    const seller = relayer.address;
    const token = 77n;
    await send(k.cosmetics, "Cosmetics", "mint", [seller, token, 10n, seller, 0x1234]);
    await send(k.cosmetics, "Cosmetics", "setApprovalForAll", [k.market, true]);
    const price = parseEther("100");
    await send(k.market, "LedgerMarket", "list", [token, 4n, price]);
    const listing = (await read<bigint>(k.market, "LedgerMarket", "nextListing")) - 1n;
    await send(k.capital, "$CAPITAL", "transfer", [player2.address, parseEther("300")]);
    await send(k.capital, "$CAPITAL", "approve", [k.market, parseEther("300")], player2);
    const burned0 = await read<bigint>(k.capital, "$CAPITAL", "burned");
    const sellerBefore = await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [seller]);
    await send(k.market, "LedgerMarket", "buy", [listing, 2n], player2);
    const paid = price * 2n;
    // 2% burned, 2% + 1% to the treasury (the creator here is the seller, who is also the treasury)
    expect((await read<bigint>(k.capital, "$CAPITAL", "burned")) - burned0).toBe((paid * 200n) / 10_000n);
    expect((await read<bigint>(k.capital, "$CAPITAL", "balanceOf", [seller])) - sellerBefore).toBe(paid - (paid * 200n) / 10_000n);
    expect(await read<bigint>(k.cosmetics, "Cosmetics", "balanceOf", [token, player2.address])).toBe(2n);
    // the escrow still holds what was not sold, and the listing knows it
    const rest = (await read<[Hex, bigint, bigint, bigint]>(k.market, "LedgerMarket", "listings", [listing]))[2];
    expect(rest).toBe(2n);
    expect(await read<bigint>(k.cosmetics, "Cosmetics", "balanceOf", [token, k.market])).toBe(2n);
  }, 90_000);

  it("a fresh deploy refuses a zero signer and a zero treasury outright", async () => {
    const zero = "0x0000000000000000000000000000000000000000";
    await expect(deploy("Ghostfile", [zero])).rejects.toThrow();
    await expect(deploy("$CAPITAL", [zero])).rejects.toThrow();
    // and a good one still comes up with the supply where it belongs
    const cap = await deploy("$CAPITAL", [relayer.address]);
    expect(await read<bigint>(cap, "$CAPITAL", "balanceOf", [relayer.address])).toBe(parseEther("1000000000"));
    expect(keccak256(toHex("sanity"))).toMatch(/^0x[0-9a-f]{64}$/);
  }, 90_000);
});
