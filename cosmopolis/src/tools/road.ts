/**
 * OWNER: tools.
 * RoadTool — lay roads and rails. Drag A→B: an A* route (tools/pathing) that avoids buildings, water and cliffs and
 * prefers clean straight runs is previewed live as a glowing chevron ribbon with its length and price on a tag;
 * release to build. Phones: tap the start, then tap the end (a cyan reticle marks the anchor) — the road chains
 * from its end so a whole network can be tapped out; tap the anchor again or press ✕ / Esc to finish.
 * Kind: every registered road item (Path … Hyperloop; built-in fallbacks when none are registered). Upgrade mode
 * re-lays the kind along existing roads only. Sandbox routes may bridge water and climb any slope.
 */
import { Vector3 } from 'three';
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { allItems, getItem } from '../content/catalog';
import { RoadKind } from '../core/types';
import { findRoadPath, type RoadPathResult } from './pathing';
import { money, pathPoints, plural, surfacePoint } from './util';
import { Ribbon, TOOL_COLORS } from './visuals';
import { tileNormal } from '../world/geo';

const KIND_NAMES: Record<number, string> = {
  [RoadKind.Path]: 'Path',
  [RoadKind.Street]: 'Street',
  [RoadKind.Avenue]: 'Avenue',
  [RoadKind.Highway]: 'Highway',
  [RoadKind.Maglev]: 'Maglev',
  [RoadKind.Hyperloop]: 'Hyperloop',
};
const KIND_ICONS: Record<number, string> = {
  [RoadKind.Path]: 'navigate',
  [RoadKind.Street]: 'roads',
  [RoadKind.Avenue]: 'roads',
  [RoadKind.Highway]: 'traffic',
  [RoadKind.Maglev]: 'transit',
  [RoadKind.Hyperloop]: 'warp',
};
const RIBBON_WIDTH: Record<number, number> = { 1: 0.38, 2: 0.6, 3: 0.86, 4: 1.05, 5: 0.6, 6: 0.72 };

const _pts = new Float32Array(Ribbon.MAX * 3);
const _bad = new Float32Array(Ribbon.MAX);
const _v = new Vector3();
const _n = new Vector3();

export class RoadTool extends Tool {
  readonly id = 'road';
  kind: RoadKind = RoadKind.Street;
  private mode: 'build' | 'upgrade' = 'build';
  private anchor = -1;
  private dragging = false;
  private start = -1;
  private end = -1;
  private result: RoadPathResult | null = null;
  private resultKey = '';
  private hoverTile = -1;

  override get drawing(): boolean {
    return true;
  }
  override get placing(): boolean {
    return true;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    const def = state.itemId ? getItem(state.itemId) : undefined;
    this.kind = def?.road?.kind ?? (this.kinds()[0]?.kind ?? RoadKind.Street);
    if (!def?.road && this.kinds().some((k) => k.kind === RoadKind.Street)) this.kind = RoadKind.Street;
    this.mode = 'build';
    this.anchor = -1;
    this.dragging = false;
    this.result = null;
    this.resultKey = '';
  }

  override exit(): void {
    this.clear();
    this.mgr.visuals?.anchor.hide();
    this.anchor = -1;
  }

  /** Road kinds on offer: registered road items (best per kind), else built-in fallbacks. */
  private kinds(): { kind: RoadKind; name: string; icon: string; itemId?: string }[] {
    const by = new Map<number, { kind: RoadKind; name: string; icon: string; itemId?: string; tier: number }>();
    for (const d of allItems()) {
      if (!d.road || d.hidden) continue;
      const cur = by.get(d.road.kind);
      if (!cur || d.tier < cur.tier) by.set(d.road.kind, { kind: d.road.kind, name: d.name, icon: KIND_ICONS[d.road.kind] ?? 'roads', itemId: d.id, tier: d.tier });
    }
    if (!by.size) for (const k of [RoadKind.Path, RoadKind.Street, RoadKind.Avenue, RoadKind.Highway, RoadKind.Maglev, RoadKind.Hyperloop]) by.set(k, { kind: k, name: KIND_NAMES[k], icon: KIND_ICONS[k], tier: 0 });
    return [...by.values()].sort((a, b) => a.kind - b.kind);
  }

  private kindName(k = this.kind): string {
    return this.kinds().find((x) => x.kind === k)?.name ?? KIND_NAMES[k] ?? 'Road';
  }

  override hint(): string {
    if (this.mode === 'upgrade') return `Drag along a road to upgrade it to ${this.kindName()}`;
    if (this.anchor >= 0) return this.mgr.touch ? 'Tap where the road should go · tap the start again to finish' : 'Click the next point · Esc to finish';
    return this.mgr.touch ? `Drag to lay ${this.kindName()} · or tap start, then tap end` : `Drag to lay ${this.kindName()} · or click start, then click end`;
  }

  override options(): ToolOption[] {
    const kinds = this.kinds();
    const o: ToolOption[] = [];
    if (kinds.length > 1)
      o.push({
        id: 'kind',
        label: 'Type',
        type: 'choice',
        value: this.kind,
        choices: kinds.map((k) => ({ value: k.kind, label: k.name, icon: k.icon })),
      });
    o.push({
      id: 'mode',
      label: 'Mode',
      type: 'choice',
      value: this.mode,
      choices: [
        { value: 'build', label: 'Build', icon: 'plus' },
        { value: 'upgrade', label: 'Upgrade', icon: 'arrowUp' },
      ],
    });
    return o;
  }

  override setOption(id: string, value: unknown): void {
    if (id === 'kind') {
      this.kind = Number(value) as RoadKind;
      const lock = this.game.commands.roadLocked(this.kind);
      if (lock) this.game.commands.feedback(`${this.kindName()} is locked`, lock, 'info', 'lock');
    }
    if (id === 'mode') {
      this.mode = value === 'upgrade' ? 'upgrade' : 'build';
      this.anchor = -1;
      this.mgr.visuals?.anchor.hide();
    }
    this.resultKey = '';
    this.mgr.setHint(this.hint());
    if (this.dragging && this.start >= 0 && this.end >= 0) this.preview(this.start, this.end);
    else if (this.hoverTile >= 0) this.hoverAt(this.hoverTile);
  }

  private compute(a: number, b: number): RoadPathResult {
    const key = `${a}|${b}|${this.mode}|${this.kind}`;
    if (key === this.resultKey && this.result) return this.result;
    const sb = this.mgr.sandbox;
    this.result = findRoadPath(this.mgr.planet!, a, b, {
      water: sb || this.mode === 'upgrade',
      maxStep: sb ? 99 : 3,
      roadsOnly: this.mode === 'upgrade',
      maxNodes: 30000,
    });
    this.resultKey = key;
    return this.result;
  }

  private clear(): void {
    const v = this.mgr.visuals;
    v?.ribbon.hide();
    v?.highlight('tool', null);
    v?.highlight('tool-bad', null);
    this.mgr.hideTag();
    this.mgr.setCost(null);
  }

  private preview(a: number, b: number): void {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!p || !v) return;
    const r = this.compute(a, b);
    const blocked = new Set(r.blocked);
    const n = pathPoints(p, r.path, 0.2, _pts);
    for (let i = 0; i < n; i++) _bad[i] = blocked.has(r.path[i]) ? 1 : 0;
    const lock = this.game.commands.roadLocked(this.kind);
    const ok = r.ok && !lock;
    const color = this.mode === 'upgrade' ? TOOL_COLORS.violet : TOOL_COLORS.accent;
    if (n >= 2) v.ribbon.set(_pts, n, _bad, RIBBON_WIDTH[this.kind] ?? 0.6, ok ? color : TOOL_COLORS.bad);
    else v.ribbon.hide();
    const good = r.path.filter((t) => !blocked.has(t));
    v.highlight('tool', good, ok ? color : TOOL_COLORS.bad, 0.26);
    v.highlight('tool-bad', r.blocked.length ? r.blocked : null, TOOL_COLORS.bad, 0.62);
    const cmd = this.game.commands;
    const tiles = this.mode === 'upgrade' ? r.path.filter((t) => p.road[t] !== 0 && p.road[t] !== this.kind) : r.path;
    const cost = cmd.roadQuote(tiles, this.kind);
    const afford = this.game.empire.canAfford(cost);
    const reason = lock ?? (!r.ok ? r.reason : !afford ? `Needs ${money(cost)}` : undefined);
    this.mgr.setCost(cost, ok && afford, reason);
    const len = this.mode === 'upgrade' ? tiles.length : r.path.length;
    const label = ok ? (this.mode === 'upgrade' ? `${plural(len, 'tile')} to upgrade` : plural(len, 'tile')) : reason ?? 'Blocked';
    const sub = ok ? (cost > 0 ? `${money(cost)} · ${this.kindName()}` : this.kindName()) : '';
    surfacePoint(p, b, 0.5, _v);
    this.mgr.tag.set(_v, label, ok && afford ? 'ok' : 'bad', sub);
  }

  private hoverAt(tile: number): void {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!p || !v) return;
    if (this.anchor >= 0) {
      this.preview(this.anchor, tile);
      return;
    }
    v.ribbon.hide();
    v.highlight('tool-bad', null);
    const bad = this.mode === 'upgrade' ? p.road[tile] === 0 : p.building[tile] >= 0 || (p.isWater(tile) && !this.mgr.sandbox);
    v.highlight('tool', [tile], bad ? TOOL_COLORS.bad : this.mode === 'upgrade' ? TOOL_COLORS.violet : TOOL_COLORS.accent, 0.5);
    this.mgr.setCost(null);
    if (!this.mgr.touch) this.mgr.showTag(tile, this.kindName(), bad ? 'bad' : 'info', `${money(this.game.commands.roadCost(this.kind))} per tile`);
  }

  override hover(hit: PickResult | null): void {
    if (this.dragging) return;
    if (!hit) {
      this.hoverTile = -1;
      if (this.anchor < 0) this.clear();
      return;
    }
    if (hit.tile === this.hoverTile) return;
    this.hoverTile = hit.tile;
    this.hoverAt(hit.tile);
  }

  private showAnchor(): void {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!p || !v) return;
    if (this.anchor < 0) {
      v.anchor.hide();
      return;
    }
    v.anchor.show(surfacePoint(p, this.anchor, 0.05, _v), tileNormal(p, this.anchor, _n), 0.95, TOOL_COLORS.accent, false);
  }

  private commit(r: RoadPathResult): boolean {
    const cmd = this.game.commands;
    const lock = cmd.roadLocked(this.kind);
    if (lock) {
      cmd.feedback(`${this.kindName()} is locked`, lock, 'warn', 'lock');
      return false;
    }
    if (!r.ok) {
      cmd.feedback("Can't build that road", r.reason ?? 'Blocked', 'warn', 'roads');
      return false;
    }
    let ok: boolean;
    if (this.mode === 'upgrade') ok = cmd.upgradeRoad(r.path, this.kind) > 0;
    else ok = cmd.buildRoad(r.path, this.kind);
    if (ok) {
      const end = r.path[r.path.length - 1];
      this.mgr.pulseAt(end, 1.6, TOOL_COLORS.accent);
      if (r.path.length > 1) this.mgr.pulseAt(r.path[0], 1.2, TOOL_COLORS.accent);
      this.mgr.setHint(this.mode === 'upgrade' ? `Upgraded to ${this.kindName()}` : `${plural(r.path.length, 'tile')} of ${this.kindName()} laid`);
    }
    this.resultKey = '';
    return ok;
  }

  /** Tap-tap road building (phones) — also a desktop click without a drag. */
  private tapAt(tile: number): void {
    const p = this.mgr.planet;
    if (!p) return;
    if (this.mode === 'upgrade') {
      if (p.road[tile]) this.commit({ path: [tile], ok: true, blocked: [] });
      return;
    }
    if (this.anchor < 0) {
      this.anchor = tile;
      this.showAnchor();
      this.mgr.sfx('tap');
      this.mgr.setHint(this.hint());
      this.clear();
      return;
    }
    if (tile === this.anchor) {
      // finish; a lone tap on bare ground lays a single tile
      if (!p.road[tile] && p.building[tile] < 0) this.commit(this.compute(tile, tile));
      this.anchor = -1;
      this.showAnchor();
      this.clear();
      this.mgr.setHint(this.hint());
      return;
    }
    const r = this.compute(this.anchor, tile);
    if (this.commit(r)) {
      this.anchor = tile;
      this.showAnchor();
    }
    this.clear();
    this.hoverTile = -1;
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!hit) return;
    this.tapAt(hit.tile);
  }

  override down(hit: PickResult | null): void {
    if (!hit) return;
    this.dragging = true;
    this.start = this.anchor >= 0 ? this.anchor : hit.tile;
    this.end = hit.tile;
    if (this.start !== this.end) this.preview(this.start, this.end);
    else this.hoverAt(hit.tile);
  }

  override move(hit: PickResult | null): void {
    if (!this.dragging || !hit || hit.tile === this.end) return;
    this.end = hit.tile;
    this.preview(this.start, this.end);
  }

  override up(hit: PickResult | null): void {
    if (!this.dragging) return;
    this.dragging = false;
    const end = hit?.tile ?? this.end;
    if (end === this.start || end < 0) {
      // a click without a drag → tap-tap mode
      this.clear();
      if (end >= 0) this.tapAt(end);
      return;
    }
    const r = this.compute(this.start, end);
    const fromAnchor = this.anchor >= 0;
    if (this.commit(r) && fromAnchor) {
      this.anchor = end;
      this.showAnchor();
    }
    this.clear();
    this.hoverTile = -1;
  }

  override cancelStroke(): void {
    this.dragging = false;
    this.clear();
  }

  override escape(): boolean {
    if (this.dragging) {
      this.cancelStroke();
      return true;
    }
    if (this.anchor >= 0) {
      this.anchor = -1;
      this.showAnchor();
      this.clear();
      this.mgr.setHint(this.hint());
      return true;
    }
    return false;
  }
}
