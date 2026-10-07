import { it } from 'vitest';
import '../../../items/growIndOffice';
import { auditIO } from './audit';
it('report', () => {
  const { rows, problems } = auditIO('io_', 4);
  const by = new Map<string, { t: number[]; r: number; h: number[]; t1: number[] }>();
  for (const r of rows) {
    const e = by.get(r.id) ?? { t: [0, 0, 0, 0, 0], r: 0, h: [0, 0, 0, 0, 0], t1: [0, 0, 0, 0, 0] };
    if (r.lod === 0) { e.t[r.level - 1] = Math.max(e.t[r.level - 1], r.tris); e.h[r.level - 1] = Math.max(e.h[r.level - 1], r.height); }
    else e.t1[r.level - 1] = Math.max(e.t1[r.level - 1], r.tris);
    e.r = Math.max(e.r, r.radius);
    by.set(r.id, e);
  }
  const lines: string[] = [];
  for (const [id, e] of by) lines.push(`${id.padEnd(18)} tris ${e.t.map((v) => String(v).padStart(3)).join(' ')} | lod1 ${e.t1.map((v) => String(v).padStart(3)).join(' ')} | r ${e.r.toFixed(2)} | h ${e.h.map((v) => v.toFixed(1)).join(' ')}`);
  console.log(lines.join('\n') + '\nPROBLEMS ' + problems.length + '\n' + [...new Set(problems.map((p) => p.replace(/ v\d+.*?:/, ':')))].slice(0, 60).join('\n'));
});
