/**
 * OWNER: camera & tools agent.
 * ToolManager — the active tool state machine. Tools: select, plop (place ItemDef with ghost + rotation),
 * road (path drawing with live cost), zone (brush / fill-along-road), bulldoze, terraform (raise/lower/flatten/
 * smooth/biome/forest/water), district (paint + create), paint (tint buildings), decor (free prop placement),
 * orbit (place orbital), god (target a god power). Writes ui.tool / ui.toolOptions / ui.hint / ui.costPreview.
 * (Foundation stub: select + simple plop on tap.)
 *
 * CONTRACT: select(state | null), tap(hit), hover(hit), pointerDown/Move/Up(hit, info), setOption(id, value),
 *           cancel(), update(dt), isDrawing (true while a drag-paint tool owns one-finger drags)
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import { ui, type ToolState } from '../ui/store';
import type { PickResult } from '../world/geo';
import { bus } from '../core/events';
import { getItem } from '../content/catalog';

export class ToolManager implements System {
  current: ToolState | null = null;
  isDrawing = false;
  rotation = 0;

  constructor(private game: Game) {}

  init(): void {}

  select(state: ToolState | null): void {
    this.current = state;
    ui.tool.value = state;
    ui.toolOptions.value = [];
    ui.hint.value = state?.itemId ? `Tap to place ${getItem(state.itemId)?.name ?? ''}` : null;
    bus.emit('tool:changed', { toolId: state?.id ?? null });
  }

  cancel(): void {
    this.select(null);
  }

  setOption(_id: string, _value: unknown): void {}

  hover(_hit: PickResult | null): void {}

  tap(hit: PickResult | null): void {
    if (!hit) return;
    const t = this.current;
    if (t?.id === 'plop' && t.itemId) {
      this.game.commands.place(t.itemId, hit.tile, this.rotation);
      return;
    }
    if (t?.id === 'god' && t.powerId) {
      this.game.god.trigger(t.powerId, { tile: hit.tile, point: hit.point });
      return;
    }
    const bid = this.game.planet?.building[hit.tile] ?? -1;
    const sel = bid >= 0 ? ({ kind: 'building', id: bid } as const) : ({ kind: 'tile', tile: hit.tile } as const);
    ui.selection.value = sel;
    bus.emit('selection:changed', { selection: sel });
  }

  pointerDown(_hit: PickResult | null): void {}
  pointerMove(_hit: PickResult | null): void {}
  pointerUp(_hit: PickResult | null): void {}
  update(_dt: number): void {}
}
