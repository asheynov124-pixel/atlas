/**
 * OWNER: life.
 * Sites — a lazily rebuilt index of the active planet's buildings as the agents see them: world frame (base
 * position, up / right / forward from the BuildingRenderer's own matrix), roof height (from the cached LOD0
 * geometry bounds), footprint radius, tags and zone family. Sky traffic weaves between the `towers`, drones land on
 * roofs, ports find their spaceports / skyports / mass drivers / elevators / harbours, beacons light the tall ones.
 */
import { Matrix4, Vector3 } from 'three';
import { zoneFamily, type Zone, type ZoneFamily } from '../../core/types';
import { getGeometry, getItem } from '../../content/catalog';
import { FOOTPRINT_RADIUS } from '../../content/kit';
import type { Planet } from '../../world/planet';
import type { PlanetView } from '../PlanetView';

export interface Site {
  id: number;
  defId: string;
  tile: number;
  tags: string[];
  family: ZoneFamily | null;
  /** base centre (world, on the tile top) */
  pos: Vector3;
  up: Vector3;
  right: Vector3;
  fwd: Vector3;
  /** uniform horizontal scale of the instance */
  scale: number;
  /** roof height above the base (world units) */
  top: number;
  /** usable footprint radius (world units) */
  radius: number;
}

const _m = new Matrix4();
const roofCache = new Map<string, number>();

export class Sites {
  all: Site[] = [];
  /** buildings with top ≥ 3.2 (sky-lane anchors), tallest first */
  towers: Site[] = [];
  private byTag = new Map<string, Site[]>();
  private byId = new Map<number, Site>();
  private dirty = true;
  version = 0;

  constructor(private view: PlanetView) {}

  invalidate(): void {
    this.dirty = true;
  }

  /** Rebuild if needed. Returns true when the index changed. */
  refresh(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    this.version++;
    const p: Planet = this.view.planet;
    const br = this.view.buildings;
    this.all = [];
    this.byTag.clear();
    this.byId.clear();
    for (const b of p.buildings.values()) {
      const def = getItem(b.defId);
      if (!def) continue;
      br.matrixFor(b, _m);
      const e = _m.elements;
      const right = new Vector3(e[0], e[1], e[2]);
      const up = new Vector3(e[4], e[5], e[6]);
      const fwd = new Vector3(e[8], e[9], e[10]);
      const scale = right.length() || 1;
      const sy = up.length() || 1;
      right.normalize();
      up.normalize();
      fwd.normalize();
      const s: Site = {
        id: b.id,
        defId: b.defId,
        tile: b.tile,
        tags: def.tags ?? [],
        family: zoneFamily(p.zone[b.tile] as Zone) ?? (def.growable ? zoneFamily(def.growable.zone) : null),
        pos: new Vector3(e[12], e[13], e[14]),
        up,
        right,
        fwd,
        scale,
        top: roofHeight(b.defId, b.variant, b.level, b.style) * sy,
        radius: FOOTPRINT_RADIUS[def.footprint] * scale,
      };
      this.all.push(s);
      this.byId.set(s.id, s);
      for (const t of s.tags) {
        let l = this.byTag.get(t);
        if (!l) this.byTag.set(t, (l = []));
        l.push(s);
      }
    }
    this.towers = this.all.filter((s) => s.top >= 3.2).sort((a, b) => b.top - a.top);
    return true;
  }

  /** Site of a building id (undefined if gone). */
  get(id: number): Site | undefined {
    return this.byId.get(id);
  }

  tagged(tag: string): Site[] {
    return this.byTag.get(tag) ?? [];
  }

  /** World position of a local point (x right, y up, z forward) on a site. */
  local(s: Site, x: number, y: number, z: number, out: Vector3): Vector3 {
    const k = s.scale;
    return out
      .copy(s.pos)
      .addScaledVector(s.right, x * k)
      .addScaledVector(s.up, y * k)
      .addScaledVector(s.fwd, z * k);
  }
}

function roofHeight(defId: string, variant: number, level: number, style: string): number {
  const key = `${defId}|${variant}|${level}|${style}`;
  let h = roofCache.get(key);
  if (h !== undefined) return h;
  const def = getItem(defId);
  try {
    const g = getGeometry(defId, { variant, level, style: style as never, lod: 0 });
    if (g) {
      if (!g.boundingBox) g.computeBoundingBox();
      h = Math.max(0.05, g.boundingBox!.max.y);
    }
  } catch {
    /* fall back to the declared height */
  }
  if (h === undefined) h = def?.height ?? 1;
  // giant tethers (space elevator) would make terrible sky-lane anchors: clamp to the declared height
  if (def?.height !== undefined && h > def.height * 1.5 + 2) h = def.height;
  if (roofCache.size > 4000) roofCache.clear();
  roofCache.set(key, h);
  return h;
}
