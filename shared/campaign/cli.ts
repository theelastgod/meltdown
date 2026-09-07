/** `npm run lint:campaign`: can the campaign be finished? Exit 1 on any violation. */
import { MISSIONS } from "./missions";
import { SCRIPTS } from "./script";
import { ENDINGS } from "./testimony";
import { lintCampaign, producibleTestimony } from "./lint";

const all = lintCampaign();
const errors = all.filter((x) => x.severity === "error");
const notes = all.filter((x) => x.severity === "note");
const missions = MISSIONS.filter((m) => m.kind === "mission").length;
const gigs = MISSIONS.length - missions;
console.log(`campaign lint: ${missions} missions · ${gigs} gigs · ${SCRIPTS.length} scripts · ${ENDINGS.length} endings · ${producibleTestimony().size} testimony keys · ${errors.length} errors · ${notes.length} notes`);
for (const x of errors) console.log(`  ERROR ${x.where}: ${x.rule} — ${x.detail}`);
for (const x of notes) console.log(`  note  ${x.where}: ${x.rule} — ${x.detail}`);
if (notes.length && !errors.length) console.log(`\n  Notes do not fail the build: a choice that changes nothing mechanical may be characterisation,\n  and that is a designer's call. They are printed so the call gets made rather than forgotten.`);
process.exit(errors.length ? 1 : 0);
