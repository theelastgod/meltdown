/**
 * The live check: a headless browser opens the deployed client and joins a room on the deployed
 * match Worker, then reads the sim advancing. What to run after a deploy.
 *
 *   npm run probe:live -- https://meltdown-45y.pages.dev wss://meltdown-match.wendellphillips.workers.dev
 */
import { chromium } from "playwright";

const [pages, ws] = process.argv.slice(2);
if (!pages || !ws) {
  console.error("usage: probe:live <pagesUrl> <matchWorkerWsUrl>");
  process.exit(2);
}
const ARGS = ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

async function main(): Promise<void> {
  // a sandbox that reaches the internet through a proxy: the browser goes through it too
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const browser = await chromium.launch({ args: [...ARGS, ...(proxy ? [`--proxy-server=${proxy}`, "--ignore-certificate-errors"] : [])] });
  const errors: string[] = [];
  try {
    const pg = await browser.newPage({ viewport: { width: 640, height: 360 }, ignoreHTTPSErrors: true });
    pg.on("pageerror", (e) => errors.push(String(e)));
    const room = `live-${Date.now().toString(36)}`;
    const net = `${ws}/room/${room}?level=drainage_yard`;
    await pg.goto(`${pages}/?headless=1&level=drainage_yard&account=live-check&name=LIVE&net=${encodeURIComponent(net)}`, { waitUntil: "load" });
    await pg.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60000, polling: 100 });
    const joined = await pg.waitForFunction(() => window.__game.net()?.status === "joined", null, { timeout: 60000, polling: 100 }).then(() => true, () => false);
    const kick = await pg.evaluate(() => window.__game.net()?.kickReason ?? "");
    await pg.evaluate(() => window.__game.setRealtime(true));
    await pg.waitForTimeout(2500);
    const st = await pg.evaluate(() => ({ tick: window.__game.state().tick, rtt: window.__game.net()?.rttMs, snapshots: window.__game.net()?.stats.snapshots, mode: window.__game.endgame().mode }));
    await pg.screenshot({ path: "probe/out/live.png" });
    const ok = joined && st.tick > 30 && (st.snapshots ?? 0) > 5 && errors.length === 0;
    console.log(`${ok ? "PASS" : "FAIL"}  the deployed client joins a room on the deployed Worker and the sim runs  — joined ${joined} ${kick} · tick ${st.tick} · rtt ${st.rtt} ms · snapshots ${st.snapshots} · errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
