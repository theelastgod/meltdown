/**
 * Where the client finds its hosts. Development defaults point at the Node host; a Pages build
 * sets VITE_WS_URL / VITE_LEDGER_URL / VITE_CAMPAIGN_WS / VITE_COUNTER_URL to the three Workers
 * (docs/DEPLOY.md). A `?net=` / `?shop=` on the URL still wins (probes, deep links).
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const devHttp = "http://127.0.0.1:8787";
const devWs = "ws://127.0.0.1:8787";

export const HOSTS = {
  /** the PvP Worker: rooms (ws) and the ledger (http) */
  ws: env.VITE_WS_URL ?? devWs,
  ledger: env.VITE_LEDGER_URL ?? devHttp,
  /** the campaign Worker: co-op rooms and the campaign file route */
  campaignWs: env.VITE_CAMPAIGN_WS ?? devWs,
  campaign: env.VITE_CAMPAIGN_URL ?? devHttp,
  /** the counter-ledger Worker */
  counter: env.VITE_COUNTER_URL ?? devHttp,
  /** the public room the WAKE entry joins */
  publicRoom: env.VITE_PUBLIC_ROOM ?? "neochina",
  build: env.VITE_BUILD ?? "dev",
} as const;

/** set only when a build names the counter Worker; else the ledger host serves the counter-ledger too */
export const COUNTER_URL: string | null = env.VITE_COUNTER_URL ?? null;
