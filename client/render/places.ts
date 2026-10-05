/**
 * The fifteen districts added after the original five. The original five keep the reads they
 * already had in placeAir, bedTune, crowdCast, vistaRead, lampRead and skylineRead. A room that
 * is not a district is not in this table.
 *
 * Nothing here adds a mesh. The generator still builds the blocks. These numbers are how that
 * place stands, sounds, and who walks it.
 */
export type PlaceFeel = {
  air: { fog: number; density: number; exposure: number; sky: number; rain: readonly [number, number, number]; fall: number };
  bed: { rainHz: number; rainQ: number; rain: number; humHz: number; hum: number; buzzHz: number; buzzCut: number; buzz: number };
  crowd: { h0: number; hSpan: number; bulk: number; umbrella: number; idle: number; speed0: number; speedSpan: number; coat: number; lamp: number };
  vista: number;
  lamp: number;
  skyline: { base: number; rise: number; far: number };
  step?: { hz: number; dur: number; q: number; type: "lowpass" | "highpass" };
};

const feel = (
  air: PlaceFeel["air"],
  bed: PlaceFeel["bed"],
  crowd: PlaceFeel["crowd"],
  vista: number,
  lamp: number,
  skyline: PlaceFeel["skyline"],
  step?: PlaceFeel["step"],
): PlaceFeel => ({ air, bed, crowd, vista, lamp, skyline, step });

export const PLACE_FEEL: Record<string, PlaceFeel> = {
  // a cut of black water between yards. Low sheds, a wide slow crowd, rain that sits.
  ash_canal: feel(
    { fog: 0x07140f, density: 0.0048, exposure: 0.96, sky: 0x0c2418, rain: [0.35, 0.62, 0.48], fall: 0.35 },
    { rainHz: 700, rainQ: 0.3, rain: 0.32, humHz: 22, hum: 0.22, buzzHz: 70, buzzCut: 420, buzz: 0.008 },
    { h0: 0.94, hSpan: 0.08, bulk: 1.22, umbrella: 0.84, idle: 0.08, speed0: 0.5, speedSpan: 0.25, coat: 0x6a9080, lamp: 0x3dffb0 },
    0.28, 0x3dffa8, { base: 6, rise: 14, far: 6 },
    { hz: 180, dur: 0.09, q: 0.5, type: "lowpass" },
  ),
  // showroom glass. The street is a slot between towers and the air is thin.
  glass_mile: feel(
    { fog: 0x160818, density: 0.0047, exposure: 1.55, sky: 0x2a1030, rain: [0.85, 0.7, 0.95], fall: 1.95 },
    { rainHz: 5200, rainQ: 0.9, rain: 0.02, humHz: 210, hum: 0.03, buzzHz: 640, buzzCut: 5000, buzz: 0.008 },
    { h0: 1.18, hSpan: 0.06, bulk: 0.72, umbrella: 0.01, idle: 0.02, speed0: 1.2, speedSpan: 0.2, coat: 0xe8d0f0, lamp: 0xfff6ff },
    1.9, 0xffe8ff, { base: 40, rise: 90, far: 70 },
    { hz: 1400, dur: 0.02, q: 2.2, type: "highpass" },
  ),
  // a market that sells what the clinics will not name. Dust, stalls, people who stop.
  bone_market: feel(
    { fog: 0x1c140c, density: 0.0086, exposure: 1.22, sky: 0x321c10, rain: [0.7, 0.5, 0.32], fall: 0.42 },
    { rainHz: 2400, rainQ: 0.4, rain: 0.06, humHz: 90, hum: 0.14, buzzHz: 160, buzzCut: 1400, buzz: 0.02 },
    { h0: 0.8, hSpan: 0.1, bulk: 1.06, umbrella: 0.12, idle: 0.4, speed0: 0.42, speedSpan: 0.5, coat: 0xc8a070, lamp: 0xffe0a0 },
    0.4, 0xffd090, { base: 8, rise: 16, far: 4 },
  ),
  // lockers of cold. The outside is a wall of vaults and almost nobody hurries.
  cold_vault: feel(
    { fog: 0x081018, density: 0.0054, exposure: 0.9, sky: 0x101820, rain: [0.7, 0.8, 0.85], fall: 0.25 },
    { rainHz: 500, rainQ: 0.25, rain: 0.04, humHz: 36, hum: 0.18, buzzHz: 55, buzzCut: 300, buzz: 0.004 },
    { h0: 1.04, hSpan: 0.04, bulk: 1.28, umbrella: 0.02, idle: 0.22, speed0: 0.4, speedSpan: 0.15, coat: 0x9aa8b4, lamp: 0xb8fff6 },
    0.22, 0xa8fff0, { base: 10, rise: 8, far: 0 },
    { hz: 640, dur: 0.035, q: 1.4, type: "highpass" },
  ),
  // courts laid out like a nave. Violet air, people standing in the crossings.
  neon_chapel: feel(
    { fog: 0x12081c, density: 0.0076, exposure: 1.34, sky: 0x220838, rain: [0.62, 0.3, 0.9], fall: 0.8 },
    { rainHz: 3600, rainQ: 1.1, rain: 0.1, humHz: 64, hum: 0.08, buzzHz: 300, buzzCut: 2400, buzz: 0.028 },
    { h0: 0.96, hSpan: 0.12, bulk: 0.9, umbrella: 0.2, idle: 0.46, speed0: 0.55, speedSpan: 0.3, coat: 0xb060d0, lamp: 0xd080ff },
    0.75, 0xc070ff, { base: 16, rise: 28, far: 12 },
  ),
  // open pits and impound lots. The ground is close and the rain is hot grit.
  slag_pit: feel(
    { fog: 0x1a0c06, density: 0.0088, exposure: 1.42, sky: 0x3a1408, rain: [0.95, 0.4, 0.15], fall: 0.48 },
    { rainHz: 1100, rainQ: 0.32, rain: 0.08, humHz: 40, hum: 0.24, buzzHz: 80, buzzCut: 500, buzz: 0.016 },
    { h0: 1.0, hSpan: 0.05, bulk: 1.3, umbrella: 0.04, idle: 0.1, speed0: 0.58, speedSpan: 0.2, coat: 0xa06030, lamp: 0xff6a20 },
    0.36, 0xff6820, { base: 4, rise: 12, far: 2 },
    { hz: 140, dur: 0.08, q: 0.4, type: "lowpass" },
  ),
  // alleys grown over with cable. A green dusk and a lighter step.
  wire_garden: feel(
    { fog: 0x061610, density: 0.0061, exposure: 1.18, sky: 0x0c2818, rain: [0.4, 0.85, 0.55], fall: 1.05 },
    { rainHz: 4000, rainQ: 0.8, rain: 0.14, humHz: 72, hum: 0.06, buzzHz: 220, buzzCut: 1800, buzz: 0.018 },
    { h0: 0.9, hSpan: 0.14, bulk: 0.86, umbrella: 0.36, idle: 0.18, speed0: 0.85, speedSpan: 0.55, coat: 0x70c090, lamp: 0x80ffb0 },
    0.85, 0x70ffb0, { base: 14, rise: 24, far: 8 },
  ),
  // kilns. The outside keeps rising and the air is dry heat.
  red_kiln: feel(
    { fog: 0x1c0a08, density: 0.008, exposure: 1.5, sky: 0x401008, rain: [0.9, 0.35, 0.28], fall: 0.62 },
    { rainHz: 1600, rainQ: 0.38, rain: 0.03, humHz: 100, hum: 0.2, buzzHz: 140, buzzCut: 900, buzz: 0.012 },
    { h0: 1.06, hSpan: 0.06, bulk: 1.14, umbrella: 0.0, idle: 0.06, speed0: 0.66, speedSpan: 0.18, coat: 0xc05040, lamp: 0xff5030 },
    1.4, 0xff5040, { base: 22, rise: 48, far: 30 },
  ),
  // a wharf of paper bales and low sheds. Grey water, people under covers.
  paper_wharf: feel(
    { fog: 0x101418, density: 0.0058, exposure: 1.05, sky: 0x1c242c, rain: [0.75, 0.78, 0.8], fall: 1.55 },
    { rainHz: 1000, rainQ: 0.42, rain: 0.26, humHz: 32, hum: 0.16, buzzHz: 88, buzzCut: 560, buzz: 0.009 },
    { h0: 0.92, hSpan: 0.1, bulk: 1.1, umbrella: 0.7, idle: 0.12, speed0: 0.6, speedSpan: 0.35, coat: 0xb0b4b8, lamp: 0xd0e8ff },
    0.45, 0xc8d8ea, { base: 8, rise: 18, far: 6 },
  ),
  // walled courts under a cloth dark. The step is soft and the crowd lingers.
  velvet_court: feel(
    { fog: 0x140610, density: 0.0078, exposure: 1.08, sky: 0x240818, rain: [0.8, 0.3, 0.5], fall: 0.9 },
    { rainHz: 2600, rainQ: 1.4, rain: 0.12, humHz: 44, hum: 0.1, buzzHz: 180, buzzCut: 1600, buzz: 0.022 },
    { h0: 0.84, hSpan: 0.08, bulk: 1.0, umbrella: 0.16, idle: 0.38, speed0: 0.46, speedSpan: 0.4, coat: 0x902040, lamp: 0xff4080 },
    0.55, 0xff4078, { base: 12, rise: 20, far: 6 },
    { hz: 400, dur: 0.07, q: 0.9, type: "lowpass" },
  ),
  // a crown of rusted stacks. Tall, broad, and the rain barely arrives.
  rust_crown: feel(
    { fog: 0x16100a, density: 0.0064, exposure: 1.28, sky: 0x2c2010, rain: [0.8, 0.6, 0.35], fall: 1.15 },
    { rainHz: 1800, rainQ: 0.5, rain: 0.05, humHz: 130, hum: 0.12, buzzHz: 110, buzzCut: 800, buzz: 0.01 },
    { h0: 1.1, hSpan: 0.07, bulk: 1.2, umbrella: 0.06, idle: 0.07, speed0: 0.72, speedSpan: 0.22, coat: 0xb87840, lamp: 0xffc060 },
    1.55, 0xffb050, { base: 24, rise: 40, far: 20 },
  ),
  // stairs cut in salt concrete. Hard rain, a thin fast crowd, a click underfoot.
  salt_stairs: feel(
    { fog: 0x0c1218, density: 0.0049, exposure: 1.46, sky: 0x182430, rain: [0.85, 0.9, 0.95], fall: 2.0 },
    { rainHz: 4500, rainQ: 0.6, rain: 0.2, humHz: 150, hum: 0.05, buzzHz: 360, buzzCut: 3200, buzz: 0.006 },
    { h0: 1.08, hSpan: 0.05, bulk: 0.74, umbrella: 0.22, idle: 0.01, speed0: 1.25, speedSpan: 0.4, coat: 0xd8e0e8, lamp: 0xf0f6ff },
    1.15, 0xe8f0ff, { base: 20, rise: 36, far: 18 },
    { hz: 1800, dur: 0.015, q: 2.4, type: "highpass" },
  ),
  // lamps for sale under a low roof. The crowd is the thickest of the new streets.
  lamp_bazaar: feel(
    { fog: 0x1a0814, density: 0.0084, exposure: 1.36, sky: 0x300818, rain: [1, 0.45, 0.7], fall: 0.38 },
    { rainHz: 7400, rainQ: 1.5, rain: 0.18, humHz: 58, hum: 0.09, buzzHz: 280, buzzCut: 3400, buzz: 0.04 },
    { h0: 0.86, hSpan: 0.16, bulk: 1.02, umbrella: 0.14, idle: 0.42, speed0: 0.52, speedSpan: 0.7, coat: 0xf0a0c0, lamp: 0xff90d0 },
    0.48, 0xff88cc, { base: 7, rise: 12, far: 3 },
  ),
  // leased trees in a lot grid. Gold-green air and a slow walk.
  debt_orchard: feel(
    { fog: 0x101608, density: 0.0068, exposure: 1.16, sky: 0x1c280c, rain: [0.7, 0.75, 0.4], fall: 1.25 },
    { rainHz: 2200, rainQ: 0.55, rain: 0.09, humHz: 54, hum: 0.11, buzzHz: 150, buzzCut: 1200, buzz: 0.011 },
    { h0: 0.98, hSpan: 0.1, bulk: 1.08, umbrella: 0.28, idle: 0.2, speed0: 0.64, speedSpan: 0.28, coat: 0x88a050, lamp: 0xd0ff70 },
    0.95, 0xc8f060, { base: 11, rise: 22, far: 8 },
  ),
  // a relay that was never lit. The tallest outside in the city, and the thinnest people.
  black_relay: feel(
    { fog: 0x04060c, density: 0.0071, exposure: 1.6, sky: 0x060810, rain: [0.55, 0.6, 0.7], fall: 1.65 },
    { rainHz: 6000, rainQ: 0.75, rain: 0.008, humHz: 240, hum: 0.02, buzzHz: 520, buzzCut: 4600, buzz: 0.003 },
    { h0: 1.22, hSpan: 0.04, bulk: 0.68, umbrella: 0.0, idle: 0.03, speed0: 1.05, speedSpan: 0.15, coat: 0x404858, lamp: 0x88a0c0 },
    2.05, 0x6880a0, { base: 48, rise: 80, far: 60 },
  ),
};

export function placeFeel(name: string | undefined): PlaceFeel | undefined {
  return name ? PLACE_FEEL[name] : undefined;
}
