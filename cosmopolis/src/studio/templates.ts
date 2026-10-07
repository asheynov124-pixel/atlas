/**
 * OWNER: studio.
 * Templates — hand-composed starting points (18 + a blank lot) and the "Surprise me" generator, which grows a
 * random but coherent building from a grammar (tower / habitat / temple / eco terraces / monument), a colour
 * harmony and a fitting function, then trims it to the triangle budget.
 */
import { Rng } from '../core/rng';
import { analyze, simplify, TRI_BUDGET } from './builder';
import { hslToHex } from './color';
import { newDesignId, normalizePart, type DesignSpec, type FnId, type Footprint, type PartSpec, type PartType } from './model';
import { PART_DEFS } from './parts';
import { generateName } from './stats';

export interface Template {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  footprint: Footprint;
  fn: FnId;
  parts: PartSpec[];
}

/** A part with library defaults (for a neutral one-tile context) overridden by `o`. */
function P(t: PartType, o: Partial<PartSpec> = {}): PartSpec {
  const base = PART_DEFS[t].create({ fp: 1, fpR: 0.92, top: 0, host: null, height: 0 });
  return normalizePart({ t, stack: true, ...base, x: 0, y: 0, z: 0, ...o } as PartSpec);
}
/** Free-standing part at absolute height y. */
function F(t: PartType, y: number, o: Partial<PartSpec> = {}): PartSpec {
  return P(t, { ...o, y, stack: false });
}

const GOLD = 0xffd36b;
const WHITE = 0xf4f1ea;
const STEEL = 0xc9ccd3;

export const TEMPLATES: Template[] = [
  {
    id: 'neo-tower',
    name: 'Neo Tower',
    blurb: 'A twisting glass office tower with a stepped crown and a needle spire.',
    icon: '🏙️',
    footprint: 1,
    fn: 'offices',
    parts: [
      P('plinth', { w: 1.8, d: 1.8, h: 0.1, seg: 4, c: STEEL, c2: 0xbfefff }),
      P('podium', { w: 1.5, d: 1.5, h: 0.6, seg: 4, c: 0xe8e4dc, c2: 0x8a909c, m: 'windows' }),
      P('block', { w: 1.1, d: 1.1, h: 6.4, taper: 0.3, twist: 20, c: 0x6fa8dc, m: 'glass' }),
      P('setback', { w: 0.74, d: 0.74, h: 0.9, n: 3, taper: 0.5, seg: 4, c: 0x9fd6ff, c2: WHITE, m: 'glass', ry: 20 }),
      P('spire', { w: 0.18, h: 1.4, seg: 8, c: STEEL, c2: 0x8a909c, m: 'metal' }),
      F('neon', 0.69, { w: 1.53, d: 1.53, h: 0.025, seg: 4, c: 0x5ef0ff, m: 'glow' }),
      F('neon', 6.95, { w: 0.82, d: 0.82, h: 0.03, seg: 4, ry: 19, c: 0x5ef0ff, m: 'glow' }),
    ],
  },
  {
    id: 'pagoda',
    name: 'Pagoda',
    blurb: 'Five vermilion tiers under sweeping jade roofs, crowned in gold.',
    icon: '⛩️',
    footprint: 1,
    fn: 'landmark',
    parts: [
      P('plinth', { w: 1.8, d: 1.8, h: 0.16, seg: 4, c: 0xd9c29a, c2: 0xffd9a0 }),
      ...[0, 1, 2, 3, 4].flatMap((i) => {
        const w = 1.0 - i * 0.13;
        return [
          P('block', { w, d: w, h: 0.42 - i * 0.03, c: 0xc4573a, m: 'smallWindows' }),
          P('pagoda', { w: w * 1.55, d: w * 1.55, h: 0.32, seg: 4, c: 0x2e5a4a, c2: GOLD }),
        ];
      }),
      P('spire', { w: 0.09, h: 0.8, seg: 8, c: GOLD, c2: GOLD, m: 'metal' }),
    ],
  },
  {
    id: 'dome-habitat',
    name: 'Dome Habitat',
    blurb: 'A glass biodome ringed by pressurised homes, tunnels and gardens.',
    icon: '🫧',
    footprint: 7,
    fn: 'housing',
    parts: [
      P('plinth', { w: 4.9, d: 4.9, h: 0.12, seg: 6, c: STEEL, c2: 0x9fe8ff }),
      P('dome', { w: 2.6, d: 2.6, h: 1.45, seg: 28, c: 0xbfe3ff, c2: STEEL, m: 'glass' }),
      P('antenna', { h: 0.6, w: 0.025, n: 2, c: STEEL, c2: 0xff3b30 }),
      F('dome', 0.12, { x: 1.75, z: 0.55, w: 1.1, d: 1.1, h: 0.62, seg: 18, c: WHITE, c2: STEEL, m: 'smallWindows' }),
      F('dome', 0.12, { x: -1.6, z: 0.9, w: 1.0, d: 1.0, h: 0.56, seg: 18, c: WHITE, c2: STEEL, m: 'smallWindows' }),
      F('dome', 0.12, { x: 0.2, z: -1.85, w: 1.15, d: 1.15, h: 0.64, seg: 18, c: WHITE, c2: STEEL, m: 'smallWindows' }),
      F('vault', 0.12, { x: 1.25, z: 0.35, ry: -18, w: 1.0, d: 0.36, seg: 12, c: 0xe0e0e0, m: 'smallWindows' }),
      F('vault', 0.12, { x: -1.15, z: 0.55, ry: 28, w: 0.9, d: 0.34, seg: 12, c: 0xe0e0e0, m: 'smallWindows' }),
      F('vault', 0.12, { x: 0.1, z: -1.2, ry: 92, w: 0.8, d: 0.34, seg: 12, c: 0xe0e0e0, m: 'smallWindows' }),
      F('garden', 0.12, { x: -0.6, z: 1.75, w: 1.3, d: 0.9, n: 9, h: 0.4, c: 0x5bbf5a, c2: STEEL }),
      F('tree', 0.12, { x: 1.4, z: 1.6, w: 0.9, h: 0.7, n: 4, seg: 8, c: 0x4caf50 }),
      F('solar', 0.12, { x: -1.55, z: -1.3, ry: 30, w: 1.2, d: 0.8, n: 2, tilt: 28 }),
      F('halo', 0.5, { w: 3.0, d: 0.035, seg: 40, c: 0x5ef0ff, m: 'glow' }),
    ],
  },
  {
    id: 'cyber-block',
    name: 'Cyber Block',
    blurb: 'A rain-slick megablock wrapped in neon, screens and a holographic crest.',
    icon: '🌃',
    footprint: 1,
    fn: 'shops',
    parts: [
      P('plinth', { w: 1.8, d: 1.8, h: 0.08, seg: 4, c: 0x3b404b, c2: 0xff6fb5 }),
      P('podium', { w: 1.6, d: 1.6, h: 0.8, seg: 4, c: 0x2a2d38, c2: 0xff6fb5, m: 'windows' }),
      P('block', { w: 1.25, d: 1.15, h: 4.2, c: 0x23262f, m: 'windows' }),
      P('block', { w: 0.9, d: 0.85, h: 1.2, c: 0x3a3f5c, m: 'glass' }),
      P('hologram', { w: 0.5, h: 0.25, seg: 6, c: 0xff6fb5, c2: 0x8a909c, m: 'holo' }),
      F('neon', 0.86, { w: 1.63, d: 1.63, h: 0.03, seg: 4, c: 0xff6fb5, m: 'glow' }),
      F('neon', 1.35, { w: 1.28, d: 1.18, h: 0.022, n: 6, s: 0.62, seg: 4, c: 0x5ef0ff, m: 'glow' }),
      F('billboard', 1.9, { z: 0.6, w: 0.95, h: 0.52, c: 0xffffff, c2: 0x3b404b, m: 'screen' }),
      F('billboard', 2.9, { x: 0.66, ry: 90, w: 0.7, h: 1.2, c: 0xffffff, c2: 0x3b404b, m: 'screen' }),
      F('antenna', 6.28, { x: 0.28, z: -0.25, h: 0.9, w: 0.025, n: 3, c: STEEL, c2: 0xff3b30 }),
    ],
  },
  {
    id: 'crystal-spire',
    name: 'Crystal Spire',
    blurb: 'A faceted glass needle rising from geodes, circled by floating halos.',
    icon: '💎',
    footprint: 1,
    fn: 'landmark',
    parts: [
      P('plinth', { w: 1.6, d: 1.6, h: 0.1, seg: 6, c: 0xe8eef8, c2: 0x8fe9ff }),
      F('crystal', 0.1, { w: 1.5, h: 1.1, n: 8, tilt: 24, c: 0x8fe9ff, c2: 0xd6b8ff, m: 'glass' }),
      P('tapered', { w: 0.82, d: 0.82, h: 7, taper: 0.78, twist: 120, seg: 6, c: 0x7aa7e0, m: 'glass' }),
      P('crystal', { w: 0.35, h: 1.0, n: 3, tilt: 10, c: 0xd6b8ff, c2: 0x8fe9ff, m: 'holo' }),
      F('halo', 2.4, { w: 1.6, d: 0.04, tilt: 8, c: 0xd6b8ff, m: 'glow' }),
      F('halo', 4.3, { w: 1.2, d: 0.035, tilt: -10, c: 0x8fe9ff, m: 'glow' }),
      F('halo', 6.0, { w: 0.85, d: 0.03, tilt: 14, c: 0xd6b8ff, m: 'glow' }),
    ],
  },
  {
    id: 'treehouse',
    name: 'Solarpunk Treehouse',
    blurb: 'Rounded terraces overflowing with gardens, timber balconies and a crown of trees.',
    icon: '🌿',
    footprint: 7,
    fn: 'housing',
    parts: [
      P('plinth', { w: 4.8, d: 4.8, h: 0.12, seg: 6, c: 0xd9c29a, c2: 0xffd9a0 }),
      P('rounded', { w: 3.3, d: 2.9, h: 1.0, s: 0.6, c: WHITE, m: 'windows' }),
      P('garden', { w: 3.1, d: 2.7, n: 16, h: 0.45, c: 0x5bbf5a, c2: 0xb98552 }),
      P('rounded', { w: 2.6, d: 2.2, h: 1.0, s: 0.6, c: WHITE, m: 'windows' }),
      P('garden', { w: 2.45, d: 2.05, n: 12, h: 0.45, c: 0x6fcf5a, c2: 0xb98552 }),
      P('rounded', { w: 1.9, d: 1.6, h: 1.0, s: 0.6, c: WHITE, m: 'windows' }),
      P('garden', { w: 1.8, d: 1.5, n: 8, h: 0.4, c: 0x5bbf5a, c2: 0xb98552 }),
      P('tree', { h: 0.95, w: 1.1, n: 3, seg: 8, c: 0x3f9a45, c2: 0x6b4a2b }),
      F('balcony', 0.55, { w: 3.45, d: 3.05, n: 2, s: 0.45, seg: 4, c: 0xb98552, c2: 0xd9c29a }),
      F('balcony', 1.6, { w: 2.75, d: 2.35, n: 2, s: 0.45, seg: 4, c: 0xb98552, c2: 0xd9c29a }),
      F('turbine', 3.27, { x: -0.55, z: 0.45, h: 1.1, w: 0.9, c: WHITE }),
      F('solar', 1.17, { x: 1.2, z: -0.9, w: 0.7, d: 0.6, n: 2, tilt: 30 }),
    ],
  },
  {
    id: 'mars-hab',
    name: 'Mars Hab',
    blurb: 'Rust-red regolith, pressurised domes, tunnels, a dish and a flag.',
    icon: '🔴',
    footprint: 7,
    fn: 'research',
    parts: [
      P('plinth', { w: 4.9, d: 4.9, h: 0.1, seg: 6, c: 0xb5653a, c2: 0xffb26b }),
      P('dome', { w: 2.2, d: 2.2, h: 1.1, seg: 24, c: 0xf2e6d8, c2: 0xb98552, m: 'smallWindows' }),
      P('antenna', { h: 0.8, w: 0.025, n: 2, c: STEEL, c2: 0xff3b30 }),
      F('vault', 0.1, { x: 1.6, w: 1.6, d: 0.55, seg: 14, c: 0xe8e0d4, m: 'smallWindows' }),
      F('vault', 0.1, { x: -1.3, z: 0.9, ry: -30, w: 1.4, d: 0.5, seg: 14, c: 0xe8e0d4, m: 'smallWindows' }),
      F('dome', 0.1, { x: 2.25, z: -1.1, w: 0.9, d: 0.9, h: 0.45, seg: 16, c: 0xf2e6d8, c2: 0xb98552, m: 'smallWindows' }),
      F('dome', 0.1, { x: -1.95, z: -0.95, w: 1.1, d: 1.1, h: 0.55, seg: 16, c: 0xf2e6d8, c2: 0xb98552, m: 'glass' }),
      F('dish', 0.1, { x: -0.6, z: -1.85, w: 0.95, h: 0.22, tilt: 42, c: WHITE, c2: 0x8a909c }),
      F('solar', 0.1, { x: 1.15, z: 1.65, w: 1.5, d: 0.8, n: 2, tilt: 30 }),
      F('flag', 0.1, { x: -0.4, z: 1.8, h: 0.7, w: 0.3, c: 0xff3b30, c2: STEEL }),
    ],
  },
  {
    id: 'igloo',
    name: 'Ice Igloo Complex',
    blurb: 'Snow-white domes, entrance tunnels and ice crystals that glow at night.',
    icon: '❄️',
    footprint: 7,
    fn: 'housing',
    parts: [
      P('plinth', { w: 4.9, d: 4.9, h: 0.1, seg: 6, c: 0xcfe2f3, c2: 0x9fe8ff }),
      P('dome', { w: 2.0, d: 2.0, h: 1.1, seg: 16, c: 0xe8f4ff, c2: 0x9fd8ff, m: 'smallWindows' }),
      F('vault', 0.1, { z: 1.1, ry: 90, w: 0.8, d: 0.48, seg: 10, c: 0xf4fbff, m: 'plain' }),
      F('dome', 0.1, { x: 1.7, z: 0.6, w: 1.1, d: 1.1, h: 0.6, seg: 14, c: 0xf4fbff, c2: 0xd6ecff, m: 'smallWindows' }),
      F('dome', 0.1, { x: -1.5, z: 1.1, w: 1.0, d: 1.0, h: 0.55, seg: 14, c: 0xf4fbff, c2: 0xd6ecff, m: 'smallWindows' }),
      F('dome', 0.1, { x: 0.3, z: -1.85, w: 1.2, d: 1.2, h: 0.65, seg: 14, c: 0xf4fbff, c2: 0xd6ecff, m: 'smallWindows' }),
      F('vault', 0.1, { x: 1.95, z: 1.2, ry: 60, w: 0.5, d: 0.3, seg: 10, c: 0xf4fbff, m: 'plain' }),
      F('crystal', 0.1, { x: -1.6, z: -1.15, w: 1.0, h: 1.2, n: 6, tilt: 22, c: 0xbfefff, c2: 0xffffff, m: 'glass' }),
      F('tree', 0.1, { x: 1.95, z: -1.2, w: 0.8, h: 0.85, n: 3, seg: 5, c: 0x2d5a3a, c2: 0x5a4030 }),
      F('halo', 0.13, { w: 2.08, d: 0.03, seg: 36, c: 0x9fe8ff, m: 'light' }),
    ],
  },
  {
    id: 'space-needle',
    name: 'Space Needle',
    blurb: 'A slender column holding a saucer deck high above the city.',
    icon: '🛸',
    footprint: 1,
    fn: 'landmark',
    parts: [
      P('plinth', { w: 1.6, d: 1.6, h: 0.1, seg: 8, c: STEEL, c2: 0xffd9a0 }),
      P('cylinder', { w: 0.32, d: 0.32, h: 5.2, seg: 12, c: WHITE, m: 'metal' }),
      F('lattice', 0.1, { w: 1.1, h: 4.6, taper: 0.78, n: 7, c: WHITE, c2: 0xff3b30, m: 'metal' }),
      P('torus', { w: 1.65, h: 0.32, seg: 36, c: WHITE, c2: GOLD, m: 'windows' }),
      P('dome', { w: 1.05, d: 1.05, h: 0.32, seg: 24, c: 0xbfe3ff, c2: GOLD, m: 'glass' }),
      P('spire', { w: 0.12, h: 1.2, seg: 8, c: STEEL, m: 'metal' }),
      F('halo', 5.46, { w: 1.95, d: 0.03, seg: 40, c: GOLD, m: 'glow' }),
    ],
  },
  {
    id: 'ziggurat',
    name: 'Ziggurat',
    blurb: 'Sun-baked tiers, a grand stair and a golden capstone for the gods.',
    icon: '🛕',
    footprint: 7,
    fn: 'landmark',
    parts: [
      P('plinth', { w: 4.9, d: 4.9, h: 0.1, seg: 4, c: 0xd9c29a, c2: 0xffb26b }),
      P('setback', { w: 4.2, d: 4.2, h: 2.4, n: 5, taper: 0.7, seg: 4, c: 0xd2b07a, c2: 0xf4e1b5, m: 'plain' }),
      P('block', { w: 0.95, d: 0.95, h: 0.5, c: 0xc4573a, m: 'smallWindows' }),
      P('pyramid', { w: 1.05, d: 1.05, h: 0.55, seg: 4, c: GOLD, c2: 0xffffff, m: 'metal' }),
      F('wedge', 0.1, { z: 1.8, w: 0.95, d: 1.2, h: 1.05, c: 0xc9a46a }),
      F('pool', 0.58, { x: 1.88, z: 1.88, w: 0.32, d: 0.32, h: 0.12, seg: 8, c: 0xff7a2a, c2: 0x5a4a3a, m: 'lava' }),
      F('pool', 0.58, { x: -1.88, z: 1.88, w: 0.32, d: 0.32, h: 0.12, seg: 8, c: 0xff7a2a, c2: 0x5a4a3a, m: 'lava' }),
      F('pool', 0.58, { x: 1.88, z: -1.88, w: 0.32, d: 0.32, h: 0.12, seg: 8, c: 0xff7a2a, c2: 0x5a4a3a, m: 'lava' }),
      F('pool', 0.58, { x: -1.88, z: -1.88, w: 0.32, d: 0.32, h: 0.12, seg: 8, c: 0xff7a2a, c2: 0x5a4a3a, m: 'lava' }),
    ],
  },
  {
    id: 'helix',
    name: 'Twisted Helix',
    blurb: 'Twenty-eight slabs turning half a revolution around a sapphire core.',
    icon: '🌀',
    footprint: 1,
    fn: 'housing',
    parts: [
      P('plinth', { w: 1.6, d: 1.6, h: 0.1, seg: 12, c: 0xe8e4dc, c2: 0xbfefff }),
      P('twisted', { w: 1.15, d: 0.75, h: 9, n: 28, twist: 180, taper: 0.15, seg: 4, c: 0xb8cde6, c2: 0x1f3f7a, m: 'glass' }),
      P('crown', { w: 0.6, h: 0.4, n: 10, c: STEEL, c2: 0x5ef0ff, m: 'metal' }),
      P('antenna', { h: 1.0, w: 0.025, n: 3, c: STEEL, c2: 0xff3b30 }),
    ],
  },
  {
    id: 'art-deco',
    name: 'Art Deco Spire',
    blurb: 'Limestone setbacks, fluted fins and a stainless-steel sunburst crown.',
    icon: '🏛️',
    footprint: 1,
    fn: 'offices',
    parts: [
      P('plinth', { w: 1.8, d: 1.8, h: 0.12, seg: 4, c: 0x8a909c, c2: 0xffd9a0 }),
      P('setback', { w: 1.5, d: 1.5, h: 5, n: 4, taper: 0.4, seg: 4, c: 0xd9cdb8, c2: WHITE, m: 'windows' }),
      P('setback', { w: 0.86, d: 0.86, h: 1.0, n: 5, taper: 0.72, seg: 8, c: 0xe0e4ea, c2: GOLD, m: 'metal' }),
      P('spire', { w: 0.14, h: 1.6, seg: 8, c: 0xe0e4ea, c2: GOLD, m: 'metal' }),
      F('fins', 0.12, { w: 1.52, d: 1.52, h: 1.25, n: 20, s: 0.06, seg: 4, c: WHITE }),
      F('neon', 5.05, { w: 0.92, d: 0.92, h: 0.03, seg: 4, c: 0xffd9a0, m: 'light' }),
    ],
  },
  {
    id: 'torus-arcology',
    name: 'Torus Arcology',
    blurb: 'A city in a ring: a glazed doughnut, a central tower and a forest within.',
    icon: '🍩',
    footprint: 19,
    fn: 'housing',
    parts: [
      P('plinth', { w: 8.4, d: 8.4, h: 0.15, seg: 6, c: STEEL, c2: 0x5ef0ff }),
      P('torus', { w: 7.6, h: 1.2, seg: 40, c: 0xe8e4dc, c2: 0x8a909c, m: 'windows' }),
      F('cylinder', 0.15, { w: 1.6, d: 1.6, h: 8, seg: 28, taper: 0.25, c: 0x9fd6ff, m: 'glass' }),
      F('dome', 8.15, { w: 1.2, d: 1.2, h: 0.6, seg: 20, c: 0xbfe3ff, c2: STEEL, m: 'glass' }),
      F('torus', 4.2, { w: 3.6, h: 0.45, seg: 36, c: 0xbfe3ff, c2: STEEL, m: 'glass' }),
      F('tree', 0.15, { w: 4.2, h: 0.85, n: 12, seg: 8, c: 0x4caf50 }),
      F('halo', 6.2, { w: 3.0, d: 0.06, seg: 40, c: 0x5ef0ff, m: 'glow' }),
    ],
  },
  {
    id: 'lighthouse',
    name: 'Lighthouse',
    blurb: 'Candy-striped and steadfast, with a lantern that wakes at dusk.',
    icon: '🗼',
    footprint: 1,
    fn: 'landmark',
    parts: [
      P('plinth', { w: 1.6, d: 1.6, h: 0.15, seg: 8, c: 0x8a909c, c2: 0xffd9a0 }),
      P('cylinder', { w: 0.95, d: 0.95, h: 0.8, taper: 0.09, seg: 24, c: WHITE, m: 'smallWindows' }),
      P('cylinder', { w: 0.865, d: 0.865, h: 0.8, taper: 0.1, seg: 24, c: 0xc4573a, m: 'smallWindows' }),
      P('cylinder', { w: 0.78, d: 0.78, h: 0.8, taper: 0.11, seg: 24, c: WHITE, m: 'smallWindows' }),
      P('cylinder', { w: 0.695, d: 0.695, h: 0.8, taper: 0.12, seg: 24, c: 0xc4573a, m: 'smallWindows' }),
      P('cylinder', { w: 0.95, d: 0.95, h: 0.06, seg: 24, c: 0x3b404b, m: 'metal' }),
      P('cylinder', { w: 0.52, d: 0.52, h: 0.42, seg: 16, c: 0xfff2b0, m: 'light' }),
      P('dome', { w: 0.62, d: 0.62, h: 0.3, seg: 16, c: 0x3b404b, c2: 0x8a909c, m: 'metal' }),
      F('balcony', 3.38, { w: 1.0, d: 1.0, n: 1, s: 0.4, seg: 24, c: 0x3b404b, c2: STEEL }),
    ],
  },
  {
    id: 'wind-spire',
    name: 'Wind Spire',
    blurb: 'A solar-skinned tri-blade tower bristling with turbines.',
    icon: '🌬️',
    footprint: 1,
    fn: 'power',
    parts: [
      P('plinth', { w: 1.6, d: 1.6, h: 0.1, seg: 6, c: STEEL, c2: 0x7cffb0 }),
      P('tapered', { w: 0.95, d: 0.95, h: 4, taper: 0.55, twist: 30, seg: 3, c: 0x1a2a4a, m: 'solar' }),
      P('turbine', { h: 0.8, w: 1.5, c: WHITE, c2: STEEL }),
      F('turbine', 1.1, { x: 0.5, z: 0.15, h: 0.3, w: 0.8, c: WHITE }),
      F('turbine', 2.2, { x: -0.42, z: 0.12, h: 0.3, w: 0.7, c: WHITE }),
      F('turbine', 3.2, { x: 0.28, z: 0.1, h: 0.3, w: 0.6, c: WHITE }),
      F('neon', 0.1, { w: 1.0, d: 1.0, h: 0.02, n: 4, s: 1.0, seg: 3, c: 0x7cffb0, m: 'glow' }),
    ],
  },
  {
    id: 'observatory',
    name: 'Observatory',
    blurb: 'A domed telescope house with dishes listening to the cosmos.',
    icon: '🔭',
    footprint: 7,
    fn: 'research',
    parts: [
      P('plinth', { w: 4.8, d: 4.8, h: 0.14, seg: 8, c: 0xe8e4dc, c2: 0xbfefff }),
      P('cylinder', { w: 2.4, d: 2.4, h: 1.0, seg: 24, c: WHITE, m: 'smallWindows' }),
      P('dome', { w: 2.5, d: 2.5, h: 1.25, seg: 24, c: STEEL, c2: 0x8a909c, m: 'metal' }),
      F('dish', 0.14, { x: 1.7, z: -1.2, w: 1.4, h: 0.3, tilt: 50, c: WHITE, c2: 0x8a909c }),
      F('dish', 0.14, { x: -1.8, z: -0.6, ry: 120, w: 1.0, h: 0.22, tilt: 30, c: WHITE, c2: 0x8a909c }),
      F('antenna', 0.14, { x: -1.4, z: 1.4, h: 1.6, w: 0.03, n: 4, c: STEEL, c2: 0xff3b30 }),
      F('garden', 0.14, { x: 1.4, z: 1.3, w: 1.2, d: 1.0, n: 8, h: 0.4, c: 0x5bbf5a }),
    ],
  },
  {
    id: 'onion-palace',
    name: 'Onion Palace',
    blurb: 'A jewel-box palace with four candy-coloured turrets.',
    icon: '🕌',
    footprint: 7,
    fn: 'landmark',
    parts: [
      P('plinth', { w: 4.9, d: 4.9, h: 0.15, seg: 4, c: WHITE, c2: 0xffd9a0 }),
      P('podium', { w: 4.0, d: 3.0, h: 1.0, seg: 4, c: 0xf2e8d5, c2: GOLD, m: 'smallWindows' }),
      P('cylinder', { w: 1.4, d: 1.4, h: 0.9, seg: 16, c: 0xf2e8d5, m: 'smallWindows' }),
      P('onion', { w: 1.5, d: 1.5, h: 1.9, seg: 18, c: 0x3fb59a, c2: GOLD }),
      ...([
        [1.7, 1.2, 0xc4573a],
        [-1.7, 1.2, 0x3a8dde],
        [1.7, -1.2, 0xe8b64a],
        [-1.7, -1.2, 0xa77bff],
      ] as const).flatMap(([x, z, c]) => [
        F('cylinder', 0.15, { x, z, w: 0.5, d: 0.5, h: 2.2, seg: 12, c: 0xf2e8d5, m: 'smallWindows' }),
        F('onion', 2.35, { x, z, w: 0.62, d: 0.62, h: 0.8, seg: 14, c, c2: GOLD }),
      ]),
    ],
  },
  {
    id: 'hanging-gardens',
    name: 'Hanging Gardens',
    blurb: 'Terraced gardens tumbling down a sandstone mount, with a waterfall.',
    icon: '🌺',
    footprint: 7,
    fn: 'park',
    parts: [
      P('plinth', { w: 4.9, d: 4.9, h: 0.12, seg: 6, c: 0xd9c29a, c2: 0xffd9a0 }),
      P('block', { w: 3.8, d: 3.8, h: 0.6, c: 0xd2b07a, m: 'smallWindows' }),
      P('garden', { w: 3.7, d: 3.7, n: 30, h: 0.85, c: 0x5bbf5a, c2: 0xd2b07a }),
      P('block', { w: 2.9, d: 2.9, h: 0.6, c: 0xd2b07a, m: 'smallWindows' }),
      P('garden', { w: 2.8, d: 2.8, n: 24, h: 0.85, c: 0x7ad35a, c2: 0xd2b07a }),
      P('block', { w: 2.0, d: 2.0, h: 0.6, c: 0xd2b07a, m: 'smallWindows' }),
      P('garden', { w: 1.9, d: 1.9, n: 14, h: 0.8, c: 0xff8ab0, c2: 0xd2b07a }),
      P('tree', { h: 1.0, w: 1.0, n: 3, seg: 8, c: 0x3f9a45 }),
      F('tree', 0.77, { x: -1.6, z: -1.6, w: 0.5, h: 0.75, n: 2, seg: 8, c: 0x4caf50 }),
      F('tree', 0.77, { x: 1.6, z: -1.6, w: 0.5, h: 0.7, n: 2, seg: 5, c: 0x2e7d32 }),
      F('wedge', 0.12, { z: 1.95, w: 0.8, d: 0.6, h: 0.6, c: 0x3a8dde, m: 'water' }),
      F('pool', 0.12, { z: 2.25, w: 1.2, d: 0.35, h: 0.05, seg: 4, c: 0x3a8dde, c2: 0xd2b07a }),
    ],
  },
];

/** The empty lot (a plinth) — for building from scratch. */
export function blankDesign(fp: Footprint = 1): DesignSpec {
  const fpR = fp === 1 ? 0.92 : fp === 7 ? 2.5 : 4.3;
  const now = Date.now();
  return {
    v: 1,
    id: newDesignId(),
    name: 'Untitled Design',
    description: '',
    icon: '🏗️',
    footprint: fp,
    fn: 'landmark',
    parts: [P('plinth', { w: fpR * 1.96, d: fpR * 1.96, h: 0.12, seg: fp === 1 ? 4 : 6 })],
    created: now,
    updated: now,
    base: 'blank',
  };
}

export function designFromTemplate(t: Template): DesignSpec {
  const now = Date.now();
  return {
    v: 1,
    id: newDesignId(),
    name: t.name,
    description: t.blurb,
    icon: t.icon,
    footprint: t.footprint,
    fn: t.fn,
    parts: t.parts.map((p) => ({ ...p })),
    created: now,
    updated: now,
    base: t.id,
  };
}

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

// ───────────────────────────────────────────── Surprise me

type Archetype = 'tower' | 'habitat' | 'temple' | 'eco' | 'monument';

interface Palette {
  main: number;
  alt: number;
  glass: number;
  accent: number;
  stone: number;
  roof: number;
}

function palette(r: Rng): Palette {
  const h = r.range(0, 360);
  const scheme = r.pick(['mono', 'analog', 'comp', 'triad'] as const);
  const h2 = scheme === 'mono' ? h : scheme === 'analog' ? h + 35 : scheme === 'comp' ? h + 180 : h + 120;
  const dark = r.chance(0.22);
  return {
    main: dark ? hslToHex(h, r.range(0.05, 0.25), r.range(0.14, 0.24)) : hslToHex(h, r.range(0.05, 0.35), r.range(0.72, 0.9)),
    alt: hslToHex(h2, r.range(0.2, 0.55), dark ? r.range(0.25, 0.35) : r.range(0.55, 0.75)),
    glass: hslToHex(h + r.range(-20, 20), r.range(0.3, 0.6), r.range(0.55, 0.75)),
    accent: hslToHex(h2 + r.range(-15, 15), r.range(0.8, 1), r.range(0.55, 0.65)),
    stone: hslToHex(r.range(25, 45), r.range(0.1, 0.35), r.range(0.6, 0.8)),
    roof: hslToHex(h2, r.range(0.3, 0.6), r.range(0.3, 0.45)),
  };
}

/** Grow a random, coherent design. Deterministic for a seed. */
export function surpriseDesign(seed: number): DesignSpec {
  const r = new Rng(seed * 2654435761 + 17);
  const arch = r.weighted<Archetype>(['tower', 'habitat', 'temple', 'eco', 'monument'], [5, 2, 1.5, 1.5, 1]);
  const fp: Footprint = arch === 'tower' ? r.weighted<Footprint>([1, 7], [7, 2]) : arch === 'monument' ? r.weighted<Footprint>([1, 7], [3, 2]) : r.weighted<Footprint>([7, 19], [4, 1]);
  const R = fp === 1 ? 0.92 : fp === 7 ? 2.5 : 4.3;
  const pal = palette(r);
  const parts: PartSpec[] = [];
  const add = (t: PartType, o: Partial<PartSpec>) => parts.push(P(t, o));
  const free = (t: PartType, y: number, o: Partial<PartSpec>) => parts.push(F(t, y, o));
  const plinthH = r.range(0.08, 0.18);
  add('plinth', { w: R * 1.96, d: R * 1.96, h: plinthH, seg: fp === 1 ? r.pick([4, 4, 6, 8]) : r.pick([6, 6, 8, 24]), c: r.chance(0.5) ? pal.stone : 0xc9ccd3, c2: pal.accent });
  let y = plinthH;
  let w = R * 1.96;
  let fn: FnId = 'landmark';
  const mats = ['windows', 'glass', 'glass', 'windows', 'smallWindows'] as const;

  if (arch === 'tower') {
    fn = r.weighted<FnId>(['housing', 'offices', 'shops', 'landmark'], [3, 3, 2, 2]);
    if (r.chance(0.65)) {
      const pw = R * r.range(1.3, 1.7);
      const ph = r.range(0.4, 1.0);
      add('podium', { w: pw, d: pw * r.range(0.8, 1), h: ph, seg: 4, c: pal.main, c2: pal.alt, m: 'windows' });
      y += ph;
      w = pw;
      if (r.chance(0.5)) free('neon', y - 0.02, { w: pw + 0.03, d: pw * 0.9 + 0.03, h: 0.025, seg: 4, c: pal.accent, m: 'glow' });
    }
    const body = r.pick(['block', 'rounded', 'cylinder', 'tapered', 'twisted', 'setback'] as const);
    const bw = Math.min(w * r.range(0.6, 0.85), R * 1.4);
    const bh = r.range(3, fp === 1 ? 11 : 14);
    const m = r.pick(mats);
    const col = m === 'glass' ? pal.glass : pal.main;
    const o: Partial<PartSpec> = { w: bw, d: bw * r.range(0.75, 1), h: bh, c: col, c2: pal.alt, m };
    if (body === 'block') Object.assign(o, { taper: r.chance(0.5) ? r.range(0.1, 0.4) : 0, twist: r.chance(0.35) ? r.range(-60, 60) : 0 });
    if (body === 'rounded') Object.assign(o, { s: r.range(0.3, 1), taper: r.chance(0.4) ? r.range(0.1, 0.35) : 0 });
    if (body === 'cylinder') Object.assign(o, { seg: 24, d: bw, taper: r.chance(0.4) ? r.range(0.1, 0.3) : 0 });
    if (body === 'tapered') Object.assign(o, { taper: r.range(0.3, 0.75), twist: r.chance(0.5) ? r.range(-120, 120) : 0, seg: r.pick([3, 4, 5, 6, 8]) });
    if (body === 'twisted') Object.assign(o, { n: r.int(10, 30), twist: r.range(60, 240) * (r.chance(0.5) ? 1 : -1), taper: r.range(0, 0.3), seg: r.pick([3, 4, 4, 6]) });
    if (body === 'setback') Object.assign(o, { n: r.int(3, 6), taper: r.range(0.3, 0.6), seg: r.pick([4, 4, 6, 8]) });
    add(body, o);
    const taper = (o.taper as number) ?? 0;
    const topW = bw * (1 - taper);
    if (r.chance(0.45)) free('neon', y + 0.4, { w: bw + 0.03, d: (o.d as number) + 0.03, h: 0.02, n: r.int(2, 8), s: r.range(0.5, 1.4), seg: body === 'cylinder' || body === 'rounded' ? 24 : ((o.seg as number) ?? 4), c: pal.accent, m: 'glow', ry: 0 });
    if (body === 'block' && !o.twist && r.chance(0.3)) free('fins', y, { w: bw + 0.02, d: (o.d as number) + 0.02, h: bh * 0.98, n: r.int(12, 28), s: r.range(0.05, 0.14), seg: 4, c: pal.main });
    if ((body === 'block' || body === 'rounded') && !o.twist && !taper && r.chance(0.25)) free('balcony', y + 0.4, { w: bw + 0.14, d: (o.d as number) + 0.14, n: Math.min(30, Math.floor((bh - 0.5) / 0.45)), s: 0.45, seg: body === 'rounded' ? 24 : 4, c: 0xf4f1ea, c2: 0xc9ccd3 });
    if (fn === 'shops' || r.chance(0.15)) free('billboard', y + bh * 0.45, { z: (o.d as number) / 2 + 0.04, w: Math.min(bw * 0.8, 1.2), h: Math.min(bw * 0.8, 1.2) * 0.55, m: 'screen', c: 0xffffff, c2: 0x3b404b });
    y += bh;
    const top = r.pick(['spire', 'dome', 'crown', 'pyramid', 'antenna', 'hologram', 'setback', 'helipad', 'onion'] as const);
    if (top === 'spire') add('spire', { w: Math.max(0.08, topW * 0.25), h: r.range(0.8, 2.4), seg: 8, c: 0xc9ccd3, m: 'metal' });
    if (top === 'dome') add('dome', { w: topW * 0.95, d: topW * 0.95, h: topW * r.range(0.3, 0.6), seg: 20, c: pal.glass, c2: 0xc9ccd3, m: r.pick(['glass', 'metal'] as const) });
    if (top === 'crown') add('crown', { w: topW * 0.95, h: r.range(0.3, 0.7), n: r.int(6, 14), c: r.chance(0.5) ? 0xffd36b : 0xc9ccd3, c2: pal.accent, m: 'metal' });
    if (top === 'pyramid') add('pyramid', { w: topW, d: topW, h: topW * r.range(0.4, 0.9), seg: 4, c: pal.glass, c2: 0xffd36b, m: 'glass' });
    if (top === 'antenna') add('antenna', { h: r.range(0.8, 2), w: 0.03, n: r.int(2, 4), c: 0xc9ccd3, c2: 0xff3b30, m: 'metal' });
    if (top === 'hologram') add('hologram', { w: Math.min(0.8, topW * 0.6), h: 0.25, seg: r.int(5, 8), c: pal.accent, c2: 0x8a909c, m: 'holo' });
    if (top === 'setback') add('setback', { w: topW * 0.8, d: topW * 0.8, h: r.range(0.6, 1.4), n: 3, taper: 0.5, seg: 4, c: pal.main, c2: pal.alt, m: 'metal' });
    if (top === 'helipad') add('helipad', { w: topW * 0.9, n: 8, c: 0x3b404b, c2: 0xf4f1ea });
    if (top === 'onion') add('onion', { w: topW * 0.8, d: topW * 0.8, h: topW, seg: 16, c: pal.roof, c2: 0xffd36b });
    if (r.chance(0.3)) free('halo', y * r.range(0.55, 0.9), { w: bw * r.range(1.4, 1.9), d: 0.04, seg: 36, c: pal.accent, m: 'glow', tilt: r.range(-12, 12) });
  } else if (arch === 'habitat') {
    fn = r.weighted<FnId>(['housing', 'research', 'park'], [3, 2, 1]);
    const main = r.pick(['dome', 'torus', 'sphere'] as const);
    if (main === 'dome') add('dome', { w: R * 1.0, d: R * 1.0, h: R * r.range(0.45, 0.65), seg: 26, c: pal.glass, c2: 0xc9ccd3, m: r.pick(['glass', 'smallWindows'] as const) });
    if (main === 'torus') add('torus', { w: R * 1.7, h: R * 0.22, seg: 40, c: pal.main, c2: 0x8a909c, m: 'windows' });
    if (main === 'sphere') add('sphere', { w: R * 0.9, h: R * 0.9, seg: 24, c: pal.glass, m: 'glass' });
    const ring = R * 0.72;
    const k = r.int(3, 5);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + r.range(0, 0.5);
      const x = Math.cos(a) * ring, z = Math.sin(a) * ring;
      const kind = r.pick(['dome', 'dome', 'vault', 'cylinder', 'garden', 'tree', 'solar', 'dish'] as const);
      if (kind === 'dome') free('dome', y, { x, z, w: R * 0.4, d: R * 0.4, h: R * 0.22, seg: 16, c: pal.main, c2: 0xc9ccd3, m: 'smallWindows' });
      if (kind === 'vault') free('vault', y, { x, z, ry: (-a * 180) / Math.PI, w: R * 0.5, d: R * 0.18, seg: 12, c: pal.main, m: 'smallWindows' });
      if (kind === 'cylinder') free('cylinder', y, { x, z, w: R * 0.25, d: R * 0.25, h: R * r.range(0.4, 0.9), seg: 16, c: pal.main, m: 'windows' });
      if (kind === 'garden') free('garden', y, { x, z, w: R * 0.5, d: R * 0.4, n: 8, h: 0.4, c: 0x5bbf5a });
      if (kind === 'tree') free('tree', y, { x, z, w: R * 0.4, h: 0.8, n: 4, seg: r.pick([5, 8]), c: 0x4caf50 });
      if (kind === 'solar') free('solar', y, { x, z, ry: (-a * 180) / Math.PI, w: R * 0.5, d: R * 0.35, n: 2, tilt: 30 });
      if (kind === 'dish') free('dish', y, { x, z, w: R * 0.35, h: 0.2, tilt: 40, c: 0xf4f1ea });
    }
    if (r.chance(0.6)) free('halo', y + R * 0.2, { w: R * 1.3, d: 0.035, seg: 40, c: pal.accent, m: r.pick(['glow', 'light'] as const) });
    if (main !== 'torus') add('antenna', { h: r.range(0.5, 1.2), w: 0.025, n: 2, c: 0xc9ccd3, c2: 0xff3b30, m: 'metal' });
  } else if (arch === 'temple') {
    fn = 'landmark';
    const style = r.pick(['pagoda', 'colonnade', 'ziggurat'] as const);
    if (style === 'pagoda') {
      const tiers = r.int(3, 5);
      let tw = R * 1.05;
      for (let i = 0; i < tiers; i++) {
        add('block', { w: tw, d: tw, h: 0.4, c: pal.alt, m: 'smallWindows' });
        add('pagoda', { w: tw * 1.55, d: tw * 1.55, h: 0.32, seg: r.pick([4, 4, 6, 8]), c: pal.roof, c2: 0xffd36b });
        tw *= 0.84;
      }
      add('spire', { w: 0.09, h: 0.8, seg: 8, c: 0xffd36b, m: 'metal' });
    } else if (style === 'colonnade') {
      const cw = R * 1.5;
      add('colonnade', { w: cw, d: cw * r.range(0.6, 1), h: r.range(0.6, 1.2), n: r.int(10, 20), seg: r.pick([4, 24]), c: pal.main, c2: pal.alt });
      add('dome', { w: cw * 0.6, d: cw * 0.6, h: cw * 0.3, seg: 24, c: r.pick([0xffd36b, pal.glass, pal.roof]), c2: 0xc9ccd3, m: r.pick(['metal', 'plain'] as const) });
    } else {
      add('setback', { w: R * 1.7, d: R * 1.7, h: R * r.range(0.6, 1.1), n: r.int(3, 6), taper: 0.7, seg: 4, c: pal.stone, c2: pal.main, m: 'plain' });
      add('block', { w: R * 0.4, d: R * 0.4, h: 0.4, c: pal.alt, m: 'smallWindows' });
      add('pyramid', { w: R * 0.45, d: R * 0.45, h: R * 0.25, seg: 4, c: 0xffd36b, m: 'metal' });
    }
  } else if (arch === 'eco') {
    fn = r.weighted<FnId>(['housing', 'park', 'power'], [3, 2, 1.5]);
    let tw = R * 1.4;
    const tiers = r.int(2, 4);
    for (let i = 0; i < tiers; i++) {
      add('rounded', { w: tw, d: tw * 0.85, h: r.range(0.6, 1.1), s: r.range(0.4, 0.9), c: pal.main, m: 'windows' });
      add('garden', { w: tw * 0.95, d: tw * 0.8, n: Math.max(4, Math.round(tw * 4)), h: 0.45, c: 0x5bbf5a, c2: 0xb98552 });
      tw *= r.range(0.7, 0.82);
    }
    if (fn === 'power') {
      add('solar', { w: tw, d: tw * 0.8, n: 3, tilt: 30 });
      free('turbine', y, { x: R * 0.7, z: -R * 0.5, h: R * 0.6, w: R * 0.5, c: 0xf4f1ea });
    } else add('tree', { h: r.range(0.6, 1.1), w: tw * 0.7, n: r.int(1, 4), seg: r.pick([5, 8]), c: 0x3f9a45 });
  } else {
    fn = r.weighted<FnId>(['landmark', 'decor', 'park'], [3, 1, 1]);
    const mon = r.pick(['obelisk', 'arch', 'crystal', 'shell', 'lattice'] as const);
    if (mon === 'obelisk') add('obelisk', { w: R * 0.35, d: R * 0.35, h: r.range(2, 6), c: pal.stone, c2: 0xffd36b });
    if (mon === 'arch') add('arch', { w: R * 1.4, h: R * 1.2, d: R * 0.2, seg: 12, c: pal.main, c2: 0xffd36b });
    if (mon === 'crystal') add('crystal', { w: R * 1.2, h: r.range(1.2, 3), n: r.int(5, 10), tilt: r.range(10, 30), c: pal.accent, c2: pal.glass, m: r.pick(['glass', 'holo'] as const) });
    if (mon === 'shell') add('shell', { w: R * 1.3, h: R * 0.9, d: R * 0.5, n: r.int(2, 4), tilt: r.range(5, 20), c: 0xf4f1ea });
    if (mon === 'lattice') add('lattice', { w: R * 1.2, h: r.range(3, 7), taper: 0.88, n: r.int(5, 9), c: pal.alt, c2: 0xff3b30, m: 'metal' });
    if (r.chance(0.6)) free('pool', y, { z: R * 0.6, w: R * 0.9, d: R * 0.4, h: 0.05, seg: 4, c: 0x3a8dde, c2: pal.stone });
    if (r.chance(0.5)) free('tree', y, { x: -R * 0.6, z: R * 0.4, w: R * 0.5, h: 0.6, n: 3, seg: r.pick([5, 8]), c: 0x4caf50 });
  }

  const now = Date.now();
  let spec: DesignSpec = { v: 1, id: newDesignId(), name: '', description: '', icon: '🎲', footprint: fp, fn, parts, created: now, updated: now, base: 'surprise' };
  if (analyze(spec).triangles > TRI_BUDGET) spec = simplify(spec);
  spec.name = generateName(spec, Math.floor(r.next() * 1e6), arch === 'tower' ? undefined : arch);
  spec.description = `A one-of-a-kind ${arch === 'eco' ? 'eco-terrace' : arch} conjured by the Studio’s dice.`;
  spec.icon = arch === 'tower' ? '🏙️' : arch === 'habitat' ? '🫧' : arch === 'temple' ? '⛩️' : arch === 'eco' ? '🌿' : '🗿';
  return spec;
}
