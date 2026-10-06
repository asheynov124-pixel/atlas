/**
 * OWNER: tools.
 * TerraformTool — sculpt the planet. Modes: Raise · Lower · Flatten (to the level where the stroke began) · Smooth
 * (toward the neighbours) are continuous while held, with a soft falloff and adjustable size / strength; Biome
 * paint · Forest · Clear trees paint once per tile; sandbox adds Deposits (ore, crystal, ice, gas, geothermal,
 * ruins), raising / lowering the seas and "Force" (sculpt through buildings and roads). Each stroke is one undo
 * step (rolled back if a second finger turns it into a camera gesture). The terrain's own biome rules repaint
 * ground that crosses the shoreline or the snow line.
 */
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { Biome, Feature } from '../core/types';
import type { TerraformMode } from '../game/Commands';
import { chainTiles } from './pathing';
import { diskRings, money } from './util';
import { TOOL_COLORS } from './visuals';

type Mode = 'raise' | 'lower' | 'flatten' | 'smooth' | 'biome' | 'forest' | 'clear' | 'deposit' | 'sea';

const MODE_META: Record<Mode, { label: string; icon: string; color: number; sandbox?: boolean }> = {
  raise: { label: 'Raise', icon: 'raise', color: 0x7cf0c0 },
  lower: { label: 'Lower', icon: 'lower', color: 0xffb35c },
  flatten: { label: 'Flatten', icon: 'flatten', color: 0x8cc8ff },
  smooth: { label: 'Smooth', icon: 'smooth', color: 0xb59bff },
  biome: { label: 'Paint', icon: 'palette', color: 0xffe28a },
  forest: { label: 'Forest', icon: 'tree', color: 0x6fe07a },
  clear: { label: 'Clear', icon: 'bulldoze', color: 0xff9a7a },
  deposit: { label: 'Deposit', icon: 'sparkles', color: 0xffd36b, sandbox: true },
  sea: { label: 'Sea level', icon: 'wave', color: 0x5ec8ff, sandbox: true },
};

const BIOMES: { value: Biome; label: string }[] = [
  { value: Biome.Grass, label: 'Grass' },
  { value: Biome.Meadow, label: 'Meadow' },
  { value: Biome.Forest, label: 'Forest' },
  { value: Biome.Jungle, label: 'Jungle' },
  { value: Biome.Savanna, label: 'Savanna' },
  { value: Biome.Desert, label: 'Desert' },
  { value: Biome.Beach, label: 'Sand' },
  { value: Biome.Tundra, label: 'Tundra' },
  { value: Biome.Snow, label: 'Snow' },
  { value: Biome.Ice, label: 'Ice' },
  { value: Biome.Rock, label: 'Rock' },
  { value: Biome.Swamp, label: 'Swamp' },
  { value: Biome.Salt, label: 'Salt flat' },
  { value: Biome.Volcanic, label: 'Basalt' },
  { value: Biome.Ash, label: 'Ash' },
  { value: Biome.Fungal, label: 'Fungal' },
  { value: Biome.Crystal, label: 'Crystal' },
  { value: Biome.Toxic, label: 'Toxic' },
  { value: Biome.Regolith, label: 'Regolith' },
  { value: Biome.Metal, label: 'Metal' },
];

const DEPOSITS: { value: Feature; label: string; icon: string }[] = [
  { value: Feature.Ore, label: 'Ore', icon: 'factory' },
  { value: Feature.CrystalDeposit, label: 'Crystal', icon: 'sparkles' },
  { value: Feature.IceDeposit, label: 'Ice', icon: 'snowflake' },
  { value: Feature.GasVent, label: 'Gas vent', icon: 'wind' },
  { value: Feature.GeoVent, label: 'Geothermal', icon: 'volcano' },
  { value: Feature.Ruins, label: 'Ruins', icon: 'alien' },
];

const SCULPT = new Set<Mode>(['raise', 'lower', 'flatten', 'smooth']);

export class TerraformTool extends Tool {
  readonly id = 'terraform';
  private mode: Mode = 'raise';
  private size = 1;
  private strength = 3;
  private biome: Biome = Biome.Grass;
  private deposit: Feature = Feature.Ore;
  private force = false;
  private holding = false;
  private lastTile = -1;
  private hoverTile = -1;
  private flatLevel = 0;
  private acc = new Map<number, number>();
  private rings: Map<number, number> | null = null;
  private ringsAt = -1;
  private ringsSize = -1;
  private warmup = 0;
  private painted = new Set<number>();
  private strokeChanged = 0;

  override get drawing(): boolean {
    return this.mode !== 'sea';
  }

  override enter(state: ToolState): void {
    super.enter(state);
    this.holding = false;
    this.hoverTile = -1;
    if (!this.mgr.sandbox && MODE_META[this.mode].sandbox) this.mode = 'raise';
  }

  override exit(): void {
    if (this.holding) {
      this.holding = false;
      this.game.commands.end();
    }
    this.clear();
  }

  override hint(): string {
    const touch = this.mgr.touch;
    switch (this.mode) {
      case 'raise':
        return touch ? 'Hold or drag to raise the land · two fingers move the camera' : 'Hold the mouse to raise the land · [ ] brush size';
      case 'lower':
        return 'Hold or drag to dig down — below the sea it floods';
      case 'flatten':
        return 'Drag from a spot to level everything to its height';
      case 'smooth':
        return 'Drag to soften cliffs and spikes';
      case 'biome':
        return 'Drag to repaint the ground';
      case 'forest':
        return 'Drag to plant woodland (paint twice for dense forest)';
      case 'clear':
        return 'Drag to clear trees, rocks and rubble';
      case 'deposit':
        return 'Sandbox: drag to conjure resource deposits';
      case 'sea':
        return 'Sandbox: raise or lower the oceans of the whole world';
    }
  }

  override options(): ToolOption[] {
    const sb = this.mgr.sandbox;
    const modes = (Object.keys(MODE_META) as Mode[]).filter((m) => sb || !MODE_META[m].sandbox);
    const o: ToolOption[] = [
      { id: 'mode', label: 'Mode', type: 'choice', value: this.mode, choices: modes.map((m) => ({ value: m, label: MODE_META[m].label, icon: MODE_META[m].icon })) },
    ];
    if (this.mode === 'sea') {
      const p = this.mgr.planet;
      o.push({ id: 'seaUp', label: 'Raise seas', type: 'button', icon: 'arrowUp' });
      o.push({ id: 'seaDown', label: 'Lower seas', type: 'button', icon: 'arrowDown' });
      if (p) o.push({ id: 'seaReset', label: `Reset (${p.seaOffset >= 0 ? '+' : ''}${p.seaOffset})`, type: 'button', icon: 'refresh' });
      return o;
    }
    o.push({ id: 'size', label: 'Size', type: 'slider', min: 1, max: 5, step: 1, value: this.size + 1, icon: 'brush' });
    if (SCULPT.has(this.mode)) o.push({ id: 'strength', label: 'Strength', type: 'slider', min: 1, max: 5, step: 1, value: this.strength, icon: 'lightning' });
    if (this.mode === 'biome') o.push({ id: 'biome', label: 'Ground', type: 'choice', value: this.biome, choices: BIOMES.map((b) => ({ value: b.value, label: b.label })) });
    if (this.mode === 'deposit') o.push({ id: 'deposit', label: 'Deposit', type: 'choice', value: this.deposit, choices: DEPOSITS.map((d) => ({ value: d.value, label: d.label, icon: d.icon })) });
    if (sb && SCULPT.has(this.mode)) o.push({ id: 'force', label: 'Force', type: 'toggle', icon: 'magic', value: this.force });
    return o;
  }

  override setOption(id: string, value: unknown): void {
    const cmd = this.game.commands;
    const p = this.mgr.planet;
    switch (id) {
      case 'mode':
        if (MODE_META[value as Mode]) this.mode = value as Mode;
        break;
      case 'size':
        this.size = Math.max(0, Math.min(4, Math.round(Number(value)) - 1));
        break;
      case 'strength':
        this.strength = Math.max(1, Math.min(5, Math.round(Number(value))));
        break;
      case 'biome':
        this.biome = Number(value) as Biome;
        break;
      case 'deposit':
        this.deposit = Number(value) as Feature;
        break;
      case 'force':
        this.force = !!value;
        break;
      case 'seaUp':
        if (p) cmd.setSeaLevel(p.seaOffset + 1);
        break;
      case 'seaDown':
        if (p) cmd.setSeaLevel(p.seaOffset - 1);
        break;
      case 'seaReset':
        if (p) cmd.setSeaLevel(0);
        break;
    }
    this.mgr.setHint(this.hint());
    this.rings = null;
    if (this.hoverTile >= 0) this.preview(this.hoverTile);
    else this.clear();
  }

  override brush(delta: number): void {
    this.size = Math.max(0, Math.min(4, this.size + delta));
    this.rings = null;
    if (this.hoverTile >= 0) this.preview(this.hoverTile);
  }

  private ringsFor(tile: number): Map<number, number> {
    if (!this.rings || this.ringsAt !== tile || this.ringsSize !== this.size) {
      this.rings = diskRings(this.mgr.planet!, tile, this.size);
      this.ringsAt = tile;
      this.ringsSize = this.size;
    }
    return this.rings;
  }

  private eligible(tiles: Iterable<number>): number[] {
    const cmd = this.game.commands;
    const out: number[] = [];
    const force = this.force && this.mgr.sandbox && SCULPT.has(this.mode);
    for (const t of tiles) if (cmd.terraformable(t, force)) out.push(t);
    return out;
  }

  private clear(): void {
    const v = this.mgr.visuals;
    v?.highlight('tool', null);
    v?.highlight('tool-bad', null);
    this.mgr.hideTag();
    this.mgr.setCost(null);
  }

  private preview(tile: number): void {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!p || !v) return;
    if (this.mode === 'sea') {
      v.highlight('tool', null);
      this.mgr.showTag(tile, `Sea level ${p.seaOffset >= 0 ? '+' : ''}${p.seaOffset}`, 'info', p.spec.hasOcean ? 'Use the buttons below' : 'This world has no ocean');
      return;
    }
    const rings = this.ringsFor(tile);
    const all = [...rings.keys()];
    const ok = this.eligible(all);
    const okSet = new Set(ok);
    v.highlight('tool', ok, MODE_META[this.mode].color, 0.42);
    const blocked = all.filter((t) => !okSet.has(t));
    v.highlight('tool-bad', blocked.length ? blocked : null, TOOL_COLORS.bad, 0.22);
    const e = p.elevation[tile];
    const lvl = (n: number) => `Level ${n}`;
    let label = lvl(e);
    if (this.holding && this.mode === 'flatten') label = `${lvl(e)} → ${this.flatLevel}`;
    const kind: TerraformMode = this.mode === 'flatten' ? 'level' : (this.mode as TerraformMode);
    const unit = this.game.commands.terraformQuote(kind, 1);
    const sub = this.mode === 'biome' ? BIOMES.find((b) => b.value === this.biome)?.label ?? '' : this.mode === 'deposit' ? DEPOSITS.find((d) => d.value === this.deposit)?.label ?? '' : unit > 0 ? `${money(unit)} per tile step` : p.isWater(tile) ? 'Under water' : '';
    this.mgr.showTag(tile, SCULPT.has(this.mode) ? label : MODE_META[this.mode].label, ok.length ? 'info' : 'bad', ok.length ? sub : 'Buildings or roads in the way');
  }

  override hover(hit: PickResult | null): void {
    if (this.holding) return;
    if (!hit) {
      this.hoverTile = -1;
      this.clear();
      return;
    }
    if (hit.tile === this.hoverTile) return;
    this.hoverTile = hit.tile;
    this.preview(hit.tile);
  }

  /** One sculpt step on the given tiles (raise / lower / toward flatLevel / smooth). */
  private sculpt(tiles: number[]): number {
    const cmd = this.game.commands;
    const p = this.mgr.planet!;
    const force = this.force && this.mgr.sandbox;
    let n = 0;
    switch (this.mode) {
      case 'raise':
        n = cmd.terraform(tiles, 'raise', 1, { force }).length;
        break;
      case 'lower':
        n = cmd.terraform(tiles, 'lower', 1, { force }).length;
        break;
      case 'flatten': {
        const up = tiles.filter((t) => p.elevation[t] < this.flatLevel);
        const down = tiles.filter((t) => p.elevation[t] > this.flatLevel);
        if (up.length) n += cmd.terraform(up, 'raise', 1, { force }).length;
        if (down.length) n += cmd.terraform(down, 'lower', 1, { force }).length;
        break;
      }
      case 'smooth':
        n = cmd.terraform(tiles, 'smooth', 1, { force }).length;
        break;
    }
    return n;
  }

  private paintAt(tile: number): void {
    const cmd = this.game.commands;
    const tiles = [...this.ringsFor(tile).keys()].filter((t) => !this.painted.has(t) || this.mode === 'forest');
    if (!tiles.length) return;
    for (const t of tiles) this.painted.add(t);
    let n = 0;
    if (this.mode === 'biome') n = cmd.terraform(tiles, 'biome', 1, { biome: this.biome }).length;
    else if (this.mode === 'forest') n = cmd.terraform(tiles, 'forest', 1).length;
    else if (this.mode === 'clear') n = cmd.terraform(tiles, 'clear', 1).length;
    else if (this.mode === 'deposit') n = cmd.terraform(tiles, 'deposit', 1, { feature: this.deposit }).length;
    this.strokeChanged += n;
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!hit || this.mode === 'sea') return;
    this.game.commands.begin('Terraform');
    this.flatLevel = this.mgr.planet!.elevation[hit.tile];
    this.painted.clear();
    if (SCULPT.has(this.mode)) {
      const n = this.sculpt([...this.ringsFor(hit.tile).keys()]);
      if (n) this.mgr.pulseAt(hit.tile, 1.5 + this.size, MODE_META[this.mode].color);
    } else this.paintAt(hit.tile);
    this.game.commands.end();
    this.hoverTile = -1;
    this.preview(hit.tile);
  }

  override down(hit: PickResult | null): void {
    if (!hit || this.mode === 'sea') return;
    this.holding = true;
    this.lastTile = hit.tile;
    this.flatLevel = this.mgr.planet!.elevation[hit.tile];
    this.acc.clear();
    this.painted.clear();
    this.strokeChanged = 0;
    this.warmup = 0.22;
    this.game.commands.begin('Terraform');
    if (SCULPT.has(this.mode)) this.strokeChanged += this.mode === 'flatten' ? 0 : this.sculpt([...this.ringsFor(hit.tile).keys()].filter((t) => (this.rings!.get(t) ?? 9) <= Math.max(0, this.size - 1)));
    else this.paintAt(hit.tile);
    this.preview(hit.tile);
  }

  override move(hit: PickResult | null): void {
    if (!this.holding || !hit || hit.tile === this.lastTile) return;
    if (!SCULPT.has(this.mode)) {
      const chain: number[] = [];
      chainTiles(this.mgr.planet!, this.lastTile, hit.tile, chain);
      for (const t of chain) this.paintAt(t);
    }
    this.lastTile = hit.tile;
    this.preview(hit.tile);
  }

  override up(): void {
    if (!this.holding) return;
    this.holding = false;
    this.game.commands.end();
    this.hoverTile = -1;
    if (this.lastTile >= 0) this.preview(this.lastTile);
  }

  override cancelStroke(): void {
    if (!this.holding) return;
    this.holding = false;
    this.game.commands.abort();
    this.clear();
  }

  override update(dt: number): void {
    if (!this.holding || !SCULPT.has(this.mode) || this.lastTile < 0) return;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    const rings = this.ringsFor(this.lastTile);
    const rate = 0.9 + this.strength * 1.1; // steps per second at the centre
    const ready: number[] = [];
    for (const [t, r] of rings) {
      const w = 1 - r / (this.size + 1.35);
      const a = (this.acc.get(t) ?? 0) + rate * w * dt;
      if (a >= 1) {
        ready.push(t);
        this.acc.set(t, a - 1);
      } else this.acc.set(t, a);
    }
    if (ready.length) {
      const n = this.sculpt(ready);
      this.strokeChanged += n;
      if (n) this.preview(this.lastTile);
    }
  }
}
