/**
 * OWNER: tools.
 * ZoneTool — paint zoning. Brush (1 / 7 / 19 tiles) painted with a drag (gap-free between frames), Fill (flood a
 * whole block within two tiles of its roads) or Erase. The stroke previews in the zone's own colour and commits
 * on release as one undo step; the surface switches to its strong zone display while the tool is active.
 * Only zonable ground takes paint (land, no road, no ploppable); locked zone types explain how to unlock them.
 */
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { getItem } from '../content/catalog';
import { Zone } from '../core/types';
import { zoneInfo } from '../content/zones';
import { chainTiles } from './pathing';
import { brushTiles, plural } from './util';
import { TOOL_COLORS } from './visuals';

type ZoneMode = 'paint' | 'fill' | 'erase';

export class ZoneTool extends Tool {
  readonly id = 'zone';
  zone: Zone = Zone.ResLow;
  private mode: ZoneMode = 'paint';
  private size = 1;
  private stroke = new Set<number>();
  private painting = false;
  private last = -1;
  private hoverTile = -1;

  override get drawing(): boolean {
    return this.mode !== 'fill';
  }

  override enter(state: ToolState): void {
    super.enter(state);
    const def = state.itemId ? getItem(state.itemId) : undefined;
    this.zone = def?.zone ?? Zone.ResLow;
    this.mode = this.zone === Zone.None ? 'erase' : 'paint';
    this.painting = false;
    this.stroke.clear();
    this.hoverTile = -1;
    this.game.planetView?.surface.setZoneDisplay('strong');
  }

  override exit(): void {
    this.clear();
    this.painting = false;
    this.game.planetView?.surface.setZoneDisplay('subtle');
  }

  private get target(): Zone {
    return this.mode === 'erase' ? Zone.None : this.zone;
  }

  private get color(): number {
    if (this.mode === 'erase') return TOOL_COLORS.white;
    return zoneInfo(this.zone)?.color ?? TOOL_COLORS.ok;
  }

  private get zoneName(): string {
    return zoneInfo(this.zone)?.short ?? 'zone';
  }

  override hint(): string {
    const lock = this.game.commands.zoneLocked(this.target);
    if (lock) return `${zoneInfo(this.zone)?.name ?? 'This zone'} is locked — ${lock}`;
    const verb = this.mgr.touch ? 'Tap' : 'Click';
    if (this.mode === 'fill') return `${verb} inside a block to fill it with ${this.zoneName}`;
    if (this.mode === 'erase') return 'Drag to remove zoning';
    return this.mgr.touch ? `Drag to paint ${this.zoneName} lots · two fingers move the camera` : `Drag to paint ${this.zoneName} lots · [ ] brush size`;
  }

  override options(): ToolOption[] {
    const o: ToolOption[] = [];
    if (this.zone !== Zone.None)
      o.push({
        id: 'mode',
        label: 'Mode',
        type: 'choice',
        value: this.mode,
        choices: [
          { value: 'paint', label: 'Brush', icon: 'brush' },
          { value: 'fill', label: 'Fill', icon: 'stamp' },
          { value: 'erase', label: 'Erase', icon: 'trash' },
        ],
      });
    if (this.mode !== 'fill')
      o.push({
        id: 'size',
        label: 'Brush',
        type: 'choice',
        value: this.size,
        choices: [
          { value: 0, label: '1', icon: 'brush' },
          { value: 1, label: '7', icon: 'brush' },
          { value: 2, label: '19', icon: 'brush' },
        ],
      });
    return o;
  }

  override setOption(id: string, value: unknown): void {
    if (id === 'mode') this.mode = value === 'fill' || value === 'erase' ? value : 'paint';
    if (id === 'size') this.size = Math.max(0, Math.min(2, Number(value) || 0));
    this.mgr.setHint(this.hint());
    if (this.hoverTile >= 0) this.previewAt(this.hoverTile);
  }

  override brush(delta: number): void {
    this.size = Math.max(0, Math.min(2, this.size + delta));
    if (this.hoverTile >= 0) this.previewAt(this.hoverTile);
  }

  private zonable = (t: number): boolean => this.game.commands.zonable(t) && this.mgr.planet!.zone[t] !== this.target;

  /** Flood a block: zonable tiles within two steps of a road, connected to the seed. */
  private fill(seed: number): number[] {
    const p = this.mgr.planet!;
    const g = p.grid;
    if (!this.game.commands.zonable(seed)) return [];
    const near = (t: number) => {
      for (const q of g.disk(t, 2)) if (p.road[q]) return true;
      return false;
    };
    if (!near(seed)) return [];
    const out: number[] = [];
    const seen = new Set<number>([seed]);
    const queue = [seed];
    while (queue.length && out.length < 500) {
      const t = queue.shift()!;
      if (p.zone[t] !== this.target) out.push(t);
      for (const q of g.neighbors(t)) {
        if (seen.has(q)) continue;
        seen.add(q);
        if (this.game.commands.zonable(q) && near(q)) queue.push(q);
      }
    }
    return out;
  }

  private clear(): void {
    this.mgr.visuals?.highlight('tool', null);
    this.mgr.visuals?.highlight('tool-bad', null);
    this.mgr.hideTag();
    this.mgr.setCost(null);
  }

  private show(tiles: number[], at: number): void {
    const v = this.mgr.visuals;
    if (!v) return;
    const lock = this.game.commands.zoneLocked(this.target);
    v.highlight('tool', tiles.length ? tiles : [at], lock ? TOOL_COLORS.bad : this.color, this.mode === 'erase' ? 0.35 : 0.55);
    if (lock) {
      this.mgr.showTag(at, 'Locked', 'bad', lock);
      return;
    }
    if (!tiles.length) {
      this.mgr.showTag(at, this.mode === 'fill' ? 'No block here' : 'Nothing to zone', 'warn', this.mode === 'fill' ? 'Fill needs roads around it' : '');
      return;
    }
    this.mgr.showTag(at, this.mode === 'erase' ? `−${plural(tiles.length, 'lot')}` : `+${plural(tiles.length, 'lot')}`, this.mode === 'erase' ? 'warn' : 'ok', this.mode === 'erase' ? 'De-zone' : zoneInfo(this.zone)?.name ?? '');
  }

  private previewAt(tile: number): void {
    const p = this.mgr.planet;
    if (!p) return;
    const tiles = this.mode === 'fill' ? this.fill(tile) : brushTiles(p, tile, this.size, this.zonable);
    this.show(tiles, tile);
  }

  override hover(hit: PickResult | null): void {
    if (this.painting) return;
    if (!hit) {
      this.hoverTile = -1;
      this.clear();
      return;
    }
    if (hit.tile === this.hoverTile) return;
    this.hoverTile = hit.tile;
    this.previewAt(hit.tile);
  }

  private commit(tiles: number[], at: number): void {
    if (!tiles.length) return;
    const changed = this.game.commands.zone(tiles, this.target);
    if (changed.length) {
      this.mgr.pulseAt(at, 1.2 + Math.sqrt(changed.length) * 0.6, this.color);
      this.mgr.setHint(this.mode === 'erase' ? `Cleared ${plural(changed.length, 'lot')}` : `Zoned ${plural(changed.length, 'lot')} of ${zoneInfo(this.zone)?.name ?? 'land'}`);
    }
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!hit) return;
    const p = this.mgr.planet!;
    const tiles = this.mode === 'fill' ? this.fill(hit.tile) : brushTiles(p, hit.tile, this.size, this.zonable);
    if (!tiles.length && this.mode === 'fill') this.game.commands.feedback('Nothing to fill', 'Tap inside a block that has roads around it.', 'info', 'zones', null);
    this.commit(tiles, hit.tile);
    this.hoverTile = -1;
    this.clear();
  }

  override down(hit: PickResult | null): void {
    if (!hit) return;
    this.painting = true;
    this.stroke.clear();
    this.last = -1;
    this.add(hit.tile);
  }

  private add(tile: number): void {
    const p = this.mgr.planet!;
    const chain: number[] = [];
    chainTiles(p, this.last, tile, chain);
    this.last = tile;
    for (const c of chain) for (const t of brushTiles(p, c, this.size, this.zonable)) this.stroke.add(t);
    this.show([...this.stroke], tile);
  }

  override move(hit: PickResult | null): void {
    if (!this.painting || !hit || hit.tile === this.last) return;
    this.add(hit.tile);
  }

  override up(hit: PickResult | null): void {
    if (!this.painting) return;
    this.painting = false;
    this.commit([...this.stroke], hit?.tile ?? this.last);
    this.stroke.clear();
    this.hoverTile = -1;
    this.clear();
  }

  override cancelStroke(): void {
    this.painting = false;
    this.stroke.clear();
    this.clear();
  }
}
