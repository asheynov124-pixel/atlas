/**
 * OWNER: agent roads-props
 * Road & rail items (category 'roads', placement 'surface', cost per tile). They carry no mesh: RoadRenderer
 * (render/roads) draws the network from per-tile data; geometry and lane positions live in render/roads/lanes.ts.
 *
 *   road.capacity   vehicles (or passengers for rails) per month a tile carries — matches sim/params ROAD_CAPACITY
 *   road.speed      cruise speed in world units per real second at 1x (lanes.ts ROAD_SPECS speed)
 *   upkeep          per tile per month (matches sim/params ROAD_UPKEEP)
 */
import { RoadKind } from '../../core/types';
import { registerItems, type ItemDef } from '../catalog';
import { ROAD_SPECS } from '../../render/roads/lanes';

function road(d: Omit<ItemDef, 'category' | 'placement' | 'footprint'> & { kind: RoadKind; capacity: number }): ItemDef {
  const { kind, capacity, ...rest } = d;
  return {
    ...rest,
    category: 'roads',
    placement: 'surface',
    footprint: 1,
    road: { kind, capacity, speed: ROAD_SPECS[kind].speed },
  };
}

registerItems([
  road({
    id: 'road.path',
    name: 'Garden Path',
    group: 'Roads',
    kind: RoadKind.Path,
    capacity: 180,
    description: 'Sandstone footpath with garden bollard lights. Pedestrians and bicycles only — perfect through parks, plazas and waterfronts. Becomes a timber boardwalk over water.',
    flavor: 'The only commute where people arrive early just to enjoy it.',
    icon: '🚶',
    cost: 20,
    upkeep: 1,
    tier: 0,
    tags: ['path', 'pedestrian', 'park', 'boardwalk', 'walk'],
  }),
  road({
    id: 'road.street',
    name: 'Street',
    group: 'Roads',
    kind: RoadKind.Street,
    capacity: 650,
    description: 'Two-lane street with sidewalks, kerbs and warm street lamps. Junctions get crosswalks and traffic signals automatically; dead ends become cul-de-sacs.',
    flavor: 'Where every great city starts — and where every pothole will eventually be blamed on you.',
    icon: '🛣️',
    cost: 60,
    upkeep: 3,
    tier: 0,
    tags: ['street', 'road', 'two lane', 'local'],
  }),
  road({
    id: 'road.avenue',
    name: 'Avenue',
    group: 'Roads',
    kind: RoadKind.Avenue,
    capacity: 1600,
    description: 'Four-lane boulevard with a planted median, double-arm lamps and roundabouts at every junction. Raises the land value of everything that lines it.',
    flavor: 'Trees down the middle, ambition on both sides.',
    icon: '🌳',
    cost: 140,
    upkeep: 8,
    tier: 1,
    effects: { landValue: 4, radius: 1 },
    tags: ['avenue', 'boulevard', 'four lane', 'median', 'roundabout'],
  }),
  road({
    id: 'road.highway',
    name: 'Highway',
    group: 'Highways',
    kind: RoadKind.Highway,
    capacity: 3800,
    description: 'Six-lane raised expressway with jersey barriers, sodium masts and sign gantries. Moves enormous traffic — and enormous noise. Ramps up to meet any road it touches.',
    flavor: 'Six lanes, zero patience.',
    icon: '🚗',
    cost: 380,
    upkeep: 18,
    tier: 2,
    effects: { noise: 18, pollution: 6, landValue: -6, radius: 2 },
    tags: ['highway', 'freeway', 'expressway', 'motorway', 'six lane'],
  }),
  road({
    id: 'road.maglev',
    name: 'Maglev Line',
    group: 'Rail',
    kind: RoadKind.Maglev,
    capacity: 9000,
    description: 'Elevated magnetic-levitation guideway on slender pylons with glowing cyan rails. Silent, fast mass transit that floats over traffic, terraces and water alike.',
    flavor: 'Technically the trains are always late — they just hover a few millimetres above it.',
    icon: '🚝',
    cost: 650,
    upkeep: 24,
    tier: 4,
    effects: { landValue: 3, radius: 2 },
    tags: ['rail', 'maglev', 'train', 'transit', 'elevated', 'monorail'],
  }),
  road({
    id: 'road.hyperloop',
    name: 'Hyperloop Tube',
    group: 'Rail',
    kind: RoadKind.Hyperloop,
    capacity: 16000,
    description: 'Twin vacuum tubes on Y-pylons; pods shoot through at near-orbital speeds. Junctions and terminals become glowing capsule stations.',
    flavor: 'Commute time: shorter than the safety briefing.',
    icon: '🚄',
    cost: 1600,
    upkeep: 38,
    tier: 6,
    effects: { landValue: 5, radius: 2 },
    tags: ['hyperloop', 'tube', 'vacuum', 'rail', 'transit', 'pod'],
  }),
]);
