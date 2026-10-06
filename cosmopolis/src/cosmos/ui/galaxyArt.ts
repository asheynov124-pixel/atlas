/**
 * OWNER: cosmos.
 * galaxyArt — tiny Canvas-2D galaxy portraits for info cards and lists: ~1 500 additive star dots laid out with the
 * same shape rules as the 3D galaxy (spiral arms via armAngle, bars, the Sombrero brim, the Elder Ring, irregular
 * clumps), a glowing core and the galaxy's own two-colour palette. Locked galaxies come out desaturated.
 * Cached as data URLs per (galaxy, size, locked, dpr).
 */
import { Rng, hashString } from '../../core/rng';
import { armAngle, RING_RADIUS, type Galaxy } from '../Universe';

const cache = new Map<string, string>();

function gauss(rng: Rng): number {
  const u = Math.max(1e-6, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

export function galaxyArt(g: Galaxy, size: number, locked = false): string {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const key = `${g.id}|${size}|${locked}|${dpr}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') return '';
  const S = Math.max(16, Math.round(size * dpr));
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const rng = new Rng(hashString(g.id + ':art'));
  const cx = S / 2, cy = S / 2;
  const R = S * 0.46;
  const rot = -0.5 + (hashString(g.id) % 100) / 160;
  const squash = g.kind === 'elliptical' ? 0.62 : g.kind === 'ring' ? 0.55 : 0.5;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const a = rgb(g.colors[0]);
  const b = rgb(g.colors[1]);
  const gray = (c: [number, number, number]): [number, number, number] => {
    if (!locked) return c;
    const y = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    return [y * 0.75 + c[0] * 0.1, y * 0.78 + c[1] * 0.1, y * 0.85 + c[2] * 0.1];
  };
  const ca = gray(a), cb = gray(b);
  ctx.globalCompositeOperation = 'lighter';
  const dot = (x: number, z: number, y: number, col: [number, number, number], alpha: number, r: number) => {
    const px = cx + (x * cr - z * sr) * R;
    const py = cy + ((x * sr + z * cr) * squash + y * 0.9) * R;
    ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${(alpha * (locked ? 0.6 : 1)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(px, py, r * dpr, 0, Math.PI * 2);
    ctx.fill();
  };
  const mixc = (t: number): [number, number, number] => [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
  const N = Math.round(900 + size * 9);
  const clumps: [number, number][] = [];
  if (g.kind === 'irregular') for (let k = 0; k < 5; k++) clumps.push([rng.range(-0.55, 0.55), rng.range(-0.5, 0.5)]);
  for (let i = 0; i < N; i++) {
    const u = rng.next();
    if (g.kind === 'spiral' || g.kind === 'barred') {
      if (u < 0.15) {
        const r = Math.abs(gauss(rng)) * 0.1;
        const th = rng.range(0, Math.PI * 2);
        dot(Math.cos(th) * r * (g.kind === 'barred' ? 1.8 : 1), Math.sin(th) * r, 0, mixc(0.1), 0.35, rng.range(0.5, 1.1));
      } else {
        const arm = Math.floor(rng.next() * Math.max(1, g.arms));
        const rn = Math.min(1, (g.kind === 'barred' ? 0.26 : 0.06) + -Math.log(1 - rng.next() * 0.95) * 0.3);
        const spread = gauss(rng) * (0.18 + 0.16 * (1 - rn));
        const th = armAngle(g, rn, arm) + spread;
        const close = Math.max(0, 1 - Math.abs(spread) * 4);
        const knot = rng.chance(0.03 * close);
        dot(Math.cos(th) * rn, Math.sin(th) * rn, 0, knot ? gray([255, 111, 168]) : mixc(close), 0.18 + close * 0.4, knot ? 1.3 : rng.range(0.45, 1.0));
      }
    } else if (g.kind === 'elliptical') {
      if (u < 0.72) {
        const r = Math.abs(gauss(rng)) * 0.3;
        const th = rng.range(0, Math.PI * 2);
        const ph = Math.acos(rng.range(-1, 1));
        dot(Math.sin(ph) * Math.cos(th) * r, Math.sin(ph) * Math.sin(th) * r, Math.cos(ph) * r * 0.5, mixc(0.15), 0.3, rng.range(0.5, 1.1));
      } else {
        const rn = 0.42 + Math.abs(gauss(rng)) * 0.22;
        const th = rng.range(0, Math.PI * 2);
        dot(Math.cos(th) * rn, Math.sin(th) * rn, 0, mixc(0.9), 0.35, rng.range(0.45, 1));
      }
    } else if (g.kind === 'ring') {
      if (u < 0.12) {
        const r = Math.abs(gauss(rng)) * 0.07;
        const th = rng.range(0, Math.PI * 2);
        dot(Math.cos(th) * r, Math.sin(th) * r, 0, mixc(0.1), 0.45, rng.range(0.5, 1));
      } else {
        const rn = RING_RADIUS + gauss(rng) * 0.05;
        const th = rng.range(0, Math.PI * 2);
        dot(Math.cos(th) * rn, Math.sin(th) * rn, 0, mixc(0.7 + rng.next() * 0.3), 0.4, rng.range(0.45, 1.05));
      }
    } else {
      const c = clumps[Math.floor(rng.next() * clumps.length)] ?? [0, 0];
      dot(c[0] + gauss(rng) * 0.14, c[1] + gauss(rng) * 0.14, 0, mixc(rng.next()), 0.32, rng.range(0.45, 1.1));
    }
  }
  // core glow
  ctx.globalCompositeOperation = 'lighter';
  const coreR = R * (g.kind === 'elliptical' ? 0.5 : g.kind === 'ring' ? 0.16 : 0.28);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  const k = locked ? 0.4 : 0.85;
  grad.addColorStop(0, `rgba(255,248,235,${k})`);
  grad.addColorStop(0.25, `rgba(${ca[0] | 0},${ca[1] | 0},${ca[2] | 0},${k * 0.5})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot * 0.3);
  ctx.scale(1, g.kind === 'elliptical' ? 0.75 : 0.62);
  ctx.translate(-cx, -cy);
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  let url = '';
  try {
    url = cv.toDataURL('image/png');
  } catch {
    url = '';
  }
  if (cache.size > 60) cache.clear();
  cache.set(key, url);
  return url;
}
