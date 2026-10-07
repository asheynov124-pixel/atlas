/**
 * utilities · content audit (OWNER: utilities).
 * Builds every utility / industry / transit ploppable at both LODs in a spread of styles and reports triangle
 * counts, footprint overhang and empty geometry. Used by utilities.test.ts and handy from the console.
 */
import { allItems, getGeometry, type ItemDef } from '../../catalog';
import { FOOTPRINT_RADIUS } from '../../kit';
import type { StyleId } from '../../../core/types';

export interface AuditRow {
  id: string;
  style: StyleId;
  lod: 0 | 1;
  variant: number;
  tris: number;
  /** horizontal extent beyond the footprint radius (world units, at ground level ≤ 0.6 high) */
  overhang: number;
  height: number;
}

export const UTILITY_CATEGORIES = new Set(['power', 'water', 'industry', 'transit']);

export function utilityDefs(): ItemDef[] {
  return allItems().filter((d) => UTILITY_CATEGORIES.has(d.category) && d.mesh && /^(power|water|air|waste|data|ind|tr)\./.test(d.id));
}

export function auditUtilities(styles: StyleId[] = ['classic', 'cyber', 'organic']): { rows: AuditRow[]; problems: string[] } {
  const rows: AuditRow[] = [];
  const problems: string[] = [];
  for (const d of utilityDefs()) {
    const vs = Math.max(1, d.variants ?? 1);
    for (const style of styles)
      for (let variant = 0; variant < vs; variant++)
        for (const lod of [0, 1] as const) {
          const g = getGeometry(d.id, { style, lod, variant });
          if (!g) {
            problems.push(`${d.id}: no geometry`);
            continue;
          }
          const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
          const pos = g.getAttribute('position');
          let over = 0, maxY = 0;
          const R = FOOTPRINT_RADIUS[d.footprint];
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            if (!Number.isFinite(x + y + z)) {
              problems.push(`${d.id}: non-finite vertex`);
              break;
            }
            maxY = Math.max(maxY, y);
            if (y < 0.6) over = Math.max(over, Math.hypot(x, z) - R);
          }
          rows.push({ id: d.id, style, lod, variant, tris, overhang: over, height: maxY });
          if (lod === 0 && tris > 1500) problems.push(`${d.id} [${style}/v${variant}]: ${tris} triangles > 1500`);
          if (tris === 0) problems.push(`${d.id} [${style}/lod${lod}]: empty`);
          if (g.getAttribute('position').count === 24 && tris === 12) problems.push(`${d.id}: placeholder box (factory threw?)`);
        }
  }
  return { rows, problems };
}
