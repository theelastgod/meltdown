import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { texture as assetTexture } from "./assets";
import { bindPlate } from "./city";

/**
 * Linear luma of `tex_plaza_slab`, the tile the reflector samples (Stage 736).
 * Measured from the file: sRGB bytes to linear, then 0.2126 R + 0.7152 G + 0.0722 B.
 * The shader divides by this so the bed's average stays the Stage 657 tone.
 * `tex_pavement` is a photograph of a street, not a tile, so it is not the albedo.
 */
export const SLAB_LUMA = 0.0885;
/** Four slabs across the image, each the 2 m the grout already uses. */
export const SLAB_TILE_M = 8;

/** A texel's share of the bed. The plate's own average is 1, so the street's mean does not move. */
export function stoneGain(luma: number, mean = SLAB_LUMA): number {
  if (!(mean > 0)) return 1;
  return luma / mean;
}

/** A stand-in the bed samples until the slab file arrives. Linear white, so the gain is 1. */
function whiteSlab(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Wet street: a planar reflection rendered at low resolution and smeared
 * vertically, mixed over a dark tiled base by a puddle mask, with cyan lane
 * lines living in the same shader so they reflect nothing and glow.
 *
 * ## What the reflection costs
 *
 * A `Reflector` renders the scene a second time from a mirrored camera, so every object it can see
 * costs two draw calls rather than one. Measured: about 94 visible objects produce ~210 calls, which
 * makes the mirror the largest single line in the render budget — larger than the dressing, the
 * crowd and the skyline put together, and the first place to look if that budget ever needs room.
 *
 * The control is already here and is `FAR_LAYER` (`client/render/renderer.ts`). The mirror camera
 * sees only layer 0; the main camera sees both. Anything moved to `FAR_LAYER` is drawn once — the
 * rain, the skyline, the sky and the traffic are, because the reflection is smeared over eleven
 * vertical taps and mixed under a puddle mask, so what survives of them is nothing a player could
 * name. What stays on layer 0 is what reads as *light*: the neon, the signage, the lit dressing.
 *
 * `probe/stage3.ts` is the guard on moving anything else: it measures neon share and cyan/magenta
 * dominance against statistics taken from the reference clip, so cutting too much fails the look
 * rather than quietly costing it.
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
      // White until the slab arrives, and a mean of 1, so those frames are the old bed.
      tAlbedo: { value: whiteSlab() },
      albedoMean: { value: 1 },
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
      uniform sampler2D tDiffuse; uniform sampler2D tAlbedo; uniform float albedoMean; uniform float time; uniform vec3 fogColor; uniform float fogDensity; uniform vec3 camPos; uniform float debug;
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
        // "The ground is very dark with a sheen" (docs/ART_BIBLE.md). It was not: measured at
        // 18.0% dark against the reference clip's 62%, and 3.11x the luma of the skyline behind it,
        // which made the street the brightest large surface in a game about a drowned city at
        // night. The hue ratio is kept; only the magnitude moves, so the sheen below is unchanged
        // and reads harder against a darker bed (Stage 657).
        vec3 base = vec3(0.024, 0.029, 0.041) * tone * (1.0 - grout * 0.6);
        // The slab's brightness, over its own average (Stage 736). One lookup on this
        // pass, no extra draw. The mean of the bed stays the tone above.
        vec3 alb = texture2D(tAlbedo, vWorld.xz / ${SLAB_TILE_M}.0).rgb;
        float lum = dot(alb, vec3(0.2126, 0.7152, 0.0722));
        // Full strength moved the measured street (tone mapping is not linear). 0.4 keeps the joints
        // and leaves the average on the Stage 657 bed.
        float stone = mix(1.0, lum / albedoMean, 0.4);
        base *= stone;
        // puddle mask
        float pud = smoothstep(0.35, 0.75, noise(vWorld.xz * 0.18 + vec2(3.1, 7.7)));
        // dry tarmac keeps less of the reflection and the puddles keep more, so the street
        // reads as a dark bed with bright smears on it rather than an evenly lit one
        float wet = 0.15 + 0.85 * pud;
        // fresnel-ish: more reflection at grazing angles
        vec3 v = normalize(camPos - vWorld);
        float fres = pow(1.0 - max(v.y, 0.0), 2.0);
        vec3 c = base + refl * wet * (0.25 + 0.75 * fres) * 0.95;
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
      // Objects on FAR_LAYER (rain, skyline, sky, traffic) are invisible to the mirror camera,
      // which only sees layer 0 — see the note above on what that is worth.
      (orig as (...a: unknown[]) => void).call(this, renderer, scene, camera, ...rest);
    })(r.onBeforeRender);
  // The slab and its mean land together. A slab divided by 1 would crush the bed.
  void assetTexture("tex_plaza_slab").then((tex) => {
    if (!tex || !mat.uniforms.tAlbedo || !mat.uniforms.albedoMean) return;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.uniforms.tAlbedo.value = tex;
    mat.uniforms.albedoMean.value = SLAB_LUMA;
  });
  return r;
}

/**
 * The wet floor without the second render pass (Stage 32).
 *
 * The `Reflector` above is the largest single line in the draw-call budget — Stage 22 measured it
 * as larger than the dressing, the crowd and the skyline together, because everything it can see is
 * drawn twice. A phone cannot afford that, and it is also the effect that survives being faked
 * best: the reflection is smeared over eleven vertical taps under a puddle mask, so what the player
 * reads is a wet sheen and the colour of the light above it, not a mirror image.
 *
 * So mobile gets the sheen and pays once: a dark plane tinted toward the district's fog, additive
 * so the neon above still bleeds into it.
 */
export function makeFlatWetFloor(width: number, depth: number, y: number, fogColor: THREE.Color): THREE.Mesh {
  const floorMat = new THREE.MeshBasicMaterial({ color: fogColor.clone().multiplyScalar(1.35), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  bindPlate(floorMat, "tex_wet_cobble");
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    floorMat,
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.name = "wetfloor-flat";
  return m;
}
