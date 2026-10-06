/** Zone paint brushes (FOUNDATION). Growable buildings live in growResCom.ts / growIndOffice.ts. */
import { registerItems, type ItemDef } from '../catalog';
import { ZONES } from '../zones';
import { Zone } from '../../core/types';

const brushes: ItemDef[] = ZONES.map((z) => ({
  id: `zone_${z.short.toLowerCase()}`,
  name: z.name,
  category: 'zones' as const,
  group: z.family === 'R' ? 'Residential' : z.family === 'C' ? 'Commercial' : z.family === 'I' ? 'Industrial' : 'Office',
  description: z.description,
  icon: z.icon,
  footprint: 1 as const,
  placement: 'surface' as const,
  cost: 0,
  upkeep: 0,
  tier: z.tier,
  zone: z.zone,
  tool: 'zone',
}));
brushes.push({
  id: 'zone_clear',
  name: 'De-zone',
  category: 'zones',
  group: 'Tools',
  description: 'Remove zoning from tiles (existing buildings stay until abandoned).',
  icon: '🧽',
  footprint: 1,
  placement: 'surface',
  cost: 0,
  upkeep: 0,
  tier: 0,
  zone: Zone.None,
  tool: 'zone',
});
registerItems(brushes);
