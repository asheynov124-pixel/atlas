/**
 * zoned-io · content audit (OWNER: zoned-io). Dev / test tooling — not imported by the game.
 *
 * Builds every io_* growable for every style × level × a spread of variants at LOD0 and LOD1 and reports
 * triangle counts, the furthest vertex from the lot centre (must stay inside FOOTPRINT_RADIUS) and the
 * height. Run from a test: `auditIO()` → rows + a list of violations.
 */
import { allItems } from '../../../catalog';
import { MeshBuilder } from '../../../kit';
import { STYLES, STYLE_IDS } from '../../../styles';
import { Rng, hashString } from '../../../../core/rng';
import { BUDGET, RMAX } from './common';

export interface AuditRow {
  id: string;
  style: string;
  level: number;
  variant: number;
  lod: 0 | 1;
  tris: number;
  radius: number;
  height: number;
}

export function auditIO(prefix = 'io_', variants = 4): { rows: AuditRow[]; problems: string[] } {
  const rows: AuditRow[] = [];
  const problems: string[] = [];
  for (const def of allItems()) {
    if (!def.id.startsWith(prefix) || !def.mesh) continue;
    const nv = Math.min(variants, def.variants ?? 1);
    for (const sid of STYLE_IDS)
      for (let level = 1; level <= 5; level++)
        for (let variant = 0; variant < nv; variant++)
          for (const lod of [0, 1] as const) {
            const b = new MeshBuilder(lod);
            def.mesh({ b, rng: new Rng(hashString(`${def.id}|${variant}|${level}|${sid}`)), def, variant, level, styleId: sid, style: STYLES[sid], lod, footprint: def.footprint });
            const g = b.build();
            const pos = g.getAttribute('position');
            let r = 0, h = 0;
            for (let i = 0; i < pos.count; i++) {
              r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
              h = Math.max(h, pos.getY(i));
            }
            const row: AuditRow = { id: def.id, style: sid, level, variant, lod, tris: b.triangles, radius: r, height: h };
            rows.push(row);
            const inRange = level >= (def.growable?.minLevel ?? 1) && level <= (def.growable?.maxLevel ?? 5);
            if (lod === 0 && b.triangles > BUDGET) problems.push(`${def.id} ${sid} L${level} v${variant}: ${b.triangles} tris${inRange ? '' : ' (outside level range)'}`);
            if (r > RMAX + 0.005) problems.push(`${def.id} ${sid} L${level} v${variant} lod${lod}: radius ${r.toFixed(3)}`);
            g.dispose();
          }
  }
  return { rows, problems };
}
