/** Matchmaking (Stage 15): public rooms are named by district, mode and a fill shard; the host hands out the first with room. */
export const MAX_PLAYERS_PER_ROOM = 8;
export const matchRoomName = (prefix: string, district: string, mode: "wake" | "run", shard: number): string => `${prefix}-${mode === "run" ? "run-" : ""}${district}${shard ? `-${shard + 1}` : ""}`;
