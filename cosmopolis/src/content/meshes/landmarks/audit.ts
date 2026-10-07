/**
 * landmarks · content audit (OWNER: landmarks). Dev / test tooling — not imported by the game.
 *
 * Builds every landmark, wonder and orbital mesh (every style for styleable ones, every variant, both LODs) and
 * reports triangle counts, reach from the footprint centre and height, plus contract problems: over budget, plaza
 * overflow, LOD1 not simpler, missing flavour/group, height field far from the mesh. Used by landmarks.test.ts:
 *   npx vitest run -c src/content/meshes/landmarks/vitest.config.ts
 */
import { allItems, type ItemDef } from '../../catalog';
import { MeshBuilder } from '../../kit';
import { STYLES, STYLE_IDS } from '../../styles';
import { Rng, hashString } from '../../../core/rng';
import type { StyleId } from '../../../core/types';

/** LOD0 triangle budgets: landmarks 3 000, wonders 6 000, orbitals 3 000 (megastructures 6 000). */
export function budgetOf(def: ItemDef): number {
  if (def.category === 'orbital') return def.tier >= 6 ? 6000 : 3000;
  return def.footprint === 19 ? 6000 : 3000;
}

/** Max vertex distance from the footprint centre for surface items (plazas reach into the outer tiles' lobes). */
export const REACH: Record<1 | 7 | 19, number> = { 1: 0.95, 7: 2.62, 19: 4.85 };

export interface AuditRow {
  id: string;
  style: StyleId | '-';
  variant: number;
  lod: 0 | 1;
  tris: number;
  radius: number;
  height: number;
  extent: number;
}

export function buildRow(def: ItemDef, style: StyleId, variant: number, lod: 0 | 1): AuditRow {
  const b = new MeshBuilder(lod);
  const key = `${def.id}|${variant}|1|${def.styleable ? style : '-'}`;
  def.mesh!({ b, rng: new Rng(hashString(key)), def, variant, level: 1, styleId: style, style: STYLES[style], lod, footprint: def.footprint });
  const g = b.build();
  const pos = g.getAttribute('position');
  let r = 0, h = 0, e = 0;
  for (let i = 0; i < pos.count; i++) {
    r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
    h = Math.max(h, pos.getY(i));
    e = Math.max(e, Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  const tris = b.triangles;
  g.dispose();
  return { id: def.id, style: def.styleable ? style : '-', variant, lod, tris, radius: r, height: h, extent: e };
}

export function ownItems(): ItemDef[] {
  return allItems().filter((d) => (d.category === 'landmarks' || d.category === 'orbital') && !!d.mesh && !d.custom);
}

export function auditLandmarks(): { rows: AuditRow[]; problems: string[] } {
  const rows: AuditRow[] = [];
  const problems: string[] = [];
  for (const def of ownItems()) {
    const styles: StyleId[] = def.styleable ? STYLE_IDS : ['classic'];
    let maxH = 0, maxE = 0;
    for (const sid of styles)
      for (let v = 0; v < Math.max(1, def.variants ?? 1); v++) {
        const r0 = buildRow(def, sid, v, 0);
        const r1 = buildRow(def, sid, v, 1);
        rows.push(r0, r1);
        maxH = Math.max(maxH, r0.height);
        maxE = Math.max(maxE, r0.extent);
        if (r0.tris > budgetOf(def)) problems.push(`${def.id} [${sid} v${v}] ${r0.tris} tris > ${budgetOf(def)}`);
        if (r1.tris >= r0.tris) problems.push(`${def.id} [${sid} v${v}] LOD1 ${r1.tris} ≥ LOD0 ${r0.tris}`);
        if (def.placement === 'surface' && r0.radius > REACH[def.footprint]) problems.push(`${def.id} [${sid} v${v}] reaches ${r0.radius.toFixed(2)} > ${REACH[def.footprint]}`);
      }
    if (def.height !== undefined) {
      const m = def.placement === 'orbit' ? maxE : maxH;
      if (m > def.height * 1.3 + 0.1 || m < def.height * 0.7 - 0.1) problems.push(`${def.id} height ${def.height} but mesh is ${m.toFixed(2)}`);
    }
    if (!def.flavor) problems.push(`${def.id} has no flavour text`);
    if (!def.group) problems.push(`${def.id} has no group`);
  }
  return { rows, problems };
}
