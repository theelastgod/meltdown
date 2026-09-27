/**
 * The endings have pictures (Stage 681). The arc closes on one full-screen card, and until this
 * stage that card was a title and three lines on black whichever of the six endings the file had
 * earned. Each ending now lands on its own plate, drawn in Higgsfield with the game's own figures
 * as reference (the Blank, and Wern, Marrow or Ida where the ending puts them in the room), laid
 * behind the text under a vignette dark enough that every line still reads.
 *
 * A Record over every ending, so a new ending cannot be written without its plate.
 */
import type { EndingId } from "@shared/campaign/testimony";

export const ENDING_ART: Record<EndingId, string> = {
  wipe: "/endings/wipe.jpg",
  chair: "/endings/chair.jpg",
  chair_clockeater: "/endings/chair_clockeater.jpg",
  chair_estate: "/endings/chair_estate.jpg",
  wipe_fire: "/endings/wipe_fire.jpg",
  wipe_quiet: "/endings/wipe_quiet.jpg",
};
