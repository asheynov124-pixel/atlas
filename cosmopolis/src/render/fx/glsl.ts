/**
 * OWNER: god.
 * Shared GLSL snippets for the FX shaders (hash, value noise, fbm, rotation). Pure functions, no uniforms.
 */
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
