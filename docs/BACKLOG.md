# The backlog — verified, unfixed findings

Forty-nine candidates came out of a parallel sweep over this repository. Each was put to
independent adversarial verification that defaulted to *refuted*, and **32 survived**; two of those
turned out to be the same finding reported twice. All of them have since been fixed (Stages 168–195)
and are listed at the foot of this file with the commit that closed them.

## The floor is a shader, not a material (2026-09-25)

Answered by Stage 634, and it closes Stage 632's open question. The surface filling most of a street
camera is `makeWetFloor` in `client/render/wetfloor.ts`: a `Reflector` whose custom fragment shader
samples only `tDiffuse`, the reflection render target. **It has no albedo texture.** What reads as
pale flat tiling is the mirrored scene plus fog; the seams are geometry, not a plate. No amount of
plate binding changes it — the mobile fallback `makeFlatWetFloor` does bind `tex_wet_cobble`, which
is why the two paths look different.

To give it a surface: add an albedo sampler multiplied under the puddle mask, so the wet sheen reads
over stone rather than over nothing. Stage 22 measured this Reflector as the largest single line in
the draw-call budget, so measure the frame cost before and after rather than assuming a texture
lookup is free. The `plaza` pool already has the tiles for it.

Also still open, from Stage 634: four generated plates (wake hex cell, mech armour, wasp carapace,
weapon receiver) are **not shipped** because their surfaces are built per entity in `wake.ts` and
`weapons.ts` with no district seed in scope, so they cannot be dealt or proved reachable. Plumbing a
seed to those constructors would let all four in.

## Moving signs — where they should go next (2026-09-25)

Stage 633 put twelve clips on the shop fronts, the market kiosk and the title screen. Measured: with
the camera frozen, 1.7% of a street frame changes between two samples 1.5 s apart. The motion is
real and it is small, because a shop front is 2.4 m wide and the camera is usually not looking at
one.

- **Put the clips on the big surfaces.** The skyline billboards and the large facade panels are
  where an advertisement would actually read as an advertisement. The pool and the manifest already
  support it; what is missing is a screen family attached to those materials, and a decision about
  whether they are worth a decoder slot more than the shop fronts are.
- **The decode ceiling is 4 and was not derived from a measurement.** Stage 21–22 set a frame budget
  by measuring; this number was chosen. Measure the frame cost of the 4th and 5th decoder on the
  software renderer before raising it.
- **R2 is not enabled on the Cloudflare account** (`error 10042: Please enable R2 through the
  Cloudflare Dashboard`, from both API tokens; the S3 endpoint does not complete a TLS handshake
  because no bucket subdomain is provisioned). The clips ship from `public/video` instead, 1.5 MB,
  excluded from the service-worker precache. `VITE_VIDEO_BASE` moves them to a bucket with no code
  change once R2 is turned on.
- **One generated clip per screen family is a single point of monotony.** `shop_a` has three and
  cycles by district seed; `kiosk` has two; `backdrop` has one, so every title screen is the same
  skyline.

## Art that ships and is drawn on nothing — 2026-09-25

Stage 632 found 81 of 143 generated plates bound to no material: ~12 MB in every download that no
surface sampled. Fifteen now go on kerbs, pads, gratings, vents, shutters and roads, dealt per
district. **66 are still owed** and `shared/assets/plates.ts` records them; `lintPlatesAreDrawn`
fails if that list grows, and fails again if an entry turns out to be drawn after all.

What is left needs surfaces built for it rather than a family to drop into:

- ~31 facade, window, signage and interior plates — the facade pools take three per cast and are
  full; more would need more facade materials, which costs draw calls.
- ~21 metal, bulkhead, pipe and machinery plates, including two sets of brass and gold gears that
  belong on CLOCKEATER surfaces and a security-camera dome with nothing to sit on.
- ~12 vista plates (wet alleys, stairs, hanging banners) that read as scenery, not as tiles — these
  want a backdrop plane, not a material.
- one character plate: a hooded figure in a wet coat, which is the Blank and has no surface at all.

Also measured and not fixed: the surface filling most of a street camera is the plaza floor
(`M.base`, `M.concrete`). It is plated, but it reads flat and pale next to the art. Whether that is
the plate, the material colour or the lighting is not yet established — measure before changing it.

## Release verification findings — 2026-09-24

GitHub verification of Stage 626 failed: https://github.com/theelastgod/meltdown/actions/runs/35926225284.
The earlier “none open” statement did not include these release checks. These are observed
failures, not all diagnosed gameplay defects:

- Offline first visit: 57 art requests failed after the origin stopped. **Fixed in Stage 627:**
  183/183 art files cached, offline boot advances 60 ticks with no failed art requests.
- **Stage 628 fixes five stale expectations** in wake, mastery and mobile probes.
  All three browser probes passed in GitHub run 36059616253.
- **Fixed in Stage 635:** the campaign probe's solo driver was written for the pre-Stage-180
  unanchored hold. Anchored, the clock only banks while a live Blank is within 6 m of node B, and a
  Blank that stands there without returning fire dies at ~9 s — short of the 10 s wave trigger,
  hence `wasps 5 → 5`. It now defends the terminal and re-routes over the nav grid after a death.
  46/46, twice. The anchor, radius and assertions were not touched.
- Endgame and counter probes time out.
- **Fixed in Stage 631:** the probe searched for the pre-Stage-346 plural `UNITS DROPPED`. One
  dropped unit has read `1 UNIT DROPPED WHERE YOU FELL` since then, so the find returned nothing
  and the check failed on an empty string. It now pins the whole shipped line. 27/27.
- **Fixed in Stage 629:** late effect textures now restart shader warm-up. The diagnostic
  frame probe passes 8/8: textures 50 → 50 and programs 54 → 54 over 30 shots.
- **Fixed in Stage 636:** the camera derived the fall speed from the render clock, not the sim, so a
  machine drawing slower than it simulated landed every drop like a step off a kerb. `ViewState` now
  carries `vy` from `p.vel.y` and both the camera and the body pose read it. 0.000 m → 0.204 m;
  probe:tps 50/50. The kerb check beside it was passing at 0.000 m and now asserts the separation.
- **Fixed in Stage 630:** the remote-body walking check never watched a remote walk. Its probe
  stepped the injected position by one 60 fps frame per drawn frame, which is 0.43 m/s on a 5 fps
  machine — under the walk threshold — so the body posed `idle` on every sampled frame and the
  "alternating legs" it counted were 1e-2 rad of eased-pose jitter. The probe now walks the
  position by the clock, and the check requires the pose to read `walk` at the wire's speed with a
  0.5 rad stride counted over a 0.25 rad floor. 21/21, and four mutations fail it.

Reproduce and diagnose these individually; do not relax the assertions to make a release green.
The standing method still holds: verify the cause, fix it, and prove the regression check fails
when that fix is removed.


## Closed

- Marrow's first creation line still says mixed-case `Don't say your name`
  → Stage 626
- Ida's second creation line still says mixed-case `Come to the Office. Bring the Blank you woke as.`
  → Stage 625
- Ida's first creation line still says mixed-case `I audited leases for eleven years`
  → Stage 624
- m7 TAKE THE CHAIR (Estate) still says mixed-case `with Ida at your shoulder`
  → Stage 623
- m7 TAKE THE CHAIR (Clockeater) still says mixed-case `and set the model to forget`
  → Stage 622
- m7 WIPE THE LEDGER still says mixed-case `Walk out free`
  → Stage 621
- m6 REDACTED still says mixed-case `Wake them without the terror`
  → Stage 620
- m6 FULL BROADCAST still says mixed-case `Let them read the fire too`
  → Stage 619
- m5 SPARE THE DOCKS still says mixed-case `Someone has to see the ships come in`
  → Stage 618
- m5 ALL OF IT still says mixed-case `Blind the model everywhere`
  → Stage 617
- m4 EXPOSE HER still says mixed-case `She's the defector; you're the Blank`
  → Stage 616
- m4 SHIELD HER still says mixed-case `Take the light`
  → Stage 615
- m4 GIVE IT TO IDA still says mixed-case `The Estate should have to read its own hand`
  → Stage 614
- m4 KEEP THE DIRECTIVE still says mixed-case `If it's a weapon, it's mine now`
  → Stage 613
- m3 HOLD IT still says mixed-case `A truth spent early buys nothing`
  → Stage 612
- m3 PUBLISH IT still says mixed-case `on every leased feed tonight`
  → Stage 611
- m2 TURN HIM IN still says mixed-case `to Marrow's people`
  → Stage 610
- m2 SPARE HIM still says mixed-case `Turn the speaker off and let him run`
  → Stage 609
- m1 KEEP IT still says mixed-case `Evidence is a weapon`
  → Stage 608
- m1 BURN IT still says mixed-case `The model keeps no copy it can trust`
  → Stage 607
- THE WAKE CELLS' house pick still says mixed-case `every node off the model is a mind off the lease`
  → Stage 606
- THE CLOCKEATERS' house pick still says mixed-case `eat the hours the model cannot see`
  → Stage 605
- THE ESTATE's house pick still says mixed-case `someone has to hold the pen`
  → Stage 604
- SENSOR SABOTAGE · DEPOT's brief still says mixed-case `The depot lattice is the last one the Estate audit can see through`
  → Stage 603
- WAKE-CELL RESCUE · LEASE ROW's brief still says mixed-case `The last cell on the Row is pinned`
  → Stage 602
- DRONE CONVOY · DEPOT's brief still says mixed-case `The depot convoy flies with a mech escort`
  → Stage 601
- ESCROW HEIST · DOCKS's brief still says mixed-case `The harbour escrow at C`
  → Stage 600
- SENSOR SABOTAGE · DOCKS's brief still says mixed-case `Three lattice posts along the crane line`
  → Stage 599
- WAKE-CELL RESCUE · DOCKS's brief still says mixed-case `A cell went dark at E`
  → Stage 598
- DRONE CONVOY · LEASE ROW's brief still says mixed-case `Four wasps run the plaza loop every night`
  → Stage 597
- ESCROW HEIST · DEPOT's brief still says mixed-case `The impound lot keeps a second escrow`
  → Stage 596
- SENSOR SABOTAGE · LEASE ROW's brief still says mixed-case `Two lattice posts on the walkway street`
  → Stage 595
- WAKE-CELL RESCUE · DEPOT's brief still says mixed-case `A cell is pinned under the impound searchlight`
  → Stage 594
- DRONE CONVOY · DOCKS's brief still says mixed-case `A wasp convoy crosses the docks`
  → Stage 593
- ESCROW HEIST · LEASE ROW's brief still says mixed-case `Crack the escrow terminal at D`
  → Stage 592
- THE WHITE OFFICE's brief still says mixed-case `Wern doesn't fight`
  → Stage 591
- TRIAL BY DATA's brief still says mixed-case `Hold the broadcast tower on the plaza`
  → Stage 590
- BLIND THE MODEL's brief still says mixed-case `Destroy the sensor lattice district by district`
  → Stage 589
- THE LEAK's brief still says mixed-case `An Estate defector hands you the Directive`
  → Stage 588
- VARIANCE's brief still says mixed-case `Pull the depot's logs`
  → Stage 587
- DEADLETTER RUN's brief still says mixed-case `Work the docks`
  → Stage 586
- WAKE UNLISTED's brief still says mixed-case `Steal your own lease file`
  → Stage 585
- WERN CASE's how still says mixed-case `twenty-five wakes won`
  → Stage 584
- NAMED's how still says mixed-case `Chapter III — Depth 50`
  → Stage 583
- DIVERGENT's how still says mixed-case `Chapter II — Depth 25`
  → Stage 582
- LISTED's how still says mixed-case `Chapter I — Depth 10`
  → Stage 581
- CITIZEN's how still says mixed-case `all three districts played`
  → Stage 580
- NINE LIVES's how still says mixed-case `a round without a death`
  → Stage 579
- DEBT COLLECTOR's how still says mixed-case `a Debt cleared`
  → Stage 578
- MECH BREAKER's how still says mixed-case `a repo mech disabled`
  → Stage 577
- DRONE BANE's how still says mixed-case `ten wasps downed`
  → Stage 576
- FULL WAKE's how still says mixed-case `a district fully woken`
  → Stage 575
- LEDGER HAND's how still says mixed-case `ten nodes pulled off the model`
  → Stage 574
- SLIDER's how still says mixed-case `a slide-jump kill`
  → Stage 573
- LIVE WIRE's how still says mixed-case `first file closed with the Shock Baton`
  → Stage 572
- CARRIER's how still says mixed-case `first file closed with the Phage`
  → Stage 571
- LONGWAVE's how still says mixed-case `first file closed with the Longwave`
  → Stage 570
- STACKER's how still says mixed-case `first file closed with the Stack`
  → Stage 569
- REPO MAN's how still says mixed-case `first file closed with the Repo Hammer`
  → Stage 568
- LEASE-BREAKER's how still says mixed-case `first file closed with the Lease-Breaker`
  → Stage 567
- TENANT's how still says mixed-case `play a match`
  → Stage 566
- UNLISTED's how still says mixed-case `every file starts here`
  → Stage 565
- DIRECTIVE OPTIC's protocol line still says mixed-case `+15% range`
  → Stage 564
- BLOOD LEDGER's protocol line still says mixed-case `shield regen`
  → Stage 563
- RED LEASE's protocol line still says mixed-case `Wern's ink`
  → Stage 562
- FILAMENT CORE's protocol line still says mixed-case `the filament runs down the barrel`
  → Stage 561
- WERN PULSE's protocol line still says mixed-case `+12% fire rate`
  → Stage 560
- BAD DEBT's FILE line still says mixed-case `loud on the model`
  → Stage 559
- DEBTLESS's FILE line still says mixed-case `no shield`
  → Stage 558
- AUDITOR's FILE line still says mixed-case `fire rate`
  → Stage 557
- the FILE kit still says mixed-case `range`
  → Stage 556
- the FILE kit still says mixed-case `throw`
  → Stage 555
- the FILE kit still says mixed-case `slide`
  → Stage 554
- the FILE kit still says mixed-case `mantle`
  → Stage 553
- the FILE kit still says mixed-case `grenade`
  → Stage 552
- the FILE kit still says mixed-case `headshot`
  → Stage 551
- the FILE kit still says mixed-case `regen`
  → Stage 550
- the FILE kit still says mixed-case `flip`
  → Stage 549
- the FILE kit still says mixed-case `footsteps`
  → Stage 548
- the FILE kit still says mixed-case `move`
  → Stage 547
- the FILE kit still says mixed-case `reload`
  → Stage 546
- the FILE kit still says mixed-case `recoil`
  → Stage 545
- the FILE kit still says mixed-case `spread`
  → Stage 544
- the FILE kit still says mixed-case `slide decay`
  → Stage 543
- the FILE kit still says mixed-case `regen delay`
  → Stage 542
- the FILE kit still says mixed-case `detection`
  → Stage 541
- the FILE kit still says mixed-case `fire rate`
  → Stage 540
- the FILE kit still says mixed-case `ADS strafe`
  → Stage 539
- VANTAGE BANE's FILE lead still says mixed-case `bonus damage to VANTAGE units`
  → Stage 538
- ESCROW LOCK's FILE lead still says mixed-case `kills restore 10 shield`
  → Stage 537
- CONTAGION ROUND's FILE lead still says mixed-case `kills pull the nearest node`
  → Stage 536
- HEAVY HAFT's FILE line still says mixed-case `+25% damage, −7% swing rate, stuns longer`
  → Stage 535
- ARC RELAY's FILE line still says mixed-case `chain reaches 50% further`
  → Stage 534
- LONG FUSE's FILE line still says mixed-case `faster, flatter rounds`
  → Stage 533
- CLUSTER's FILE line still says mixed-case `+25% burst radius, −15% damage`
  → Stage 532
- OVERCHARGE's FILE line still says mixed-case `+8% charge time, +8% damage`
  → Stage 531
- CAPACITOR's FILE line still says mixed-case `−15% charge time, −7% damage`
  → Stage 530
- MEASURED's FILE line still says mixed-case `−22% rate, +22% damage`
  → Stage 529
- DUMP STAGE's FILE line still says mixed-case `+18% rate, −15% magazine`
  → Stage 528
- SLAM FIRE's FILE line still says mixed-case `+20% rate, −10% pellet damage, a little wider`
  → Stage 527
- DOUBLE BARREL's FILE line still says mixed-case `two shells per trigger`
  → Stage 526
- LONG LEASE's FILE line still says mixed-case `slower, heavier rounds`
  → Stage 525
- THREE-COUNT's FILE line still says mixed-case `three-round bursts at 900 rpm`
  → Stage 524
- PRESET SLOT VI's shop line still says mixed-case `a sixth saved loadout`
  → Stage 523
- ALIAS SLOT IV's shop line still says mixed-case `a fourth saved name`
  → Stage 522
- The Deep Wake pass theme could not be worn: no shop row, no HUD palette
  → Stage 521
- CLOCK GEAR's market line still says mixed-case `brass gears on wet steel`
  → Stage 520
- PHAGE VEIN's market line still says mixed-case `iridescent spore-vein polymer`
  → Stage 519
- LONGWAVE FILAMENT's market line still says mixed-case `cyan wave-traces on black alloy`
  → Stage 518
- REPO CHEVRON's market line still says mixed-case `contractor hazard stripes, the shotgun's own rain`
  → Stage 517
- ARC VIOLET's market line still says mixed-case `shock-arc plate, the baton's own light`
  → Stage 516
- LEASE STEEL's market line still says mixed-case `anodized shotgun steel, amber chevrons in the rain`
  → Stage 515
- DIRECTIVE CORE's market line still says mixed-case `red filament on the optic`
  → Stage 514
- STACK PLATE's market line still says mixed-case `stacked polymer, the SMG's own rain`
  → Stage 513
- BATON VIOLET's market line still says mixed-case `shock-violet trim on a close-in stick`
  → Stage 512
- HAMMER RUST's market line still says mixed-case `shotgun steel that never left the rain`
  → Stage 511
- LONGWAVE ICE's market line still says mixed-case `cold cyan rail, the colour a charge howls`
  → Stage 510
- PHAGE PLATE's market line still says mixed-case `green-black contagion paint`
  → Stage 509
- BLACK LEASE's market line still says mixed-case `CRT phosphor on a sealed file`
  → Stage 508
- ESTATE GRID's market line still says mixed-case `cyan monitor grid`
  → Stage 507
- FORGED TRIM's market line still says mixed-case `amber servo light on wet steel`
  → Stage 506
- ECHO VIOLET's market line still says mixed-case `ghosting plate, short-range wallsense look`
  → Stage 505
- METRO PLATE's market line still says mixed-case `grey-green tunnel tile, cyan bars`
  → Stage 504
- RAIN LEASE's market line still says mixed-case `anodized black that never dried`
  → Stage 503
- UNLISTED BLACK's market line still says mixed-case `near-black, one pinhole of cyan`
  → Stage 502
- VANTAGE AMBER's market line still says mixed-case `contractor chevrons, the colour of a searchlight`
  → Stage 501
- LEDGER BREAK's market line still says mixed-case `magenta stamp over a CRT that still says pending`
  → Stage 500
- CLOCKEATER BRASS's market line still says mixed-case `gears that run faster than the city can count`
  → Stage 499
- ESTATE PLATE's market line still says mixed-case `cyan anodized ledger-grid`
  → Stage 498
- WAKE TRIM's market line still says mixed-case `green edge-light on wet steel`
  → Stage 497
- DEADLETTER WHITE's market line still says mixed-case `the office's own paint`
  → Stage 496
- KERNEL PLATE's market line still says mixed-case `red filament without the filament`
  → Stage 495
- FILE value-imported crtPhrase from the chain client, so the first download carried viem
  → Stage 494
- PHOSPHOR TRIM's market line still says mixed-case `the first CRT's green on every edge`
  → Stage 493
- RUST LEASE's market line still says mixed-case `a rig that has been rained on`
  → Stage 492
- PRESET SLOT V's shop line still says mixed-case `a fifth`
  → Stage 491
- PRESET SLOT IV's shop line still says mixed-case `a fourth`
  → Stage 490
- PRESET SLOT III's shop line still says mixed-case `a third`
  → Stage 489
- PRESET SLOT II's shop line still says mixed-case `a second saved loadout`
  → Stage 488
- ALIAS SLOT III's shop line still says mixed-case `a third`
  → Stage 487
- ALIAS SLOT II's shop line still says mixed-case `a second saved name the city may call you`
  → Stage 486
- BLOODLINE's Wakelight shop line still says mixed-case `Kernel red on black`
  → Stage 485
- ICE's Wakelight shop line still says mixed-case `Deadletter Docks in January`
  → Stage 484
- AMBER's Wakelight shop line still says mixed-case `the Estate's own monitors`
  → Stage 483
- PHOSPHOR's Wakelight shop line still says mixed-case `green-on-black terminal`
  → Stage 482
- The FILE's chain miss still prints the host's raw `info.reason`
  → Stage 481
- The settings line still says mixed-case `applied live · kept in this browser`
  → Stage 480
- SETTINGS's menu subtitle still says mixed-case `sensitivity, field of view`
  → Stage 479
- FILE's menu subtitle still says mixed-case `the Ghostfile`
  → Stage 478
- THE RANGE's menu subtitle still says mixed-case `the drainage yard`
  → Stage 477
- THE OFFICE's menu subtitle still says mixed-case `the hub`
  → Stage 476
- CAMPAIGN's menu subtitle still says mixed-case `the desk at the Deadletter Office`
  → Stage 475
- THE RUN's menu subtitle still says mixed-case `play to earn`
  → Stage 474
- WAKE's menu subtitle still says mixed-case `the signature mode`
  → Stage 473
- A keystone list still kicks mixed-case `max N KEYSTONE`
  → Stage 472
- An unknown PvP field still kicks mixed-case `is not part of a PvP loadout`
  → Stage 471
- A missing socket still kicks mixed-case `no socket`
  → Stage 470
- An unknown node still kicks the raw id
  → Stage 469
- An unknown keystone still kicks the raw id
  → Stage 468
- An unknown firmware still kicks the raw id
  → Stage 467
- An unknown chip still kicks the raw id
  → Stage 466
- A firmware map keyed on an unknown weapon still kicks mixed-case `unknown weapon`
  → Stage 465
- Four Imagine plates sat on disk uncatalogued (repo chevron, longwave filament, phage vein, clock gear)
  → Stage 464
- A chip map keyed on an unknown weapon still kicks mixed-case `unknown weapon`
  → Stage 463
- An unknown secondary still kicks mixed-case `unknown secondary`
  → Stage 462
- An unknown primary still kicks mixed-case `unknown primary`
  → Stage 461
- A keystone that does not touch the attestation still kicks mixed-case `must touch an attested node`
  → Stage 460
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
- OVERCHARGE sells "pierces cover", but the stock rail already pierces bodies and no rail passes a wall  
  → Stage 187
- REPO HAMMER chip lines print the un-scaled template numbers  
  → Stage 188
- Four STACK SMG chip lines say "spread" where the chip changes recoil  
  → Stage 188
- Every REPO HAMMER spread chip quotes the unscaled template number  
  → Stage 188
- Firmware damage lines drift from the integers the code produces; DOUBLE BARREL hides a −33% magazine  
  → Stage 189
- 13 ledger node lines print the pre-reconciliation cost; COLLATERAL says −20% reload and applies −23.5%  
  → Stage 190
- The respawn cue and BACK ON THE LEDGER never fire online  
  → Stage 191
- An explosion's point light fades by a fixed factor per FRAME  
  → Stage 192
- The camera's landing dip divides a whole frame's fall by a dt capped at 1/30 s  
  → Stage 193
- A REPO MECH acquiring you is silent online  
  → Stage 194
- probe:stage2's earshot check has a boundary threshold the bot lands on  
  → Stage 195
- probe:stage8's Debt check needs >= 2 kills and intermittently sees 1  
  → Stage 195
- Online FX.waspDeath / mechDeath / swap / throw / charge / lunge / melee / fullWake had no voice  
  → Stage 196
- PAID printed the raw float  
  → Stage 197
- Online FX replayed predicted swap/throw/charge/lunge/melee for the local file  
  → Stage 198
- Ghostfile FILE-panel node rows quoted rounded camelCase mods, not the ledger line  
  → Stage 199
- Higgsfield city/kit plates were on disk and never bound to a mesh  
  → Stage 200
- STACK SMG CHOKE duplicated COMPENSATOR after the spread→recoil conversion  
  → Stage 201
- Remote bodies estimated speed from the hitch-capped dt  
  → Stage 202
- Campaign escort hood and thrown nades were unplated  
  → Stage 203
- A nade at your feet online did not kick the camera  
  → Stage 204
- Phage and sticky rounds were unplated violet boxes  
  → Stage 205
- A worn catalog plate never reached the body trim or a teammate's strip  
  → Stage 206
- Pedestrian rails were a flat magenta box; `tex_cable` sat unused  
  → Stage 207
- The Chapter III desk nameplate was an unplated brown box  
  → Stage 208
- Wasp rotor arms were unplated brown boxes  
  → Stage 209
- The airship ad panel was a flat magenta slab  
  → Stage 210
- The monorail window band was an unplated ice box  
  → Stage 211
- The kill stamp hyphenated the weapon id (REPO-HAMMER, PHAGE, DIRECTIVE)  
  → Stage 212
- Crowd chest lamps were an unplated amber box  
  → Stage 213
- Range dummy servos were an unplated amber box  
  → Stage 214
- Campaign unlocks called THE DIRECTIVE "DIRECTIVE"  
  → Stage 215
- A contract in the wrong district printed DEADLETTER_DOCKS  
  → Stage 216
- Weapon stamps called THE DIRECTIVE "THE" and REPO HAMMER "REPO"  
  → Stage 217
- Directive chips were named THE CHOKE  
  → Stage 218
- Mastery CRT lines spelled LEASE BREAKER / DIRECTIVE R5  
  → Stage 219
- The join line quoted long_lease and BAD_DEBT  
  → Stage 220
- Travelling printed WHITE OFFICE / DEADLETTER_DOCKS instead of the city name  
  → Stage 221
- The completed-arc line printed CHAIR CLOCKEATER, not THE CLOCKEATER'S CHAIR  
  → Stage 222
- Deep Wake history said TURNED CELLS, not THE WAKE CELLS  
  → Stage 223
- The Deep Wake map still printed CELLS / ESTATE  
  → Stage 224
- The receipt spelled FIRST_KILL LEASE BREAKER  
  → Stage 225
- Picking a house wrote HOUSE · CELLS  
  → Stage 226
- A range ghost wrote DEADLETTER_OFFICE / WHITE OFFICE  
  → Stage 227
- The Audit FILE line listed repo_hammer  
  → Stage 228
- The Audit kick named lease_breaker  
  → Stage 229
- The RING ONE kick named escrow  
  → Stage 230
- The loadout kick named directive / phage  
  → Stage 231
- The not-owned kick named long_lease  
  → Stage 232
- The chip-rank kick named lease_breaker:flash_cut  
  → Stage 233
- The firmware-rank kick named lease_breaker:three_count  
  → Stage 234
- The chip-weapon kick named stack_smg:long_barrel  
  → Stage 235
- The chip-socket kick named lease_breaker:long_barrel  
  → Stage 236
- The firmware-weapon kick named stack_smg:dump_stage  
  → Stage 237
- The connected kick named slipfile  
  → Stage 238
- The chips-shape kick named lease_breaker  
  → Stage 239
- The unknown-socket kick named lease_breaker  
  → Stage 240
- The chip-shape kick named lease_breaker.muzzle  
  → Stage 241
- The firmware-shape kick named lease_breaker  
  → Stage 242
- The contracts list named PROTOCOL  
  → Stage 243
- The closed-contract ledger named red_lease  
  → Stage 244
- The chip-socket kick said "not kinetic"  
  → Stage 245
- The not-a-node kick said "is a keystone"  
  → Stage 246
- The chip-shape kick said .muzzle  
  → Stage 247
- The keystone-limit kick said keystone  
  → Stage 248
- The keystone-shape kick said keystone  
  → Stage 249
- The unknown-socket kick said "barrel"  
  → Stage 250
- The mech visor strip was a flat amber box  
  → Stage 251
- The wasp eye was a flat amber box  
  → Stage 252
- The mech searchlight lens was a flat cream disc  
  → Stage 253
- The monorail headlamp was a flat cream box  
  → Stage 254
- The airship keel strip was a flat cyan bar  
  → Stage 255
- The monorail under-strip was a flat magenta bar  
  → Stage 256
- The wasp rotors were a flat brown disc  
  → Stage 257
- The monorail tail lamp was a flat red box  
  → Stage 258
- The airship nose was a flat red sphere  
  → Stage 259
- THE KERNEL's red strips were flat bars  
  → Stage 260
- Parked-car headlamps were a flat cream strip  
  → Stage 261
- Spawn pads were flat green and magenta boxes  
  → Stage 262
- Lamp pools and vending fronts were a flat cyan wash  
  → Stage 263
- The Chapter III office window was a flat cyan slab  
  → Stage 264
- THE KERNEL's halo was a flat red plane  
  → Stage 265
- Offline kill log called a player PLAYER  
  → Stage 266
- The range ghost was a flat cyan capsule  
  → Stage 267
- THE RUN's claims were unplated octahedra  
  → Stage 268
- THE RUN's safe-zone ring was a flat cyan hoop  
  → Stage 269
- LEASE-BREAKER's top rail was a flat magenta box  
  → Stage 270
- THE DIRECTIVE's optic cube was a flat red box  
  → Stage 271
- THE RUN's safe-zone column was a flat cyan tube  
  → Stage 272
- THE WAKE hex ring was a flat violet hoop  
  → Stage 273
- THE WAKE hex fill was a flat violet disc  
  → Stage 274
- THE WAKE light column was a flat violet tube  
  → Stage 275
- The campaign objective ring was a flat cyan hoop  
  → Stage 276
- The campaign objective beam was a flat cyan tube  
  → Stage 277
- The Kernel filament was a flat red strand  
  → Stage 278
- The player's cloak was an unplated silhouette  
  → Stage 279
- THE WAKE flip ring was a flat hex pulse  
  → Stage 280
- The mech searchlight cone was a flat amber volume  
  → Stage 281
- Smoke clouds were unplated grey spheres  
  → Stage 282
- Hitscan beams were unplated additive tubes  
  → Stage 283
- Explosion spheres were unplated additive balls  
  → Stage 284
- TESTIMONY printed m1:lease  
  → Stage 285
- TESTIMONY printed lease=burn  
  → Stage 286
- Impact sparks were unplated additive spheres  
  → Stage 287
- The mobile wet floor was an unplated sheen  
  → Stage 288
- TESTIMONY printed CHAIR CLOCKEATER  
  → Stage 289
- The Deep Wake MAP named a house CEL  
  → Stage 290
- Hitscan tracer lines were unplated  
  → Stage 291
- The PA and the ledger line fell back to the level id  
  → Stage 292
- THE WAKE link lines were unplated dashes  
  → Stage 293
- Traffic streaks were unplated lines  
  → Stage 294
- The metro lock glyph was a flat green hex  
  → Stage 295
- City neon tubes were unplated boxes  
  → Stage 296
- The WAKE picker printed neochina-lease_row  
  → Stage 297
- The drop line printed room full  
  → Stage 298
- The HUD zone line duplicated the district helper  
  → Stage 299
- Deep Wake history spelled districts with replace  
  → Stage 300
- FILE PRIMARY fell back to the id  
  → Stage 301
- The FILE tab printed WEAR · ok  
  → Stage 302
- The campaign ledger kept the underscore on a gun  
  → Stage 303
- A market buy said listing  
  → Stage 304
- A market list said token  
  → Stage 305
- WALLET REFUSED quoted the provider in sentence case  
  → Stage 306
- The wallet line said local account  
  → Stage 307
- NO WALLET left a sentence-case how-to  
  → Stage 308
- LINK REFUSED quoted the host in sentence case  
  → Stage 309
- ROOM REFUSED quoted the host in sentence case  
  → Stage 310
- LINK FAILED quoted the caught error in sentence case  
  → Stage 311
- BUY FAILED quoted the caught error in sentence case  
  → Stage 312
- SELL FAILED quoted the caught error in sentence case  
  → Stage 313
- ROOM FAILED quoted the caught error in sentence case  
  → Stage 314
- NAME FAILED quoted the caught error in sentence case  
  → Stage 315
- A thrown counter op quoted FAILED in sentence case  
  → Stage 316
- A thrown sink burn quoted FAILED in sentence case  
  → Stage 317
- COUNTER-LEDGER quoted the catch as written  
  → Stage 318
- LINKED quoted a host note in sentence case  
  → Stage 319
- PRIVATE ROOM quoted the rest in sentence case  
  → Stage 320
- THE RUN quoted the rest in sentence case  
  → Stage 321
- An empty attested list said none  
  → Stage 322
- PRIVATE ROOM · CODE suffixed hours as h  
  → Stage 323
- LINKING wrote sim / ms rtt / loss  
  → Stage 324
- An Audit playlist quoted its line in sentence case  
  → Stage 325
- The RANGE log suffixed times as s  
  → Stage 326
- The RANGE alert suffixed times as s  
  → Stage 327
- REJOINING IN suffixed the wait as s  
  → Stage 328
- Kill TTK suffixed the time as s  
  → Stage 329
- The RANGE ledger suffixed times as s  
  → Stage 330
- FLIP / LOCK IN suffixed the wait as s  
  → Stage 331
- The nodefoot suffixed distance as m  
  → Stage 332
- FILE CLOSED BY suffixed metres as m  
  → Stage 333
- RE-LEASING IN suffixed the wait as s  
  → Stage 334
- Campaign hold/survive suffixed the clock as s  
  → Stage 335
- NEXT ROUND IN suffixed the wait as s  
  → Stage 336
- ON NODES suffixed seconds as s  
  → Stage 337
- One death was DEATHS  
  → Stage 338
- One kill was KILLS  
  → Stage 339
- One pull was PULLS  
  → Stage 340
- A dummy re-lease quoted the rest in sentence case  
  → Stage 341
- One file was FILES  
  → Stage 342
- One wasp was WASPS  
  → Stage 343
- One mech was MECHS  
  → Stage 344
- One claim was CLAIMS OUT  
  → Stage 345
- One unit dropped was UNITS  
  → Stage 346
- One stamp was STAMPS  
  → Stage 347
- One try was TRIES  
  → Stage 348
- One owed was UNITS  
  → Stage 349
- One banked unit was UNITS OWED  
  → Stage 350
- One shop slot was SLOTS  
  → Stage 351
- An empty preset said empty  
  → Stage 352
- No prizes said none posted  
  → Stage 353
- An unplayed Audit said not played yet  
  → Stage 354
- An empty rig said nothing on the rig yet  
  → Stage 355
- FILE identity said files on you  
  → Stage 356
- An empty Audit board said no scores yet this week  
  → Stage 357
- An empty market said no listings  
  → Stage 358
- An empty ledger said no lines yet  
  → Stage 359
- Waiting contracts said loading the board  
  → Stage 360
- A waiting Audit said loading  
  → Stage 361
- A missing treasury said loading  
  → Stage 362
- The counter said fetching the chain client  
  → Stage 363
- SIWE how-to was sentence case  
  → Stage 364
- A written name said written where they can't redact it  
  → Stage 365
- A closed name registry said the registry opens at Depth  
  → Stage 366
- A name fee said by length, burned  
  → Stage 367
- An unlinked wallet how-to was sentence case  
  → Stage 368
- MAP said no rounds have moved the graph yet  
  → Stage 369
- THE RUN's unlinked dim was sentence case  
  → Stage 370
- ENDGAME without a host said contracts, Audits  
  → Stage 371
- The sink how-to said both burned in full  
  → Stage 372
- A private-room invite said give it to whoever you want in  
  → Stage 373
- A Depth-gated RUN said the run pays Scrip  
  → Stage 374
- Units settle nightly was sentence case  
  → Stage 375
- The other book was sentence case  
  → Stage 376
- A market row said listed by  
  → Stage 377
- The Ledger Market heading said settles only in  
  → Stage 378
- The prizes how-to said THE RUN settles nightly  
  → Stage 379
- The counter chain label said chain  
  → Stage 380
- An empty fixer board said no contracts on offer  
  → Stage 381
- A re-leased fixer said no one answers  
  → Stage 382
- The Ledger Graph said click a leased node  
  → Stage 383
- The Ledger Graph sandbox said sandbox: every node  
  → Stage 384
- The crew how-to said or RUN WITH A CREW on a contract  
  → Stage 385
- A crew host said you hold the terminals  
  → Stage 386
- A crew guest said the host holds the terminals  
  → Stage 387
- The crew share line said tell a friend the code  
  → Stage 388
- Empty TESTIMONY said nothing on the record  
  → Stage 389
- EXPLORE said travel to a district  
  → Stage 390
- The graph hint said G opens the whole graph  
  → Stage 391
- An alias field said a name the city may call you  
  → Stage 392
- A locked chip said (locked)  
  → Stage 393
- A gated node said needs Depth  
  → Stage 394
- An unowned node said not in your file  
  → Stage 395
- An empty chip socket said none  
  → Stage 396
- An empty moniker said none  
  → Stage 397
- Mastery progress said xp  
  → Stage 398
- Rewrite without a file said no file  
  → Stage 399
- Rewrite too early said Depth  
  → Stage 400
- A mastery gate said GATE r  
  → Stage 401
- A chip option said r  
  → Stage 402
- A firmware option said r  
  → Stage 403
- Listing a rig token said List for how much  
  → Stage 404
- Buying a cosmetic twice said already owned  
  → Stage 405
- A poor shop said needs Wakelight  
  → Stage 406
- An unknown shop id said unknown cosmetic  
  → Stage 407
- A granted slot said already owned  
  → Stage 408
- Buying a slot out of order said needs first  
  → Stage 409
- An empty alias said empty alias  
  → Stage 410
- A write into a missing slot said not owned  
  → Stage 411
- Wearing a theme you do not own said not owned  
  → Stage 412
- An unknown cosmetic op said unknown op  
  → Stage 413
- An unknown campaign op said unknown op  
  → Stage 414
- An unknown economy op said unknown op  
  → Stage 415
- An unknown house said unknown house  
  → Stage 416
- A second house said house already picked  
  → Stage 417
- A claimed completion said closed by the room  
  → Stage 418
- An unknown launch said unknown contract  
  → Stage 419
- A mission with no house said pick a house first  
  → Stage 420
- Launching after the arc said the arc is complete  
  → Stage 421
- Hitscan, blast, spark and optic still wore the lamp plate  
  → Stage 422
- Skipping a mission said comes first  
  → Stage 423
- A finished gig said already closed  
  → Stage 424
- A locked gig said not on offer yet  
  → Stage 425
- A second claim said already claimed  
  → Stage 426
- An id off today's board said not on today's board  
  → Stage 427
- An unknown node said unknown item  
  → Stage 428
- A held node said already in your file  
  → Stage 429
- A Depth-gated buy said needs Depth  
  → Stage 430
- A poor buy said needs Scrip  
  → Stage 431
- A refund of an unowned node said not in your file  
  → Stage 432
- A token not on the rig said not on your rig  
  → Stage 433
- A ghost token said unknown skin  
  → Stage 434
- A FILE op with no shop said no ledger host linked  
  → Stage 435
- The perf overlay said no ledger host  
  → Stage 436
- A waiting perf overlay said report in N s  
  → Stage 437
- A booting perf overlay said sampling  
  → Stage 438
- A hidden GPU said unknown  
  → Stage 439
- A sandbox buy said the sandbox file already owns everything  
  → Stage 440
- A Depth-gated gun said needs Depth  
  → Stage 441
- A campaign gun said unlocks in the campaign  
  → Stage 442
- An unowned node said is not in your file  
  → Stage 443
- A chip below mastery said needs mastery  
  → Stage 444
- A firmware below mastery said needs mastery  
  → Stage 445
- A wrong-weapon chip said is a chip  
  → Stage 446
- A wrong-socket chip said is a chip, not  
  → Stage 447
- A wrong-weapon firmware said is a firmware  
  → Stage 448
- Attesting a keystone said is a KEYSTONE  
  → Stage 449
- Chip sockets as a list said must be an object  
  → Stage 450
- A malformed attested list said must be a list of node ids  
  → Stage 451
- Eight attested said attested, max  
  → Stage 452
- The same node twice said attested twice  
  → Stage 453
- A disconnected attestation said connected subgraph  
  → Stage 454
- A non-string keystone said must be an id  
  → Stage 455
- A non-string chip said must be an id  
  → Stage 456
- A non-string firmware said must be an id  
  → Stage 457
- A firmware list said must map weapon  
  → Stage 458
- A chips list said must map weapon  
  → Stage 459
