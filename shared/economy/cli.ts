/** `npm run lint:economy`: the one rule over the full manifest, for CI. Exit 1 on any violation. */
import { economyManifest } from "./catalog";
import { lintEconomy, lintTokenConstants } from "./lint";

const items = economyManifest();
const v = [...lintEconomy(items), ...lintTokenConstants()];
console.log(`economy lint: ${items.length} items · ${v.length} violations`);
for (const x of v) console.log(`  ${x.itemId}: ${x.rule} — ${x.detail}`);
process.exit(v.length ? 1 : 0);
