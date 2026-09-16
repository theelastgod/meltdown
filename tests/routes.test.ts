/**
 * The routes, not the functions behind them (Stage 28).
 *
 * Stage 26 gave a file a secret and gated the paths it had in hand: the dev host and the PlayerFile
 * Durable Object. `tests/fileauth.test.ts` proved those gates by calling `fileAuth` and the DO's
 * helpers, and it passed — while the two Cloudflare Workers, which are the production edge, loaded
 * a file, applied a change and saved it without ever looking at a secret. A test that calls the
 * function cannot see a route that never calls it, so these cases go in through `fetch`.
 *
 * The Durable Object is real code here; only its storage and D1 are doubles.
 */
import { describe, expect, it } from "vitest";
import { PlayerFile, NOT_YOURS, type PlayerEnv } from "../server/player-do";
import counterWorker from "../server/counter-worker";
import campaignWorker from "../server/campaign-worker";
import matchWorker from "../server/worker";
import { createAccount, publicFile, type Account } from "../shared/progression/account";

const SECRET = "a-files-own-private-secret";

/** DO storage: a Map behind the two methods PlayerFile uses. */
function fakeState(): DurableObjectState {
  const m = new Map<string, unknown>();
  return {
    storage: {
      get: async (k: string) => m.get(k),
      put: async (k: string, v: unknown) => void m.set(k, v),
    },
  } as unknown as DurableObjectState;
}

/** One PlayerFile per id, reached the way a Worker reaches it: by name, over a binding. */
function fakeNamespace(): DurableObjectNamespace {
  const dos = new Map<string, PlayerFile>();
  return {
    idFromName: (n: string) => n as unknown as DurableObjectId,
    get: (id: DurableObjectId) => {
      const key = String(id);
      if (!dos.has(key)) dos.set(key, new PlayerFile(fakeState(), {} as PlayerEnv));
      return { fetch: (req: Request | string, init?: RequestInit) => dos.get(key)!.fetch(typeof req === "string" ? new Request(req, init) : req) };
    },
  } as unknown as DurableObjectNamespace;
}

const seed = async (ns: DurableObjectNamespace, id: string, edit: (a: Account) => void = () => {}): Promise<void> => {
  const a = createAccount(id, "BLANK");
  a.secret = SECRET;
  edit(a);
  await ns.get(ns.idFromName(id)).fetch(new Request("https://file/save", { method: "POST", body: JSON.stringify(a) }));
};

const post = (url: string, body: unknown, headers: Record<string, string> = {}): Request =>
  new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

describe("the secret travels in, never out", () => {
  it("publicFile drops the one field that is a credential and nothing else", () => {
    const a = createAccount("file", "BLANK");
    a.secret = SECRET;
    a.xp = 4200;
    const pub = publicFile(a);
    expect((pub as Account).secret).toBeUndefined();
    expect(pub.xp).toBe(4200);
    // every other key survives, so a client that reads its own file is unaffected
    expect(Object.keys(pub).sort()).toEqual(Object.keys(a).filter((k) => k !== "secret").sort());
    expect(a.secret).toBe(SECRET); // and the host's own copy is not mutated
  });

  it("the read a client makes does not answer with the secret, and the read the host makes does", async () => {
    const ns = fakeNamespace();
    await seed(ns, "victim");
    const stub = ns.get(ns.idFromName("victim"));
    // /public is what `GET /file/<id>` reaches at the edge (server/worker.ts)
    const pub = (await (await stub.fetch(post("https://file/public", { id: "victim", name: "BLANK" }))).json()) as Account;
    expect(pub.secret).toBeUndefined();
    expect(pub.id).toBe("victim");
    // /file is the internal load: the room and the Workers check the secret against it, so it keeps it
    const internal = (await (await stub.fetch(post("https://file/file", { id: "victim", name: "BLANK" }))).json()) as Account;
    expect(internal.secret).toBe(SECRET);
  });

  it("a mutating route answers with the file redacted, so the response cannot leak what the request had to prove", async () => {
    const ns = fakeNamespace();
    await seed(ns, "spender", (a) => (a.wallet.scrip = 10_000));
    const stub = ns.get(ns.idFromName("spender"));
    const r = (await (await stub.fetch(post("https://file/rewrite", { id: "spender", secret: SECRET }))).json()) as { account: Account };
    expect(r.account.secret).toBeUndefined();
  });

  it("without the secret the Rewrite is refused, which is the gate Stage 26 built", async () => {
    const ns = fakeNamespace();
    await seed(ns, "spender");
    const res = await ns.get(ns.idFromName("spender")).fetch(post("https://file/rewrite", { id: "spender" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { reason: string }).reason).toBe(NOT_YOURS);
  });
});

describe("the production edge asks for the secret too", () => {
  const campaignEnv = (ns: DurableObjectNamespace) => ({ PLAYER_FILE: ns }) as unknown as Parameters<typeof campaignWorker.fetch>[1];

  it("the campaign Worker refuses a house picked by someone who does not hold the file", async () => {
    const ns = fakeNamespace();
    await seed(ns, "target");
    const res = await campaignWorker.fetch(post("https://c/file/target/campaign", { op: "faction", faction: "cells" }), campaignEnv(ns));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { reason: string }).reason).toBe(NOT_YOURS);
    // and it did not write: the file still has no house
    const after = (await (await ns.get(ns.idFromName("target")).fetch(post("https://file/file", { id: "target", name: "BLANK" }))).json()) as Account;
    expect(after.campaign?.faction ?? null).toBeNull();
  });

  it("the campaign Worker still works for the file's owner, and answers redacted", async () => {
    const ns = fakeNamespace();
    await seed(ns, "owner");
    const res = await campaignWorker.fetch(post("https://c/file/owner/campaign", { op: "faction", faction: "cells", secret: SECRET }), campaignEnv(ns));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; account: Account };
    expect(body.ok).toBe(true);
    expect(body.account.secret).toBeUndefined();
    expect(body.account.campaign?.faction).toBe("cells");
  });

  /** enough env that `unconfigured` is false; the refusals below all land before any chain client is built */
  const counterEnv = (ns: DurableObjectNamespace, extra: Record<string, unknown> = {}) =>
    ({ PLAYER_FILE: ns, DB: {}, CHAIN_ID: "1", CHAIN_RPC: "https://rpc.invalid", CONTRACTS: "{}", SIGNER_KEY: "0x1", RELAYER_KEY: "0x1", ...extra }) as unknown as Parameters<typeof counterWorker.fetch>[1];

  it("the counter Worker — the money route — refuses a request that does not hold the file", async () => {
    const ns = fakeNamespace();
    await seed(ns, "rich");
    const res = await counterWorker.fetch(post("https://k/file/rich/counter", { op: "view" }), counterEnv(ns));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { reason: string }).reason).toBe(NOT_YOURS);
  });

  it("linking a wallet to a file needs the file as well as the wallet", async () => {
    const ns = fakeNamespace();
    await seed(ns, "rich");
    const res = await counterWorker.fetch(post("https://k/link/verify", { account: "rich", message: "m", signature: "0x00" }), counterEnv(ns));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { reason: string }).reason).toBe(NOT_YOURS);
  });

  it("the settlement job is an operator's button: closed without the key, and closed when no key is configured", async () => {
    const ns = fakeNamespace();
    const noKey = await counterWorker.fetch(post("https://k/prizes/post", { kind: "run", day: 1 }), counterEnv(ns));
    expect(noKey.status).toBe(403);
    const wrongKey = await counterWorker.fetch(post("https://k/prizes/post", { kind: "run", day: 1 }, { "x-admin-key": "guess" }), counterEnv(ns, { ADMIN_KEY: "the-operators-key" }));
    expect(wrongKey.status).toBe(403);
  });

  it("an anonymous file still works everywhere, because trust-on-first-use is the whole point of it", async () => {
    const ns = fakeNamespace();
    const a = createAccount("anon", "BLANK"); // no secret: a file that predates them
    await ns.get(ns.idFromName("anon")).fetch(post("https://file/save", a));
    const res = await campaignWorker.fetch(post("https://c/file/anon/campaign", { op: "faction", faction: "cells" }), campaignEnv(ns));
    expect(res.status).toBe(200);
  });
});

describe("the third review (Stage 56): the Workers' file routes", () => {
  it("the daily view is read-only and needs no secret, through the Durable Object and through the match Worker's GET", async () => {
    const ns = fakeNamespace();
    await seed(ns, "keeper", (a) => void (a.secret = SECRET));
    const direct = await ns.get(ns.idFromName("keeper")).fetch(post("https://file/daily", { id: "keeper" }));
    expect(direct.status).toBe(200);
    expect((await direct.json()) as { contracts: unknown[] }).toHaveProperty("contracts");
    const env = { PLAYER_FILE: ns } as unknown as Parameters<typeof matchWorker.fetch>[1];
    const viaWorker = await matchWorker.fetch(new Request("https://w/file/keeper/daily"), env);
    expect(viaWorker.status).toBe(200);
    expect((await viaWorker.json()) as { contracts: unknown[] }).toHaveProperty("contracts");
  });

  it("a ghost is a write, so it takes the file's secret", async () => {
    const ns = fakeNamespace();
    await seed(ns, "runner", (a) => void (a.secret = SECRET));
    const stub = ns.get(ns.idFromName("runner"));
    const bare = await stub.fetch(post("https://file/ghost", { id: "runner", run: {} }));
    expect(bare.status).toBe(403);
    expect(((await bare.json()) as { reason: string }).reason).toBe(NOT_YOURS);
    const owned = await stub.fetch(post("https://file/ghost", { id: "runner", run: {}, secret: SECRET }));
    expect(owned.status).toBe(200); // refused as not a ghost, not as not the owner
  });

  it("an adopted secret is kept even when the first request fails, so the file cannot be adopted again by someone else", async () => {
    const ns = fakeNamespace();
    const stub = ns.get(ns.idFromName("newbie"));
    const first = (await (await stub.fetch(post("https://file/buy", { id: "newbie", node: "no-such-node", secret: "mine" }))).json()) as { ok: boolean };
    expect(first.ok).toBe(false); // the buy failed; the secret was adopted on the way in
    const other = await stub.fetch(post("https://file/buy", { id: "newbie", node: "slipfile", secret: "theirs" }));
    expect(other.status).toBe(403);
    const again = await stub.fetch(post("https://file/buy", { id: "newbie", node: "no-such-node", secret: "mine" }));
    expect(again.status).toBe(200);
  });
});

describe("the fourth review (Stage 57): a malformed path", () => {
  const bad = "/file/%E0%A4%A/counter";
  it("is a 404 from every Worker, not a thrown request", async () => {
    const ns = fakeNamespace();
    const counterEnv = { PLAYER_FILE: ns, DB: {}, CHAIN_ID: "1", CHAIN_RPC: "https://rpc.invalid", CONTRACTS: "{}", SIGNER_KEY: "0x1", RELAYER_KEY: "0x1" } as unknown as Parameters<typeof counterWorker.fetch>[1];
    const counter = await counterWorker.fetch(post(`https://k${bad}`, { op: "view" }), counterEnv);
    expect(counter.status).toBe(404);
    const campaign = await campaignWorker.fetch(post(`https://c${bad.replace("counter", "campaign")}`, { op: "faction" }), { PLAYER_FILE: ns } as unknown as Parameters<typeof campaignWorker.fetch>[1]);
    expect(campaign.status).toBe(404);
    const match = await matchWorker.fetch(new Request(`https://w${bad.replace("counter", "daily")}`), { PLAYER_FILE: ns } as unknown as Parameters<typeof matchWorker.fetch>[1]);
    expect(match.status).toBe(404);
  });
});
