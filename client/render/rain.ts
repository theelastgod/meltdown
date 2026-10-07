import * as THREE from "three";

/** How fast rain slides sideways. Lease Row keeps 1.2. Fall stays placeAir. */
export const STREET_DRIFT = 1.2;

const DISTRICT_DRIFT: Record<string, number> = {
  deadletter_docks: 0.45,
  repo_depot: 0.72,
  night_market: 2.4,
  relay_heights: 1.65,
  ash_canal: 0.32,
  glass_mile: 2.85,
  bone_market: 0.58,
  cold_vault: 0.22,
  neon_chapel: 0.9,
  slag_pit: 1.9,
  wire_garden: 1.35,
  red_kiln: 0.8,
  paper_wharf: 2.15,
  velvet_court: 0.64,
  rust_crown: 1.48,
  salt_stairs: 3.05,
  lamp_bazaar: 1.05,
  debt_orchard: 1.12,
  black_relay: 2.6,
};

export function rainDrift(name: string | undefined): number {
  return (name && DISTRICT_DRIFT[name]) || STREET_DRIFT;
}

/**
 * GPU rain: a fixed cloud of line streaks wrapped around the camera in the
 * vertex shader, falling with a slight wind. Lit additively so the nearest
 * neon tints it through bloom.
 */
export class Rain {
  readonly object: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;

  constructor(count = 3500, size = new THREE.Vector3(36, 26, 36)) {
    const pos = new Float32Array(count * 2 * 3);
    const seed = new Float32Array(count * 2);
    let s = 0x9e3779b9;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    for (let i = 0; i < count; i++) {
      const x = rnd() * size.x;
      const y = rnd() * size.y;
      const z = rnd() * size.z;
      const len = 0.35 + rnd() * 0.5;
      const sd = rnd();
      pos.set([x, y, z, x, y + len, z], i * 6);
      seed[i * 2] = sd;
      seed[i * 2 + 1] = sd;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        camPos: { value: new THREE.Vector3() },
        size: { value: size },
        color: { value: new THREE.Color(0.55, 0.8, 0.95) },
        fall: { value: 1 },
        drift: { value: STREET_DRIFT },
        fogColor: { value: new THREE.Color(0x05070c) },
        fogDensity: { value: 0.02 },
      },
      vertexShader: /* glsl */ `
        uniform float time; uniform float fall; uniform float drift; uniform vec3 camPos; uniform vec3 size;
        attribute float seed;
        varying float vFade;
        void main() {
          vec3 p = position;
          float speed = (9.0 + seed * 6.0) * fall;
          p.y = mod(p.y - time * speed, size.y);
          p.x = mod(p.x + time * drift + seed * 3.0, size.x);
          // wrap the cloud around the camera
          vec3 rel = mod(p - camPos + size * 0.5, size) - size * 0.5;
          vec3 world = camPos + rel;
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          float d = length(mv.xyz);
          vFade = (0.25 + 0.75 * seed) * smoothstep(0.4, 2.5, d) * exp(-d * 0.08);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color; varying float vFade;
        void main() { gl_FragColor = vec4(color * vFade * 0.9, vFade * 0.5); }
      `,
    });
    this.object = new THREE.LineSegments(geo, this.mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 10;
  }

  /** Tint and pace. The streak count stays put, so the frame does not grow. */
  setWeather(rgb: readonly [number, number, number], fall: number): void {
    (this.mat.uniforms.color!.value as THREE.Color).setRGB(rgb[0], rgb[1], rgb[2]);
    this.mat.uniforms.fall!.value = fall;
  }

  /** Sideways slide. Fall stays setWeather. The streak count stays put. */
  setDrift(drift: number): void {
    this.mat.uniforms.drift!.value = drift;
  }

  /** The sideways slide the streaks are holding. */
  driftNow(): number {
    return this.mat.uniforms.drift!.value as number;
  }

  update(time: number, camera: THREE.Camera): void {
    this.mat.uniforms.time!.value = time;
    (this.mat.uniforms.camPos!.value as THREE.Vector3).copy(camera.position);
  }
}
