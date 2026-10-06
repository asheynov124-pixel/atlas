/**
 * OWNER: cosmos agent.
 * Progression — career milestones (population tiers with names: Outpost → Galactic Civilisation), goal chains,
 * unlock rules for items / planets / systems / galaxies / god powers, research tech tree, rewards, celebrations.
 * Sandbox: everything unlocked.
 * (Foundation stub: tier gating only.)
 *
 * CONTRACT: isItemUnlocked(def), lockReason(def), tierName(t), goals (published to ui.goals), update(dt),
 *           techs (research tree) & research(techId), isUnlocked(id) for 'planet:'/'system:'/'galaxy:'/'power:' ids.
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { ItemDef } from '../content/catalog';

export const TIER_NAMES = ['Outpost', 'Settlement', 'Township', 'Colony City', 'Metropolis', 'Megacity', 'Interplanetary Power', 'Stellar Civilisation', 'Galactic Civilisation'];

export class Progression implements System {
  constructor(private game: Game) {}

  init(): void {}

  isItemUnlocked(def: ItemDef): boolean {
    const e = this.game.empire;
    if (e.sandbox) return true;
    if (def.planetTypes && this.game.planet && !def.planetTypes.includes(this.game.planet.spec.type)) return false;
    return def.tier <= e.s.tier || e.isUnlocked('item:' + def.id);
  }

  lockReason(def: ItemDef): string | null {
    if (this.isItemUnlocked(def)) return null;
    return `Reach ${TIER_NAMES[def.tier] ?? 'tier ' + def.tier}`;
  }

  isUnlocked(id: string): boolean {
    return this.game.empire.isUnlocked(id);
  }

  tierName(t: number): string {
    return TIER_NAMES[t] ?? `Tier ${t}`;
  }

  update(_dt: number): void {}
}
