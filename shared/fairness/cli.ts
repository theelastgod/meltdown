/**
 * CI entry point: `npm run lint:fairness [--quick] [--record] [--inject=tradeless|netpower]`.
 *
 * Exits non-zero on any violation that is not in the recorded debt, on any recorded one that got
 * worse, and on any schema problem. Injections exist so the probe can prove the lint bites.
 *
 * `--quick` duels three of the eight weapons and is for local iteration only. CI runs the full
 * lint: for the whole life of this project it ran `--quick`, and every violation the full lint has
 * ever reported is on weapons the quick set does not contain (Stage 173).
 *
 * `--record` rewrites `debt.ts` from the current run. It is a deliberate act — it says "these are
 * the violations we have looked at and accepted for now" — and the diff it produces is the thing to
 * review, not the command.
 */
import { reconcileDebt, runFairnessLint, type DebtEntry } from "./lint";
import { FAIRNESS_DEBT } from "./debt";
import { ALL_ITEMS, LEDGER_ITEMS, type LedgerItem } from "../manifest/items";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const record = args.includes("--record");
const inject = args.find((a) => a.startsWith("--inject="))?.split("=")[1];

if (inject === "tradeless") {
  const bad: LedgerItem = { id: "free_lunch", kind: "node", name: "FREE LUNCH", ring: 1, requiresDepth: 1, cost: 100, links: ["slipfile"], benefits: [{ stat: "damage", delta: 0.1 }], costs: [], line: "FREE LUNCH: +10% damage" };
  LEDGER_ITEMS.push(bad);
  ALL_ITEMS.push(bad);
} else if (inject === "netpower") {
  // reconciles on paper (a heavy cosmetic-ish cost) but wins every duel: the simulation must catch it
  const bad: LedgerItem = { id: "quiet_power", kind: "node", name: "QUIET POWER", ring: 1, requiresDepth: 1, cost: 100, links: ["slipfile"], benefits: [{ stat: "damage", delta: 0.12 }], costs: [{ stat: "footstep", delta: 0.82 }], line: "QUIET POWER: +12% damage / footsteps much louder" };
  LEDGER_ITEMS.push(bad);
  ALL_ITEMS.push(bad);
}

const t0 = Date.now();
const builds = inject ? [{ name: `injected:${inject}`, loadout: { primary: "lease_breaker" as const, secondary: "shock_baton" as const, attested: [inject === "tradeless" ? "free_lunch" : "quiet_power"], keystone: null } }] : undefined;
const report = runFairnessLint({ quick, builds });

// An injected build is a deliberate bad actor: it is checked against nothing, it must simply be caught.
const debt: readonly DebtEntry[] = inject || quick ? [] : FAIRNESS_DEBT;
const d = reconcileDebt(report.violations, debt);
const ok = inject || quick ? report.ok : d.ok;

console.log(`FAIRNESS LINT ${ok ? "PASS" : "FAIL"} — ${report.builds.length} builds, ${report.baseline.length} baseline duels, ${(Date.now() - t0) / 1000}s`);
console.log(`baseline mobility course: ${report.baselineMobility.toFixed(2)} s`);
for (const b of report.builds) console.log(`  ${b.violations.length ? "✗" : "✓"} ${b.name.padEnd(34)} offense ±${(b.worstOffense * 100).toFixed(1)}%  defense ±${(b.worstDefense * 100).toFixed(1)}%  mobility ${b.mobility.toFixed(2)} s${b.beatsEveryBracket ? "  BEATS EVERY BRACKET" : ""}`);

if (record) {
  // full precision, not a rounded figure: the ratchet compares against this and a rounded record
  // would read every unchanged run as very slightly worse
  const entries = report.violations.map((v) => ({ key: v.key, magnitude: v.magnitude, detail: `[${v.build}] ${v.rule}: ${v.detail}` }));
  const body = `/**
 * The Fairness Lint's recorded debt (Stage 173): every violation the full lint reports today,
 * written down so that a new one cannot hide among them.
 *
 * This file is NOT a list of things that are fine. Every line is a build that moves a weapon's
 * time-to-kill further than the ledger's ±4% promise allows, and every one is a balance decision
 * waiting to be made. Delete a line when the build stops violating; the lint reports cleared
 * entries on every run and never fails for one.
 *
 * Regenerate with \`npm run lint:fairness -- --record\`. The diff is the thing to review.
 */
import type { DebtEntry } from "./lint";

export const FAIRNESS_DEBT: readonly DebtEntry[] = ${JSON.stringify(entries, null, 2)};
`;
  writeFileSync(new URL("./debt.ts", import.meta.url), body);
  console.log(`\nrecorded ${entries.length} violation(s) to shared/fairness/debt.ts`);
  process.exit(0);
}

if (quick) {
  for (const v of report.violations) console.log(`  VIOLATION [${v.build}] ${v.rule}: ${v.detail}`);
  console.log(`\nquick run: three weapons duelled, the recorded debt not consulted. CI runs the full lint.`);
  process.exit(report.ok ? 0 : 1);
}

if (inject) {
  for (const v of report.violations) console.log(`  VIOLATION [${v.build}] ${v.rule}: ${v.detail}`);
  // an injection that is caught fails the lint, which is the point: exit 1 is the probe's PASS
  process.exit(report.ok ? 0 : 1);
}

for (const { violation: v, was } of d.worsened) console.log(`  WORSE [${v.build}] ${v.rule}: ${v.detail} — recorded at ${(was * 100).toFixed(1)}%`);
for (const v of d.fresh) console.log(`  NEW [${v.build}] ${v.rule}: ${v.detail}`);
for (const c of d.cleared) console.log(`  CLEARED (delete from debt.ts) ${c.detail}`);
console.log(`\nrecorded debt ${debt.length} · still violating ${report.violations.length - d.fresh.length} · new ${d.fresh.length} · worse ${d.worsened.length} · cleared ${d.cleared.length}`);
process.exit(ok ? 0 : 1);
