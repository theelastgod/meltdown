/**
 * WalletConnect, loaded only when the WALLET page asks for it.
 * The project id comes from the build. This file does not contain one.
 * The session may sit on BNB Smart Chain. It does not deploy a contract and it does not send $CAPITAL.
 */
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { plainEvmAddress, walletConnectOptionalChains, walletConnectRpcMap } from "@shared/economy/bnb";

export interface WalletConnectSession {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (arg: unknown) => void): void;
  disconnect(): Promise<void>;
}

/** Open a WalletConnect session. The session chains are BNB mainnet and testnet. `chainId` only selects a host RPC when it is one of those two. */
export async function openWalletConnect(opts: { projectId: string; chainId: number; rpc?: string; origin: string }): Promise<WalletConnectSession> {
  const origin = opts.origin.startsWith("http") ? opts.origin : "https://meltdown-45y.pages.dev";
  const provider = await EthereumProvider.init({
    projectId: opts.projectId,
    optionalChains: walletConnectOptionalChains(),
    showQrModal: true,
    rpcMap: walletConnectRpcMap(opts.chainId, opts.rpc),
    metadata: {
      name: "MELTDOWN",
      description: "$CAPITAL on BNB Smart Chain. This page does not mint and does not pay the pot.",
      url: origin,
      icons: [`${origin.replace(/\/$/, "")}/icons/capital-64.png`],
    },
  });
  const enabled = await provider.enable();
  const accounts = enabled.map((raw) => plainEvmAddress(raw)).filter((addr) => addr.length > 0);
  const session: WalletConnectSession = {
    request(args) {
      if (args.method === "eth_requestAccounts" && accounts.length > 0) return Promise.resolve(accounts);
      return provider.request(args);
    },
    on(event, handler) {
      provider.on(event as "accountsChanged", handler as (accounts: string[]) => void);
    },
    disconnect: () => provider.disconnect(),
  };
  return session;
}
