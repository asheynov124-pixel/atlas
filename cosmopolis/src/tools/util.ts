/**
 * OWNER: tools.
 * Small helpers shared by the tools: selection, brush tiles, ghost matrices (matching BuildingRenderer's
 * scaling), road facing, surface points, colours.
 */
import { Matrix4, Vector3 } from 'three';
import { bus } from '../core/events';
import type { Selection } from '../core/types';
import { getItem } from '../content/catalog';
import { tileMatrix, tilePosition } from '../world/geo';
import type { Planet } from '../world/planet';
import { ui } from '../ui/store';

export function setSelection(sel: Selection): void {
  ui.selection.value = sel;
  bus.emit('selection:changed', { selection: sel });
}

/** Tiles within `radius` steps of `center`, optionally filtered. */
export function brushTiles(p: Planet, center: number, radius: number, filter?: (t: number) => boolean): number[] {
  const tiles = radius <= 0 ? [center] : p.grid.disk(center, radius);
  return filter ? tiles.filter(filter) : tiles;
}

/** Ring distance (0 = centre) for each tile of a disk, parallel to `p.grid.disk(center, r)` order. */
export function diskRings(p: Planet, center: number, radius: number): Map<number, number> {
  const out = new Map<number, number>();
  out.set(center, 0);
  let frontier = [center];
  for (let r = 1; r <= radius; r++) {
    const next: number[] = [];
    for (const t of frontier)
      for (const n of p.grid.neighbors(t))
        if (!out.has(n)) {
          out.set(n, r);
          next.push(n);
        }
    frontier = next;
  }
  return out;
}

/** World matrix for a building of `defId` on `tile` facing `rot` — same scale rule as BuildingRenderer. */
export function buildingMatrix(p: Planet, defId: string, tile: number, rot: number, out = new Matrix4()): Matrix4 {
  const def = getItem(defId);
  let s = 1;
  if (def?.footprint === 1) {
    const inr = p.grid.inradius[tile] * p.radius;
    s = Math.max(0.78, Math.min(1.08, inr / 1.0));
  }
  return tileMatrix(p, tile, rot, out, { scale: s });
}

/** Neighbour index of the best adjacent road (highest kind), or -1. */
export function roadFacing(p: Planet, tile: number): number {
  const g = p.grid;
  let best = -1, kind = 0;
  const d = g.degree(tile);
  for (let k = 0; k < d; k++) {
    const r = p.road[g.neighbor(tile, k)];
    if (r > kind) {
      kind = r;
      best = k;
    }
  }
  return best;
}

/** For multi-tile footprints: face the side of the footprint that touches a road. */
export function footprintFacing(p: Planet, tile: number, footprint: 1 | 7 | 19): number {
  if (footprint === 1) return roadFacing(p, tile);
  const g = p.grid;
  const tiles = new Set(g.footprint(tile, footprint));
  const c = g.center;
  let bx = 0, by = 0, bz = 0, n = 0;
  for (const t of tiles)
    for (const q of g.neighbors(t))
      if (!tiles.has(q) && p.road[q]) {
        bx += c[q * 3];
        by += c[q * 3 + 1];
        bz += c[q * 3 + 2];
        n++;
      }
  if (!n) return -1;
  // the anchor neighbour pointing most toward the road mass
  let best = 0, bd = -Infinity;
  const d = g.degree(tile);
  for (let k = 0; k < d; k++) {
    const q = g.neighbor(tile, k);
    const dot = (c[q * 3] - c[tile * 3]) * bx + (c[q * 3 + 1] - c[tile * 3 + 1]) * by + (c[q * 3 + 2] - c[tile * 3 + 2]) * bz;
    if (dot > bd) {
      bd = dot;
      best = k;
    }
  }
  return best;
}

/** Surface point of a tile (water surface when submerged), lifted along the normal. */
export function surfacePoint(p: Planet, tile: number, lift = 0, out = new Vector3()): Vector3 {
  tilePosition(p, tile, out, lift);
  if (p.spec.hasOcean && p.isWater(tile)) out.setLength(p.radius + p.waterHeight + lift);
  return out;
}

/** Fill a flat xyz array with lifted surface points of a tile path. Returns the count written. */
export function pathPoints(p: Planet, path: number[], lift: number, out: Float32Array): number {
  const v = new Vector3();
  const n = Math.min(path.length, Math.floor(out.length / 3));
  for (let i = 0; i < n; i++) {
    surfacePoint(p, path[i], lift, v);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return n;
}

export function money(n: number): string {
  return '₡' + Math.round(n).toLocaleString('en-US');
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
