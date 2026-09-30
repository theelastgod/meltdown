# Stage 724 — the phone's portrait starts under the bar

The bars are 11vh. A desk plate starts at 12vh. A phone plate started at 8vh, and the plate's layer is above the bar, so the portrait covered it.

`plateTop(true)` is 12. `plateTop(false)` stays 12. The line sets that top, and the phone rule in the stylesheet is 12vh.

Mutation: the phone kept 8. `tests/faceplate.test.ts` failed once: expected 8 to be 12.

Restored.
