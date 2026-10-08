/**
 * Stage 1 audio: fully procedural WebAudio so the grey-box ships with real
 * low-end punch and distinct hit silhouettes. Sample-based layers replace
 * these synths in the polish pass without changing the call sites.
 */
import type { HitZone } from "@shared/sim/world";
import { shotVoice, toggleCue } from "./voice";
import { placeFeel } from "./render/places";

/**
 * Rain, hum, and buzz for one named place. Two districts can share a cast and still not share a bed.
 * Lease Row is the bed the city already had. The yard, the office, and the white room keep it.
 */
export type BedTune = {
  rainHz: number;
  rainQ: number;
  rain: number;
  humHz: number;
  hum: number;
  buzzHz: number;
  buzzCut: number;
  buzz: number;
};

/**
 * What the file's own boot hits. Lease Row is the wet street the city already had.
 * Night Market is stall tile, so the two magenta districts do not share a step.
 * Every other room keeps the street.
 */
export type StepSurface = {
  hz: number;
  dur: number;
  q: number;
  type: BiquadFilterType;
};

/** Twelve streets that had no step of their own. Lease Row keeps the wet street below. */
const DISTRICT_STEP: Record<string, StepSurface> = {
  deadletter_docks: { hz: 110, dur: 0.11, q: 0.35, type: "lowpass" },
  repo_depot: { hz: 320, dur: 0.045, q: 0.6, type: "lowpass" },
  relay_heights: { hz: 2100, dur: 0.018, q: 3.1, type: "highpass" },
  bone_market: { hz: 220, dur: 0.05, q: 0.55, type: "lowpass" },
  neon_chapel: { hz: 150, dur: 0.12, q: 0.8, type: "lowpass" },
  wire_garden: { hz: 1600, dur: 0.022, q: 1.6, type: "highpass" },
  red_kiln: { hz: 480, dur: 0.04, q: 1.1, type: "lowpass" },
  paper_wharf: { hz: 90, dur: 0.1, q: 0.25, type: "lowpass" },
  rust_crown: { hz: 700, dur: 0.03, q: 1.2, type: "highpass" },
  lamp_bazaar: { hz: 1200, dur: 0.025, q: 2.0, type: "highpass" },
  debt_orchard: { hz: 200, dur: 0.085, q: 0.45, type: "lowpass" },
  black_relay: { hz: 2500, dur: 0.012, q: 4.0, type: "highpass" },
};

export function stepSurface(name: string | undefined): StepSurface {
  const step = placeFeel(name)?.step;
  if (step) return step;
  if (name === "night_market") return { hz: 920, dur: 0.028, q: 1.8, type: "highpass" };
  if (name && DISTRICT_STEP[name]) return DISTRICT_STEP[name];
  return { hz: 260, dur: 0.06, q: 0.7, type: "lowpass" };
}

/** Base gain of a footstep before speed adds. Lease Row keeps 0.05. The surface stays stepSurface. */
export const STREET_HEFT = 0.05;

const DISTRICT_HEFT: Record<string, number> = {
  deadletter_docks: 0.02,
  repo_depot: 0.08,
  night_market: 0.11,
  relay_heights: 0.06,
  ash_canal: 0.03,
  glass_mile: 0.09,
  bone_market: 0.07,
  cold_vault: 0.04,
  neon_chapel: 0.035,
  slag_pit: 0.13,
  wire_garden: 0.045,
  red_kiln: 0.1,
  paper_wharf: 0.025,
  velvet_court: 0.055,
  rust_crown: 0.075,
  salt_stairs: 0.065,
  lamp_bazaar: 0.12,
  debt_orchard: 0.085,
  black_relay: 0.015,
};

export function stepHeft(name: string | undefined): number {
  return (name && DISTRICT_HEFT[name]) || STREET_HEFT;
}

/**
 * The slap a shot throws back. Deadletter answers late and low, off the water.
 * Eighteen districts each throw their own. Lease Row and the indoor rooms keep the street.
 */
export type ShotSlap = {
  hz: number;
  dur: number;
  q: number;
  lag: number;
  gain: number;
};

/** One slap each. Not a new mesh: the same shot, heard off a different room. */
const DISTRICT_SLAP: Record<string, ShotSlap> = {
  repo_depot: { hz: 860, dur: 0.045, q: 1.7, lag: 0.028, gain: 0.07 },
  night_market: { hz: 2400, dur: 0.022, q: 3.4, lag: 0.012, gain: 0.06 },
  relay_heights: { hz: 3600, dur: 0.16, q: 8, lag: 0.04, gain: 0.04 },
  ash_canal: { hz: 92, dur: 0.74, q: 0.16, lag: 0.24, gain: 0.14 },
  glass_mile: { hz: 1760, dur: 0.42, q: 12, lag: 0.07, gain: 0.055 },
  bone_market: { hz: 78, dur: 0.14, q: 0.42, lag: 0.02, gain: 0.11 },
  cold_vault: { hz: 1480, dur: 0.07, q: 5.2, lag: 0.016, gain: 0.065 },
  neon_chapel: { hz: 310, dur: 1.05, q: 0.22, lag: 0.1, gain: 0.035 },
  slag_pit: { hz: 240, dur: 0.055, q: 0.85, lag: 0.032, gain: 0.17 },
  wire_garden: { hz: 5200, dur: 0.018, q: 6.5, lag: 0.009, gain: 0.03 },
  red_kiln: { hz: 48, dur: 0.62, q: 0.28, lag: 0.13, gain: 0.19 },
  paper_wharf: { hz: 640, dur: 0.09, q: 0.55, lag: 0.046, gain: 0.05 },
  velvet_court: { hz: 190, dur: 0.05, q: 0.3, lag: 0.008, gain: 0.045 },
  rust_crown: { hz: 520, dur: 0.11, q: 0.95, lag: 0.06, gain: 0.08 },
  salt_stairs: { hz: 1100, dur: 0.032, q: 2.8, lag: 0.024, gain: 0.1 },
  lamp_bazaar: { hz: 980, dur: 0.028, q: 1.9, lag: 0.018, gain: 0.025 },
  debt_orchard: { hz: 64, dur: 0.28, q: 0.36, lag: 0.075, gain: 0.1 },
  black_relay: { hz: 2800, dur: 0.22, q: 7.2, lag: 0.34, gain: 0.02 },
};

export function shotSlap(name: string | undefined): ShotSlap {
  if (name === "deadletter_docks") return { hz: 160, dur: 0.48, q: 0.35, lag: 0.16, gain: 0.13 };
  return (name && DISTRICT_SLAP[name]) || { hz: 480, dur: 0.26, q: 0.5, lag: 0.055, gain: 0.09 };
}

/** Metres a shot must travel before the buildings throw it back. Lease Row keeps 22. The slap stays shotSlap. */
export const STREET_GATE = 22;

const DISTRICT_GATE: Record<string, number> = {
  deadletter_docks: 34,
  repo_depot: 18,
  night_market: 12,
  relay_heights: 16,
  ash_canal: 28,
  glass_mile: 14,
  bone_market: 26,
  cold_vault: 40,
  neon_chapel: 31,
  slag_pit: 20,
  wire_garden: 11,
  red_kiln: 24,
  paper_wharf: 36,
  velvet_court: 19,
  rust_crown: 23,
  salt_stairs: 15,
  lamp_bazaar: 9,
  debt_orchard: 29,
  black_relay: 46,
};

export function slapGate(name: string | undefined): number {
  return (name && DISTRICT_GATE[name]) || STREET_GATE;
}

/** The two-tone wail across a district. Lease Row keeps 494 and 660 through a 900 Hz lowpass. */
export type SirenTone = { low: number; high: number; cut: number };

export const STREET_SIREN: SirenTone = { low: 494, high: 660, cut: 900 };

const DISTRICT_SIREN: Record<string, SirenTone> = {
  deadletter_docks: { low: 220, high: 330, cut: 480 },
  repo_depot: { low: 740, high: 980, cut: 1400 },
  night_market: { low: 880, high: 1320, cut: 2400 },
  relay_heights: { low: 1200, high: 1760, cut: 4200 },
  ash_canal: { low: 180, high: 270, cut: 400 },
  glass_mile: { low: 1568, high: 2093, cut: 5000 },
  bone_market: { low: 310, high: 415, cut: 700 },
  cold_vault: { low: 1400, high: 1860, cut: 3200 },
  neon_chapel: { low: 392, high: 587, cut: 1100 },
  slag_pit: { low: 260, high: 390, cut: 600 },
  wire_garden: { low: 1046, high: 1568, cut: 3600 },
  red_kiln: { low: 146, high: 220, cut: 350 },
  paper_wharf: { low: 523, high: 784, cut: 1600 },
  velvet_court: { low: 349, high: 440, cut: 800 },
  rust_crown: { low: 587, high: 880, cut: 1500 },
  salt_stairs: { low: 988, high: 1318, cut: 2800 },
  lamp_bazaar: { low: 698, high: 1046, cut: 2200 },
  debt_orchard: { low: 247, high: 370, cut: 650 },
  black_relay: { low: 1661, high: 2217, cut: 4800 },
};

export function sirenTone(name: string | undefined): SirenTone {
  return (name && DISTRICT_SIREN[name]) || STREET_SIREN;
}

/** Seconds between the two tones inside one wail. Lease Row keeps 0.8. The pitches stay sirenTone. */
export const STREET_FLIP = 0.8;

const DISTRICT_FLIP: Record<string, number> = {
  deadletter_docks: 1.15,
  repo_depot: 0.62,
  night_market: 0.34,
  relay_heights: 0.48,
  ash_canal: 1.35,
  glass_mile: 0.28,
  bone_market: 0.95,
  cold_vault: 0.55,
  neon_chapel: 1.05,
  slag_pit: 0.72,
  wire_garden: 0.41,
  red_kiln: 1.25,
  paper_wharf: 0.88,
  velvet_court: 1.0,
  rust_crown: 0.66,
  salt_stairs: 0.38,
  lamp_bazaar: 0.31,
  debt_orchard: 1.08,
  black_relay: 0.22,
};

export function sirenFlip(name: string | undefined): number {
  return (name && DISTRICT_FLIP[name]) || STREET_FLIP;
}

/** Seconds before the next street siren, before the shared jitter. Lease Row keeps 38. */
export const STREET_WAIT = 38;

const DISTRICT_WAIT: Record<string, number> = {
  deadletter_docks: 62,
  repo_depot: 44,
  night_market: 22,
  relay_heights: 28,
  ash_canal: 71,
  glass_mile: 18,
  bone_market: 51,
  cold_vault: 33,
  neon_chapel: 56,
  slag_pit: 47,
  wire_garden: 26,
  red_kiln: 68,
  paper_wharf: 41,
  velvet_court: 53,
  rust_crown: 36,
  salt_stairs: 24,
  lamp_bazaar: 19,
  debt_orchard: 59,
  black_relay: 16,
};

export function sirenWait(name: string | undefined): number {
  return (name && DISTRICT_WAIT[name]) || STREET_WAIT;
}

/** The three-note chime before a street announcement. Lease Row keeps 523, 659, 784. */
export type PaChime = readonly [number, number, number];

export const STREET_PA: PaChime = [523, 659, 784];

const DISTRICT_PA: Record<string, PaChime> = {
  deadletter_docks: [196, 247, 294],
  repo_depot: [370, 440, 554],
  night_market: [880, 1174, 1568],
  relay_heights: [1318, 1568, 2093],
  ash_canal: [174, 220, 261],
  glass_mile: [1568, 1976, 2349],
  bone_market: [277, 349, 415],
  cold_vault: [1397, 1661, 1976],
  neon_chapel: [330, 415, 494],
  slag_pit: [233, 311, 392],
  wire_garden: [988, 1318, 1760],
  red_kiln: [155, 196, 247],
  paper_wharf: [466, 587, 698],
  velvet_court: [311, 392, 466],
  rust_crown: [415, 523, 622],
  salt_stairs: [1046, 1318, 1568],
  lamp_bazaar: [740, 932, 1174],
  debt_orchard: [220, 277, 330],
  black_relay: [1760, 2217, 2637],
};

export function paChime(name: string | undefined): PaChime {
  return (name && DISTRICT_PA[name]) || STREET_PA;
}

/** Seconds between the three announcement notes. Lease Row keeps the 0.22 the chime shipped with. */
export const STREET_BEAT = 0.22;

const DISTRICT_BEAT: Record<string, number> = {
  deadletter_docks: 0.41,
  repo_depot: 0.28,
  night_market: 0.11,
  relay_heights: 0.16,
  ash_canal: 0.48,
  glass_mile: 0.09,
  bone_market: 0.33,
  cold_vault: 0.19,
  neon_chapel: 0.36,
  slag_pit: 0.25,
  wire_garden: 0.14,
  red_kiln: 0.44,
  paper_wharf: 0.3,
  velvet_court: 0.38,
  rust_crown: 0.21,
  salt_stairs: 0.13,
  lamp_bazaar: 0.1,
  debt_orchard: 0.35,
  black_relay: 0.08,
};

export function paBeat(name: string | undefined): number {
  return (name && DISTRICT_BEAT[name]) || STREET_BEAT;
}

/** Seconds added between PA syllables. Lease Row keeps the 0.14 the speaker shipped with. */
export const STREET_TALK = 0.14;

const DISTRICT_TALK: Record<string, number> = {
  deadletter_docks: 0.26,
  repo_depot: 0.18,
  night_market: 0.07,
  relay_heights: 0.11,
  ash_canal: 0.31,
  glass_mile: 0.06,
  bone_market: 0.21,
  cold_vault: 0.13,
  neon_chapel: 0.23,
  slag_pit: 0.16,
  wire_garden: 0.09,
  red_kiln: 0.28,
  paper_wharf: 0.19,
  velvet_court: 0.24,
  rust_crown: 0.15,
  salt_stairs: 0.08,
  lamp_bazaar: 0.1,
  debt_orchard: 0.22,
  black_relay: 0.05,
};

export function paTalk(name: string | undefined): number {
  return (name && DISTRICT_TALK[name]) || STREET_TALK;
}

/** Seconds each announcement syllable holds. Lease Row keeps the 0.11 the speaker shipped with. */
export const STREET_HOLD = 0.11;

const DISTRICT_HOLD: Record<string, number> = {
  deadletter_docks: 0.22,
  repo_depot: 0.15,
  night_market: 0.05,
  relay_heights: 0.08,
  ash_canal: 0.28,
  glass_mile: 0.04,
  bone_market: 0.18,
  cold_vault: 0.09,
  neon_chapel: 0.2,
  slag_pit: 0.13,
  wire_garden: 0.06,
  red_kiln: 0.24,
  paper_wharf: 0.16,
  velvet_court: 0.19,
  rust_crown: 0.12,
  salt_stairs: 0.07,
  lamp_bazaar: 0.045,
  debt_orchard: 0.21,
  black_relay: 0.03,
};

export function paHold(name: string | undefined): number {
  return (name && DISTRICT_HOLD[name]) || STREET_HOLD;
}

/** Seconds after the chime before the first syllable. Lease Row keeps the 0.9 the speaker shipped with. */
export const STREET_LEAD = 0.9;

const DISTRICT_LEAD: Record<string, number> = {
  deadletter_docks: 1.55,
  repo_depot: 1.05,
  night_market: 0.42,
  relay_heights: 0.62,
  ash_canal: 1.7,
  glass_mile: 0.28,
  bone_market: 1.15,
  cold_vault: 0.74,
  neon_chapel: 1.35,
  slag_pit: 1.0,
  wire_garden: 0.5,
  red_kiln: 1.45,
  paper_wharf: 1.1,
  velvet_court: 1.25,
  rust_crown: 0.82,
  salt_stairs: 0.55,
  lamp_bazaar: 0.36,
  debt_orchard: 1.2,
  black_relay: 0.22,
};

export function paLead(name: string | undefined): number {
  return (name && DISTRICT_LEAD[name]) || STREET_LEAD;
}

/** Peak gain of the three announcement notes. Lease Row keeps the 0.07 the chime shipped with. */
export const STREET_LOUD = 0.07;

const DISTRICT_LOUD: Record<string, number> = {
  deadletter_docks: 0.03,
  repo_depot: 0.09,
  night_market: 0.16,
  relay_heights: 0.11,
  ash_canal: 0.04,
  glass_mile: 0.18,
  bone_market: 0.06,
  cold_vault: 0.08,
  neon_chapel: 0.05,
  slag_pit: 0.13,
  wire_garden: 0.1,
  red_kiln: 0.14,
  paper_wharf: 0.045,
  velvet_court: 0.035,
  rust_crown: 0.12,
  salt_stairs: 0.15,
  lamp_bazaar: 0.17,
  debt_orchard: 0.055,
  black_relay: 0.2,
};

export function paLoud(name: string | undefined): number {
  return (name && DISTRICT_LOUD[name]) || STREET_LOUD;
}

/** The speaker voice after the chime. Lease Row keeps the street formants. */
export const STREET_VOICE: readonly number[] = [640, 820, 1100, 720, 980, 560, 1250, 880, 700];

const VOICE_SCALE: Record<string, number> = {
  deadletter_docks: 0.55,
  repo_depot: 1.15,
  night_market: 1.45,
  relay_heights: 1.7,
  ash_canal: 0.42,
  glass_mile: 1.85,
  bone_market: 0.72,
  cold_vault: 1.55,
  neon_chapel: 0.88,
  slag_pit: 0.62,
  wire_garden: 1.32,
  red_kiln: 0.48,
  paper_wharf: 0.95,
  velvet_court: 0.78,
  rust_crown: 1.08,
  salt_stairs: 1.22,
  lamp_bazaar: 1.38,
  debt_orchard: 0.68,
  black_relay: 1.92,
};

export function paVoice(name: string | undefined): readonly number[] {
  const scale = name ? VOICE_SCALE[name] : undefined;
  if (!scale) return STREET_VOICE;
  return STREET_VOICE.map((hz) => Math.round(hz * scale));
}

/** The monorail whoosh. Lease Row opens at 200, peaks at 1800, and the motor falls 210 to 140. */
export type TramPass = { open: number; peak: number; close: number; motorFrom: number; motorTo: number };

export const STREET_TRAM: TramPass = { open: 200, peak: 1800, close: 160, motorFrom: 210, motorTo: 140 };

const DISTRICT_TRAM: Record<string, TramPass> = {
  deadletter_docks: { open: 90, peak: 700, close: 70, motorFrom: 110, motorTo: 70 },
  repo_depot: { open: 240, peak: 1400, close: 180, motorFrom: 260, motorTo: 160 },
  night_market: { open: 320, peak: 2400, close: 220, motorFrom: 340, motorTo: 200 },
  relay_heights: { open: 400, peak: 3200, close: 280, motorFrom: 480, motorTo: 300 },
  ash_canal: { open: 70, peak: 520, close: 55, motorFrom: 90, motorTo: 50 },
  glass_mile: { open: 480, peak: 4000, close: 360, motorFrom: 620, motorTo: 400 },
  bone_market: { open: 140, peak: 900, close: 110, motorFrom: 150, motorTo: 90 },
  cold_vault: { open: 360, peak: 2800, close: 240, motorFrom: 420, motorTo: 260 },
  neon_chapel: { open: 180, peak: 1100, close: 130, motorFrom: 190, motorTo: 120 },
  slag_pit: { open: 110, peak: 640, close: 80, motorFrom: 130, motorTo: 75 },
  wire_garden: { open: 280, peak: 2100, close: 200, motorFrom: 300, motorTo: 180 },
  red_kiln: { open: 60, peak: 420, close: 48, motorFrom: 80, motorTo: 42 },
  paper_wharf: { open: 160, peak: 1200, close: 140, motorFrom: 170, motorTo: 100 },
  velvet_court: { open: 130, peak: 800, close: 95, motorFrom: 140, motorTo: 85 },
  rust_crown: { open: 210, peak: 1600, close: 150, motorFrom: 230, motorTo: 145 },
  salt_stairs: { open: 300, peak: 2200, close: 190, motorFrom: 360, motorTo: 220 },
  lamp_bazaar: { open: 260, peak: 1900, close: 170, motorFrom: 280, motorTo: 175 },
  debt_orchard: { open: 100, peak: 760, close: 85, motorFrom: 120, motorTo: 65 },
  black_relay: { open: 520, peak: 4600, close: 400, motorFrom: 700, motorTo: 440 },
};

export function tramPass(name: string | undefined): TramPass {
  return (name && DISTRICT_TRAM[name]) || STREET_TRAM;
}

/** Peak gain of the monorail whoosh. Lease Row keeps the 0.3 the pass shipped with. The band stays tramPass. */
export const STREET_RUSH = 0.3;

const DISTRICT_RUSH: Record<string, number> = {
  deadletter_docks: 0.12,
  repo_depot: 0.38,
  night_market: 0.55,
  relay_heights: 0.42,
  ash_canal: 0.16,
  glass_mile: 0.62,
  bone_market: 0.22,
  cold_vault: 0.34,
  neon_chapel: 0.18,
  slag_pit: 0.48,
  wire_garden: 0.36,
  red_kiln: 0.58,
  paper_wharf: 0.2,
  velvet_court: 0.14,
  rust_crown: 0.4,
  salt_stairs: 0.46,
  lamp_bazaar: 0.52,
  debt_orchard: 0.26,
  black_relay: 0.7,
};

export function tramRush(name: string | undefined): number {
  return (name && DISTRICT_RUSH[name]) || STREET_RUSH;
}

/** Seconds the monorail motor note holds. Lease Row keeps the 2.4 the pass shipped with. Gain stays 0.08. */
export const STREET_SPAN = 2.4;

const DISTRICT_SPAN: Record<string, number> = {
  deadletter_docks: 3.6,
  repo_depot: 2.1,
  night_market: 1.4,
  relay_heights: 1.9,
  ash_canal: 3.2,
  glass_mile: 1.2,
  bone_market: 2.8,
  cold_vault: 2.2,
  neon_chapel: 3.0,
  slag_pit: 2.55,
  wire_garden: 1.7,
  red_kiln: 3.4,
  paper_wharf: 2.65,
  velvet_court: 3.15,
  rust_crown: 2.05,
  salt_stairs: 1.55,
  lamp_bazaar: 1.35,
  debt_orchard: 2.9,
  black_relay: 1.05,
};

export function tramSpan(name: string | undefined): number {
  return (name && DISTRICT_SPAN[name]) || STREET_SPAN;
}

/** Distant traffic in the bed. Lease Row keeps the rumble the city already had. */
export type FarTraffic = { rate: number; cut: number; swell: number };

export const STREET_TRAFFIC: FarTraffic = { rate: 0.37, cut: 180, swell: 0.09 };

const DISTRICT_TRAFFIC: Record<string, FarTraffic> = {
  deadletter_docks: { rate: 0.22, cut: 90, swell: 0.05 },
  repo_depot: { rate: 0.48, cut: 240, swell: 0.13 },
  night_market: { rate: 0.55, cut: 320, swell: 0.16 },
  relay_heights: { rate: 0.62, cut: 420, swell: 0.04 },
  ash_canal: { rate: 0.18, cut: 70, swell: 0.06 },
  glass_mile: { rate: 0.7, cut: 520, swell: 0.03 },
  bone_market: { rate: 0.3, cut: 140, swell: 0.1 },
  cold_vault: { rate: 0.44, cut: 260, swell: 0.07 },
  neon_chapel: { rate: 0.28, cut: 110, swell: 0.08 },
  slag_pit: { rate: 0.4, cut: 200, swell: 0.18 },
  wire_garden: { rate: 0.5, cut: 300, swell: 0.11 },
  red_kiln: { rate: 0.33, cut: 150, swell: 0.14 },
  paper_wharf: { rate: 0.26, cut: 100, swell: 0.07 },
  velvet_court: { rate: 0.24, cut: 85, swell: 0.045 },
  rust_crown: { rate: 0.42, cut: 210, swell: 0.12 },
  salt_stairs: { rate: 0.58, cut: 380, swell: 0.06 },
  lamp_bazaar: { rate: 0.52, cut: 280, swell: 0.15 },
  debt_orchard: { rate: 0.35, cut: 160, swell: 0.08 },
  black_relay: { rate: 0.66, cut: 480, swell: 0.02 },
};

export function farTraffic(name: string | undefined): FarTraffic {
  return (name && DISTRICT_TRAFFIC[name]) || STREET_TRAFFIC;
}

/** Crowd murmur in the bed: two vowel bands, each on its own slow breath. Lease Row keeps the pair the city already had. */
export type CrowdMurmur = { aHz: number; aRate: number; aGain: number; bHz: number; bRate: number; bGain: number };

export const STREET_MURMUR: CrowdMurmur = { aHz: 420, aRate: 0.23, aGain: 0.05, bHz: 760, bRate: 0.31, bGain: 0.035 };

const DISTRICT_MURMUR: Record<string, CrowdMurmur> = {
  deadletter_docks: { aHz: 280, aRate: 0.12, aGain: 0.07, bHz: 540, bRate: 0.18, bGain: 0.04 },
  repo_depot: { aHz: 360, aRate: 0.28, aGain: 0.04, bHz: 640, bRate: 0.4, bGain: 0.03 },
  night_market: { aHz: 510, aRate: 0.45, aGain: 0.08, bHz: 980, bRate: 0.55, bGain: 0.06 },
  relay_heights: { aHz: 680, aRate: 0.15, aGain: 0.02, bHz: 1400, bRate: 0.22, bGain: 0.015 },
  ash_canal: { aHz: 240, aRate: 0.1, aGain: 0.06, bHz: 480, bRate: 0.16, bGain: 0.045 },
  glass_mile: { aHz: 880, aRate: 0.2, aGain: 0.025, bHz: 1600, bRate: 0.27, bGain: 0.018 },
  bone_market: { aHz: 330, aRate: 0.19, aGain: 0.055, bHz: 610, bRate: 0.26, bGain: 0.038 },
  cold_vault: { aHz: 460, aRate: 0.14, aGain: 0.03, bHz: 920, bRate: 0.21, bGain: 0.022 },
  neon_chapel: { aHz: 390, aRate: 0.08, aGain: 0.065, bHz: 720, bRate: 0.13, bGain: 0.05 },
  slag_pit: { aHz: 300, aRate: 0.33, aGain: 0.07, bHz: 580, bRate: 0.42, bGain: 0.048 },
  wire_garden: { aHz: 740, aRate: 0.36, aGain: 0.035, bHz: 1280, bRate: 0.48, bGain: 0.028 },
  red_kiln: { aHz: 350, aRate: 0.25, aGain: 0.06, bHz: 670, bRate: 0.34, bGain: 0.042 },
  paper_wharf: { aHz: 260, aRate: 0.11, aGain: 0.045, bHz: 500, bRate: 0.17, bGain: 0.032 },
  velvet_court: { aHz: 400, aRate: 0.09, aGain: 0.075, bHz: 800, bRate: 0.14, bGain: 0.055 },
  rust_crown: { aHz: 440, aRate: 0.3, aGain: 0.048, bHz: 860, bRate: 0.38, bGain: 0.036 },
  salt_stairs: { aHz: 560, aRate: 0.17, aGain: 0.028, bHz: 1100, bRate: 0.24, bGain: 0.02 },
  lamp_bazaar: { aHz: 620, aRate: 0.41, aGain: 0.058, bHz: 1180, bRate: 0.5, bGain: 0.04 },
  debt_orchard: { aHz: 310, aRate: 0.13, aGain: 0.052, bHz: 590, bRate: 0.2, bGain: 0.034 },
  black_relay: { aHz: 900, aRate: 0.06, aGain: 0.018, bHz: 1800, bRate: 0.11, bGain: 0.012 },
};

export function crowdMurmur(name: string | undefined): CrowdMurmur {
  return (name && DISTRICT_MURMUR[name]) || STREET_MURMUR;
}

/** How narrow the crowd-murmur bands sit, as bandpass Q. Lease Row keeps 2.2. The pair stays crowdMurmur. */
export const STREET_Q = 2.2;

const DISTRICT_Q: Record<string, number> = {
  deadletter_docks: 1.1,
  repo_depot: 2.8,
  night_market: 4.6,
  relay_heights: 3.4,
  ash_canal: 0.9,
  glass_mile: 6.2,
  bone_market: 1.6,
  cold_vault: 5.1,
  neon_chapel: 3.8,
  slag_pit: 1.4,
  wire_garden: 5.6,
  red_kiln: 2.4,
  paper_wharf: 1.2,
  velvet_court: 7.4,
  rust_crown: 2.6,
  salt_stairs: 4.1,
  lamp_bazaar: 3.1,
  debt_orchard: 1.8,
  black_relay: 8.2,
};

export function murmurQ(name: string | undefined): number {
  return (name && DISTRICT_Q[name]) || STREET_Q;
}

/** How fast the neon buzz breathes, in hertz. Lease Row keeps the rate the bed shipped with. */
export const STREET_FLICKER = 7.3;

const DISTRICT_FLICKER: Record<string, number> = {
  deadletter_docks: 3.1,
  repo_depot: 5.4,
  night_market: 11.2,
  relay_heights: 9.6,
  ash_canal: 2.4,
  glass_mile: 12.8,
  bone_market: 4.2,
  cold_vault: 2.8,
  neon_chapel: 6.1,
  slag_pit: 4.8,
  wire_garden: 8.4,
  red_kiln: 3.7,
  paper_wharf: 2.2,
  velvet_court: 5.8,
  rust_crown: 6.6,
  salt_stairs: 10.4,
  lamp_bazaar: 13.1,
  debt_orchard: 4.5,
  black_relay: 8.9,
};

export function buzzFlicker(name: string | undefined): number {
  return (name && DISTRICT_FLICKER[name]) || STREET_FLICKER;
}

/** How deep the neon buzz breathes, as LFO gain. Lease Row keeps the depth the bed shipped with. The rate stays buzzFlicker. */
export const STREET_DEPTH = 0.006;

const DISTRICT_DEPTH: Record<string, number> = {
  deadletter_docks: 0.003,
  repo_depot: 0.008,
  night_market: 0.014,
  relay_heights: 0.009,
  ash_canal: 0.004,
  glass_mile: 0.016,
  bone_market: 0.005,
  cold_vault: 0.0025,
  neon_chapel: 0.011,
  slag_pit: 0.013,
  wire_garden: 0.007,
  red_kiln: 0.015,
  paper_wharf: 0.0035,
  velvet_court: 0.0045,
  rust_crown: 0.01,
  salt_stairs: 0.012,
  lamp_bazaar: 0.017,
  debt_orchard: 0.0065,
  black_relay: 0.002,
};

export function buzzDepth(name: string | undefined): number {
  return (name && DISTRICT_DEPTH[name]) || STREET_DEPTH;
}

/** Base gain of the distant-traffic rumble. Lease Row keeps 0.16. Rate, cut, and swell stay farTraffic. */
export const STREET_BODY = 0.16;

const DISTRICT_BODY: Record<string, number> = {
  deadletter_docks: 0.08,
  repo_depot: 0.22,
  night_market: 0.28,
  relay_heights: 0.12,
  ash_canal: 0.1,
  glass_mile: 0.05,
  bone_market: 0.19,
  cold_vault: 0.07,
  neon_chapel: 0.14,
  slag_pit: 0.26,
  wire_garden: 0.18,
  red_kiln: 0.24,
  paper_wharf: 0.09,
  velvet_court: 0.11,
  rust_crown: 0.2,
  salt_stairs: 0.13,
  lamp_bazaar: 0.3,
  debt_orchard: 0.15,
  black_relay: 0.04,
};

export function trafficBody(name: string | undefined): number {
  return (name && DISTRICT_BODY[name]) || STREET_BODY;
}

/** How high a near-miss snap sits, in hertz. Lease Row keeps 4200. The air closing behind it stays 1900. */
export const STREET_SNAP = 4200;

const DISTRICT_SNAP: Record<string, number> = {
  deadletter_docks: 2400,
  repo_depot: 3100,
  night_market: 6100,
  relay_heights: 5200,
  ash_canal: 1800,
  glass_mile: 6800,
  bone_market: 2700,
  cold_vault: 1500,
  neon_chapel: 3600,
  slag_pit: 2200,
  wire_garden: 4900,
  red_kiln: 3300,
  paper_wharf: 2600,
  velvet_court: 3900,
  rust_crown: 2900,
  salt_stairs: 5600,
  lamp_bazaar: 6400,
  debt_orchard: 2100,
  black_relay: 7400,
};

export function snapPitch(name: string | undefined): number {
  return (name && DISTRICT_SNAP[name]) || STREET_SNAP;
}

/** How high a jump's thud sits, in hertz. Lease Row keeps 350. Duration, Q, and gain stay put. */
export const STREET_JUMP = 350;

const DISTRICT_JUMP: Record<string, number> = {
  deadletter_docks: 180,
  repo_depot: 420,
  night_market: 780,
  relay_heights: 510,
  ash_canal: 140,
  glass_mile: 920,
  bone_market: 260,
  cold_vault: 110,
  neon_chapel: 640,
  slag_pit: 210,
  wire_garden: 860,
  red_kiln: 470,
  paper_wharf: 160,
  velvet_court: 580,
  rust_crown: 390,
  salt_stairs: 720,
  lamp_bazaar: 840,
  debt_orchard: 240,
  black_relay: 990,
};

export function jumpPitch(name: string | undefined): number {
  return (name && DISTRICT_JUMP[name]) || STREET_JUMP;
}

/** How high a landing's body sits, in hertz. Lease Row keeps 300. The drop, duration, Q, and gain stay put. */
export const STREET_LAND = 300;

const DISTRICT_LAND: Record<string, number> = {
  deadletter_docks: 140,
  repo_depot: 380,
  night_market: 720,
  relay_heights: 460,
  ash_canal: 90,
  glass_mile: 880,
  bone_market: 220,
  cold_vault: 110,
  neon_chapel: 540,
  slag_pit: 180,
  wire_garden: 640,
  red_kiln: 410,
  paper_wharf: 160,
  velvet_court: 500,
  rust_crown: 340,
  salt_stairs: 600,
  lamp_bazaar: 760,
  debt_orchard: 200,
  black_relay: 940,
};

export function landPitch(name: string | undefined): number {
  return (name && DISTRICT_LAND[name]) || STREET_LAND;
}

/** How high a slide's scrape sits, in hertz. Lease Row keeps 500. Duration, Q, and gain stay put. */
export const STREET_SLIDE = 500;

const DISTRICT_SLIDE: Record<string, number> = {
  deadletter_docks: 220,
  repo_depot: 380,
  night_market: 920,
  relay_heights: 640,
  ash_canal: 160,
  glass_mile: 1100,
  bone_market: 280,
  cold_vault: 740,
  neon_chapel: 480,
  slag_pit: 190,
  wire_garden: 1400,
  red_kiln: 310,
  paper_wharf: 260,
  velvet_court: 560,
  rust_crown: 420,
  salt_stairs: 860,
  lamp_bazaar: 780,
  debt_orchard: 150,
  black_relay: 1600,
};

export function slidePitch(name: string | undefined): number {
  return (name && DISTRICT_SLIDE[name]) || STREET_SLIDE;
}

/** How high a hit's thud sits, in hertz. Lease Row keeps 500. Duration, Q, and gain stay put. */
export const STREET_HURT = 500;

const DISTRICT_HURT: Record<string, number> = {
  deadletter_docks: 180,
  repo_depot: 420,
  night_market: 1400,
  relay_heights: 760,
  ash_canal: 120,
  glass_mile: 1800,
  bone_market: 260,
  cold_vault: 980,
  neon_chapel: 640,
  slag_pit: 210,
  wire_garden: 2200,
  red_kiln: 340,
  paper_wharf: 300,
  velvet_court: 560,
  rust_crown: 480,
  salt_stairs: 860,
  lamp_bazaar: 1100,
  debt_orchard: 150,
  black_relay: 2600,
};

export function hurtPitch(name: string | undefined): number {
  return (name && DISTRICT_HURT[name]) || STREET_HURT;
}

/** How high a reload's first click sits, in hertz. Lease Row keeps 1800. Duration, Q, and gain stay put. */
export const STREET_RELOAD = 1800;

const DISTRICT_RELOAD: Record<string, number> = {
  deadletter_docks: 620,
  repo_depot: 980,
  night_market: 2600,
  relay_heights: 2100,
  ash_canal: 440,
  glass_mile: 3200,
  bone_market: 760,
  cold_vault: 1540,
  neon_chapel: 880,
  slag_pit: 540,
  wire_garden: 3600,
  red_kiln: 1120,
  paper_wharf: 680,
  velvet_court: 1320,
  rust_crown: 1680,
  salt_stairs: 1960,
  lamp_bazaar: 2280,
  debt_orchard: 360,
  black_relay: 4100,
};

export function reloadPitch(name: string | undefined): number {
  return (name && DISTRICT_RELOAD[name]) || STREET_RELOAD;
}

/** How high a mantle's scrape sits, in hertz. Lease Row keeps 700. Duration, Q, gain, and the drop stay put. */
export const STREET_MANTLE = 700;

const DISTRICT_MANTLE: Record<string, number> = {
  deadletter_docks: 280,
  repo_depot: 420,
  night_market: 1480,
  relay_heights: 1100,
  ash_canal: 240,
  glass_mile: 1800,
  bone_market: 360,
  cold_vault: 820,
  neon_chapel: 520,
  slag_pit: 190,
  wire_garden: 2100,
  red_kiln: 640,
  paper_wharf: 310,
  velvet_court: 960,
  rust_crown: 760,
  salt_stairs: 1280,
  lamp_bazaar: 1600,
  debt_orchard: 160,
  black_relay: 2400,
};

export function mantlePitch(name: string | undefined): number {
  return (name && DISTRICT_MANTLE[name]) || STREET_MANTLE;
}

/** How high an empty click starts, in hertz. Lease Row keeps 900. It still falls to 500. */
export const STREET_DRY = 900;

const DISTRICT_DRY: Record<string, number> = {
  deadletter_docks: 540,
  repo_depot: 720,
  night_market: 1680,
  relay_heights: 1240,
  ash_canal: 620,
  glass_mile: 2100,
  bone_market: 780,
  cold_vault: 980,
  neon_chapel: 860,
  slag_pit: 660,
  wire_garden: 2400,
  red_kiln: 1100,
  paper_wharf: 580,
  velvet_court: 1400,
  rust_crown: 1040,
  salt_stairs: 1860,
  lamp_bazaar: 1980,
  debt_orchard: 520,
  black_relay: 2800,
};

export function dryPitch(name: string | undefined): number {
  return (name && DISTRICT_DRY[name]) || STREET_DRY;
}

/** How high a thrown charge's whoosh sits, in hertz. Lease Row keeps 1200. Duration, Q, and gain stay put. */
export const STREET_THROW = 1200;

const DISTRICT_THROW: Record<string, number> = {
  deadletter_docks: 640,
  repo_depot: 880,
  night_market: 2100,
  relay_heights: 1560,
  ash_canal: 720,
  glass_mile: 2600,
  bone_market: 980,
  cold_vault: 1320,
  neon_chapel: 1100,
  slag_pit: 540,
  wire_garden: 3200,
  red_kiln: 1480,
  paper_wharf: 760,
  velvet_court: 1840,
  rust_crown: 1400,
  salt_stairs: 2300,
  lamp_bazaar: 2800,
  debt_orchard: 480,
  black_relay: 3600,
};

export function throwPitch(name: string | undefined): number {
  return (name && DISTRICT_THROW[name]) || STREET_THROW;
}

/** How high a weapon swap's first click sits, in hertz. Lease Row keeps 700. The second click stays 2200. */
export const STREET_SWAP = 700;

const DISTRICT_SWAP: Record<string, number> = {
  deadletter_docks: 380,
  repo_depot: 520,
  night_market: 1480,
  relay_heights: 980,
  ash_canal: 440,
  glass_mile: 1800,
  bone_market: 560,
  cold_vault: 820,
  neon_chapel: 640,
  slag_pit: 320,
  wire_garden: 2100,
  red_kiln: 760,
  paper_wharf: 480,
  velvet_court: 1100,
  rust_crown: 880,
  salt_stairs: 1280,
  lamp_bazaar: 1600,
  debt_orchard: 280,
  black_relay: 2400,
};

export function swapPitch(name: string | undefined): number {
  return (name && DISTRICT_SWAP[name]) || STREET_SWAP;
}

/** How high a landed body's marker starts, in hertz. Lease Row keeps 1100. Head stays 2200 and legs stay 600. */
export const STREET_MARK = 1100;

const DISTRICT_MARK: Record<string, number> = {
  deadletter_docks: 420,
  repo_depot: 780,
  night_market: 1860,
  relay_heights: 980,
  ash_canal: 360,
  glass_mile: 2400,
  bone_market: 540,
  cold_vault: 1320,
  neon_chapel: 860,
  slag_pit: 280,
  wire_garden: 2800,
  red_kiln: 640,
  paper_wharf: 480,
  velvet_court: 1540,
  rust_crown: 720,
  salt_stairs: 1680,
  lamp_bazaar: 2100,
  debt_orchard: 240,
  black_relay: 3200,
};

export function markPitch(name: string | undefined): number {
  return (name && DISTRICT_MARK[name]) || STREET_MARK;
}

/** How high the last-quarter magazine tick starts, in hertz. Lease Row keeps 2600. The second tick stays 2100. */
export const STREET_CLIP = 2600;

const DISTRICT_CLIP: Record<string, number> = {
  deadletter_docks: 980,
  repo_depot: 1400,
  night_market: 3400,
  relay_heights: 2200,
  ash_canal: 760,
  glass_mile: 3900,
  bone_market: 1180,
  cold_vault: 1760,
  neon_chapel: 1560,
  slag_pit: 620,
  wire_garden: 4300,
  red_kiln: 1900,
  paper_wharf: 1080,
  velvet_court: 2800,
  rust_crown: 1680,
  salt_stairs: 3100,
  lamp_bazaar: 3600,
  debt_orchard: 540,
  black_relay: 4800,
};

export function clipPitch(name: string | undefined): number {
  return (name && DISTRICT_CLIP[name]) || STREET_CLIP;
}

/** How high the bolt locks at the end of a reload, in hertz. Lease Row keeps 2600. The follow tone stays 200 falling to 90. */
export const STREET_BOLT = 2600;

const DISTRICT_BOLT: Record<string, number> = {
  deadletter_docks: 1180,
  repo_depot: 1900,
  night_market: 3400,
  relay_heights: 2200,
  ash_canal: 860,
  glass_mile: 4100,
  bone_market: 1460,
  cold_vault: 1740,
  neon_chapel: 1560,
  slag_pit: 720,
  wire_garden: 4600,
  red_kiln: 2100,
  paper_wharf: 1320,
  velvet_court: 3000,
  rust_crown: 1680,
  salt_stairs: 3800,
  lamp_bazaar: 3200,
  debt_orchard: 640,
  black_relay: 5200,
};

export function boltPitch(name: string | undefined): number {
  return (name && DISTRICT_BOLT[name]) || STREET_BOLT;
}

/** How high the kill-confirm thunk starts, in hertz. Lease Row keeps 90. It still falls to 40. */
export const STREET_STAMP = 90;

const DISTRICT_STAMP: Record<string, number> = {
  deadletter_docks: 52,
  repo_depot: 74,
  night_market: 148,
  relay_heights: 118,
  ash_canal: 61,
  glass_mile: 196,
  bone_market: 68,
  cold_vault: 132,
  neon_chapel: 84,
  slag_pit: 46,
  wire_garden: 220,
  red_kiln: 104,
  paper_wharf: 64,
  velvet_court: 172,
  rust_crown: 88,
  salt_stairs: 204,
  lamp_bazaar: 156,
  debt_orchard: 58,
  black_relay: 248,
};

export function stampPitch(name: string | undefined): number {
  return (name && DISTRICT_STAMP[name]) || STREET_STAMP;
}

/** How high the shield-break hum starts, in hertz. Lease Row keeps 520. It still falls to 90. */
export const STREET_BREAK = 520;

const DISTRICT_BREAK: Record<string, number> = {
  deadletter_docks: 180,
  repo_depot: 260,
  night_market: 880,
  relay_heights: 640,
  ash_canal: 210,
  glass_mile: 1400,
  bone_market: 240,
  cold_vault: 760,
  neon_chapel: 330,
  slag_pit: 140,
  wire_garden: 1680,
  red_kiln: 420,
  paper_wharf: 200,
  velvet_court: 980,
  rust_crown: 360,
  salt_stairs: 1240,
  lamp_bazaar: 1100,
  debt_orchard: 160,
  black_relay: 1960,
};

export function breakPitch(name: string | undefined): number {
  return (name && DISTRICT_BREAK[name]) || STREET_BREAK;
}

/** How high a taken claim opens, in hertz. Lease Row keeps 1320. The second note stays 1980. */
export const STREET_CLAIM = 1320;

const DISTRICT_CLAIM: Record<string, number> = {
  deadletter_docks: 480,
  repo_depot: 740,
  night_market: 2100,
  relay_heights: 1680,
  ash_canal: 560,
  glass_mile: 2800,
  bone_market: 620,
  cold_vault: 1540,
  neon_chapel: 980,
  slag_pit: 390,
  wire_garden: 3200,
  red_kiln: 1180,
  paper_wharf: 860,
  velvet_court: 2400,
  rust_crown: 1040,
  salt_stairs: 2600,
  lamp_bazaar: 1880,
  debt_orchard: 440,
  black_relay: 3600,
};

export function claimPitch(name: string | undefined): number {
  return (name && DISTRICT_CLAIM[name]) || STREET_CLAIM;
}

/** How high the shield-return hum starts, in hertz. Lease Row keeps 220. It still rises to 660. */
export const STREET_MEND = 220;

const DISTRICT_MEND: Record<string, number> = {
  deadletter_docks: 90,
  repo_depot: 160,
  night_market: 480,
  relay_heights: 340,
  ash_canal: 120,
  glass_mile: 560,
  bone_market: 140,
  cold_vault: 400,
  neon_chapel: 260,
  slag_pit: 70,
  wire_garden: 620,
  red_kiln: 300,
  paper_wharf: 180,
  velvet_court: 520,
  rust_crown: 200,
  salt_stairs: 440,
  lamp_bazaar: 380,
  debt_orchard: 100,
  black_relay: 640,
};

export function mendPitch(name: string | undefined): number {
  return (name && DISTRICT_MEND[name]) || STREET_MEND;
}

/** How high the ledger chime opens, in hertz. Lease Row keeps 330. It still arrives at 440. */
export const STREET_LEDGER = 330;

const DISTRICT_LEDGER: Record<string, number> = {
  deadletter_docks: 180,
  repo_depot: 260,
  night_market: 520,
  relay_heights: 390,
  ash_canal: 210,
  glass_mile: 610,
  bone_market: 240,
  cold_vault: 360,
  neon_chapel: 290,
  slag_pit: 140,
  wire_garden: 720,
  red_kiln: 310,
  paper_wharf: 200,
  velvet_court: 560,
  rust_crown: 280,
  salt_stairs: 640,
  lamp_bazaar: 480,
  debt_orchard: 160,
  black_relay: 780,
};

export function ledgerPitch(name: string | undefined): number {
  return (name && DISTRICT_LEDGER[name]) || STREET_LEDGER;
}

export function bedTune(name: string | undefined): BedTune {
  const felt = placeFeel(name);
  if (felt) return felt.bed;
  switch (name) {
    case "deadletter_docks":
      // heavier water, and the hum sits under the piers
      return { rainHz: 900, rainQ: 0.35, rain: 0.28, humHz: 28, hum: 0.2, buzzHz: 96, buzzCut: 640, buzz: 0.01 };
    case "repo_depot":
      // a sodium lamp, and the rain is thin over the yard
      return { rainHz: 2800, rainQ: 0.45, rain: 0.045, humHz: 118, hum: 0.16, buzzHz: 130, buzzCut: 1100, buzz: 0.014 };
    case "night_market":
      // the hiss is at the awning, and the buzz is bright
      return { rainHz: 6800, rainQ: 1.3, rain: 0.22, humHz: 52, hum: 0.1, buzzHz: 240, buzzCut: 2800, buzz: 0.034 };
    case "relay_heights":
      // thin air over the racks, and almost no rain
      return { rainHz: 4800, rainQ: 0.7, rain: 0.012, humHz: 180, hum: 0.04, buzzHz: 420, buzzCut: 4200, buzz: 0.005 };
    default:
      // lease row, and every room that is not one of the five
      return { rainHz: 3200, rainQ: 0.5, rain: 0.16, humHz: 48, hum: 0.12, buzzHz: 120, buzzCut: 900, buzz: 0.012 };
  }
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: { gain: GainNode } | null = null;
  /** Rain, hum, buzz, and the far-traffic rumble, kept so a district can retune the bed after it has started. */
  private bedNodes: {
    rainFilter: BiquadFilterNode;
    rainGain: GainNode;
    hum: OscillatorNode;
    humGain: GainNode;
    buzz: OscillatorNode;
    buzzFilter: BiquadFilterNode;
    buzzGain: GainNode;
    traffic: AudioBufferSourceNode;
    trafficFilter: BiquadFilterNode;
    trafficGain: GainNode;
    swell: OscillatorNode;
    buzzLfo: OscillatorNode;
    buzzLfoGain: GainNode;
    murmurA: BiquadFilterNode;
    murmurAGain: GainNode;
    murmurALfo: OscillatorNode;
    murmurADepth: GainNode;
    murmurB: BiquadFilterNode;
    murmurBGain: GainNode;
    murmurBLfo: OscillatorNode;
    murmurBDepth: GainNode;
  } | null = null;
  /** The level asked for, remembered until there is a bed to put it on. */
  private bedName: string | undefined;
  /** the buses the settings drive: everything but the bed goes through sfx */
  private sfx: GainNode | null = null;
  private volumes = { master: 0.7, sfx: 1, bed: 1 };
  private bedLevel = 0;
  /** Counts of each cue fired; readable by the probe to prove audio is wired. */
  readonly fired: Record<string, number> = {};
  private noiseBuf: AudioBuffer | null = null;

  /** Must be called from a user gesture (or with autoplay allowed). Idempotent. */
  resume(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volumes.master;
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.volumes.sfx;
      this.sfx.connect(this.master);
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      this.master.connect(comp).connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2);
      this.startBed();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    // a hum asked for before there was anywhere to put it (Stage 177)
    if (this.humWanted && !this.humNodes) this.crawlHum(true);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    // deterministic LCG so the bed is identical run to run
    let s = 0x2545f491;
    for (let i = 0; i < d.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 0xffffffff) * 2 - 1;
    }
    return buf;
  }

  private count(name: string): void {
    this.fired[name] = (this.fired[name] ?? 0) + 1;
  }

  /** Rain bed + sub hum + neon buzz. The city is never silent. */
  private startBed(): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.connect(this.master!);
    // (the bed is its own bus; the cues below go through sfx)
    // rain: filtered noise
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuf;
    rain.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = "bandpass";
    rf.frequency.value = 3200;
    rf.Q.value = 0.5;
    const rg = ctx.createGain();
    rg.gain.value = 0.16;
    rain.connect(rf).connect(rg).connect(g);
    rain.start();
    // sub hum
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 48;
    const hg = ctx.createGain();
    hg.gain.value = 0.12;
    hum.connect(hg).connect(g);
    hum.start();
    // neon buzz: 120 Hz saw, heavily filtered, slow flicker
    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 120;
    const bf = ctx.createBiquadFilter();
    bf.type = "lowpass";
    bf.frequency.value = 900;
    const bg = ctx.createGain();
    bg.gain.value = 0.012;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = buzzFlicker(this.bedName);
    const lg = ctx.createGain();
    lg.gain.value = buzzDepth(this.bedName);
    lfo.connect(lg).connect(bg.gain);
    buzz.connect(bf).connect(bg).connect(g);
    buzz.start();
    lfo.start();
    // distant traffic: low rumble of noise whose level swells and fades like cars passing on the vista roads
    const traffic = ctx.createBufferSource();
    traffic.buffer = this.noiseBuf;
    traffic.loop = true;
    traffic.playbackRate.value = 0.37;
    const tf = ctx.createBiquadFilter();
    tf.type = "lowpass";
    tf.frequency.value = 180;
    tf.Q.value = 0.8;
    const tg = ctx.createGain();
    tg.gain.value = trafficBody(this.bedName);
    const swell = ctx.createOscillator();
    swell.type = "sine";
    swell.frequency.value = 0.09;
    const sg = ctx.createGain();
    sg.gain.value = 0.11;
    swell.connect(sg).connect(tg.gain);
    traffic.connect(tf).connect(tg).connect(g);
    traffic.start();
    swell.start();
    // crowd murmur: two narrow bands of noise around the vowel range, each breathing on its own slow LFO
    const murmurBand = (freq: number, rate: number, gain: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = 0.8;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = 2.2;
      const cg = ctx.createGain();
      cg.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = gain * 0.7;
      lfo.connect(depth).connect(cg.gain);
      src.connect(bp).connect(cg).connect(g);
      src.start();
      lfo.start();
      return { bp, cg, lfo, depth };
    };
    const streetMurmur = crowdMurmur(undefined);
    const murmurA = murmurBand(streetMurmur.aHz, streetMurmur.aRate, streetMurmur.aGain);
    const murmurB = murmurBand(streetMurmur.bHz, streetMurmur.bRate, streetMurmur.bGain);
    this.bedLevel = 1;
    g.gain.linearRampToValueAtTime(this.bedLevel * this.volumes.bed, ctx.currentTime + 2.5);
    this.bed = { gain: g };
    this.bedNodes = {
      rainFilter: rf, rainGain: rg, hum, humGain: hg, buzz, buzzFilter: bf, buzzGain: bg, traffic, trafficFilter: tf, trafficGain: tg, swell, buzzLfo: lfo, buzzLfoGain: lg,
      murmurA: murmurA.bp, murmurAGain: murmurA.cg, murmurALfo: murmurA.lfo, murmurADepth: murmurA.depth,
      murmurB: murmurB.bp, murmurBGain: murmurB.cg, murmurBLfo: murmurB.lfo, murmurBDepth: murmurB.depth,
    };
    this.tune(this.bedName);
  }

  /**
   * Put the bed in the place the file is standing. Safe before the context exists: the name is
   * kept and applied when the bed starts, and applied at once when the bed is already running.
   */
  tune(levelName: string | undefined): void {
    this.bedName = levelName;
    const n = this.bedNodes;
    if (!n) return;
    const t = bedTune(levelName);
    n.rainFilter.frequency.value = t.rainHz;
    n.rainFilter.Q.value = t.rainQ;
    n.rainGain.gain.value = t.rain;
    n.hum.frequency.value = t.humHz;
    n.humGain.gain.value = t.hum;
    n.buzz.frequency.value = t.buzzHz;
    n.buzzFilter.frequency.value = t.buzzCut;
    n.buzzGain.gain.value = t.buzz;
    n.buzzLfo.frequency.value = buzzFlicker(levelName);
    n.buzzLfoGain.gain.value = buzzDepth(levelName);
    const far = farTraffic(levelName);
    n.traffic.playbackRate.value = far.rate;
    n.trafficFilter.frequency.value = far.cut;
    n.swell.frequency.value = far.swell;
    n.trafficGain.gain.value = trafficBody(levelName);
    const murmur = crowdMurmur(levelName);
    const narrow = murmurQ(levelName);
    n.murmurA.frequency.value = murmur.aHz;
    n.murmurA.Q.value = narrow;
    n.murmurAGain.gain.value = murmur.aGain;
    n.murmurALfo.frequency.value = murmur.aRate;
    n.murmurADepth.gain.value = murmur.aGain * 0.7;
    n.murmurB.frequency.value = murmur.bHz;
    n.murmurB.Q.value = narrow;
    n.murmurBGain.gain.value = murmur.bGain;
    n.murmurBLfo.frequency.value = murmur.bRate;
    n.murmurBDepth.gain.value = murmur.bGain * 0.7;
  }

  /** What the bed nodes are holding, or null before the bed exists. */
  bedNow(): BedTune | null {
    const n = this.bedNodes;
    if (!n) return null;
    return {
      rainHz: n.rainFilter.frequency.value,
      rainQ: n.rainFilter.Q.value,
      rain: n.rainGain.gain.value,
      humHz: n.hum.frequency.value,
      hum: n.humGain.gain.value,
      buzzHz: n.buzz.frequency.value,
      buzzCut: n.buzzFilter.frequency.value,
      buzz: n.buzzGain.gain.value,
    };
  }

  /** The neon-buzz breath the bed is holding, or null before the bed exists. Not part of the tune. */
  flickerNow(): number | null {
    const n = this.bedNodes;
    return n ? n.buzzLfo.frequency.value : null;
  }

  /** How deep that breath swings, or null before the bed exists. The rate stays flickerNow. */
  depthNow(): number | null {
    const n = this.bedNodes;
    return n ? n.buzzLfoGain.gain.value : null;
  }

  /** How loud the distant-traffic floor sits, or null before the bed exists. Rate and swell stay farTraffic. */
  bodyNow(): number | null {
    const n = this.bedNodes;
    return n ? n.trafficGain.gain.value : null;
  }

  /** How narrow the crowd-murmur bands sit, or null before the bed exists. The pair stays crowdMurmur. */
  narrowNow(): { a: number; b: number } | null {
    const n = this.bedNodes;
    return n ? { a: n.murmurA.Q.value, b: n.murmurB.Q.value } : null;
  }

  /** A VANTAGE siren somewhere across the district: a two-tone wail, panned, dull with distance, fading as it passes. */
  siren(pan = 0.6, place?: string): void {
    this.count("siren");
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const tone = sirenTone(place);
    const flip = sirenFlip(place);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = tone.cut;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 1.2);
    g.gain.setValueAtTime(0.09, t + 3.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + 6.5);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan, t);
    p.pan.linearRampToValueAtTime(-pan, t + 6.5);
    for (let i = 0; i < 8; i++) {
      o.frequency.setValueAtTime(i % 2 ? tone.high : tone.low, t + i * flip);
    }
    o.connect(f).connect(g).connect(p).connect(this.sfx!);
    o.start(t);
    o.stop(t + 6.6);
  }

  /** The PA: a three-note VANTAGE chime, then a formant-filtered burst that reads as a voice through street speakers. */
  pa(place?: string): void {
    this.count("pa");
    if (!this.ctx) return;
    for (const [i, hz] of paChime(place).entries()) this.tone({ dur: 0.35, from: hz, gain: paLoud(place), type: "triangle", delay: i * paBeat(place) });
    // "voice": syllables of narrow-band noise across a few formants, slap-echoed like a speaker on a wall
    let d = paLead(place);
    const formants = paVoice(place);
    const hold = paHold(place);
    for (let i = 0; i < formants.length; i++) {
      const f = formants[i] ?? 700;
      this.burst({ dur: hold, freq: f, q: 5, gain: 0.07, delay: d, pan: 0.35 });
      this.burst({ dur: hold, freq: f * 0.5, q: 4, gain: 0.05, delay: d, pan: 0.35 });
      this.burst({ dur: 0.09, freq: f, q: 5, gain: 0.025, delay: d + 0.17, pan: -0.5 }); // echo off the far facade
      d += paTalk(place) + (i % 3) * 0.05;
    }
  }

  /** The monorail passing overhead: a rising then falling whoosh with a doppler-shifted motor note. */
  tram(place?: string): void {
    this.count("tram");
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pass = tramPass(place);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(pass.open, t);
    f.frequency.exponentialRampToValueAtTime(pass.peak, t + 1.1);
    f.frequency.exponentialRampToValueAtTime(pass.close, t + 2.6);
    const g = ctx.createGain();
    const rush = tramRush(place);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(rush, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.7);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.8, t);
    p.pan.linearRampToValueAtTime(0.8, t + 2.6);
    src.connect(f).connect(g).connect(p).connect(this.sfx!);
    src.start(t);
    src.stop(t + 2.8);
    this.tone({ dur: tramSpan(place), from: pass.motorFrom, to: pass.motorTo, gain: 0.08, type: "sawtooth" });
    this.tone({ dur: 0.5, from: 60, to: 45, gain: 0.25 });
  }

  private burst(opts: { dur: number; freq: number; q?: number; gain: number; type?: BiquadFilterType; pan?: number; delay?: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const t = ctx.currentTime + (opts.delay ?? 0);
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;
    src.connect(f).connect(g).connect(pan).connect(this.sfx!);
    src.start(t);
    src.stop(t + opts.dur + 0.02);
  }

  private tone(opts: { dur: number; from: number; to?: number; gain: number; type?: OscillatorType; delay?: number; pan?: number }): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = opts.type ?? "sine";
    const t = ctx.currentTime + (opts.delay ?? 0);
    o.frequency.setValueAtTime(opts.from, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      o.connect(g).connect(p).connect(this.sfx!);
    } else o.connect(g).connect(this.sfx!);
    o.start(t);
    o.stop(t + opts.dur + 0.02);
  }

  /** Weapon shot silhouettes: each has a distinct low end and crack so they read blind. */
  /**
   * `alt` is the trigger pull that fired something other than the primary (Stage 94): a choked
   * slug, a rail quickshot, a sticky. Those get a voice of their own; an optic or a brace does not
   * change what the gun is, so its shots keep the primary's bark. Counted under the voice as well as
   * the weapon, so a probe can hear the difference.
   */
  shot(weapon = "lease_breaker", alt = false): void {
    this.count("shot");
    this.count("shot_" + weapon);
    const voice = shotVoice(weapon, alt);
    if (voice !== weapon) this.count("shot_" + voice);
    if (!this.ctx) return;
    switch (voice) {
      case "repo_hammer_slug":
        // one round, not eight: deeper, no pump, and a ring off the choke
        this.tone({ dur: 0.3, from: 95, to: 24, gain: 0.95, type: "sine" });
        this.burst({ dur: 0.1, freq: 700, q: 0.5, gain: 0.45 });
        this.burst({ dur: 0.45, freq: 160, q: 0.8, gain: 0.4, type: "lowpass" });
        this.tone({ dur: 0.18, from: 1400, to: 1100, gain: 0.06, type: "triangle", delay: 0.02 });
        break;
      case "longwave_quickshot":
        // a snap where the charged shot is a howl
        this.tone({ dur: 0.12, from: 180, to: 40, gain: 0.6, type: "sine" });
        this.tone({ dur: 0.08, from: 3000, to: 900, gain: 0.18, type: "sawtooth" });
        this.burst({ dur: 0.08, freq: 2600, q: 0.7, gain: 0.3 });
        break;
      case "phage_sticky":
        // a thunk and a metallic tick as the charge leaves the tube armed
        this.tone({ dur: 0.14, from: 120, to: 60, gain: 0.45, type: "sine" });
        this.burst({ dur: 0.1, freq: 500, q: 0.6, gain: 0.25, type: "lowpass" });
        this.burst({ dur: 0.03, freq: 4200, q: 3, gain: 0.14, delay: 0.06 });
        break;
      case "repo_hammer":
        this.tone({ dur: 0.22, from: 120, to: 30, gain: 0.8, type: "sine" });
        this.burst({ dur: 0.16, freq: 900, q: 0.4, gain: 0.5 });
        this.burst({ dur: 0.35, freq: 220, q: 0.7, gain: 0.35, type: "lowpass" });
        this.burst({ dur: 0.05, freq: 3000, q: 2, gain: 0.15, delay: 0.25 }); // pump
        break;
      case "stack_smg":
        this.tone({ dur: 0.06, from: 220, to: 60, gain: 0.35, type: "sine" });
        this.burst({ dur: 0.04, freq: 3200, q: 0.8, gain: 0.3 });
        break;
      case "longwave":
        this.tone({ dur: 0.5, from: 90, to: 28, gain: 0.85, type: "sine" });
        this.tone({ dur: 0.35, from: 2200, to: 400, gain: 0.25, type: "sawtooth" });
        this.burst({ dur: 0.4, freq: 1200, q: 0.3, gain: 0.35 });
        break;
      case "phage":
        this.tone({ dur: 0.18, from: 140, to: 50, gain: 0.5, type: "sine" });
        this.burst({ dur: 0.12, freq: 600, q: 0.5, gain: 0.3, type: "lowpass" });
        this.tone({ dur: 0.2, from: 500, to: 900, gain: 0.08, type: "triangle" });
        break;
      case "shock_baton":
        this.burst({ dur: 0.12, freq: 2600, q: 3, gain: 0.25 });
        this.tone({ dur: 0.12, from: 180, to: 120, gain: 0.2, type: "square" });
        break;
      case "neon_edge":
        this.burst({ dur: 0.08, freq: 4200, q: 4, gain: 0.18 });
        this.tone({ dur: 0.1, from: 880, to: 220, gain: 0.16, type: "sawtooth" });
        break;
      case "directive":
        this.tone({ dur: 0.3, from: 130, to: 32, gain: 0.85, type: "sine" });
        this.burst({ dur: 0.12, freq: 1800, q: 0.5, gain: 0.4 });
        this.burst({ dur: 0.3, freq: 300, q: 0.7, gain: 0.3, type: "lowpass" });
        break;
      case "clockeater":
        this.tone({ dur: 0.05, from: 260, to: 70, gain: 0.3, type: "sine" });
        this.burst({ dur: 0.035, freq: 2800, q: 1.2, gain: 0.28 });
        break;
      case "wasp":
        this.tone({ dur: 0.05, from: 900, to: 500, gain: 0.12, type: "square" });
        this.burst({ dur: 0.05, freq: 2400, q: 1, gain: 0.1 });
        break;
      default:
        this.tone({ dur: 0.12, from: 160, to: 38, gain: 0.55, type: "sine" });
        this.burst({ dur: 0.07, freq: 2400, q: 0.6, gain: 0.35 });
        this.burst({ dur: 0.18, freq: 420, q: 0.8, gain: 0.2, type: "lowpass" });
    }
  }

  charge(level: number): void {
    if (!this.ctx) return;
    this.tone({ dur: 0.08, from: 300 + level * 900, to: 320 + level * 900, gain: 0.06, type: "sawtooth" });
  }

  explosion(big = true): void {
    this.count("explosion");
    if (!this.ctx) return;
    this.tone({ dur: 0.6, from: 80, to: 22, gain: big ? 1.0 : 0.6, type: "sine" });
    this.burst({ dur: 0.5, freq: 400, q: 0.3, gain: big ? 0.7 : 0.4, type: "lowpass" });
    this.burst({ dur: 0.25, freq: 2500, q: 0.4, gain: 0.3 });
  }

  smoke(): void {
    this.count("smoke");
    if (!this.ctx) return;
    this.burst({ dur: 1.4, freq: 1800, q: 0.3, gain: 0.18 });
  }

  emp(): void {
    this.count("emp");
    if (!this.ctx) return;
    this.tone({ dur: 0.4, from: 1400, to: 40, gain: 0.3, type: "square" });
    this.burst({ dur: 0.3, freq: 3500, q: 1.5, gain: 0.25 });
  }

  throw(place?: string): void {
    this.count("throw");
    if (!this.ctx) return;
    this.burst({ dur: 0.06, freq: throwPitch(place), q: 1.5, gain: 0.12 });
  }

  swap(place?: string): void {
    this.count("swap");
    if (!this.ctx) return;
    this.burst({ dur: 0.08, freq: swapPitch(place), q: 0.8, gain: 0.14, type: "lowpass" });
    this.burst({ dur: 0.04, freq: 2200, q: 2, gain: 0.1, delay: 0.09 });
  }

  stun(): void {
    this.count("stun");
    if (!this.ctx) return;
    this.tone({ dur: 0.35, from: 60, to: 55, gain: 0.3, type: "square" });
    this.burst({ dur: 0.3, freq: 4000, q: 2, gain: 0.15 });
  }

  flagged(): void {
    this.count("flagged");
    if (!this.ctx) return;
    this.tone({ dur: 0.12, from: 880, gain: 0.12, type: "square" });
    this.tone({ dur: 0.12, from: 880, gain: 0.12, type: "square", delay: 0.18 });
  }

  mechBeam(): void {
    this.count("mechBeam");
    if (!this.ctx) return;
    this.tone({ dur: 0.3, from: 55, to: 45, gain: 0.5, type: "sawtooth" });
    this.burst({ dur: 0.25, freq: 1600, q: 0.5, gain: 0.3 });
  }

  /** A node coming off the model: rising cyan-green chord, chunk-thud underneath. */
  nodeFlip(mine: boolean): void {
    this.count("nodeFlip");
    if (!this.ctx) return;
    this.tone({ dur: 0.25, from: 110, to: 50, gain: 0.5 });
    const base = mine ? 440 : 330;
    for (const [i, m] of [1, 1.25, 1.5, 2].entries()) this.tone({ dur: 0.7, from: base * m, gain: 0.08, type: "triangle", delay: 0.05 * i });
  }

  contest(): void {
    this.count("contest");
    if (!this.ctx) return;
    this.tone({ dur: 0.1, from: 700, gain: 0.08, type: "square" });
    this.tone({ dur: 0.1, from: 700, gain: 0.08, type: "square", delay: 0.15 });
  }

  /** an objective ticking over (Stage 115): a rising three-note figure in the campaign's register, not the wake's contest */
  objective(): void {
    this.count("objective");
    if (!this.ctx) return;
    for (const [i, f] of [523, 659, 784].entries()) this.tone({ dur: 0.16, from: f, gain: 0.07, type: "triangle", delay: 0.11 * i });
  }

  /** the wake begins (Stage 124): a rising four-note figure, the round's own start, not the KERNEL's pulse */
  wakeBegins(): void {
    this.count("wakeBegins");
    if (!this.ctx) return;
    for (const [i, f] of [330, 415, 494, 660].entries()) this.tone({ dur: 0.22, from: f, gain: 0.08, type: "triangle", delay: 0.09 * i });
  }

  /** the round is over (Stage 124): a resolving figure when your cell woke the district, a falling one when the other did, a level one when no one did */
  roundOver(outcome: "won" | "lost" | "none"): void {
    this.count("roundOver");
    if (!this.ctx) return;
    const notes = outcome === "won" ? [392, 494, 587, 784] : outcome === "lost" ? [523, 440, 349, 262] : [440, 440, 440];
    for (const [i, f] of notes.entries()) this.tone({ dur: 0.34, from: f, gain: 0.09, type: "triangle", delay: 0.16 * i });
    this.tone({ dur: 1.4, from: 55, to: 40, gain: 0.35 });
  }

  kernelPulse(): void {
    this.count("kernelPulse");
    if (!this.ctx) return;
    this.tone({ dur: 1.2, from: 42, to: 30, gain: 0.7 });
    this.burst({ dur: 0.6, freq: 260, q: 0.5, gain: 0.3, type: "lowpass" });
  }

  hurt(place?: string): void {
    this.count("hurt");
    if (!this.ctx) return;
    this.burst({ dur: 0.08, freq: hurtPitch(place), q: 0.6, gain: 0.25, type: "lowpass" });
  }

  /** the choke racking on or off (Stage 94): a two-part mechanical click, pitched by which way it went */
  altToggle(on: boolean): void {
    this.count(toggleCue(on));
    if (!this.ctx) return;
    this.burst({ dur: 0.03, freq: on ? 1800 : 1300, q: 2.5, gain: 0.12 });
    this.burst({ dur: 0.05, freq: on ? 900 : 650, q: 1.2, gain: 0.1, type: "lowpass", delay: 0.05 });
  }

  /** back on the ledger (Stage 96): a rising two-note with the CRT's own hiss under it */
  respawn(place?: string): void {
    this.count("respawn");
    if (!this.ctx) return;
    this.tone({ dur: 0.12, from: ledgerPitch(place), to: 440, gain: 0.12, type: "triangle" });
    this.tone({ dur: 0.18, from: 440, to: 660, gain: 0.1, type: "triangle", delay: 0.1 });
    this.burst({ dur: 0.35, freq: 1800, q: 0.4, gain: 0.08, type: "highpass" });
  }

  /** a wasp gone live near the file (Stage 98): a rising blip in the wasp's own register, from its side */
  waspLock(cue: { pan: number; gain: number }): void {
    this.count("waspLock");
    if (!this.ctx) return;
    this.tone({ dur: 0.07, from: 900, to: 1300, gain: 0.14 * cue.gain, type: "square", pan: cue.pan });
    this.tone({ dur: 0.09, from: 1300, to: 1700, gain: 0.12 * cue.gain, type: "square", pan: cue.pan, delay: 0.08 });
    this.burst({ dur: 0.06, freq: 2600, q: 1.2, gain: 0.06 * cue.gain, pan: cue.pan, delay: 0.16 });
  }

  /** the shield breaking (Stage 102): an electrical crack and the hum dropping out from under it */
  shieldBreak(place?: string): void {
    this.count("shieldBreak");
    if (!this.ctx) return;
    this.burst({ dur: 0.05, freq: 3200, q: 1.1, gain: 0.3 });
    this.burst({ dur: 0.12, freq: 900, q: 0.6, gain: 0.18, type: "bandpass", delay: 0.02 });
    this.tone({ dur: 0.3, from: breakPitch(place), to: 90, gain: 0.22, type: "sawtooth" });
  }

  /** the shield back to full (Stage 102): a rising hum settling into a tick */
  shieldBack(place?: string): void {
    this.count("shieldBack");
    if (!this.ctx) return;
    this.tone({ dur: 0.35, from: mendPitch(place), to: 660, gain: 0.12, type: "triangle" });
    this.burst({ dur: 0.03, freq: 2400, q: 1.4, gain: 0.08, delay: 0.32 });
  }

  /** the last quarter of the magazine (Stage 100): two small ticks, once, on the round that crosses into it */
  lowAmmo(place?: string): void {
    this.count("lowAmmo");
    if (!this.ctx) return;
    this.burst({ dur: 0.03, freq: clipPitch(place), q: 1.4, gain: 0.1 });
    this.burst({ dur: 0.03, freq: 2100, q: 1.4, gain: 0.09, delay: 0.09 });
  }

  dryFire(place?: string): void {
    this.count("dry");
    if (!this.ctx) return;
    this.tone({ dur: 0.05, from: dryPitch(place), to: 500, gain: 0.08, type: "square" });
  }

  /** Zone-pitched hit: head high and glassy, body mid, legs dull. */
  hit(zone: HitZone, place?: string): void {
    this.count("hit_" + zone);
    if (!this.ctx) return;
    const f = zone === "head" ? 2200 : zone === "body" ? markPitch(place) : 600;
    this.tone({ dur: 0.07, from: f, to: f * 0.6, gain: 0.22, type: "triangle" });
    this.burst({ dur: 0.05, freq: f * 1.5, q: 2, gain: 0.12 });
  }

  /**
   * Kill confirm: receipt-printer stamp — a thunk and a short cyan tick. It
   * gains layers with the shooter's mastery tier (rank 1–9: 0, 10–19: 1,
   * 20–29: 2, 30: 3) — growth you can hear, shooter-side only, zero info leak.
   */
  kill(tier = 0, place?: string): void {
    this.count("kill");
    this.count("kill_t" + Math.max(0, Math.min(3, tier)));
    if (!this.ctx) return;
    this.tone({ dur: 0.16, from: stampPitch(place), to: 40, gain: 0.6, type: "sine" }); // thunk
    this.burst({ dur: 0.05, freq: 800, q: 0.4, gain: 0.3, type: "lowpass" });
    this.tone({ dur: 0.09, from: 1760, gain: 0.12, type: "square", delay: 0.09 }); // tick
    this.tone({ dur: 0.12, from: 2349, gain: 0.1, type: "square", delay: 0.16 });
    if (tier >= 1) this.tone({ dur: 0.14, from: 3520, gain: 0.07, type: "square", delay: 0.24 }); // second tick, an octave up
    if (tier >= 2) for (const [i, f] of [1319, 1568, 1976].entries()) this.tone({ dur: 0.5, from: f, gain: 0.05, type: "triangle", delay: 0.28 + i * 0.04 }); // a chord under it
    if (tier >= 3) {
      this.tone({ dur: 0.7, from: 48, to: 30, gain: 0.5 }); // sub drop
      this.burst({ dur: 0.6, freq: 2200, q: 0.5, gain: 0.12, delay: 0.3 }); // reverse-sweep tail
    }
  }

  // ---- settings: the buses ----
  /** master / sfx / bed as 0..1; safe before the context exists (applied at resume). */
  setVolumes(v: Partial<{ master: number; sfx: number; bed: number }>): void {
    Object.assign(this.volumes, v);
    if (this.master) this.master.gain.value = this.volumes.master;
    if (this.sfx) this.sfx.gain.value = this.volumes.sfx;
    if (this.bed) this.bed.gain.gain.value = this.bedLevel * this.volumes.bed;
  }
  getVolumes(): { master: number; sfx: number; bed: number } {
    return { ...this.volumes };
  }
  /**
   * What the buses are actually carrying, or null before the context exists.
   *
   * `getVolumes` returns the record of what was ASKED FOR, which is a different thing: every
   * setter writes it whether or not there is a bus to write to. A check that sets a volume and
   * reads that record back is reading its own echo, and passes with the whole audio engine dead
   * (Stage 652). This reads the gain nodes the sound is actually going through.
   */
  busGains(): { master: number; sfx: number; bed: number } | null {
    if (!this.master || !this.sfx || !this.bed) return null;
    return { master: this.master.gain.value, sfx: this.sfx.gain.value, bed: this.bed.gain.gain.value };
  }
  /** The bed's own level (the city's loudness, 0..1) under the bed volume. */
  setBedLevel(level: number): void {
    this.bedLevel = level;
    if (this.bed) this.bed.gain.gain.value = level * this.volumes.bed;
  }
  /** Tab hidden: everything ducks; back: restored. */
  duck(on: boolean): void {
    if (this.master) this.master.gain.value = on ? 0 : this.volumes.master;
  }

  // ---- the menu ----
  /** A cursor move: a dry tick. */
  uiMove(): void {
    this.count("uiMove");
    if (!this.ctx) return;
    this.burst({ dur: 0.015, freq: 2400, q: 3, gain: 0.08 });
  }
  /** A selection: a short two-note confirm. */
  uiSelect(): void {
    this.count("uiSelect");
    if (!this.ctx) return;
    this.tone({ dur: 0.06, from: 880, gain: 0.12, type: "square" });
    this.tone({ dur: 0.1, from: 1320, gain: 0.1, type: "square", delay: 0.06 });
  }
  /** Back / cancel: the confirm in reverse. */
  uiBack(): void {
    this.count("uiBack");
    if (!this.ctx) return;
    this.tone({ dur: 0.08, from: 660, to: 330, gain: 0.1, type: "square" });
  }
  /** A title card landing: a low CRT thump and a rising hum edge. */
  card(): void {
    this.count("card");
    if (!this.ctx) return;
    this.tone({ dur: 0.35, from: 70, to: 40, gain: 0.5 });
    this.burst({ dur: 0.25, freq: 240, q: 0.7, gain: 0.2, type: "lowpass" });
    this.tone({ dur: 0.9, from: 220, to: 440, gain: 0.05, type: "sawtooth", delay: 0.1 });
  }

  // ---- low health: a pulse that follows the heartbeat until the shield is back ----
  private pulseAt = 0;
  private pulsing = false;
  lowHealth(on: boolean, now = performance.now()): void {
    if (on !== this.pulsing) {
      this.pulsing = on;
      this.count(on ? "lowHealthOn" : "lowHealthOff");
    }
    if (!on || !this.ctx) return;
    if (now - this.pulseAt < 620) return;
    this.pulseAt = now;
    this.count("pulse");
    this.tone({ dur: 0.12, from: 55, to: 40, gain: 0.35 });
    this.tone({ dur: 0.1, from: 50, to: 38, gain: 0.25, delay: 0.16 });
  }

  // ---- the opening crawl: a hum under the text, a soft key per two characters, the tear ----
  private humNodes: { osc: OscillatorNode; gain: GainNode } | null = null;
  /**
   * Whether the hum is wanted, as opposed to whether it is sounding (Stage 177).
   *
   * The crawl asks for the hum once, on an edge, at the moment the first paragraph starts typing —
   * which is before any gesture has happened and therefore before there is a context to build it
   * in. The request is remembered so that the gesture, whenever it comes, starts the hum that was
   * already asked for. A tick and a tear are one-shots and cannot be recovered this way; a hum
   * that runs for half a minute can.
   */
  private humWanted = false;
  /** The CRT hum under the crawl; stops dead (not faded) at the cut. */
  crawlHum(on: boolean): void {
    this.count(on ? "crawlHumOn" : "crawlHumOff");
    this.humWanted = on;
    if (!this.ctx) return;
    if (on && !this.humNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 60;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 220;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;
      osc.connect(f).connect(gain).connect(this.sfx!);
      osc.start();
      this.humNodes = { osc, gain };
    } else if (!on && this.humNodes) {
      this.humNodes.gain.gain.value = 0;
      this.humNodes.osc.stop();
      this.humNodes = null;
    }
  }
  get crawlHumming(): boolean {
    return !!this.humNodes;
  }
  /** One typed character pair: a short, dry key. */
  crawlTick(): void {
    this.count("crawlTick");
    if (!this.ctx) return;
    this.burst({ dur: 0.012, freq: 3200, q: 4, gain: 0.05 });
  }
  /** The tear between paragraphs: a torn-noise burst and a pitch drop. */
  tear(): void {
    this.count("tear");
    if (!this.ctx) return;
    this.burst({ dur: 0.18, freq: 900, q: 0.4, gain: 0.3, type: "bandpass" });
    this.tone({ dur: 0.16, from: 640, to: 90, gain: 0.18, type: "square" });
  }

  /** The receipt printing a line: a dot-matrix chatter. */
  printTick(): void {
    this.count("print");
    if (!this.ctx) return;
    for (let i = 0; i < 4; i++) this.burst({ dur: 0.02, freq: 2600 + i * 300, q: 3, gain: 0.08, delay: i * 0.03 });
  }

  /** The stamp at the bottom of the receipt, and the player's signature. */
  /** a claim taken (Stage 101): its own voice — a bright double tick going up — not the wake's node flip */
  claim(place?: string): void {
    this.count("claim");
    if (!this.ctx) return;
    this.tone({ dur: 0.07, from: claimPitch(place), gain: 0.12, type: "triangle" });
    this.tone({ dur: 0.12, from: 1980, gain: 0.1, type: "triangle", delay: 0.07 });
  }

  /** the carried claims falling to the street (Stage 101): a drop, then the units scattering */
  dropClaims(): void {
    this.count("dropClaims");
    if (!this.ctx) return;
    this.tone({ dur: 0.35, from: 660, to: 110, gain: 0.3, type: "triangle" });
    for (let i = 0; i < 4; i++) this.burst({ dur: 0.03, freq: 1800 - i * 250, q: 1.6, gain: 0.08, delay: 0.18 + i * 0.06, pan: (i % 2 ? 1 : -1) * 0.4 });
  }

  sign(): void {
    this.count("sign");
    if (!this.ctx) return;
    this.tone({ dur: 0.2, from: 110, to: 45, gain: 0.7 }); // stamp thunk
    this.burst({ dur: 0.08, freq: 600, q: 0.5, gain: 0.35, type: "lowpass" });
    this.tone({ dur: 0.25, from: 1760, gain: 0.08, type: "square", delay: 0.22 });
  }

  /** A Chapter rite: a slow four-note rise on a saw pad, the CRT hum swelling under it. */
  rite(chapter: number): void {
    this.count("rite");
    this.count("rite_" + chapter);
    if (!this.ctx) return;
    const base = 110 * (1 + chapter * 0.25);
    for (const [i, m] of [1, 1.5, 2, 3].entries()) this.tone({ dur: 2.4 - i * 0.3, from: base * m, gain: 0.09, type: "sawtooth", delay: i * 0.45 });
    this.tone({ dur: 3, from: 55, to: 50, gain: 0.35 });
  }

  /** DEBT CLEARED: a stamp thunk then a descending three-note sting in magenta. */
  debtCleared(): void {
    this.count("debtCleared");
    if (!this.ctx) return;
    this.tone({ dur: 0.2, from: 100, to: 40, gain: 0.7 });
    for (const [i, f] of [1568, 1319, 1047].entries()) this.tone({ dur: 0.35, from: f, gain: 0.1, type: "square", delay: 0.15 + i * 0.12 });
  }

  /** A Debt owed: the same three notes, rising — someone has your number. */
  debtOwed(): void {
    this.count("debtOwed");
    if (!this.ctx) return;
    for (const [i, f] of [1047, 1319, 1568].entries()) this.tone({ dur: 0.3, from: f, gain: 0.07, type: "square", delay: i * 0.12 });
  }

  /** The dossier flash: a data sweep as the files print across the screen. */
  dossier(): void {
    this.count("dossier");
    if (!this.ctx) return;
    this.burst({ dur: 1.1, freq: 1400, q: 1.5, gain: 0.12 });
    for (let i = 0; i < 6; i++) this.tone({ dur: 0.05, from: 2200 + i * 180, gain: 0.05, type: "square", delay: i * 0.15 });
  }

  footstep(speed: number, pan: number, place?: string): void {
    this.count("step");
    if (!this.ctx) return;
    const face = stepSurface(place);
    const g = stepHeft(place) + Math.min(0.12, speed * 0.012);
    this.burst({ dur: face.dur, freq: face.hz + speed * 10, q: face.q, gain: g, type: face.type, pan });
  }

  /**
   * Somebody else's gun (Stage 81). Not your own shot turned down: a shot heard across a street is
   * a crack with its top end eaten by the air, a body that carries much further, and — past twenty
   * or thirty metres — a slap off the buildings a moment behind it. The whole thing is delayed by
   * the time the sound takes to arrive, so the flash comes first.
   */
  otherShot(weapon: string, cue: { gain: number; pan: number; delay: number; muffle: number; distance: number }, place?: string): void {
    this.count("shot_other");
    if (!this.ctx) return;
    const g = Math.max(0, Math.min(1, cue.gain));
    if (g < 0.01) return;
    const wasp = weapon === "wasp";
    const heavy = weapon === "repo_hammer" || weapon === "longwave" || weapon === "directive";
    // the crack: bright up close, gone dull at the far end of the district
    this.burst({ dur: 0.04 + cue.muffle * 0.05, freq: (wasp ? 2400 : 3000) - cue.muffle * 2200, q: 0.7, gain: (wasp ? 0.1 : 0.3) * g, pan: cue.pan, delay: cue.delay });
    // the body of it, which distance barely touches
    this.tone({ dur: 0.12 + cue.muffle * 0.25, from: wasp ? 700 : heavy ? 120 : 165, to: wasp ? 400 : 38, gain: (wasp ? 0.06 : heavy ? 0.3 : 0.22) * g, type: "sine", delay: cue.delay, pan: cue.pan * 0.5 });
    // and off the room, from the other side, once there is street enough for it
    const slap = shotSlap(place);
    if (cue.distance > slapGate(place) && !wasp) this.burst({ dur: slap.dur, freq: slap.hz, q: slap.q, gain: slap.gain * g, type: "lowpass", pan: -cue.pan * 0.6, delay: cue.delay + slap.lag });
  }

  /**
   * A round going past (Stage 99): the snap of it, at the ear it went past, louder the closer it
   * came. Not the shooter's gun — that is `otherShot`, and it is heard from the muzzle as before —
   * but the thing the gun sent, heard where it was nearest. Short and bright: a crack with no body,
   * because a passing round has none.
   */
  snap(cue: { gain: number; pan: number; distance: number }, place?: string): void {
    this.count("snap");
    if (!this.ctx) return;
    const g = Math.max(0, Math.min(1, cue.gain));
    if (g < 0.01) return;
    this.burst({ dur: 0.025, freq: snapPitch(place), q: 0.9, gain: 0.22 * g, pan: cue.pan });
    // the air closing behind it
    this.burst({ dur: 0.06, freq: 1900, q: 0.5, gain: 0.08 * g, type: "bandpass", pan: cue.pan, delay: 0.012 });
  }

  /**
   * Somebody else's boot (Stage 80): the same impact, further away and duller with it, panned to
   * the side they are on. Quieter than your own by design — your own steps are under you, theirs
   * are information.
   */
  otherStep(speed: number, pan: number, gain: number): void {
    this.count("step_other");
    if (!this.ctx || gain <= 0.001) return;
    const g = (0.035 + Math.min(0.09, speed * 0.008)) * Math.max(0, Math.min(1, gain));
    this.burst({ dur: 0.07, freq: 190 + speed * 8, q: 0.8, gain: g, type: "lowpass", pan });
  }

  slide(place?: string): void {
    this.count("slide");
    if (!this.ctx) return;
    this.burst({ dur: 0.45, freq: slidePitch(place), q: 0.4, gain: 0.2, type: "lowpass" });
  }

  jump(place?: string): void {
    this.count("jump");
    if (!this.ctx) return;
    this.burst({ dur: 0.08, freq: jumpPitch(place), q: 0.7, gain: 0.1, type: "lowpass" });
  }

  land(speed: number, place?: string): void {
    this.count("land");
    if (!this.ctx) return;
    this.tone({ dur: 0.1, from: 120, to: 50, gain: 0.15 + Math.min(0.2, speed * 0.02) });
    this.burst({ dur: 0.08, freq: landPitch(place), q: 0.6, gain: 0.12, type: "lowpass" });
  }

  mantle(place?: string): void {
    this.count("mantle");
    if (!this.ctx) return;
    this.burst({ dur: 0.2, freq: mantlePitch(place), q: 0.5, gain: 0.14, type: "lowpass" });
    this.tone({ dur: 0.18, from: 80, to: 55, gain: 0.2, delay: 0.25 });
  }

  reload(phase: "start" | "end" | "seat", place?: string): void {
    this.count("reload_" + phase);
    if (!this.ctx) return;
    if (phase === "seat") {
      this.tone({ dur: 0.1, from: 150, to: 70, gain: 0.35 }); // the clunk that says "you can cancel now"
      this.burst({ dur: 0.05, freq: 1400, q: 1.2, gain: 0.2 });
    } else if (phase === "start") {
      this.burst({ dur: 0.06, freq: reloadPitch(place), q: 1.5, gain: 0.12 });
      this.burst({ dur: 0.1, freq: 500, q: 0.6, gain: 0.1, type: "lowpass", pan: -0.3 });
    } else {
      this.burst({ dur: 0.05, freq: boltPitch(place), q: 2, gain: 0.16 });
      this.tone({ dur: 0.08, from: 200, to: 90, gain: 0.25 });
    }
  }
}
