/** Lifecycle every game subsystem may implement (FOUNDATION, CONTRACT). */
import type { Planet } from '../world/planet';

export interface System {
  /** after all systems are constructed (required — keeps the interface non-"weak" for TS) */
  init(): void | Promise<void>;
  /** a planet became active (PlanetView exists by then) */
  onPlanetLoaded?(planet: Planet): void;
  /** before the active planet is serialised / torn down */
  onPlanetUnloading?(planet: Planet): void;
  /** every frame, real (unscaled) seconds */
  update?(dt: number): void;
  dispose?(): void;
}
