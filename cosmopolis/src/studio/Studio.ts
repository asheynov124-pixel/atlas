/**
 * OWNER: studio agent.
 * Studio — the Architect Studio: compose your own buildings from modular parts (bases, floors, towers, domes,
 * spires, rings, roofs, gardens, neon, antennas…) with colours, materials and sizes, preview in a dedicated 3D
 * stage, save them as custom ItemDefs (category 'custom') that appear in the build menu and persist in the save.
 * (Foundation stub.)
 *
 * CONTRACT: open(editId?), close(), isOpen, loadFromEmpire(), customDefs()
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { ItemDef } from '../content/catalog';

export class Studio implements System {
  isOpen = false;
  constructor(private game: Game) {}

  init(): void {}
  open(_editId?: string): void {}
  close(): void {}
  loadFromEmpire(): void {}
  customDefs(): ItemDef[] {
    return [];
  }
}
