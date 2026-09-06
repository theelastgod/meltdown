/**
 * Deploys the counter-ledger contracts (contracts/out/artifacts.json) with a viem wallet client.
 * The Node host runs this against its in-process devnet at boot; `npm run contracts:deploy`
 * runs it against a real RPC (Robinhood Chain testnet) and prints the addresses for wrangler.
 */
import { encodeDeployData, parseEther, type Abi, type Hex, type PublicClient, type WalletClient } from "viem";
import { ROOM_HOUR_PRICE, SEASON_PASS_PRICE } from "../../shared/economy/sinks";
import artifactsJson from "../../contracts/out/artifacts.json";

export const ARTIFACTS = artifactsJson as Record<string, { abi: Abi; bytecode: Hex }>;

export interface Contracts {
  capital: Hex;
  ghostfile: Hex;
  stamps: Hex;
  names: Hex;
  cosmetics: Hex;
  market: Hex;
  /** the PrizeVault (Stage 15): weekly Merkle roots for the emission channels */
  vault: Hex;
  /** the sinks (Stage 19): the Deep Wake pass and private room-hours, both 100% burned */
  buyout: Hex;
  rooms: Hex;
}

export async function deployAll(pub: PublicClient, wal: WalletClient, signer: Hex, treasury: Hex): Promise<Contracts> {
  const deploy = async (name: string, args: unknown[]): Promise<Hex> => {
    const art = ARTIFACTS[name];
    if (!art) throw new Error(`no artifact for ${name}: run npm run contracts:build`);
    const hash = await wal.sendTransaction({ account: wal.account!, chain: wal.chain, data: encodeDeployData({ abi: art.abi, bytecode: art.bytecode, args }) });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success" || !r.contractAddress) throw new Error(`${name} deploy failed`);
    return r.contractAddress;
  };
  const capital = await deploy("$CAPITAL", [treasury]);
  const ghostfile = await deploy("Ghostfile", [signer]);
  const stamps = await deploy("Stamps", [signer]);
  const names = await deploy("Names", [signer, capital]);
  const cosmetics = await deploy("Cosmetics", []);
  const market = await deploy("LedgerMarket", [capital, cosmetics, treasury]);
  const vault = await deploy("PrizeVault", [capital, treasury]);
  // the sinks. Prices are the tokenomics doc's starting numbers (§4.4); the steward retunes them.
  const buyout = await deploy("SeasonBuyout", [treasury, capital, parseEther(String(SEASON_PASS_PRICE))]);
  const rooms = await deploy("RoomCredits", [treasury, capital, parseEther(String(ROOM_HOUR_PRICE))]);
  return { capital, ghostfile, stamps, names, cosmetics, market, vault, buyout, rooms };
}
