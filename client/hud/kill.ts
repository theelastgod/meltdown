/**
 * What closed it (Stage 91).
 *
 * Every kill in this game reads exactly the same. A headshot at forty metres with the last round in
 * the magazine puts up the same four words as a point-blank baton swing, and a training dummy in the
 * range puts up those same four words as another file in a live match — the stamp says KILL
 * CONFIRMED and advances the ledger either way. The game knows better on both counts: it has the
 * zone, the range and the weapon of every round that lands, and it has always known a dummy from a
 * file.
 *
 * The rule here is the honest half of that, and it is honest about one thing in particular: the
 * server credits the kill, but it does not say which of your rounds closed the file. So this keeps
 * the last round you actually landed on each body and claims it only when it landed in the moment
 * the file went down — a grenade that finishes someone you shot ten seconds ago must not put a
 * headshot on the receipt. When it cannot tell, it says nothing rather than something plausible.
 *
 * Pure, so the attribution is unit-tested; the HUD only draws the answer.
 */
import type { HitZone } from "../hit";
import { WEAPONS, type WeaponId } from "@shared/weapons/manifest";

/** a round of mine that landed on a body: when, where, how far, and what fired it */
export interface LandedHit {
  /** seconds on the client's own clock */
  at: number;
  zone: HitZone;
  distance: number;
  weapon: string;
}

/**
 * How recently my round must have landed for the close to be that round's. The shot and the kill are
 * emitted in the same server tick and arrive in the same snapshot, so this is slack for the frame
 * the client read them on, not for the flight of anything.
 */
export const CLOSE_WINDOW = 0.5;
/** and a hit nobody ever closed is forgotten, so the book cannot grow with the match */
export const HIT_MEMORY = 20;

/**
 * A body's key in the book. A dummy's id and a file's id are the same small numbers in this
 * simulation, so keying on the id alone would let a target in the range put a headshot on the
 * receipt for a file with the same number.
 */
export function bodyKey(kind: string, id: number): string {
  return `${kind}:${id}`;
}

/** Remember a round I landed on a body, replacing whatever it had: only the last one can close it. */
export function rememberHit(book: Map<string, LandedHit>, key: string, hit: LandedHit): void {
  book.set(key, hit);
}

/** Drop what is too old to close anything. */
export function forgetOldHits(book: Map<string, LandedHit>, now: number, memory = HIT_MEMORY): void {
  for (const [id, h] of [...book]) if (now - h.at > memory) book.delete(id);
}

/**
 * The round that closed this file, or null when this client cannot honestly say. Null is the right
 * answer for a grenade, a beam, a melee, a body I never hit, and a hit too old to be the one — the
 * receipt then says what it always said and no more.
 */
export function closeRead(book: Map<string, LandedHit>, key: string, now: number, window = CLOSE_WINDOW): LandedHit | null {
  const h = book.get(key);
  if (!h) return null;
  // a clock that has gone backwards (a reconnect, a reset) is not a fresh hit
  const age = now - h.at;
  return age >= 0 && age <= window ? h : null;
}

/** what a kill is called: closing a file is not the same as knocking over a target in the range */
export function stampTitle(victimKind: string): string {
  return victimKind === "dummy" ? "TARGET DOWN" : victimKind === "player" ? "FILE CLOSED" : "KILL CONFIRMED";
}

/** whether it goes on the ledger at all — the range does not */
export function ledgered(victimKind: string): boolean {
  return victimKind !== "dummy";
}

/** the line under the stamp: where it landed, how far it was, and what fired it. Empty when unknown. */
export function closeLine(read: LandedHit | null): string {
  if (!read) return "";
  const where = read.zone === "head" ? "HEAD" : read.zone === "legs" ? "LEGS" : "BODY";
  // Stage 123 named the log; the stamp under the confirm still hyphenated the id (REPO-HAMMER,
  // PHAGE, DIRECTIVE) while the rack says REPO HAMMER, PHAGE LAUNCHER, THE DIRECTIVE.
  return `${where} · ${read.distance < 10 ? read.distance.toFixed(1) : Math.round(read.distance)} M · ${weaponName(read.weapon)}`;
}

/**
 * The weapon's name for a line a player reads (Stage 123): the log had printed the kill with the
 * weapon's id — LEASE_BREAKER, REPO_HAMMER, STACK_SMG — where the rack, the receipt and the
 * manifest say LEASE-BREAKER, REPO HAMMER, STACK SMG. An id the manifest does not know is spelt
 * out with its underscores as spaces rather than shown raw.
 */
export function weaponName(id: string): string {
  return WEAPONS[id as WeaponId]?.name ?? id.toUpperCase().replace(/_/g, " ");
}
