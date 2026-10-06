/**
 * OWNER: simulation agent.
 * Simulation — the city model of the active planet: RCI(O) demand, zoned growth & levelling, abandonment,
 * utilities (power / water / oxygen / garbage / data), service coverage, land value, pollution, crime, health,
 * education, happiness, traffic, tourism, research, economy (taxes, upkeep, loans), districts & policies,
 * citizen chatter (news), monthly reports, inactive-colony summaries and random events.
 * (Foundation stub: no growth, static stats.)
 *
 * CONTRACT (used by UI, progression, overlays, god powers):
 *   tick(days)                            called by Game with whole elapsed sim days
 *   stats: Record<string, number>         MetricId keys + extras (published to ui.stats)
 *   demand: { R, C, I, O }                −1..1
 *   lenses: LensDef[]                     data views (overlay maps)
 *   policies: PolicyDef[]                 city / district policies
 *   taxes: { R, C, I, O }                 0..0.3 (UI sliders)
 *   budget: Record<string, number>        service funding 0.5..1.5
 *   getMetric(id): number
 *   inspectBuilding(id): InspectRow[]     inspectTile(tile): InspectRow[]
 *   colonySummary(): ColonySummary-like   for the empire when leaving the planet
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { InspectRow, MetricId } from '../core/types';
import type { Planet } from '../world/planet';
import type { ColorRamp } from '../render/planet/PlanetSurface';
import { getItem } from '../content/catalog';

export interface LensDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  group?: string;
  ramp: ColorRamp;
  /** [low label, high label] */
  legend: [string, string];
  /** per-tile values 0..1 for the active planet */
  values(planet: Planet): ArrayLike<number>;
}

export interface PolicyDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** monthly cost (+) or income (−) per 1 000 citizens */
  costPer1k: number;
  scope: 'city' | 'district' | 'both';
  tier?: number;
}

export class Simulation implements System {
  stats: Record<string, number> = { population: 0, happiness: 50, jobs: 0 };
  demand = { R: 0.6, C: 0.3, I: 0.4, O: 0 };
  lenses: LensDef[] = [];
  policies: PolicyDef[] = [];
  taxes = { R: 0.09, C: 0.09, I: 0.09, O: 0.09 };
  budget: Record<string, number> = {};

  constructor(private game: Game) {}

  init(): void {}

  onPlanetLoaded(_planet: Planet): void {}

  tick(_days: number): void {}

  getMetric(id: MetricId): number {
    if (id === 'money') return this.game.empire.money;
    return this.stats[id] ?? 0;
  }

  inspectBuilding(id: number): InspectRow[] {
    const b = this.game.planet?.buildings.get(id);
    if (!b) return [];
    const def = getItem(b.defId);
    return [
      { label: 'Type', value: def?.name ?? b.defId },
      { label: 'Level', value: String(b.level) },
    ];
  }

  inspectTile(tile: number): InspectRow[] {
    const p = this.game.planet;
    if (!p) return [];
    return [{ label: 'Elevation', value: String(p.elevation[tile]) }];
  }
}
