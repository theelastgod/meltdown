/**
 * Does the client send the credential on the routes that demand it? (Stage 29)
 *
 * Stage 26 gave every file a secret and gated the host's mutating routes. It gated them from the
 * server side and never checked the other end of the wire. Three of the client's own POSTs did not
 * carry the secret, so from the moment a file adopted one — which is a player's first match — the
 * host refused them:
 *
 *   - `/file/<id>/buy` and `/refund`: **every Ledger Graph purchase**, which is the whole
 *     progression spend. Broken for three stages.
 *   - `/file/<id>/ghost`: range ghosts, a Stage 8 feature, dead in production.
 *   - `/rooms/open`: not under `/file/`, so the Stage 26 sweep never reached it at all — meaning an
 *     id alone could burn another file's on-chain room-hours.
 *
 * Nothing saw it. The unit tests call `buyNode` directly rather than going through a fetch, and the
 * probes that buy nodes never join a room first, so their files stay anonymous and the gate never
 * closes. `probe:identity` did fail — as a console error reading only "403 (Forbidden)", with no
 * route on it.
 *
 * So this reads the client's source. It is a lint, not a mock: the defect was a missing field in a
 * literal, and the cheapest true statement about a missing field is that it is missing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Routes that call `fileAuth` on the host. A POST to one of these has to carry the secret. */
const GATED = [/\/file\/\$\{[^}]*\}\/(buy|refund|ghost|campaign|claim|rewrite|cosmetic|counter)/, /\/file\/\$\{[^}]*\}\/\$\{op\}/, /\/rooms\/open/, /\/link\/verify/];

interface Post {
  file: string;
  line: number;
  text: string;
}

/** Every `fetch(..., { method: "POST" ... })` in the client, as one line of source each. */
function clientPosts(dir = "client"): Post[] {
  const out: Post[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) {
        readFileSync(p, "utf8").split("\n").forEach((text, i) => {
          if (/fetch\(/.test(text) && /method:\s*"POST"/.test(text)) out.push({ file: p, line: i + 1, text });
        });
      }
    }
  };
  walk(dir);
  return out;
}

describe("the client sends the credential on every route that asks for one", () => {
  const posts = clientPosts();

  it("finds the client's POSTs at all, so an empty pass is not a pass", () => {
    expect(posts.length).toBeGreaterThanOrEqual(6);
  });

  it("every POST to a gated route carries a secret in its body", () => {
    const missing = posts.filter((p) => GATED.some((re) => re.test(p.text)) && !/secret/.test(p.text)).map((p) => `${p.file}:${p.line}`);
    expect(missing).toEqual([]);
  });

  it("the three that were missing it are named, so a revert is loud", () => {
    // buy/refund, ghost and rooms/open — the ones Stage 26 left behind
    const carries = (needle: string): boolean => posts.some((p) => p.text.includes(needle) && /secret/.test(p.text));
    expect(carries("/ghost")).toBe(true);
    expect(carries(`/${"$"}{refund ? "refund" : "buy"}`)).toBe(true);
    expect(carries("/rooms/open")).toBe(true);
  });

  it("a POST to an ungated route is not required to carry one", () => {
    // /link/nonce takes only an account and returns a nonce; it mutates nothing
    const nonce = posts.find((p) => p.text.includes("/link/nonce"));
    expect(nonce).toBeDefined();
    expect(GATED.some((re) => re.test(nonce!.text))).toBe(false);
  });
});
