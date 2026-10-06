/**
 * OWNER: tools.
 * PlopTool — place a building (ItemDef) with a live ghost: snaps to the tile under the pointer, auto-faces the
 * nearest road (or manual rotation: R / Shift+R / Rotate button), mint when valid, coral with the reason when not,
 * footprint highlighted, price in the tool bar and on a floating tag. Tap to build; 1-tile items can be
 * drag-painted in rows (one undo step per stroke); big items get a long-press precision mode on touch (the ghost
 * follows the finger, release to build). Options: style override (styleable items), variant shuffle, and in the
 * sandbox "Free build" (ignore rules) and "Replace" (clear what is in the way).
 * Service buildings preview their coverage area around the ghost (tinted by service, outlined at the edge);
 * polluters show how far their smog reaches.
 */
import { Matrix4 } from 'three';
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { getItem, type ItemDef } from '../content/catalog';
import { STYLES, STYLE_IDS } from '../content/styles';
import type { StyleId } from '../core/types';
import { friendlyReason, shortReason, type PlaceVerdict } from '../game/Commands';
import { buildingMatrix, footprintFacing, money } from './util';
import { chainTiles } from './pathing';
import { TOOL_COLORS } from './visuals';

const _m = new Matrix4();

/** Coverage tint per service (range preview under the ghost). */
const SERVICE_COLOR: Record<string, number> = {
  police: 0x6f8cff,
  fire: 0xff7a5c,
  health: 0xff8ab0,
  education: 0xffd36b,
  research: 0xa77bff,
  leisure: 0x7cf0a0,
  transit: 0x5ef0ff,
  deathcare: 0xb8c2d6,
  garbage: 0xc9a27a,
  data: 0x4fd2ff,
  tourism: 0xffb3e6,
  spiritual: 0xe8d27a,
};
const SERVICE_NAME: Record<string, string> = {
  police: 'Police',
  fire: 'Fire',
  health: 'Health',
  education: 'Schools',
  research: 'Research',
  leisure: 'Leisure',
  transit: 'Transit',
  deathcare: 'Deathcare',
  garbage: 'Waste',
  data: 'Data',
  tourism: 'Tourism',
  spiritual: 'Spirit',
};
/** beyond this radius only the edge band is drawn (cheap, still readable) */
const FILL_MAX = 14;

export class PlopTool extends Tool {
  readonly id = 'plop';
  def: ItemDef | null = null;
  private autoFace = true;
  private style: StyleId | 'auto' = 'auto';
  private variant = 0;
  private free = true;
  private replace = false;
  private hoverTile = -1;
  private verdict: PlaceVerdict | null = null;
  private rot = 0;
  private justPlaced = -1;
  private stroke: number[] | null = null;
  private strokeLast = -1;
  private strokeCount = 0;
  private holding = false;
  private rangeKey = '';
  private rangeLabel = '';

  override get drawing(): boolean {
    return this.def?.footprint === 1;
  }
  override get rotatable(): boolean {
    return true;
  }
  override get placing(): boolean {
    return true;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    this.def = state.itemId ? getItem(state.itemId) ?? null : null;
    this.variant = Math.floor(Math.random() * 1000);
    this.hoverTile = -1;
    this.justPlaced = -1;
    this.stroke = null;
    this.holding = false;
    this.style = 'auto';
    this.replace = false;
    this.free = true;
  }

  override exit(): void {
    this.clearPreview();
    this.stroke = null;
    this.holding = false;
  }

  override hint(): string {
    const d = this.def;
    if (!d) return 'Pick something to build from the menu';
    if (this.mgr.touch) return d.footprint === 1 ? `Tap to build ${d.name} · drag to build a row` : `Tap to build ${d.name} · long-press to fine-tune`;
    return d.footprint === 1 ? `Click to build · drag for a row · R rotates` : `Click to build ${d.name} · R rotates`;
  }

  override options(): ToolOption[] {
    const d = this.def;
    if (!d) return [];
    const o: ToolOption[] = [
      { id: 'rotate', label: 'Rotate', type: 'button', icon: 'rotate' },
      { id: 'face', label: 'Face road', type: 'toggle', icon: 'navigate', value: this.autoFace },
    ];
    if (d.styleable)
      o.push({
        id: 'style',
        label: 'Style',
        type: 'choice',
        value: this.style,
        choices: [{ value: 'auto', label: 'Auto', icon: 'sparkles' }, ...STYLE_IDS.map((id) => ({ value: id, label: STYLES[id].name }))],
      });
    if ((d.variants ?? 1) > 1) o.push({ id: 'shuffle', label: 'Shuffle look', type: 'button', icon: 'shuffle' });
    if (this.mgr.sandbox) {
      o.push({ id: 'free', label: 'Free build', type: 'toggle', icon: 'magic', value: this.free });
      o.push({ id: 'replace', label: 'Replace', type: 'toggle', icon: 'refresh', value: this.replace });
    }
    return o;
  }

  override setOption(id: string, value: unknown): void {
    switch (id) {
      case 'rotate':
        this.rotate(1);
        return;
      case 'face':
        this.autoFace = !!value;
        break;
      case 'style':
        this.style = (value as StyleId | 'auto') ?? 'auto';
        break;
      case 'shuffle':
        this.variant = Math.floor(Math.random() * 1000);
        this.mgr.sfx('toggle');
        break;
      case 'free':
        this.free = !!value;
        break;
      case 'replace':
        this.replace = !!value;
        break;
    }
    this.refresh();
  }

  override rotate(dir: number): void {
    this.autoFace = false;
    const p = this.mgr.planet;
    const deg = p && this.hoverTile >= 0 ? p.grid.degree(this.hoverTile) : 6;
    this.mgr.rotation = (((this.rot + dir) % deg) + deg) % deg;
    this.rot = this.mgr.rotation;
    this.mgr.sfx('tap');
    this.refresh();
    this.mgr.publishOptions();
  }

  private placeOpts() {
    return {
      free: this.mgr.sandbox && this.free,
      replace: this.mgr.sandbox && this.replace,
      style: this.style === 'auto' ? undefined : this.style,
      variant: this.variant,
    };
  }

  private clearPreview(): void {
    const v = this.mgr.visuals;
    v?.ghost.hide();
    v?.highlight('tool', null);
    v?.highlight('tool-bad', null);
    v?.highlight('tool-range', null);
    this.rangeKey = '';
    this.mgr.hideTag();
    this.mgr.setCost(null);
  }

  /** Coverage / pollution reach of the item (tiles), its tint and a short label. */
  private reach(): { radius: number; color: number; label: string } | null {
    const d = this.def;
    if (!d) return null;
    let best: { radius: number; color: number; label: string } | null = null;
    for (const c of d.coverage ?? []) if (c.radius > 0 && (!best || c.radius > best.radius)) best = { radius: Math.round(c.radius), color: SERVICE_COLOR[c.service] ?? TOOL_COLORS.accent, label: `${SERVICE_NAME[c.service] ?? c.service} · ${Math.round(c.radius)} tiles` };
    if (!best && (d.effects?.pollution ?? 0) > 0) {
      const r = Math.round(d.effects?.radius ?? 4);
      best = { radius: r, color: TOOL_COLORS.warn, label: `Pollutes ${r} tiles around` };
    }
    return best;
  }

  /** Tint the coverage area around the ghost (footprint excluded so the ghost's own tiles stay readable). */
  private showRange(tile: number, footprint: number[]): void {
    const v = this.mgr.visuals;
    const p = this.mgr.planet;
    const r = this.reach();
    if (!v || !p || !r) {
      v?.highlight('tool-range', null);
      this.rangeLabel = '';
      return;
    }
    const key = `${tile}|${r.radius}`;
    this.rangeLabel = r.label;
    if (key === this.rangeKey) return;
    this.rangeKey = key;
    const fp = this.def!.footprint;
    const rad = r.radius + (fp === 19 ? 2 : fp === 7 ? 1 : 0);
    const own = new Set(footprint);
    const tiles = (rad <= FILL_MAX ? p.grid.disk(tile, rad) : p.grid.ring(tile, rad)).filter((t) => !own.has(t));
    v.highlight('tool-range', tiles, r.color, rad <= FILL_MAX ? 0.2 : 0.45);
  }

  private refresh(): void {
    if (this.hoverTile >= 0) this.evaluate(this.hoverTile, true);
  }

  private evaluate(tile: number, force = false): void {
    const d = this.def;
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!d || !p || !v) return;
    if (tile === this.hoverTile && !force && this.verdict) return;
    this.hoverTile = tile;
    if (tile === this.justPlaced && !force) {
      this.clearPreview();
      return;
    }
    if (this.autoFace) {
      const f = footprintFacing(p, tile, d.footprint);
      this.rot = f >= 0 ? f : this.mgr.rotation % p.grid.degree(tile);
    } else this.rot = this.mgr.rotation % p.grid.degree(tile);
    const verdict = this.game.commands.check(d.id, tile, this.rot, this.placeOpts());
    this.verdict = verdict;
    const ok = verdict.ok;
    const style = this.style === 'auto' ? p.city.style : this.style;
    v.ghost.show(d.id, { variant: this.variant % Math.max(1, d.variants ?? 1), level: 1, style }, buildingMatrix(p, d.id, tile, this.rot, _m), ok);
    const tiles = verdict.tiles.length ? verdict.tiles : [tile];
    this.showRange(tile, tiles);
    v.highlight('tool', ok ? tiles : tiles.filter((t) => !verdict.blocked.includes(t)), ok ? (verdict.forced ? TOOL_COLORS.warn : TOOL_COLORS.ok) : TOOL_COLORS.bad, ok ? 0.42 : 0.3);
    v.highlight('tool-bad', verdict.blocked.length ? verdict.blocked : null, verdict.forced ? TOOL_COLORS.warn : TOOL_COLORS.bad, 0.6);
    this.mgr.setCost(verdict.cost, ok, ok ? undefined : shortReason(verdict.reason));
    if (ok) {
      this.mgr.setHint(verdict.forced ? (verdict.blocked.length ? 'Sandbox: this will replace what is there' : `Sandbox: rules ignored (${(verdict.reason ?? '').toLowerCase()})`) : this.hint());
      const sub = this.rangeLabel || (verdict.cost > 0 ? d.name : '');
      if (verdict.cost > 0) this.mgr.showTag(tile, money(verdict.cost), 'ok', sub);
      else this.mgr.showTag(tile, d.name, 'ok', this.rangeLabel);
    } else {
      this.mgr.setHint(friendlyReason(verdict.reason));
      this.mgr.showTag(tile, shortReason(verdict.reason), 'bad');
    }
  }

  override hover(hit: PickResult | null): void {
    if (!hit) {
      if (!this.holding) {
        this.hoverTile = -1;
        this.clearPreview();
      }
      return;
    }
    if (hit.tile !== this.justPlaced) this.justPlaced = -1;
    this.evaluate(hit.tile);
  }

  private place(tile: number, quiet: boolean): boolean {
    const d = this.def;
    const p = this.mgr.planet;
    if (!d || !p) return false;
    this.evaluate(tile, true);
    if (!this.verdict?.ok) {
      if (!quiet) this.game.commands.feedback("Can't build here", friendlyReason(this.verdict?.reason));
      return false;
    }
    const b = this.game.commands.place(d.id, tile, this.rot, { ...this.placeOpts(), quiet });
    if (!b) return false;
    this.mgr.pulseAt(tile, d.footprint === 19 ? 5.5 : d.footprint === 7 ? 3.4 : 1.5, TOOL_COLORS.ok);
    this.variant = Math.floor(Math.random() * 1000);
    this.justPlaced = tile;
    this.verdict = null;
    this.clearPreview();
    if (d.unique) {
      this.mgr.setHint(`${d.name} rises! One of a kind.`);
      this.game.commands.sfx('milestone', 0.5);
      setTimeout(() => {
        if (this.mgr.current?.itemId === d.id) this.mgr.select(null);
      }, 50);
    } else if (!quiet) this.mgr.setHint(`${d.name} built · ${this.mgr.touch ? 'tap' : 'click'} again for another`);
    return true;
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!hit) return;
    this.place(hit.tile, false);
  }

  override longPress(hit: PickResult | null): boolean {
    if (!this.def || this.def.footprint === 1) return false;
    this.holding = true;
    if (hit) this.evaluate(hit.tile, true);
    this.mgr.setHint('Slide to fine-tune · lift to build');
    return true;
  }

  override down(hit: PickResult | null): void {
    if (this.holding) return;
    if (!this.def) return;
    this.stroke = [];
    this.strokeLast = -1;
    this.strokeCount = 0;
    this.game.commands.begin(`Build ${this.def.name}`);
    if (hit) this.paintTo(hit.tile);
  }

  private paintTo(tile: number): void {
    if (!this.stroke) return;
    const tmp: number[] = [];
    chainTiles(this.mgr.planet!, this.strokeLast, tile, tmp);
    this.strokeLast = tile;
    for (const t of tmp) {
      if (this.stroke.includes(t)) continue;
      this.stroke.push(t);
      this.justPlaced = -1;
      this.hoverTile = -1;
      // strokes stay quiet: the tag and hint already explain a refused tile
      if (this.place(t, true)) this.strokeCount++;
    }
  }

  override move(hit: PickResult | null): void {
    if (this.holding) {
      if (hit) this.evaluate(hit.tile);
      return;
    }
    if (this.stroke && hit) this.paintTo(hit.tile);
  }

  override up(hit: PickResult | null): void {
    if (this.holding) {
      this.holding = false;
      if (hit) this.place(hit.tile, false);
      else this.clearPreview();
      return;
    }
    if (!this.stroke) return;
    this.stroke = null;
    this.game.commands.end();
    const d = this.def;
    if (!d) return;
    if (this.strokeCount > 1) this.mgr.setHint(`Built ${this.strokeCount} × ${d.name}`);
    else if (this.strokeCount === 1) this.mgr.setHint(`${d.name} built · ${this.mgr.touch ? 'tap' : 'click'} again for another`);
    else this.game.commands.sfx('error', 0.3, 0.3);
  }

  override cancelStroke(): void {
    if (this.holding) {
      this.holding = false;
      this.clearPreview();
      return;
    }
    if (!this.stroke) return;
    this.stroke = null;
    this.game.commands.abort();
    this.clearPreview();
  }
}
