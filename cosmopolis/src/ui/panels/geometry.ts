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

/** One pass over the planet: tile counts and centroid tiles per district. */
export function districtGeometry(p: Planet): Map<number, DistrictInfo> {
  const sums = new Map<number, { n: number; x: number; y: number; z: number }>();
  const c = p.grid.center;
  for (let t = 0; t < p.count; t++) {
    const d = p.district[t];
    if (!d) continue;
    let s = sums.get(d);
    if (!s) sums.set(d, (s = { n: 0, x: 0, y: 0, z: 0 }));
    s.n++;
    s.x += c[t * 3];
    s.y += c[t * 3 + 1];
    s.z += c[t * 3 + 2];
  }
  const out = new Map<number, DistrictInfo>();
  for (const [d, s] of sums) {
    const l = Math.hypot(s.x, s.y, s.z) || 1;
    const x = s.x / l, y = s.y / l, z = s.z / l;
    let best = -1, bd = -2;
    for (let t = 0; t < p.count; t++) {
      if (p.district[t] !== d) continue;
      const dot = c[t * 3] * x + c[t * 3 + 1] * y + c[t * 3 + 2] * z;
      if (dot > bd) (bd = dot), (best = t);
    }
    out.set(d, { tiles: s.n, centre: best });
  }
  return out;
}

