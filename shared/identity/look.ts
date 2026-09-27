/**
 * The Blank's look (Stage 689): a body, a build, a coat and a shoulder, chosen on the CHARACTER
 * page and worn on the silhouette everyone sees. Zero mechanical effect: the sim's capsule, the
 * bones, the eye height and every hitbox are the same for every look; only the cloth's shape
 * changes, inside the capsule. Index 0 of every field is the Blank as it was, so look 0 is the
 * default and costs nothing on the wire.
 */
export interface LookOption {
  id: string;
  label: string;
}
export interface LookField {
  key: "body" | "build" | "coat" | "kit";
  label: string;
  options: readonly LookOption[];
}

export const LOOK_FIELDS: readonly LookField[] = [
  { key: "body", label: "BODY", options: [{ id: "neutral", label: "ANDROGYNOUS" }, { id: "masc", label: "MASCULINE" }, { id: "fem", label: "FEMININE" }] },
  { key: "build", label: "BUILD", options: [{ id: "standard", label: "STANDARD" }, { id: "slim", label: "SLIM" }, { id: "heavy", label: "HEAVY" }] },
  { key: "coat", label: "COAT", options: [{ id: "long", label: "LONG COAT" }, { id: "short", label: "SHORT JACKET" }] },
  { key: "kit", label: "SHOULDER", options: [{ id: "right", label: "PLATE RIGHT" }, { id: "left", label: "PLATE LEFT" }, { id: "both", label: "BOTH PLATES" }, { id: "bare", label: "BARE" }] },
];

export type Look = Record<LookField["key"], number>;

export const DEFAULT_LOOK: Look = { body: 0, build: 0, coat: 0, kit: 0 };

/** how many looks there are: every combination of every field */
export const LOOK_COUNT = LOOK_FIELDS.reduce((n, f) => n * f.options.length, 1);

/** a look as one small integer, first field fastest; the wire and the file carry this */
export function encodeLook(l: Look): number {
  let code = 0;
  let mul = 1;
  for (const f of LOOK_FIELDS) {
    const v = Math.trunc(l[f.key]);
    code += (v >= 0 && v < f.options.length ? v : 0) * mul;
    mul *= f.options.length;
  }
  return code;
}

export function decodeLook(code: number): Look {
  let c = sanitizeLookCode(code);
  const out = { ...DEFAULT_LOOK };
  for (const f of LOOK_FIELDS) {
    out[f.key] = c % f.options.length;
    c = Math.floor(c / f.options.length);
  }
  return out;
}

/** anything a client sends becomes a real look or the default: every look is free, none is earned */
export function sanitizeLookCode(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < LOOK_COUNT ? v : 0;
}

/** the option id a look wears in one field */
export function lookOption(l: Look, key: LookField["key"]): string {
  const f = LOOK_FIELDS.find((x) => x.key === key)!;
  return f.options[l[key]]?.id ?? f.options[0]!.id;
}

/** step one field forward or back, wrapping */
export function stepLook(l: Look, key: LookField["key"], dir: 1 | -1): Look {
  const f = LOOK_FIELDS.find((x) => x.key === key)!;
  const n = f.options.length;
  return { ...l, [key]: (((l[key] + dir) % n) + n) % n };
}
