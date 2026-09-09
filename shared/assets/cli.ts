/** `npm run lint:assets` — the manifest against the files on disk. */
import { ASSETS, ASSET_BUDGET_BYTES, totalAssetBytes } from "./manifest";
import { lintAssets } from "./lint";

const v = lintAssets();
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
console.log(`asset lint: ${ASSETS.length} asset(s) · ${kb(totalAssetBytes())} of ${kb(ASSET_BUDGET_BYTES)} · ${v.length} violations`);
for (const x of v) console.log(`  ✗ ${x.asset} [${x.rule}] ${x.detail}`);
if (v.length) process.exit(1);
