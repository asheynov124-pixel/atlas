/**
 * OWNER: tools.
 * DecorTool — free placement of props (trees, benches, statues, lamps…) at the exact point under the pointer
 * (u, v offsets on the tile's tangent plane), not just tile centres. Random rotation / scale toggles keep groves
 * natural; R rotates by 30°. Scatter mode turns one finger into a brush that sows props over a 1–4 ring area at
 * an adjustable density (one undo step per stroke). Ghost preview mint / coral; props go on land (water props on
 * water) away from buildings and roads.
 */
import { Matrix4, Vector3 } from 'three';
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import { tileFrame, tileMatrix, type TileFrame } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { getItem, type ItemDef } from '../content/catalog';
import { money } from './util';
import { TOOL_COLORS } from './visuals';

const _m = new Matrix4();
const _d = new Vector3();
const _frame: TileFrame = { pos: new Vector3(), up: new Vector3(), fwd: new Vector3(), right: new Vector3() };

export class DecorTool extends Tool {
  readonly id = 'decor';
  def: ItemDef | null = null;
  private mode: 'single' | 'scatter' = 'single';
  private randRot = true;
  private randScale = true;
  private yaw = 0;
  private scale = 1;
  private size = 1;
  private density = 6;
  private hover0: { tile: number; u: number; v: number; ok: boolean; reason?: string } | null = null;
  private holding = false;
  private lastHit: PickResult | null = null;
  private acc = 0;
  private placed = 0;

  override get drawing(): boolean {
    return this.mode === 'scatter';
  }
  override get rotatable(): boolean {
    return this.mode === 'single';
  }
  override get placing(): boolean {
    return true;
  }
  override get wantsGrid(): boolean {
    return false;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    this.def = state.itemId ? getItem(state.itemId) ?? null : null;
    this.reroll();
    this.holding = false;
    this.hover0 = null;
  }

  override exit(): void {
    this.clear();
    if (this.holding) {
      this.holding = false;
      this.game.commands.end();
    }
  }

  override hint(): string {
    const n = this.def?.name ?? 'decor';
    if (this.mode === 'scatter') return this.mgr.touch ? `Drag to scatter ${n} · two fingers move the camera` : `Hold and drag to scatter ${n}`;
    return this.mgr.touch ? `Tap exactly where ${n} should go` : `Click to place ${n} · R rotates`;
  }

  override options(): ToolOption[] {
    const o: ToolOption[] = [
      {
        id: 'mode',
        label: 'Mode',
        type: 'choice',
        value: this.mode,
        choices: [
          { value: 'single', label: 'Single' },
          { value: 'scatter', label: 'Scatter' },
        ],
      },
      { id: 'randRot', label: 'Random turn', type: 'toggle', icon: 'shuffle', value: this.randRot },
      { id: 'randScale', label: 'Random size', type: 'toggle', icon: 'dice', value: this.randScale },
    ];
    if (this.mode === 'single') o.push({ id: 'rotate', label: 'Rotate', type: 'button', icon: 'rotate' });
    else {
      o.push({ id: 'size', label: 'Area', type: 'slider', min: 1, max: 4, step: 1, value: this.size, icon: 'brush' });
      o.push({ id: 'density', label: 'Density', type: 'slider', min: 1, max: 12, step: 1, value: this.density, icon: 'sparkles' });
    }
    return o;
  }

  override setOption(id: string, value: unknown): void {
    switch (id) {
      case 'mode':
        this.mode = value === 'scatter' ? 'scatter' : 'single';
        break;
      case 'randRot':
        this.randRot = !!value;
        this.reroll();
        break;
      case 'randScale':
        this.randScale = !!value;
        this.reroll();
        break;
      case 'rotate':
        this.rotate(1);
        return;
      case 'size':
        this.size = Math.max(1, Math.min(4, Math.round(Number(value))));
        break;
      case 'density':
        this.density = Math.max(1, Math.min(12, Math.round(Number(value))));
        break;
    }
    this.mgr.setHint(this.hint());
  }

  override rotate(dir: number): void {
    this.yaw += (dir * Math.PI) / 6;
    this.mgr.sfx('tap');
    if (this.lastHit) this.hover(this.lastHit);
  }

  override brush(delta: number): void {
    this.size = Math.max(1, Math.min(4, this.size + delta));
  }

  private reroll(): void {
    this.yaw = this.randRot ? Math.random() * Math.PI * 2 : this.yaw;
    this.scale = this.randScale ? 0.8 + Math.random() * 0.45 : 1;
  }

  /** Tile-local offsets of a world point, clamped inside the tile. */
  private localUV(tile: number, point: Vector3): { u: number; v: number } {
    const p = this.mgr.planet!;
    tileFrame(p, tile, 0, _frame);
    _d.copy(point).sub(_frame.pos);
    let u = _d.dot(_frame.right), v = _d.dot(_frame.fwd);
    const lim = p.grid.inradius[tile] * p.radius * 0.82;
    const len = Math.hypot(u, v);
    if (len > lim) {
      u *= lim / len;
      v *= lim / len;
    }
    return { u, v };
  }

  private validity(tile: number): { ok: boolean; reason?: string } {
    const p = this.mgr.planet!;
    const d = this.def;
    if (!d) return { ok: false, reason: 'Pick a decoration' };
    const lock = (() => {
      try {
        return this.game.progression.isItemUnlocked(d) ? null : this.game.progression.lockReason(d);
      } catch {
        return null;
      }
    })();
    if (lock) return { ok: false, reason: lock };
    const water = p.isWater(tile);
    if (d.placement === 'water' && !water) return { ok: false, reason: 'Goes on water' };
    if (d.placement !== 'water' && water) return { ok: false, reason: "Can't place on water" };
    if (p.building[tile] >= 0) return { ok: false, reason: 'A building is here' };
    if (p.road[tile]) return { ok: false, reason: 'Not on the road' };
    if (!this.game.empire.canAfford(d.cost)) return { ok: false, reason: `Needs ${money(d.cost)}` };
    return { ok: true };
  }

  private clear(): void {
    const v = this.mgr.visuals;
    v?.ghost.hide();
    v?.highlight('tool', null);
    this.mgr.hideTag();
    this.mgr.setCost(null);
  }

  override hover(hit: PickResult | null): void {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    this.lastHit = hit;
    if (!hit || !p || !v || !this.def) {
      this.hover0 = null;
      this.clear();
      return;
    }
    if (this.mode === 'scatter') {
      v.ghost.hide();
      v.highlight('tool', p.grid.disk(hit.tile, this.size - 1), TOOL_COLORS.ok, 0.3);
      this.mgr.showTag(hit.tile, this.def.name, 'info', `${this.density} per second`);
      return;
    }
    const { u, v: vv } = this.localUV(hit.tile, hit.point);
    const val = this.validity(hit.tile);
    this.hover0 = { tile: hit.tile, u, v: vv, ...val };
    tileMatrix(p, hit.tile, 0, _m, { u, v: vv, yaw: this.yaw, scale: this.scale });
    v.ghost.show(this.def.id, { variant: 0 }, _m, val.ok);
    v.highlight('tool', [hit.tile], val.ok ? TOOL_COLORS.ok : TOOL_COLORS.bad, 0.22);
    this.mgr.setCost(this.game.empire.sandbox ? 0 : this.def.cost, val.ok, val.reason);
    if (!val.ok) this.mgr.showTag(hit.tile, val.reason ?? 'Not here', 'bad');
    else this.mgr.hideTag();
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!hit || !this.def) return;
    if (this.mode === 'scatter') {
      this.game.commands.begin(`Scatter ${this.def.name}`);
      this.lastHit = hit;
      for (let i = 0; i < Math.max(2, this.density); i++) this.scatterOne(true);
      this.game.commands.end();
      return;
    }
    this.hover(hit);
    const h = this.hover0;
    if (!h) return;
    if (!h.ok) {
      this.game.commands.feedback("Can't place that here", h.reason);
      return;
    }
    const pr = this.game.commands.addProp(this.def.id, h.tile, h.u, h.v, this.yaw, this.scale);
    if (pr) {
      this.mgr.pulseAt(h.tile, 0.9, TOOL_COLORS.ok);
      this.reroll();
      this.hover(hit);
    }
  }

  private scatterOne(quiet: boolean): void {
    const p = this.mgr.planet;
    const hit = this.lastHit;
    if (!p || !hit || !this.def) return;
    const tiles = p.grid.disk(hit.tile, this.size - 1);
    for (let attempt = 0; attempt < 4; attempt++) {
      const t = tiles[Math.floor(Math.random() * tiles.length)];
      if (!this.validity(t).ok) continue;
      const lim = p.grid.inradius[t] * p.radius * 0.8;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * lim;
      this.reroll();
      if (this.game.commands.addProp(this.def.id, t, Math.cos(a) * r, Math.sin(a) * r, this.yaw, this.scale, undefined, { quiet })) this.placed++;
      return;
    }
  }

  override down(hit: PickResult | null): void {
    if (!hit || !this.def) return;
    this.holding = true;
    this.lastHit = hit;
    this.acc = 1;
    this.placed = 0;
    this.game.commands.begin(`Scatter ${this.def.name}`);
  }

  override move(hit: PickResult | null): void {
    if (!this.holding || !hit) return;
    this.lastHit = hit;
    this.mgr.visuals?.highlight('tool', this.mgr.planet!.grid.disk(hit.tile, this.size - 1), TOOL_COLORS.ok, 0.3);
  }

  override up(): void {
    if (!this.holding) return;
    this.holding = false;
    this.game.commands.end();
    if (this.placed) this.mgr.setHint(`Scattered ${this.placed} × ${this.def?.name ?? 'decor'}`);
  }

  override cancelStroke(): void {
    if (!this.holding) return;
    this.holding = false;
    this.game.commands.abort();
  }

  override update(dt: number): void {
    if (!this.holding) return;
    this.acc += dt * this.density;
    let n = 0;
    while (this.acc >= 1 && n < 6) {
      this.acc -= 1;
      this.scatterOne(true);
      n++;
    }
  }
}
