/**
 * The smoke test for a shipped build: `npm run build` produced dist/; serve it with vite preview,
 * boot the bundle headless, join a room on the Node host, see the sim advance and a frame render,
 * open the menu flow, and close with no page errors. What CI runs after the build and what the
 * Pages deploy runs before publishing.
 *
 *   npm run build && npm run smoke
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PREVIEW_PORT = 5208;
const HOST_PORT = 8810;

function waitFor(child: ChildProcess, re: RegExp, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let ok = false;
    const on = (d: Buffer) => {
      if (!ok && re.test(d.toString())) {
        ok = true;
        resolve();
      }
    };
    child.stdout?.on("data", on);
    child.stderr?.on("data", on);
    child.on("exit", (c) => !ok && reject(new Error(`${what} exited (${c})`)));
    setTimeout(() => !ok && reject(new Error(`${what} did not start`)), 60000);
  });
}

const ARGS = ["--no-proxy-server", "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"];

async function main(): Promise<void> {
  if (!existsSync("dist/index.html")) throw new Error("dist/ is missing: run npm run build first");
  mkdirSync("probe/out", { recursive: true });
  const host = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/node-host.ts", String(HOST_PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(host, /listening/, "node host");
  const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(preview, /127\.0\.0\.1/, "vite preview");
  const browser = await chromium.launch({ args: ARGS });
  const errors: string[] = [];
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail: string) => {
    ok ? pass++ : fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
  };
  try {
    const pg = await browser.newPage({ viewport: { width: 640, height: 360 } });
    pg.on("pageerror", (e) => errors.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const net = `ws://127.0.0.1:${HOST_PORT}/room/smoke?level=drainage_yard`;
    await pg.goto(`http://127.0.0.1:${PREVIEW_PORT}/?headless=1&level=drainage_yard&account=smoke&name=SMOKE&net=${encodeURIComponent(net)}`, { waitUntil: "load" });
    await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 40000, polling: 100 });
    const joined = await pg.waitForFunction(() => window.__game.net()?.status === "joined", null, { timeout: 30000, polling: 100 }).then(() => true, () => false);
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.waitForTimeout(1500);
    const st = await pg.evaluate(() => ({ tick: window.__game.state().tick, level: window.__game.state().level }));
    const px = await pg.evaluate(() => {
      const c = document.getElementById("view") as HTMLCanvasElement;
      return { w: c.width, h: c.height };
    });
    await pg.screenshot({ path: "probe/out/smoke.png" });
    check("the built bundle boots, joins a room on the host, the sim advances and the canvas has a size", joined && st.tick > 30 && px.w > 0 && px.h > 0, `joined ${joined} · tick ${st.tick} · level ${st.level} · canvas ${px.w}×${px.h}`);
    await pg.goto(`http://127.0.0.1:${PREVIEW_PORT}/?headless=1&menu=1&crawl=0&nonav=1`, { waitUntil: "load" });
    // wait for a card to be *up*, not merely for the cards screen: between cards, and for a frame
    // as the screen opens, `cardText` is empty, and the check is about which card it is
    await pg.waitForFunction(() => window.__game?.ready === true && window.__game.menu()?.screen === "cards" && !!window.__game.menu()?.cardText, null, { timeout: 40000, polling: 50 });
    const card = await pg.evaluate(() => window.__game.menu()!.cardText);
    check("the menu flow runs from the built bundle: a title card is up", /leased|woke free/.test(card), `card "${card}"`);
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean console");
    await pg.close();
  } finally {
    await browser.close();
    host.kill();
    preview.kill();
  }
  console.log(`\n${pass}/${pass + fail} smoke checks passed.`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
