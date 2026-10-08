/**
 * Continent identity on the twenty districts that already exist.
 *
 * Nothing here adds a district, a door, or a citizen mesh. Each street keeps
 * one role. The world map and the contest line are what the player reads.
 */
import { CITY_DISTRICTS } from "../net/city";

export interface StreetCast {
  id: string;
  continent: "PACIFIC" | "ATLANTIC" | "STEPPE" | "SAHARA";
  role: string;
  /** the shooting contest already on this street, named */
  stadium: string;
}

export const STREET_CAST: readonly StreetCast[] = [
  { id: "lease_row", continent: "PACIFIC", role: "CLERK", stadium: "ROW PIT" },
  { id: "deadletter_docks", continent: "PACIFIC", role: "DOCKHAND", stadium: "HARBOUR PIT" },
  { id: "paper_wharf", continent: "PACIFIC", role: "STEVEDORE", stadium: "WHARF PIT" },
  { id: "salt_stairs", continent: "PACIFIC", role: "PILGRIM", stadium: "STAIR PIT" },
  { id: "ash_canal", continent: "PACIFIC", role: "FERRYMAN", stadium: "CANAL PIT" },
  { id: "repo_depot", continent: "ATLANTIC", role: "AUDITOR", stadium: "DEPOT PIT" },
  { id: "cold_vault", continent: "ATLANTIC", role: "ARCHIVIST", stadium: "VAULT PIT" },
  { id: "glass_mile", continent: "ATLANTIC", role: "BROKER", stadium: "MILE PIT" },
  { id: "velvet_court", continent: "ATLANTIC", role: "COURTIER", stadium: "COURT PIT" },
  { id: "rust_crown", continent: "ATLANTIC", role: "SMITH", stadium: "CROWN PIT" },
  { id: "relay_heights", continent: "STEPPE", role: "RIGGER", stadium: "HEIGHTS PIT" },
  { id: "wire_garden", continent: "STEPPE", role: "GARDENER", stadium: "WIRE PIT" },
  { id: "lamp_bazaar", continent: "STEPPE", role: "HAWKER", stadium: "LAMP PIT" },
  { id: "black_relay", continent: "STEPPE", role: "COURIER", stadium: "RELAY PIT" },
  { id: "neon_chapel", continent: "STEPPE", role: "CHANTER", stadium: "CHAPEL PIT" },
  { id: "night_market", continent: "SAHARA", role: "STALLHAND", stadium: "MARKET PIT" },
  { id: "bone_market", continent: "SAHARA", role: "BONEKEEPER", stadium: "BONE PIT" },
  { id: "slag_pit", continent: "SAHARA", role: "PITMAN", stadium: "SLAG PIT" },
  { id: "red_kiln", continent: "SAHARA", role: "KILNHAND", stadium: "KILN PIT" },
  { id: "debt_orchard", continent: "SAHARA", role: "ORCHARDIST", stadium: "ORCHARD PIT" },
];

const BY_ID = new Map(STREET_CAST.map((c) => [c.id, c]));

/** The continent, the role on that street, and the name of its contest block. */
export function streetCast(id: string | undefined): StreetCast | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/** Every city district has exactly one cast entry. */
export function castCoversCity(ids: readonly string[] = CITY_DISTRICTS): boolean {
  return ids.length === STREET_CAST.length && ids.every((id) => BY_ID.has(id));
}
