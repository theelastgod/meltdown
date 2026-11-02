import { describe, expect, it } from "vitest";
import { chooseProvider, pickMetaMask } from "../client/counter";

describe("wallet provider pick", () => {
  it("uses an announced wallet, keeps the page wallet when that is the one announced, and does not invent a provider", () => {
    const page = { request: async () => null };
    const other = { request: async () => "other" };
    expect(chooseProvider(page, [other])).toBe(other);
    expect(chooseProvider(page, [page, other])).toBe(page);
    expect(chooseProvider(page, [])).toBe(page);
    expect(chooseProvider(null, [])).toBeNull();
    expect(chooseProvider(undefined, [other])).toBe(other);
  });

  it("prefers rdns io.metamask, then a real MetaMask in the provider list, and keeps a lone unflagged provider", () => {
    const ask = async () => "mm";
    const mm = { request: ask, isMetaMask: true };
    const phantom = { request: async () => "ph", isMetaMask: true, isPhantom: true, providers: [] as { request: () => Promise<string>; isMetaMask?: boolean; isPhantom?: boolean }[] };
    const brave = { request: async () => "br", isMetaMask: true, isBraveWallet: true };
    const fake = { request: async () => "fake", isMetaMask: true, overrideIsMetaMask: true };
    const plain = { request: async () => "plain" };
    phantom.providers = [phantom, mm];
    expect(pickMetaMask(phantom, [{ rdns: "io.metamask", provider: mm }, { rdns: "app.phantom", provider: phantom }])).toBe(mm);
    expect(pickMetaMask(phantom, [])).toBe(mm);
    expect(pickMetaMask(plain, [])).toBe(plain);
    expect(pickMetaMask(phantom, [])).not.toBe(phantom);
    expect(pickMetaMask({ ...phantom, providers: undefined }, [])).toBeNull();
    expect(pickMetaMask(brave, [])).toBeNull();
    expect(pickMetaMask(fake, [{ provider: fake }])).toBeNull();
    expect(pickMetaMask(null, [])).toBeNull();
  });
});
