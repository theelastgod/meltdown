/** Minimal allocation-light vector math shared by client and server. Plain objects, no classes. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const set = (o: Vec3, x: number, y: number, z: number): Vec3 => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
};
export const copy = (o: Vec3, a: Vec3): Vec3 => set(o, a.x, a.y, a.z);
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => v3(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec3): number => Math.sqrt(dot(a, a));
export const lenXZ = (a: Vec3): number => Math.sqrt(a.x * a.x + a.z * a.z);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3();
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
/** sqrt(x²+y²) via IEEE sqrt only: bit-identical on every V8 build (Math.hypot is not). */
export const hyp2 = (x: number, y: number): number => Math.sqrt(x * x + y * y);
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Unit vector for a yaw (radians, 0 = -Z forward, increasing turns left) on the XZ plane. */
export const yawDir = (yaw: number): Vec3 => v3(-Math.sin(yaw), 0, -Math.cos(yaw));
/** Right-hand vector for a yaw on the XZ plane. */
export const yawRight = (yaw: number): Vec3 => v3(Math.cos(yaw), 0, -Math.sin(yaw));
/** View direction from yaw + pitch (pitch>0 looks up). */
export const viewDir = (yaw: number, pitch: number): Vec3 => {
  const c = Math.cos(pitch);
  return v3(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
};
/** Yaw that looks from a toward b (XZ plane). */
export const yawTo = (a: Vec3, b: Vec3): number => Math.atan2(-(b.x - a.x), -(b.z - a.z));
/** Pitch that looks from a toward b. */
export const pitchTo = (a: Vec3, b: Vec3): number => {
  const d = sub(b, a);
  return Math.atan2(d.y, lenXZ(d));
};
export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
