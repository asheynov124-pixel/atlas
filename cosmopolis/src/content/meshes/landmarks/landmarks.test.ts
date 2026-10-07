/**
 * landmarks · budget, footprint, determinism and progression checks for every landmark, wonder and orbital
 * (OWNER: landmarks). Run: npx vitest run -c src/content/meshes/landmarks/vitest.config.ts
 */
import { describe, expect, it } from 'vitest';
import '../../items/landmarks';
import '../../items/orbital';
import { getGeometry } from '../../catalog';
import { auditLandmarks, ownItems } from './audit';

describe('landmarks content', () => {
  const items = ownItems();
  const landmarks = items.filter((d) => d.category === 'landmarks' && d.group === 'Landmarks');
  const wonders = items.filter((d) => d.category === 'landmarks' && d.group === 'Wonders');
  const orbitals = items.filter((d) => d.category === 'orbital');

  it('registers the full roster', () => {
    expect(landmarks.length).toBeGreaterThanOrEqual(22);
    expect(wonders.length).toBeGreaterThanOrEqual(12);
    expect(orbitals.length).toBeGreaterThanOrEqual(15);
    for (const d of landmarks) {
      expect(d.unique, d.id).toBe(true);
      expect(d.tier, d.id).toBeLessThanOrEqual(6);
    }
    for (const d of wonders) {
      expect(d.unique, d.id).toBe(true);
      expect(d.footprint, d.id).toBe(19);
      expect(d.tier, d.id).toBeGreaterThanOrEqual(5);
      expect(d.tags, d.id).toContain('wonder');
    }
    for (const d of orbitals) {
      expect(d.placement, d.id).toBe('orbit');
      expect(d.orbit, d.id).toBeDefined();
    }
  });

  it('carries the progression tags', () => {
    const tagged = (t: string) => items.filter((d) => d.tags?.includes(t)).map((d) => d.id);
    expect(tagged('warpgate')).toEqual(['wonder_warp_gate']);
    expect(tagged('intergalactic')).toEqual(['wonder_intergalactic_gate']);
    expect(tagged('shield')).toContain('wonder_shield_generator');
    expect(tagged('ring')).toEqual(['orb_orbital_ring']);
    expect(orbitals.some((d) => d.tags?.includes('defense'))).toBe(true);
    expect(items.find((d) => d.id === 'wonder_arcology_prime')?.effects?.housing).toBe(20_000);
    expect(items.find((d) => d.id === 'wonder_intergalactic_gate')?.tier).toBe(8);
    // only the real orbital ring may look like one to cosmos/Progression (id regex /ring/ on orbitals)
    expect(orbitals.filter((d) => /ring/i.test(d.id)).map((d) => d.id)).toEqual(['orb_orbital_ring']);
  });

  it('every mesh fits its budget, footprint and LOD contract', () => {
    const { rows, problems } = auditLandmarks();
    const lod0 = rows.filter((r) => r.lod === 0).sort((a, b) => b.tris - a.tris);
    console.info('heaviest:', lod0.slice(0, 14).map((r) => `${r.id}${r.style !== '-' ? '/' + r.style : ''}:${r.tris}`).join(' '));
    expect(problems).toEqual([]);
  });

  it('stats are sensible', () => {
    for (const d of items) {
      expect(d.cost, d.id).toBeGreaterThan(0);
      expect(d.upkeep, d.id).toBeGreaterThan(0);
      expect(d.upkeep, d.id).toBeLessThan(d.cost * 0.05);
      expect(d.description.length, d.id).toBeGreaterThan(40);
      const e = d.effects ?? {};
      expect(Math.abs(e.landValue ?? 0), d.id).toBeLessThanOrEqual(50);
      expect(Math.abs(e.happiness ?? 0), d.id).toBeLessThanOrEqual(20);
    }
    for (const d of landmarks) expect(d.cost, d.id).toBeLessThanOrEqual(150_000);
    for (const d of wonders) expect(d.cost, d.id).toBeGreaterThanOrEqual(250_000);
    const ids = new Set(items.map((d) => d.id));
    expect(ids.size).toBe(items.length);
  });

  it('geometry is deterministic and cached', () => {
    for (const d of items) {
      const a = getGeometry(d.id, { style: 'neo' });
      const b = getGeometry(d.id, { style: 'neo' });
      expect(a).toBe(b);
      expect(a!.getAttribute('position').count).toBeGreaterThan(0);
    }
  });
});
