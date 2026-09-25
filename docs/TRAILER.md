# The trailer

70 seconds, 1280×720. Built by `tools/trailer/build.sh` from three sources, and the split between
them is the point:

| source | what it is | how much |
| --- | --- | --- |
| `gp/` | **real gameplay**, recorded out of the running client by `tools/trailer/capture.ts` | 20 s |
| `vid/` | the twelve in-world advertisements — the same clips the city's signs play (Stage 633) | 10 s |
| `hero/` | twelve generated cinematics, listed below | 40 s |

The gameplay section is announced on screen with an `ACTUAL GAMEPLAY / CAPTURED IN A BROWSER` card,
and it is the real client at the real frame rate on the real levels. A trailer cut only from
generated footage would be a picture of a game that does not exist; the card is there so nobody has
to guess which is which.

## Structure

| act | shots | seconds |
| --- | --- | --- |
| the city | rain, the aperture opening, THE KERNEL, a Blank standing up | 0 – 12 |
| the world talks back | four of the city's own advertisements, cut fast, then a runner | 12 – 23 |
| **actual gameplay** | card, then Lease Row, the wake, a firefight, a slide, the docks | 23 – 45 |
| what is out there | the drone swarm, the mech, a firefight, the shutter slide | 45 – 56 |
| the money, and the title | the exchange ticker, the extraction, MELTDOWN / $CAPITAL | 56 – 70 |

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

Synthesised in ffmpeg, not generated: a 41 Hz drone with a fifth above it, a kick on 0.75 s through
the middle acts, a half-time hat through the fourth, four impacts on the act boundaries, a noise
riser into the title and a long boom under it. Written to the cut rather than the cut written to it,
which is why the impacts land on 12.2 s, 23.1 s, 45.1 s and 56.3 s.

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

Every prompt carries "no text, no logos, no brands, no visible face", because the world's own
lettering is drawn in the edit where it can be spelled correctly, and because a generated logotype
that resembles a real company's is not something to find out about after publishing. The title,
the ticker and the gameplay card are all drawn by ffmpeg in DejaVu Sans Mono Bold, the closest
match on the box to the game's own terminal chrome.

## Rebuilding

```
npx tsx tools/trailer/capture.ts            # → probe/out/capture/<shot>/f####.jpg
# assemble gp/ from those frame sequences at 30 fps, put hero/ and vid/ alongside
S=<workdir> bash tools/trailer/build.sh     # → trailer_silent.mp4
# then mux the audio bed
```

The finished file is not in the repository. It is 23 MB, it is not a game asset, and
`lint:assets` would be right to complain: the asset budget exists for things the renderer loads.
