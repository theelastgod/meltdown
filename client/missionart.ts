/**
 * The arc's missions have key art (Stage 682). The contracts desk put the next mission in the arc
 * as one row of text: title, district, brief, reward. Each of the seven now leads with its own
 * banner, drawn in Higgsfield with the Blank (and Ida, and Wern, where the mission puts them there)
 * from the game's own figures, in the district the mission is fought in. Once the arc is done, the
 * desk shows the plate of the ending the file earned (Stage 681) in the same place.
 */
export const MISSION_ART: Readonly<Record<string, string>> = {
  m1_wake_unlisted: "/missions/m1_wake_unlisted.jpg",
  m2_deadletter_run: "/missions/m2_deadletter_run.jpg",
  m3_repo_volatility: "/missions/m3_repo_volatility.jpg",
  m4_the_leak: "/missions/m4_the_leak.jpg",
  m5_blind_the_model: "/missions/m5_blind_the_model.jpg",
  m6_trial_by_data: "/missions/m6_trial_by_data.jpg",
  m7_white_office: "/missions/m7_white_office.jpg",
};

/** the banner the desk leads with: the next mission's art, or the ending's plate once the arc is done */
export function deskBanner(next: string | null, ending: string | null, endingArt: Readonly<Record<string, string>>): string | null {
  if (next) return MISSION_ART[next] ?? null;
  return ending ? (endingArt[ending] ?? null) : null;
}
