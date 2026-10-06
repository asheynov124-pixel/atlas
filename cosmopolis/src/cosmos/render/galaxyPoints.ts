/**
 * OWNER: cosmos.
 * Galaxy point clouds — deterministic star & dust distributions for each galaxy kind (spiral, barred, elliptical with
 * a dust brim, ring, irregular), shared by the galaxy view (≈ 45–65 k stars) and the universe view (≈ 8 k per disc).
 * One Points draw call for stars (additive, world-sized sprites) and one for dust lanes (alpha-blended, darkening).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Points, ShaderMaterial } from 'three';
import { Rng } from '../../core/rng';
import { armAngle, RING_RADIUS, type Galaxy } from '../Universe';
import { OUTPUT } from './glsl';

const VERT = /* glsl */ `
attribute float aSize;
attribute vec3 color;
uniform float uPR;
uniform float uK;
uniform float uMaxPx;
uniform float uAlpha;
varying vec3 vColor;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uK / max(0.001, -mv.z);
  vFade = clamp(px / 1.2, 0.15, 1.0);
  gl_PointSize = clamp(px, 1.2, uMaxPx) * uPR;
  vColor = color * uAlpha;
}
`;
const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vFade;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = exp(-r * r * 4.5) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(vColor * a * vFade, 1.0);
  ${OUTPUT}
}
`;
const DUST_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vFade;
uniform float uDust;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = exp(-r * r * 3.0) * (1.0 - smoothstep(0.8, 1.0, r));
  gl_FragColor = vec4(vColor, a * uDust);
  ${OUTPUT}
}
`;

export interface GalaxyCloud {
  stars: Points;
  dust: Points | null;
  dispose(): void;
}

function gauss(rng: Rng): number {
  // Box–Muller
  const u = Math.max(1e-6, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const HII = new Color(0xff6fa8);
const WHITE = new Color(0xffffff);
const OLD = new Color(0xffd6a0);

/**
 * Build the clouds. `R` = galaxy radius in world units, `count` = star points. `brightness` scales point colour
 * (smaller galaxies in the universe view are brighter per point).
 */
export function buildGalaxyCloud(g: Galaxy, seed: number, R: number, count: number, pixelRatio: number, opts: { dust?: boolean; brightness?: number; maxPx?: number } = {}): GalaxyCloud {
  const rng = new Rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const c0 = new Color(g.colors[0]);
  const c1 = new Color(g.colors[1]);
  const tmp = new Color();
  const bright = opts.brightness ?? 1;
  const dustPts: number[] = [];
  const s = R / 100;
  const put = (i: number, x: number, y: number, z: number, c: Color, lum: number, sz: number) => {
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    col[i * 3] = c.r * lum * bright;
    col[i * 3 + 1] = c.g * lum * bright;
    col[i * 3 + 2] = c.b * lum * bright;
    size[i] = sz * s;
  };
  const clumps: [number, number, number][] = [];
  if (g.kind === 'irregular') {
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(0.1, 0.65) * R;
      clumps.push([Math.cos(a) * r, rng.range(-0.08, 0.08) * R, Math.sin(a) * r * 0.75]);
    }
  }
  for (let i = 0; i < count; i++) {
    const u = rng.next();
    if (g.kind === 'spiral' || g.kind === 'barred') {
      if (u < 0.16) {
        // bulge
        const r = Math.abs(gauss(rng)) * 0.1 * R;
        const th = rng.range(0, Math.PI * 2);
        const ph = Math.acos(rng.range(-1, 1));
        let x = Math.sin(ph) * Math.cos(th) * r;
        const z = Math.sin(ph) * Math.sin(th) * r;
        if (g.kind === 'barred') x *= 1.8;
        tmp.copy(OLD).lerp(WHITE, rng.range(0, 0.5));
        put(i, x, Math.cos(ph) * r * 0.55, z, tmp, rng.range(0.5, 1.0), rng.range(0.5, 1.2));
      } else if (u < 0.22 && g.kind === 'barred') {
        // the bar
        const x = gauss(rng) * 0.2 * R;
        tmp.copy(OLD).lerp(c0, 0.5);
        put(i, x, gauss(rng) * 0.015 * R, gauss(rng) * 0.04 * R, tmp, rng.range(0.4, 0.8), rng.range(0.5, 1.1));
      } else if (u < 0.34) {
        // smooth disc between the arms
        const rn = Math.min(1.05, -Math.log(1 - rng.next() * 0.96) * 0.33);
        const th = rng.range(0, Math.PI * 2);
        tmp.copy(OLD).lerp(c0, 0.6);
        put(i, Math.cos(th) * rn * R, gauss(rng) * 0.02 * R, Math.sin(th) * rn * R, tmp, rng.range(0.12, 0.35), rng.range(0.5, 1.0));
      } else {
        const arm = Math.floor(rng.next() * Math.max(1, g.arms));
        const minR = g.kind === 'barred' ? 0.26 : 0.06;
        const rn = Math.min(1.05, minR + -Math.log(1 - rng.next() * 0.95) * 0.3);
        const spread = gauss(rng) * (0.2 + 0.18 * (1 - rn));
        const th = armAngle(g, rn, arm) + spread;
        const rr = rn * R + gauss(rng) * 0.025 * R;
        const close = Math.max(0, 1 - Math.abs(spread) * 4);
        const knot = rng.chance(0.03 * close);
        tmp.copy(OLD).lerp(c0, 0.4).lerp(c1, close * 0.85);
        if (knot) tmp.copy(HII);
        else if (close > 0.7 && rng.chance(0.25)) tmp.lerp(WHITE, 0.5);
        put(i, Math.cos(th) * rr, gauss(rng) * 0.018 * R * (1.2 - rn * 0.6), Math.sin(th) * rr, tmp, (0.25 + close * 0.75) * (knot ? 1.6 : 1) * rng.range(0.6, 1.1), knot ? rng.range(1.4, 2.4) : rng.range(0.5, 1.3));
        if (opts.dust && rng.chance(0.09) && rn > 0.12 && rn < 0.9) {
          const dth = armAngle(g, rn, arm) - 0.16 + gauss(rng) * 0.05;
          dustPts.push(Math.cos(dth) * rn * R, gauss(rng) * 0.006 * R, Math.sin(dth) * rn * R, rng.range(2.5, 5.5) * s);
        }
      }
    } else if (g.kind === 'elliptical') {
      if (u < 0.72) {
        // golden halo
        const r = Math.abs(gauss(rng)) * 0.3 * R;
        const th = rng.range(0, Math.PI * 2);
        const ph = Math.acos(rng.range(-1, 1));
        tmp.copy(c0).lerp(WHITE, Math.max(0, 0.6 - r / R));
        put(i, Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.62, Math.sin(ph) * Math.sin(th) * r, tmp, rng.range(0.3, 0.8) * (1.2 - r / R), rng.range(0.5, 1.3));
      } else {
        // the brim: a thin bright disc with a dark dust lane
        const rn = 0.42 + Math.abs(gauss(rng)) * 0.22;
        const th = rng.range(0, Math.PI * 2);
        tmp.copy(c1).lerp(WHITE, rng.range(0, 0.3));
        put(i, Math.cos(th) * rn * R, gauss(rng) * 0.01 * R, Math.sin(th) * rn * R, tmp, rng.range(0.3, 0.9), rng.range(0.5, 1.2));
        if (opts.dust && rng.chance(0.3)) {
          const dn = 0.6 + gauss(rng) * 0.035;
          const dth = rng.range(0, Math.PI * 2);
          dustPts.push(Math.cos(dth) * dn * R, gauss(rng) * 0.004 * R, Math.sin(dth) * dn * R, rng.range(2.5, 5) * s);
        }
      }
    } else if (g.kind === 'ring') {
      if (u < 0.14) {
        const r = Math.abs(gauss(rng)) * 0.07 * R;
        const th = rng.range(0, Math.PI * 2);
        const ph = Math.acos(rng.range(-1, 1));
        tmp.copy(c0).lerp(WHITE, 0.4);
        put(i, Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.7, Math.sin(ph) * Math.sin(th) * r, tmp, rng.range(0.5, 1.0), rng.range(0.5, 1.2));
      } else if (u < 0.22) {
        const rn = rng.range(0.1, 1.0);
        const th = rng.range(0, Math.PI * 2);
        tmp.copy(c0).lerp(c1, 0.5);
        put(i, Math.cos(th) * rn * R, gauss(rng) * 0.03 * R, Math.sin(th) * rn * R, tmp, 0.12, rng.range(0.5, 0.9));
      } else {
        const rn = RING_RADIUS + gauss(rng) * 0.055;
        const th = rng.range(0, Math.PI * 2);
        const wobble = Math.sin(th * 3) * 0.02;
        const knot = rng.chance(0.035);
        tmp.copy(c1).lerp(c0, rng.range(0, 0.35));
        if (knot) tmp.copy(HII).lerp(c0, 0.3);
        put(i, Math.cos(th) * (rn + wobble) * R, gauss(rng) * 0.02 * R, Math.sin(th) * (rn + wobble) * R, tmp, rng.range(0.4, 1.0) * (knot ? 1.5 : 1), knot ? rng.range(1.3, 2.2) : rng.range(0.5, 1.3));
        if (opts.dust && rng.chance(0.05)) dustPts.push(Math.cos(th) * (rn - 0.05) * R, 0, Math.sin(th) * (rn - 0.05) * R, rng.range(2, 4) * s);
      }
    } else {
      // irregular clumps
      if (u < 0.8 && clumps.length) {
        const c = clumps[Math.floor(rng.next() * clumps.length)];
        const sp = 0.13 * R;
        const knot = rng.chance(0.05);
        tmp.copy(c0).lerp(c1, rng.next());
        if (knot) tmp.copy(HII);
        put(i, c[0] + gauss(rng) * sp, c[1] + gauss(rng) * sp * 0.4, c[2] + gauss(rng) * sp, tmp, rng.range(0.3, 1.0) * (knot ? 1.5 : 1), knot ? rng.range(1.2, 2.2) : rng.range(0.5, 1.3));
        if (opts.dust && rng.chance(0.04)) dustPts.push(c[0] + gauss(rng) * sp, c[1], c[2] + gauss(rng) * sp, rng.range(2, 4.5) * s);
      } else {
        const rn = Math.sqrt(rng.next()) * 0.95;
        const th = rng.range(0, Math.PI * 2);
        tmp.copy(c0).lerp(WHITE, 0.3);
        put(i, Math.cos(th) * rn * R, gauss(rng) * 0.06 * R, Math.sin(th) * rn * R * 0.75, tmp, rng.range(0.1, 0.35), rng.range(0.4, 0.9));
      }
    }
  }
  const sg = new BufferGeometry();
  sg.setAttribute('position', new BufferAttribute(pos, 3));
  sg.setAttribute('color', new BufferAttribute(col, 3));
  sg.setAttribute('aSize', new BufferAttribute(size, 1));
  const uniforms = { uPR: { value: pixelRatio }, uK: { value: 900 }, uMaxPx: { value: opts.maxPx ?? 22 }, uAlpha: { value: 1 } };
  const sm = new ShaderMaterial({ vertexShader: VERT, fragmentShader: STAR_FRAG, uniforms, blending: AdditiveBlending, transparent: true, depthWrite: false });
  const stars = new Points(sg, sm);
  stars.frustumCulled = false;
  stars.renderOrder = 1;
  let dust: Points | null = null;
  if (dustPts.length) {
    const n = dustPts.length / 4;
    const dp = new Float32Array(n * 3);
    const dc = new Float32Array(n * 3);
    const ds = new Float32Array(n);
    const dcol = new Color(0x1a0f0a);
    for (let k = 0; k < n; k++) {
      dp[k * 3] = dustPts[k * 4];
      dp[k * 3 + 1] = dustPts[k * 4 + 1];
      dp[k * 3 + 2] = dustPts[k * 4 + 2];
      dc[k * 3] = dcol.r;
      dc[k * 3 + 1] = dcol.g;
      dc[k * 3 + 2] = dcol.b;
      ds[k] = dustPts[k * 4 + 3];
    }
    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(dp, 3));
    dg.setAttribute('color', new BufferAttribute(dc, 3));
    dg.setAttribute('aSize', new BufferAttribute(ds, 1));
    const dm = new ShaderMaterial({ vertexShader: VERT, fragmentShader: DUST_FRAG, uniforms: { ...uniforms, uMaxPx: { value: 60 }, uDust: { value: 0.42 } }, blending: NormalBlending, transparent: true, depthWrite: false });
    dust = new Points(dg, dm);
    dust.frustumCulled = false;
    dust.renderOrder = 2;
  }
  return {
    stars,
    dust,
    dispose() {
      sg.dispose();
      sm.dispose();
      if (dust) {
        dust.geometry.dispose();
        (dust.material as ShaderMaterial).dispose();
      }
    },
  };
}

/** Update the screen-scale constant (pixels per world unit at distance 1) after resizes / fov changes. */
export function setCloudScale(c: GalaxyCloud, viewHeight: number, fovDeg: number, pixelRatio: number): void {
  const k = viewHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  for (const p of [c.stars, c.dust]) {
    if (!p) continue;
    const u = (p.material as ShaderMaterial).uniforms;
    u.uK.value = k;
    u.uPR.value = pixelRatio;
  }
}
