/**
 * OWNER: cosmos.
 * planetArt — tiny software-rendered planet portraits (Canvas 2D, no WebGL context) for info cards, the colonies
 * list and the live Planet Forge preview: noise continents with the world's real palette, oceans, ice caps, clouds,
 * lava, city lights on colonies, gas-giant bands, atmosphere rim and rings. Results are cached as data URLs.
 */
import type { PlanetSpec } from '../../core/types';
import { Noise3, hashString } from '../../core/rng';
import { PLANET_TYPES } from '../../content/planetTypes';
import { surfacePalette, type Rgb } from '../../render/planet/palette';

export interface ArtOptions {
  /** CSS pixel size of the square image */
  size: number;
  giant?: { colors: [number, number, number]; storm: boolean; ice: boolean };
  locked?: boolean;
  lights?: boolean;
  /** draw rings if the spec has them (default true) */
  rings?: boolean;
  /** pixel ratio (default min(2, devicePixelRatio)) */
  dpr?: number;
  /** night-side fraction 0..1 (light direction) */
  phase?: number;
}

const cache = new Map<string, string>();

function hex(c: number): Rgb {
  return { r: ((c >> 16) & 255) / 255, g: ((c >> 8) & 255) / 255, b: (c & 255) / 255 };
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const sstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Render (or fetch) a planet portrait as a data URL. Returns '' when canvas is unavailable. */
export function planetArt(spec: PlanetSpec, o: ArtOptions): string {
  const dpr = o.dpr ?? Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const key = JSON.stringify([spec.id, spec.seed, spec.type, spec.oceanLevel, spec.mountains, spec.temperature, spec.cloudCover, spec.oceanColor, spec.atmosphere, spec.rings, spec.palette, spec.hasOcean, o.size, dpr, !!o.giant, o.giant?.colors, !!o.locked, !!o.lights, o.rings !== false, o.phase ?? 0]);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const url = render(spec, o, dpr);
  if (cache.size > 160) cache.clear();
  cache.set(key, url);
  return url;
}

function render(spec: PlanetSpec, o: ArtOptions, dpr: number): string {
  if (typeof document === 'undefined') return '';
  const S = Math.max(16, Math.round(o.size * dpr));
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const rings = o.rings !== false && !!spec.rings;
  const R = S * (rings ? 0.29 : 0.4);
  const cx = S / 2, cy = S / 2;
  const arch = PLANET_TYPES[spec.type] ?? PLANET_TYPES.terran;
  const pal = surfacePalette(spec);
  const ocean = hex(spec.oceanColor);
  const atmo = hex(spec.atmosphere.color);
  const seed = hashString(spec.id + ':' + spec.seed);
  const n = new Noise3(seed);
  const cover = spec.hasOcean ? Math.max(0, Math.min(0.95, arch.oceanCoverage + spec.oceanLevel * 0.35)) : 0;
  const sea = spec.hasOcean ? -0.42 + cover * 0.84 : -9;
  const ice = spec.temperature < -20 ? 0.55 : spec.temperature < 0 ? 0.32 : spec.temperature < 25 ? 0.16 : spec.temperature < 60 ? 0.06 : 0;
  const lava = spec.type === 'volcanic';
  const g = o.giant;
  const g0 = g ? hex(g.colors[0]) : pal.land, g1 = g ? hex(g.colors[1]) : pal.land, g2 = g ? hex(g.colors[2]) : pal.land;
  const ph = o.phase ?? 0;
  const L = norm(-0.62 + ph * 0.9, 0.42, 0.66 - ph * 0.5);
  const tilt = spec.axialTilt * 0.6;
  const ct = Math.cos(tilt), st = Math.sin(tilt);

  // rings behind the planet
  if (rings) drawRings(ctx, spec, cx, cy, R, 'back', o.locked);

  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const r2 = R * R;
  for (let py = Math.floor(cy - R); py <= Math.ceil(cy + R); py++) {
    for (let px = Math.floor(cx - R); px <= Math.ceil(cx + R); px++) {
      const dx = (px + 0.5 - cx) / R, dy = (py + 0.5 - cy) / R;
      const dd = dx * dx + dy * dy;
      if (dd > 1) continue;
      const nz = Math.sqrt(1 - dd);
      // screen normal → object space (tilted)
      const ox = dx * ct - -dy * st;
      const oy = dx * st + -dy * ct;
      const oz = nz;
      const ndl = dx * L[0] + -dy * L[1] + nz * L[2];
      let col: Rgb;
      let spec_ = 0;
      let land = 0;
      let cloud = 0;
      let emis = 0;
      if (g) {
        const turb = n.fbm(ox * 2, oy * 9, oz * 2, 3);
        const b = oy * 7.5 + turb * 1.1;
        const band = 0.5 + 0.5 * Math.sin(b * 2.3);
        const band2 = 0.5 + 0.5 * Math.sin(b * 5.1 + 1.7);
        col = mix(mix(g0, g1, band), g2, band2 * band2 * 0.45);
        if (g.storm) {
          const sx = ox - 0.55, sy = (oy + 0.3) * 1.9, sz = oz - 0.7;
          const sd = Math.sqrt(sx * sx + sy * sy + sz * sz);
          const storm = sstep(0.3, 0, sd);
          col = mix(col, { r: g1.r * 1.15, g: g1.g * 0.72, b: g1.b * 0.6 }, storm * 0.8);
        }
      } else {
        const x = ox * 1.55 + 3.1, y = oy * 1.55 - 1.7, z = oz * 1.55 + 0.6;
        const h = n.fbm(x, y, z, 4) + spec.mountains * 0.32 * (n.ridged(x * 2.3, y * 2.3, z * 2.3, 2) - 0.45);
        if (h < sea) {
          const depth = Math.max(0, Math.min(1, (sea - h) * 2.6));
          col = mix({ r: ocean.r * 1.35 + 0.03, g: ocean.g * 1.35 + 0.06, b: ocean.b * 1.35 + 0.06 }, { r: ocean.r * 0.5, g: ocean.g * 0.5, b: ocean.b * 0.5 }, depth);
          spec_ = 1;
        } else {
          land = 1;
          const t = Math.max(0, Math.min(1, (h - sea) / Math.max(0.05, 0.9 - sea)));
          col = mix(pal.shore, pal.lowland, sstep(0, 0.06, t));
          col = mix(col, pal.land, sstep(0.08, 0.35, t));
          col = mix(col, pal.highland, sstep(0.45, 0.8, t));
          if (lava) {
            const crack = sstep(0.82, 0.97, 1 - Math.abs(n.noise(x * 3.2, y * 3.2, z * 3.2)));
            const lv = crack * (1 - sstep(0.1, 0.5, t));
            col = mix(col, { r: 0.25, g: 0.08, b: 0.02 }, lv);
            emis = lv;
          }
        }
        const cap = sstep(1 - ice - 0.05, 1 - ice + 0.03, Math.abs(oy) + 0.07 * n.noise(x * 3, y * 3, z * 3));
        col = mix(col, pal.snow, cap);
        if (spec.cloudCover > 0.01) {
          cloud = sstep(0.12, 0.62, n.fbm(x * 2.1 + 9, y * 2.1, z * 2.1, 3) * 0.5 + 0.5 - (1 - spec.cloudCover) * 0.55);
          col = mix(col, { r: 0.96, g: 0.97, b: 1 }, cloud * 0.85);
        }
        if (o.lights && land && ndl < 0.06) {
          const c1 = sstep(0.42, 0.82, n.noise(x * 7, y * 7, z * 7) * 0.5 + 0.5);
          const night = sstep(0.06, -0.22, ndl);
          emis += c1 * night * (1 - cloud * 0.7) * 1.2;
        }
      }
      const diff = Math.max(0, Math.min(1, ndl * 0.95 + 0.08));
      const term = sstep(-0.12, 0.35, ndl);
      const lightK = diff * 1.15 * (0.55 + 0.45 * term) + 0.02;
      let r = col.r * lightK, gg = col.g * lightK, b = col.b * lightK;
      if (spec_) {
        // sun glint
        const hx = L[0], hy = L[1], hz = L[2] + 1;
        const hl = Math.hypot(hx, hy, hz);
        const nh = Math.max(0, (dx * hx + -dy * hy + nz * hz) / hl);
        const s = Math.pow(nh, 50) * 0.8 * (1 - cloud);
        r += s;
        gg += s;
        b += s;
      }
      if (emis > 0) {
        r += emis * (lava ? 1.0 : 1.0);
        gg += emis * (lava ? 0.34 : 0.68);
        b += emis * (lava ? 0.06 : 0.32);
      }
      // atmosphere rim
      const fres = Math.pow(1 - nz, 2.6) * Math.min(1.2, spec.atmosphere.density * 0.9 + 0.1) * (g ? 0.5 : 1);
      const rim = fres * sstep(-0.35, 0.45, ndl) * 1.1;
      r += atmo.r * rim;
      gg += atmo.g * rim;
      b += atmo.b * rim;
      if (o.locked) {
        const y = r * 0.299 + gg * 0.587 + b * 0.114;
        r = r * 0.22 + y * 0.78 * 0.5;
        gg = gg * 0.22 + y * 0.78 * 0.53;
        b = b * 0.22 + y * 0.78 * 0.6;
      }
      // soft filmic curve so highlights roll off like the 3D views
      const tm = (v: number) => Math.pow(v / (1 + v * 0.6), 1 / 1.25);
      const edge = Math.min(1, (1 - Math.sqrt(dd)) * R * 0.9);
      const i = (py * S + px) * 4;
      d[i] = Math.min(255, tm(r) * 255);
      d[i + 1] = Math.min(255, tm(gg) * 255);
      d[i + 2] = Math.min(255, tm(b) * 255);
      d[i + 3] = Math.max(d[i + 3], Math.round(255 * edge));
    }
  }
  ctx.putImageData(img, 0, 0);
  // atmosphere halo
  if (spec.atmosphere.density > 0.12 || g) {
    const halo = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.22);
    const a = g ? hex(g.colors[2]) : atmo;
    const k = o.locked ? 0.2 : Math.min(0.55, 0.2 + spec.atmosphere.density * 0.25);
    halo.addColorStop(0, `rgba(${Math.round(a.r * 255)},${Math.round(a.g * 255)},${Math.round(a.b * 255)},${k})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (rings) drawRings(ctx, spec, cx, cy, R, 'front', o.locked);
  try {
    return cv.toDataURL('image/png');
  } catch {
    return '';
  }
}

function norm(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

function drawRings(ctx: CanvasRenderingContext2D, spec: PlanetSpec, cx: number, cy: number, R: number, half: 'back' | 'front', locked?: boolean): void {
  const rs = spec.rings!;
  const c = hex(rs.color);
  const inner = Math.min(1.35, rs.inner) * R, outer = Math.min(1.72, rs.outer * 0.7) * R;
  const squash = 0.32;
  const rot = -0.32 + rs.tilt * 0.4;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(1, squash);
  ctx.beginPath();
  if (half === 'back') ctx.rect(-outer * 1.1, -outer * 1.1, outer * 2.2, outer * 1.1);
  else ctx.rect(-outer * 1.1, 0, outer * 2.2, outer * 1.1);
  ctx.clip();
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const r = inner + (outer - inner) * (t + 0.5 / steps);
    const band = 0.45 + 0.55 * Math.abs(Math.sin(i * 2.7 + spec.seed));
    const a = rs.opacity * band * (half === 'back' ? 0.75 : 0.95) * (locked ? 0.4 : 1);
    const k = locked ? 0.5 : 1;
    ctx.strokeStyle = `rgba(${Math.round(c.r * 255 * k)},${Math.round(c.g * 255 * k)},${Math.round(c.b * 255 * k)},${a.toFixed(3)})`;
    ctx.lineWidth = ((outer - inner) / steps) * 1.05;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
