/**
 * Empire — the persistent cross-planet state of one save (FOUNDATION, CONTRACT — append fields only).
 * Money is shared by every colony. Unlock ids are namespaced strings:
 *   'tier:3', 'item:<defId>', 'planet:<id>', 'system:<id>', 'galaxy:<id>', 'tech:<id>', 'power:<id>'
 */
import type { GameMode, StyleId } from '../core/types';
import type { PlanetSave } from '../world/planet';

export interface ColonySummary {
  planetId: string;
  name: string;
  population: number;
  happiness: number;
  /** net monthly income contributed while not active */
  income: number;
  foundedDay: number;
  research: number;
}

export interface HistoryPoint {
  day: number;
  population: number;
  money: number;
  happiness: number;
  income: number;
  research: number;
}

export interface EmpireState {
  v: 1;
  mode: GameMode;
  name: string;
  money: number;
  research: number;
  day: number;
  /** career tier reached 0..8 */
  tier: number;
  unlocked: string[];
  goalsDone: string[];
  currentPlanet: string;
  /** serialised colonies (the active one is refreshed on save) */
  planets: Record<string, PlanetSave>;
  colonies: Record<string, ColonySummary>;
  visited: string[];
  history: HistoryPoint[];
  /** Architect Studio creations */
  customItems: unknown[];
  counters: Record<string, number>;
  difficulty: 'relaxed' | 'normal' | 'hard';
  universeSeed: number;
  defaultStyle: StyleId;
  /** module-namespaced extra state */
  ext: Record<string, unknown>;
  createdAt: number;
  playSeconds: number;
}

export class Empire {
  s: EmpireState;
  constructor(state: EmpireState) {
    this.s = state;
  }

  static create(mode: GameMode, name: string, universeSeed: number): Empire {
    return new Empire({
      v: 1,
      mode,
      name,
      money: mode === 'sandbox' ? 999_999_999 : 60_000,
      research: 0,
      day: 0,
      tier: mode === 'sandbox' ? 8 : 0,
      unlocked: [],
      goalsDone: [],
      currentPlanet: '',
      planets: {},
      colonies: {},
      visited: [],
      history: [],
      customItems: [],
      counters: {},
      difficulty: 'normal',
      universeSeed,
      defaultStyle: 'classic',
      ext: {},
      createdAt: Date.now(),
      playSeconds: 0,
    });
  }

  get sandbox(): boolean {
    return this.s.mode === 'sandbox';
  }
  get money(): number {
    return this.s.money;
  }

  canAfford(cost: number): boolean {
    return this.sandbox || this.s.money >= cost;
  }
  /** Deduct cost; false if unaffordable (sandbox never pays). */
  spend(cost: number): boolean {
    if (this.sandbox || cost <= 0) return true;
    if (this.s.money < cost) return false;
    this.s.money -= cost;
    return true;
  }
  earn(amount: number): void {
    if (!this.sandbox) this.s.money += amount;
  }

  isUnlocked(id: string): boolean {
    return this.sandbox || this.s.unlocked.includes(id);
  }
  unlock(id: string): boolean {
    if (this.s.unlocked.includes(id)) return false;
    this.s.unlocked.push(id);
    return true;
  }
  bump(counter: string, by = 1): number {
    this.s.counters[counter] = (this.s.counters[counter] ?? 0) + by;
    return this.s.counters[counter];
  }
}
