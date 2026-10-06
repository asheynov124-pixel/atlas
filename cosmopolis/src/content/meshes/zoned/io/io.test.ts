/**
 * zoned-io · content audit test (OWNER: zoned-io).
 * Every industrial & office growable, in every style × level × a spread of variants, must stay inside the
 * 400-triangle growable budget at LOD0, inside FOOTPRINT_RADIUS at both LODs, be deterministic, climb with level
 * and never produce an empty LOD1.
 */
import { describe, expect, it } from 'vitest';
import '../../../items/growIndOffice';
import { allItems } from '../../../catalog';
import { Zone } from '../../../../core/types';
import { auditIO } from './audit';

const io = () => allItems().filter((d) => d.id.startsWith('io_'));

describe('zoned-io growables', () => {
  it('registers at least 26 growables across all five zones', () => {
    const defs = io();
    expect(defs.length).toBeGreaterThanOrEqual(26);
    for (const z of [Zone.IndGeneral, Zone.IndFarm, Zone.IndMining, Zone.IndTech, Zone.Office]) {
      expect(defs.filter((d) => d.growable?.zone === z).length).toBeGreaterThanOrEqual(4);
    }
    for (const d of defs) {
      expect(d.category).toBe('zones');
      expect(d.hidden).toBe(true);
      expect(d.styleable).toBe(true);
      expect(d.footprint).toBe(1);
      expect(d.variants).toBeGreaterThanOrEqual(6);
      expect(d.variants).toBeLessThanOrEqual(12);
      expect(d.effects?.jobs ?? 0).toBeGreaterThan(0);
      expect(d.flavor?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('stays inside the triangle budget and the lot at every style, level and LOD', () => {
    const { rows, problems } = auditIO('io_', 3);
    expect(rows.length).toBeGreaterThan(0);
    expect(problems).toEqual([]);
    for (const r of rows) if (r.lod === 1) expect(r.tris).toBeGreaterThan(8);
  }, 120_000);

  it('is deterministic and grows taller or denser with level', () => {
    const { rows } = auditIO('io_', 2);
    const key = (r: { id: string; style: string; variant: number; lod: number }) => `${r.id}|${r.style}|${r.variant}|${r.lod}`;
    const by = new Map<string, number[][]>();
    for (const r of rows) {
      if (!by.has(key(r))) by.set(key(r), []);
      by.get(key(r))![r.level - 1] = [r.height, r.tris];
    }
    let flat = 0;
    for (const [k, lv] of by) {
      if (!k.endsWith('|0')) continue;
      // level 5 must be taller or noticeably busier than level 1
      if (!(lv[4][0] > lv[0][0] + 0.05 || lv[4][1] > lv[0][1] * 1.15)) flat++;
    }
    expect(flat).toBe(0);
    const again = auditIO('io_', 2).rows;
    expect(again.map((r) => r.tris)).toEqual(rows.map((r) => r.tris));
  }, 120_000);
});
