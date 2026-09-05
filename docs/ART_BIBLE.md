# MELTDOWN — Art Bible (from the reference clip)

Ground truth is the 12-second gameplay clip supplied by the project owner.
Everything below is read directly off its frames; the finished game must look
like the place that clip was filmed. (The longer "Metrophage" trailer is *not*
a reference and is ignored.)

## What the clip shows

**0–2 s — the city.** A helicopter drift over a low-poly kitbash skyline at
night. Every building is a dark slab whose *edges* carry neon: magenta and
cyan strip-lights run along ledges, parapets, and setbacks, so the silhouette
reads as glowing wireframe on near-black. Windows are sparse warm/cyan
rectangles. A few billboards (yellow, pink) are flat emissive quads with
pixel text. Sky is pure black; haze softens everything past ~200 m.

**2–8 s — street level.** Rain-slick alleys. The ground is very dark with a
sheen; puddles reflect the strip-lights as long vertical smears. Walls are
concrete/brick-adjacent flat colour with almost no texture detail; the
lighting does the work. Props are voxel/kitbash: shutters, barrels, crates,
vending machines, a magenta pedestrian rail with a cyan light bar. Food-stall
signage is cyan/magenta with bright yellow accents. Neon tubes are physically
thin (≈4–6 cm) and bloom outward. Muzzle flashes and explosions are hot
yellow-orange and short.

**8–11 s — interior.** A metro/service tunnel: cool grey-green ribbed walls,
cyan and green light bars, a big circular bulkhead door with a green
hexagonal lock glyph. The tunnel ends in a blown-out white light — the one
"clean" light source in the clip; this is the register for Wern's office.

**HUD (throughout).** Diegetic terminal chrome, pixel monospace font. Panels
are thin 1-px outlines in magenta or green on translucent black. Top-left:
handle, zone, online count, XP bar (cyan), currency. Top-centre: a magenta
mission strip. Right: an "AREA MAP" mini-radar with orange dots. Bottom-left:
a scrolling comms log. Bottom-right: tabbed ledger (Bag / Skills / Map /
Market / Quests). Everything typed, nothing rounded, no icons except glyphs.

## Rules we derive from it

| Element | Rule |
| --- | --- |
| Base value | World albedo is near-black; surfaces read only where a neon strip lights them. |
| Neon | Cyan (#35F2FF) and magenta (#FF3EC9) dominate. Amber (#FFB02E) = VANTAGE threat only. Green (#37FF8B) = the wake only. Blood-red = THE KERNEL / campaign power only. |
| Geometry | Low-poly kitbash. Edges are the design: every ledge and parapet is a candidate for a strip-light. |
| Wet | Ground is a mirror in the distance and a diffuse smear up close. Rain is volumetric streaks lit by the nearest neon. |
| Fog | Exponential, colour-cast per district, never grey. |
| Post | Film grain + chromatic aberration + faint scanlines + anamorphic bloom, as one full-screen pass. |
| Characters | Hooded silhouettes; faces never lit. Faction trim is a strip-light on the body. |
| UI | CRT ledger chrome: monospace, 1-px frames, typed-then-held text, glitch/tear transitions, stamp and receipt-printer sounds. No generic game UI anywhere. |
| Clean light | Blown-out white is reserved. It is what the Kernel's office looks like. |

## Stage map for the look

- **Stage 1 (this stage):** grey-box with neon edge strips and the CRT HUD
  skeleton. Lighting is intentionally raised so geometry is legible in proof
  screenshots; it drops to the near-black base in Stage 3.
- **Stage 3:** lighting rig, GPU rain, wet reflections, fog, post chain,
  district colour casts, screenshot-diff tests against frames from the clip.
- **Stage 9:** three districts of Lethe kitbashed from this vocabulary, THE
  KERNEL on every horizon.
