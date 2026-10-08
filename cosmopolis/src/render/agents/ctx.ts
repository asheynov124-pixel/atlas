/**
 * OWNER: life.
 * LifeCtx — what every agent subsystem receives each frame: the planet, culling, clocks, lazily created vehicle
 * batches, the shared glow sprites / decals / particles, a runtime RNG and the density factor.
 */
import type { Planet } from '../../world/planet';
import type { PlanetView } from '../PlanetView';
import type { DecalBatch, KitBatch, Particles, SpriteBatch } from './batch';
import type { Cull, FastRng } from './common';

export type FleetKey =
  | 'sedan' | 'coupe' | 'van' | 'bus' | 'truck' | 'taxi' | 'police' | 'ambulance' | 'fire' | 'garbage'
  | 'maglevHead' | 'maglevCar' | 'hyperPod'
  | 'flyingCar' | 'drone' | 'airTaxi' | 'blimp' | 'airliner' | 'shuttle' | 'sled' | 'climber'
  | 'speedboat' | 'sailboat' | 'hovercraft' | 'ferry' | 'cargoShip' | 'trawler' | 'whale'
  | 'birdUp' | 'birdMid' | 'birdDown' | 'glowUp' | 'glowMid' | 'glowDown'
  | 'pedestrian';

export interface LifeCtx {
  view: PlanetView;
  planet: Planet;
  cull: Cull;
  /** agent clock: seconds scaled by game speed (frozen while paused) */
  time: number;
  /** shader clock (shared.uTime): always runs */
  realTime: number;
  /** batch for a fleet key (created on first use) */
  fleet(key: FleetKey): KitBatch;
  sprites: SpriteBatch;
  /** additive night light pools (headlight beams) */
  beams: DecalBatch;
  /** alpha wakes on water */
  wakes: DecalBatch;
  /** alpha splash / ripple rings */
  rings: DecalBatch;
  smoke: Particles;
  flames: Particles;
  rng: FastRng;
  /** 0.35 … 1 agent density factor from the quality tier */
  density: number;
  /** remaining moving agents we may still draw this frame (visible budget) */
  budget: number;
}
