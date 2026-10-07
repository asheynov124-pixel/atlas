/**
 * OWNER: ui-panels.
 * Planet geometry helpers shared by the districts panel and the labels overlay.
 */
import type { Planet } from '../../world/planet';

export interface DistrictInfo {
  tiles: number;
  /** tile nearest the district's centre of mass */
  centre: number;
}

/** Two linear passes over the planet: tile counts and centroid tiles for every district (O(tiles)). */
export function districtGeometry(p: Planet): Map<number, DistrictInfo> {
  const n = p.districts.length;
  const sx = new Float64Array(n), sy = new Float64Array(n), sz = new Float64Array(n);
  const cnt = new Int32Array(n);
  const c = p.grid.center;
  const dist = p.district;
  for (let t = 0; t < p.count; t++) {
    const d = dist[t];
    if (!d || d >= n) continue;
    cnt[d]++;
    sx[d] += c[t * 3];
    sy[d] += c[t * 3 + 1];
    sz[d] += c[t * 3 + 2];
  }
  for (let d = 1; d < n; d++) {
    const l = Math.hypot(sx[d], sy[d], sz[d]) || 1;
    sx[d] /= l;
    sy[d] /= l;
    sz[d] /= l;
  }
  const best = new Int32Array(n).fill(-1);
  const bestDot = new Float64Array(n).fill(-2);
  for (let t = 0; t < p.count; t++) {
    const d = dist[t];
    if (!d || d >= n) continue;
    const dot = c[t * 3] * sx[d] + c[t * 3 + 1] * sy[d] + c[t * 3 + 2] * sz[d];
    if (dot > bestDot[d]) {
      bestDot[d] = dot;
      best[d] = t;
    }
  }
  const out = new Map<number, DistrictInfo>();
  for (let d = 1; d < n; d++) if (cnt[d] > 0) out.set(d, { tiles: cnt[d], centre: best[d] });
  return out;
}
