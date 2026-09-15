# MELTDOWN — the plan from Stage 49

Forty-eight stages in, the brief is built and every claim in it has an artifact behind it or an
entry in `docs/STAGES.md` saying why not. This is the plan for what comes next, written the way
the stages are: each item names what is missing, what will prove it, and what would make it wrong.
The order is the order of value to a player who opens the game today.

The method does not change. A stage ships when its number can be read off a probe, the unit
suite is green after the last edit, and the check that guards it has been made to fail on purpose
at least once.

## What is true today (so the plan starts from facts)

- The campaign is playable in multiplayer on the server side: co-op contract rooms run on the Node
  host and on the `meltdown-campaign` Worker, the mission runtime steps on the server, the first
  file in is the host, and completion settles on every file. `probe:campaign` plays mission one
  through with two clients.
- No player can reach it. The client enters co-op only from a hand-typed URL. The contracts desk
  launches solo contracts and nothing else.
- The site installs to a phone and boots offline; the first download is 265 KB gzipped, the chain
  client a separate 108 KB fetched on demand.
- Every frame-time number in the repo comes from software GL on a CI runner. Nothing has measured a
  phone.
- `server/node-host.ts` is already one process running the whole stack — rooms, co-op, files,
  endgame, counter-ledger, an EVM devnet — and it forgets everything on restart.

## Stage 49 — A crew: the co-op campaign gets a door

*Shipped.*

**Missing.** A way to start a contract with a friend and a way for the friend to find it.

**Build.** On the contracts desk, every launchable contract gets **RUN WITH A CREW** beside
**LAUNCH**. It makes an invite code with the same alphabet Stage 20's private rooms use, names the
co-op room after it (`crew-<CODE>`), and travels there. The desk gets a **JOIN A CREW** field: a
code is looked up on the campaign host (`GET /crew/<code>` → the contract, its district, who is
in it), and a good code travels to the same room. In a crew the HUD's objective line and the desk
both show the code, so the host can read it out. The code is the access control, as it is for
private rooms; a crew nobody is in for a while stops existing, on both hosts.

**Proof.** `probe:campaign`'s co-op leg starts from the desk instead of a URL: the host clicks RUN
WITH A CREW, the guest looks the code up and joins, and the existing checks (both see the contract,
the host holds the terminal, the room completes and settles on both files) run against the room the
code named. A bad code is refused with a reason. `tests/crew.test.ts` pins the pure parts: room
naming round-trips, the URL a crew travels to carries the district and the mission, a code the
alphabet cannot produce is rejected before any network.

**Would be wrong if.** The guest can join a contract they have not reached — that is already
handled: settlement refuses out-of-arc completion per file, so the guest plays and earns nothing.
Kernel Protocols in the crew room — already the room's business, the co-op room applies each
file's own.

## Stage 50 — The phone measures itself

*Shipped; the reading from a real phone is still yours to take.*

**Missing.** A frame-time number from real phone silicon. Every one so far is SwiftShader.

**Build.** `?perf=1` puts a small frame monitor on the HUD: p50 / p95 / p99 frame time over the
last 10 s, draw calls, triangles, internal scale, the GPU's renderer string and the viewport. After
30 s of play it POSTs one report to the ledger host (`/perf`, memory on the Node host, a small D1
table on the Worker) and `GET /perf` lists them, so a phone opened on the deployed site produces a
row I can read without the phone. The overlay is off unless asked for and its sampling costs one
`performance.now()` a frame.

**Proof.** A unit test for the aggregation (a known frame sequence gives known percentiles; a
frame that never ends is not counted as fast). The smoke probe turns the overlay on against the
built site and reads a report back from the host. The number that matters — a mid-range Android's
p95 — is yours to produce by opening the site with `?perf=1`; the stage ships the instrument, not
the reading, and says so.

**Would be wrong if.** The report changed anything the sim does. It is written by the renderer's
frame loop and read by nothing in `shared/sim`; `tests/bundle.test.ts`'s walker can pin that.

## Stage 51 — One server that remembers

**Missing.** The single-process host you asked about, with persistence. Today a restart wipes
every file.

**Build.** SQLite implementations of the three store interfaces the Node host already takes
(`AccountStore`, `EndgameStore`, `RunStore`) on Node's built-in `node:sqlite`, no new dependency,
using the schema `server/schema.sql` already declares for D1. `npx tsx server/node-host.ts --db
meltdown.sqlite` is then a whole backend on one box: rooms, co-op, files, endgame, counter-ledger.
A `docs/DEPLOY.md` §6 says how to run it behind a reverse proxy with the chain RPC pointed at a
real chain instead of the devnet, and what you give up (Durable Object scaling, the key separation
between the match host and the money) by choosing it.

**Proof.** The existing store tests run against the SQLite implementation as well as memory and D1.
A probe writes a file, kills the host, restarts it on the same database and reads the file back
with its Depth, its rig and its campaign save intact.

**Would be wrong if.** The single host quietly mixed the roles the Workers keep apart. The
signer and relayer keys stay environment variables it refuses to start without when a real chain
is configured, and the campaign module stays the only importer of Kernel Protocols; the quarantine
tests already say so and keep saying so.

## Stage 52 — The guest is not a spectator

**Missing.** In a crew the guest sees "THE HOST IS AT THE TERMINAL" and waits. Co-op dialogue is a
solo experience with company.

**Build.** The terminal text mirrors to every file in the crew as it plays; choices stay the
host's (one testimony per contract, and the settlement already keys on it) but the guest reads the
same screen and sees which line the host picked. Objective progress and wave warnings already
mirror; this closes the one channel that did not.

**Proof.** `probe:campaign`: the guest's dialogue view is non-null while the host is at a terminal,
matches the host's script and node, and offers no choices.

## After that, decisions that are yours, not stages

- **Forge uploads and moderation** (`docs/ECONOMY.md` §6.1): the pipeline exists; who may add an
  asset and who says yes is policy.
- **A cap per cosmetic id** (`docs/SECURITY.md` §3.2.4): a contract change, only worth making if
  scarcity is to be a promise.
- **Keys and roles**: rotate the Cloudflare token, replace the placeholder signer and relayer keys,
  and hand steward and poster to a multisig before anything is funded.
- **More plates**: four skins have art; the districts, weapons and the hub are procedural. Each
  still costs credits and is generated only when you say.

## What I will not do without being asked

Merge the three Workers into one script, add wagering or staking of any kind, let a Rewrite reward
touch power, or put an asset within reach of the simulation.
