/** `npm run lint:progression`: does the Depth ladder pay the whole way up? Exit 1 on any violation. */
import { MAX_DEPTH, totalXpToReach } from "./depth";
import { depthGrants, emptyDepths, lintDepthLadder, longestEmptyRun, MAX_EMPTY_RUN } from "./lint";

/** A ten-minute match at the XP a full match pays, so a stretch of Depths can be read as hours. */
const XP_PER_MATCH = 4200;
const MINUTES_PER_MATCH = 10;
const hoursTo = (d: number) => (totalXpToReach(d) / XP_PER_MATCH) * MINUTES_PER_MATCH / 60;

const grants = depthGrants();
const violations = lintDepthLadder(grants);
const empty = emptyDepths(grants);
const run = longestEmptyRun(grants);

const span = run ? `Depth ${run[0]}–${run[1]} (${run[1] - run[0] + 1}, ${(hoursTo(run[1]) - hoursTo(run[0] - 1)).toFixed(1)} h)` : "none";
console.log(`progression lint: ${grants.length} grants across Depth 1–${MAX_DEPTH} · ${empty.length} Depths grant nothing · longest dead zone ${span}, limit ${MAX_EMPTY_RUN} · ${violations.length} violations`);
console.log(`  the climb to ${MAX_DEPTH} is ${totalXpToReach(MAX_DEPTH).toLocaleString()} xp ≈ ${hoursTo(MAX_DEPTH).toFixed(1)} h at ${XP_PER_MATCH.toLocaleString()} xp per ${MINUTES_PER_MATCH}-minute match`);
for (const d of [10, 20, 30, 40, MAX_DEPTH]) {
  const at = grants.filter((g) => g.depth <= d).length;
  console.log(`  by Depth ${String(d).padStart(2)}: ${String(at).padStart(3)} of ${grants.length} grants in hand (${((hoursTo(d) / hoursTo(MAX_DEPTH)) * 100).toFixed(0)}% of the climb)`);
}
for (const v of violations) console.log(`  VIOLATION ${v.rule}: ${v.detail}`);
if (empty.length) console.log(`  Depths granting nothing: ${empty.join(", ")}`);
process.exit(violations.length ? 1 : 0);
