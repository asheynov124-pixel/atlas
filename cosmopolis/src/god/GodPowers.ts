/**
 * OWNER: god-powers agent.
 * GodPowers — disasters and divine interventions, from a lightning bolt to swallowing the planet with a black hole.
 * Each power has gameplay effects (via PlanetOps) + spectacular FX (render/fx) + camera shake + audio + news.
 * Planet-ending powers snapshot the planet first and offer "Rewind Time" (Chrono) afterwards.
 * (Foundation stub: empty registry.)
 *
 * CONTRACT
 *   powers: GodPowerDef[]
 *   trigger(id, target?) → boolean     target: { tile?, point?, path? }
 *   stopAll()                          active: number (running effects)
 */
import type { Vector3 } from 'three';
import type { Game } from '../game/Game';
import type { System } from '../game/System';

export type GodCategory = 'weather' | 'earth' | 'sky' | 'cosmic' | 'creature' | 'creation' | 'apocalypse';

export interface GodTarget {
  tile?: number;
  point?: Vector3;
  path?: number[];
}

export interface GodPowerDef {
  id: string;
  name: string;
  icon: string;
  category: GodCategory;
  description: string;
  flavor?: string;
  /** 'tile' = tap a spot, 'drag' = draw a path, 'global' = whole planet, no target */
  targeting: 'tile' | 'drag' | 'global';
  /** career tier required (sandbox ignores) */
  tier?: number;
  /** destroys / transforms the whole planet — confirm + Chrono snapshot */
  planetEnding?: boolean;
  /** seconds */
  cooldown?: number;
}

export class GodPowers implements System {
  powers: GodPowerDef[] = [];
  active = 0;
  constructor(private game: Game) {}

  init(): void {}
  trigger(_id: string, _target?: GodTarget): boolean {
    return false;
  }
  stopAll(): void {}
}
