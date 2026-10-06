/**
 * OWNER: camera & tools agent.
 * Commands — player-facing actions with money, unlock checks, feedback (sfx / toasts) and undo/redo.
 * Tools and UI call these; god powers / sim call PlanetOps directly.
 * (Foundation stub: place / bulldoze with money, no undo.)
 *
 * CONTRACT: place(defId, tile, rot, opts?), buildRoad(path, kind), zone(tiles, zone), bulldoze(tiles),
 *           terraform(tiles, mode, amount), paint(buildingId, tint), rename(buildingId, name),
 *           addProp(...), addOrbital(defId), undo(), redo(), canUndo, canRedo, begin(label)/end() grouping.
 */
import type { Game } from './Game';
import type { System } from './System';
import { getItem } from '../content/catalog';
import { notify } from '../ui/store';
import type { BuildingInstance } from '../world/planet';
import type { RoadKind, Zone } from '../core/types';

export class Commands implements System {
  canUndo = false;
  canRedo = false;
  constructor(private game: Game) {}

  init(): void {}

  place(defId: string, tile: number, rot = 0): BuildingInstance | null {
    const g = this.game;
    const def = getItem(defId);
    if (!def || !g.ops) return null;
    if (!g.progression.isItemUnlocked(def)) {
      notify({ title: 'Locked', body: g.progression.lockReason(def) ?? 'Not unlocked yet', kind: 'warn', icon: '🔒' });
      g.audio.sfx('error');
      return null;
    }
    const check = g.ops.checkPlace(defId, tile, rot);
    if (!check.ok) {
      notify({ title: "Can't build here", body: check.reason, kind: 'warn', icon: '⚠️' });
      g.audio.sfx('error');
      return null;
    }
    if (!g.empire.spend(def.cost)) {
      notify({ title: 'Not enough credits', body: `${def.name} costs ₡${def.cost.toLocaleString()}`, kind: 'bad', icon: '💸' });
      g.audio.sfx('error');
      return null;
    }
    const b = g.ops.placeBuilding(defId, tile, rot, { day: Math.floor(g.clock.day) });
    if (b) g.audio.sfx(def.footprint > 1 ? 'placeBig' : 'place');
    return b;
  }

  buildRoad(path: number[], kind: RoadKind): boolean {
    return !!this.game.ops?.buildRoad(path, kind).length;
  }

  zone(tiles: number[], zone: Zone): number[] {
    return this.game.ops?.setZone(tiles, zone) ?? [];
  }

  bulldoze(tiles: number[]): void {
    this.game.ops?.bulldoze(tiles);
    this.game.audio.sfx('bulldoze');
  }

  undo(): void {}
  redo(): void {}
}
