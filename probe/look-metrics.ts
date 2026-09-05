/**
 * Look metrics shared by the reference extractor and the Stage 3 probe. The
 * function body runs inside the browser (page.evaluate) against an ImageData,
 * so it must be self-contained.
 */
export interface LookStats {
  width: number;
  height: number;
  meanLuma: number;
  /** fraction of pixels with luma < 0.12 */
  darkFrac: number;
  /** fraction of pixels that read as lit neon: saturation > 0.45 and luma > 0.3 */
  neonFrac: number;
  /** share of neon pixels per hue family (sums to ~1) */
  hue: { cyan: number; magenta: number; yellow: number; green: number; red: number; blue: number; other: number };
}

export function computeLookStats(img: ImageData): LookStats {
  const d = img.data;
  const n = img.width * img.height;
  let lumaSum = 0;
  let dark = 0;
  let neon = 0;
  const hue = { cyan: 0, magenta: 0, yellow: 0, green: 0, red: 0, blue: 0, other: 0 };
  for (let i = 0; i < n; i++) {
    const r = d[i * 4]! / 255;
    const g = d[i * 4 + 1]! / 255;
    const b = d[i * 4 + 2]! / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    if (luma < 0.12) dark++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max > 0 ? (max - min) / max : 0;
    if (sat > 0.45 && luma > 0.3) {
      neon++;
      let h = 0;
      const delta = max - min;
      if (delta > 0) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
      }
      if (h >= 165 && h < 205) hue.cyan++;
      else if (h >= 280 && h < 335) hue.magenta++;
      else if (h >= 40 && h < 70) hue.yellow++;
      else if (h >= 90 && h < 165) hue.green++;
      else if (h < 40 || h >= 335) hue.red++;
      else if (h >= 205 && h < 280) hue.blue++;
      else hue.other++;
    }
  }
  const k = neon || 1;
  return {
    width: img.width,
    height: img.height,
    meanLuma: lumaSum / n,
    darkFrac: dark / n,
    neonFrac: neon / n,
    hue: { cyan: hue.cyan / k, magenta: hue.magenta / k, yellow: hue.yellow / k, green: hue.green / k, red: hue.red / k, blue: hue.blue / k, other: hue.other / k },
  };
}

/** Source text of computeLookStats for injection into page.evaluate. */
export const computeLookStatsSource = computeLookStats.toString();
