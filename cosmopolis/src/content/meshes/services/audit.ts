/**
 * services · content audit (OWNER: services). Dev / test tooling — not imported by the game.
 *
 * Builds every services / education / leisure ploppable for every style it reacts to, every variant and both
 * LODs and reports triangle counts, the furthest vertex from the footprint centre, the mesh height and any
 * contract problems (budget, footprint overflow, LOD1 not simpler, missing stats). Used by services.test.ts:
 *   npx vitest run -c src/content/meshes/services/vitest.config.ts
 */
import { allItems, type ItemDef } from '../../catalog';
import { MeshBuilder } from '../../kit';
import { STYLES, STYLE_IDS } from '../../styles';
import { Rng, hashString } from '../../../core/rng';
import type { StyleId } from '../../../core/types';

export const OWN_CATEGORIES = ['services', 'education', 'leisure'] as const;

/** LOD0 triangle budget: ploppables 1 500, footprint-19 venues 3 000. */
export function budgetOf(def: ItemDef): number {
  return def.footprint === 19 ? 3000 : 1500;
}

/** Max allowed vertex distance from the footprint centre (lot plates reach into the outer tiles' lobes). */
export const REACH: Record<1 | 7 | 19, number> = { 1: 0.95, 7: 2.62, 19: 4.85 };

export interface AuditRow {
  id: string;
  style: StyleId | '-';
  variant: number;
  lod: 0 | 1;
  tris: number;
  radius: number;
  height: number;
}

export function buildRow(def: ItemDef, style: StyleId, variant: number, lod: 0 | 1): AuditRow {
  const b = new MeshBuilder(lod);
  const key = `${def.id}|${variant}|${def.styleable ? 1 : 1}|${def.styleable ? style : '-'}`;
  def.mesh!({ b, rng: new Rng(hashString(key)), def, variant, level: 1, styleId: style, style: STYLES[style], lod, footprint: def.footprint });
  const g = b.build();
  const pos = g.getAttribute('position');
  let r = 0, h = 0;
  for (let i = 0; i < pos.count; i++) {
    r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
    h = Math.max(h, pos.getY(i));
  }
  const tris = b.triangles;
  g.dispose();
  return { id: def.id, style: def.styleable ? style : '-', variant, lod, tris, radius: r, height: h };
}

export function ownItems(): ItemDef[] {
  return allItems().filter((d) => (OWN_CATEGORIES as readonly string[]).includes(d.category) && !!d.mesh && !d.custom);
}

export function auditServices(): { rows: AuditRow[]; problems: string[] } {
  const rows: AuditRow[] = [];
  const problems: string[] = [];
  for (const def of ownItems()) {
    const styles: StyleId[] = def.styleable ? STYLE_IDS : ['classic'];
    let maxH = 0;
    for (const sid of styles)
      for (let v = 0; v < Math.max(1, def.variants ?? 1); v++) {
        const r0 = buildRow(def, sid, v, 0);
        const r1 = buildRow(def, sid, v, 1);
        rows.push(r0, r1);
        maxH = Math.max(maxH, r0.height);
        if (r0.tris > budgetOf(def)) problems.push(`${def.id} [${sid} v${v}] ${r0.tris} tris > ${budgetOf(def)}`);
        if (r1.tris > r0.tris) problems.push(`${def.id} [${sid} v${v}] LOD1 ${r1.tris} > LOD0 ${r0.tris}`);
        if (r0.radius > REACH[def.footprint]) problems.push(`${def.id} [${sid} v${v}] reaches ${r0.radius.toFixed(2)} > ${REACH[def.footprint]}`);
      }
    if (def.height !== undefined && (maxH > def.height * 1.35 + 0.1 || maxH < def.height * 0.65 - 0.1)) problems.push(`${def.id} height ${def.height} but mesh is ${maxH.toFixed(2)}`);
    if (!def.flavor) problems.push(`${def.id} has no flavour text`);
    if (!def.group) problems.push(`${def.id} has no group`);
  }
  return { rows, problems };
}
