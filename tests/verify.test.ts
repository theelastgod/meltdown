/**
 * The gate checks what the project says it checks (Stage 30).
 *
 * `npm run verify` is the list of everything this project claims to verify about itself, and
 * `.github/workflows/verify.yml` is the one that actually runs on every push. They were different.
 * `lint:campaign` (Stage 25), `probe:economy` (Stage 17) and `probe:frame` (Stage 21) were each
 * added to the script and never to the workflow, so three stages shipped a check that ran only when
 * someone remembered to run it by hand.
 *
 * The drift is invisible by construction: both files look complete on their own, and you only see
 * the gap by putting them side by side, which nobody does. So this does it on every test run.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const WORKFLOW = ".github/workflows/verify.yml";

/** The npm scripts `npm run verify` chains together, in order. */
function verifyScript(): string[] {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  return pkg.scripts.verify!.split("&&").map((s) => s.trim()).filter((s) => s.startsWith("npm run")).map((s) => s.replace(/^npm run /, "").trim());
}

/** The npm scripts the workflow runs, in order. */
function workflowSteps(): string[] {
  return [...readFileSync(WORKFLOW, "utf8").matchAll(/^\s*- run: npm run (.+)$/gm)].map((m) => m[1]!.trim());
}

describe("the gate runs what the project says it runs", () => {
  const script = verifyScript();
  const workflow = workflowSteps();

  it("reads both lists, so an empty comparison is not a pass", () => {
    expect(script.length).toBeGreaterThan(20);
    expect(workflow.length).toBeGreaterThan(20);
  });

  it("every check in `npm run verify` is a step in the workflow", () => {
    // the direction that matters: a check the project claims and CI never runs
    expect(script.filter((s) => !workflow.includes(s))).toEqual([]);
  });

  it("every workflow step is a real npm script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    const missing = workflow.map((w) => w.split(" ")[0]!).filter((name) => !(name in pkg.scripts));
    expect(missing).toEqual([]);
  });

  it("no step can skip the ones after it", () => {
    /**
     * Thirty-nine runs failed at `probe:net` and skipped the eighteen steps behind it, so the
     * probes that would have caught Stages 26-29's regressions never ran at all. Every step that
     * runs a check must be guarded so a red one does not decide what gets measured.
     */
    const yml = readFileSync(WORKFLOW, "utf8");
    const runSteps = [...yml.matchAll(/^\s*- run: (?!npm ci$)(?!npx playwright).+\n(?:\s*if: (.+)\n)?/gm)];
    const unguarded = runSteps.filter((m) => !m[1] || !/cancelled\(\)/.test(m[1])).map((m) => m[0].trim().split("\n")[0]);
    expect(unguarded).toEqual([]);
  });

  it("the timeout is long enough for a run that cannot finish in fifteen minutes", () => {
    const m = /timeout-minutes:\s*(\d+)/.exec(readFileSync(WORKFLOW, "utf8"));
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(45);
  });
});
