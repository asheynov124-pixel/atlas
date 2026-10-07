/**
 * services · budget, footprint, determinism and balance checks for every services / education / leisure item
 * (OWNER: services). Run: npx vitest run -c src/content/meshes/services/vitest.config.ts
 */
import { describe, expect, it } from 'vitest';
import '../../items/services';
import '../../items/education';
import '../../items/leisure';
import { getGeometry } from '../../catalog';
import { auditServices, ownItems } from './audit';

const SERVICE_IDS = ['police', 'fire', 'health', 'education', 'research', 'leisure', 'deathcare', 'spiritual'];

describe('services content', () => {
  const items = ownItems();
  it('registers at least 55 bespoke ploppables across the three categories', () => {
    expect(items.length).toBeGreaterThanOrEqual(55);
    for (const c of ['services', 'education', 'leisure']) expect(items.filter((d) => d.category === c).length).toBeGreaterThan(8);
    const tiers = new Set(items.map((d) => d.tier));
    for (let t = 0; t <= 8; t++) expect(tiers.has(t), `tier ${t}`).toBe(true);
  });

  it('every mesh fits its budget, footprint and LOD contract', () => {
    const { rows, problems } = auditServices();
    const worst = [...rows].filter((r) => r.lod === 0).sort((a, b) => b.tris - a.tris).slice(0, 12);
    console.info('heaviest:', worst.map((r) => `${r.id}${r.style !== '-' ? '/' + r.style : ''}:${r.tris}`).join(' '));
    expect(problems).toEqual([]);
  });

  it('stats are sensible', () => {
    for (const d of items) {
      expect(d.cost, d.id).toBeGreaterThan(0);
      expect(d.upkeep, d.id).toBeGreaterThanOrEqual(0);
      expect(d.upkeep, d.id).toBeLessThan(d.cost * 0.12);
      expect(d.tier, d.id).toBeGreaterThanOrEqual(0);
      expect(d.tier, d.id).toBeLessThanOrEqual(8);
      expect(d.description.length, d.id).toBeGreaterThan(20);
      for (const c of d.coverage ?? []) {
        expect(SERVICE_IDS, d.id).toContain(c.service);
        expect(c.radius, d.id).toBeGreaterThan(0);
        expect(c.radius, d.id).toBeLessThanOrEqual(40);
        expect(c.strength, d.id).toBeGreaterThan(0);
        expect(c.strength, d.id).toBeLessThanOrEqual(1);
      }
      if (d.category !== 'leisure') expect((d.coverage ?? []).length + (d.tags?.length ?? 0), d.id).toBeGreaterThan(0);
    }
    expect(items.some((d) => d.tags?.includes('shelter'))).toBe(true);
    expect(items.some((d) => d.tags?.includes('weather'))).toBe(true);
    for (const s of SERVICE_IDS) expect(items.some((d) => d.coverage?.some((c) => c.service === s)), s).toBe(true);
  });

  it('geometry is deterministic and cached', () => {
    for (const d of items.slice(0, 20)) {
      const a = getGeometry(d.id, { variant: 0, style: 'neo' });
      const b = getGeometry(d.id, { variant: 0, style: 'neo' });
      expect(a).toBe(b);
      expect(a!.getAttribute('position').count).toBeGreaterThan(0);
    }
  });
});
