/**
 * Showroom (FOUNDATION dev tool): lays out items along straight roads on a flattened site so content can be
 * reviewed visually. URL: &showroom=<category|all|prefix:xyz>&style=<StyleId>&level=1..5
 * JS: window.__cosmo.showroom({ category: 'services', style: 'neo', level: 3 })
 */
import { Vector3 } from 'three';
import { Feature, RoadKind, type Category, type StyleId } from '../core/types';
import { allItems, type ItemDef } from '../content/catalog';
import type { Game } from '../game/Game';
import type { Planet } from '../world/planet';
import { findCitySite } from './demoCity';

export interface ShowroomOptions {
  category?: Category | 'all';
  /** id prefix filter */
  prefix?: string;
  ids?: string[];
  style?: StyleId;
  level?: number;
  /** include hidden growables (default true when category is 'zones') */
  growables?: boolean;
}

function dirLine(p: Planet, start: number, dir: Vector3, len: number): number[] {
  const g = p.grid;
  const out = [start];
  const c = new Vector3();
  const n = new Vector3();
  let cur = start, prev = -1;
  for (let i = 1; i < len; i++) {
    c.set(g.center[cur * 3], g.center[cur * 3 + 1], g.center[cur * 3 + 2]);
    // project dir onto tangent plane at cur
    const d = dir.clone().addScaledVector(c, -dir.dot(c)).normalize();
    let best = -1, bestDot = -Infinity;
    for (const j of g.neighbors(cur)) {
      if (j === prev) continue;
      n.set(g.center[j * 3], g.center[j * 3 + 1], g.center[j * 3 + 2]).sub(c).normalize();
      const s = n.dot(d);
      if (s > bestDot) {
        bestDot = s;
        best = j;
      }
    }
    if (best < 0) break;
    prev = cur;
    cur = best;
    out.push(cur);
  }
  return out;
}

export function showroom(game: Game, o: ShowroomOptions = {}): { placed: number; failed: string[] } | null {
  const p = game.planet, ops = game.ops;
  if (!p || !ops) return null;
  let defs: ItemDef[] = allItems().filter((d) => d.mesh && d.placement !== 'free');
  if (o.ids) defs = defs.filter((d) => o.ids!.includes(d.id));
  else if (o.prefix) defs = defs.filter((d) => d.id.startsWith(o.prefix!));
  else if (o.category && o.category !== 'all') defs = defs.filter((d) => d.category === o.category);
  const withGrow = o.growables ?? (o.category === 'zones' || !!o.prefix || !!o.ids);
  if (!withGrow) defs = defs.filter((d) => !d.growable);
  defs.sort((a, b) => a.footprint - b.footprint || a.tier - b.tier);
  if (o.style) p.city.style = o.style;
  const orbitals = defs.filter((d) => d.placement === 'orbit');
  defs = defs.filter((d) => d.placement !== 'orbit');

  const site = findCitySite(p, 14, 99);
  const g = p.grid;
  const R = 15 + Math.min(10, Math.floor(defs.length / 12));
  const area = g.disk(site, R);
  const lvl = Math.max(0, p.elevation[site]);
  const landArea = area.filter((t) => p.isLand(t) || p.elevation[t] >= lvl - 3);
  ops.setElevation(landArea, lvl);
  ops.setFeature(area, Feature.None);
  // rows of roads
  const c0 = new Vector3(g.center[site * 3], g.center[site * 3 + 1], g.center[site * 3 + 2]);
  const along = new Vector3(0, 1, 0).addScaledVector(c0, -c0.y).normalize();
  if (along.lengthSq() < 0.5) along.set(1, 0, 0);
  const across = new Vector3().crossVectors(c0, along).normalize();
  const rowStarts: number[] = [];
  const spine = [...dirLine(p, site, across.clone().negate(), R).reverse(), ...dirLine(p, site, across, R).slice(1)];
  for (let i = 0; i < spine.length; i += 6) rowStarts.push(spine[i]);
  const roadTiles = new Set<number>();
  for (const s of rowStarts) {
    const row = [...dirLine(p, s, along.clone().negate(), R).reverse(), ...dirLine(p, s, along, R).slice(1)];
    ops.buildRoad(row, RoadKind.Street, true);
    row.forEach((t) => roadTiles.add(t));
  }
  ops.buildRoad(spine, RoadKind.Avenue, true);
  spine.forEach((t) => roadTiles.add(t));
  // candidates sorted by distance to site
  const cands = area.filter((t) => !roadTiles.has(t)).sort((a, b) => g.dot(b, site) - g.dot(a, site));
  const failed: string[] = [];
  let placed = 0;
  const day = Math.floor(game.clock.day);
  for (const def of defs) {
    let ok = false;
    for (const t of cands) {
      if (p.building[t] >= 0) continue;
      const chk = ops.checkPlace(def.id, t);
      if (!chk.ok) continue;
      const rot = Math.max(0, g.neighbors(t).findIndex((n) => p.road[n] !== 0));
      if (ops.placeBuilding(def.id, t, rot, { day, level: o.level ?? def.growable?.maxLevel ?? 1, variant: placed, style: o.style })) {
        ok = true;
        placed++;
        break;
      }
    }
    if (!ok) failed.push(def.id);
  }
  for (const def of orbitals) if (ops.addOrbital(def.id)) placed++;
  game.camera.flyTo(site, { distance: R * 2.2, tilt: 0.75 });
  game.camera.snap?.();
  return { placed, failed };
}
