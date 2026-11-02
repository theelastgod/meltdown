/**
 * The four books, as the file and the wallet print them.
 * A dark chain must not show a token figure. Depth 9 exchanges for Scrip.
 */
import { describe, expect, it } from "vitest";
import { BOOKS, CAPITAL_RULE, CHIT_ZERO_LINE, EARN_PATH, EVM_DARK_LINE, PUBLIC_MINT, claimRecord, chitFate } from "../shared/economy/primer";
import { economyBoardHtml } from "../client/economy-board";
import { walletHtml, walletState, type WalletSource } from "../client/wallet";
import { RUN_DEPTH } from "../shared/sim/run";

const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

describe("the four books", () => {
  it("names them in desk order, and only $CAPITAL is the token", () => {
    expect(BOOKS.map((b) => b.id)).toEqual(["scrip", "wakelight", "chits", "capital"]);
    expect(BOOKS.filter((b) => b.token).map((b) => b.name)).toEqual(["$CAPITAL"]);
    expect(CAPITAL_RULE).toMatch(/NEVER CHANGES A STAT/);
    expect(CAPITAL_RULE).toMatch(/NO WAGER/);
    expect(CAPITAL_RULE).toMatch(/NO STAKE/);
    expect(CHIT_ZERO_LINE).toMatch(/ZERO CHITS/);
    expect(CHIT_ZERO_LINE).toMatch(/XP AND STAMPS/);
    expect(EARN_PATH).toMatch(/ONE POT/);
    expect(EARN_PATH).not.toMatch(/ADDRESS/);
  });

  it("pays Scrip below the gate and units in tonight's pot at it", () => {
    expect(chitFate(RUN_DEPTH - 1)).toMatch(/EXCHANGE FOR SCRIP/);
    expect(chitFate(RUN_DEPTH - 1)).toMatch(new RegExp(`DEPTH ${RUN_DEPTH}`));
    expect(chitFate(RUN_DEPTH - 1)).not.toMatch(/TONIGHT/);
    expect(chitFate(RUN_DEPTH)).toMatch(/TONIGHT'S POT/);
    expect(chitFate(RUN_DEPTH)).not.toMatch(/EXCHANGE FOR SCRIP/);
  });

  it("prints the file's numbers, the fate, and the claim, and withholds a dark balance", () => {
    const contract = "0x1111111111111111111111111111111111111111";
    const live = text(economyBoardHtml({
      scrip: 1240,
      wakelight: 40,
      chits: 3,
      depth: 12,
      capital: "12.5",
      capitalShown: true,
      contract,
      owed: 4,
    }));
    expect(live).toMatch(/SCRIP/);
    expect(live).toMatch(/1,240/);
    expect(live).toMatch(/WAKELIGHT/);
    expect(live).toMatch(/CHITS/);
    expect(live).toMatch(/\$CAPITAL/);
    expect(live).toMatch(/12\.5/);
    expect(live).toMatch(/TONIGHT'S POT/);
    expect(live).toContain(contract);
    expect(live).toContain(claimRecord(4, 12));
    expect(live).toMatch(/NOT SENT/);
    expect(live).toContain(CAPITAL_RULE);
    expect(live).not.toContain(PUBLIC_MINT);

    const dark = text(economyBoardHtml({
      scrip: null,
      wakelight: null,
      chits: null,
      depth: null,
      capital: "12",
      capitalShown: false,
      contract: PUBLIC_MINT,
      owed: null,
    }));
    expect(dark).toMatch(/SEE FILE/);
    expect(dark).not.toMatch(/\$CAPITAL 12/);
    expect(dark).not.toMatch(/\b12\b/);
    expect(dark).toContain(EVM_DARK_LINE);
    expect(dark).not.toContain(PUBLIC_MINT);
  });

  it("records owed units and does not call that a transfer", () => {
    expect(claimRecord(1, RUN_DEPTH)).toMatch(/OWED 1 UNIT/);
    expect(claimRecord(1, RUN_DEPTH)).toMatch(/NOT SENT/);
    expect(claimRecord(1, RUN_DEPTH)).not.toMatch(/SENT\./);
    expect(claimRecord(3, RUN_DEPTH - 1)).toMatch(/PAYS SCRIP/);
    expect(claimRecord(3, RUN_DEPTH - 1)).toMatch(/NOT SENT/);
    expect(claimRecord(3, RUN_DEPTH - 1)).not.toMatch(/TONIGHT/);
  });

  it("puts the file's own books on the wallet page", () => {
    const src: WalletSource = { info: { chainId: 0, devnet: false }, address: null, connecting: false, walletChain: null, holdings: null, last: "" };
    const t = text(walletHtml(walletState(src, true), { scrip: 80, wakelight: 2, chits: 4, depth: 9 }));
    expect(t).toMatch(/SCRIP/);
    expect(t).toMatch(/\b80\b/);
    expect(t).toMatch(/DEPTH 9\. THESE CHITS EXCHANGE FOR SCRIP/);
    expect(t).not.toMatch(/ADDRESS/);
  });

  it("rides on the wallet page without naming an address while disconnected", () => {
    const src: WalletSource = { info: { chainId: 0, devnet: false }, address: null, connecting: false, walletChain: null, holdings: { capital: "12", ghostfile: 0 }, last: "" };
    const t = text(walletHtml(walletState(src, true)));
    expect(t).toContain(CAPITAL_RULE);
    expect(t).toMatch(/ZERO CHITS/);
    expect(t).not.toMatch(/ADDRESS/);
    expect(t).not.toMatch(/\$CAPITAL 12/);
  });
});
