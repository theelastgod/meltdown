/** `npm run lint:assets` — the manifest against the files on disk, and the plates against what draws them. */
import { ASSETS, ASSET_BUDGET_BYTES, totalAssetBytes } from "./manifest";
import { lintAssets, lintPlatesAreDrawn } from "./lint";
import { UNDRAWN_PLATES } from "./plates";

const v = [...lintAssets(), ...lintPlatesAreDrawn()];
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const drawn = ASSETS.filter((a) => a.kind === "texture").length - UNDRAWN_PLATES.length;
console.log(`asset lint: ${ASSETS.length} asset(s) · ${kb(totalAssetBytes())} of ${kb(ASSET_BUDGET_BYTES)} · ${drawn} plate(s) drawn, ${UNDRAWN_PLATES.length} recorded undrawn · ${v.length} violations`);
for (const x of v) console.log(`  ✗ ${x.asset} [${x.rule}] ${x.detail}`);
if (v.length) process.exit(1);
