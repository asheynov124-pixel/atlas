/**
 * OWNER: cosmos agent.
 * Universe — deterministic catalogue of galaxies → star systems → planets (+ moons), generated from a seed.
 * Hand-authored names/themes for the unlockable galaxies; procedural filler stars for visuals.
 * (Foundation stub: a single home planet.)
 */
import type { PlanetSpec, PlanetTypeId, StarKind } from '../core/types';

export interface PlanetEntry {
  id: string;
  name: string;
  spec: PlanetSpec;
  /** orbit radius in system-view units */
  orbit: number;
  /** is this a moon of another planet entry */
  parent?: string;
}

export interface StarSystem {
  id: string;
  name: string;
  star: StarKind;
  /** position in galaxy-view units */
  pos: [number, number, number];
  planets: PlanetEntry[];
  /** career unlock requirement id (e.g. 'tier:6') */
  requires?: string;
  description?: string;
}

export interface Galaxy {
  id: string;
  name: string;
  kind: 'spiral' | 'barred' | 'elliptical' | 'ring' | 'irregular';
  colors: [number, number];
  pos: [number, number, number];
  systems: StarSystem[];
  requires?: string;
  description?: string;
  /** planet types that tend to appear here */
  planetTypes?: PlanetTypeId[];
}

export function homeSpec(seed: number, name = 'Terra Nova'): PlanetSpec {
  return {
    id: 'g0.s0.p2',
    name,
    type: 'terran',
    seed,
    frequency: 40,
    oceanLevel: 0,
    mountains: 0.5,
    temperature: 16,
    gravity: 1,
    axialTilt: 0.35,
    dayLength: 240,
    atmosphere: { color: 0x6fb6ff, density: 1, breathable: true },
    hasOcean: true,
    oceanColor: 0x1d6fb8,
    cloudCover: 0.45,
    rings: null,
    moons: [{ name: 'Selene', radius: 0.27, distance: 5.5, color: 0xb8b8c0, type: 'barren', speed: 0.02, inclination: 0.12, phase: 1 }],
    tags: ['home'],
  };
}
