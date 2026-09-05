/**
 * CI entry point: `npm run lint:fairness [--quick] [--inject=tradeless|netpower]`.
 * Exits non-zero on any violation. Injections exist so the probe can prove
 * the lint bites.
 */
import { runFairnessLint } from "./lint";
import { ALL_ITEMS, LEDGER_ITEMS, type LedgerItem } from "../manifest/items";

const args = process.argv.slice(2);
const quick = args.includes("--quick");
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
console.log(`FAIRNESS LINT ${report.ok ? "PASS" : "FAIL"} — ${report.builds.length} builds, ${report.baseline.length} baseline duels, ${(Date.now() - t0) / 1000}s`);
console.log(`baseline mobility course: ${report.baselineMobility.toFixed(2)} s`);
for (const b of report.builds) console.log(`  ${b.violations.length ? "✗" : "✓"} ${b.name.padEnd(34)} offense ±${(b.worstOffense * 100).toFixed(1)}%  defense ±${(b.worstDefense * 100).toFixed(1)}%  mobility ${b.mobility.toFixed(2)} s${b.beatsEveryBracket ? "  BEATS EVERY BRACKET" : ""}`);
for (const v of report.violations) console.log(`  VIOLATION [${v.build}] ${v.rule}: ${v.detail}`);
process.exit(report.ok ? 0 : 1);
