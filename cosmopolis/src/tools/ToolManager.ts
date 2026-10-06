/**
 * OWNER: tools.
 * ToolManager — the active tool state machine. Tools (tools/*.ts): select · plop (ghost + rotation, drag-paint
 * 1-tile items, long-press precision placing) · road (A* drag or tap-tap chaining, kinds, upgrade) · zone (brush
 * 1/7/19, block fill, erase) · bulldoze (brush, filters, confirm for valuables) · terraform (raise / lower / flatten /
 * smooth / biome / forest / clear / deposits / sea level) · district (paint / new / erase) · paint (swatches + hue)
 * · decor (free placement, scatter brush) · orbit (launch with a rocket flare) · god (tile / drag / global
 * targeting with a reticle) · move (relocate a building).
 *
 * Writes ui.tool / ui.toolOptions / ui.hint / ui.costPreview, emits 'tool:changed', toggles the build grid /
 * strong zone display / district borders while relevant, owns ToolVisuals (per PlanetView) and the floating tag.
 * When no tool is selected the select tool handles taps (inspect).
 * On touch devices placement tools preview at the screen centre until the first press.
 *
 * CONTRACT: select(state | null), cancel(), escape(), tap(hit, info?), hover(hit), longPress(hit, info),
 *           pointerDown/Move/Up(hit, info), cancelStroke(), setOption(id, value), rotate(dir), brush(delta),
 *           home(), update(dt), isDrawing, rotatable, placing, current, rotation, visuals, tag
 */
import { Vector3 } from 'three';
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import { ui, type ToolOption, type ToolState } from '../ui/store';
import type { PickResult } from '../world/geo';
import { tileNormal, tilePosition } from '../world/geo';
import type { Planet } from '../world/planet';
import { bus } from '../core/events';
import { getItem } from '../content/catalog';
import type { PointerInfo, Tool } from './Tool';
import { ToolVisuals } from './visuals';
import { ToolTag, type TagTone } from './tag';
import { SelectTool } from './select';
import { PlopTool } from './plop';
import { RoadTool } from './road';
import { ZoneTool } from './zone';
import { BulldozeTool } from './bulldoze';
import { TerraformTool } from './terraform';
import { DistrictTool } from './district';
import { PaintTool } from './paint';
import { DecorTool } from './decor';
import { OrbitTool } from './orbit';
import { GodTool } from './god';
import { MoveTool } from './move';

const DEFAULT_INFO: PointerInfo = { touch: false, shift: false, alt: false, ctrl: false, button: 0 };

export class ToolManager implements System {
  current: ToolState | null = null;
  /** placement rotation (0..5, neighbour index) shared by plop / move / decor */
  rotation = 0;
  visuals: ToolVisuals | null = null;
  readonly tag = new ToolTag();
  readonly tools: Record<string, Tool>;
  private active: Tool;
  private readonly select0: SelectTool;
  /** touch: ghosts track the screen centre until the first press */
  private centreTracking = true;
  /** camera target xyz, distance, heading at the last centre preview */
  private lastCentre = new Float64Array(5);
  private centreYCache = 0;
  private centreYAt = -1e9;
  private offs: (() => void)[] = [];

  constructor(readonly game: Game) {
    this.select0 = new SelectTool(this);
    const list: Tool[] = [
      this.select0,
      new PlopTool(this),
      new RoadTool(this),
      new ZoneTool(this),
      new BulldozeTool(this),
      new TerraformTool(this),
      new DistrictTool(this),
      new PaintTool(this),
      new DecorTool(this),
      new OrbitTool(this),
      new GodTool(this),
      new MoveTool(this),
    ];
    this.tools = {};
    for (const t of list) this.tools[t.id] = t;
    this.active = this.select0;
  }

  init(): void {
    this.offs.push(
      bus.on('planet:unloading', () => {
        this.select(null);
        this.visuals?.dispose();
        this.visuals = null;
      }),
    );
  }

  onPlanetLoaded(): void {
    this.visuals?.dispose();
    this.visuals = null;
    this.ensureVisuals();
    this.select(null);
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.visuals?.dispose();
    this.tag.dispose();
  }

  // ─────────────────────────────────────────────── accessors

  get planet(): Planet | null {
    return this.game.planet;
  }

  get isDrawing(): boolean {
    return this.active.drawing;
  }

  get rotatable(): boolean {
    return this.active.rotatable;
  }

  get placing(): boolean {
    return this.active.placing;
  }

  get touch(): boolean {
    try {
      return this.game.input?.touch ?? this.game.engine.mobile;
    } catch {
      return false;
    }
  }

  get sandbox(): boolean {
    return this.game.empire.sandbox;
  }

  /** Visuals for the active planet view (rebuilt when the view changes). */
  ensureVisuals(): ToolVisuals | null {
    const v = this.game.planetView;
    if (!v) return null;
    if (!this.visuals || this.visuals.view !== v) {
      this.visuals?.dispose();
      this.visuals = new ToolVisuals(v);
    }
    return this.visuals;
  }

  // ─────────────────────────────────────────────── selection of tools

  select(state: ToolState | null): void {
    try {
      this.game.commands.end();
    } catch {
      /* commands optional */
    }
    const prev = this.active;
    try {
      prev.exit();
    } catch (e) {
      console.error('[tools] exit failed', prev.id, e);
    }
    this.visuals?.hideAll();
    this.tag.hide();
    let next: Tool = this.select0;
    if (state) {
      const t = this.tools[state.id];
      if (t) next = t;
      else {
        // unknown tool id from an item: fall back by item shape
        const def = state.itemId ? getItem(state.itemId) : undefined;
        next = def?.placement === 'orbit' ? this.tools.orbit : def?.category === 'decor' ? this.tools.decor : def ? this.tools.plop : this.select0;
        state = { ...state, id: next.id };
      }
    }
    this.current = state && next !== this.select0 ? state : state?.id === 'select' ? state : null;
    this.active = next;
    this.centreTracking = true;
    this.lastCentre.fill(NaN);
    this.centreYAt = -1e9;
    ui.costPreview.value = null;
    try {
      next.enter(state ?? { id: 'select' });
    } catch (e) {
      console.error('[tools] enter failed', next.id, e);
    }
    ui.tool.value = this.current;
    this.publishOptions();
    ui.hint.value = this.current ? next.hint() : null;
    const surface = this.game.planetView?.surface;
    if (surface) {
      try {
        surface.setGrid(!!this.current && next.wantsGrid);
      } catch {
        /* surface optional */
      }
    }
    if (this.current && ui.selection.value && next.id !== 'select' && next.id !== 'paint') {
      ui.selection.value = null;
      bus.emit('selection:changed', { selection: null });
    }
    bus.emit('tool:changed', { toolId: this.current?.id ?? null });
  }

  /** Deselect the tool (✕ in the tool bar). */
  cancel(): void {
    this.select(null);
  }

  /** Esc: innermost first. Returns true when something was cancelled. */
  escape(): boolean {
    if (this.active.escape()) return true;
    if (this.current) {
      this.select(null);
      this.sfx('close');
      return true;
    }
    if (ui.selection.value) {
      ui.selection.value = null;
      bus.emit('selection:changed', { selection: null });
      return true;
    }
    return false;
  }

  setOption(id: string, value: unknown): void {
    try {
      this.active.setOption(id, value);
    } catch (e) {
      console.error('[tools] setOption failed', id, e);
    }
    this.publishOptions();
  }

  publishOptions(): void {
    let opts: ToolOption[] = [];
    try {
      opts = this.current ? this.active.options() : [];
    } catch (e) {
      console.error('[tools] options failed', e);
    }
    ui.toolOptions.value = opts;
  }

  // ─────────────────────────────────────────────── input routing

  hover(hit: PickResult | null): void {
    this.safe(() => this.active.hover(hit));
  }

  tap(hit: PickResult | null, info: PointerInfo = DEFAULT_INFO): void {
    this.centreTracking = false;
    this.safe(() => this.active.tap(hit, info));
  }

  longPress(hit: PickResult | null, info: PointerInfo = DEFAULT_INFO): boolean {
    this.centreTracking = false;
    let r = false;
    this.safe(() => (r = this.active.longPress(hit, info)));
    return r;
  }

  pointerDown(hit: PickResult | null, info: PointerInfo = DEFAULT_INFO): void {
    this.centreTracking = false;
    this.safe(() => this.active.down(hit, info));
  }

  pointerMove(hit: PickResult | null, info: PointerInfo = DEFAULT_INFO): void {
    this.safe(() => this.active.move(hit, info));
  }

  pointerUp(hit: PickResult | null, info: PointerInfo = DEFAULT_INFO): void {
    this.safe(() => this.active.up(hit, info));
  }

  cancelStroke(): void {
    this.safe(() => this.active.cancelStroke());
  }

  rotate(dir: number): void {
    this.safe(() => this.active.rotate(dir));
  }

  brush(delta: number): void {
    this.safe(() => this.active.brush(delta));
    this.publishOptions();
  }

  /**
   * Vertical middle of the 3D view left uncovered by the HUD (top bar … tool bar), so the touch preview lands
   * where the player can see it in portrait and landscape alike. Layout is read at most twice a second.
   */
  private centreY(): number {
    const h = this.game.engine.height;
    const now = performance.now();
    if (now - this.centreYAt < 500 && this.centreYCache > 0) return this.centreYCache;
    this.centreYAt = now;
    let bottom = h * 0.78;
    let top = Math.min(90, h * 0.12);
    try {
      const bar = typeof document !== 'undefined' ? document.querySelector('.tl-bar') : null;
      const r = bar?.getBoundingClientRect();
      if (r && r.height > 0 && r.top > h * 0.3) bottom = r.top;
      const tb = typeof document !== 'undefined' ? document.querySelector('.tb-root') : null;
      const t = tb?.getBoundingClientRect();
      if (t && t.height > 0 && t.bottom < h * 0.4) top = t.bottom;
    } catch {
      /* no DOM */
    }
    this.centreYCache = Math.max(top + 20, Math.min(bottom - 20, (top + bottom) / 2 + (bottom - top) * 0.08));
    return this.centreYCache;
  }

  /** Long-press shortcut: switch to the move tool with this building lifted under the finger. */
  liftBuilding(id: number): boolean {
    const p = this.planet;
    if (!p?.buildings.has(id)) return false;
    if (ui.selection.value) {
      ui.selection.value = null;
      bus.emit('selection:changed', { selection: null });
    }
    this.select({ id: 'move', label: 'Move' });
    const mv = this.tools.move as MoveTool;
    if (this.active !== mv || !mv.lift(id, true)) return false;
    try {
      navigator.vibrate?.(14);
    } catch {
      /* not on iOS */
    }
    return true;
  }

  /** Fly back over the city. */
  home(): void {
    const p = this.planet;
    if (!p) return;
    const sum = new Vector3();
    for (const b of p.buildings.values()) sum.add(tileNormal(p, b.tile, new Vector3()));
    if (sum.lengthSq() < 1e-6) return;
    const t = p.grid.tileAt(sum.x, sum.y, sum.z);
    void this.game.camera.flyTo(t, { distance: Math.min(60, Math.max(20, Math.sqrt(p.buildings.size) * 3.2)) });
    this.sfx('whoosh');
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      console.error('[tools] tool failed', this.active.id, e);
    }
  }

  // ─────────────────────────────────────────────── helpers for tools

  setHint(text: string | null): void {
    if (ui.hint.value !== text) ui.hint.value = text;
  }

  setCost(cost: number | null, ok = true, reason?: string): void {
    if (cost === null) {
      if (ui.costPreview.value !== null) ui.costPreview.value = null;
      return;
    }
    const c = ui.costPreview.value;
    if (c && c.cost === cost && c.ok === ok && c.reason === reason) return;
    ui.costPreview.value = { cost, ok, reason };
  }

  /** Tag over a tile (or a world point). */
  showTag(where: number | Vector3, text: string, tone: TagTone = 'info', sub = ''): void {
    const p = this.planet;
    if (!p) return;
    const pos = typeof where === 'number' ? tilePosition(p, where, new Vector3(), 0.4) : where;
    this.tag.set(pos, text, tone, sub);
  }

  hideTag(): void {
    this.tag.hide();
  }

  sfx(name: Parameters<Game['audio']['sfx']>[0], volume?: number): void {
    try {
      if (typeof this.game.audio?.sfx === 'function') this.game.audio.sfx(name, volume !== undefined ? { volume } : undefined);
    } catch {
      /* optional */
    }
  }

  /** Burst ring at a tile (feedback for placements / demolitions). */
  pulseAt(tile: number, radius: number, color: number): void {
    const p = this.planet;
    const v = this.visuals;
    if (!p || !v) return;
    const pos = tilePosition(p, tile, new Vector3());
    if (p.isWater(tile)) pos.setLength(p.radius + p.waterHeight);
    v.pulse(pos, tileNormal(p, tile, new Vector3()), radius, color);
  }

  // ─────────────────────────────────────────────── frame

  update(dt: number): void {
    const v = this.ensureVisuals();
    if (!v) return;
    // touch placement tools: preview where the screen centre lands until the first press
    if (this.current && this.centreTracking && this.touch && this.active.placing && this.game.activeView === this.game.planetView) {
      const cam = this.game.camera;
      const t = cam.target;
      const c = this.lastCentre;
      if (t.x !== c[0] || t.y !== c[1] || t.z !== c[2] || cam.distance !== c[3] || cam.heading !== c[4]) {
        c[0] = t.x;
        c[1] = t.y;
        c[2] = t.z;
        c[3] = cam.distance;
        c[4] = cam.heading;
        let hit: PickResult | null = null;
        try {
          hit = this.game.input.pick(this.game.engine.width / 2, this.centreY());
        } catch {
          hit = null;
        }
        this.hover(hit);
      }
    }
    this.safe(() => this.active.update(dt));
    v.update(dt);
    const cam = this.game.planetView?.camera;
    if (cam) this.tag.update(cam, this.game.engine.width, this.game.engine.height);
  }
}
