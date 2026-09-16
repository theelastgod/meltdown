/**
 * One request at a time per file on the money route (Stage 58).
 */
import { describe, expect, it } from "vitest";
import { withFileLock, locksHeld } from "../server/file-lock";

const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe("the Node host's file lock", () => {
  it("runs two requests for one file one after the other, and lets different files overlap", async () => {
    const order: string[] = [];
    const op = (tag: string) => async () => {
      order.push(`${tag}:start`);
      await tick();
      order.push(`${tag}:end`);
      return tag;
    };
    const [a, b, c] = await Promise.all([withFileLock("f", op("a")), withFileLock("f", op("b")), withFileLock("g", op("c"))]);
    expect([a, b, c]).toEqual(["a", "b", "c"]);
    expect(order.indexOf("b:start")).toBeGreaterThan(order.indexOf("a:end"));
    expect(order.indexOf("c:start")).toBeLessThan(order.indexOf("a:end"));
    expect(locksHeld()).toBe(0);
  });

  it("a request that throws releases the file, and the next one still runs", async () => {
    await expect(withFileLock("h", async () => { throw new Error("chain down"); })).rejects.toThrow(/chain down/);
    expect(await withFileLock("h", async () => "fine")).toBe("fine");
    expect(locksHeld()).toBe(0);
  });
});
