/**
 * OWNER: god.
 * Shared GLSL snippets for the FX shaders (hash, value noise, fbm, rotation) + a baked tileable fbm texture
 * (FX_TEXNOISE / fxNoiseUniform) for fill-rate heavy effects (particles, shells) — one tap instead of ~16 hashes.
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';
export const FX_NOISE = /* glsl */ `
float fxHash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float fxHash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fxHash31(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float fxNoise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash21(i), fxHash21(i + vec2(1.0, 0.0)), u.x), mix(fxHash21(i + vec2(0.0, 1.0)), fxHash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fxNoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = fxHash31(i), b = fxHash31(i + vec3(1, 0, 0)), c = fxHash31(i + vec3(0, 1, 0)), d = fxHash31(i + vec3(1, 1, 0));
  float e = fxHash31(i + vec3(0, 0, 1)), f1 = fxHash31(i + vec3(1, 0, 1)), g = fxHash31(i + vec3(0, 1, 1)), h = fxHash31(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
float fxFbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * fxNoise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float fxFbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * fxNoise3(p); p = p * 2.03 + vec3(1.7, 9.2, 4.1); a *= 0.5; } return s; }
mat2 fxRot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 fxBlackbody(float t) {
  // 0 = dull red ember … 1 = white-hot
  t = clamp(t, 0.0, 1.0);
  return vec3(1.0, 0.18, 0.02) * smoothstep(0.0, 0.35, t) + vec3(0.0, 0.55, 0.12) * smoothstep(0.25, 0.7, t) + vec3(0.0, 0.25, 0.75) * smoothstep(0.6, 1.0, t);
}
`;

/** Night factor for FX living on the planet (dims smoke / dust on the dark side). Needs uSunDir (shared). */
export const FX_NIGHT = /* glsl */ `
float fxNight(vec3 wpos) { return smoothstep(0.12, -0.25, dot(normalize(wpos), uSunDir)); }
`;

// ───────────────────────────────────────────────────────────── baked noise (cheap fbm for fill-heavy FX)


let noiseTex: DataTexture | null = null;

/**
 * A 128² tileable fbm texture (R, G, B = three decorrelated fbm fields, base lattice 8 cells across, 4 octaves).
 * Sampling it costs one texture tap instead of ~16 hashes — used by particles and shells that cover the screen.
 */
export function fxNoiseTexture(): DataTexture {
  if (noiseTex) return noiseTex;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const lattice = (seed: number, cells: number) => {
    const v = new Float32Array(cells * cells);
    let s = seed >>> 0;
    for (let i = 0; i < v.length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      v[i] = (s >>> 0) / 4294967296;
    }
    return v;
  };
  const sample = (v: Float32Array, cells: number, x: number, y: number) => {
    const fx = x * cells, fy = y * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
    const at = (a: number, b: number) => v[(((b % cells) + cells) % cells) * cells + (((a % cells) + cells) % cells)];
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let ch = 0; ch < 3; ch++) {
    const octaves = [8, 16, 32, 64].map((c, i) => ({ c, v: lattice(0x9e3779b9 ^ (ch * 7919 + i * 104729), c), a: 0.5 / Math.pow(2, i) }));
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let s = 0;
        for (const o of octaves) s += o.a * sample(o.v, o.c, x / N, y / N);
        data[(y * N + x) * 4 + ch] = Math.max(0, Math.min(255, Math.round((s / 0.9375) * 255)));
      }
  }
  for (let i = 0; i < N * N; i++) data[i * 4 + 3] = 255;
  noiseTex = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType);
  noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping;
  noiseTex.magFilter = LinearFilter;
  noiseTex.minFilter = LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  noiseTex.name = 'fx-noise';
  return noiseTex;
}

/** Shared uniform for the baked noise. */
export const fxNoiseUniform = { get value() { return fxNoiseTexture(); } };

/**
 * Texture-based fbm (needs `uniform sampler2D uFxNoise;` — FX_TEXNOISE declares it). Inputs are in the same
 * units as fxFbm2 / fxFbm3 (1 = one lattice cell), output ≈ 0..1.
 */
export const FX_TEXNOISE = /* glsl */ `
uniform sampler2D uFxNoise;
float fxTFbm2(vec2 p) { return texture2D(uFxNoise, p * 0.125).r; }
float fxTFbm2b(vec2 p) { return texture2D(uFxNoise, p * 0.125).g; }
float fxTFbm3(vec3 p) {
  return (texture2D(uFxNoise, p.xy * 0.125).r + texture2D(uFxNoise, p.yz * 0.125 + 0.31).g + texture2D(uFxNoise, p.zx * 0.125 + 0.67).b) * 0.3333;
}
`;
