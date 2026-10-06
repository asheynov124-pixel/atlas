/**
 * OWNER: terrain.
 * Terrain palette — biome base colours blended with the archetype palette (content/planetTypes) and the sandbox
 * planet-forge overrides (spec.palette). Pure functions, safe to use from other modules (minimaps, cosmos previews):
 *
 *   surfacePalette(spec)            → resolved linear-friendly sRGB colours for this world
 *   tileColor(planet, tile, pal, out) → sRGB 0..1 top-surface colour of a tile (jitter, height & feature tints)
 *   renderBiome(planet, tile)       → biome actually drawn (e.g. a seabed raised above the sea draws as shore)
 *   hexToRgb / mixRgb helpers
 */
import { Biome, Feature, type PlanetSpec } from '../../core/types';
import { hashFloat } from '../../core/rng';
import { PLANET_TYPES } from '../../content/planetTypes';
import type { Planet } from '../../world/planet';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Stylised base colours (sRGB). */
export const BIOME_COLORS: Record<Biome, number> = {
  [Biome.DeepOcean]: 0x2c4c62,
  [Biome.Ocean]: 0x6e8f86,
  [Biome.Beach]: 0xf1e0a6,
  [Biome.Grass]: 0x7dbb59,
  [Biome.Forest]: 0x4d8c3c,
  [Biome.Jungle]: 0x2f8d42,
  [Biome.Savanna]: 0xc6b660,
  [Biome.Desert]: 0xe9bf78,
  [Biome.Tundra]: 0xa4ad86,
  [Biome.Snow]: 0xf3f7fc,
  [Biome.Ice]: 0xcde7f7,
  [Biome.Rock]: 0x8f8577,
  [Biome.Mountain]: 0x7a7169,
  [Biome.Volcanic]: 0x3d3432,
  [Biome.Lava]: 0xff6a1c,
  [Biome.Regolith]: 0xa3a3a6,
  [Biome.Crater]: 0x77787d,
  [Biome.Crystal]: 0xb7a0f6,
  [Biome.Toxic]: 0x9cb032,
  [Biome.Fungal]: 0xa066b4,
  [Biome.Salt]: 0xf2ede2,
  [Biome.Swamp]: 0x58723f,
  [Biome.Ash]: 0x625a58,
  [Biome.Metal]: 0x7e8894,
  [Biome.Coral]: 0xf08f7c,
  [Biome.Meadow]: 0x9fcd63,
};

type Role = 'land' | 'lowland' | 'highland' | 'shore' | 'snow' | 'rock';

/** Which archetype palette role tints a biome, and how strongly. */
const ROLE: Partial<Record<Biome, [Role, number]>> = {
  [Biome.Grass]: ['land', 0.32],
  [Biome.Meadow]: ['lowland', 0.3],
  [Biome.Forest]: ['land', 0.22],
  [Biome.Jungle]: ['land', 0.2],
  [Biome.Savanna]: ['lowland', 0.22],
  [Biome.Desert]: ['land', 0.42],
  [Biome.Tundra]: ['land', 0.32],
  [Biome.Snow]: ['snow', 0.6],
  [Biome.Ice]: ['snow', 0.28],
  [Biome.Rock]: ['rock', 0.5],
  [Biome.Mountain]: ['rock', 0.55],
  [Biome.Beach]: ['shore', 0.6],
  [Biome.Salt]: ['shore', 0.28],
  [Biome.Regolith]: ['land', 0.5],
  [Biome.Crater]: ['lowland', 0.55],
  [Biome.Volcanic]: ['land', 0.5],
  [Biome.Ash]: ['highland', 0.45],
  [Biome.Crystal]: ['land', 0.42],
  [Biome.Toxic]: ['land', 0.4],
  [Biome.Fungal]: ['land', 0.42],
  [Biome.Swamp]: ['lowland', 0.3],
  [Biome.Metal]: ['land', 0.5],
};

export interface SurfacePalette {
  land: Rgb;
  lowland: Rgb;
  highland: Rgb;
  shore: Rgb;
  snow: Rgb;
  rock: Rgb;
  /** second strata colour for cliff walls */
  strata: Rgb;
  seabedShallow: Rgb;
  seabedDeep: Rgb;
  /** colour of alien flora tint on this world */
  flora: Rgb;
  /** which roles were overridden by spec.palette */
  custom: Set<Role>;
}

export function hexToRgb(hex: number, out: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  out.r = ((hex >> 16) & 255) / 255;
  out.g = ((hex >> 8) & 255) / 255;
  out.b = (hex & 255) / 255;
  return out;
}

export function mixRgb(a: Rgb, b: Rgb, t: number, out: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}

export function rgbToHex(c: Rgb): number {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (q(c.r) << 16) | (q(c.g) << 8) | q(c.b);
}

const FLORA: Partial<Record<string, number>> = {
  fungal: 0xff6ad5,
  toxic: 0xc6ff3a,
  crystal: 0x9ad8ff,
  jungle: 0xff8a3a,
};

export function surfacePalette(spec: PlanetSpec): SurfacePalette {
  const arch = PLANET_TYPES[spec.type] ?? PLANET_TYPES.terran;
  const base = { ...arch.palette, ...(spec.palette ?? {}) };
  const custom = new Set<Role>(Object.keys(spec.palette ?? {}) as Role[]);
  const rock = hexToRgb(base.rock);
  const highland = hexToRgb(base.highland);
  const shore = hexToRgb(base.shore);
  const deepWater = hexToRgb(spec.oceanColor);
  return {
    land: hexToRgb(base.land),
    lowland: hexToRgb(base.lowland),
    highland,
    shore,
    snow: hexToRgb(base.snow),
    rock,
    strata: mixRgb(rock, highland, 0.55),
    seabedShallow: mixRgb(shore, hexToRgb(0xd9cfa0), 0.4),
    seabedDeep: mixRgb(hexToRgb(0x223442), deepWater, 0.25),
    flora: hexToRgb(FLORA[spec.type] ?? 0x7ad06a),
    custom,
  };
}

const WATER_BIOMES = new Set<number>([Biome.DeepOcean, Biome.Ocean, Biome.Coral]);

/** The biome drawn for a tile (water biomes above the sea draw as shore / lowland, etc.). */
export function renderBiome(planet: Planet, i: number): Biome {
  const b = planet.biome[i] as Biome;
  if (!planet.isWater(i) && WATER_BIOMES.has(b)) {
    const arch = PLANET_TYPES[planet.spec.type] ?? PLANET_TYPES.terran;
    return planet.elevation[i] - planet.seaOffset <= 1 ? arch.biomes.shore : arch.biomes.low[0];
  }
  return b;
}

const _a: Rgb = { r: 0, g: 0, b: 0 };
const _b: Rgb = { r: 0, g: 0, b: 0 };
const RUST = hexToRgb(0x9a5a3c);
const RUBBLE = hexToRgb(0x6d6660);
const RUINS = hexToRgb(0xc4b494);
const VENT = hexToRgb(0x6a4a3a);
const GAS = hexToRgb(0xc8c45a);
const CRYS = hexToRgb(0xc6b0ff);
const ICEDEP = hexToRgb(0xe2f2ff);
const FLOWER = hexToRgb(0xf4e8a0);
const CHAR = hexToRgb(0x2a2420);

/**
 * Top-surface colour of tile i (sRGB 0..1). Includes per-tile jitter, height tint, feature tint and the seabed ramp.
 */
export function tileColor(planet: Planet, i: number, pal: SurfacePalette, out: Rgb): Rgb {
  const b = renderBiome(planet, i);
  hexToRgb(BIOME_COLORS[b] ?? 0xff00ff, out);
  const role = ROLE[b];
  if (role) {
    const target = pal[role[0]];
    mixRgb(out, target, pal.custom.has(role[0]) ? 0.82 : role[1], out);
  }
  const e = planet.elevation[i] - planet.seaOffset;
  const seed = planet.spec.seed | 0;
  if (planet.isWater(i)) {
    // seabed ramp: sandy shallows → dark deep floor (seen through the water)
    const depth = -e;
    if (b === Biome.Coral) {
      const h = hashFloat(i, seed, 41);
      const coral = hexToRgb(h < 0.33 ? 0xf2836e : h < 0.66 ? 0xf4b25a : 0x4fd1b8, _a);
      mixRgb(pal.seabedShallow, coral, 0.55, out);
    } else if (WATER_BIOMES.has(b)) {
      mixRgb(pal.seabedShallow, pal.seabedDeep, Math.min(1, (depth - 1) / 4), out);
    } else {
      // flooded land / alien seabeds keep their hue but sink into the dark
      mixRgb(out, pal.seabedDeep, Math.min(0.7, 0.25 + depth * 0.1), out);
    }
  } else if (e > 2) {
    // altitude: drift toward the highland colour, a touch lighter
    const t = Math.min(1, (e - 2) / 10);
    if (b !== Biome.Snow && b !== Biome.Ice && b !== Biome.Lava && b !== Biome.Crystal) mixRgb(out, pal.highland, t * 0.3, out);
  }
  // features tint the ground they sit on (forests read as darker canopy floors from orbit)
  const f = planet.feature[i] as Feature;
  switch (f) {
    case Feature.DenseTrees:
      out.r *= 0.74; out.g *= 0.84; out.b *= 0.72;
      break;
    case Feature.Trees:
      out.r *= 0.9; out.g *= 0.95; out.b *= 0.88;
      break;
    case Feature.Flowers:
      mixRgb(out, FLOWER, 0.12, out);
      break;
    case Feature.Rocks:
      mixRgb(out, pal.rock, 0.16, out);
      break;
    case Feature.Ore:
      mixRgb(out, RUST, 0.22, out);
      break;
    case Feature.Rubble:
      mixRgb(out, RUBBLE, 0.55, out);
      break;
    case Feature.Ruins:
      mixRgb(out, RUINS, 0.3, out);
      break;
    case Feature.GeoVent:
      mixRgb(out, VENT, 0.25, out);
      break;
    case Feature.GasVent:
      mixRgb(out, GAS, 0.22, out);
      break;
    case Feature.CrystalDeposit:
      mixRgb(out, CRYS, 0.22, out);
      break;
    case Feature.IceDeposit:
      mixRgb(out, ICEDEP, 0.3, out);
      break;
    case Feature.AlienFlora:
      mixRgb(out, pal.flora, 0.14, out);
      break;
    case Feature.Crater:
      out.r *= 0.82; out.g *= 0.82; out.b *= 0.84;
      break;
    default:
      break;
  }
  // per-tile jitter: brightness ±6 %, tiny hue drift
  const h1 = hashFloat(i, seed, 7), h2 = hashFloat(i, seed, 8);
  const k = 0.94 + h1 * 0.12;
  out.r = clamp01(out.r * k + (h2 - 0.5) * 0.02);
  out.g = clamp01(out.g * k);
  out.b = clamp01(out.b * k - (h2 - 0.5) * 0.02);
  return out;
}

/** Charred version of a colour (used for scorched previews / minimaps). */
export function charred(c: Rgb, t: number): Rgb {
  return mixRgb(c, CHAR, t, _b);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
