/**
 * OWNER: agent zoned-rc
 * Residential + commercial growable buildings (zones R1 R2 R3 · C1 C2 CL), 5 levels × 8 styles × 6–12 variants.
 *
 * Geometry lives in content/meshes/zoned/rc/ (one Skin per architectural style + massing factories per type).
 * Effects are the capacity at the type's typical level; the simulation may scale them by building level.
 * Every type renders sensibly at any level 1..5; `growable.minLevel/maxLevel` is where it naturally appears.
 */
import { registerItems, type Effects, type ItemDef, type MeshFactory } from '../catalog';
import { Zone } from '../../core/types';
import * as R from '../meshes/zoned/rc/residential';
import * as C from '../meshes/zoned/rc/commercial';
import * as X from '../meshes/zoned/rc/leisure';

const ZONE_META: Record<number, { tier: number; group: string; family: 'R' | 'C'; density: string }> = {
  [Zone.ResLow]: { tier: 0, group: 'Homes', family: 'R', density: 'low' },
  [Zone.ResMed]: { tier: 1, group: 'Apartments', family: 'R', density: 'medium' },
  [Zone.ResHigh]: { tier: 3, group: 'Residential Towers', family: 'R', density: 'high' },
  [Zone.ComLow]: { tier: 0, group: 'Shops', family: 'C', density: 'low' },
  [Zone.ComHigh]: { tier: 2, group: 'Retail', family: 'C', density: 'high' },
  [Zone.ComLeisure]: { tier: 3, group: 'Leisure & Tourism', family: 'C', density: 'leisure' },
};

interface Grow {
  id: string;
  name: string;
  zone: Zone;
  levels: [number, number];
  variants: number;
  mesh: MeshFactory;
  height: number;
  icon: string;
  description: string;
  flavor: string;
  effects: Effects;
  tags?: string[];
}

function grow(g: Grow): ItemDef {
  const m = ZONE_META[g.zone];
  return {
    id: g.id,
    name: g.name,
    category: 'zones',
    group: m.group,
    description: g.description,
    flavor: g.flavor,
    icon: g.icon,
    footprint: 1,
    placement: 'surface',
    cost: 0,
    upkeep: 0,
    tier: m.tier,
    growable: { zone: g.zone, minLevel: g.levels[0], maxLevel: g.levels[1] },
    styleable: true,
    hidden: true,
    variants: g.variants,
    mesh: g.mesh,
    height: g.height,
    effects: g.effects,
    tags: ['growable', m.family === 'R' ? 'residential' : 'commercial', m.density, ...(g.tags ?? [])],
  };
}

const RES_LOW: Grow[] = [
  {
    id: 'rc_rl_cottage', name: 'Starter Cottage', zone: Zone.ResLow, levels: [1, 3], variants: 10, mesh: R.cottage, height: 1.15, icon: '🏠',
    description: 'A modest first home with a garden, a chimney and room to grow.',
    flavor: 'Comes with a white picket force-field.',
    effects: { housing: 6, power: -0.5, water: -0.5, landValue: 2 },
  },
  {
    id: 'rc_rl_family', name: 'Family Home', zone: Zone.ResLow, levels: [1, 4], variants: 10, mesh: R.familyHome, height: 1.15, icon: '🏡',
    description: 'Two storeys, a garage for the hover-car and a lawn that needs mowing every orbit.',
    flavor: 'Two kids, one robot dog, zero parking disputes. Yet.',
    effects: { housing: 8, power: -0.8, water: -0.7, landValue: 3 },
  },
  {
    id: 'rc_rl_bungalow', name: 'Ranch Bungalow', zone: Zone.ResLow, levels: [1, 3], variants: 8, mesh: R.bungalow, height: 1.15, icon: '🛖',
    description: 'Long, low single-storey living with a carport and a big back yard.',
    flavor: 'For colonists who have had enough of stairs (and gravity).',
    effects: { housing: 6, power: -0.6, water: -0.6, landValue: 2 },
  },
  {
    id: 'rc_rl_duplex', name: 'Twin Duplex', zone: Zone.ResLow, levels: [1, 3], variants: 8, mesh: R.duplex, height: 0.95, icon: '🏘️',
    description: 'Two mirrored homes sharing one wall and one very long hedge.',
    flavor: 'Shared wall, separate Wi-Fi. Peace in our time.',
    effects: { housing: 10, power: -0.9, water: -0.8, landValue: 1 },
  },
  {
    id: 'rc_rl_dome', name: 'Habitat Dome Home', zone: Zone.ResLow, levels: [1, 4], variants: 8, mesh: R.domeHome, height: 0.8, icon: '🫧',
    description: 'Pressurised pods linked by glass tubes, with a greenhouse once the family settles in.',
    flavor: 'Mind the airlock when collecting the mail.',
    effects: { housing: 7, power: -0.9, water: -0.5, oxygen: -0.5, landValue: 2 },
    tags: ['dome'],
  },
  {
    id: 'rc_rl_villa', name: 'Garden Villa', zone: Zone.ResLow, levels: [3, 5], variants: 8, mesh: R.villa, height: 1.15, icon: '🏖️',
    description: 'A luxury villa with a pool terrace, palms and a studio wing.',
    flavor: 'Infinity pool, finite neighbours.',
    effects: { housing: 10, power: -1.2, water: -1.5, landValue: 8, happiness: 2 },
    tags: ['luxury'],
  },
  {
    id: 'rc_rl_estate', name: 'Grand Estate', zone: Zone.ResLow, levels: [4, 5], variants: 6, mesh: R.estate, height: 1.15, icon: '🏰',
    description: 'A symmetrical mansion with wings, a portico, a forecourt fountain and clipped hedges.',
    flavor: 'The fountain was imported from Earth. The butler tells everyone.',
    effects: { housing: 14, power: -1.8, water: -1.8, landValue: 12, happiness: 3 },
    tags: ['luxury'],
  },
];

const RES_MED: Grow[] = [
  {
    id: 'rc_rm_townhouse', name: 'Townhouses', zone: Zone.ResMed, levels: [1, 4], variants: 10, mesh: R.townhouses, height: 1.8, icon: '🏘️',
    description: 'Three tall, narrow homes shoulder to shoulder, each painted its own colour.',
    flavor: 'The giraffes of urban housing.',
    effects: { housing: 24, power: -1, water: -1, landValue: 3 },
  },
  {
    id: 'rc_rm_terrace', name: 'Terrace Row', zone: Zone.ResMed, levels: [1, 3], variants: 8, mesh: R.terraceRow, height: 1.4, icon: '🏚️',
    description: 'A row of four terraced homes with front gardens under one long roof.',
    flavor: 'Four front doors, four doormats, one ongoing hedge dispute.',
    effects: { housing: 30, power: -1.2, water: -1.2, landValue: 2 },
  },
  {
    id: 'rc_rm_walkup', name: 'Walk-up Flats', zone: Zone.ResMed, levels: [1, 3], variants: 8, mesh: R.walkup, height: 2.0, icon: '🏢',
    description: 'A sturdy apartment block with balconies on every floor.',
    flavor: "The lift is 'coming soon'. It has been since 2341.",
    effects: { housing: 40, power: -1.4, water: -1.4, noise: 2 },
  },
  {
    id: 'rc_rm_courtyard', name: 'Courtyard Apartments', zone: Zone.ResMed, levels: [2, 5], variants: 8, mesh: R.courtyard, height: 2.0, icon: '🏬',
    description: 'Three wings wrapped around a leafy private court with a fountain.',
    flavor: 'Features a bird bath with strong opinions.',
    effects: { housing: 60, power: -1.6, water: -1.6, landValue: 4, happiness: 1 },
  },
  {
    id: 'rc_rm_midrise', name: 'Mid-rise Residences', zone: Zone.ResMed, levels: [3, 5], variants: 8, mesh: R.midrise, height: 3.0, icon: '🏨',
    description: 'A handsome mid-rise with continuous balconies and a penthouse terrace.',
    flavor: 'Balconies for everyone, and a penthouse for someone.',
    effects: { housing: 90, power: -2, water: -2, landValue: 4 },
  },
  {
    id: 'rc_rm_terraced', name: 'Stepped Terraces', zone: Zone.ResMed, levels: [2, 5], variants: 8, mesh: R.steppedTerraces, height: 2.2, icon: '🪜',
    description: 'Apartments stepping back from the street so every tier gets a planted terrace.',
    flavor: "Every home has a rooftop garden. It's the neighbour's roof.",
    effects: { housing: 70, power: -1.8, water: -1.8, landValue: 5, happiness: 1 },
  },
];

const RES_HIGH: Grow[] = [
  {
    id: 'rc_rh_slab', name: 'Residential Slab', zone: Zone.ResHigh, levels: [1, 3], variants: 8, mesh: R.slab, height: 4.8, icon: '🏢',
    description: 'A long slab block with balcony bands — efficient, upright and full of life.',
    flavor: 'Hosts the occasional synchronised balcony concert.',
    effects: { housing: 220, power: -3, water: -3, noise: 4 },
  },
  {
    id: 'rc_rh_tower', name: 'Point Tower', zone: Zone.ResHigh, levels: [1, 5], variants: 9, mesh: R.pointTower, height: 11, icon: '🏙️',
    description: 'A slender residential tower that sprouts setbacks, terraces and a crown as it grows.',
    flavor: 'Rent goes up one floor at a time.',
    effects: { housing: 260, power: -3.5, water: -3.5, landValue: 2 },
  },
  {
    id: 'rc_rh_rotunda', name: 'Rotunda Tower', zone: Zone.ResHigh, levels: [1, 4], variants: 8, mesh: R.rotunda, height: 9.4, icon: '🗼',
    description: 'A round tower ringed with balconies and a panoramic crown.',
    flavor: 'No corners to sweep, no corner offices to fight over.',
    effects: { housing: 240, power: -3.2, water: -3.2, landValue: 3 },
  },
  {
    id: 'rc_rh_twin', name: 'Twin Towers', zone: Zone.ResHigh, levels: [3, 5], variants: 8, mesh: R.twinTowers, height: 10.2, icon: '👯',
    description: 'Two towers on a shared podium, linked by glazed sky-bridges.',
    flavor: 'Connected by sky-bridges and a long-running sibling rivalry.',
    effects: { housing: 380, power: -4.5, water: -4.5, landValue: 4 },
  },
  {
    id: 'rc_rh_skygarden', name: 'Sky Garden Tower', zone: Zone.ResHigh, levels: [3, 5], variants: 8, mesh: R.skyGarden, height: 8, icon: '🌳',
    description: 'A tower split by open-air sky gardens full of trees, every dozen floors.',
    flavor: 'Forest on floor 20. Squirrels report severe vertigo.',
    effects: { housing: 320, power: -4, water: -4.5, landValue: 6, happiness: 2 },
    tags: ['green'],
  },
  {
    id: 'rc_rh_podium', name: 'Podium Tower', zone: Zone.ResHigh, levels: [2, 5], variants: 8, mesh: R.podiumTower, height: 9.6, icon: '🏬',
    description: 'Shops in the podium, a pool deck on top and homes in the tower above.',
    flavor: 'Shops downstairs, view upstairs — never leave the block again.',
    effects: { housing: 300, jobs: 20, power: -4.2, water: -4, landValue: 4 },
  },
  {
    id: 'rc_rh_spire', name: 'Spire Residences', zone: Zone.ResHigh, levels: [4, 5], variants: 8, mesh: R.spire, height: 13, icon: '🗼',
    description: 'A tapering supertall with four setbacks and a needle spire.',
    flavor: 'The spire scrapes the sky; the HOA bills it for maintenance.',
    effects: { housing: 480, power: -5.5, water: -5, landValue: 6, tourism: 10 },
    tags: ['supertall'],
  },
  {
    id: 'rc_rh_icon', name: 'Celestial Icon', zone: Zone.ResHigh, levels: [5, 5], variants: 6, mesh: R.icon, height: 15, icon: '✨',
    description: 'A signature skyscraper — twisting, needle-thin or stacked — that defines a skyline.',
    flavor: 'Architects from three galaxies argue about it. Residents just enjoy the view.',
    effects: { housing: 640, power: -6, water: -6, landValue: 10, tourism: 30, happiness: 2 },
    tags: ['supertall', 'icon'],
  },
];

const COM_LOW: Grow[] = [
  {
    id: 'rc_cl_corner', name: 'Corner Shop', zone: Zone.ComLow, levels: [1, 4], variants: 10, mesh: C.cornerShop, height: 1.6, icon: '🏪',
    description: 'A neighbourhood shop with lit windows and flats upstairs; turns the corner as it grows.',
    flavor: 'Sells milk, batteries and suspiciously fresh asteroid gossip.',
    effects: { jobs: 8, power: -1, water: -0.5, noise: 4, landValue: 1 },
  },
  {
    id: 'rc_cl_cafe', name: 'Café', zone: Zone.ComLow, levels: [1, 3], variants: 10, mesh: C.cafe, height: 1.2, icon: '☕',
    description: 'A café with a parasol terrace on the pavement — and on the roof, once business is good.',
    flavor: 'Its flat white is so flat it violates three laws of physics.',
    effects: { jobs: 6, power: -0.8, water: -0.6, noise: 3, happiness: 1 },
  },
  {
    id: 'rc_cl_strip', name: 'Strip Plaza', zone: Zone.ComLow, levels: [1, 3], variants: 8, mesh: C.stripPlaza, height: 0.8, icon: '🛍️',
    description: 'Three little shops in a row behind a parking apron and a glowing roadside pylon.',
    flavor: 'Three shops, one car park, infinite trolley-return guilt.',
    effects: { jobs: 14, power: -1.5, water: -0.6, noise: 6 },
  },
  {
    id: 'rc_cl_market', name: 'Market Hall', zone: Zone.ComLow, levels: [2, 5], variants: 8, mesh: C.marketHall, height: 1.4, icon: '🧺',
    description: 'A covered market hall with striped stalls spilling out onto the square.',
    flavor: 'Fresh produce from four biomes and a fishmonger who has seen things.',
    effects: { jobs: 18, power: -1.2, water: -1, noise: 6, landValue: 2, happiness: 1 },
  },
  {
    id: 'rc_cl_shophouse', name: 'Shophouses', zone: Zone.ComLow, levels: [2, 5], variants: 10, mesh: C.shophouses, height: 1.8, icon: '🏬',
    description: 'Twin narrow shophouses: storefronts and blade signs below, balconies and homes above.',
    flavor: 'Shop downstairs, nap upstairs. Commute: fourteen stairs.',
    effects: { jobs: 12, housing: 6, power: -1.5, water: -1, noise: 5 },
  },
  {
    id: 'rc_cl_fuel', name: 'Hover-Fuel Stop', zone: Zone.ComLow, levels: [1, 3], variants: 8, mesh: C.fuelStop, height: 1.0, icon: '⛽',
    description: 'Fusion-cell pumps under a lit canopy, a snack kiosk and a price pylon you can see from orbit.',
    flavor: 'Sells wiper fluid for cars that have not had windscreens since 2290.',
    effects: { jobs: 6, power: -2, noise: 8, pollution: 4 },
  },
  {
    id: 'rc_cl_diner', name: 'Orbit Diner', zone: Zone.ComLow, levels: [1, 3], variants: 8, mesh: C.diner, height: 0.5, icon: '🍔',
    description: 'A chrome-banded roadside diner with a neon rooftop sign and a hover-car lot.',
    flavor: 'Open 26 hours a day (it is a long day here).',
    effects: { jobs: 8, power: -1, water: -0.8, noise: 5, happiness: 1 },
  },
];

const COM_HIGH: Grow[] = [
  {
    id: 'rc_ch_mall', name: 'Shopping Mall', zone: Zone.ComHigh, levels: [1, 4], variants: 8, mesh: C.mall, height: 1.6, icon: '🛒',
    description: 'A big-box mall with a glazed atrium entrance, banners and — at level 4 — a glass dome court.',
    flavor: 'Air-conditioned, sun-proofed and absolutely impossible to leave.',
    effects: { jobs: 60, power: -3, water: -1.5, noise: 10 },
  },
  {
    id: 'rc_ch_dept', name: 'Department Store', zone: Zone.ComHigh, levels: [2, 5], variants: 8, mesh: C.deptStore, height: 2.2, icon: '🏬',
    description: 'A grand department store with display windows, a vertical blade sign and a rooftop name.',
    flavor: 'Seven floors and one escalator that always goes the wrong way.',
    effects: { jobs: 80, power: -3, water: -1.5, noise: 8, landValue: 3 },
  },
  {
    id: 'rc_ch_trade', name: 'Trade Tower', zone: Zone.ComHigh, levels: [3, 5], variants: 8, mesh: C.tradeTower, height: 9.8, icon: '🏢',
    description: 'A glass trading tower on a retail podium, flanked by animated billboards.',
    flavor: 'Where interplanetary deals close and the billboards never sleep.',
    effects: { jobs: 180, power: -4, water: -2, noise: 6, landValue: 4 },
  },
  {
    id: 'rc_ch_plaza', name: 'Retail Plaza Tower', zone: Zone.ComHigh, levels: [2, 5], variants: 8, mesh: C.retailPlaza, height: 5.4, icon: '🏙️',
    description: 'Shops wrap a planted podium; a slim tower of studios and showrooms rises above.',
    flavor: 'Shops on the podium, start-ups in the tower, smoothies everywhere.',
    effects: { jobs: 120, power: -3.5, water: -2, noise: 8, landValue: 2 },
  },
  {
    id: 'rc_ch_galleria', name: 'Galleria', zone: Zone.ComHigh, levels: [3, 5], variants: 8, mesh: C.galleria, height: 1.8, icon: '🏛️',
    description: 'Two arcades joined by a soaring glass barrel vault — window shopping as a spectator sport.',
    flavor: 'Visitors have been known to forget which planet they are on.',
    effects: { jobs: 90, power: -3, water: -1.5, noise: 6, landValue: 5, tourism: 10 },
  },
  {
    id: 'rc_ch_megastore', name: 'Megastore', zone: Zone.ComHigh, levels: [1, 3], variants: 8, mesh: C.megastore, height: 1.4, icon: '📦',
    description: 'A warehouse-sized store with a giant glowing name and a hover-car park.',
    flavor: 'Sells everything from socks to starship hulls. Aisle 9 000.',
    effects: { jobs: 50, power: -3, water: -1, noise: 10, pollution: 2 },
  },
  {
    id: 'rc_ch_dome', name: 'Market Dome', zone: Zone.ComHigh, levels: [2, 5], variants: 8, mesh: C.marketDome, height: 1.1, icon: '🫧',
    description: 'A climate-controlled bazaar under one enormous glazed dome, topped by a lantern at level 4.',
    flavor: 'The only market where it has never, ever rained.',
    effects: { jobs: 70, power: -3, water: -1.5, noise: 6, tourism: 8 },
  },
];

const LEISURE: Grow[] = [
  {
    id: 'rc_cx_hotel', name: 'Grand Hotel', zone: Zone.ComLeisure, levels: [1, 5], variants: 8, mesh: X.hotel, height: 7.8, icon: '🏨',
    description: 'A hotel that grows from a boutique block into a crowned tower with a pool deck.',
    flavor: 'Every room has a view; the penthouse has two planets.',
    effects: { jobs: 60, tourism: 60, power: -4, water: -3, noise: 6, landValue: 4 },
  },
  {
    id: 'rc_cx_casino', name: 'Casino', zone: Zone.ComLeisure, levels: [2, 5], variants: 8, mesh: X.casino, height: 4.0, icon: '🎰',
    description: 'Golden dome, marquee, giant screen and searchlights — plus a hotel tower at level 4.',
    flavor: 'The house always wins. The house is also visible from orbit.',
    effects: { jobs: 80, tourism: 90, income: 300, power: -5, water: -2, noise: 20, happiness: 2, landValue: -2 },
  },
  {
    id: 'rc_cx_club', name: 'Nightclub', zone: Zone.ComLeisure, levels: [1, 4], variants: 8, mesh: X.nightclub, height: 3.4, icon: '🪩',
    description: 'A dark box wrapped in neon with a holo sign, sky beams and a velvet-rope queue.',
    flavor: 'The bass registers on seismographs two systems over.',
    effects: { jobs: 20, tourism: 30, power: -2, noise: 35, happiness: 3, landValue: -3 },
  },
  {
    id: 'rc_cx_arcade', name: 'Holo-Arcade', zone: Zone.ComLeisure, levels: [1, 4], variants: 8, mesh: X.arcade, height: 1.6, icon: '🕹️',
    description: 'A wall of animated screens with a pixel-art hologram hovering over the roof.',
    flavor: 'High-score table currently dominated by a sentient toaster.',
    effects: { jobs: 18, tourism: 25, power: -2.5, noise: 15, happiness: 3 },
  },
  {
    id: 'rc_cx_theatre', name: 'Theatre', zone: Zone.ComLeisure, levels: [2, 5], variants: 8, mesh: X.theatre, height: 1.9, icon: '🎭',
    description: 'An auditorium with a fly tower, a grand portico and a bulb-lit marquee.',
    flavor: 'Tonight: Hamlet in zero gravity. To float or not to float.',
    effects: { jobs: 30, tourism: 40, power: -2, noise: 8, landValue: 5, happiness: 3 },
  },
  {
    id: 'rc_cx_resort', name: 'Sky Resort', zone: Zone.ComLeisure, levels: [4, 5], variants: 6, mesh: X.resort, height: 5, icon: '🏝️',
    description: 'A round resort tower with an infinity pool on the roof and palms at its feet.',
    flavor: 'An infinity pool forty floors up. Infinity not guaranteed.',
    effects: { jobs: 70, tourism: 120, power: -5, water: -5, noise: 6, landValue: 6 },
  },
  {
    id: 'rc_cx_cinema', name: 'Starlight Cinema', zone: Zone.ComLeisure, levels: [1, 3], variants: 8, mesh: X.cinema, height: 1.6, icon: '🎬',
    description: 'A picture palace with a marquee, a tall blade sign and glowing poster screens.',
    flavor: 'Popcorn engineered for 0.4 g. It still ends up on the floor.',
    effects: { jobs: 15, tourism: 20, power: -2, noise: 10, happiness: 2 },
  },
];

registerItems([...RES_LOW, ...RES_MED, ...RES_HIGH, ...COM_LOW, ...COM_HIGH, ...LEISURE].map(grow));
