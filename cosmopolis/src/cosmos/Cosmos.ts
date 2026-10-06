/**
 * OWNER: cosmos agent.
 * Cosmos — the universe outside the active planet: System / Galaxy / Universe views (3D scenes implementing View),
 * cinematic warp transitions, travel & colonisation flow, sandbox Planet Forge (custom planet specs).
 * (Foundation stub: home planet only, no views.)
 *
 * CONTRACT
 *   homePlanetSpec(opts?)                     → PlanetSpec for a new game
 *   planetSpec(id)                            → PlanetSpec | null
 *   openView(kind, focusId?)                  'system' | 'galaxy' | 'universe'
 *   requestZoomOut()                          planet camera zoomed past max → system view
 *   travelTo(planetId)                        warp + game.enterPlanet
 *   canTravel(planetId)                       { ok, reason? }
 *   forgePlanet(partial)                      sandbox: create + register a custom PlanetSpec
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { PlanetSpec, PlanetTypeId } from '../core/types';
import { homeSpec, type Galaxy } from './Universe';

export class Cosmos implements System {
  galaxies: Galaxy[] = [];
  private custom = new Map<string, PlanetSpec>();
  constructor(private game: Game) {}

  init(): void {}

  homePlanetSpec(opts: { seed?: number; name?: string; type?: PlanetTypeId } = {}): PlanetSpec {
    const s = homeSpec(opts.seed ?? this.game.empire.s.universeSeed, opts.name);
    return opts.type ? { ...s, type: opts.type } : s;
  }

  planetSpec(id: string): PlanetSpec | null {
    if (this.custom.has(id)) return this.custom.get(id)!;
    const h = this.homePlanetSpec();
    return id === h.id ? h : null;
  }

  openView(_kind: 'system' | 'galaxy' | 'universe', _focusId?: string): void {}
  requestZoomOut(): void {}
  async travelTo(planetId: string): Promise<void> {
    const spec = this.planetSpec(planetId);
    if (spec) this.game.enterPlanet(spec);
  }
  canTravel(_planetId: string): { ok: boolean; reason?: string } {
    return { ok: true };
  }
  forgePlanet(partial: Partial<PlanetSpec>): PlanetSpec {
    const base = this.homePlanetSpec();
    const spec: PlanetSpec = { ...base, ...partial, id: partial.id ?? `sandbox.${this.custom.size + 1}` };
    this.custom.set(spec.id, spec);
    return spec;
  }
}
