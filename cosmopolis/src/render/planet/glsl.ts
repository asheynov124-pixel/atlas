/**
 * OWNER: terrain.
 * Shared GLSL snippets for the planet surface shaders (terrain, water, clouds, atmosphere, aurora).
 */

/** Cheap hash-based value noise + helpers. Prefix `t` to avoid clashing with three's chunks. */
export const GLSL_NOISE = /* glsl */ `
float tHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float tNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = tHash13(i);
  float b = tHash13(i + vec3(1.0, 0.0, 0.0));
  float c = tHash13(i + vec3(0.0, 1.0, 0.0));
  float d = tHash13(i + vec3(1.0, 1.0, 0.0));
  float e = tHash13(i + vec3(0.0, 0.0, 1.0));
  float f1 = tHash13(i + vec3(1.0, 0.0, 1.0));
  float g = tHash13(i + vec3(0.0, 1.0, 1.0));
  float h = tHash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
}
vec3 tSrgb(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
ivec2 tUV(float id) {
  int t = int(id + 0.5);
  return ivec2(t & 255, t >> 8);
}
`;

/** Cloud coverage lookup shared by the cloud shell and the terrain/water cloud shadows. */
export const GLSL_CLOUDS = /* glsl */ `
uniform samplerCube uCloudCube;
uniform mat3 uCloudRotA;
uniform mat3 uCloudRotB;
uniform float uCloudCover;
uniform float uCloudStorm;
float tCloud(vec3 dir) {
  float a = texture(uCloudCube, uCloudRotA * dir).r;
  float b = texture(uCloudCube, uCloudRotB * dir).g;
  float n = a * 0.68 + b * 0.32;
  float lo = 0.8 - uCloudCover * 0.36 - uCloudStorm * 0.2;
  return smoothstep(lo, lo + 0.16, n);
}
`;

/**
 * Aerial-perspective haze for surface shaders (needs uAtmoColor, uAtmoDensity, uHazeNear, uHazeFar, uSunDir).
 * Thin near the camera (no fog wall at street level), strong on the limb seen from orbit, sunset-tinted at the
 * terminator and dark on the night side.
 */
export const GLSL_HAZE = /* glsl */ `
uniform vec3 uAtmoColor;
uniform float uAtmoDensity;
uniform float uHazeNear;
uniform float uHazeFar;
vec3 tHaze(vec3 col, vec3 wpos, vec3 up) {
  vec3 hv = wpos - cameraPosition;
  float hd = length(hv);
  float mu = clamp(dot(up, -hv / max(hd, 1e-4)), 0.0, 1.0);
  float sunUp = dot(up, uSunDir);
  float day = smoothstep(-0.28, 0.35, sunUp);
  float term = exp(-sunUp * sunUp * 26.0) * smoothstep(-0.4, 0.0, sunUp);
  float amt = uAtmoDensity * smoothstep(uHazeNear, uHazeFar, hd) * (0.02 + 0.6 * pow(1.0 - mu, 3.0));
  vec3 hc = uAtmoColor * (0.06 + 0.95 * day) + vec3(1.0, 0.5, 0.2) * term * 0.3;
  return mix(col, hc, clamp(amt, 0.0, 0.78));
}
`;

/** 3D simplex noise (Ashima / Ian McEwan, MIT) — used once to bake the cloud noise cube. */
export const GLSL_SIMPLEX = /* glsl */ `
vec4 sPermute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 sTaylor(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = sPermute(sPermute(sPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = sTaylor(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;
