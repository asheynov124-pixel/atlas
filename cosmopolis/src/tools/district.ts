/**
 * OWNER: tools.
 * DistrictTool — paint neighbourhoods. Pick an existing district or "New" (founded on the first stroke with a
 * generated name and a palette colour), paint or erase with a 1 / 7 / 19 brush. District borders show on the
 * surface while the tool is active. Each stroke (including founding) is one undo step.
 */
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { notify } from '../ui/store';
import { chainTiles } from './pathing';
import { brushTiles, plural } from './util';
import { districtColor, districtName } from '../game/Commands';
import { TOOL_COLORS } from './visuals';

export class DistrictTool extends Tool {
  readonly id = 'district';
  private district: number | 'new' = 'new';
  private mode: 'paint' | 'erase' = 'paint';
  private size = 1;
  private stroke = new Set<number>();
  private painting = false;
  private last = -1;
  private hoverTile = -1;
  /** name / colour reserved for the next founding (so the preview matches) */
  private pendingName = '';
  private pendingColor = 0;

  override get drawing(): boolean {
    return true;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    const p = this.mgr.planet;
    const existing = p ? p.districts.filter((d, i) => i > 0 && d) : [];
    if (this.district === 'new' || !p?.districts[this.district as number]) this.district = existing.length ? existing[existing.length - 1].id : 'new';
    this.reservePending();
    this.game.planetView?.surface.setDistrictDisplay(true);
  }

  override exit(): void {
    this.clear();
    this.painting = false;
    this.game.planetView?.surface.setDistrictDisplay(false);
  }

  private reservePending(): void {
    const p = this.mgr.planet;
    if (!p) return;
    this.pendingName = districtName(p.districts);
    this.pendingColor = districtColor(p.districts);
  }

  private get color(): number {
    if (this.mode === 'erase') return TOOL_COLORS.white;
    if (this.district === 'new') return this.pendingColor;
    return this.mgr.planet?.districts[this.district]?.color ?? TOOL_COLORS.accent;
  }

  private get name(): string {
    if (this.district === 'new') return this.pendingName;
    return this.mgr.planet?.districts[this.district]?.name ?? 'District';
  }

  override hint(): string {
    if (this.mode === 'erase') return 'Drag to remove tiles from their district';
    return this.district === 'new' ? `Paint to found ${this.pendingName}` : `Drag to grow ${this.name}`;
  }

  override options(): ToolOption[] {
    const p = this.mgr.planet;
    const list = p ? p.districts.filter((d, i) => i > 0 && d) : [];
    return [
      {
        id: 'district',
        label: 'District',
        type: 'choice',
        value: this.district,
        choices: [...list.map((d) => ({ value: d.id, label: d.name, icon: 'district' })), { value: 'new', label: 'New district', icon: 'plus' }],
      },
      {
        id: 'mode',
        label: 'Mode',
        type: 'choice',
        value: this.mode,
        choices: [
          { value: 'paint', label: 'Paint', icon: 'brush' },
          { value: 'erase', label: 'Erase', icon: 'trash' },
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
    if (id === 'district') {
      this.district = value === 'new' ? 'new' : Number(value);
      if (this.district === 'new') this.reservePending();
      this.mode = 'paint';
    }
    if (id === 'mode') this.mode = value === 'erase' ? 'erase' : 'paint';
    if (id === 'size') this.size = Math.max(0, Math.min(2, Number(value) || 0));
    this.mgr.setHint(this.hint());
    if (this.hoverTile >= 0) this.show(brushTiles(this.mgr.planet!, this.hoverTile, this.size), this.hoverTile);
  }

  override brush(delta: number): void {
    this.size = Math.max(0, Math.min(2, this.size + delta));
  }

  private clear(): void {
    this.mgr.visuals?.highlight('tool', null);
    this.mgr.hideTag();
  }

  private show(tiles: number[], at: number): void {
    this.mgr.visuals?.highlight('tool', tiles, this.color, this.mode === 'erase' ? 0.3 : 0.5);
    const p = this.mgr.planet;
    const cur = p && p.district[at] > 0 ? p.districts[p.district[at]]?.name : '';
    this.mgr.showTag(at, this.mode === 'erase' ? 'Erase' : this.name, this.mode === 'erase' ? 'warn' : 'info', cur && cur !== this.name ? `now in ${cur}` : this.district === 'new' ? 'New district' : '');
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
    this.show(brushTiles(this.mgr.planet!, hit.tile, this.size), hit.tile);
  }

  private commit(tiles: number[], at: number): void {
    if (!tiles.length) return;
    const cmd = this.game.commands;
    cmd.begin('District');
    let id = 0;
    let founded = false;
    if (this.mode === 'paint') {
      if (this.district === 'new') {
        const d = cmd.createDistrict(this.pendingName, this.pendingColor);
        if (!d) {
          cmd.end();
          return;
        }
        this.district = d.id;
        id = d.id;
        founded = true;
      } else id = this.district;
    }
    const n = cmd.paintDistrict(tiles, id);
    cmd.end();
    if (founded) {
      notify({ title: `${this.name} founded`, body: 'Set its policies and style in the Districts panel.', kind: 'good', icon: 'district' });
      this.reservePending();
      this.mgr.publishOptions();
    }
    if (n) {
      this.mgr.pulseAt(at, 1.4 + Math.sqrt(n) * 0.5, this.color);
      this.mgr.setHint(this.mode === 'erase' ? `Removed ${plural(n, 'tile')}` : `${this.name}: +${plural(n, 'tile')}`);
    }
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!hit) return;
    this.commit(brushTiles(this.mgr.planet!, hit.tile, this.size), hit.tile);
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
    for (const c of chain) for (const t of brushTiles(p, c, this.size)) this.stroke.add(t);
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
