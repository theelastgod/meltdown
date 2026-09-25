/**
 * Moving pictures on the city's screens (Stage 633).
 *
 * Every sign in Lethe has been a still plate since Stage 43. The city bible asked for ad tickers
 * and sign flicker from the start, and the flicker was faked by pulsing a material's opacity — the
 * picture itself never moved. These are the first assets in the game that do.
 *
 * The rules are the ones `shared/assets/manifest.ts` already sets for pictures, because the failure
 * modes are the same ones and worse:
 *
 * **A clip is a picture and a promise about its size.** No stat field, no gameplay reach. The sim
 * never imports this file, and `tests/assets.test.ts` walks the import graph to keep it that way.
 *
 * **Every clip is optional and fails soft.** A screen that cannot fetch, cannot decode, or is
 * refused autoplay keeps the still plate it already had. A player on a plane sees the city exactly
 * as it shipped in Stage 632. This is why the clips are deliberately NOT precached: an offline
 * install is 28 MB of art, not 30 MB of art and a video decoder.
 *
 * **Decoding costs more than drawing.** A still plate is uploaded once; a clip is decoded every
 * frame it is visible, on the CPU, next to a sim that has a 60 Hz budget. `MAX_LIVE_SCREENS` is the
 * ceiling on how many may ever be decoding at once, and `ScreenPool` enforces it — the budget is
 * the feature, not an afterthought.
 *
 * VP9 in WebM, not H.264: it is a third of the bytes at this quality, and it is the codec a
 * Chromium built without proprietary codecs can actually decode, which is the difference between a
 * probe that checks these clips play and a probe that takes it on faith.
 */

/** Which screen family a clip may appear on. A clip with nowhere to play does not ship. */
export type ScreenId = "shop_a" | "shop_b" | "shop_c" | "kiosk" | "backdrop";

export interface VideoDef {
  id: string;
  /** path under `public/video`, served as `/video/<file>` */
  file: string;
  width: number;
  height: number;
  seconds: number;
  /** bytes on disk — declared so a silent bloat fails the lint rather than the player's data plan */
  bytes: number;
  sha256: string;
  screen: ScreenId;
  provenance: string;
}

/**
 * Ceilings.
 *
 * The byte budget is separate from — and far smaller than — the texture budget, because video is
 * fetched over the network during play rather than precached with the install.
 */
export const MAX_VIDEO_BYTES = 512 * 1024;
export const VIDEO_BUDGET_BYTES = 4 * 1024 * 1024;
/** How many clips may be decoding at once, anywhere in the process. Measured, not guessed: see Stage 633. */
export const MAX_LIVE_SCREENS = 4;
/** Largest edge a clip may have. A screen is small on the player's monitor; a 1080p ad is waste. */
export const MAX_VIDEO_EDGE = 832;

export const VIDEOS: readonly VideoDef[] = [
  { id: "vid_ad_clinic", file: "ad_clinic.webm", width: 480, height: 832, seconds: 5.17, bytes: 276540, sha256: "f37f36329aa5bb7410a5b7a5c24f53e91db035877b44bc7d0e2869c044a86d4d", screen: "kiosk", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_counted", file: "ad_counted.webm", width: 512, height: 296, seconds: 5.17, bytes: 63317, sha256: "85e1cff5898e57c8e889da2f4898ea609bc9b3d25ab005d5746cbc3bd57e00d8", screen: "shop_b", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_hardware", file: "ad_hardware.webm", width: 512, height: 296, seconds: 5.17, bytes: 190585, sha256: "3552c1f0d16a92462cc668b307f889836674c5c9465efcd97345fa9c7730be3a", screen: "shop_c", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_hours", file: "ad_hours.webm", width: 512, height: 296, seconds: 5.17, bytes: 147405, sha256: "1e433eb832b368a93b206c96806d8ea688e6c539c6001084947332d537f7e935", screen: "shop_a", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_lease", file: "ad_lease.webm", width: 512, height: 296, seconds: 5.17, bytes: 39412, sha256: "aaa8ae74a99194a24c42dcf41e155e411759280b3838b73ea18160aaefc70084", screen: "shop_a", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_noodles", file: "ad_noodles.webm", width: 480, height: 832, seconds: 5.17, bytes: 100413, sha256: "be581ec191729475b34d28ca864bc7a34731c179c979fcb06fd378ad8bc917bb", screen: "shop_b", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_ticker", file: "ad_ticker.webm", width: 512, height: 296, seconds: 5.17, bytes: 234485, sha256: "0ec99726801b9907ebcf54ee3ecdf19dd5eae890a2068097765a83d548d8775a", screen: "shop_c", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_transit", file: "ad_transit.webm", width: 512, height: 296, seconds: 5.17, bytes: 143500, sha256: "078200694b6fc41a61b3a37c4568ff10fa3dedc2fbe4ea20f148ed7ea9062707", screen: "shop_a", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_unclaimed", file: "ad_unclaimed.webm", width: 480, height: 832, seconds: 5.17, bytes: 67381, sha256: "885d51f5a356d76ef7efcfb7db847aecaa3c59d0f11c88f7eb2ba6ed8e5aa809", screen: "shop_c", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_ad_watching", file: "ad_watching.webm", width: 512, height: 296, seconds: 5.17, bytes: 87576, sha256: "656a1641ffebafc1428926d3e28e67e4eed194d2865d7b27eb4e75a297abcaeb", screen: "shop_b", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_crt_idle", file: "crt_idle.webm", width: 512, height: 384, seconds: 5.17, bytes: 160056, sha256: "3497ef9218e469df91d740f119628867660588fd9d3cdfbe10cfb81f7d1c05dc", screen: "kiosk", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
  { id: "vid_title_skyline", file: "title_skyline.webm", width: 512, height: 296, seconds: 5.17, bytes: 45466, sha256: "8ec2c31e1d5524fceeb5fc680d49ad584d436bdb86495c6b52114c0b9ecfb219", screen: "backdrop", provenance: "generated (Higgsfield minimax_h3_max, 2026-09-25) at 832x480 H.264, transcoded to VP9 by tools/video-add.ts" },
];

/**
 * Where the clips are served from.
 *
 * They ship in `public/video` today, which is what lets CI check them. `VITE_VIDEO_BASE` points the
 * same manifest at a CDN bucket instead, so moving them off the Pages deploy is one environment
 * variable and no code change. A base that does not resolve is not an error: the screens fail soft
 * to their plates, which is the whole reason the fallback exists.
 */
export function videoBase(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const base = env?.["VITE_VIDEO_BASE"] ?? "/video";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function videoUrl(v: VideoDef): string {
  return `${videoBase()}/${v.file}`;
}

/** The clips that may play on one screen family, in manifest order. */
export function clipsFor(screen: ScreenId): readonly VideoDef[] {
  return VIDEOS.filter((v) => v.screen === screen);
}

export function totalVideoBytes(): number {
  return VIDEOS.reduce((n, v) => n + v.bytes, 0);
}
