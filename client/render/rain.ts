import * as THREE from "three";

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
        fogColor: { value: new THREE.Color(0x05070c) },
        fogDensity: { value: 0.02 },
      },
      vertexShader: /* glsl */ `
        uniform float time; uniform vec3 camPos; uniform vec3 size;
        attribute float seed;
        varying float vFade;
        void main() {
          vec3 p = position;
          float speed = 9.0 + seed * 6.0;
          p.y = mod(p.y - time * speed, size.y);
          p.x = mod(p.x + time * 1.2 + seed * 3.0, size.x);
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

  update(time: number, camera: THREE.Camera): void {
    this.mat.uniforms.time!.value = time;
    (this.mat.uniforms.camPos!.value as THREE.Vector3).copy(camera.position);
  }
}
