# The backlog — verified, unfixed findings

Forty-nine candidates came out of a parallel sweep over this repository. Each was put to
independent adversarial verification that defaulted to *refuted*, and **32 survived**; two of those
turned out to be the same finding reported twice. Nineteen have since been fixed (Stages 168–186) and
are listed at the foot of this file with the commit that closed them.

The **12 below are open**. Every one has been read in the source — none is a hunch.

They are not a work order. The standing method is to take one, **verify it yourself before building
anything** — the entries here are a starting point, not evidence — then fix it, guard it with a
mutation-tested check, and ship it as one stage. Several entries turned out sharper or wider than
first written once measured, and one ("stranded units") is two findings tangled together.

Ordered roughly by how much a player would notice, not by how easy they are. Item numbers are
stable ids, not a queue.


## Weapons and firmware

### 10. OVERCHARGE sells "pierces cover", but the stock rail already sets pierce:true and pierce never passes level geometry

`shared/manifest/firmwares.ts:28`

**What the code promises.** The rank-28 LONGWAVE firmware's line is "+8% charge time, +8% damage, pierces cover" — two stat
changes plus a third, headline capability.

**What it does.** Two separate failures. (a) The stock LONGWAVE already carries `charge: { time: 0.9, damage: 110,
pierce: true }` at shared/weapons/manifest.ts:162, and shared/sim/weapons.ts:384 passes `pierce:
c.pierce` straight through — so OVERCHARGE's `pierce: true` overwrites true with true and grants
nothing. (b) `pierce` does not mean cover-piercing anywhere in the sim: castRay first clamps
`worldT` to the nearest level box (world.ts:383-386), then every rayCapsule candidate test is
bounded by that same worldT (world.ts:401, 419, 424, 429). A target behind a wall is never a
candidate, pierce or not; pierce only decides whether more than one candidate in front of the
wall is damaged (world.ts:434).

**Measured.** Read WEAPONS.longwave.charge.pierce (already true) before applying the firmware. Falsifiable in
sim: stand two dummies in a line behind a box, fire a charged rail with and without OVERCHARGE —
the emitted `shot` event's `hits` array is identical and contains nothing beyond the box, while
two dummies in the open are both hit with the stock weapon.

**What a player sees.** A player at LONGWAVE rank 28 flashes OVERCHARGE expecting to shoot through cover, and pays a
real +8% charge time for it. They get neither a new capability nor the advertised one: the stock
rail already punches through stacked bodies, and no rail shot of any kind passes a wall.

### 11. REPO HAMMER chip lines print the un-scaled template numbers; every spread chip on that weapon is ~30% weaker than its text

`shared/manifest/chips.ts:104`

**What the code promises.** chips.ts:96-118 builds each weapon's chip from a shared template and then prints `line` verbatim
in the GHOSTFILE kit panel (client/file.ts:777). For the REPO HAMMER those lines read "CHOKE:
−12% spread / +12% recoil", "HEAVY BARREL: +3% range, −5% spread / −9% ADS strafe", "FLASH CUT:
−8% spread, quieter / +8% recoil, −4.5% reload", "COUNTERWEIGHT: −10% spread, −4% recoil / −1.5%
move, −10% ADS strafe".

**What it does.** SPREAD_SCALE (chips.ts:79) multiplies the hammer's spread benefits by 0.7 and settle() then
rescales the costs to match, but chips.ts:116 rewrites the line only for the clockeater's
fireRate→reload substitution. Real values: choke −8.5% spread / +8.5% recoil; heavy_barrel −3.5%
spread / −7.5% ADS strafe; flash_cut −5.5% spread / +6.5% recoil, −3.75% reload; counterweight
−7% spread / −1.25% move, −7.75% ADS strafe.

**Measured.** npx tsx: `chipById("repo_hammer:choke")` → benefits [{spread,-0.085}], costs [{recoil,0.085}],
line "CHOKE: −12% spread / +12% recoil". Compare chipById("lease_breaker:choke") → ±0.12 with
the identical line.

**What a player sees.** A REPO HAMMER player comparing chips in the kit panel reads numbers 27-30% larger than what they
get — they pick between a chip whose real spread benefit is −3.5% and one that claims −5%, or
plan a pellet-cone build around −12% that is actually −8.5%. The costs are overstated too, so
the ledger shown does not match the ledger applied.

### 12. Firmware damage lines drift from the integers the code produces, and DOUBLE BARREL hides a −33% magazine cost

`shared/manifest/firmwares.ts:23`

**What the code promises.** DOUBLE BARREL (firmwares.ts:23) — "two shells per trigger 0.7 s apart, then a long reset; −8%
pellet damage". SLAM FIRE (:24) — "+20% rate, −15% pellet damage, a little wider". THREE-COUNT
(:21) — "+15% damage". MEASURED (:26) — "+26% damage".

**What it does.** Every patch rounds to an integer on a small base and the lines were written from the multiplier
rather than the result. DOUBLE BARREL: Math.round(10×0.92)=9, i.e. −10% not −8%, AND `magSize:
Math.max(2, d.magSize - 2)` takes the hammer from 6 shells to 4 (−33%), which the line never
mentions. SLAM FIRE: Math.round(10×0.85) = Math.round(8.5) = 9 (JS rounds half up), so −10%
instead of the advertised −15% — the nerf is a third smaller than stated (72 pellet damage per
shell instead of the intended 68). THREE-COUNT: Math.round(16×1.15)=18, +12.5% not +15%.
MEASURED: Math.round(9×1.26)=11, +22.2% not +26%.

**Measured.** npx tsx: for each FirmwareDef, `f.patch(WEAPONS[f.weapon])` diffed against the base.
repo_hammer: damage 10→9 (−10%) and magSize 6→4 for double_barrel; 10→9 (−10%) for slam_fire;
lease_breaker 16→18 (+12.5%); stack_smg 9→11 (+22.2%).

**What a player sees.** A REPO HAMMER player picks DOUBLE BARREL for its two-shell burst and finds mid-fight they have
four shells instead of six — a cost the kit panel never showed. A player choosing between SLAM
FIRE ("−15% damage") and DOUBLE BARREL ("−8% damage") is told SLAM FIRE hits softer when both
land on 9 damage per pellet. MEASURED buyers get 3.8 percentage points less damage than
promised.


## Ledger items and chip lines

### 13. Four STACK SMG chip lines say "spread" where the chip changes recoil; COUNTERWEIGHT delivers 3.4x the recoil it advertises

`shared/manifest/chips.ts:116`

**What the code promises.** chips.ts:116 builds each chip's player-facing line. It contains an explicit rewrite for one stat
substitution — the clockeater's fireRate→reloadSpeed swap — replacing "+2% fire rate" with the
computed "+6.25% reload". No such rewrite exists for the spread→recoil substitution declared at
chips.ts:80.

**What it does.** Every STACK SMG chip whose template carries a spread benefit ships a line naming a stat the chip
does not touch: stack_smg:choke (template chips.ts:51) "−12% spread" → recoil -0.12;
stack_smg:heavy_barrel (chips.ts:53) "+3% range, −5% spread" → range +0.03, recoil -0.05;
stack_smg:flash_cut (chips.ts:54) "−8% spread" → recoil -0.08; stack_smg:counterweight
(chips.ts:60) "−10% spread, −4% recoil" → benefits [recoil -0.10, recoil -0.04]. COUNTERWEIGHT
is the worst: it is not a cancellation but a doubling — applyMods compounds 0.90 * 0.96 = 0.864,
so the chip delivers −13.6% recoil where its line claims −4% recoil and −10% spread. The SMG's
spread is left at exactly 1.0 by all four.

**Measured.** For each chip in CHIPS, assert every percentage named in `line` is present in `[...benefits,
...costs]` on the stat the words name. For stack_smg:counterweight, kitFor gives mods.spread ===
1 and mods.recoil === 0.864; the line asserts spread === 0.90 and recoil === 0.96.

**What a player sees.** The SMG's whole chip identity as printed is a lie about which knob moves. A player choosing
COUNTERWEIGHT to tighten the hip cone for 25-40 m fights gets no cone change at all, while
unknowingly getting three times the recoil control the line offers; a player comparing
COUNTERWEIGHT ("−10% spread, −4% recoil") against COMPENSATOR ("−12% recoil / +12% spread") on
the SMG is comparing two descriptions of which only one is true of the SMG.

### 14. Every REPO HAMMER spread chip quotes the unscaled template number: CHOKE says −12% and delivers −8.5%

`shared/manifest/chips.ts:79`

**What the code promises.** SPREAD_SCALE (chips.ts:79) scales the repo_hammer's spread benefits by 0.7, and settle()
(chips.ts:88-94) then rescales that chip's costs by k = benefits/costs to keep the ledger
balanced. The lines are carried through verbatim from TEMPLATES by chips.ts:116.

**What it does.** The scaled numbers and the printed numbers diverge on four hammer chips. repo_hammer:choke —
line "−12% spread / +12% recoil", actual spread -0.085, recoil +0.085 (kitFor: spread = 0.915,
recoil = 1.085). repo_hammer:heavy_barrel (chips.ts:53) — line "+3% range, −5% spread / −9% ADS
strafe", actual spread -0.035, adsMove -0.075. repo_hammer:flash_cut (chips.ts:54) — line "−8%
spread ... +8% recoil, −4.5% reload", actual spread -0.055, recoil +0.065, reloadSpeed -0.0375.
repo_hammer:counterweight (chips.ts:60) — line "−10% spread, −4% recoil / −1.5% move, −10% ADS
strafe", actual spread -0.07, moveSpeed -0.0125, adsMove -0.0775. Separately, settle()'s
rounding at chips.ts:93 shifts QUICK SEAT (chips.ts:61) on ALL EIGHT weapons: line "+20% reload
/ +14% recoil, +9% spread", actual costs recoil +0.1425, spread +0.0925.

**Measured.** kitFor({...DEFAULT_LOADOUT, primary:"repo_hammer",
chips:{repo_hammer:{muzzle:"repo_hammer:choke"}}}).repo_hammer.mods — line asserts spread ===
0.88, recoil === 1.12; observed spread === 0.915, recoil === 1.085. Generalised: for every chip,
each "N%" in `line` must equal 100*|delta| of a mod on the stat named beside it; 12 of 160 chips
fail today.

**What a player sees.** The REPO HAMMER is the pellet weapon, where cone size is the whole weapon. A hammer player
buying CHOKE for the advertised −12% cone gets −8.5% — at the hammer's 0.05 rad cone and 15 m, a
pellet spread radius of 0.686 m instead of the promised 0.660 m — while paying only +8.5% recoil
instead of the +12% the line warns about. Every number in the trade is wrong in both directions,
so the player cannot predict the chip from its only description.

### 15. 13 ledger node lines print the pre-reconciliation cost; COLLATERAL says −20% reload and applies −23.5%

`shared/manifest/items.ts:87`

**What the code promises.** reconciled() (items.ts:50-66) takes the authored costs and RESCALES them by b/c0 so the ledger
balances, then settles the rounding residue onto the last cost (items.ts:56-64). The `line`
argument is authored against the pre-scale numbers and is never touched. COLLATERAL is authored
[moveSpeed -0.02, reloadSpeed -0.20] with line "COLLATERAL: +40% shield regen / −2% move, −20%
reload".

**What it does.** RECONCILE_LOG records scale = 1.163 for collateral, so its shipped costs are moveSpeed -0.0225
and reloadSpeed -0.235. Measured: sheetFor({attested:["collateral"]}).reloadSpeed === 0.765.
reloadTimer = d.reloadTime / mods.reloadSpeed (shared/sim/weapons.ts:282), so a STACK SMG reload
is 1.700/0.765 = 2.222 s where the line promises 1.700/0.80 = 2.125 s — 97 ms more on every
magazine. Twelve more nodes drift the same way, each verified by reading RECONCILE_LOG and the
shipped costs array: ARREARS items.ts:105 ("−10% reload" → -0.12), BLACK SWAN items.ts:126
("−30% regen" → -0.2725), CIRCUIT BREAKER items.ts:128 ("−8% ADS strafe" → -0.0975), GHOST
RECEIPT items.ts:102 ("−10% node flip" → -0.1175), NIGHT FARE items.ts:85 ("−10% regen" →
-0.0825), MARGIN CALL items.ts:119 ("+12% spread, +10% recoil" → +0.135, +0.1125), BAD PAPER
items.ts:110 ("−20% regen" → -0.185), RED INK items.ts:107 ("−16% regen" → -0.1475), MELTDOWN
CLAUSE items.ts:115 ("−35% regen" → -0.3425), DEFAULT SWAP items.ts:132 ("+15% spread" →
+0.1575), WIRE FRAUD items.ts:109 ("−5% reload" → -0.0575), DARK POOL items.ts:123 ("−10%
reload" → -0.105).

**Measured.** For every item in LEDGER_ITEMS, parse each "N%" from `line` and require a cost/benefit mod on
that stat with 100*|delta| rounding to N. 13 of 48 fail. Concretely:
sheetFor({attested:["collateral"]}).reloadSpeed === 0.765, while itemById("collateral").line
asserts 0.80; and Math.round(0.235*100) === 24 !== 20, the two values client/file.ts:750 and
client/file.ts:717 put on screen for the same node.

**What a player sees.** The Ghostfile shows both readouts at once and they contradict each other on screen. The node row
renders the real mods through fmt at client/file.ts:750, printing "−24% reloadSpeed" for
COLLATERAL; the ledger-graph tooltip at client/file.ts:717 prints this authored line, "−20%
reload", for the same node. A player pricing a build reads one number in the list and a
different number in the hex they click to buy it. For COLLATERAL the gap is 4 percentage points
— a fifth of the stated cost.


## Audio and render

### 16. The respawn cue and the BACK ON THE LEDGER line can never fire online: the dead→alive edge is computed and thrown away

`client/game.ts:480`

**What the code promises.** client/audio.ts:463-470 documents `respawn()` as "back on the ledger (Stage 96): a rising two-
note with the CRT's own hiss under it", and client/game.ts:1357-1362 pairs it with `hud.push('◆
BACK ON THE LEDGER · <district>')`. Stage 96's whole premise (client/render/spawn.ts:1-13) is
that a respawn used to be "a new place, the old heading, no fade, no sound, no line".

**What it does.** `audio.respawn()` has exactly one call site, client/game.ts:1360, inside `onEvent` — the handler
for SimEvents drained from the locally-stepped world. Online the client never calls
`world.step()`; it calls `applyInput(..., {predictOnly:true})` (client/game.ts:778), and the
respawn block in shared/sim/world.ts:259-265 is guarded by `if (!p.alive && !opts.predictOnly)`,
so no local respawn event is ever produced. The server does produce one, but
server/room.ts:1151-1216 `toNetEvent` has no `case "respawn"` and falls through to `default:
return null` at line 1215, so it never reaches the wire (the protocol's event union has only
shot/fx/kill/death/join/leave). client/game.ts:480 computes `const wasAlive = p.alive;` in
`onSnapshot` and then uses it only for `netStats` bookkeeping (line 489-493) — the dead→alive
edge is right there and discarded. The renderer's visual spawn-in still works, because it reads
`v.alive` itself (client/render/renderer.ts:904 `spawnEdge`), which is exactly why the gap is
easy to miss.

**Measured.** Join a room, die, respawn, and read `window.__game.audio.fired` (exposed as `audioCues()` in
client/main.ts:323): `fired.respawn` stays undefined online and increments by 1 per respawn
offline. Equivalently, grep the HUD log for '◆ BACK ON THE LEDGER' after an online death — it
never appears.

**What a player sees.** In multiplayer — the game's primary mode — every single respawn is silent and unlogged. The CRT
comes back up and the lens opens out with no sound and no line in the log, while offline the
same respawn gets a two-note rise and a ledger entry. Stage 96 fixed the cut only for the
offline path.

### 17. An explosion's point light fades by a fixed factor per FRAME, so a grenade lights the street 20x more at 60 Hz than at 144 Hz

`client/render/weapons.ts:329`

**What the code promises.** `ArsenalFx.update(dt)` takes a time step and the sibling fades in the same loop are time-based:
the mesh uses `const t = (this.clock - b.born) / b.life` (weapons.ts:321) and `b.mat.opacity =
(1 - t) * 0.9` (line 328). client/hit.ts:85-93 documents the house rule for exactly this — "Fade
a flash or a flinch by elapsed time rather than per frame. The dummies' flash had been stepped
by a fixed amount every frame since Stage 1, which makes a hit last four times as long on a
phone as on a desktop" — and client/render/renderer.ts:475-479 repeats it. The explosion light
is the one that was never converted.

**What it does.** `b.light.intensity *= 0.85;` is a per-call multiplication, so the fade depends on how many times
`update()` runs during the blast's 0.45 s (big) / 0.3 s (small) life, not on how much time
passed. With the renderer's capped dt (renderer.ts:866, `Math.min(rawDt, 1/30)`) the blast gets
64.8 update calls at 144 fps, 27.0 at 60 fps and 13.5 at or below 30 fps. Measured against the
initial intensity of 120: at the halfway point of the blast the light is 0.62 at 144 fps, 13.4
at 60 fps and 40.1 at 30 fps. At the end of its life it is 0.003 at 144 fps (invisible long
before the sphere fades) and 13.4 at 30 fps — i.e. the light is deleted at 11% of full
brightness, a visible pop.

**Measured.** `const fx = new ArsenalFx(scene); fx.explosion(pos, 4, 0xffb02e, true);` then call
`fx.update(1/144)` 32 times versus `fx.update(1/60)` 13 times (both ≈0.22 s of clock) and read
the blast's `light.intensity`: 0.62 vs 13.4. A correct time-based fade would give the same
number for both.

**What a player sees.** The same frag grenade throws a completely different amount of light on the surrounding geometry
depending on the player's refresh rate: on a 144 Hz monitor the blast flash is gone almost
immediately and the explosion reads as a dim additive sphere with no illumination; at 30 fps the
light snaps off at over a tenth of full brightness instead of fading out.

### 18. The camera's landing dip divides a whole frame's fall by a dt capped at 1/30 s, so below 30 fps every hop lands like a roof drop

`client/render/renderer.ts:878`

**What the code promises.** client/render/feel.ts:15-22 states the constants in metres per second: `LAND_FLOOR = 2.5`
("below this the ground is just the ground: walking off a kerb is not a landing"), `LAND_CEIL =
13` ("past this it is as hard as a landing gets"), and `landHardness(fallSpeed)` (feel.ts:31-33)
is documented as "A jump on the flat comes back at about six metres a second and reads as a
third of the way up". renderer.ts:875-877 says the value fed in is "the fall speed ... the frame
before touchdown".

**What it does.** `const fell = this.lastY === null ? 0 : (v.y - this.lastY) / Math.max(1e-4, dt);` — the
numerator `v.y - this.lastY` is the height change over one whole render frame, i.e. over
`rawDt`, but the divisor is `dt = Math.min(rawDt, 1 / 30)` (renderer.ts:866), a clock
deliberately capped for VFX ageing. Whenever the frame time exceeds 1/30 s the quotient is not
metres per second at all — it is inflated by `rawDt / (1/30)`. A real 6 m/s landing reads as
9.00 m/s at 20 fps (hardness 0.619 instead of 0.333) and as 15.00 m/s at 12 fps (hardness clamps
to 1.000, the maximum dip of 0.22 m). The same capped dt then drains the dip timer at line 886
(`this.landT = Math.max(0, this.landT - dt)`), so the 0.34 s recovery takes 0.51 s of wall time
at 20 fps and 0.85 s at 12 fps. The identical unit error is at renderer.ts:829-830 (`vy` and
`turnRate` for the local rig pose) and renderer.ts:705/727 (`seen`, `vy`, `turnRate` for remote
bodies).

**Measured.** Drive `renderer.render(view, rawDt)` with a body descending at a true 6 m/s and read
`renderer.view().dip` on the frame after touchdown: 0.073 m at rawDt = 1/60, 0.136 m at rawDt =
1/20, 0.220 m at rawDt = 1/12. Correct behaviour is the same 0.073 m at all three.

**What a player sees.** On a phone or any machine under 30 fps — and on any single hitched frame that happens to
coincide with touchdown — every jump, and even stepping off a kerb, slams the camera down the
full 0.22 m of the hardest possible landing and takes two to three times as long to come back
up. The 'walking off a kerb is not a landing' floor stops working.

### 19. A REPO MECH acquiring you is silent online: the FX.flagged case plays the HUD flag but not the two-tone alarm

`client/game.ts:577`

**What the code promises.** client/vantage.ts:6-8, the module doc that justifies the wasp cue, states the rule as fact: "A
mech that flags you gets a two-tone and a HUD flag; a wasp that acquires you gets nothing, and
it is the one that shoots first." client/audio.ts:389-394 is that two-tone, and the offline
handler at client/game.ts:1216-1221 does both: `this.hud.flagged();` and `if (this.world.tick %
30 === 0) this.audio.flagged();`.

**What it does.** The online handler is `case FX.flagged: if (ev.playerId === me) this.hud.flagged(); break;` —
HUD only, no `this.audio.flagged()`. The server does deliver the event (server/room.ts:1177-1178
maps the `flagged` SimEvent to `FX.flagged`), and shared/sim/ai.ts:299 pushes `mechFlag` every
tick the mech's searchlight holds you, so the event stream is there; the client just drops the
sound. Every neighbouring case in the same switch was given its offline voice — stun
(game.ts:581), mechBeam (587), hurt (591), nodeFlip (607), contest (614), kernelPulse (619),
phase (626-628, added by Stage 124 with the comment "online the phase had been silent ... the
same voices as offline"). `flagged` was missed.

**Measured.** Join a room on a level with mechs (shared/sim/level.ts:212 gives drainage_yard one), walk into a
mech's searchlight cone and read `audioCues()` (client/main.ts:323): `fired.flagged` stays
undefined online while `hud.flagged()` fires; offline it increments once per 30 ticks of being
lit.

**What a player sees.** Online, a repo mech locking its searchlight onto you — the warning you get before MECH.lockTime
elapses and it opens fire with a beam — makes no sound. The only cue is a HUD flag you have to
be looking at the right part of the screen to see. Offline the same lock beeps once a second.


## Process and gates

### 20. probe:stage2's earshot check has a boundary threshold the bot lands on: `far.d > 30` fails when the sample reads 30.0

`probe/stage2.ts:665`

**What the code promises.** A check that fails one run in twenty is not a guard.

**What it does.** The check requires far.d > 30 && nearest > 28. BRAVO paces to a waypoint near 30 m, so the
sampled distance straddles the threshold: observed FAIL at 'pacing 30.5-30.0 m' and PASS at
'pacing 30.4-30.1 m' on consecutive runs of identical code. Everything the check is actually
about (0 steps heard, walking 18/18) held in both. The threshold should be derived from the
audible range constant with margin, or the waypoint moved out.

### 21. probe:stage8's Debt check needs >= 2 kills from a live three-client match and intermittently sees 1

`probe/stage8.ts:304`

**What the code promises.** A check that fails one run in twenty is not a guard.

**What it does.** Observed once in a full sweep: 'ALPHA owes BLANK (1 files)' against a `owed.kills >= 2` clause;
every other clause (debt name, debtTarget both sides) matched. Re-ran 3x on the same tree and 2x
on a clean tree: 5/5 PASS. The kill count comes from real combat between three live clients, so
it is load-sensitive. The Debt itself only needs the *most* kills, not two, so the clause is
stricter than the rule it guards.


---

## Closed

- Respawn silently hands the player back the slot-1 rifle instead of their chosen primary  
  → Stage 168 (a5703d9)
- Hitscan cannot hit a body you are standing inside: rayCapsule returns null whenever the muzzle is inside the target capsule  
  → Stage 169 (949d876)
- PHAGE CLUSTER firmware is completely inert; LONG FUSE applies only 1 of its 4 stated changes  
  → Stage 170 (384985b)
- STACK SMG CHOKE and FLASH CUT cancel themselves out — the benefit is converted to recoil but the cost is left on recoil  
  → Stage 171 (a5f9837)
- lintChipSchema passes a chip whose benefit and cost are the same stat and cancel — the reconciliation guard cannot see a net-zero trade  
  → Stage 171 (a5f9837)
- STACK SMG's CHOKE chip is a null trade: its benefit and its cost land on the same stat and annihilate  
  → Stage 171 (a5f9837) — same finding as the weapons-dimension entry above
- Selecting weapon slot 8 (CLOCKEATER) makes the server reject the input and strike the player; two selections inside 5 s kick them out of the match  
  → Stage 172 (4e626e8)
- The full Fairness Lint has been red for a long time; CI only ever runs it with --quick  
  → Stage 173 (2bfcc34) — gate fixed and the 89 recorded; the balance decision itself is open
- The two broadcast endings wipe_fire and wipe_quiet can never be played — the finale is keyed on `m7:ending`, which no choice ever sets to either id  
  → Stage 174 (9ab3a09)
- Two of m5's six "lattice nodes" spawn sealed inside solid buildings, so BLIND THE MODEL cannot be completed on the m3 "HOLD IT" branch  
  → Stage 175 (b6e526d)
- The 400 $CAPITAL Deep Wake season pass grants nothing: its cosmetics are written to `a.owned`, but every consumer reads `a.cosmetics`  
  → Stage 176 (29ebb85)
- The opening crawl's audio can never sound: the AudioContext is only created after the crawl is over  
  → Stage 177 (b4c0402)
- A buffered jump survives death: the player involuntarily jumps on the first tick after respawning  
  → Stage 178 (16e73d1)
- `slideTime` is never zeroed when a slide ends, so every airborne kill after one slide is credited as a slide-jump kill  
  → Stage 179
- m1's "HOLD THE TERMINAL WHILE THE FILE DECRYPTS" has no anchor, so the 20-second timer runs anywhere in Lease Row  
  → Stage 180
- Turning in the m2 informant silently kills Marrow, removing four gigs and CLOCKEATER, with no death scene  
  → Stage 181
- THREAT_LINES is off by one against the mech threshold: Threat 5 announces a mech while extraMechs is 0  
  → Stage 182
- The rejoin knock gives up after 31.5 s of a 60 s grace window and then tells the player the room let the seat go  
  → Stage 183
- ThreatProfile.detectMult is computed for every rating and read by nothing — Threat never widens VANTAGE detection  
  → Stage 184
- A file's genuinely-unpaid units from an earlier day are erased as "stranded" the moment it banks again  
  → Stage 185
- The "stranded" repair adds banked UNITS into `run.paid`, a field the game prints as $CAPITAL  
  → Stage 185
- LONGWAVE CAPACITOR's only stated cost cannot occur — 102 damage still one-shots at every range  
  → Stage 186
