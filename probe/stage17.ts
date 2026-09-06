/**
 * Stage 17 probe — the economy, as arithmetic rather than assertion.
 *
 * Every other probe drives the game and looks at what happened. This one reads the constants the
 * game runs on and prints what they imply: what a fixed rate per unit would have emitted against
 * the published schedule, what the settlement emits instead, where the crossover between them
 * falls, and what a day looks like on either side of it. The last section is the check — the
 * settled month must fit the year-one budget at every population, including one the game would be
 * lucky to see.
 *
 * Writes probe/out/stage17-economy.txt. Exits 1 on any failed check.
 *
 *   npm run probe:economy
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { DOC_POPULATION, STRESS_POPULATION, dailyEmissionBudget, emissionSchedule, emissionsAllocation, project, summarise, type Population } from "../shared/economy/model";
import { dilutionThreshold, runPot, settleRun } from "../shared/economy/settlement";
import { lintTokenConstants } from "../shared/economy/lint";
import { MAX_CAPITAL_PER_UNIT, RUN_DAILY_CAP } from "../shared/sim/run";
import { SINKS } from "../shared/economy/sinks";

const out: string[] = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};
const n = (x: number) => Math.round(x).toLocaleString("en-US");
let failures = 0;
const check = (ok: boolean, what: string, detail: string) => {
  say(`${ok ? "  OK " : "  BAD"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

say("MELTDOWN — THE EMISSION SCHEDULE, CHECKED");
say("=========================================");
say();

say("1. THE SCHEDULE (docs/TOKENOMICS.md §4.1–4.2)");
const schedule = emissionSchedule();
schedule.forEach((y, i) => say(`   year ${i + 1}  ${n(y).padStart(12)} $CAPITAL`));
say(`   total    ${n(schedule.reduce((a, b) => a + b, 0)).padStart(12)} of a ${n(emissionsAllocation())} allocation`);
say(`   a day    ${n(dailyEmissionBudget(0)).padStart(12)} in year one, of which THE RUN takes ${n(runPot(0))}`);
say();

say("2. WHAT A FIXED RATE WOULD HAVE COST (the finding)");
const populations: [string, Population][] = [
  ["the doc's month 12", DOC_POPULATION],
  ["the same players at the full cap", { ...DOC_POPULATION, runnerShare: 1, capUse: 1 }],
  ["a hit: 1M MAU", STRESS_POPULATION],
];
say("   population                          demand/mo    × budget   year-one runway");
for (const [label, p] of populations) {
  const r = project(p);
  say(`   ${label.padEnd(33)} ${n(r.emissions.total).padStart(11)}  ${r.budgetRatio.toFixed(1).padStart(7)}×   ${r.yearOneDays.toFixed(0).padStart(4)} days`);
}
say();
say("   Demand is linear in the player count. The schedule is a constant. There is no rate that");
say("   reconciles them, which is why the fix changes the shape and not the number.");
say();

say("3. WHAT THE SETTLEMENT EMITS INSTEAD (the fix)");
say("   population                          settled/mo   × budget   $CAPITAL a unit");
for (const [label, p] of populations) {
  const r = project(p);
  say(`   ${label.padEnd(33)} ${n(r.settled.total).padStart(11)}  ${(r.settled.total / r.monthlyBudget).toFixed(2).padStart(7)}×   ${r.unitRate.toFixed(4).padStart(8)}`);
}
say();
say(`   The crossover is ${n(dilutionThreshold(0))} units a day — about ${n(dilutionThreshold(0) / (RUN_DAILY_CAP * DOC_POPULATION.capUse))} runners, ${n(dilutionThreshold(0) / (RUN_DAILY_CAP * DOC_POPULATION.capUse) / (DOC_POPULATION.dauShare * DOC_POPULATION.runnerShare))} MAU.`);
say(`   Below it the pot never binds and a unit is worth the old ${MAX_CAPITAL_PER_UNIT} $CAPITAL exactly.`);
say();

say("4. A DAY, EITHER SIDE OF IT");
say("   files banking the cap        units       rate    minted       pot   ");
for (const files of [100, 1_000, 2_126, 10_000, 250_000]) {
  const s = settleRun(0, Array.from({ length: files }, (_, i) => ({ account: `f${i}`, units: RUN_DAILY_CAP })));
  say(`   ${n(files).padStart(9)}            ${n(s.units).padStart(11)} ${s.rate.toFixed(4).padStart(9)} ${n(s.minted).padStart(9)} ${n(s.pot).padStart(9)}`);
}
say();

say("5. THE SINKS, AND WHICH OF THEM EXIST");
say("   sink                                 built   burn   note");
for (const k of SINKS) say(`   ${k.label.padEnd(36)} ${(k.built ? "yes" : "NO ").padStart(5)}  ${((k.burnBps / 100).toFixed(0) + "%").padStart(4)}   ${k.note}`);
{
  const r = project();
  say(`   built sinks burn ${n(r.sinks.total)} a month (${(r.burnRatio * 100).toFixed(1)}%); the unbuilt would add ${n(r.sinks.specified)} (${(r.burnRatioSpecified * 100).toFixed(1)}%).`);
  say("   Only the first number may be published. The season buyout was 79% of this table before");
  say("   its contract existed, which is how a 33% burn was being reported as 65%.");
}
say();

say("6. THE MONTH AT THE DOC'S POPULATION");
for (const l of summarise()) say(`   ${l}`);
say();

say("7. CHECKS");
for (const [label, p] of populations) {
  const r = project(p);
  check(r.settled.total <= r.monthlyBudget, `${label}: a settled month fits the year-one budget`, `${n(r.settled.total)} of ${n(r.monthlyBudget)}`);
}
for (const files of [1, 10_000, 250_000]) {
  const s = settleRun(0, Array.from({ length: files }, (_, i) => ({ account: `f${i}`, units: RUN_DAILY_CAP })));
  check(s.minted <= s.pot && s.rate <= MAX_CAPITAL_PER_UNIT, `${n(files)} files: a day never mints past its pot`, `${n(s.minted)} of ${n(s.pot)} at ${s.rate.toFixed(4)}`);
}
const small = settleRun(0, Array.from({ length: 100 }, (_, i) => ({ account: `f${i}`, units: RUN_DAILY_CAP })));
check(small.rate === MAX_CAPITAL_PER_UNIT, "below the crossover the rate is unchanged", `${small.rate} $CAPITAL a unit`);
const doc = project(DOC_POPULATION);
check(doc.burnRatio >= 0.6, "the sinks clear §4.4's month-12 burn target against settled emissions", `${(doc.burnRatio * 100).toFixed(1)}%`);
check(doc.sinks.total / doc.emissions.total < 0.6, "and did not against the unsettled demand, which is what was being missed", `${((doc.sinks.total / doc.emissions.total) * 100).toFixed(1)}%`);
for (const k of SINKS.filter((x) => x.built)) check(k.burnBps > 0, `${k.label}: a built sink burns something`, `${k.burnBps / 100}% of the fee`);
const doc2 = project(DOC_POPULATION);
check(doc2.sinks.total === doc2.sinks.names + doc2.sinks.market + doc2.sinks.buyout + doc2.sinks.rooms, "the published burn counts built sinks only", `${n(doc2.sinks.total)} built, ${n(doc2.sinks.specified)} specified but unwritten`);
const v = lintTokenConstants();
check(v.length === 0, "the economy lint passes on the constants as they stand", v.map((x) => `${x.itemId}: ${x.rule}`).join("; ") || "0 violations");

say();
say(failures === 0 ? `PASS — ${out.filter((l) => l.startsWith("  OK")).length} checks` : `FAIL — ${failures} check(s)`);

mkdirSync("probe/out", { recursive: true });
writeFileSync("probe/out/stage17-economy.txt", out.join("\n") + "\n");
process.exit(failures === 0 ? 0 : 1);
