/**
 * OWNER: tools.
 * PaintTool — recolour buildings. Twelve hand-picked swatches, a custom hue slider, an eyedropper (copy a
 * building's colour) and "Original" (remove paint). Tap a building, or drag across a street to paint every
 * building the stroke touches (one undo step). The hovered building previews in the chosen colour.
 * Tints multiply the paintable surfaces, so the palette is deliberately light.
 */
import { Color } from 'three';
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { ui } from '../ui/store';
import { getItem } from '../content/catalog';
import { chainTiles } from './pathing';

export const SWATCHES: { label: string; color: number }[] = [
  { label: 'Coral', color: 0xff8a7a },
  { label: 'Tangerine', color: 0xffb36b },
  { label: 'Butter', color: 0xffe28a },
  { label: 'Lime', color: 0xc8f08a },
  { label: 'Mint', color: 0x8ff0c0 },
  { label: 'Lagoon', color: 0x7fe3e0 },
  { label: 'Sky', color: 0x8cc8ff },
  { label: 'Cobalt', color: 0x7f9cff },
  { label: 'Violet', color: 0xb59bff },
  { label: 'Orchid', color: 0xf0a0ff },
  { label: 'Rose', color: 0xff9cc8 },
  { label: 'Graphite', color: 0x8a93a6 },
];

const _c = new Color();

export class PaintTool extends Tool {
  readonly id = 'paint';
  private swatch = 'Coral';
  private hue = 200;
  private tint: number | undefined = SWATCHES[0].color;
  private picking = false;
  private stroke = new Set<number>();
  private painting = false;
  private last = -1;
  private hoverId = -1;

  override get drawing(): boolean {
    return true;
  }
  override get wantsGrid(): boolean {
    return false;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    this.picking = false;
    this.hoverId = -1;
    // painting the inspected building straight away feels natural
    const sel = ui.selection.value;
    if (sel?.kind === 'building') this.hoverId = -1;
  }

  override exit(): void {
    this.clear();
    this.painting = false;
  }

  override hint(): string {
    if (this.picking) return 'Tap a building to copy its colour';
    return this.mgr.touch ? 'Tap a building to paint it · drag along a street to paint them all' : 'Click a building to paint it · drag to paint many';
  }

  override options(): ToolOption[] {
    return [
      {
        id: 'swatch',
        label: 'Colour',
        type: 'choice',
        value: this.swatch,
        choices: [...SWATCHES.map((s) => ({ value: s.label, label: s.label, icon: '●' })), { value: 'Custom hue', label: 'Custom hue', icon: '●' }, { value: 'Original', label: 'Original', icon: 'refresh' }],
      },
      { id: 'hue', label: 'Hue', type: 'slider', min: 0, max: 360, step: 1, value: this.hue, icon: 'palette' },
      { id: 'pick', label: 'Eyedropper', type: 'button', icon: 'eyedropper' },
    ];
  }

  override setOption(id: string, value: unknown): void {
    if (id === 'swatch') {
      this.swatch = String(value);
      this.picking = false;
      if (this.swatch === 'Original') this.tint = undefined;
      else if (this.swatch === 'Custom hue') this.tint = this.hueColor();
      else this.tint = SWATCHES.find((s) => s.label === this.swatch)?.color ?? SWATCHES[0].color;
    }
    if (id === 'hue') {
      this.hue = Math.max(0, Math.min(360, Number(value) || 0));
      this.swatch = 'Custom hue';
      this.tint = this.hueColor();
      this.picking = false;
    }
    if (id === 'pick') this.picking = true;
    this.mgr.setHint(this.hint());
    if (this.hoverId >= 0) this.showHover(this.hoverId, true);
  }

  private hueColor(): number {
    return _c.setHSL(this.hue / 360, 0.72, 0.72).getHex();
  }

  private clear(): void {
    this.mgr.visuals?.highlight('tool', null);
    this.mgr.hideTag();
  }

  private showHover(id: number, force = false): void {
    if (id === this.hoverId && !force) return;
    this.hoverId = id;
    const p = this.mgr.planet;
    const b = id >= 0 ? p?.buildings.get(id) : undefined;
    if (!b) {
      this.clear();
      return;
    }
    this.mgr.visuals?.highlight('tool', b.tiles, this.picking ? 0xffffff : this.tint ?? 0xffffff, 0.5);
    this.mgr.showTag(b.tile, b.name ?? getItem(b.defId)?.name ?? 'Building', 'info', this.picking ? 'Copy colour' : this.tint === undefined ? 'Original colours' : this.swatch);
  }

  override hover(hit: PickResult | null): void {
    if (this.painting) return;
    const p = this.mgr.planet;
    this.showHover(hit && p ? p.building[hit.tile] : -1);
  }

  private paintBuilding(id: number): boolean {
    if (id < 0 || this.stroke.has(id)) return false;
    this.stroke.add(id);
    const ok = this.game.commands.paint(id, this.tint);
    if (ok) {
      const b = this.mgr.planet?.buildings.get(id);
      if (b) this.mgr.pulseAt(b.tile, (getItem(b.defId)?.footprint ?? 1) > 1 ? 3 : 1.3, this.tint ?? 0xffffff);
    }
    return ok;
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    const p = this.mgr.planet;
    if (!hit || !p) return;
    const id = p.building[hit.tile];
    if (id < 0) {
      this.mgr.setHint('Tap a building — the ground is not paintable (try Terraform → Paint)');
      return;
    }
    if (this.picking) {
      const b = p.buildings.get(id)!;
      this.picking = false;
      this.tint = b.tint;
      this.swatch = b.tint === undefined ? 'Original' : SWATCHES.find((s) => s.color === b.tint)?.label ?? 'Custom hue';
      this.mgr.sfx('chime');
      this.mgr.setHint(b.tint === undefined ? 'Copied: original colours' : 'Colour copied — tap buildings to apply it');
      this.mgr.publishOptions();
      return;
    }
    this.stroke.clear();
    this.paintBuilding(id);
    this.stroke.clear();
  }

  override down(hit: PickResult | null): void {
    if (!hit) return;
    if (this.picking) return;
    this.painting = true;
    this.stroke.clear();
    this.last = -1;
    this.game.commands.begin('Paint');
    this.add(hit.tile);
  }

  private add(tile: number): void {
    const p = this.mgr.planet!;
    const first = this.last < 0;
    const chain: number[] = [];
    chainTiles(p, this.last, tile, chain);
    this.last = tile;
    for (const t of chain) {
      this.paintBuilding(p.building[t]);
      // once dragging, the brush catches the buildings beside the street too
      if (!first) for (const q of p.grid.neighbors(t)) this.paintBuilding(p.building[q]);
    }
  }

  override move(hit: PickResult | null): void {
    if (!this.painting || !hit || hit.tile === this.last) return;
    this.add(hit.tile);
  }

  override up(hit: PickResult | null): void {
    if (!this.painting) {
      if (this.picking && hit) this.tap(hit, { touch: false, shift: false, alt: false, ctrl: false, button: 0 });
      return;
    }
    this.painting = false;
    this.game.commands.end();
    const n = this.stroke.size;
    this.stroke.clear();
    if (n > 1) this.mgr.setHint(`Painted ${n} buildings`);
  }

  override cancelStroke(): void {
    if (!this.painting) return;
    this.painting = false;
    this.stroke.clear();
    this.game.commands.abort();
  }
}
