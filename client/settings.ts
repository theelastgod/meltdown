/**
 * Settings: a small persisted record the game applies live. Nothing here touches the sim (the
 * sim is deterministic and shared); sensitivity is input, FOV and CRT are the renderer, volumes
 * are the audio buses. Values are clamped on read, so a hand-edited store cannot break the game.
 */
export interface Settings {
  /** mouse sensitivity multiplier */
  sensitivity: number;
  /** vertical field of view, degrees */
  fov: number;
  /** 0..1 */
  master: number;
  sfx: number;
  /** the city bed (rain, hum, traffic) */
  bed: number;
  /** CRT post intensity (grain, aberration, scanlines, vignette) 0..1.5 */
  crt: number;
  /** show the opening crawl on every visit (else only until seen; it stays skippable) */
  crawlEveryTime: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, fov: 80, master: 0.7, sfx: 1, bed: 1, crt: 1, crawlEveryTime: false };

export const SETTING_RANGES: Record<keyof Settings, { min: number; max: number; step: number } | null> = {
  sensitivity: { min: 0.25, max: 3, step: 0.05 },
  fov: { min: 65, max: 105, step: 1 },
  master: { min: 0, max: 1, step: 0.05 },
  sfx: { min: 0, max: 1, step: 0.05 },
  bed: { min: 0, max: 1, step: 0.05 },
  crt: { min: 0, max: 1.5, step: 0.1 },
  crawlEveryTime: null,
};

export const SETTINGS_KEY = "meltdown.settings";

export function clampSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const range = SETTING_RANGES[k];
    const v = r[k];
    if (range) {
      if (typeof v === "number" && Number.isFinite(v)) (out as unknown as Record<string, number>)[k] = Math.min(range.max, Math.max(range.min, Math.round(Math.round(v / range.step) * range.step * 1000) / 1000));
    } else if (typeof v === "boolean") (out as unknown as Record<string, boolean>)[k] = v;
  }
  return out;
}

export function loadSettings(): Settings {
  try {
    return clampSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* no storage */
  }
}

/** One step up or down a numeric setting (the menu's ← →). */
export function stepSetting(s: Settings, key: keyof Settings, dir: 1 | -1): Settings {
  const range = SETTING_RANGES[key];
  if (!range) return { ...s, [key]: !s[key] };
  const v = (s[key] as number) + dir * range.step;
  return clampSettings({ ...s, [key]: v });
}

export const SETTING_LABELS: Record<keyof Settings, string> = {
  sensitivity: "MOUSE SENSITIVITY",
  fov: "FIELD OF VIEW",
  master: "MASTER VOLUME",
  sfx: "SFX",
  bed: "CITY BED",
  crt: "CRT",
  crawlEveryTime: "OPENING CRAWL EVERY VISIT",
};

export function formatSetting(s: Settings, key: keyof Settings): string {
  const v = s[key];
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  if (key === "fov") return `${v}°`;
  if (key === "sensitivity") return `${v.toFixed(2)}×`;
  if (key === "crt") return `${Math.round(v * 100)}%`;
  return `${Math.round(v * 100)}%`;
}
