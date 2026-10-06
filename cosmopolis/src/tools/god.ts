/**
 * OWNER: tools.
 * GodTool — aim a god power (game.god.powers). Targeting 'tile': a pulsing reticle (coloured by the power's
 * category, sized by its menace) follows the pointer; tap to unleash → game.god.trigger(id, { tile, point }).
 * 'drag': draw the path of destruction (violet ribbon), release → trigger(id, { path, tile, point }).
 * 'global': tap anywhere. Planet-ending (and `confirm`) powers ask once more. The tool stays armed for repeat
 * strikes and shows the cooldown when the heavens need a moment. Uses the god module's own colour, tip, danger
 * rating, cooldownLeft(id) and locked(id) when it offers them (duck-typed, so older builds still work).
 */
import { Vector3 } from 'three';
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { confirmDialog } from '../ui/store';
import { chainTiles } from './pathing';
import { pathPoints, surfacePoint } from './util';
import { Ribbon, TOOL_COLORS } from './visuals';
import type { GodPowerDef } from '../god/GodPowers';
import { tileNormal } from '../world/geo';

const CATEGORY_COLOR: Record<string, number> = {
  weather: 0x7cc4ff,
  earth: 0xffb35c,
  sky: 0xffe066,
  cosmic: 0xa77bff,
  creature: 0x9be564,
  creation: 0x5ef2a0,
  apocalypse: 0xff5a6e,
};
const CATEGORY_RADIUS: Record<string, number> = { weather: 3.4, earth: 3, sky: 2.4, cosmic: 4.2, creature: 2.2, creation: 2.4, apocalypse: 6 };

/** Optional extras newer god modules add to GodPowerDef (kept local so either contract version compiles). */
type PowerMeta = GodPowerDef & { color?: number; tip?: string; confirm?: boolean; danger?: number };

interface GodApi {
  cooldownLeft?: (id: string) => number;
  locked?: (id: string) => string | null;
}

const _pts = new Float32Array(Ribbon.MAX * 3);
const _n = new Vector3();
const _v = new Vector3();

export class GodTool extends Tool {
  readonly id = 'god';
  power: PowerMeta | null = null;
  private path: number[] = [];
  private last = -1;
  private dragging = false;
  private cooldownUntil = 0;
  private busy = false;
  private hoverTile = -1;

  override get drawing(): boolean {
    return this.power?.targeting === 'drag';
  }
  override get placing(): boolean {
    return true;
  }
  override get wantsGrid(): boolean {
    return false;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    const powers = (this.game.god?.powers ?? []) as PowerMeta[];
    this.power = powers.find((p) => p.id === state.powerId) ?? null;
    this.path = [];
    this.dragging = false;
    this.hoverTile = -1;
  }

  override exit(): void {
    this.clear();
  }

  private get color(): number {
    return this.power?.color ?? CATEGORY_COLOR[this.power?.category ?? 'cosmic'] ?? TOOL_COLORS.violet;
  }

  /** Reticle radius: by category, scaled by the power's danger rating when it has one. */
  private get radius(): number {
    const p = this.power;
    const base = CATEGORY_RADIUS[p?.category ?? 'cosmic'] ?? 3;
    return p?.danger !== undefined ? base * (0.75 + p.danger * 0.12) : base;
  }

  private get api(): GodApi {
    return (this.game.god ?? {}) as unknown as GodApi;
  }

  override hint(): string {
    const p = this.power;
    if (!p) return 'Choose a power in the God menu';
    if (p.tip) return p.tip;
    const verb = this.mgr.touch ? 'Tap' : 'Click';
    if (p.targeting === 'drag') return `Draw the path of ${p.name}`;
    if (p.targeting === 'global') return `${verb} anywhere to unleash ${p.name}`;
    return `${verb} where ${p.name} should strike`;
  }

  override options(): ToolOption[] {
    return [];
  }

  private clear(): void {
    const v = this.mgr.visuals;
    v?.reticle.hide();
    v?.ribbon.hide();
    v?.highlight('tool', null);
    this.mgr.hideTag();
  }

  private cooling(): number {
    const id = this.power?.id;
    const fn = this.api.cooldownLeft;
    if (id && typeof fn === 'function') {
      try {
        return Math.max(0, Number(fn.call(this.game.god, id)) || 0);
      } catch {
        /* fall back to the local timer */
      }
    }
    return Math.max(0, (this.cooldownUntil - performance.now()) / 1000);
  }

  private lockReason(): string | null {
    const id = this.power?.id;
    const fn = this.api.locked;
    if (!id || typeof fn !== 'function') return null;
    try {
      return fn.call(this.game.god, id) ?? null;
    } catch {
      return null;
    }
  }

  override hover(hit: PickResult | null): void {
    if (this.dragging) return;
    const v = this.mgr.visuals;
    const p = this.mgr.planet;
    if (!hit || !v || !p || !this.power) {
      this.hoverTile = -1;
      this.clear();
      return;
    }
    const r = this.radius;
    v.reticle.show(hit.point, tileNormal(p, hit.tile, _n), r, this.color, true);
    if (hit.tile !== this.hoverTile) {
      this.hoverTile = hit.tile;
      const cd = this.cooling();
      const lock = this.lockReason();
      const sub = lock ?? (cd > 0 ? `Recharging · ${Math.ceil(cd)}s` : this.power.planetEnding ? 'Ends this world' : '');
      this.mgr.showTag(_v.copy(hit.point).addScaledVector(_n, r * 0.4), this.power.name, lock ? 'bad' : cd > 0 ? 'warn' : 'god', sub);
    }
  }

  private async fire(hit: PickResult | null, path?: number[]): Promise<void> {
    const pw = this.power;
    const p = this.mgr.planet;
    if (!pw || !p || this.busy) return;
    const lock = this.lockReason();
    if (lock) {
      this.game.commands.feedback(`${pw.name} is locked`, lock, 'info', 'lock');
      return;
    }
    const cd = this.cooling();
    if (cd > 0) {
      this.game.commands.feedback(`${pw.name} is recharging`, `Ready in ${Math.ceil(cd)} s`, 'info', 'hourglass', null);
      return;
    }
    if (pw.planetEnding || pw.confirm) {
      this.busy = true;
      const ok = await confirmDialog({
        title: `Unleash ${pw.name}?`,
        body: pw.planetEnding ? `${pw.description} This world will not survive — though time can be rewound.` : pw.description,
        okLabel: pw.planetEnding ? 'End it all' : 'Do it',
        danger: true,
      });
      this.busy = false;
      if (!ok) return;
    }
    let ok = false;
    try {
      const target = pw.targeting === 'global' ? {} : path && path.length ? { path, tile: path[0], point: hit?.point } : { tile: hit?.tile, point: hit?.point };
      ok = !!this.game.god.trigger(pw.id, target);
    } catch (e) {
      console.error('[tools] god power failed', pw.id, e);
    }
    if (ok) {
      if (pw.cooldown) this.cooldownUntil = performance.now() + pw.cooldown * 1000;
      const at = path?.length ? path[path.length - 1] : hit?.tile ?? -1;
      if (at >= 0) this.mgr.pulseAt(at, this.radius * 1.6, this.color);
      this.mgr.setHint(pw.flavor ?? `${pw.name} unleashed`);
      if (pw.planetEnding) setTimeout(() => this.mgr.current?.id === 'god' && this.mgr.select(null), 30);
    } else this.game.commands.feedback('The heavens hesitate', `${pw.name} can't be cast right now.`, 'info', 'god', null);
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!this.power) return;
    if (!hit && this.power.targeting !== 'global') return;
    void this.fire(hit, this.power.targeting === 'drag' && hit ? [hit.tile] : undefined);
  }

  override down(hit: PickResult | null): void {
    if (!hit || this.power?.targeting !== 'drag') return;
    this.dragging = true;
    this.path = [];
    this.last = -1;
    this.extend(hit.tile);
  }

  private extend(tile: number): void {
    const p = this.mgr.planet!;
    if (this.path.length >= Ribbon.MAX - 8) return;
    chainTiles(p, this.last, tile, this.path);
    this.last = tile;
    const v = this.mgr.visuals;
    if (!v) return;
    const n = pathPoints(p, this.path, 0.35, _pts);
    if (n >= 2) v.ribbon.set(_pts, n, null, 1.1, this.color);
    v.highlight('tool', this.path, this.color, 0.35);
    const end = this.path[this.path.length - 1];
    v.reticle.show(surfacePoint(p, end, 0.05, _v), tileNormal(p, end, _n), 1.6, this.color, false);
    this.mgr.showTag(end, this.power?.name ?? '', 'god', `${this.path.length} tiles`);
  }

  override move(hit: PickResult | null): void {
    if (!this.dragging || !hit || hit.tile === this.last) return;
    this.extend(hit.tile);
  }

  override up(hit: PickResult | null): void {
    if (!this.dragging) return;
    this.dragging = false;
    const path = this.path.slice();
    this.clear();
    if (path.length) void this.fire(hit, path);
  }

  override cancelStroke(): void {
    this.dragging = false;
    this.path = [];
    this.clear();
  }
}
