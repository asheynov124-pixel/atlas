/**
 * OWNER: tools.
 * BulldozeTool — demolish with a brush (1 / 7 / 19 tiles) by tap or drag. Filters: everything, buildings only,
 * roads only, or nature (props, trees, rocks, rubble). Doomed buildings glow as red ghosts and a tag sums up the
 * damage (and the 75 % same-day refund). Wonders, landmarks and big demolitions ask for confirmation first;
 * large ones rumble the camera.
 */
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { confirmDialog } from '../ui/store';
import { getItem } from '../content/catalog';
import type { BulldozeFilter } from '../game/Commands';
import { chainTiles } from './pathing';
import { brushTiles, money, plural } from './util';
import { TOOL_COLORS } from './visuals';

export class BulldozeTool extends Tool {
  readonly id = 'bulldoze';
  private size = 0;
  private filter: BulldozeFilter = 'all';
  private stroke = new Set<number>();
  private painting = false;
  private last = -1;
  private hoverTile = -1;
  private confirming = false;

  override get drawing(): boolean {
    return true;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    this.stroke.clear();
    this.painting = false;
    this.hoverTile = -1;
  }

  override exit(): void {
    this.clear();
    this.painting = false;
  }

  override hint(): string {
    return this.mgr.touch ? 'Tap or drag to demolish · two fingers move the camera' : 'Click or drag to demolish · [ ] brush size';
  }

  override options(): ToolOption[] {
    return [
      {
        id: 'filter',
        label: 'Clear',
        type: 'choice',
        value: this.filter,
        choices: [
          // text-only: every label stays readable in the compact segmented control
          { value: 'all', label: 'All' },
          { value: 'buildings', label: 'Buildings' },
          { value: 'roads', label: 'Roads' },
          { value: 'nature', label: 'Nature' },
        ],
      },
      {
        id: 'size',
        label: 'Brush',
        type: 'choice',
        value: this.size,
        choices: [
          { value: 0, label: '1', icon: 'brush' },
          { value: 1, label: '7', icon: 'brush' },
          { value: 2, label: '19', icon: 'brush' },
        ],
      },
    ];
  }

  override setOption(id: string, value: unknown): void {
    if (id === 'size') this.size = Math.max(0, Math.min(2, Number(value) || 0));
    if (id === 'filter') this.filter = (['all', 'buildings', 'roads', 'nature'] as const).includes(value as BulldozeFilter) ? (value as BulldozeFilter) : 'all';
    if (this.hoverTile >= 0) this.preview(this.brush0(this.hoverTile), this.hoverTile);
  }

  override brush(delta: number): void {
    this.size = Math.max(0, Math.min(2, this.size + delta));
    if (this.hoverTile >= 0) this.preview(this.brush0(this.hoverTile), this.hoverTile);
  }

  private brush0(tile: number): number[] {
    return brushTiles(this.mgr.planet!, tile, this.size);
  }

  private clear(): void {
    const v = this.mgr.visuals;
    v?.highlight('tool', null);
    v?.hideDoomed();
    this.mgr.hideTag();
    this.mgr.setCost(null);
  }

  private preview(tiles: number[], at: number): void {
    const v = this.mgr.visuals;
    if (!v) return;
    const q = this.game.commands.bulldozeQuote(tiles, this.filter);
    v.highlight('tool', tiles, TOOL_COLORS.bad, 0.34);
    v.showDoomed(q.buildings.map((b) => b.id));
    const parts: string[] = [];
    if (q.buildings.length) parts.push(plural(q.buildings.length, 'building'));
    if (q.roads) parts.push(plural(q.roads, 'road tile'));
    if (q.props) parts.push(plural(q.props, 'prop'));
    if (q.nature) parts.push(this.filter === 'nature' ? plural(q.nature, 'tree patch', 'tree patches') : plural(q.nature, 'rubble pile'));
    if (!parts.length) {
      this.mgr.showTag(at, 'Nothing to clear', 'info');
      this.mgr.setCost(null);
      return;
    }
    const big = q.buildings.find((b) => getItem(b.defId)?.unique || getItem(b.defId)?.category === 'landmarks');
    this.mgr.showTag(at, parts.slice(0, 2).join(' · '), 'bad', q.refund > 0 ? `Refund ${money(q.refund)}` : big ? `Includes ${big.name ?? getItem(big.defId)?.name}` : '');
    this.mgr.setCost(null);
  }

  override hover(hit: PickResult | null): void {
    if (this.painting || this.confirming) return;
    if (!hit) {
      this.hoverTile = -1;
      this.clear();
      return;
    }
    if (hit.tile === this.hoverTile) return;
    this.hoverTile = hit.tile;
    this.preview(this.brush0(hit.tile), hit.tile);
  }

  private async commit(tiles: number[], at: number): Promise<void> {
    if (!tiles.length) return;
    const cmd = this.game.commands;
    const q = cmd.bulldozeQuote(tiles, this.filter);
    if (!q.buildings.length && !q.roads && !q.props && !q.nature) {
      this.clear();
      return;
    }
    const precious = q.buildings.filter((b) => {
      const d = getItem(b.defId);
      return d?.unique || d?.category === 'landmarks';
    });
    if (precious.length || q.value >= 60000 || q.buildings.length >= 12) {
      this.confirming = true;
      const name = precious[0] ? precious[0].name ?? getItem(precious[0].defId)?.name ?? 'this landmark' : null;
      const ok = await confirmDialog({
        title: name ? `Demolish ${name}?` : `Demolish ${plural(q.buildings.length, 'building')}?`,
        body: name ? 'Generations will speak of the day you bulldozed it. (You can still undo.)' : `Everything under the brush comes down${q.value ? ` — about ${money(q.value)} of city` : ''}.`,
        okLabel: 'Demolish',
        danger: true,
      });
      this.confirming = false;
      if (!ok) {
        this.clear();
        return;
      }
    }
    const r = cmd.bulldoze(tiles, { filter: this.filter });
    const total = r.buildings + r.roads + r.props + r.nature;
    if (total) {
      this.mgr.pulseAt(at, 1.4 + Math.sqrt(tiles.length) * 0.8, TOOL_COLORS.bad);
      if (r.buildings >= 3 || q.buildings.some((b) => (getItem(b.defId)?.footprint ?? 1) > 1)) this.game.camera.shake(0.35, 0.45);
      this.mgr.setHint(r.refund > 0 ? `Demolished · refunded ${money(r.refund)}` : `Cleared ${plural(total, 'thing')}`);
    }
    this.clear();
    this.hoverTile = -1;
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!hit || this.confirming) return;
    void this.commit(this.brush0(hit.tile), hit.tile);
  }

  override down(hit: PickResult | null): void {
    if (!hit || this.confirming) return;
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
    for (const c of chain) for (const t of brushTiles(p, c, this.size)) this.stroke.add(t);
    this.preview([...this.stroke], tile);
  }

  override move(hit: PickResult | null): void {
    if (!this.painting || !hit || hit.tile === this.last) return;
    this.add(hit.tile);
  }

  override up(hit: PickResult | null): void {
    if (!this.painting) return;
    this.painting = false;
    const tiles = [...this.stroke];
    this.stroke.clear();
    void this.commit(tiles, hit?.tile ?? this.last);
  }

  override cancelStroke(): void {
    this.painting = false;
    this.stroke.clear();
    this.clear();
  }
}
