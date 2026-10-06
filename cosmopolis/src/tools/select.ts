/**
 * OWNER: tools.
 * SelectTool — the default "hand": tap a building, prop, orbital or tile to inspect it (ui.selection +
 * 'selection:changed'). Orbitals are picked first through view.orbitals.pickOrbital(ray) when the life renderer
 * provides it; props win over bare ground when the tap lands within half a tile of one. Tapping bare ground while
 * something is selected just dismisses the inspector. Long-press inspects and glides the camera closer.
 * Long-press a building to pick it up and move it (iOS home-screen style, via the move tool); long-press bare
 * ground to inspect it and glide closer. Desktop hover softly outlines the building under the cursor.
 */
import { Matrix4, Vector3 } from 'three';
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import { tileMatrix } from '../world/geo';
import { ui } from '../ui/store';
import type { Selection } from '../core/types';
import { setSelection } from './util';
import { TOOL_COLORS } from './visuals';
import { getItem } from '../content/catalog';

const _m = new Matrix4();
const _p = new Vector3();

export class SelectTool extends Tool {
  readonly id = 'select';
  private hoverBuilding = -1;

  override get wantsGrid(): boolean {
    return false;
  }

  override hint(): string {
    return this.mgr.touch ? 'Tap anything to inspect it' : 'Click anything to inspect it';
  }

  override exit(): void {
    this.hoverBuilding = -1;
    this.mgr.visuals?.highlight('tool', null);
  }

  override hover(hit: PickResult | null): void {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!p || !v) return;
    const bid = hit ? p.building[hit.tile] : -1;
    const sel = ui.selection.value;
    const selected = sel?.kind === 'building' ? sel.id : -1;
    const id = bid === selected ? -1 : bid;
    if (id === this.hoverBuilding) return;
    this.hoverBuilding = id;
    const b = id >= 0 ? p.buildings.get(id) : undefined;
    v.highlight('tool', b ? b.tiles : null, TOOL_COLORS.white, 0.18);
  }

  private pickOrbital(): number {
    const view = this.game.planetView as unknown as { orbitals?: { pickOrbital?: (ray: unknown) => unknown } } | null;
    const fn = view?.orbitals?.pickOrbital;
    if (typeof fn !== 'function') return -1;
    try {
      const r = fn.call(view!.orbitals, this.game.input.lastRay);
      if (typeof r === 'number') return r;
      if (r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'number') return (r as { id: number }).id;
    } catch (e) {
      console.error('[tools] pickOrbital failed', e);
    }
    return -1;
  }

  private nearestProp(hit: PickResult): number {
    const p = this.mgr.planet!;
    let best = -1, bd = 0.55 * 0.55;
    const g = p.grid;
    const near = new Set<number>([hit.tile, ...g.neighbors(hit.tile)]);
    for (const pr of p.props.values()) {
      if (!near.has(pr.tile)) continue;
      tileMatrix(p, pr.tile, 0, _m, { u: pr.u, v: pr.v });
      _p.setFromMatrixPosition(_m);
      const d = _p.distanceToSquared(hit.point);
      if (d < bd) {
        bd = d;
        best = pr.id;
      }
    }
    return best;
  }

  private resolve(hit: PickResult | null): Selection {
    const orb = this.pickOrbital();
    if (orb >= 0 && this.mgr.planet?.orbitals.has(orb)) return { kind: 'orbital', id: orb };
    const p = this.mgr.planet;
    if (!hit || !p) return null;
    const bid = p.building[hit.tile];
    if (bid >= 0) return { kind: 'building', id: bid };
    const prop = this.nearestProp(hit);
    if (prop >= 0) return { kind: 'prop', id: prop };
    return { kind: 'tile', tile: hit.tile };
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    const sel = this.resolve(hit);
    const cur = ui.selection.value;
    if (!sel) {
      if (cur) setSelection(null);
      return;
    }
    // bare ground while inspecting something: just dismiss
    if (sel.kind === 'tile' && cur && cur.kind !== 'tile') {
      setSelection(null);
      this.mgr.sfx('close');
      return;
    }
    setSelection(sel);
    this.mgr.sfx('tap');
    if (hit && sel.kind !== 'orbital') {
      const p = this.mgr.planet!;
      const b = sel.kind === 'building' ? p.buildings.get(sel.id) : undefined;
      const fp = b ? getItem(b.defId)?.footprint ?? 1 : 1;
      this.mgr.pulseAt(b ? b.tile : hit.tile, fp === 19 ? 5 : fp === 7 ? 3.2 : 1.4, TOOL_COLORS.accent);
    }
    this.hoverBuilding = -1;
    this.mgr.visuals?.highlight('tool', null);
  }

  override longPress(hit: PickResult | null, info: PointerInfo): boolean {
    const p0 = this.mgr.planet;
    const bid = hit && p0 ? p0.building[hit.tile] : -1;
    if (bid >= 0 && this.mgr.liftBuilding(bid)) return true;
    // mouse: a held click on the ground stays an ordinary click / drag
    if (!info.touch) return false;
    this.tap(hit, info);
    const sel = ui.selection.value;
    const p = this.mgr.planet;
    if (sel && p && hit) {
      const tile = sel.kind === 'building' ? p.buildings.get(sel.id)?.tile ?? hit.tile : hit.tile;
      const cam = this.game.camera;
      void cam.flyTo(tile, { distance: Math.max(cam.minDistance + 4, Math.min(cam.distance * 0.6, 22)) });
    }
    return false;
  }
}
