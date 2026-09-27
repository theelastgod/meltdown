/**
 * The gigs have pictures (Stage 684). The contracts desk listed each fixer's gigs as rows of text.
 * Each of the twelve now carries a thumbnail on its row, drawn in Higgsfield with the Blank from the
 * game's own figures: the escrow heists, the drone convoys, the wake-cell rescues and the sensor
 * sabotage, each in the district it is fought in. Keyed by gig id; the arc's missions lead with
 * their banner instead (missionart.ts).
 */
export const GIG_ART: Readonly<Record<string, string>> = {
  g_escrow_row: "/gigs/g_escrow_row.jpg",
  g_convoy_docks: "/gigs/g_convoy_docks.jpg",
  g_rescue_depot: "/gigs/g_rescue_depot.jpg",
  g_lattice_row: "/gigs/g_lattice_row.jpg",
  g_escrow_depot: "/gigs/g_escrow_depot.jpg",
  g_convoy_row: "/gigs/g_convoy_row.jpg",
  g_rescue_docks: "/gigs/g_rescue_docks.jpg",
  g_lattice_docks: "/gigs/g_lattice_docks.jpg",
  g_escrow_docks: "/gigs/g_escrow_docks.jpg",
  g_convoy_depot: "/gigs/g_convoy_depot.jpg",
  g_rescue_row: "/gigs/g_rescue_row.jpg",
  g_lattice_depot: "/gigs/g_lattice_depot.jpg",
};

/** the thumbnail a desk row leads with: the gig's own picture, or nothing for anything that is not a gig */
export function gigThumb(id: string): string {
  const src = GIG_ART[id];
  return src ? `<img class="gt" src="${src}" alt="">` : "";
}
