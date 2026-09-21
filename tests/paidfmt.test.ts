/**
 * PAID is $CAPITAL, printed to two places (Stage 197).
 *
 * client/file.ts printed `PAID ${run.paid}` raw. After a night at a fractional rate that is
 * 85.04109589041096 on the file, and the prizes line next to it uses toFixed(0).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../client/file.ts", import.meta.url), "utf8");

describe("THE RUN's paid line", () => {
  it("prints $CAPITAL to two places, not the raw float", () => {
    expect(src).toMatch(/PAID \$\{Number\(run\.paid\)\.toFixed\(2\)\} \$CAPITAL/);
    expect(src).not.toMatch(/PAID \$\{run\.paid\} \$CAPITAL/);
  });
});
