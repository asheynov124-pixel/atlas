/**
 * OWNER: roads-props.
 * Natural features drawn per TILE as one cluster mesh (PropRenderer instances one cluster per feature tile —
 * thousands of trees for a handful of draw calls). Everything is deterministic from the rng it is given.
 *
 *   mixFor(planetType, biome)          → forest mix id ('temperate', 'taiga', 'fungal', …) — species per biome AND
 *                                        per planet type (crystal trees on crystal worlds, pylons on machine worlds…)
 *   drawForest(b, mix, dense, rng)      Trees: 2–3 jittered trees · DenseTrees: 5–7 + undergrowth
 *   flavourFor(planetType, biome)       palette flavour for rocks / crystals / ruins / flowers ('terran', 'arctic.snow'…)
 *   drawFeature(b, feature, flavour, rng)   rocks · ore (metal glints) · crystal deposits (glowing) · ice · gas vents
 *                                        (holo plume) · geothermal vents (lava + steam) · ruins (columns, rune obelisks,
 *                                        machine relics) · flower meadows · alien flora · kelp & coral · rubble · craters
 *
 * Budgets: forest clusters ≤ ~360 tris (dense) / ~180 (light) at LOD0; other features ≤ ~160 tris.
 * Cluster radius ≈ 0.62 world units (fits inside a hex tile of inradius ≈ 1).
 */
import { Biome, Feature, type PlanetTypeId } from '../../../core/types';
import type { Rng } from '../../../core/rng';
import { Mat, mix, shade, type MeshBuilder } from '../../kit';
import { drawTree, type TreeSpecies } from './trees';

// ───────────────────────────────────────────────────────────── forest mixes

export const MIXES: Record<string, [TreeSpecies, number][]> = {
  temperate: [['oak', 0.46], ['birch', 0.22], ['pine', 0.2], ['cherry', 0.05], ['autumn', 0.07]],
  meadow: [['oak', 0.5], ['birch', 0.28], ['cherry', 0.12], ['autumn', 0.1]],
  forest: [['pine', 0.55], ['oak', 0.3], ['birch', 0.15]],
  alpine: [['pine', 0.7], ['larch', 0.3]],
  taiga: [['larch', 0.45], ['snowpine', 0.3], ['pine', 0.25]],
  snowy: [['snowpine', 0.85], ['larch', 0.15]],
  jungle: [['jungle', 0.55], ['palm', 0.2], ['fern', 0.25]],
  tropical: [['palm', 0.55], ['jungle', 0.3], ['fern', 0.15]],
  palm: [['palm', 1]],
  savanna: [['acacia', 0.68], ['baobab', 0.32]],
  desert: [['cactus', 0.82], ['palm', 0.18]],
  swamp: [['willow', 0.6], ['jungle', 0.2], ['fern', 0.2]],
  volcanic: [['deadtree', 1]],
  barren: [['lichen', 1]],
  crystal: [['crystal', 1]],
  toxic: [['bulb', 0.75], ['deadtree', 0.25]],
  fungal: [['mushroom', 0.85], ['fern', 0.15]],
  machine: [['pylon', 1]],
};

const TYPE_MIX: Partial<Record<PlanetTypeId, string>> = {
  crystal: 'crystal',
  fungal: 'fungal',
  toxic: 'toxic',
  machine: 'machine',
  volcanic: 'volcanic',
  barren: 'barren',
  arctic: 'snowy',
};

/** Forest mix for a tile: planet archetype first (alien worlds have alien trees), then the biome. */
export function mixFor(type: PlanetTypeId, biome: number): string {
  const t = TYPE_MIX[type];
  if (t) return t;
  switch (biome) {
    case Biome.Grass:
      return type === 'ocean' ? 'tropical' : type === 'tundra' ? 'taiga' : type === 'jungle' ? 'jungle' : 'temperate';
    case Biome.Meadow:
      return 'meadow';
    case Biome.Forest:
      return type === 'jungle' || type === 'ocean' ? 'jungle' : type === 'tundra' ? 'taiga' : 'forest';
    case Biome.Jungle:
      return 'jungle';
    case Biome.Savanna:
      return type === 'desert' ? 'desert' : 'savanna';
    case Biome.Desert:
    case Biome.Salt:
      return 'desert';
    case Biome.Beach:
    case Biome.Coral:
      return 'palm';
    case Biome.Tundra:
      return 'taiga';
    case Biome.Snow:
    case Biome.Ice:
      return 'snowy';
    case Biome.Swamp:
      return 'swamp';
    case Biome.Rock:
    case Biome.Mountain:
      return 'alpine';
    case Biome.Volcanic:
    case Biome.Ash:
    case Biome.Lava:
      return 'volcanic';
    case Biome.Regolith:
    case Biome.Crater:
      return 'barren';
    case Biome.Crystal:
      return 'crystal';
    case Biome.Toxic:
      return 'toxic';
    case Biome.Fungal:
      return 'fungal';
    case Biome.Metal:
      return 'machine';
    default:
      return type === 'desert' ? 'desert' : type === 'jungle' ? 'jungle' : 'forest';
  }
}

/** Street / median tree species for a planet type (formal planting that still fits the world). */
export function streetTreeFor(type: PlanetTypeId): TreeSpecies {
  switch (type) {
    case 'desert':
      return 'palm';
    case 'ocean':
      return 'palm';
    case 'arctic':
      return 'snowpine';
    case 'tundra':
      return 'larch';
    case 'jungle':
      return 'jungle';
    case 'fungal':
      return 'mushroom';
    case 'crystal':
      return 'crystal';
    case 'toxic':
      return 'bulb';
    case 'volcanic':
      return 'lichen';
    case 'barren':
      return 'lichen';
    case 'machine':
      return 'pylon';
    default:
      return 'street';
  }
}

/** Jittered positions inside radius `rad` with a minimum spacing (deterministic dart throwing). */
function scatter(rng: Rng, n: number, rad: number, minD: number): [number, number][] {
  const out: [number, number][] = [];
  for (let tries = 0; out.length < n && tries < n * 30; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * rad;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let ok = true;
    for (const [px, pz] of out) if ((px - x) ** 2 + (pz - z) ** 2 < minD * minD) ok = false;
    if (ok) out.push([x, z]);
  }
  return out;
}

/** Species that make the undergrowth of a mix (null = none). */
function undergrowth(mixId: string): TreeSpecies | null {
  switch (mixId) {
    case 'desert':
    case 'volcanic':
    case 'machine':
    case 'crystal':
      return null;
    case 'barren':
      return 'lichen';
    case 'fungal':
    case 'jungle':
    case 'tropical':
    case 'swamp':
      return 'fern';
    case 'toxic':
      return 'bulb';
    default:
      return 'shrub';
  }
}

/** A light (2–3 trees) or dense (5–7 trees + undergrowth) forest cluster of the given mix. */
export function drawForest(b: MeshBuilder, mixId: string, dense: boolean, rng: Rng): void {
  const mixList = MIXES[mixId] ?? MIXES.temperate;
  const species = mixList.map((m) => m[0]);
  const weights = mixList.map((m) => m[1]);
  const n = dense ? rng.int(5, 7) : rng.int(2, 3);
  const pts = scatter(rng, n, dense ? 0.66 : 0.52, dense ? 0.3 : 0.36);
  // dense stands: tallest trees in the middle
  pts.sort((a, b2) => a[0] * a[0] + a[1] * a[1] - (b2[0] * b2[0] + b2[1] * b2[1]));
  const base = mixId === 'machine' || mixId === 'crystal' ? 1.15 : 1.42;
  pts.forEach(([x, z], i) => {
    const sp = rng.weighted(species, weights);
    const s = base * (dense ? 1.1 - (i / n) * 0.25 : 1) * rng.range(0.85, 1.15);
    drawTree(b, sp, rng, { x, z, s, ry: rng.range(0, Math.PI * 2) });
  });
  const under = undergrowth(mixId);
  if (under && !b.lod) {
    const m = dense ? rng.int(2, 3) : rng.int(0, 2);
    for (const [x, z] of scatter(rng, m, 0.7, 0.22)) drawTree(b, under, rng, { x, z, s: rng.range(0.9, 1.3), ry: rng.range(0, 6) });
  }
}

// ───────────────────────────────────────────────────────────── palettes per planet flavour

interface Pal {
  rock: number;
  rock2: number;
  /** snowy caps on rocks */
  snow: boolean;
  crystal: number[];
  ruin: number;
  rune: number;
  flowers: number[];
  plume: number;
}

const PAL: Record<string, Pal> = {
  terran: { rock: 0x8a8578, rock2: 0x9c978a, snow: false, crystal: [0x7ad8ff, 0xb9a4ff], ruin: 0xcdbb94, rune: 0x5afff0, flowers: [0xff5a6a, 0xffd23a, 0xffffff, 0xb07aff, 0xff9a3a], plume: 0xd0ff9a },
  desert: { rock: 0xb87a4a, rock2: 0xc98f5c, snow: false, crystal: [0xffb84a, 0xff7a4a], ruin: 0xe0c08a, rune: 0x4ad8ff, flowers: [0xff6fa0, 0xffd04a, 0xffffff], plume: 0xffd27a },
  arctic: { rock: 0x8392a2, rock2: 0x9aa8b6, snow: true, crystal: [0x9fe8ff, 0xd0f4ff], ruin: 0xc8d4e0, rune: 0x7ae0ff, flowers: [0xe8f6ff, 0x9fd8ff, 0xc8b8ff], plume: 0xe0f0ff },
  volcanic: { rock: 0x3a302c, rock2: 0x4a3c36, snow: false, crystal: [0xff5a2a, 0xffa02a], ruin: 0x5a4a44, rune: 0xff7a2a, flowers: [0xff7a2a, 0xffc04a], plume: 0xffb08a },
  ocean: { rock: 0x8a8a80, rock2: 0xa09a8a, snow: false, crystal: [0x4ae0e0, 0x7ab8ff], ruin: 0xb8c8b8, rune: 0x4affd8, flowers: [0xff7aa0, 0xffe04a, 0xffffff, 0xff9a4a], plume: 0xb8fff0 },
  jungle: { rock: 0x6f7a62, rock2: 0x7f8a6c, snow: false, crystal: [0x7aff9a, 0x4ad8a0], ruin: 0x9aa47a, rune: 0x8aff5a, flowers: [0xff3a7a, 0xffa02a, 0xc05aff, 0xffe04a], plume: 0xc8ff8a },
  barren: { rock: 0x9a958c, rock2: 0xaaa59a, snow: false, crystal: [0x9ab8ff, 0xd0d8ff], ruin: 0xa8a49c, rune: 0x7ad0ff, flowers: [0x9affe0, 0xd0e0ff], plume: 0xd8e4f0 },
  toxic: { rock: 0x6a6a52, rock2: 0x7a7858, snow: false, crystal: [0xb8ff3a, 0x7aff5a], ruin: 0x7a7a5a, rune: 0xc8ff3a, flowers: [0xc8ff4a, 0x7aff9a, 0xffe04a], plume: 0xa8ff4a },
  crystal: { rock: 0x8a80a0, rock2: 0x9a90b4, snow: false, crystal: [0xb9a4ff, 0x8ad8ff, 0xffa8e8], ruin: 0xd8d0f0, rune: 0xffa8ff, flowers: [0xffa8e8, 0x8ad8ff, 0xb9a4ff], plume: 0xe8c8ff },
  fungal: { rock: 0x7a6a7a, rock2: 0x8a7a8a, snow: false, crystal: [0xff9af0, 0x9ac8ff], ruin: 0xa89aa8, rune: 0xff9af0, flowers: [0x7affd8, 0xff9af0, 0xfff07a], plume: 0xe0b8ff },
  tundra: { rock: 0x7f8288, rock2: 0x90939a, snow: false, crystal: [0x9fe8ff, 0xb9a4ff], ruin: 0xb0b4b8, rune: 0x7ae0ff, flowers: [0xffffff, 0xd0a0ff, 0xffe080], plume: 0xe0f0ff },
  machine: { rock: 0x5a606a, rock2: 0x6a707a, snow: false, crystal: [0x4ae0ff, 0x9a7aff], ruin: 0x6a707a, rune: 0x4ae0ff, flowers: [0x4ae0ff, 0xff4ad8], plume: 0x7ad8ff },
};

/** Palette flavour of a tile: planet archetype (+ '.snow' on snowy biomes). */
export function flavourFor(type: PlanetTypeId, biome: number): string {
  const snowy = biome === Biome.Snow || biome === Biome.Ice;
  return snowy && type !== 'arctic' ? `${type}.snow` : type;
}

function palOf(flavour: string): Pal {
  const [type, mod] = flavour.split('.');
  const p = PAL[type] ?? PAL.terran;
  return mod === 'snow' ? { ...p, snow: true } : p;
}

// ───────────────────────────────────────────────────────────── features

function boulder(b: MeshBuilder, rng: Rng, x: number, z: number, r: number, col: number, snow: boolean): void {
  const sy = rng.range(0.55, 0.85);
  b.sphere(r, { color: col, wSeg: b.lod ? 4 : 5, hSeg: b.lod ? 2 : 3, flat: true, x, z, y: r * sy * 0.45, sx: rng.range(0.9, 1.25), sy, sz: rng.range(0.8, 1.1), ry: rng.range(0, 6), rx: rng.range(-0.25, 0.25) });
  if (snow) b.sphere(r * 0.82, { color: 0xf2f6fb, wSeg: 5, hSeg: 2, thetaLength: Math.PI / 2, flat: true, x, z, y: r * sy * 0.62, sy: sy * 0.55, ry: rng.range(0, 6), detail: true });
}

function rocks(b: MeshBuilder, p: Pal, rng: Rng): void {
  const pts = scatter(rng, rng.int(2, 4), 0.5, 0.3);
  pts.forEach(([x, z], i) => boulder(b, rng, x, z, (i === 0 ? 0.2 : 0.12) * rng.range(0.8, 1.2), i % 2 ? p.rock2 : p.rock, p.snow));
  if (!b.lod) for (const [x, z] of scatter(rng, 4, 0.66, 0.12)) b.box(0.05, 0.03, 0.04, { color: shade(p.rock, rng.range(0.85, 1.15)), x, z, ry: rng.range(0, 3), rx: 0.2, detail: true });
}

function ore(b: MeshBuilder, p: Pal, rng: Rng): void {
  const metals = [0xd8a040, 0xc87a4a, 0xc8ccd4, 0xe0c060];
  const metal = metals[rng.int(0, metals.length - 1)];
  const pts = scatter(rng, 3, 0.45, 0.32);
  pts.forEach(([x, z], i) => {
    const r = i === 0 ? 0.2 : 0.13;
    boulder(b, rng, x, z, r, shade(p.rock, 0.7), false);
    // metallic nodules breaking through the rock
    for (let k = 0; k < (b.lod ? 1 : 3); k++) {
      const a = rng.range(0, Math.PI * 2);
      b.box(r * 0.45, r * 0.32, r * 0.38, { color: metal, mat: Mat.Plain, x: x + Math.cos(a) * r * 0.55, z: z + Math.sin(a) * r * 0.55, y: r * 0.25 + k * 0.03, ry: rng.range(0, 3), rx: rng.range(-0.5, 0.5), rz: rng.range(-0.5, 0.5) });
    }
  });
  // glints that catch the eye (and the night)
  if (!b.lod) for (const [x, z] of scatter(rng, 3, 0.5, 0.15)) b.box(0.018, 0.018, 0.018, { color: mix(metal, 0xffffff, 0.5), mat: Mat.Glow, x, z, y: 0.03 + rng.range(0, 0.08), ry: 0.7, rx: 0.6, detail: true });
}

function crystals(b: MeshBuilder, p: Pal, rng: Rng, scale = 1): void {
  const pts = scatter(rng, b.lod ? 3 : rng.int(5, 7), 0.48 * scale, 0.14);
  pts.forEach(([x, z], i) => {
    const c = p.crystal[i % p.crystal.length];
    const h = (i === 0 ? 0.42 : rng.range(0.14, 0.3)) * scale;
    const r = (i === 0 ? 0.06 : rng.range(0.025, 0.045)) * scale;
    b.group({ x, z, rx: rng.range(-0.35, 0.35), rz: rng.range(-0.35, 0.35), ry: rng.range(0, 3) }, () => {
      b.prism(6, r, h * 0.72, { color: c, mat: Mat.Plain });
      b.cone(r, h * 0.28, { color: mix(c, 0xffffff, 0.35), mat: Mat.Glow, seg: 6, y: h * 0.72, flat: true });
    });
  });
  // glowing ground halo
  if (!b.lod) b.cyl(0.3 * scale, 0.34 * scale, 0.012, { color: shade(p.crystal[0], 0.55), mat: Mat.Glow, seg: 8, flat: true, detail: true });
}

function ice(b: MeshBuilder, rng: Rng): void {
  b.cyl(0.4, 0.42, 0.01, { color: 0xbfe6f6, mat: Mat.Plain, seg: 9, flat: true });
  const pts = scatter(rng, b.lod ? 3 : 5, 0.42, 0.18);
  pts.forEach(([x, z], i) => {
    const h = i === 0 ? 0.3 : rng.range(0.1, 0.2);
    const c = i % 2 ? 0xd8f2ff : 0xa8dcf2;
    b.group({ x, z, ry: rng.range(0, 3), rz: rng.range(-0.25, 0.25) }, () => {
      b.prism(rng.int(4, 5), rng.range(0.05, 0.08), h * 0.75, { color: c, mat: Mat.Plain });
      b.pyramid(0.09, h * 0.35, 0.09, { color: 0xf2fbff, y: h * 0.75 });
    });
  });
}

function gasVent(b: MeshBuilder, p: Pal, rng: Rng): void {
  b.cyl(0.32, 0.38, 0.03, { color: shade(p.rock, 0.6), seg: 9, flat: true, top: shade(p.rock, 0.45) });
  b.cyl(0.07, 0.14, 0.09, { color: shade(p.rock, 0.75), seg: 7, y: 0.03, flat: true, top: 0x1a1a1a });
  // the holographic gas plume
  b.cyl(0.13, 0.06, 0.62, { color: p.plume, mat: Mat.Holo, seg: 7, y: 0.11, capTop: false, flat: true });
  if (!b.lod) {
    b.sphere(0.1, { color: p.plume, mat: Mat.Holo, wSeg: 5, hSeg: 3, y: 0.78, x: 0.04, flat: true, detail: true });
    b.sphere(0.06, { color: p.plume, mat: Mat.Holo, wSeg: 4, hSeg: 2, y: 0.95, x: -0.03, flat: true, detail: true });
    for (const [x, z] of scatter(rng, 3, 0.4, 0.15)) b.box(0.06, 0.04, 0.05, { color: shade(p.rock, 0.8), x, z, ry: rng.range(0, 3), detail: true });
  }
}

function geoVent(b: MeshBuilder, p: Pal, rng: Rng): void {
  b.cyl(0.12, 0.36, 0.12, { color: shade(p.rock, 0.85), seg: 8, flat: true, top: 0x2a2220 });
  b.cyl(0.09, 0.09, 0.012, { color: 0xff6a20, mat: Mat.Lava, seg: 8, y: 0.12, flat: true });
  // lava cracks down the flanks
  for (let i = 0; i < (b.lod ? 1 : 3); i++) b.box(0.025, 0.012, 0.22, { color: 0xff5a1a, mat: Mat.Lava, ry: i * 2.1 + rng.range(0, 0.5), z: 0.0, x: 0, y: 0.05, rx: 0.45 });
  b.cyl(0.09, 0.05, 0.5, { color: 0xe8eef4, mat: Mat.Holo, seg: 6, y: 0.13, capTop: false, flat: true });
  if (!b.lod) b.sphere(0.09, { color: 0xe8eef4, mat: Mat.Holo, wSeg: 5, hSeg: 3, y: 0.68, flat: true, detail: true });
}

function stoneRuins(b: MeshBuilder, p: Pal, rng: Rng): void {
  const stone = p.ruin;
  b.box(0.7, 0.03, 0.5, { color: shade(stone, 0.85), ry: rng.range(-0.3, 0.3), top: shade(stone, 0.95) });
  // broken columns
  const cols = scatter(rng, 3, 0.32, 0.2);
  cols.forEach(([x, z], i) => {
    const h = [0.42, 0.24, 0.12][i] * rng.range(0.85, 1.1);
    b.prism(b.lod ? 4 : 6, 0.045, h, { color: stone, x, z, y: 0.03 });
    if (!b.lod && i === 0) b.box(0.13, 0.03, 0.13, { color: shade(stone, 1.06), x, z, y: 0.03 + h, ry: 0.3, detail: true });
  });
  // a toppled drum
  b.cyl(0.045, 0.045, 0.22, { color: shade(stone, 0.92), seg: 6, rz: Math.PI / 2, x: 0.3, z: -0.25, y: 0.07, flat: true, detail: true });
  // obelisk with glowing runes
  const ox = -0.3, oz = 0.22;
  b.box(0.1, 0.5, 0.1, { color: shade(stone, 0.8), x: ox, z: oz, y: 0.03 });
  b.pyramid(0.1, 0.08, 0.1, { color: shade(stone, 0.9), x: ox, z: oz, y: 0.53 });
  for (let i = 0; i < (b.lod ? 1 : 3); i++) {
    b.box(0.05, 0.018, 0.004, { color: p.rune, mat: Mat.Glow, x: ox, z: oz + 0.051, y: 0.14 + i * 0.12 });
    if (!b.lod) b.box(0.004, 0.018, 0.05, { color: p.rune, mat: Mat.Glow, x: ox + 0.051, z: oz, y: 0.2 + i * 0.1, detail: true });
  }
}

function machineRuins(b: MeshBuilder, p: Pal, rng: Rng): void {
  const m = p.ruin;
  b.box(0.6, 0.03, 0.5, { color: shade(m, 0.7), mat: Mat.Plain, ry: rng.range(-0.3, 0.3) });
  // server monolith with running light lines
  b.box(0.16, 0.46, 0.1, { color: shade(m, 0.6), mat: Mat.Plain, x: -0.18, y: 0.03, ry: 0.2 });
  for (let i = 0; i < (b.lod ? 1 : 4); i++) b.box(0.13, 0.008, 0.004, { color: p.rune, mat: Mat.Glow, x: -0.18 + 0.01, z: 0.05, y: 0.1 + i * 0.09, ry: 0.2 });
  // broken antenna mast
  b.cyl(0.012, 0.02, 0.5, { color: m, mat: Mat.Plain, seg: 4, x: 0.22, z: 0.1, rz: 0.35, capTop: false });
  if (!b.lod) b.dome(0.1, { color: shade(m, 1.2), mat: Mat.Plain, wSeg: 6, hSeg: 2, x: 0.18, z: -0.22, y: 0.03, rx: 1.2, flat: true, detail: true });
  // a giant cog half buried
  b.torus(0.14, 0.03, { color: shade(m, 0.85), mat: Mat.Plain, seg: b.lod ? 6 : 10, tube: 3, x: 0.05, z: -0.05, y: 0.08, rx: Math.PI / 2 - 0.25, flat: true });
  b.box(0.02, 0.02, 0.02, { color: 0xff4040, mat: Mat.Light, x: -0.18, y: 0.5, ry: 0.2 });
}

function flowers(b: MeshBuilder, p: Pal, rng: Rng, flavour: string): void {
  const type = flavour.split('.')[0];
  const glow = type === 'fungal' || type === 'toxic' || type === 'crystal' || type === 'machine';
  // colour carpets: what a meadow reads as from far away
  const carpets = scatter(rng, b.lod ? 2 : 4, 0.5, 0.3);
  carpets.forEach(([x, z], i) => {
    const c = p.flowers[(i + 1) % p.flowers.length];
    b.cyl(rng.range(0.16, 0.24), rng.range(0.18, 0.26), 0.008, { color: mix(c, 0x6aaa44, 0.35), mat: glow ? Mat.Glow : Mat.Plain, seg: 7, x, z, flat: true, sx: rng.range(0.8, 1.2) });
  });
  const n = b.lod ? 5 : rng.int(9, 12);
  const pts = scatter(rng, n, 0.62, 0.13);
  pts.forEach(([x, z], i) => {
    const c = p.flowers[i % p.flowers.length];
    if (type === 'crystal') {
      b.group({ x, z, rz: rng.range(-0.3, 0.3) }, () => {
        b.prism(4, 0.02, 0.1, { color: c, mat: Mat.Plain });
        b.cone(0.02, 0.045, { color: c, mat: Mat.Glow, seg: 4, y: 0.1, flat: true });
      });
      return;
    }
    if (type === 'fungal') {
      b.cyl(0.009, 0.012, 0.07, { color: 0xeee2d0, seg: 3, x, z, capTop: false, flat: true });
      b.dome(0.04, { color: c, mat: Mat.Glow, wSeg: 4, hSeg: 1, x, z, y: 0.07, flat: true });
      return;
    }
    // tuft + blossom heads
    b.cone(0.06, 0.09, { color: rng.chance(0.5) ? 0x5a9a3a : 0x6aaa44, seg: 3, x, z, flat: true, mat: Mat.Foliage, paint: true });
    const heads = b.lod ? 1 : 2;
    for (let k = 0; k < heads; k++)
      b.sphere(0.03, { color: c, mat: glow ? Mat.Glow : Mat.Foliage, wSeg: 3, hSeg: 2, flat: true, x: x + (k ? 0.035 : -0.015), z: z + (k ? -0.015 : 0.02), y: 0.08 + k * 0.018 });
  });
}

function alienFlora(b: MeshBuilder, p: Pal, rng: Rng, flavour: string): void {
  const type = flavour.split('.')[0];
  if (type === 'fungal') {
    for (const [x, z] of scatter(rng, 2, 0.4, 0.4)) drawTree(b, 'mushroom', rng, { x, z, s: rng.range(1.2, 1.6), ry: rng.range(0, 6) });
    if (!b.lod) flowers(b, p, rng, flavour);
    return;
  }
  if (type === 'toxic') {
    for (const [x, z] of scatter(rng, 3, 0.5, 0.3)) drawTree(b, 'bulb', rng, { x, z, s: rng.range(1, 1.4), ry: rng.range(0, 6) });
    return;
  }
  if (type === 'crystal') {
    for (const [x, z] of scatter(rng, 3, 0.5, 0.3)) drawTree(b, 'crystal', rng, { x, z, s: rng.range(0.9, 1.3), ry: rng.range(0, 6) });
    return;
  }
  if (type === 'jungle' || type === 'ocean' || type === 'terran') {
    // giant pitcher plants with glowing throats
    for (const [x, z] of scatter(rng, b.lod ? 2 : 3, 0.45, 0.3)) {
      const s = rng.range(0.8, 1.2);
      b.group({ x, z, s }, () => {
        b.lathe([[0.03, 0], [0.08, 0.06], [0.07, 0.18], [0.05, 0.24], [0.075, 0.28]], { color: 0x5aa04a, mat: Mat.Foliage, paint: true, seg: b.lod ? 4 : 6, flat: true });
        b.cyl(0.07, 0.05, 0.012, { color: 0xff4a9a, mat: Mat.Glow, seg: 6, y: 0.27, flat: true });
      });
    }
    if (!b.lod) drawTree(b, 'fern', rng, { x: 0.1, z: -0.1, s: 1.2 });
    return;
  }
  // generic alien tendrils: stacked twisting cones with glowing tips
  for (const [x, z] of scatter(rng, b.lod ? 2 : 4, 0.5, 0.2)) {
    const h = rng.range(0.25, 0.45);
    const c = rng.chance(0.5) ? 0x8a4ac8 : 0x4a8ac8;
    b.group({ x, z, rz: rng.range(-0.3, 0.3), rx: rng.range(-0.3, 0.3) }, () => {
      b.cone(0.04, h, { color: c, mat: Mat.Foliage, paint: true, seg: 5, flat: true });
      b.sphere(0.025, { color: 0xff6af0, mat: Mat.Glow, wSeg: 4, hSeg: 2, y: h, flat: true });
    });
  }
}

function kelp(b: MeshBuilder, rng: Rng, coral: boolean): void {
  for (const [x, z] of scatter(rng, b.lod ? 2 : 3, 0.5, 0.25)) drawTree(b, 'kelp', rng, { x, z, s: rng.range(0.9, 1.3), ry: rng.range(0, 6) });
  if (coral || rng.chance(0.4)) for (const [x, z] of scatter(rng, b.lod ? 1 : 3, 0.55, 0.2)) drawTree(b, 'coral', rng, { x, z, s: rng.range(0.8, 1.3), ry: rng.range(0, 6) });
}

function rubble(b: MeshBuilder, rng: Rng): void {
  const greys = [0x9a958c, 0xb0aca2, 0x80796e, 0xc8bca8, 0x7a6a5a];
  b.cone(0.42, 0.08, { color: 0x8a8278, seg: 8, flat: true });
  for (const [x, z] of scatter(rng, b.lod ? 4 : 8, 0.5, 0.11)) {
    const w = rng.range(0.06, 0.16);
    b.box(w, rng.range(0.04, 0.1), w * rng.range(0.5, 1.2), { color: greys[rng.int(0, greys.length - 1)], x, z, y: rng.range(0, 0.05), ry: rng.range(0, 3), rx: rng.range(-0.5, 0.5), rz: rng.range(-0.5, 0.5) });
  }
  if (!b.lod) {
    for (let i = 0; i < 3; i++) b.box(0.008, 0.16, 0.008, { color: 0x6a4a3a, mat: Mat.Plain, x: rng.range(-0.3, 0.3), z: rng.range(-0.3, 0.3), y: 0.02, rz: rng.range(-0.8, 0.8), rx: rng.range(-0.6, 0.6), detail: true });
    if (rng.chance(0.5)) b.box(0.07, 0.02, 0.06, { color: 0xff6a20, mat: Mat.Lava, x: rng.range(-0.2, 0.2), z: rng.range(-0.2, 0.2), y: 0.05, ry: 0.4, detail: true });
  }
}

function crater(b: MeshBuilder, p: Pal, rng: Rng): void {
  b.lathe([[0.02, -0.01], [0.26, 0.0], [0.5, 0.07], [0.6, 0.045], [0.72, 0.0]], { color: shade(p.rock, 0.75), seg: b.lod ? 7 : 11, flat: true });
  b.cyl(0.27, 0.27, 0.006, { color: 0x2a2624, seg: b.lod ? 7 : 11, flat: true });
  if (!b.lod) for (const [x, z] of scatter(rng, 4, 0.6, 0.2)) if (x * x + z * z > 0.2) b.box(0.05, 0.03, 0.04, { color: p.rock2, x, z, y: 0.03, ry: rng.range(0, 3), detail: true });
}

/** Draw a non-forest feature cluster. Unknown features draw nothing (caller skips empty geometry). */
export function drawFeature(b: MeshBuilder, feature: number, flavour: string, rng: Rng, biome = -1): void {
  const p = palOf(flavour);
  switch (feature) {
    case Feature.Rocks:
      rocks(b, p, rng);
      break;
    case Feature.Ore:
      ore(b, p, rng);
      break;
    case Feature.CrystalDeposit:
      crystals(b, p, rng);
      break;
    case Feature.IceDeposit:
      ice(b, rng);
      break;
    case Feature.GasVent:
      gasVent(b, p, rng);
      break;
    case Feature.GeoVent:
      geoVent(b, p, rng);
      break;
    case Feature.Ruins:
      if (flavour.startsWith('machine')) machineRuins(b, p, rng);
      else stoneRuins(b, p, rng);
      break;
    case Feature.Flowers:
      flowers(b, p, rng, flavour);
      break;
    case Feature.AlienFlora:
      alienFlora(b, p, rng, flavour);
      break;
    case Feature.Kelp:
      kelp(b, rng, biome === Biome.Coral);
      break;
    case Feature.Rubble:
      rubble(b, rng);
      break;
    case Feature.Crater:
      crater(b, p, rng);
      break;
  }
}
