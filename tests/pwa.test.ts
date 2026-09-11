/**
 * Installable, and the worker stays out of the game (Stage 45).
 *
 * The mobile build (Stage 32) is the same site served to a phone; nothing let a player put it on a
 * home screen or open it without a connection. This is that layer, and these cases hold the two
 * things that matter about it: the pieces a browser needs to offer "install" are actually there
 * and agree with each other, and the service worker cannot reach anything with money or match
 * state in it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pngSize } from "../shared/assets/lint";

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as { name: string; short_name: string; start_url: string; scope: string; display: string; orientation?: string; background_color: string; theme_color: string; icons: { src: string; sizes: string; type: string; purpose?: string }[] };
const sw = readFileSync("public/sw.js", "utf8");
const html = readFileSync("index.html", "utf8");
const headers = readFileSync("public/_headers", "utf8");

describe("the manifest is one a browser will offer to install", () => {
  it("has the fields the install prompt requires, and they agree with the page", () => {
    expect(manifest.name).toBe("MELTDOWN");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("landscape"); // the touch HUD is drawn for a phone on its side
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(new RegExp(`<meta name="theme-color" content="${manifest.theme_color}"`).test(html)).toBe(true);
  });

  it("every icon it names exists on disk at the size it claims, and one is at least 512", () => {
    let biggest = 0;
    for (const icon of manifest.icons) {
      const buf = readFileSync(`public${icon.src}`);
      const dim = pngSize(buf);
      expect(dim, icon.src).not.toBeNull();
      expect(`${dim!.width}x${dim!.height}`, icon.src).toBe(icon.sizes);
      expect(icon.type).toBe("image/png");
      biggest = Math.max(biggest, dim!.width);
    }
    expect(biggest).toBeGreaterThanOrEqual(512);
    expect(manifest.icons.some((i) => /maskable/.test(i.purpose ?? ""))).toBe(true);
  });

  it("is served with its own content type, and the worker is never browser-cached", () => {
    expect(headers).toMatch(/\/manifest\.webmanifest\n\s+Content-Type: application\/manifest\+json/);
    expect(headers).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/);
  });
});

describe("the service worker cannot reach the game", () => {
  it("ignores everything that is not a same-origin GET", () => {
    expect(sw).toMatch(/req\.method !== "GET"\)\s*return/);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\)\s*return/);
    expect(sw).toMatch(/upgrade"\) === "websocket"\)\s*return/);
  });

  it("names no host the money or the match lives on", () => {
    // the Workers hosts are build-time VITE_ values; the worker must not know them, let alone cache them.
    // The check governs code, not prose: the header comment is allowed to say what the worker avoids.
    // A "//" only opens a comment at the start of a line or after whitespace, so a URL in a string
    // ("https://…") stays in the code the check sees. The mutation that put one there proved the
    // naive stripper hid it.
    const code = sw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    expect(code).not.toMatch(/VITE_|workers\.dev|\/room\/|\/match|\/file\/|\/prizes|\/counter|rpc/i);
  });

  it("only ever caches the shell and the static paths, and cleans up old versions", () => {
    expect(sw).toMatch(/pathname\.startsWith\("\/assets\/"\)/);
    expect(sw).toMatch(/pathname\.startsWith\("\/icons\/"\)/);
    expect(sw).toMatch(/caches\.delete/);
    expect(sw).toMatch(/clients\.claim\(\)/);
    expect(sw).toMatch(/skipWaiting\(\)/);
  });

  it("install precaches what the shell references, not just the shell: a first visit is enough to boot offline", () => {
    // Stage 46: the bundles are requested before the worker controls the page, so "/" alone in the
    // cache is an installed app that cannot start. The install step reads the shell's /assets and
    // /icons references out of the HTML and caches them all before it completes.
    const install = sw.slice(sw.indexOf("async function precache"), sw.indexOf('addEventListener("install"'));
    expect(install).toMatch(/fetch\("\/"/);
    expect(install).toMatch(/assets\|icons/);
    expect(install).toMatch(/addAll\(refs\)/);
    expect(sw).toMatch(/waitUntil\(precache\(\)/);
    // and the lookup must ignore Vary: with "Vary: Origin" from the origin, a module script's request
    // (which carries Origin) would never match the precached entry (fetched without one) — the exact
    // miss the smoke probe found with the cache full and the bundles still failing
    expect(sw).toMatch(/c\.match\(req, \{ ignoreVary: true \}\)/);
    expect(sw).toMatch(/caches\.match\("\/", \{ ignoreVary: true \}\)/);
  });

  it("navigations are network-first, so a connected player always gets the newest build", () => {
    const nav = sw.slice(sw.indexOf('mode === "navigate"'));
    expect(nav.indexOf('caches.match("/"')).toBeGreaterThan(-1);
    expect(nav.indexOf("fetch(req)")).toBeLessThan(nav.indexOf('caches.match("/"'));
  });
});
