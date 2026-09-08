/** Matchmaking (Stage 15): public rooms are named by district, mode and a fill shard; the host hands out the first with room. */
export const MAX_PLAYERS_PER_ROOM = 8;

/**
 * What the player is holding (Stage 34).
 *
 * Stage 32 shipped a phone build and Stage 34 gave it a rotational aim assist, because a thumb
 * cannot do what a mouse does and mobile is where the audience is. That help is only defensible if
 * the two never meet in a room that pays: a slowdown a mouse player does not get is an advantage the
 * moment they share a scoreboard, and this game's PvP pays $CAPITAL.
 *
 * So the input class is part of the room's name. It is not a preference or a soft weighting — a
 * touch player and a desktop player cannot land in the same public room at all, because the rooms
 * have different names and neither host will hand out the other's.
 */
export type InputClass = "touch" | "desk";

/** Read an input class off a query string, defaulting to desktop for anything unrecognised. */
export const inputClassOf = (v: string | null | undefined): InputClass => (v === "touch" ? "touch" : "desk");

/**
 * The public room for a district, mode, fill shard and input class.
 *
 * `mixInputs` collapses the split back into one pool. It exists for the one case that argues against
 * splitting at all — a population too thin to fill either queue — and it is deliberately an operator
 * switch rather than an automatic fallback. Falling back per match would reintroduce the unfairness
 * exactly when nobody is watching for it, and a player who waits longer is better served than one
 * who quietly plays a mouse for money with a thumb.
 */
export const matchRoomName = (prefix: string, district: string, mode: "wake" | "run", shard: number, input: InputClass = "desk", mixInputs = false): string =>
  `${prefix}-${mode === "run" ? "run-" : ""}${!mixInputs && input === "touch" ? "touch-" : ""}${district}${shard ? `-${shard + 1}` : ""}`;
