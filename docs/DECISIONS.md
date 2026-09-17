# MELTDOWN — decisions

The plan (`docs/PLAN.md`) ended with a list of things that were the owner's to decide rather than
stages to build. The owner asked for them to be decided here. Each one below says what was
decided, why, what changed in the repo because of it, and — where a decision cannot be executed
from inside the repo — exactly what remains for the owner to do. A decision that changed nothing
checkable would be a preference, so each is pinned by a test or a probe where one can be.

## 1. The Forge is closed, and struck from the projection

**Decided.** No player uploads. The asset pipeline (`tools/asset-add.ts`, `lint:assets`, the
declared manifest) stays the studio's, which `docs/TOKENOMICS.md` §3.5 already said: "the Forge is
curated and the curation is the studio's". A creator marketplace needs a person to say yes to each
asset and a way to take it down; neither is code, and a route that accepts an image from anyone
without both is a moderation queue with no moderator.

**Why strike it from the economy.** Since Stage 19 the projection has carried the Forge as a
"specified but unbuilt" sink worth 150,000 $CAPITAL a month, reported apart from the published
burn but still printed on every run of `probe:economy`. A sink with no path to being built is not a
projection line; it is a wish with a number on it, which is the exact thing Stage 19 removed the
season buyout for. The published burn ratio was never counting it, so the published number does
not move.

**Changed.** `shared/economy/sinks.ts` no longer lists it; `shared/economy/model.ts` no longer
takes a Forge volume; the projection's "unbuilt" line now says *none* and names this document.
`tests/sinks.test.ts` pins that every sink the model carries is built and that the specified
remainder is zero. The primary-sale split constant stays in the manifest as the documented terms of
a curated primary sale, which is still how a studio-made cosmetic would be sold.

## 2. No cap per cosmetic id

**Decided.** Scarcity stays a policy — what the treasury chooses to list — and never becomes a
promise the contract makes. A hard cap turns a cosmetic into an instrument whose value is its
unavailability, and the market that grows on that is a speculation market. The brief's rule is no
wagering or staking of any kind; a cosmetic that is worth holding because nobody else can get one
is the softest form of the thing that rule exists to keep out. A cap can be added later by
deploying a capped id; a cap once promised cannot be taken back. Nothing to change in code:
`Cosmetics.sol` has no per-id cap and the security review's open item 4 is closed as *no*.

## 3. The placeholder cannot be the key

**Decided.** The rotation itself — replacing the placeholder signer and relayer keys, rotating the
Cloudflare token that was pasted into a chat, and handing the steward and poster roles to a
timelocked multisig — is the owner's, and no code in this repository can do it. What the repository
can do is make the placeholders unable to work anywhere real, so that forgetting the rotation is a
refusal at boot rather than a live ledger on a published key.

**Changed.**
- `server/chain/dev-keys.ts` holds the published dev keys (moved out of the devnet boot so the
  Workers can import it without the devnet) and `isDevKey`.
- The counter Worker answers `DEV KEY ON A REAL CHAIN` on every chain route and skips its cron when
  either key is a dev key — told apart from `CHAIN NOT CONFIGURED`, so an operator knows which of
  the two states they are in.
- The Node host on a real chain refuses to start with a dev key, by name, exit code 2.
- The deploy CLI requires the treasury address (it used to default to the relayer, which on a real
  network would have minted the whole supply to the hot key), refuses a treasury that *is* the
  relayer, and refuses a dev relayer key — before any gas is spent.

Pinned by `tests/keys.test.ts` (every dev key in any casing; the Worker's two refusals told apart;
the deploy guard's five cases) and by `probe:persist`, which starts the host on a real chain with a
dev signer and reads the refusal.

**Still the owner's, in order:** rotate the Cloudflare API token; generate a real signer key and a
real relayer key and put them in the counter Worker's secrets; deploy with a treasury that is a
multisig address; hand steward and poster to it (`setSteward`, `setPoster`). The external audit and
the legal review (security review items 2 and 5) are engagements, not code.

## 4. No further credits on art

**Decided.** The four cosmetics the game sells each have a plate. Nothing else the renderer draws
has a place to hang a generated image yet — districts, weapons and the hub are procedural by
construction — so a plate generated today would be a file in the repository and not a thing on
screen. Art spend resumes when a surface exists for it, and the pipeline is ready when it does. No
credits were spent by this decision.

## 5. Two smaller ones the same list implied

- **The 1 $CAPITAL-a-unit ceiling** (`docs/ECONOMY.md` §6.2) stands until a real population has
  played long enough to move the telemetry off its assumed values; the projection already says on
  its last line which of its inputs are assumed.
- **Sponsored claims through ERC-4337** (security review item 3): not now. The relayer with a
  standing allowance is the security property the review tested; a second payment path is a second
  thing to get wrong before the first has run on a real chain.

## 6. The schedule's day zero (Stage 59)

**Decided.** `LAUNCH_DAY` in `shared/economy/model.ts` is 20,713 — 2026-09-17 as a day index —
the day the emission schedule's first year begins. Until this the schedule was measured from 1970
and every real date fell in its last year. The vault is deployed with the same day, so it is set
once, before the mainnet deploy, to the real launch date; the devnet and the tests use the value as
committed. Changing it after deploy means a new vault, which is the point: the year the economy is
in is not a thing the host decides at runtime.
