/**
 * OWNER: roads & props agent.
 * PropRenderer — natural features (forests per biome/planet type, rocks, ore, crystals, vents, ruins, rubble,
 * kelp) generated from planet.feature, plus user-placed decor props (planet.props) via InstancePools.
 * (Foundation stub: renders nothing.)
 */
import type { PlanetView } from '../PlanetView';

export class PropRenderer {
  constructor(_view: PlanetView) {}
  update(_dt: number): void {}
  dispose(): void {}
}
