import { describe, expect, it } from "vitest";
import { chooseProvider } from "../client/counter";

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
});
