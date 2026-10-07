/**
 * utilities · content audit test (OWNER: utilities).
 * Run: npx vitest run -c src/content/meshes/utilities/vitest.config.ts
 */
import { describe, expect, it } from 'vitest';
import '../../items/utilities';
import '../../items/industry';
import { auditUtilities, utilityDefs } from './audit';

describe('utilities content', () => {
  it('stays inside the ploppable triangle budget at every style and LOD', () => {
    const { rows, problems } = auditUtilities();
    const worst = new Map<string, number>();
    for (const r of rows) if (r.lod === 0) worst.set(r.id, Math.max(worst.get(r.id) ?? 0, r.tris));
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.AUDIT) console.log([...worst].map(([id, t]) => `${id.padEnd(22)} ${t}`).join('\n'));
    expect(problems).toEqual([]);
    expect(utilityDefs().length).toBeGreaterThan(0);
  }, 120_000);
});
