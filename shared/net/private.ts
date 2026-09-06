/**
 * Private rooms: a server of your own, bought by the hour (Stage 19's `RoomCredits`).
 *
 * # A room you paid for cannot be a room that pays you
 *
 * This is the load-bearing rule, and it is not a stylistic one. A room-hour costs 5 $CAPITAL. Inside
 * a run room a file may bank 200 units a day, which at the doc-population settled rate of about
 * 0.43 $CAPITAL a unit is roughly 86 $CAPITAL — and a private room is one you control, with the
 * claims where you want them and only your friends in it. Five in, eighty-six out, repeatable: the
 * cheapest sink in the economy would be its largest mint.
 *
 * So a private room mints nothing. `MINTLESS` is what that means concretely, and `Room` reads it
 * rather than trusting a caller to pass the right flags — a private room does not bank $CAPITAL,
 * does not submit to the Audit board, and does not contribute to the Deep Wake. Scrip and Depth
 * still accrue, because those are off-chain and already earnable against bots in the offline
 * sandbox; nothing that reaches the chain does.
 *
 * # What a buyer may set
 *
 * Only knobs that cannot change a fight: which district, which mode, how long a round is, how long
 * warmup is, whether bots fill the empty slots, and who is allowed in. Everything that decides a
 * duel — weapon numbers, movement, hit registration, the Fairness Lint's whole surface — is not on
 * this list and never will be. A private room is a scrim, not a mod.
 */

/** The rules a room-hour buys. Every one of these is fairness-neutral by construction. */
export interface PrivateRules {
  /** district id (shared/sim/level.ts); an unknown id falls back to the default */
  district: string;
  mode: "wake" | "run";
  roundSeconds: number;
  warmupSeconds: number;
  /** fill the empty slots with VANTAGE bots */
  ai: boolean;
}

export const DEFAULT_RULES: PrivateRules = { district: "lease_row", mode: "wake", roundSeconds: 360, warmupSeconds: 20, ai: true };

/** Bounds, so a buyer cannot make a room that never ends or never starts. */
export const ROUND_SECONDS = { min: 60, max: 1800 } as const;
export const WARMUP_SECONDS = { min: 0, max: 120 } as const;

/**
 * What a private room may never do, whatever the caller asks for. `Room` applies this itself: a
 * host that forgot to pass `audit: null` must not be able to turn a paid room into a prize channel.
 */
export const MINTLESS = {
  /** THE RUN's banking pays Scrip, never $CAPITAL, and never reaches the day's settlement */
  capital: false,
  /** no placement on the week's Audit board */
  audit: false,
  /** no flips toward the Deep Wake's season pool */
  season: false,
} as const;

export function sanitiseRules(raw: Partial<PrivateRules> | null | undefined): PrivateRules {
  const r = raw ?? {};
  const clamp = (v: unknown, d: number, lo: number, hi: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  return {
    district: typeof r.district === "string" && /^[a-z_]{1,32}$/.test(r.district) ? r.district : DEFAULT_RULES.district,
    mode: r.mode === "run" ? "run" : "wake",
    roundSeconds: clamp(r.roundSeconds, DEFAULT_RULES.roundSeconds, ROUND_SECONDS.min, ROUND_SECONDS.max),
    warmupSeconds: clamp(r.warmupSeconds, DEFAULT_RULES.warmupSeconds, WARMUP_SECONDS.min, WARMUP_SECONDS.max),
    ai: r.ai !== false,
  };
}

/**
 * An invite code: eight characters from an alphabet with no 0/O or 1/I/L, so it can be read aloud
 * without a spelling argument. It is the whole access control — the room name is derived from it,
 * so a code that is not held cannot even be guessed into.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

export function makeInviteCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length)]!;
  return out;
}

export const validInviteCode = (code: string): boolean => new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code);

/** The room name a code opens. Derived, so holding the code is holding the room. */
export const privateRoomName = (code: string): string => `priv-${code.toLowerCase()}`;
export const isPrivateRoom = (name: string): boolean => /^priv-[0-9a-z]{8}$/.test(name);

/** The odds two codes collide, for the doc: 31^8 ≈ 8.5e11. */
export const CODE_SPACE = ALPHABET.length ** CODE_LENGTH;
