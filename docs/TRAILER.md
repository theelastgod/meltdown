# The trailer

100 seconds, 1280×720, 36 cuts, eight acts. Built by `tools/trailer/build.sh` from three sources,
and the split between them is the point:

| source | what it is | how much |
| --- | --- | --- |
| `gp/` | **real gameplay**, recorded out of the running client by `tools/trailer/capture.ts` | 21 s |
| `vid/` | the in-world advertisements — the same clips the city's signs play (Stage 633) | 8 s |
| `hero/` | twenty-two generated cinematics, listed below | 62 s |

The gameplay section is announced on screen with an `ACTUAL GAMEPLAY / CAPTURED IN A BROWSER` card,
and it is the real client at the real frame rate on the real levels. A trailer cut only from
generated footage would be a picture of a game that does not exist; the card is there so nobody has
to guess which is which.

## Structure

| act | shots | seconds |
| --- | --- | --- |
| 0 · cold open | rain on asphalt, an aerial over the whole city, a plaza of hooded Blanks, THE KERNEL on the horizon | 0 – 13.6 |
| 1 · the world talks back | six of the city's own advertisements cut fast, then the iris opens | 13.6 – 24.8 |
| 2 · the Blank | it stands up, it raises a weapon, it runs | 24.8 – 33.7 |
| 3 · **actual gameplay** | card, then Lease Row, the wake, a firefight, a slide, the docks, the vista | 33.7 – 56.1 |
| 4 · escalation | the drone wall, the swarm, the mech, a firefight, the shutter, the rooftop, the door | 56.1 – 69.9 |
| 5 · the uprising | the crowd from act 0 raises its head, a line of them charges, the market goes dark | 69.9 – 78.8 |
| 6 · the meltdown | half a second of black, THE KERNEL tears itself open, the beam, the walk | 78.8 – 90.9 |
| 7 · the title | MELTDOWN / $CAPITAL | 90.9 – 100.6 |

The cut accelerates on purpose: act 0 holds shots for 4.6 s, act 4 for 1.8–2.2 s. Then everything
stops — at 78.8 s the kick, the snare and the hats all cut out and the drone is ducked 88%, for half
a second of near-silence on black, before the monolith comes apart at 79.3 s.

Each act after the first opens on a blown-out frame (`fade=t=in:d=0.10:color=white`), so the act
boundaries land as hits rather than dissolves.

## The gameplay capture

`tools/trailer/capture.ts` boots the real client headless at 1280×720, drives it with the same bot
plans the probes use, and takes frames off a CDP screencast while advancing the sim in lockstep
between them. Screencast rather than `page.screenshot()` because a screenshot forces a fresh raster
per call and cannot keep up with a moving camera; lockstep rather than real time so the motion is
the game's own and not an artefact of how fast the harness happened to run.

Six shots, about 54 seconds of footage, of which 21 are used: `run_street`, `wake`, `fight`,
`slide`, `docks`, `city_vista`.

The gameplay is graded on the way in — `eq=brightness=0.06:contrast=1.18:saturation=1.28` — because
the game is a genuinely dark game and the raw capture reads as black on a phone. Nothing else about
it is altered: no speed ramp, no added effects, no cuts inside a shot.

## The audio

`tools/trailer/audio.txt`, synthesised in ffmpeg rather than generated — Higgsfield's music model is
reserved for its game pipeline and is not for standalone audio, so the bed is built from oscillators.

A 41 Hz drone that fades up over the first eleven seconds and never leaves; a kick on a 0.75 s grid
(80 BPM) from 13.6 s to 78.8 s; a noise snare on the off-beat from the gameplay act; a half-time hat
from 56.1 s and a double-time hat from 69.9 s as the cutting speeds up; impacts on all five act
boundaries; a noise riser from 74.6 s; the boom on the meltdown at 79.3 s and a second on the beam
at 83.8 s; and a low swell under the title.

Every grid is anchored to its own act boundary (`mod(t-13.63, 0.75)` rather than `mod(t, 0.75)`), so
the downbeat lands exactly on the cut that starts the act. Written to the cut rather than the cut
written to it, which is why every one of those numbers is an act boundary in the table above. Moving
a shot means moving a beat.

## The cinematics

Generated 5 seconds each. Recorded here so the trailer can be rebuilt, and so it is plain which
frames are photographed from the game and which are not. Shots 01–12 and 21–26 were generated at
1344×768; 27–30 at 1280×720 on `kling3_0`.

| file | prompt |
| --- | --- |
| `01_rain` | Extreme close-up, shallow depth of field: heavy rain hammering a wet black asphalt street at night, magenta and cyan neon reflections shattering in the puddles, slow motion. |
| `02_rise` | A figure in a heavy hooded rain-soaked coat rises to its feet in a flooded concrete room, seen from behind, face never visible. Cold cyan light ahead, magenta behind. |
| `03_alley` | Tracking shot chasing a hooded runner sprinting down a narrow rain-soaked alley crammed with neon signage, steam venting, puddles exploding underfoot. |
| `04_eye` | Looking up from a dark street: a colossal mechanical aperture the size of a building slowly opening in the clouds above the skyline, cold cyan light pouring down. |
| `05_aim` | First person: gloved hands raising an angular matte-black sidearm into aim, rain on the lens, the weapon's cyan strip light flickering on. |
| `06_swarm` | A swarm of insect-like flying drones rising in formation out of a black canal at night, chitinous shells, small red sensor lenses glowing. |
| `07_mech` | A heavy bipedal armoured machine ducks through a rolling shutter into a rain-lit loading yard, sparks showering, its single amber eye-lamp sweeping toward camera. |
| `08_firefight` | A firefight across a rain-soaked neon street: cyan and magenta tracers both directions, muzzle flashes strobing off wet concrete, two hooded silhouettes behind a container. |
| `09_kernel` | A colossal featureless black monolith dominating the horizon beyond a drowned neon city, a single blood-red filament running up its spine, storm and lightning. |
| `10_extract` | Behind a hooded figure sprinting toward a single lit doorway while the neon on both sides snaps off in sequence behind them. |
| `11_shutter` | A hooded figure drops into a slide and passes under a closing steel roller shutter at the last instant, sparks spraying from the concrete. |
| `12_plate` | Slow push through heavy rain toward a vast dark monolithic tower face, the frame almost entirely black at the edges with a clear empty centre — the title plate. |
| `21_aerial` | Sweeping aerial flying fast over a vast drowned neon megacity at night in heavy rain, endless towers stretching to the horizon, elevated rail threading between them. |
| `22_crowd` | A dense crowd of identical hooded figures standing motionless in a flooded plaza, all facing the same way, faces hidden, crane up revealing hundreds of them. |
| `23_beam` | A colossal black monolith fires an enormous column of blood-red light into the storm, the beam splitting the sky, shockwave rippling across the neon city below. |
| `24_wall` | A wall of hundreds of insect-like drones descending in formation into a narrow neon street, filling the frame, red sensor lenses glowing, the street going dark. |
| `25_walk` | Slow motion: a lone hooded figure walks directly toward camera down a burning neon street, fire and sparks behind, coat streaming, face lost under the hood. |
| `26_roof` | Two small hooded silhouettes facing each other across a wet rooftop, the neon city below, a colossal mechanical iris grinding open in the clouds above them. |
| `27_meltdown` | A colossal featureless black monolith tearing itself apart against a storm sky above a drowned neon megacity, molten blood-red light bursting out through widening cracks along its full height, debris and sparks flying upward, shockwave rolling across the city below, heavy rain, cinematic wide shot. |
| `28_uprising` | A vast flooded plaza packed with hundreds of identical figures in heavy hooded rain-soaked coats, all slowly raising their heads in perfect unison toward camera as the magenta and cyan neon around them snaps off row by row, faces lost in shadow under the hoods, slow crane up, heavy rain. |
| `29_ticker` | Looking straight up a colossal glass tower face covered in a vast grid of tiny red indicator lights, the lights cascading downward and going dark in a collapsing wave, glass cracking and shattering outward in slow motion, rain falling upward past camera, cold cyan rim light. |
| `30_charge` | Low tracking shot: a ragged line of figures in heavy hooded coats sprinting directly toward camera through a flooded neon street at night, water exploding around their boots, angular matte-black weapons raised, magenta and cyan signage streaking past on both sides, heavy rain. |

Every prompt carries "no text, no logos, no brands, no visible face", because the world's own
lettering is drawn in the edit where it can be spelled correctly, and because a generated logotype
that resembles a real company's is not something to find out about after publishing. The title,
the ticker and the gameplay card are all drawn by ffmpeg in DejaVu Sans Mono Bold, the closest
match on the box to the game's own terminal chrome.

The title is drawn three times — cyan four pixels left, magenta four pixels right, white centred —
for a chromatic split, over a cyan rule and the ticker.

## Rebuilding

```
npx tsx tools/trailer/capture.ts            # → probe/out/capture/<shot>/f####.jpg
# assemble gp/ from those frame sequences at 30 fps, put hero/ and vid/ alongside
S=<workdir> bash tools/trailer/build.sh     # → $S/v3_silent.mp4
ffmpeg -filter_complex_script tools/trailer/audio.txt -map '[a]' -c:a aac -t 100.65 bed3.m4a
ffmpeg -i v3_silent.mp4 -i bed3.m4a -c:v libx264 -b:v 2000k -c:a aac -shortest MELTDOWN_trailer.mp4
```

`drawbox` resolves `w` and `h` against the box, not the frame — use `iw`/`ih` for frame-relative
placement, or a rule meant to sit under the title lands in the top-left corner.

The finished file is not in the repository. It is 24–38 MB depending on the bitrate, it is not a
game asset, and `lint:assets` would be right to complain: the asset budget exists for things the
renderer loads.
