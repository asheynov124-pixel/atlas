/**
 * OWNER: ui-core.
 * Canvas2D painters for the menus: starfield layers, the hero ringed homeworld (continents, clouds, city lights on
 * the night side, atmosphere, rings) and small archetype planet portraits for the new-game picker.
 * Heavy per-pixel work is chunked across animation frames so the UI never hitches; results are cached.
 */
import { Noise3, Rng } from '../../../core/rng';
import type { PlanetTypeId } from '../../../core/types';
import { PLANET_TYPES } from '../../../content/planetTypes';

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sat = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, v: number) => {
  const t = sat((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ───────────────────────────────────────────── stars
export interface StarLayerOpts {
  count: number;
  minR: number;
  maxR: number;
  seed: number;
  /** fraction of stars with a soft glow */
  glow?: number;
  alpha?: number;
}

/** Paint a transparent star layer (CSS pixel size w×h, device ratio dpr). */
export function paintStars(canvas: HTMLCanvasElement, w: number, h: number, dpr: number, o: StarLayerOpts): void {
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const rng = new Rng(o.seed);
  const tints = ['#ffffff', '#cfe4ff', '#ffe9c9', '#bcd6ff', '#ffd6e8', '#d8ccff'];
  for (let i = 0; i < o.count; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const r = mix(o.minR, o.maxR, Math.pow(rng.next(), 2.4));
    const a = (o.alpha ?? 1) * mix(0.35, 1, rng.next());
    const tint = tints[Math.floor(rng.next() * tints.length)];
    ctx.globalAlpha = a;
    ctx.fillStyle = tint;
    if (rng.next() < (o.glow ?? 0)) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      g.addColorStop(0, tint);
      g.addColorStop(0.18, tint);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
      // diffraction spikes on the brightest
      if (r > o.maxR * 0.7) {
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = tint;
        ctx.fillRect(x - r * 7, y - 0.35, r * 14, 0.7);
        ctx.fillRect(x - 0.35, y - r * 7, 0.7, r * 14);
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ───────────────────────────────────────────── planets
export interface PlanetArtOpts {
  type: PlanetTypeId;
  seed: number;
  /** canvas pixel size (square) */
  size: number;
  /** draw rings (hero) */
  rings?: boolean;
  /** night-side city lights */
  cityLights?: boolean;
  /** light direction (screen space, x right, y down, z toward viewer) */
  light?: [number, number, number];
  /** fraction of the canvas used by the planet disc radius (rings need room) */
  discFrac?: number;
  /** rows per animation frame (0 = synchronous) */
  rowsPerFrame?: number;
}

interface Pal {
  ocean: [number, number, number];
  oceanDeep: [number, number, number];
  shore: [number, number, number];
  low: [number, number, number];
  land: [number, number, number];
  high: [number, number, number];
  snow: [number, number, number];
  atmo: [number, number, number];
  hasOcean: boolean;
  coverage: number;
  lava: boolean;
  cloud: number;
  polar: boolean;
}

function palette(type: PlanetTypeId): Pal {
  const a = PLANET_TYPES[type] ?? PLANET_TYPES.terran;
  const oc = rgb(a.oceanColor);
  return {
    ocean: oc,
    oceanDeep: [oc[0] * 0.35, oc[1] * 0.4, oc[2] * 0.55],
    shore: rgb(a.palette.shore),
    low: rgb(a.palette.lowland),
    land: rgb(a.palette.land),
    high: rgb(a.palette.highland),
    snow: rgb(a.palette.snow),
    atmo: rgb(a.atmosphere.color),
    hasOcean: a.hasOcean,
    coverage: a.hasOcean ? a.oceanCoverage : 0,
    lava: type === 'volcanic',
    cloud: a.cloudCover,
    polar: type !== 'volcanic' && type !== 'machine' && type !== 'toxic',
  };
}

const cache = new Map<string, string>();

/**
 * Paint a planet into `canvas` (square `size`). Two phases, both chunked across frames when rowsPerFrame > 0:
 *   A) equirectangular maps (height with domain-warped continents, clouds, night lights, lava) — noise lives here;
 *   B) per-pixel sphere shading that samples the maps bilinearly (cheap), plus lighting, glint, rim and clouds.
 */
export function paintPlanet(canvas: HTMLCanvasElement, o: PlanetArtOpts): Promise<void> {
  const S = Math.max(16, Math.round(o.size));
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve();
  const P = palette(o.type);
  const noise = new Noise3(o.seed);
  const rng = new Rng(o.seed ^ 0x5bd1e995);
  const discFrac = o.discFrac ?? 0.46;
  const R = S * discFrac;
  const cx = S / 2, cy = S / 2;
  const L = o.light ?? [-0.55, -0.42, 0.72];
  const ll = Math.hypot(L[0], L[1], L[2]);
  const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const spin = rng.range(0, Math.PI * 2);
  const tilt = 0.38;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const thresh = P.hasOcean ? mix(-0.2, 0.26, P.coverage) : -2;
  const rowsPerFrame = o.rowsPerFrame ?? 0;

  // ── phase A: maps
  const MW = Math.max(96, Math.min(512, Math.round((Math.PI * 2 * R) / 2.4)));
  const MH = MW >> 1;
  const mapH = new Float32Array(MW * MH);
  const mapC = new Float32Array(MW * MH);
  const mapN = new Float32Array(MW * MH);
  const mapM = new Float32Array(MW * MH);
  const mapRow = (j: number) => {
    const lat = ((j + 0.5) / MH - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < MW; i++) {
      const lon = ((i + 0.5) / MW) * Math.PI * 2;
      const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      const wx = noise.fbm(x * 1.6 + 3.1, y * 1.6, z * 1.6, 2) * 0.45;
      const wy = noise.fbm(x * 1.6, y * 1.6 + 7.7, z * 1.6, 2) * 0.45;
      let h = noise.fbm(x * 1.05 + wx, y * 1.05 + wy, z * 1.05, 4, 2.05, 0.5);
      h += 0.22 * noise.noise(x * 0.5 + 9, y * 0.5, z * 0.5);
      const k = j * MW + i;
      mapH[k] = h;
      mapC[k] = noise.fbm(x * 2.4 + 11 + wx, y * 4.2, z * 2.4 + wy, 3, 2.2, 0.55);
      mapM[k] = noise.noise(x * 3.1 + 5, y * 3.1, z * 3.1);
      if (o.cityLights && h > thresh) mapN[k] = sstep(0.42, 0.78, noise.noise(x * 26, y * 26, z * 26)) * sstep(0.05, 0.35, wx + wy + 0.2);
      else if (P.lava) mapN[k] = Math.pow(sat((1 - Math.abs(noise.noise(x * 4.5, y * 4.5, z * 4.5)) - 0.84) * 7), 2);
    }
  };
  const sample = (m: Float32Array, u: number, v: number) => {
    const fx = u * MW - 0.5, fy = Math.min(MH - 1.001, Math.max(0, v * MH - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const xa = ((x0 % MW) + MW) % MW, xb = (xa + 1) % MW;
    const r0 = y0 * MW, r1 = Math.min(MH - 1, y0 + 1) * MW;
    const a = m[r0 + xa] + (m[r0 + xb] - m[r0 + xa]) * tx;
    const b = m[r1 + xa] + (m[r1 + xb] - m[r1 + xa]) * tx;
    return a + (b - a) * ty;
  };

  // ── phase B: shading
  const rowFn = (y: number) => {
    for (let x = 0; x < S; x++) {
      const px = (x + 0.5 - cx) / R;
      const py = (y + 0.5 - cy) / R;
      const r2 = px * px + py * py;
      if (r2 > 1.0) continue;
      const i = (y * S + x) * 4;
      const pz = Math.sqrt(1 - r2);
      const edge = sat((1 - Math.sqrt(r2)) * R * 1.2);
      // texture direction: tilt around the view x axis (screen y is down)
      const ty = -py * ct + pz * st;
      const tz = py * st + pz * ct;
      const lat = Math.asin(Math.max(-1, Math.min(1, ty)));
      let lon = Math.atan2(tz, px) + spin;
      lon = lon / (Math.PI * 2);
      lon -= Math.floor(lon);
      const v = lat / Math.PI + 0.5;
      const h = sample(mapH, lon, v);
      let cr: number, cg: number, cb: number;
      // anti-aliased coastline: blend water and land across a band about one pixel wide
      const band = 1.6 / (R * 2.2);
      const landF = P.hasOcean ? sstep(thresh - band, thresh + band, h) : 1;
      const isWater = landF < 0.5;
      const depth = sat((thresh - h) * 4);
      const wr = mix(P.ocean[0], P.oceanDeep[0], depth), wg = mix(P.ocean[1], P.oceanDeep[1], depth), wb = mix(P.ocean[2], P.oceanDeep[2], depth);
      {
        const e = sat((h - thresh) * 1.5);
        const moist = sample(mapM, lon, v) * 0.5 + 0.5;
        const t1 = sstep(0.0, 0.05, e);
        const t2 = sstep(0.42, 0.85, e + (0.5 - moist) * 0.25);
        const t3 = sstep(0.06, 0.4, e) * (0.35 + 0.65 * moist);
        cr = mix(mix(P.shore[0], P.low[0], t1), mix(P.land[0], P.high[0], t2), t3);
        cg = mix(mix(P.shore[1], P.low[1], t1), mix(P.land[1], P.high[1], t2), t3);
        cb = mix(mix(P.shore[2], P.low[2], t1), mix(P.land[2], P.high[2], t2), t3);
      }
      cr = mix(wr, cr, landF);
      cg = mix(wg, cg, landF);
      cb = mix(wb, cb, landF);
      const alat = Math.abs(ty);
      if (P.polar) {
        const ice = sstep(0.9, 0.95, alat + (h - thresh) * 0.06);
        cr = mix(cr, P.snow[0], ice);
        cg = mix(cg, P.snow[1], ice);
        cb = mix(cb, P.snow[2], ice);
      }
      const nl = px * lx + py * ly + pz * lz;
      const diff = sat(nl * 1.05 + 0.04);
      const day = sstep(-0.1, 0.25, nl);
      let lr = cr * (0.04 + diff), lg = cg * (0.04 + diff), lb = cb * (0.06 + diff);
      if (landF < 1) {
        const hz = lz + 1;
        const hl = Math.hypot(lx, ly, hz);
        const spec = Math.pow(sat((px * lx + py * ly + pz * hz) / hl), 70) * 0.85 * day * (1 - landF);
        lr += 255 * spec;
        lg += 245 * spec;
        lb += 230 * spec;
      }
      const glow = mapN.length ? sample(mapN, lon, v) : 0;
      if (P.lava && glow > 0) {
        const g = glow * (h < thresh + 0.25 ? 1 : 0.5);
        lr += 255 * g;
        lg += 95 * g;
        lb += 20 * g;
      } else if (o.cityLights && !isWater && glow > 0) {
        const g = glow * (1 - day) * 1.3;
        lr += 255 * g;
        lg += 188 * g;
        lb += 105 * g;
      }
      const cn = sample(mapC, lon, v);
      const cloud = sstep(0.2 - P.cloud * 0.32, 0.6 - P.cloud * 0.3, cn) * 0.82;
      const cl2 = 238 * (0.03 + diff);
      lr = mix(lr, cl2, cloud);
      lg = mix(lg, cl2, cloud);
      lb = mix(lb, cl2 * 1.04, cloud);
      const fres = Math.pow(1 - pz, 2.6) * sat(nl + 0.4);
      lr = mix(lr, P.atmo[0] * 1.1, fres * 0.8);
      lg = mix(lg, P.atmo[1] * 1.1, fres * 0.8);
      lb = mix(lb, P.atmo[2] * 1.1, fres * 0.8);
      d[i] = lr > 255 ? 255 : lr;
      d[i + 1] = lg > 255 ? 255 : lg;
      d[i + 2] = lb > 255 ? 255 : lb;
      d[i + 3] = 255 * edge;
    }
  };

  const finish = () => {
    // compose: rings back → atmosphere halo → planet → rings front
    const tmp = document.createElement('canvas');
    tmp.width = S;
    tmp.height = S;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, S, S);
    const ringTilt = -0.36;
    const ringSeed = o.seed * 7 + 3;
    if (o.rings) drawRings(ctx, cx, cy, R, ringTilt, 'back', ringSeed);
    const hx = cx + lx * R * 0.06, hy = cy + ly * R * 0.06;
    const halo = ctx.createRadialGradient(hx, hy, R * 0.9, hx, hy, R * 1.25);
    halo.addColorStop(0, `rgba(${P.atmo[0]},${P.atmo[1]},${P.atmo[2]},0.5)`);
    halo.addColorStop(0.3, `rgba(${P.atmo[0]},${P.atmo[1]},${P.atmo[2]},0.15)`);
    halo.addColorStop(1, `rgba(${P.atmo[0]},${P.atmo[1]},${P.atmo[2]},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(hx, hy, R * 1.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(tmp, 0, 0);
    if (o.rings) drawRings(ctx, cx, cy, R, ringTilt, 'front', ringSeed);
  };

  if (!rowsPerFrame) {
    for (let j = 0; j < MH; j++) mapRow(j);
    for (let y = 0; y < S; y++) rowFn(y);
    finish();
    return Promise.resolve();
  }
  // shading rows are ~10× cheaper than map rows
  const mapRows = Math.max(2, Math.round(rowsPerFrame / 3));
  return new Promise((resolve) => {
    let j = 0;
    let y = Math.max(0, Math.floor(cy - R - 2));
    const yEnd = Math.min(S, Math.ceil(cy + R + 2));
    const step = () => {
      if (j < MH) {
        const end = Math.min(MH, j + mapRows);
        for (; j < end; j++) mapRow(j);
      } else {
        const end = Math.min(yEnd, y + rowsPerFrame * 2);
        for (; y < end; y++) rowFn(y);
      }
      if (j >= MH && y >= yEnd) {
        finish();
        resolve();
      } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function drawRings(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, tilt: number, half: 'back' | 'front', seed: number): void {
  const rng = new Rng(seed);
  const inner = R * 1.32, outer = R * 2.05;
  const squash = 0.22;
  const bands = 46;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.scale(1, squash);
  // back half = upper part of the ellipse (behind the planet), front = lower part
  const a0 = half === 'back' ? Math.PI : 0;
  const a1 = half === 'back' ? Math.PI * 2 : Math.PI;
  for (let b = 0; b < bands; b++) {
    const t = b / bands;
    const r = mix(inner, outer, t);
    const density = (0.25 + 0.75 * Math.pow(Math.sin(t * Math.PI), 0.6)) * (0.45 + 0.55 * rng.next());
    const gap = Math.abs(t - 0.62) < 0.025 || Math.abs(t - 0.3) < 0.012 ? 0.08 : 1; // Cassini-style gaps
    const a = density * gap * 0.55;
    const warm = 0.5 + 0.5 * Math.sin(t * 9 + 1.3);
    ctx.strokeStyle = `rgba(${Math.round(mix(170, 250, warm))},${Math.round(mix(205, 224, warm))},${Math.round(mix(255, 186, warm))},${(a * 1.25).toFixed(3)})`;
    ctx.lineWidth = ((outer - inner) / bands) * 1.15;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.stroke();
  }
  ctx.restore();
}

/** Cached small planet portrait as a data URL (paints synchronously on first use). */
export function planetPortrait(type: PlanetTypeId, size = 160, seed = 7): string {
  const key = `${type}|${size}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  void paintPlanet(c, { type, seed: seed + type.length * 31, size, discFrac: 0.4, light: [-0.6, -0.45, 0.68] });
  let url = '';
  try {
    url = c.toDataURL('image/png');
  } catch {
    url = '';
  }
  cache.set(key, url);
  return url;
}

/**
 * Paint portraits one at a time (warm the cache) and call back as each finishes. `gapMs` spaces them out so the
 * main thread stays responsive (use a larger gap when warming in the background).
 */
export function warmPortraits(types: PlanetTypeId[], size: number, onEach: () => void, gapMs = 0): () => void {
  let cancelled = false;
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const step = () => {
    while (i < types.length && hasPortrait(types[i], size)) i++;
    if (cancelled || i >= types.length) return;
    planetPortrait(types[i++], size);
    onEach();
    if (gapMs > 0) timer = setTimeout(() => requestAnimationFrame(step), gapMs);
    else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

export function hasPortrait(type: PlanetTypeId, size = 160, seed = 7): boolean {
  return cache.has(`${type}|${size}|${seed}`);
}
