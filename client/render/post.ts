import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Full-screen post chain: bloom → anamorphic streak → tone map → CRT
 * (film grain, chromatic aberration, scanlines, vignette). The canvas is
 * rendered below native resolution and upscaled nearest-neighbour by CSS for
 * the clip's chunky pixel read.
 */

const AnamorphicShader = {
  name: "AnamorphicStreak",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    texel: { value: new THREE.Vector2(1 / 768, 1 / 432) },
    threshold: { value: 0.85 },
    strength: { value: 0.3 },
    tint: { value: new THREE.Color(0.55, 0.9, 1.0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform float threshold; uniform float strength; uniform vec3 tint;
    varying vec2 vUv;
    vec3 bright(vec2 uv) { vec3 c = texture2D(tDiffuse, uv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return c * smoothstep(threshold, threshold + 0.6, l); }
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int i = -14; i <= 14; i++) {
        float fi = float(i); float w = 1.0 - abs(fi) / 15.0; w *= w;
        acc += bright(vUv + vec2(fi * texel.x * 5.0, 0.0)) * w; wsum += w;
      }
      gl_FragColor = vec4(base + (acc / wsum) * tint * strength, 1.0);
    }
  `,
};

const CrtShader = {
  name: "CRT",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(768, 432) },
    grain: { value: 0.07 },
    aberration: { value: 0.0016 },
    scanline: { value: 0.14 },
    vignette: { value: 0.42 },
    stutter: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float time; uniform vec2 resolution;
    uniform float grain; uniform float aberration; uniform float scanline; uniform float vignette; uniform float stutter;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // stutter: horizontal tear used by rituals (level-up, kill stamp)
      if (stutter > 0.0) {
        float band = step(0.5, hash(vec2(floor(uv.y * 40.0), floor(time * 30.0))));
        uv.x += (band * 2.0 - 1.0) * stutter * 0.03;
      }
      vec2 dir = uv - 0.5;
      float r2 = dot(dir, dir);
      vec2 ca = dir * aberration * (1.0 + r2 * 6.0);
      float r = texture2D(tDiffuse, uv + ca).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - ca).b;
      vec3 c = vec3(r, g, b);
      // scanlines on the internal pixel grid
      float line = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
      c *= 1.0 - scanline * (1.0 - line) ;
      // film grain, luminance-weighted so blacks stay black-ish but alive
      float n = hash(uv * resolution + fract(time) * 100.0) - 0.5;
      c += n * grain * (0.35 + 0.65 * dot(c, vec3(0.333)));
      // vignette
      c *= 1.0 - vignette * smoothstep(0.15, 0.75, r2);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class PostChain {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private streak: ShaderPass;
  private crt: ShaderPass;
  /** Internal render scale relative to CSS pixels (nearest-neighbour upscaled). */
  readonly scale: number;
  private stutter = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, scale = 0.6) {
    this.scale = scale;
    const w = Math.max(160, Math.round(width * scale));
    const h = Math.max(90, Math.round(height * scale));
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.35, 0.72);
    this.composer.addPass(this.bloom);
    this.streak = new ShaderPass(AnamorphicShader);
    this.streak.uniforms.texel!.value.set(1 / w, 1 / h);
    this.composer.addPass(this.streak);
    this.composer.addPass(new OutputPass());
    this.crt = new ShaderPass(CrtShader);
    this.crt.uniforms.resolution!.value.set(w, h);
    this.crtBase = { grain: this.crt.uniforms.grain!.value as number, aberration: this.crt.uniforms.aberration!.value as number, scanline: this.crt.uniforms.scanline!.value as number, vignette: this.crt.uniforms.vignette!.value as number };
    this.crt.renderToScreen = true;
    this.composer.addPass(this.crt);
  }

  private crtBase = { grain: 0.07, aberration: 0.0016, scanline: 0.14, vignette: 0.42 };
  /** The CRT setting: 0 is a clean image, 1 the look as shipped, 1.5 heavier grain, aberration, scanlines and vignette. */
  setCrt(k: number): void {
    const c = Math.max(0, Math.min(1.5, k));
    this.crt.uniforms.grain!.value = this.crtBase.grain * c;
    this.crt.uniforms.aberration!.value = this.crtBase.aberration * c;
    this.crt.uniforms.scanline!.value = this.crtBase.scanline * c;
    this.crt.uniforms.vignette!.value = this.crtBase.vignette * Math.min(1, c);
  }
  crtLevel(): { grain: number; aberration: number; scanline: number; vignette: number } {
    return { grain: this.crt.uniforms.grain!.value as number, aberration: this.crt.uniforms.aberration!.value as number, scanline: this.crt.uniforms.scanline!.value as number, vignette: this.crt.uniforms.vignette!.value as number };
  }

  resize(renderer: THREE.WebGLRenderer, width: number, height: number): void {
    const w = Math.max(160, Math.round(width * this.scale));
    const h = Math.max(90, Math.round(height * this.scale));
    renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.streak.uniforms.texel!.value.set(1 / w, 1 / h);
    this.crt.uniforms.resolution!.value.set(w, h);
  }

  /** Kick the CRT: a brief horizontal tear (rituals, kill confirm). */
  kick(amount = 1): void {
    this.stutter = Math.max(this.stutter, amount);
  }

  render(time: number, dt: number): void {
    this.stutter = Math.max(0, this.stutter - dt * 6);
    this.crt.uniforms.time!.value = time;
    this.crt.uniforms.stutter!.value = this.stutter;
    this.composer.render(dt);
  }
}
