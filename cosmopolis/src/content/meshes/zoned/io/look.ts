/**
 * zoned-io · Looks — how each of the 8 architectural styles dresses industry and offices (OWNER: zoned-io).
 *
 * Building types (general.ts, farm.ts, mining.ts, tech.ts, office.ts) describe MASSING and machinery; the style
 * Look decides the architectural grammar that parts.ts applies to it:
 *   classic    brick & steel sheds with glazed sawtooth roofs, red-and-white stacks, deco crowns
 *   neo        white rounded volumes under floating roof slabs, cyan light lines, halo crowns
 *   solarpunk  timber & terracotta, solar sawtooths, green roofs and planted crowns
 *   cyber      gunmetal boxes, parapet neon, holo signs, antenna-cluster crowns
 *   mars       ochre adobe with skylight domes, pressurised arcades, dome-topped towers
 *   ice        insulated barrel vaults, spherical tanks, frosted glass, blue light
 *   crystal    faceted prisms, steep glass ridges, glowing shards
 *   organic    pods on plinths, bulb tanks, tendril stacks, bloom crowns
 *
 * `makeIO` resolves a variant-stable palette + RNGs, so a building keeps its identity (colours, layout) while
 * it levels up 1 → 5; only size, density and prestige change.
 */
import type { MeshContext, MeshFactory } from '../../../catalog';
import { MeshBuilder } from '../../../kit';
import { Rng, hash2, hashString } from '../../../../core/rng';
import type { StyleId } from '../../../../core/types';
import type { StylePalette } from '../../../styles';
import { BUDGET, clamp, mix, shade } from './common';

export type HallKind = 'saw' | 'slab' | 'flat' | 'adobe' | 'vault' | 'prism' | 'pod';
export type ShellKind = 'box' | 'round' | 'facet' | 'pod';
export type StackKind = 'stripe' | 'slim' | 'brick' | 'neon' | 'adobe' | 'frost' | 'shard' | 'tendril';
export type TankKind = 'cone' | 'domed' | 'stave' | 'ringed' | 'adobe' | 'sphere' | 'prism' | 'bulb';
export type CrownKind = 'deco' | 'halo' | 'garden' | 'antenna' | 'dome' | 'frost' | 'shard' | 'bloom';
export type TreeKind = 'round' | 'neat' | 'lush' | 'neon' | 'cactus' | 'pine' | 'crystal' | 'bulb';

export interface Look {
  id: StyleId;
  hall: HallKind;
  shell: ShellKind;
  stack: StackKind;
  tank: TankKind;
  crown: CrownKind;
  tree: TreeKind;
  /** ground plates */
  ground: number;
  yard: number;
  asphalt: number;
  soil: number;
  /** foliage & trunks */
  green: number;
  green2: number;
  trunk: number;
  /** machinery cladding, structural steel (cranes, frames), pipes */
  metal: number;
  steel: number;
  pipes: number[];
  /** industrial wall cladding (falls back to style walls) */
  indWalls?: number[];
  /** shipping-container colours */
  cargo: number[];
  /** crop stripe colours */
  crops: number[];
  /** ore / loose material colours */
  ore: number[];
  /** greenhouse glass */
  houseGlass: number;
  /** night accent light colour (Mat.Light) */
  lamp: number;
  /** always-on glow lines are used (neon-ish styles) */
  glowy: boolean;
  /** roofs prefer solar panels */
  solar: boolean;
  /** 0..1 planted roofs / extra trees */
  green01: number;
}

export const LOOKS: Record<StyleId, Look> = {
  classic: {
    id: 'classic', hall: 'saw', shell: 'box', stack: 'stripe', tank: 'cone', crown: 'deco', tree: 'round',
    ground: 0x7fa95a, yard: 0xa9a59b, asphalt: 0x4b4e54, soil: 0x7d5c40,
    green: 0x5e9a45, green2: 0x7cb65a, trunk: 0x6a4a32,
    metal: 0x9aa3ad, steel: 0xe2b23a, pipes: [0xc9c2b2, 0x6f8fb0, 0xc0563a],
    indWalls: [0xa9614a, 0x8e9aa7, 0xd3cbb8, 0x77937f, 0xbcae92, 0x9a6a50, 0xc7b79a],
    cargo: [0xc0392b, 0x2e6fb0, 0xe08a2a, 0x3a8a4a, 0x8a8f96, 0xd8b23a],
    crops: [0xdab54a, 0x6aa344, 0xa8cf58, 0xc79a3a],
    ore: [0x8a8070, 0x6a5a4a, 0xa09080],
    houseGlass: 0x9fc8c0, lamp: 0xffd9a0, glowy: false, solar: false, green01: 0.25,
  },
  neo: {
    id: 'neo', hall: 'slab', shell: 'round', stack: 'slim', tank: 'domed', crown: 'halo', tree: 'neat',
    ground: 0x9ccf8a, yard: 0xdde3ea, asphalt: 0x8d96a3, soil: 0x9a8a78,
    green: 0x6fc27a, green2: 0x9fe0a0, trunk: 0x8a8a8a,
    metal: 0xd8dee8, steel: 0xf2f5f9, pipes: [0xe6ecf4, 0x7ab8e0, 0xb8c4d6],
    cargo: [0xf4f6fa, 0x3fc8f0, 0x7a9cff, 0xb8c4d6, 0x9fffe0],
    crops: [0x8fe08a, 0xc8f0a0, 0x5ac08a, 0xe0f0d0],
    ore: [0xb8c0c8, 0x9aa4b0, 0xd0d6de],
    houseGlass: 0xa8e0f0, lamp: 0xbff0ff, glowy: true, solar: false, green01: 0.3,
  },
  solarpunk: {
    id: 'solarpunk', hall: 'saw', shell: 'box', stack: 'brick', tank: 'stave', crown: 'garden', tree: 'lush',
    ground: 0x6fb84e, yard: 0xd6c69e, asphalt: 0x7a7262, soil: 0x6a4a2e,
    green: 0x4fa040, green2: 0x8fd060, trunk: 0x7a5232,
    metal: 0xb0a890, steel: 0x5a9a4a, pipes: [0xc98a5a, 0x8a5a3a, 0xe8d8b0],
    cargo: [0xd9a04a, 0x5a9a4a, 0xc9603a, 0xe8d8b0, 0x2a6a8a],
    crops: [0x5ab040, 0xf0c838, 0x8fd060, 0xc8a040],
    ore: [0x9a7a5a, 0x7a6a4a, 0xb89a6a],
    houseGlass: 0xb8e0c0, lamp: 0xffe6a0, glowy: false, solar: true, green01: 0.9,
  },
  cyber: {
    id: 'cyber', hall: 'flat', shell: 'box', stack: 'neon', tank: 'ringed', crown: 'antenna', tree: 'neon',
    ground: 0x2c3a34, yard: 0x383c47, asphalt: 0x2a2d35, soil: 0x3a2e2a,
    green: 0x2f6a4a, green2: 0x3fa070, trunk: 0x2a2e38,
    metal: 0x4a505e, steel: 0x3a3f4e, pipes: [0x5a5f6e, 0x2ff8ff, 0xff2fd0],
    cargo: [0x3a2f4e, 0x2a4a5a, 0x5a2a4a, 0x4a4a2a, 0x22252e],
    crops: [0x9a40ff, 0x40ffb0, 0xff40d0, 0x2a8a6a],
    ore: [0x3a3a46, 0x4a3a5a, 0x2a2a30],
    houseGlass: 0x6a4aa0, lamp: 0xff9af0, glowy: true, solar: false, green01: 0.05,
  },
  mars: {
    id: 'mars', hall: 'adobe', shell: 'round', stack: 'adobe', tank: 'adobe', crown: 'dome', tree: 'cactus',
    ground: 0xc77a48, yard: 0xd99a68, asphalt: 0x8a4a2e, soil: 0xa0502a,
    green: 0x7a9a4a, green2: 0x9ab85a, trunk: 0x7a4a2a,
    metal: 0xc8b8a0, steel: 0xb8653a, pipes: [0xf2e6d0, 0x8a4a2a, 0x4ad0ff],
    indWalls: [0xd9894f, 0xc9733f, 0xe6a06a, 0xb8653a, 0xf0b884, 0xe8c8a0],
    cargo: [0xf2e6d0, 0xb8653a, 0x4ad0ff, 0xffd04a, 0x8a4a2a],
    crops: [0x7aa040, 0xb8c850, 0x5a8a3a, 0xd0a040],
    ore: [0xa04a2a, 0x8a3a20, 0xc06a3a],
    houseGlass: 0xb8d8d0, lamp: 0xffc890, glowy: false, solar: true, green01: 0.15,
  },
  ice: {
    id: 'ice', hall: 'vault', shell: 'round', stack: 'frost', tank: 'sphere', crown: 'frost', tree: 'pine',
    ground: 0xe4eef6, yard: 0xd2dde8, asphalt: 0x8a9aac, soil: 0xb8c8d8,
    green: 0x4a7a6a, green2: 0x6a9a8a, trunk: 0x5a4a3a,
    metal: 0xc6d4e2, steel: 0xe05a3a, pipes: [0xf2f8ff, 0x6f9ac0, 0xe05a3a],
    cargo: [0xe05a3a, 0xf2f8ff, 0x6f9ac0, 0xffb040, 0x9fc6e6],
    crops: [0x7ad0a0, 0xa0e0c0, 0x5ab08a, 0xc8f0e0],
    ore: [0x8a9aac, 0x6a7a8c, 0xaabaca],
    houseGlass: 0xbfe8ff, lamp: 0xfff0d0, glowy: true, solar: false, green01: 0.05,
  },
  crystal: {
    id: 'crystal', hall: 'prism', shell: 'facet', stack: 'shard', tank: 'prism', crown: 'shard', tree: 'crystal',
    ground: 0xb8acd8, yard: 0xc8bfe0, asphalt: 0x5a5072, soil: 0x7a6a9a,
    green: 0x7a9ad0, green2: 0x9ac0e0, trunk: 0x5a4a9a,
    metal: 0xd8d0f0, steel: 0x8a6ae0, pipes: [0xe0d8ff, 0x9affff, 0xff9aff],
    cargo: [0xc8b8ff, 0x9affff, 0xff9aff, 0x8a6ae0, 0xf0e8ff],
    crops: [0x9affff, 0xc8a0ff, 0x7ae0d0, 0xff9aff],
    ore: [0x9a8ae0, 0xc8b8ff, 0x6a5ab0],
    houseGlass: 0xd0c8ff, lamp: 0xe0c8ff, glowy: true, solar: false, green01: 0.1,
  },
  organic: {
    id: 'organic', hall: 'pod', shell: 'pod', stack: 'tendril', tank: 'bulb', crown: 'bloom', tree: 'bulb',
    ground: 0x9aaa6a, yard: 0xcab0a0, asphalt: 0x6a5060, soil: 0x6a4a4a,
    green: 0x7a9a5a, green2: 0xb0d070, trunk: 0x5a3a4a,
    metal: 0xd9c0c8, steel: 0xe6d8c0, pipes: [0xb89ab0, 0x7affd0, 0x8a5a7a],
    cargo: [0xd9b8d0, 0x8a5a7a, 0x7affd0, 0xe6d0c0, 0xa06a8a],
    crops: [0xd0ff7a, 0xff7ad0, 0x7affd0, 0xa0c050],
    ore: [0x8a6a7a, 0x6a4a5a, 0xa08a90],
    houseGlass: 0xc0e0c8, lamp: 0xb0ffd8, glowy: true, solar: false, green01: 0.6,
  },
};

/** Resolved, variant-stable colours for one building. */
export interface Pal {
  wall: number;
  wall2: number;
  ind: number;
  ind2: number;
  roof: number;
  trim: number;
  accent: number;
  accent2: number;
  glass: number;
  /** accent glow (neon strips, signs) */
  glow: number;
  lamp: number;
  cargo: number;
  ore: number;
  dark: number;
}

/** Everything a building factory needs. */
export interface IO {
  b: MeshBuilder;
  /** level 1..5 */
  L: number;
  /** variant index */
  v: number;
  /** variant-stable integer seed */
  seed: number;
  /** variant-stable rng for layout / colour choices */
  vr: Rng;
  /** per-mesh rng (level & style specific) for small jitter */
  rng: Rng;
  sid: StyleId;
  st: StylePalette;
  lk: Look;
  p: Pal;
  /** far LOD: skip fussy work */
  lo: boolean;
  /** triangles still needed by mandatory parts drawn later */
  reserve: number;
  /** extra headroom demanded by factory() after a trial build overflowed the budget */
  squeeze: number;
  /** 0..1 prestige for the level */
  pr: number;
}

/**
 * True when an optional part of n triangles fits the budget while leaving io.reserve for what follows.
 * Applies at LOD1 too (detail parts are skipped there anyway), so the far mesh never outgrows the near one.
 */
export function fits(io: IO, n: number): boolean {
  return io.b.triangles + n + io.reserve + io.squeeze <= BUDGET - 4;
}

/** Variant-stable boolean (layout mirroring etc.). */
export function flip(io: IO, salt: number): boolean {
  return (hash2(io.seed, salt) & 1) === 1;
}

function pickI(arr: readonly number[], seed: number, salt: number): number {
  return arr[hash2(seed, salt) % arr.length];
}

/** Build the per-mesh context. */
export function makeIO(ctx: MeshContext, squeeze = 0): IO {
  const st = ctx.style;
  const lk = LOOKS[ctx.styleId] ?? LOOKS.classic;
  const seed = hash2(hashString(ctx.def.id), ctx.variant * 7919 + 17);
  const walls = st.walls;
  const wi = hash2(seed, 1) % walls.length;
  const w2 = walls.length > 1 ? (wi + 1 + (hash2(seed, 2) % (walls.length - 1))) % walls.length : wi;
  const ind = lk.indWalls ?? walls;
  const ii = hash2(seed, 8) % ind.length;
  const i2 = ind.length > 1 ? (ii + 1 + (hash2(seed, 9) % (ind.length - 1))) % ind.length : ii;
  const ai = hash2(seed, 3) % st.accents.length;
  const p: Pal = {
    wall: walls[wi],
    wall2: walls[w2],
    ind: ind[ii],
    ind2: ind[i2],
    roof: pickI(st.roofs, seed, 4),
    trim: pickI(st.trims, seed, 5),
    accent: st.accents[ai],
    accent2: st.accents[(ai + 1) % st.accents.length],
    glass: st.glass,
    glow: lk.glowy ? st.accents[ai] : mix(st.accents[ai], 0xffffff, 0.2),
    lamp: lk.lamp,
    cargo: pickI(lk.cargo, seed, 6),
    ore: pickI(lk.ore, seed, 7),
    dark: shade(walls[walls.length - 1], 0.25),
  };
  if (ctx.styleId === 'cyber') p.dark = 0x14161c;
  const L = clamp(Math.round(ctx.level || 1), 1, 5);
  return {
    b: ctx.b,
    L,
    v: ctx.variant,
    seed,
    vr: new Rng(hash2(seed, 77)),
    rng: ctx.rng,
    sid: ctx.styleId,
    st,
    lk,
    p,
    lo: ctx.lod === 1,
    reserve: 0,
    squeeze,
    pr: (L - 1) / 4,
  };
}

/**
 * Wrap a factory body. A deterministic LOD0 trial build measures the mesh first; if mandatory parts pushed it past
 * the growable budget, the overflow becomes extra headroom (`squeeze`) so optional parts drop out on the real
 * build. LOD1 uses the same squeeze, so the far mesh is always a subset of the near one.
 */
export function factory(fn: (io: IO) => void): MeshFactory {
  return (ctx) => {
    let squeeze = 0;
    for (let k = 0; k < 5; k++) {
      const trial = new MeshBuilder(0);
      fn(makeIO({ ...ctx, b: trial, lod: 0 }, squeeze));
      if (trial.triangles <= BUDGET) break;
      // escalate: freed headroom tends to be refilled by the next optional part in line
      squeeze += (trial.triangles - BUDGET) * (k + 1) + 12;
    }
    fn(makeIO(ctx, squeeze));
  };
}
