/**
 * OWNER: tools.
 * MoveTool — relocate a building without rebuilding it (keeps its name, level, style, paint and residents' sense
 * of identity). Tap a building to lift it (it turns into a blueprint), a ghost follows the pointer — auto-facing
 * roads, R to rotate — tap the new spot to set it down. Esc drops it back. One undo step per move.
 */
import { Matrix4 } from 'three';
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolState } from '../ui/store';
import { getItem } from '../content/catalog';
import { friendlyReason } from '../game/Commands';
import { InstState } from '../render/materials';
import { buildingMatrix, footprintFacing } from './util';
import { TOOL_COLORS } from './visuals';

const _m = new Matrix4();

export class MoveTool extends Tool {
  readonly id = 'move';
  private picked = -1;
  private rot = 0;
  private manualRot = false;
  private hoverTile = -1;
  private valid = false;
  private reason = '';

  override get rotatable(): boolean {
    return this.picked >= 0;
  }
  override get placing(): boolean {
    return true;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    this.drop();
  }

  override exit(): void {
    this.drop();
  }

  override hint(): string {
    if (this.picked < 0) return this.mgr.touch ? 'Tap a building to pick it up' : 'Click a building to pick it up';
    return this.mgr.touch ? 'Tap the new spot · Esc / ✕ to put it back' : 'Click the new spot · R rotates · Esc puts it back';
  }

  private drop(): void {
    if (this.picked >= 0) this.game.planetView?.buildings.forceState(this.picked, null);
    this.picked = -1;
    this.manualRot = false;
    this.hoverTile = -1;
    const v = this.mgr.visuals;
    v?.ghost.hide();
    v?.highlight('tool', null);
    v?.highlight('tool-bad', null);
    this.mgr.hideTag();
  }

  override rotate(dir: number): void {
    if (this.picked < 0) return;
    this.manualRot = true;
    this.rot = (this.rot + dir + 6) % 6;
    const t = this.hoverTile;
    this.hoverTile = -1;
    if (t >= 0) this.evaluate(t);
  }

  private evaluate(tile: number): void {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    const b = p?.buildings.get(this.picked);
    if (!p || !v || !b) return;
    if (tile === this.hoverTile) return;
    this.hoverTile = tile;
    const def = getItem(b.defId);
    const fp = def?.footprint ?? 1;
    if (!this.manualRot) {
      const f = footprintFacing(p, tile, fp);
      this.rot = f >= 0 ? f : b.rot;
    }
    const tiles = p.grid.footprint(tile, fp);
    const c = this.game.ops!.checkPlace(b.defId, tile, this.rot);
    // its own footprint is not "in the way"
    const blocked = c.blocked.filter((t) => p.building[t] !== b.id);
    let ok = c.ok || (c.reason === 'Something is in the way' && blocked.length === 0);
    let reason = friendlyReason(c.reason);
    if (ok && !c.ok && c.reason === 'Something is in the way' && def?.placement === 'surface' && def.category !== 'decor') {
      const roadOk = tiles.some((t) => p.hasRoadAccess(t));
      if (!roadOk && (def.requires?.road ?? true)) {
        ok = false;
        reason = friendlyReason('Needs road access');
      }
    }
    this.valid = ok;
    this.reason = reason;
    v.ghost.show(b.defId, { variant: b.variant, level: b.level, style: b.style }, buildingMatrix(p, b.defId, tile, this.rot, _m), ok);
    v.highlight('tool', tiles.filter((t) => !blocked.includes(t)), ok ? TOOL_COLORS.ok : TOOL_COLORS.bad, 0.4);
    v.highlight('tool-bad', blocked.length ? blocked : null, TOOL_COLORS.bad, 0.6);
    this.mgr.showTag(tile, ok ? b.name ?? def?.name ?? 'Building' : reason.replace(/ —.*$/, ''), ok ? 'ok' : 'bad', ok ? 'Set it down here' : '');
  }

  override hover(hit: PickResult | null): void {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!p || !v) return;
    if (this.picked < 0) {
      const bid = hit ? p.building[hit.tile] : -1;
      const b = bid >= 0 ? p.buildings.get(bid) : undefined;
      v.highlight('tool', b ? b.tiles : null, TOOL_COLORS.accent, 0.35);
      if (b) this.mgr.showTag(b.tile, b.name ?? getItem(b.defId)?.name ?? 'Building', 'info', 'Pick up');
      else this.mgr.hideTag();
      return;
    }
    if (!hit) {
      this.hoverTile = -1;
      v.ghost.hide();
      return;
    }
    this.evaluate(hit.tile);
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    const p = this.mgr.planet;
    if (!hit || !p) return;
    if (this.picked < 0) {
      const bid = p.building[hit.tile];
      if (bid < 0) return;
      this.picked = bid;
      this.manualRot = false;
      this.rot = p.buildings.get(bid)!.rot;
      this.game.planetView?.buildings.forceState(bid, InstState.Blueprint);
      this.mgr.sfx('open');
      this.mgr.setHint(this.hint());
      this.hoverTile = -1;
      this.evaluate(hit.tile);
      return;
    }
    this.hoverTile = -1;
    this.evaluate(hit.tile);
    if (!this.valid) {
      this.game.commands.feedback("Can't put it there", this.reason);
      return;
    }
    const id = this.picked;
    this.game.planetView?.buildings.forceState(id, null);
    const ok = this.game.commands.move(id, hit.tile, this.rot, { free: this.mgr.sandbox });
    if (ok) {
      const fp = getItem(p.buildings.get(id)?.defId ?? '')?.footprint ?? 1;
      this.mgr.pulseAt(hit.tile, fp > 1 ? 3.5 : 1.5, TOOL_COLORS.ok);
      this.picked = -1;
      this.drop();
      this.mgr.setHint('Moved · pick up another, or ✕ to finish');
    } else this.game.planetView?.buildings.forceState(id, InstState.Blueprint);
  }

  override escape(): boolean {
    if (this.picked < 0) return false;
    this.drop();
    this.mgr.setHint(this.hint());
    return true;
  }
}
