/**
 * Demo city generator (FOUNDATION, used by screenshots / attract mode / "Instant City" sandbox button).
 * Builds roads, zones, grown buildings, ploppables, landmarks, decor and orbitals from whatever content is
 * registered — so every module can be seen in context.
 */
import { Vector3 } from 'three';
import { RoadKind, Zone, type Category } from '../core/types';
import { Rng } from '../core/rng';
import { allItems, growablesFor, itemsByCategory, type ItemDef } from '../content/catalog';
import type { Game } from '../game/Game';
import type { Planet } from '../world/planet';

export interface DemoResult {
  center: number;
  buildings: number;
  roads: number;
}

/** Pick a large, fairly flat land area. */
export function findCitySite(p: Planet, radius = 9, seed = 7): number {
  const rng = new Rng(seed);
  let best = 0, bestScore = -Infinity;
  for (let k = 0; k < 500; k++) {
    const t = rng.int(0, p.count - 1);
    if (p.isWater(t)) continue;
    const e = p.elevation[t];
    let score = 0;
    for (const n of p.grid.disk(t, radius)) {
      if (p.isWater(n)) score -= 1.5;
      else score += Math.abs(p.elevation[n] - e) <= 2 ? 1 : -0.5;
    }
    score -= Math.abs(p.grid.center[t * 3 + 1]) * 40; // prefer temperate latitudes
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Walk a straight hex line from `from` through `dir` (a neighbour), `len` tiles. */
function straightLine(p: Planet, from: number, dirTile: number, len: number): number[] {
  const out = [from, dirTile];
  let prev = from, cur = dirTile;
  const g = p.grid;
  for (let i = 2; i < len; i++) {
    let next = -1, bestDot = Infinity;
    for (const n of g.neighbors(cur)) {
      const d = g.dot(n, prev);
      if (d < bestDot) {
        bestDot = d;
        next = n;
      }
    }
    if (next < 0) break;
    out.push(next);
    prev = cur;
    cur = next;
  }
  return out;
}

/** Ring tiles ordered by angle around the centre. */
function orderedRing(p: Planet, center: number, r: number): number[] {
  const ring = p.grid.ring(center, r);
  const c = new Vector3(p.grid.center[center * 3], p.grid.center[center * 3 + 1], p.grid.center[center * 3 + 2]);
  const ref = new Vector3(0, 1, 0).addScaledVector(c, -c.y).normalize();
  if (ref.lengthSq() < 0.5) ref.set(1, 0, 0);
  const side = new Vector3().crossVectors(c, ref);
  const v = new Vector3();
  return ring
    .map((t) => {
      v.set(p.grid.center[t * 3], p.grid.center[t * 3 + 1], p.grid.center[t * 3 + 2]).sub(c);
      return { t, a: Math.atan2(v.dot(side), v.dot(ref)) };
    })
    .sort((a, b) => a.a - b.a)
    .map((x) => x.t);
}

export function buildDemoCity(game: Game, kind = 'city'): DemoResult | null {
  const p = game.planet;
  const ops = game.ops;
  if (!p || !ops) return null;
  const big = kind === 'metropolis';
  const R = big ? 12 : 9;
  const rng = new Rng(4242);
  const center = findCitySite(p, R);
  const g = p.grid;
  const day = Math.floor(game.clock.day);

  // gentle flattening around the centre so the city reads well
  const area = g.disk(center, R + 1).filter((t) => !p.isWater(t));
  const lvl = Math.max(0, p.elevation[center]);
  ops.setElevation(area, area.map((t) => {
    const d = Math.sqrt(g.angle(center, t)) ;
    const e = p.elevation[t];
    return Math.abs(e - lvl) <= 3 || d < 0.2 ? lvl + Math.sign(e - lvl) * Math.min(1, Math.abs(e - lvl)) : e;
  }));

  // roads: 6 avenues + rings
  let roads = 0;
  const nb = g.neighbors(center);
  ops.buildRoad([center], RoadKind.Avenue);
  for (const n of nb) {
    const line = straightLine(p, center, n, R + 2).filter((t) => !p.isWater(t));
    roads += ops.buildRoad(line, RoadKind.Avenue).length;
  }
  for (const r of big ? [3, 6, 9, 12] : [3, 6, 9]) {
    const ring = orderedRing(p, center, r);
    const path = [...ring, ring[0]].filter((t) => !p.isWater(t));
    roads += ops.buildRoad(path, r >= 9 ? RoadKind.Street : RoadKind.Street).length;
  }
  // a few side streets
  for (let k = 0; k < (big ? 14 : 8); k++) {
    const ring = orderedRing(p, center, rng.int(4, R - 1));
    const t = rng.pick(ring);
    const n = rng.pick(g.neighbors(t));
    roads += ops.buildRoad(straightLine(p, t, n, rng.int(3, 6)).filter((x) => !p.isWater(x)), RoadKind.Street).length;
  }

  // zoning by distance band (industrial wedge)
  const indDir = nb[0];
  const zoneFor = (t: number, d: number): Zone => {
    const ang = g.dot(t, indDir) - g.dot(t, center);
    if (d >= 5 && ang > 0.0006 * (40 / g.frequency) ** 2) return d > 7 ? Zone.IndGeneral : Zone.IndTech;
    if (d <= 2) return rng.chance(0.5) ? Zone.Office : Zone.ComHigh;
    if (d <= 4) return rng.chance(0.65) ? Zone.ResHigh : Zone.ComLow;
    if (d <= 6) return rng.chance(0.75) ? Zone.ResMed : Zone.ComLow;
    if (d <= 8) return rng.chance(0.85) ? Zone.ResLow : Zone.ComLeisure;
    return rng.chance(0.5) ? Zone.IndFarm : Zone.ResLow;
  };
  const dist = new Map<number, number>();
  for (let r = 0; r <= R + 1; r++) for (const t of g.ring(center, r)) dist.set(t, r);
  const zoned: number[] = [];
  for (const [t, d] of dist) {
    if (p.isWater(t) || p.road[t] || !p.hasRoadAccess(t)) continue;
    if (rng.chance(0.08)) continue; // leave gaps for ploppables
    const z = zoneFor(t, d);
    ops.setZone([t], z);
    zoned.push(t);
  }

  // pre-pick space for ploppables (before growables fill everything)
  const ploppable = (cats: Category[], max: number) =>
    allItems().filter((d) => cats.includes(d.category) && !d.hidden && d.mesh && d.placement === 'surface' && !d.growable).sort(() => rng.next() - 0.5).slice(0, max);
  const placeNear = (def: ItemDef, minD: number, maxD: number): boolean => {
    const cands = [...dist.entries()].filter(([, d]) => d >= minD && d <= maxD).map(([t]) => t).sort(() => rng.next() - 0.5);
    for (const t of cands) {
      const chk = ops.checkPlace(def.id, t);
      if (!chk.ok) {
        // allow replacing zoned-but-empty lots
        if (chk.reason !== 'Something is in the way') continue;
      }
      const tiles = g.footprint(t, def.footprint);
      if (tiles.some((x) => p.road[x] || p.isWater(x) || p.building[x] >= 0)) continue;
      if (def.footprint > 1 && !tiles.some((x) => p.hasRoadAccess(x))) continue;
      if (def.footprint === 1 && !p.hasRoadAccess(t)) continue;
      const rot = Math.max(0, g.neighbors(t).findIndex((n) => p.road[n] !== 0));
      const b = ops.placeBuilding(def.id, t, rot, { day, force: false }) ?? ops.placeBuilding(def.id, t, rot, { day, force: true });
      if (b) return true;
    }
    return false;
  };
  let buildings = 0;
  for (const def of ploppable(['landmarks'], big ? 4 : 2)) if (placeNear(def, def.footprint > 1 ? 3 : 1, R)) buildings++;
  for (const def of ploppable(['services', 'education', 'leisure', 'transit'], big ? 16 : 10)) if (placeNear(def, 2, R)) buildings++;
  for (const def of ploppable(['power', 'water', 'industry'], big ? 6 : 4)) if (placeNear(def, R - 3, R + 1)) buildings++;

  // grown buildings
  for (const t of zoned) {
    if (p.building[t] >= 0 || p.road[t]) continue;
    const defs = growablesFor(p.zone[t] as Zone);
    if (!defs.length) continue;
    const d = dist.get(t) ?? R;
    const level = Math.max(1, Math.min(5, Math.round(5.4 - d * (big ? 0.38 : 0.5) + rng.range(-0.6, 0.6))));
    const fit = defs.filter((x) => (x.growable!.minLevel ?? 1) <= level && (x.growable!.maxLevel ?? 5) >= level);
    const def = rng.pick(fit.length ? fit : defs);
    const rot = Math.max(0, g.neighbors(t).findIndex((n) => p.road[n] !== 0));
    if (ops.placeBuilding(def.id, t, rot, { level, variant: rng.int(0, 99), day })) buildings++;
  }

  // decor: trees & props on leftover tiles near the centre
  const decor = itemsByCategory('decor').filter((d) => d.mesh);
  if (decor.length) {
    for (const [t, d] of dist) {
      if (d > R || p.isWater(t) || p.road[t] || p.building[t] >= 0) continue;
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) ops.addProp(rng.pick(decor).id, t, rng.range(-0.5, 0.5), rng.range(-0.5, 0.5), rng.range(0, Math.PI * 2), rng.range(0.85, 1.2));
    }
  }
  // orbitals
  for (const def of itemsByCategory('orbital').filter((d) => d.placement === 'orbit').slice(0, big ? 6 : 3)) ops.addOrbital(def.id);

  game.camera.flyTo(center, { distance: big ? 34 : 26, tilt: 0.9 });
  game.camera.snap?.();
  return { center, buildings, roads };
}
