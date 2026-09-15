/**
 * Stage 51 probe — one server that remembers.
 *
 *  The Node host on a database: a file is made and changed over HTTP (a node bought, a house
 *  chosen, a secret adopted), the process is killed, a new process opens the same database, and
 *  the file is what it was — with the secret still guarding it. Then the control: the same host
 *  without a database forgets, which is what makes the first result mean something.
 *
 *   npm run probe:persist
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { ALL_ITEMS } from "../shared/manifest/items";
import { DEV_KEYS } from "../server/chain/dev-keys";

const PORT = 8831;
const DB = "probe/out/stage51.sqlite";
const SECRET = "probestage51secretaaaaaa";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
};

function start(db: string | null): Promise<{ proc: ChildProcess; banner: string }> {
  return new Promise((resolve, reject) => {
    const { MELTDOWN_DB: _inherited, ...env } = process.env;
    const proc = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], env: { ...env, ...(db ? { MELTDOWN_DB: db } : {}) } });
    let banner = "";
    const on = (d: Buffer) => {
      const t = d.toString();
      if (/listening/.test(t)) {
        banner = t.trim();
        resolve({ proc, banner });
      }
    };
    proc.stdout?.on("data", on);
    proc.stderr?.on("data", on);
    proc.on("exit", (c) => reject(new Error(`host exited (${c})`)));
    setTimeout(() => reject(new Error("host did not start")), 60000);
  });
}

const stop = (proc: ChildProcess) =>
  new Promise<void>((res) => {
    proc.removeAllListeners("exit");
    proc.once("exit", () => res());
    proc.kill("SIGTERM");
  });

const HOST = `http://127.0.0.1:${PORT}`;
const get = async (path: string) => (await fetch(`${HOST}${path}`)).json();
const post = async (path: string, body: unknown) => (await fetch(`${HOST}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

interface FileView {
  id: string;
  depth: number;
  xp: number;
  wallet: { scrip: number };
  owned: string[];
  campaign?: { faction: string | null };
  ledger: string[];
}

async function shape(id: string): Promise<{ bought: string; before: FileView; after: FileView; buy: { ok: boolean; reason?: string }; faction: { ok: boolean } }> {
  const before = (await get(`/file/${id}`)) as FileView; // "rich*" seeds Depth 10 with Scrip to spend
  const node = ALL_ITEMS.find((i) => i.kind === "node" && i.requiresDepth <= before.depth && i.cost <= before.wallet.scrip && !before.owned.includes(i.id))!;
  const buy = (await post(`/file/${id}/buy`, { node: node.id, secret: SECRET })) as { ok: boolean; reason?: string };
  const faction = (await post(`/file/${id}/campaign`, { op: "faction", faction: "cells", secret: SECRET })) as { ok: boolean };
  const after = (await get(`/file/${id}`)) as FileView;
  return { bought: node.id, before, after, buy, faction };
}

async function main(): Promise<void> {
  mkdirSync("probe/out", { recursive: true });
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) if (existsSync(f)) rmSync(f);

  // ---- with a database: change a file, kill the host, restart on the same file
  const a = await start(DB);
  const id = "rich-persist";
  const s = await shape(id);
  await stop(a.proc);
  const b = await start(DB);
  const back = (await get(`/file/${id}`)) as FileView;
  const wrongSecret = (await post(`/file/${id}/buy`, { node: "slipfile", secret: "not-it" })) as { ok: boolean; reason?: string };
  const status = (await fetch(`${HOST}/file/${id}/buy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ node: "slipfile", secret: "not-it" }) })).status;
  check(
    "a file changed over HTTP — a node bought, a house chosen, a secret adopted — is the same file after the host is killed and restarted on its database",
    s.buy.ok && s.faction.ok && s.after.owned.includes(s.bought) && back.owned.includes(s.bought) && back.campaign?.faction === "cells" && back.wallet.scrip === s.after.wallet.scrip && back.wallet.scrip < s.before.wallet.scrip && back.depth === s.before.depth && back.ledger.some((l) => /BOUGHT/.test(l)),
    `bought ${s.bought} (${s.buy.ok ? "ok" : s.buy.reason}) · scrip ${s.before.wallet.scrip} → ${s.after.wallet.scrip} · after restart: owned has it ${back.owned.includes(s.bought)} · faction ${back.campaign?.faction} · scrip ${back.wallet.scrip} · depth ${back.depth} · ledger ${back.ledger.length} lines`,
  );
  check("and the secret survived with it: after the restart a request without it is refused, not adopted afresh", !wrongSecret.ok && status === 403 && /NOT YOUR FILE/.test(wrongSecret.reason ?? ""), `status ${status} · "${wrongSecret.reason}"`);
  check("the host says what it remembered at boot", /db probe\/out\/stage51\.sqlite \(1 files\)/.test(b.banner), b.banner.replace(/^.*listening on /, ""));
  await stop(b.proc);

  // ---- the control: the same host with no database forgets, so the check above can fail
  const c = await start(null);
  const t = await shape("rich-forgets");
  await stop(c.proc);
  const d = await start(null);
  const gone = (await get("/file/rich-forgets")) as FileView;
  check("the control: without a database the same host forgets the same file on restart", t.buy.ok && t.after.owned.includes(t.bought) && !gone.owned.includes(t.bought) && (gone.campaign?.faction ?? null) === null && gone.wallet.scrip === t.before.wallet.scrip && /memory only/.test(d.banner), `bought ${t.bought} · after restart: owned has it ${gone.owned.includes(t.bought)} · faction ${gone.campaign?.faction ?? null} · scrip ${gone.wallet.scrip} (was ${t.before.wallet.scrip})`);
  await stop(d.proc);

  // ---- a real chain needs its keys and a database; the host refuses to start without them rather than run a ledger it would forget
  const refused = await new Promise<{ code: number | null; err: string }>((res) => {
    const p = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CHAIN_RPC: "http://127.0.0.1:1/rpc", CHAIN_ID: "31911", CONTRACTS: "{}", SIGNER_KEY: "0x1", RELAYER_KEY: "0x2" } });
    let err = "";
    p.stderr?.on("data", (x: Buffer) => (err += x.toString()));
    p.on("exit", (code) => res({ code, err: err.split("\n").filter((l) => !/ExperimentalWarning|--trace-warnings/.test(l)).join("\n") }));
    setTimeout(() => {
      p.kill();
      res({ code: null, err: err + " (timed out)" });
    }, 30000);
  });
  check("a real chain without a database is refused at boot, by name", refused.code === 2 && /MELTDOWN_DB/.test(refused.err), `exit ${refused.code} · ${refused.err.trim().slice(0, 140)}`);

  // ---- and a published dev key on a real chain is refused even with everything else in place (Stage 53)
  const devKeyed = await new Promise<{ code: number | null; err: string }>((res) => {
    const p = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(PORT)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MELTDOWN_DB: DB, CHAIN_RPC: "http://127.0.0.1:1/rpc", CHAIN_ID: "31911", CONTRACTS: "{}", SIGNER_KEY: DEV_KEYS.signer, RELAYER_KEY: "0x1111111111111111111111111111111111111111111111111111111111111111" } });
    let err = "";
    p.stderr?.on("data", (x: Buffer) => (err += x.toString()));
    p.on("exit", (code) => res({ code, err: err.split("\n").filter((l) => !/ExperimentalWarning|--trace-warnings/.test(l)).join("\n") }));
    setTimeout(() => {
      p.kill();
      res({ code: null, err: err + " (timed out)" });
    }, 30000);
  });
  check("a published dev key on a real chain is refused at boot: the placeholder cannot be the key", devKeyed.code === 2 && /DEV KEY ON A REAL CHAIN/.test(devKeyed.err), `exit ${devKeyed.code} · ${devKeyed.err.trim().slice(0, 120)}`);

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
