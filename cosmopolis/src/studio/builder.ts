/**
 * OWNER: studio.
 * Design → geometry. `layoutDesign` resolves where every part sits (auto-stacking), `buildDesign` draws the whole
 * design into a kit MeshBuilder (used by the live preview AND by the registered ItemDef's mesh factory, so what you
 * see in the studio is exactly what gets built in the city), `analyze` gives triangles / bounds / per-part triangle
 * ranges for picking and highlighting.
 */
import { MeshBuilder } from '../content/kit';
import { DEG } from './geom';
import { footprintRadius, type DesignSpec, type PartSpec } from './model';
import { PART_DEFS, matOf, planSize, topWidth, type AddCtx, type HostInfo } from './parts';

/** Triangle budget (LOD0) — wonder-class. */
export const TRI_BUDGET = 6000;

export interface PartLayout {
  /** absolute base height */
  base: number;
  /** stack top after this part (stacked parts) or visual top (free parts) */
  top: number;
}

export interface Layout {
  parts: PartLayout[];
  /** top of the stack after the last part */
  stackTop: number;
  /** tallest visual point */
  height: number;
  /** horizontal bounding radius */
  radius: number;
  /** last stacked structural part (smart defaults) */
  host: HostInfo | null;
}

/** Visual vertical extent of a part above its base. */
export function extentOf(p: PartSpec): number {
  switch (p.t) {
    case 'halo':
      return p.d / 2 + Math.abs(Math.sin(p.tilt * DEG)) * (p.w / 2);
    case 'neon':
      return Math.max(0, p.n - 1) * p.s + p.h;
    case 'balcony':
      return Math.max(0, p.n - 1) * p.s + 0.08;
    case 'fins':
    case 'billboard':
    case 'skybridge':
      return p.h;
    case 'turbine':
      return p.h + p.w / 2;
    case 'garden':
      return 0.05 + Math.min(2, Math.max(0.4, p.h * 2.5)) * 0.2;
    case 'solar':
      return 0.12;
    default:
      return PART_DEFS[p.t]?.height(p) ?? p.h;
  }
}

export function layoutDesign(spec: DesignSpec, upTo = spec.parts.length): Layout {
  const out: PartLayout[] = [];
  let stack = 0;
  let height = 0;
  let radius = footprintRadius(spec.footprint) * 0.6;
  let host: HostInfo | null = null;
  for (let i = 0; i < Math.min(upTo, spec.parts.length); i++) {
    const p = spec.parts[i];
    const def = PART_DEFS[p.t];
    if (!def) {
      out.push({ base: stack, top: stack });
      continue;
    }
    const base = p.stack ? stack + p.y : p.y;
    const ext = extentOf(p);
    let top: number;
    if (p.stack) {
      stack = Math.max(0, base + def.height(p));
      top = stack;
    } else top = base + ext;
    height = Math.max(height, base + ext);
    const ps = planSize(p);
    const reach = Math.hypot(p.x, p.z) + Math.hypot(ps.w, ps.d) / 2;
    radius = Math.max(radius, reach);
    if (p.stack && (def.family === 'structure' || !host)) {
      const tw = topWidth(p);
      host = { t: p.t, w: ps.w, d: ps.d, h: def.height(p), seg: p.t === 'cylinder' ? Math.max(9, p.seg) : p.seg, taper: p.taper, base, top: stack, topW: tw.w, topD: tw.d, x: p.x, z: p.z };
    }
    out.push({ base, top });
  }
  return { parts: out, stackTop: stack, height: Math.max(0.05, height), radius, host };
}

/** Context for creating a new part on top of the design (optionally as if inserted after `afterIndex`). */
export function addContext(spec: DesignSpec, afterIndex = spec.parts.length - 1): AddCtx {
  const lay = layoutDesign(spec, afterIndex + 1);
  return { fp: spec.footprint, fpR: footprintRadius(spec.footprint), top: lay.stackTop, host: lay.host, height: lay.height };
}

let warned = false;

/**
 * Draw a design into `b`. `ranges` (optional) receives [triStart, triEnd) per part.
 * Never throws: a failing part is skipped (logged once).
 */
export function buildDesign(b: MeshBuilder, spec: DesignSpec, ranges?: number[]): Layout {
  const lay = layoutDesign(spec);
  const fpR = footprintRadius(spec.footprint);
  for (let i = 0; i < spec.parts.length; i++) {
    const p = spec.parts[i];
    const def = PART_DEFS[p.t];
    const t0 = b.triangles;
    if (def) {
      const L = lay.parts[i];
      try {
        b.group({ x: p.x, y: L.base, z: p.z, ry: p.ry * DEG }, () => def.build(b, p, { fpR, index: i, base: L.base, M: matOf(p.m) }));
      } catch (e) {
        if (!warned) {
          warned = true;
          console.warn('[studio] part failed to build', p.t, e);
        }
      }
    }
    ranges?.push(t0, b.triangles);
  }
  return lay;
}

export interface Analysis {
  triangles: number;
  height: number;
  radius: number;
  layout: Layout;
}

/** Triangle count & bounds of a design at LOD0 (builds into a scratch builder). */
export function analyze(spec: DesignSpec): Analysis {
  const b = new MeshBuilder(0);
  const layout = buildDesign(b, spec);
  return { triangles: b.triangles, height: layout.height, radius: layout.radius, layout };
}

/** Reduce detail (segments, counts) until the design fits the triangle budget. Returns a new spec. */
export function simplify(spec: DesignSpec, budget = TRI_BUDGET): DesignSpec {
  let d: DesignSpec = { ...spec, parts: spec.parts.map((p) => ({ ...p })) };
  for (let pass = 0; pass < 8; pass++) {
    if (analyze(d).triangles <= budget) return d;
    d = {
      ...d,
      parts: d.parts.map((p) => {
        const q = { ...p };
        if (q.seg > 8) q.seg = Math.max(8, Math.round(q.seg * 0.75));
        if (q.n > 4 && ['twisted', 'pods', 'colonnade', 'balcony', 'fins', 'garden', 'tree', 'crystal', 'crown', 'lattice', 'helipad', 'neon'].includes(q.t)) q.n = Math.max(3, Math.round(q.n * 0.8));
        return q;
      }),
    };
  }
  return d;
}
