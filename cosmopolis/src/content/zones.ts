/**
 * Zone metadata (names, colours, tiers). Zone brush items are registered in items/zoneBrushes.ts. CONTRACT.
 */
import { Zone, type ZoneFamily } from '../core/types';

export interface ZoneInfo {
  zone: Zone;
  name: string;
  short: string;
  family: ZoneFamily;
  /** lot / overlay colour (sRGB hex) */
  color: number;
  tier: number;
  description: string;
  icon: string;
}

export const ZONES: ZoneInfo[] = [
  { zone: Zone.ResLow, name: 'Residential · Low', short: 'R1', family: 'R', color: 0x6fe07a, tier: 0, icon: '🏡', description: 'Homes, villas and garden habitats.' },
  { zone: Zone.ResMed, name: 'Residential · Medium', short: 'R2', family: 'R', color: 0x3fc95a, tier: 1, icon: '🏘️', description: 'Townhouses and mid-rise apartments.' },
  { zone: Zone.ResHigh, name: 'Residential · High', short: 'R3', family: 'R', color: 0x1fa043, tier: 3, icon: '🏙️', description: 'Residential towers and sky-homes.' },
  { zone: Zone.ComLow, name: 'Commercial · Low', short: 'C1', family: 'C', color: 0x6ab8ff, tier: 0, icon: '🏪', description: 'Corner shops, cafés and market stalls.' },
  { zone: Zone.ComHigh, name: 'Commercial · High', short: 'C2', family: 'C', color: 0x2f86f0, tier: 2, icon: '🏬', description: 'Malls, department stores and trade towers.' },
  { zone: Zone.ComLeisure, name: 'Leisure & Tourism', short: 'CL', family: 'C', color: 0x3fe0e0, tier: 3, icon: '🎡', description: 'Hotels, nightlife and holo-arcades.' },
  { zone: Zone.IndGeneral, name: 'Industry · General', short: 'I1', family: 'I', color: 0xffc24a, tier: 0, icon: '🏭', description: 'Factories, workshops and depots.' },
  { zone: Zone.IndFarm, name: 'Industry · Hydroponics', short: 'IF', family: 'I', color: 0xb8e04a, tier: 1, icon: '🌾', description: 'Farms, greenhouses and protein vats.' },
  { zone: Zone.IndMining, name: 'Industry · Mining', short: 'IM', family: 'I', color: 0xd08a4a, tier: 1, icon: '⛏️', description: 'Quarries, ore processing and drills.' },
  { zone: Zone.IndTech, name: 'Industry · High-Tech', short: 'IT', family: 'I', color: 0xff8a3a, tier: 2, icon: '🔬', description: 'Clean fabs, robotics and nanoforges.' },
  { zone: Zone.Office, name: 'Office', short: 'O', family: 'O', color: 0xb58aff, tier: 3, icon: '🏢', description: 'Corporate towers, startups and data firms.' },
];

export function zoneInfo(z: Zone): ZoneInfo | undefined {
  return ZONES.find((i) => i.zone === z);
}
