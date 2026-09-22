# The backlog — verified, unfixed findings

Forty-nine candidates came out of a parallel sweep over this repository. Each was put to
independent adversarial verification that defaulted to *refuted*, and **32 survived**; two of those
turned out to be the same finding reported twice. All of them have since been fixed (Stages 168–195)
and are listed at the foot of this file with the commit that closed them.

**None are open.** The standing method still holds for whatever turns up next: take one,
verify it yourself before building anything, guard it with a mutation-tested check, ship it as
one stage.


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
