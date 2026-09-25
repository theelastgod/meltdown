# The trailer

83 seconds, 1280×720, 28 cuts. Built by `tools/trailer/build.sh` from three sources, and the split
between them is the point:

| source | what it is | how much |
| --- | --- | --- |
| `gp/` | **real gameplay**, recorded out of the running client by `tools/trailer/capture.ts` | 21 s |
| `vid/` | the in-world advertisements — the same clips the city's signs play (Stage 633) | 8 s |
| `hero/` | eighteen generated cinematics, listed below | 54 s |

The gameplay section is announced on screen with an `ACTUAL GAMEPLAY / CAPTURED IN A BROWSER` card,
and it is the real client at the real frame rate on the real levels. A trailer cut only from
generated footage would be a picture of a game that does not exist; the card is there so nobody has
to guess which is which.

## Structure

| act | shots | seconds |
| --- | --- | --- |
| cold open | rain on asphalt, an aerial over the whole city, a plaza of hundreds of hooded Blanks | 0 – 11.5 |
| the world talks back | five of the city's own advertisements cut fast, then the iris opens | 11.5 – 22 |
| the Blank | it stands up, it raises a weapon, it runs | 22 – 31 |
| **actual gameplay** | card, then Lease Row, the wake, a firefight, a slide, the docks | 31 – 50.8 |
| escalation | the drone wall, the swarm, the mech, a firefight, the shutter, the rooftop, the door | 50.8 – 66 |
| the walk, the beam, the title | the hero walk through fire, THE KERNEL firing, MELTDOWN / $CAPITAL | 66 – 83.4 |

The cut accelerates on purpose: act 0 holds shots for 4.5 s, act 4 for 2.0–2.5 s. Then everything
stops — the kick and the hats drop out at 66 s for the hero walk, a noise riser runs underneath it,
and the only hit in the last seventeen seconds is the boom on THE KERNEL firing at 69.5 s.

## The gameplay capture

`tools/trailer/capture.ts` boots the real client headless at 1280×720, drives it with the same bot
plans the probes use, and takes frames off a CDP screencast while advancing the sim in lockstep
between them. Screencast rather than `page.screenshot()` because a screenshot forces a fresh raster
per call and cannot keep up with a moving camera; lockstep rather than real time so the motion is
the game's own and not an artefact of how fast the harness happened to run.

Six shots, about 54 seconds of footage, of which 20 are used: `run_street`, `wake`, `fight`,
`slide`, `docks`, `city_vista`.

The gameplay is graded on the way in — `eq=brightness=0.06:contrast=1.18:saturation=1.28` — because
the game is a genuinely dark game and the raw capture reads as black on a phone. Nothing else about
it is altered: no speed ramp, no added effects, no cuts inside a shot.

## The audio

`tools/trailer/audio.txt`, synthesised in ffmpeg rather than generated — Higgsfield's music model is
reserved for its game pipeline and is not for standalone audio, so the bed is built from oscillators.

A 41 Hz drone that fades up over the first eleven seconds and never leaves; a kick on 0.75 s from
11.5 s to 66 s; a noise snare on the off-beat under the gameplay act; a half-time hat added at 50.8 s
when the cutting speeds up; impacts on the three act boundaries at 11.5, 31.0 and 50.8; a riser from
64 s; and the boom at 69.5 s, decaying across the whole title.

Written to the cut rather than the cut written to it, which is why every one of those numbers is an
act boundary in the table above. Moving a shot means moving a beat.

## The twelve cinematics

Generated at 1344×768, five seconds each. Recorded here so the trailer can be rebuilt, and so it is
plain which frames are photographed from the game and which are not.

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

Every prompt carries "no text, no logos, no brands, no visible face", because the world's own
lettering is drawn in the edit where it can be spelled correctly, and because a generated logotype
that resembles a real company's is not something to find out about after publishing. The title,
the ticker and the gameplay card are all drawn by ffmpeg in DejaVu Sans Mono Bold, the closest
match on the box to the game's own terminal chrome.

## Rebuilding

```
npx tsx tools/trailer/capture.ts            # → probe/out/capture/<shot>/f####.jpg
# assemble gp/ from those frame sequences at 30 fps, put hero/ and vid/ alongside
S=<workdir> bash tools/trailer/build.sh     # → v2_silent.mp4
ffmpeg -filter_complex_script tools/trailer/audio.txt -map '[a]' -c:a aac -t 83.45 bed.m4a
ffmpeg -i v2_silent.mp4 -i bed.m4a -c:v libx264 -crf 22 -c:a aac -shortest MELTDOWN_trailer.mp4
```

The finished file is not in the repository. It is 26 MB, it is not a game asset, and
`lint:assets` would be right to complain: the asset budget exists for things the renderer loads.
