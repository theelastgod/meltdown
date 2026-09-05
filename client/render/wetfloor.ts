import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

/**
 * Wet street: a planar reflection rendered at low resolution and smeared
 * vertically, mixed over a dark tiled base by a puddle mask, with cyan lane
 * lines living in the same shader so they reflect nothing and glow.
 */
export function makeWetFloor(width: number, depth: number, y: number, fogColor: THREE.Color, fogDensity: number): Reflector {
  const geo = new THREE.PlaneGeometry(width, depth);
  const shader = {
    name: "WetFloor",
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      tDiffuse: { value: null as THREE.Texture | null },
      textureMatrix: { value: new THREE.Matrix4() },
      time: { value: 0 },
      fogColor: { value: fogColor },
      fogDensity: { value: fogDensity },
      camPos: { value: new THREE.Vector3() },
      debug: { value: new URLSearchParams(location.search).get("debug") === "refl" ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv; varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vUv = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float time; uniform vec3 fogColor; uniform float fogDensity; uniform vec3 camPos; uniform float debug;
      varying vec4 vUv; varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 uv = vUv.xy / vUv.w;
        if (debug > 0.5) { gl_FragColor = vec4(texture2D(tDiffuse, uv).rgb, 1.0); return; }
        // vertical smear: the clip's reflections are long streaks
        vec3 refl = vec3(0.0); float ws = 0.0;
        for (int i = -5; i <= 5; i++) {
          float fi = float(i); float w = 1.0 - abs(fi) / 6.0;
          refl += texture2D(tDiffuse, uv + vec2(0.0, fi * 0.012)).rgb * w; ws += w;
        }
        refl = min(refl / ws, vec3(1.0));
        // tiles: 2 m grid with dark grout, subtle per-tile tone
        vec2 tile = vWorld.xz / 2.0;
        vec2 ft = fract(tile);
        float grout = 1.0 - smoothstep(0.0, 0.04, min(min(ft.x, 1.0 - ft.x), min(ft.y, 1.0 - ft.y)));
        float tone = 0.85 + 0.3 * hash(floor(tile));
        vec3 base = vec3(0.028, 0.034, 0.048) * tone * (1.0 - grout * 0.6);
        // puddle mask
        float pud = smoothstep(0.35, 0.75, noise(vWorld.xz * 0.18 + vec2(3.1, 7.7)));
        float wet = 0.22 + 0.78 * pud;
        // fresnel-ish: more reflection at grazing angles
        vec3 v = normalize(camPos - vWorld);
        float fres = pow(1.0 - max(v.y, 0.0), 2.0);
        vec3 c = base + refl * wet * (0.25 + 0.75 * fres) * 0.7;
        // cyan lane lines along the probe lane and the plaza
        float laneA = 1.0 - smoothstep(0.0, 0.08, abs(abs(vWorld.x) - 4.6));
        float laneB = (1.0 - smoothstep(0.0, 0.08, abs(vWorld.z - 6.0))) * step(6.0, abs(vWorld.x));
        float lane = max(laneA, laneB) * step(-30.0, vWorld.z) * step(vWorld.z, 30.0);
        c += vec3(0.05, 0.75, 0.9) * lane * 0.9;
        // fog
        float d = length(camPos - vWorld);
        float f = 1.0 - exp(-fogDensity * fogDensity * d * d);
        c = mix(c, fogColor, f);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  };
  const r = new Reflector(geo, { clipBias: 0.003, textureWidth: 256, textureHeight: 144, color: 0xffffff, shader });
  r.rotation.x = -Math.PI / 2;
  r.position.y = y;
  const mat = r.material as THREE.ShaderMaterial;
  r.onBeforeRender = ((orig) =>
    function (this: Reflector, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, ...rest: unknown[]) {
      (mat.uniforms.camPos!.value as THREE.Vector3).copy(camera.position);
      // Objects on FAR_LAYER (rain, skyline) are invisible to the mirror camera, which only sees layer 0.
      (orig as (...a: unknown[]) => void).call(this, renderer, scene, camera, ...rest);
    })(r.onBeforeRender);
  return r;
}
