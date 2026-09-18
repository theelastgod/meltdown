/**
 * What a trigger pull is called (Stage 94).
 *
 * Every alt-fire in the arsenal has sounded exactly like its primary. A choked slug barked like the
 * spread it replaced, a rail quickshot like the charged shot it is not, a sticky like the phage
 * round it is not — and choking the REPO HAMMER, which changes what the next shot does entirely,
 * made no sound at all. The simulation has said which it was since Stage 4: the `fire` event
 * carries `alt`, and the choke emits `altToggle`. The client dropped both on the floor.
 *
 * This is the naming half, pure so it is unit-tested: which voice a trigger pull gets, and which
 * alts change the voice at all. An optic and a brace do not — they change where the round goes,
 * not what the gun is — so their shots keep the primary's bark. `audio.ts` makes the noise.
 */

/** the alts that fire something different, and what that something is called */
const ALT_VOICE: Record<string, string> = {
  repo_hammer: "slug",
  longwave: "quickshot",
  phage: "sticky",
};

/** The voice of a shot: the weapon's own, or its alt's when the alt is a different round. */
export function shotVoice(weapon: string, alt: boolean): string {
  const a = alt ? ALT_VOICE[weapon] : undefined;
  return a ? `${weapon}_${a}` : weapon;
}

/** whether a weapon's alt is a different round (a slug, a quickshot, a sticky) rather than a stance */
export function altChangesVoice(weapon: string): boolean {
  return weapon in ALT_VOICE;
}

/** the toggle's own sound: a choke racking on or off, counted so a probe can hear it */
export function toggleCue(on: boolean): "alt_on" | "alt_off" {
  return on ? "alt_on" : "alt_off";
}
