/**
 * Architectural styles. Mesh builders read palettes from here so a district / planet / user choice can
 * re-skin every building. CONTRACT: StyleId is in core/types.ts.
 */
import type { StyleId } from '../core/types';

export interface StylePalette {
  id: StyleId;
  name: string;
  description: string;
  /** wall / facade colours (pick by variant) */
  walls: number[];
  /** roof colours */
  roofs: number[];
  /** trim / structural accents */
  trims: number[];
  /** accent / signage colours (often used with Mat.Glow) */
  accents: number[];
  /** glass tint for curtain walls */
  glass: number;
  /** emissive window colour at night */
  windowLight: number;
  /** 0..1 how curvy / domed the style prefers to be (builders may use) */
  curvy: number;
  /** 0..1 how much greenery (roof gardens, vines) */
  green: number;
  /** 0..1 how much neon / glow */
  neon: number;
}

export const STYLES: Record<StyleId, StylePalette> = {
  classic: {
    id: 'classic',
    name: 'Modern Classic',
    description: 'Familiar Earth-style brick, concrete and glass.',
    walls: [0xe8e0d0, 0xd8c8b0, 0xb87a5a, 0xc9b79c, 0xa0a8b0, 0xf0ece4, 0x9a6a50],
    roofs: [0x8a4a3a, 0x5a5a62, 0x6a4a3a, 0x3a3a42, 0x9a5a40],
    trims: [0xffffff, 0x6a6a72, 0x3a3a3a],
    accents: [0xffb04a, 0x4ab0ff, 0xff5a5a],
    glass: 0x5a7a9a,
    windowLight: 0xffd9a0,
    curvy: 0.1,
    green: 0.2,
    neon: 0.1,
  },
  neo: {
    id: 'neo',
    name: 'Neo-Futurist',
    description: 'Gleaming white curves, sky bridges and cyan light.',
    walls: [0xf4f6fa, 0xe6ecf4, 0xdfe6f0, 0xffffff, 0xcfd8e6],
    roofs: [0xdfe6f0, 0xb8c4d6, 0xffffff],
    trims: [0x9fb0c8, 0x6f84a0, 0xffffff],
    accents: [0x3fe0ff, 0x7a9cff, 0x9fffe0],
    glass: 0x7ab8e0,
    windowLight: 0xbff0ff,
    curvy: 0.8,
    green: 0.25,
    neon: 0.35,
  },
  solarpunk: {
    id: 'solarpunk',
    name: 'Solarpunk',
    description: 'Timber, terracotta, roof gardens and solar sails.',
    walls: [0xf2e6c8, 0xd9b98a, 0xc98a5a, 0xe8d8b0, 0xb8956a],
    roofs: [0x5aa04a, 0x6ab85a, 0x3f7a3a, 0x2a4a6a],
    trims: [0x8a5a3a, 0x6a4a2a, 0xf6f0e0],
    accents: [0xffd24a, 0x7aff9a, 0xff9a4a],
    glass: 0x6a9a8a,
    windowLight: 0xffe6a0,
    curvy: 0.5,
    green: 0.9,
    neon: 0.05,
  },
  cyber: {
    id: 'cyber',
    name: 'Cyberpunk',
    description: 'Dark megablocks, holographic ads and neon rain.',
    walls: [0x2a2e3a, 0x3a3f4e, 0x22252e, 0x4a4f5e, 0x1e2028],
    roofs: [0x1a1c24, 0x2a2e38],
    trims: [0x5a5f6e, 0x14161c],
    accents: [0xff2fd0, 0x2ff8ff, 0xfff02f, 0xff4a2f, 0x9a4aff],
    glass: 0x2a3a5a,
    windowLight: 0xff9af0,
    curvy: 0.15,
    green: 0.05,
    neon: 1,
  },
  mars: {
    id: 'mars',
    name: 'Martian Adobe',
    description: 'Sun-baked domes, ochre walls and pressurised arcades.',
    walls: [0xd9894f, 0xc9733f, 0xe6a06a, 0xb8653a, 0xf0b884],
    roofs: [0xf2e6d0, 0xd9c8a8, 0xb8653a],
    trims: [0x8a4a2a, 0xf6eee0],
    accents: [0x4ad0ff, 0xffd04a],
    glass: 0x8ab0c8,
    windowLight: 0xffc890,
    curvy: 0.7,
    green: 0.15,
    neon: 0.1,
  },
  ice: {
    id: 'ice',
    name: 'Glacier Domes',
    description: 'Insulated white domes and frosted blue glass.',
    walls: [0xf2f8ff, 0xdfeefa, 0xc6dcef, 0xffffff],
    roofs: [0xb8d8f0, 0xe6f2ff, 0x9fc6e6],
    trims: [0x6f9ac0, 0xffffff],
    accents: [0x7ae0ff, 0xb0a0ff],
    glass: 0x9fd8ff,
    windowLight: 0xfff0d0,
    curvy: 0.85,
    green: 0.05,
    neon: 0.2,
  },
  crystal: {
    id: 'crystal',
    name: 'Prismatic',
    description: 'Faceted crystal towers that glow from within.',
    walls: [0xc8b8ff, 0xb0a0f0, 0xe0d8ff, 0x9a8ae0, 0xf0e8ff],
    roofs: [0x8a6ae0, 0xb89aff, 0x6a4ac0],
    trims: [0xffffff, 0x5a4a9a],
    accents: [0xff9aff, 0x9affff, 0xffffff],
    glass: 0xb8a8ff,
    windowLight: 0xe0c8ff,
    curvy: 0.2,
    green: 0.05,
    neon: 0.6,
  },
  organic: {
    id: 'organic',
    name: 'Bio-Organic',
    description: 'Grown, not built: shells, pods and glowing tendrils.',
    walls: [0xe6d0c0, 0xc9a890, 0xd9b8d0, 0xb89ab0, 0xf0e0d0],
    roofs: [0x8a5a7a, 0x6a8a5a, 0xa06a8a],
    trims: [0x5a3a4a, 0xf0e0e6],
    accents: [0x7affd0, 0xff7ad0, 0xd0ff7a],
    glass: 0x9a7aa0,
    windowLight: 0xb0ffd8,
    curvy: 1,
    green: 0.6,
    neon: 0.5,
  },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];
