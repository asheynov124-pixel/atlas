/**
 * OWNER: tools.
 * Commands — every player action with unlock checks (game.progression), validation (ops.checkPlace), money
 * (empire.spend; bulldozing something built TODAY refunds 75 %), feedback (sfx + gated toasts) and UNDO / REDO.
 * Tools and UI call these; god powers / sim call PlanetOps directly (and are therefore not undoable).
 *
 * Undo is a snapshot diff (tools/history.ts): each gesture is a group — `begin(label)` … `end()` — whose touched
 * tiles, buildings, props, orbitals, districts, sea level and building patches are captured before and after.
 * Commands called outside a group form their own one-command group. 50 steps per planet; switching planets
 * clears the stacks. `abort()` closes the open group and rolls it back (a pinch that interrupts a brush stroke).
 *
 * CONTRACT: place(defId, tile, rot, opts?), buildRoad(path, kind, opts?), zone(tiles, zone), bulldoze(tiles, opts?),
 *           terraform(tiles, mode, amount, opts?), paint(buildingId, tint), rename(buildingId, name),
 *           addProp(defId, tile, u, v, yaw, scale, tint?), removeProp(id), addOrbital(defId, params?),
 *           removeOrbital(id), createDistrict(name?, color?), paintDistrict(tiles, id), deleteDistrict(id),
 *           renameDistrict(id, name), setSeaLevel(level), move(buildingId, tile, rot), undo(), redo(),
 *           canUndo, canRedo, begin(label) / end() / abort(), check(defId, tile, rot, opts) (dry run with cost).
 */
import type { Game } from './Game';
import type { System } from './System';
import { getItem, allItems, type ItemDef } from '../content/catalog';
import { zoneInfo } from '../content/zones';
import { bus } from '../core/events';
import { notify, ui } from '../ui/store';
import { Biome, Feature, RoadKind, TileFlag, Zone, type SfxName, type StyleId } from '../core/types';
import { tileNormal } from '../world/geo';
import { MAX_LEVEL, MIN_LEVEL, type BuildingInstance, type District, type OrbitalInstance, type Planet, type PropInstance } from '../world/planet';
import type { PlanetOps } from '../world/ops';
import { deriveBiome } from '../world/planetgen';
import { Recorder, applySide, sidesDiffer, type HistoryEntry } from '../tools/history';
import { Vector3 } from 'three';

export type TerraformMode = 'raise' | 'lower' | 'level' | 'smooth' | 'biome' | 'forest' | 'clear' | 'deposit' | 'sea';
export type BulldozeFilter = 'all' | 'buildings' | 'roads' | 'nature';

export interface PlaceOpts {
  /** sandbox: ignore placement rules (road access, slope, terrain type…) */
  free?: boolean;
  /** sandbox: clear whatever is in the way */
  replace?: boolean;
  style?: StyleId;
  variant?: number;
  level?: number;
  /** no sound / no toast (drag-painting many) */
  quiet?: boolean;
}

export interface PlaceVerdict {
  ok: boolean;
  reason?: string;
  tiles: number[];
  blocked: number[];
  cost: number;
  /** placement will force through rule failures (sandbox free build) */
  forced: boolean;
}

export interface BulldozeResult {
  buildings: number;
  roads: number;
  props: number;
  nature: number;
  refund: number;
}

/** Fallback road prices per tile when the road item for a kind is not registered. */
const ROAD_FALLBACK_COST: Record<number, number> = {
  [RoadKind.Path]: 20,
  [RoadKind.Street]: 60,
  [RoadKind.Avenue]: 140,
  [RoadKind.Highway]: 380,
  [RoadKind.Maglev]: 650,
  [RoadKind.Hyperloop]: 1600,
};
const ROAD_FALLBACK_TIER: Record<number, number> = {
  [RoadKind.Path]: 0,
  [RoadKind.Street]: 0,
  [RoadKind.Avenue]: 1,
  [RoadKind.Highway]: 3,
  [RoadKind.Maglev]: 4,
  [RoadKind.Hyperloop]: 6,
};
/** credits per tile and step */
const TERRAFORM_COST: Record<TerraformMode, number> = { raise: 30, lower: 30, level: 30, smooth: 20, biome: 8, forest: 14, clear: 5, deposit: 0, sea: 0 };
const NATURE = new Set<number>([Feature.Trees, Feature.DenseTrees, Feature.Flowers, Feature.AlienFlora, Feature.Rocks, Feature.Rubble, Feature.Kelp, Feature.Crater]);
const MAX_HISTORY = 50;

const _v = new Vector3();

export class Commands implements System {
  canUndo = false;
  canRedo = false;
  /** label of the next undo / redo (for tooltips) */
  undoLabel: string | null = null;
  redoLabel: string | null = null;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private rec: Recorder | null = null;
  private depth = 0;
  private label = '';
  private gate = new Map<string, number>();
  private sfxGate = new Map<string, number>();
  /** session-only record of roads laid (tile → day, price) for same-day refunds */
  private roadLaid = new Map<number, { day: number; cost: number }>();
  private offs: (() => void)[] = [];

  constructor(private game: Game) {}

  init(): void {
    this.offs.push(bus.on('planet:unloading', () => this.clearHistory()));
  }

  onPlanetLoaded(): void {
    this.clearHistory();
  }

  dispose(): void {
    this.offs.forEach((f) => f());
  }

  // ─────────────────────────────────────────────── grouping

  /** Open (or nest into) a gesture group. */
  begin(label: string): void {
    if (this.depth++ === 0) {
      const p = this.game.planet;
      this.rec = p ? new Recorder(p) : null;
      this.label = label;
    }
  }

  /** Close the current group; returns the recorded entry (null when nothing changed). */
  end(): HistoryEntry | null {
    if (this.depth === 0) return null;
    if (--this.depth > 0) return null;
    const rec = this.rec;
    this.rec = null;
    const p = this.game.planet;
    if (!rec || !p || rec.planet !== p || rec.empty) return null;
    const entry = rec.finish(this.label, p.spec.id);
    if (!sidesDiffer(entry.before, entry.after) && entry.money === 0) return null;
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.splice(0, this.undoStack.length - MAX_HISTORY);
    this.redoStack.length = 0;
    this.sync();
    return entry;
  }

  /** Close the current group and roll it back (refunding its spending). */
  abort(): void {
    if (this.depth === 0) return;
    const rec = this.rec;
    this.rec = null;
    this.depth = 0;
    const p = this.game.planet;
    const ops = this.game.ops;
    if (!rec || !p || !ops || rec.planet !== p || rec.empty) return;
    const entry = rec.finish(this.label, p.spec.id);
    try {
      applySide(ops, entry.before, entry.after);
    } catch (e) {
      console.error('[commands] abort restore failed', e);
    }
    if (entry.money) this.game.empire.earn(entry.money);
  }

  get grouping(): boolean {
    return this.depth > 0;
  }

  private group<T>(label: string, fn: (rec: Recorder | null) => T): T {
    this.begin(label);
    try {
      return fn(this.rec);
    } finally {
      this.end();
    }
  }

  // ─────────────────────────────────────────────── undo / redo

  undo(): boolean {
    if (this.depth > 0) {
      this.depth = 1;
      this.end();
    }
    const e = this.undoStack.pop();
    if (!e) return false;
    const ok = this.restore(e, 'undo');
    if (ok) this.redoStack.push(e);
    this.sync();
    return ok;
  }

  redo(): boolean {
    if (this.depth > 0) {
      this.depth = 1;
      this.end();
    }
    const e = this.redoStack.pop();
    if (!e) return false;
    const ok = this.restore(e, 'redo');
    if (ok) this.undoStack.push(e);
    else this.redoStack.push(e);
    this.sync();
    return ok;
  }

  clearHistory(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.rec = null;
    this.depth = 0;
    this.roadLaid.clear();
    this.sync();
  }

  /** Number of steps available (tests / UI). */
  get historySize(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  private restore(e: HistoryEntry, dir: 'undo' | 'redo'): boolean {
    const g = this.game;
    const ops = g.ops;
    if (!ops || !g.planet || g.planet.spec.id !== e.planetId) {
      this.clearHistory();
      return false;
    }
    if (dir === 'redo' && e.money > 0 && !g.empire.spend(e.money)) {
      this.feedback('Not enough credits', `Redoing “${e.label}” costs ₡${Math.round(e.money).toLocaleString()}`, 'bad', 'money');
      return false;
    }
    try {
      if (dir === 'undo') applySide(ops, e.before, e.after);
      else applySide(ops, e.after, e.before);
    } catch (err) {
      console.error(`[commands] ${dir} failed`, err);
      return false;
    }
    // money > 0: the gesture spent credits (undo refunds them); money < 0: it earned a refund (undo claws it back)
    if (dir === 'undo') g.empire.earn(e.money);
    else if (e.money < 0) g.empire.earn(-e.money);
    this.sfx(dir === 'undo' ? 'rewind' : 'whoosh', 0, 0.55);
    this.revealChange(e.focus);
    return true;
  }

  /** If the change happened off screen, glide the camera over to it. */
  private revealChange(tile: number): void {
    const g = this.game;
    const p = g.planet;
    if (!p || tile < 0) return;
    try {
      tileNormal(p, tile, _v);
      const cam = g.camera;
      if (_v.dot(cam.target) < Math.cos(Math.max(0.06, (cam.distance / p.radius) * 0.35)) && typeof cam.flyTo === 'function') void cam.flyTo(tile, {});
    } catch {
      /* camera optional */
    }
  }

  private sync(): void {
    this.canUndo = this.undoStack.length > 0;
    this.canRedo = this.redoStack.length > 0;
    this.undoLabel = this.undoStack[this.undoStack.length - 1]?.label ?? null;
    this.redoLabel = this.redoStack[this.redoStack.length - 1]?.label ?? null;
    ui.canUndo.value = this.canUndo;
    ui.canRedo.value = this.canRedo;
  }

  // ─────────────────────────────────────────────── feedback helpers

  /** Toast (gated: the same message at most every 2.5 s) + error sound. */
  feedback(title: string, body?: string, kind: 'warn' | 'bad' | 'info' | 'good' = 'warn', icon = 'alert', sound: SfxName | null = 'error'): void {
    const key = title + '|' + (body ?? '');
    const now = performance.now();
    const last = this.gate.get(key) ?? -1e9;
    if (sound) this.sfx(sound, 0.25);
    if (now - last < 2500) return;
    this.gate.set(key, now);
    notify({ title, body, kind, icon });
  }

  /** Play a sound at most once per `minGap` seconds per name. */
  sfx(name: SfxName, minGap = 0.08, volume?: number, pitch?: number): void {
    const now = performance.now() / 1000;
    if (now - (this.sfxGate.get(name) ?? -1) < minGap) return;
    this.sfxGate.set(name, now);
    try {
      const a = this.game.audio;
      if (a && typeof a.sfx === 'function') a.sfx(name, volume !== undefined || pitch !== undefined ? { volume, pitch } : undefined);
    } catch {
      /* audio optional */
    }
  }

  private get today(): number {
    return Math.floor(this.game.clock.day);
  }

  private get sandbox(): boolean {
    return this.game.empire.sandbox;
  }

  private unlocked(def: ItemDef): boolean {
    try {
      return this.game.progression.isItemUnlocked(def);
    } catch {
      return true;
    }
  }

  private lockReason(def: ItemDef): string {
    try {
      return this.game.progression.lockReason(def) ?? 'Not unlocked yet';
    } catch {
      return 'Not unlocked yet';
    }
  }

  private spend(cost: number, what: string): boolean {
    if (cost <= 0) return true;
    if (this.game.empire.spend(cost)) {
      if (this.rec) this.rec.money += cost;
      return true;
    }
    this.feedback('Not enough credits', `${what} costs ₡${Math.round(cost).toLocaleString()} — you have ₡${Math.floor(this.game.empire.money).toLocaleString()}`, 'bad', 'money');
    return false;
  }

  private refund(amount: number): void {
    if (amount <= 0 || this.sandbox) return;
    this.game.empire.earn(amount);
    if (this.rec) this.rec.money -= amount;
  }

  // ─────────────────────────────────────────────── buildings

  /** Dry-run a placement (ghost previews): validation, sandbox overrides and price. */
  check(defId: string, tile: number, rot = 0, o: PlaceOpts = {}): PlaceVerdict {
    const g = this.game;
    const def = getItem(defId);
    const none: PlaceVerdict = { ok: false, reason: 'Unknown item', tiles: [], blocked: [], cost: 0, forced: false };
    if (!def || !g.ops || !g.planet) return none;
    const cost = this.sandbox ? 0 : def.cost;
    if (!this.unlocked(def)) return { ok: false, reason: this.lockReason(def), tiles: g.planet.grid.footprint(tile, def.footprint), blocked: [], cost, forced: false };
    const c = g.ops.checkPlace(defId, tile, rot);
    if (c.ok) {
      if (!g.empire.canAfford(def.cost)) return { ok: false, reason: `Needs ₡${def.cost.toLocaleString()}`, tiles: c.tiles, blocked: [], cost, forced: false };
      return { ok: true, tiles: c.tiles, blocked: c.blocked, cost, forced: false };
    }
    if (this.sandbox && c.tiles.length) {
      const lockedTile = c.tiles.some((t) => g.planet!.flags[t] & TileFlag.Locked);
      if (c.blocked.length && o.replace && !lockedTile) return { ok: true, tiles: c.tiles, blocked: c.blocked, cost, forced: true, reason: 'Replaces what is there' };
      if (!c.blocked.length && o.free && !lockedTile) return { ok: true, tiles: c.tiles, blocked: [], cost, forced: true, reason: c.reason };
    }
    return { ok: false, reason: c.reason, tiles: c.tiles, blocked: c.blocked, cost, forced: false };
  }

  place(defId: string, tile: number, rot = 0, o: PlaceOpts = {}): BuildingInstance | null {
    const g = this.game;
    const def = getItem(defId);
    if (!def || !g.ops || !g.planet) return null;
    if (def.placement === 'orbit') {
      this.addOrbital(defId);
      return null;
    }
    if (!this.unlocked(def)) {
      this.feedback(`${def.name} is locked`, this.lockReason(def), 'warn', 'lock');
      return null;
    }
    const v = this.check(defId, tile, rot, o);
    if (!v.ok) {
      if (!o.quiet || v.reason?.startsWith('Needs ₡')) this.feedback("Can't build here", friendlyReason(v.reason), 'warn', 'alert');
      return null;
    }
    return this.group(`Build ${def.name}`, (rec) => {
      if (!this.spend(def.cost, def.name)) return null;
      rec?.touch(g.planet!.grid.footprint(tile, def.footprint));
      const b = g.ops!.placeBuilding(defId, tile, rot, { day: this.today, force: v.forced, style: o.style, variant: o.variant, level: o.level });
      if (!b) {
        this.refund(def.cost);
        if (!o.quiet) this.feedback("Can't build here", 'Something got in the way', 'warn');
        return null;
      }
      if (!o.quiet) this.sfx(def.footprint > 1 ? 'placeBig' : 'place');
      else this.sfx('place', 0.09, 0.6, 0.9 + Math.random() * 0.25);
      return b;
    });
  }

  /** Relocate a building (keeps id, level, style, tint, name). */
  move(buildingId: number, tile: number, rot = 0, o: PlaceOpts = {}): boolean {
    const g = this.game;
    const p = g.planet;
    const ops = g.ops;
    const b = p?.buildings.get(buildingId);
    if (!p || !ops || !b) return false;
    const def = getItem(b.defId);
    if (!def) return false;
    if (b.tile === tile && b.rot === rot) return false;
    return this.group(`Move ${b.name ?? def.name}`, (rec) => {
      const target = p.grid.footprint(tile, def.footprint);
      rec?.touch(b.tiles);
      rec?.touch(target);
      const snapshot = { ...b, tiles: b.tiles.slice() };
      ops.removeBuilding(b.id, 'replace');
      const c = ops.checkPlace(b.defId, tile, rot);
      const free = this.sandbox && (o.free || o.replace);
      if (!c.ok && !(free && (!c.blocked.length || o.replace))) {
        ops.placeBuilding(snapshot.defId, snapshot.tile, snapshot.rot, { force: true, autoLevel: false, id: snapshot.id, level: snapshot.level, variant: snapshot.variant, style: snapshot.style, state: snapshot.state, tint: snapshot.tint, name: snapshot.name, day: snapshot.builtDay });
        this.feedback("Can't move it there", friendlyReason(c.reason), 'warn');
        return false;
      }
      const nb = ops.placeBuilding(snapshot.defId, tile, rot, { force: !c.ok, id: snapshot.id, level: snapshot.level, variant: snapshot.variant, style: snapshot.style, state: snapshot.state, tint: snapshot.tint, name: snapshot.name, day: snapshot.builtDay });
      if (!nb) return false;
      this.sfx(def.footprint > 1 ? 'placeBig' : 'place');
      return true;
    });
  }

  paint(buildingId: number, tint: number | undefined): boolean {
    const g = this.game;
    const b = g.planet?.buildings.get(buildingId);
    if (!b || !g.ops) return false;
    if (b.tint === tint) return false;
    return this.group('Paint', (rec) => {
      rec?.touchPatch(buildingId, ['tint']);
      g.ops!.updateBuilding(buildingId, { tint });
      this.sfx('paint', 0.07);
      return true;
    });
  }

  rename(buildingId: number, name: string): boolean {
    const g = this.game;
    const b = g.planet?.buildings.get(buildingId);
    if (!b || !g.ops) return false;
    const n = name.trim().slice(0, 40) || undefined;
    if (b.name === n) return false;
    return this.group('Rename', (rec) => {
      rec?.touchPatch(buildingId, ['name']);
      g.ops!.updateBuilding(buildingId, { name: n });
      return true;
    });
  }

  /** Change a placed building's architectural style (styleable items). */
  restyle(buildingId: number, style: StyleId): boolean {
    const g = this.game;
    const b = g.planet?.buildings.get(buildingId);
    if (!b || !g.ops || b.style === style) return false;
    return this.group('Restyle', (rec) => {
      rec?.touchPatch(buildingId, ['style']);
      g.ops!.updateBuilding(buildingId, { style });
      this.sfx('magic', 0.1);
      return true;
    });
  }

  // ─────────────────────────────────────────────── roads

  /** The road item that lays `kind` (lowest tier first), if registered. */
  roadItem(kind: RoadKind): ItemDef | undefined {
    let best: ItemDef | undefined;
    for (const d of allItems()) if (d.road?.kind === kind && (!best || d.tier < best.tier || (d.tier === best.tier && d.hidden && !best.hidden))) best = d;
    return best;
  }

  /** Price per tile of a road kind. */
  roadCost(kind: RoadKind): number {
    const d = this.roadItem(kind);
    return d ? d.cost : ROAD_FALLBACK_COST[kind] ?? 60;
  }

  /** Cost of laying `kind` on these tiles (only tiles that change; upgrades get a 50 % trade-in). */
  roadQuote(path: number[], kind: RoadKind): number {
    const p = this.game.planet;
    if (!p || this.sandbox) return 0;
    const per = this.roadCost(kind);
    let cost = 0;
    for (const t of new Set(path)) {
      const cur = p.road[t];
      if (cur === kind || p.building[t] >= 0) continue;
      cost += cur ? Math.max(0, per - this.roadCost(cur) * 0.5) : per;
      if (p.isWater(t)) cost += per * 2;
    }
    return Math.round(cost);
  }

  roadLocked(kind: RoadKind): string | null {
    const d = this.roadItem(kind);
    if (d) return this.unlocked(d) ? null : this.lockReason(d);
    if (this.sandbox) return null;
    const tier = ROAD_FALLBACK_TIER[kind] ?? 0;
    return this.game.empire.s.tier >= tier ? null : `Reach tier ${tier}`;
  }

  buildRoad(path: number[], kind: RoadKind, o: { force?: boolean; quiet?: boolean } = {}): boolean {
    const g = this.game;
    const p = g.planet;
    if (!p || !g.ops || !path.length || kind === RoadKind.None) return false;
    const lock = this.roadLocked(kind);
    if (lock) {
      this.feedback('Road type locked', lock, 'warn', 'lock');
      return false;
    }
    const cost = this.roadQuote(path, kind);
    const def = this.roadItem(kind);
    const name = def?.name ?? RoadKind[kind];
    return this.group(`Build ${name}`, (rec) => {
      if (!this.spend(cost, `${path.length} tiles of ${name}`)) return false;
      rec?.touch(path);
      const touched = g.ops!.buildRoad(path, kind, !!o.force && this.sandbox);
      if (!touched.length) {
        this.refund(cost);
        return false;
      }
      const per = path.length ? cost / path.length : 0;
      for (const t of path) this.roadLaid.set(t, { day: this.today, cost: per });
      if (!o.quiet) this.sfx('road');
      return true;
    });
  }

  /** Change the kind of existing road tiles without adding links. */
  upgradeRoad(tiles: number[], kind: RoadKind): number {
    const g = this.game;
    const p = g.planet;
    if (!p || !g.ops) return 0;
    const list = tiles.filter((t) => p.road[t] !== 0 && p.road[t] !== kind);
    if (!list.length) return 0;
    const lock = this.roadLocked(kind);
    if (lock) {
      this.feedback('Road type locked', lock, 'warn', 'lock');
      return 0;
    }
    const cost = this.roadQuote(list, kind);
    return this.group('Upgrade road', (rec) => {
      if (!this.spend(cost, 'Upgrade')) return 0;
      rec?.touch(list);
      const changed: number[] = [];
      for (const t of list) {
        p.road[t] = kind;
        changed.push(t);
      }
      bus.emit('tiles:road', { tiles: changed });
      this.sfx('road');
      return changed.length;
    });
  }

  // ─────────────────────────────────────────────── zones & districts

  /** Can this tile take zoning? */
  zonable(t: number): boolean {
    const p = this.game.planet;
    if (!p || p.isWater(t) || p.road[t] !== 0 || p.flags[t] & TileFlag.Locked) return false;
    const bid = p.building[t];
    if (bid < 0) return true;
    const b = p.buildings.get(bid);
    return !!(b && getItem(b.defId)?.growable);
  }

  zoneLocked(zone: Zone): string | null {
    if (zone === Zone.None || this.sandbox) return null;
    const info = zoneInfo(zone);
    const def = info ? getItem(`zone_${info.short.toLowerCase()}`) : undefined;
    if (def) return this.unlocked(def) ? null : this.lockReason(def);
    return info && info.tier > this.game.empire.s.tier ? `Reach tier ${info.tier}` : null;
  }

  zone(tiles: number[], zone: Zone, o: { quiet?: boolean } = {}): number[] {
    const g = this.game;
    if (!g.ops || !g.planet) return [];
    const lock = this.zoneLocked(zone);
    if (lock) {
      this.feedback(`${zoneInfo(zone)?.name ?? 'Zone'} is locked`, lock, 'warn', 'lock');
      return [];
    }
    const valid = tiles.filter((t) => this.zonable(t) && g.planet!.zone[t] !== zone);
    if (!valid.length) return [];
    return this.group(zone === Zone.None ? 'De-zone' : `Zone ${zoneInfo(zone)?.short ?? ''}`, (rec) => {
      rec?.touch(valid);
      const changed = g.ops!.setZone(valid, zone);
      if (changed.length && !o.quiet) this.sfx('zone', 0.06);
      return changed;
    });
  }

  createDistrict(name?: string, color?: number, style?: StyleId): District | null {
    const g = this.game;
    const p = g.planet;
    if (!p || !g.ops) return null;
    return this.group('New district', (rec) => {
      rec?.touchDistricts();
      try {
        const d = g.ops!.createDistrict(name ?? districtName(p.districts), color ?? districtColor(p.districts), style);
        this.sfx('chime', 0.1);
        return d;
      } catch (e) {
        this.feedback('No room for more districts', String((e as Error).message ?? e));
        return null;
      }
    });
  }

  paintDistrict(tiles: number[], id: number): number {
    const g = this.game;
    const p = g.planet;
    if (!p || !g.ops) return 0;
    if (id > 0 && !p.districts[id]) return 0;
    const list = tiles.filter((t) => p.district[t] !== id);
    if (!list.length) return 0;
    return this.group(id ? `Paint ${p.districts[id].name}` : 'Erase district', (rec) => {
      rec?.touch(list);
      rec?.touchDistricts();
      g.ops!.setDistrict(list, id);
      this.sfx('zone', 0.06, 0.7, 1.15);
      return list.length;
    });
  }

  deleteDistrict(id: number): void {
    const g = this.game;
    const p = g.planet;
    if (!p || !g.ops || id <= 0 || !p.districts[id]) return;
    this.group(`Delete ${p.districts[id].name}`, (rec) => {
      const tiles: number[] = [];
      for (let t = 0; t < p.count; t++) if (p.district[t] === id) tiles.push(t);
      rec?.touch(tiles);
      rec?.touchDistricts();
      g.ops!.deleteDistrict(id);
    });
  }

  renameDistrict(id: number, name: string): void {
    const g = this.game;
    const p = g.planet;
    const d = p?.districts[id];
    if (!p || !d || id <= 0) return;
    const n = name.trim().slice(0, 32);
    if (!n || n === d.name) return;
    this.group('Rename district', (rec) => {
      rec?.touchDistricts();
      d.name = n;
      const tiles: number[] = [];
      for (let t = 0; t < p.count; t++) if (p.district[t] === id) tiles.push(t);
      if (tiles.length) bus.emit('tiles:district', { tiles });
    });
  }

  // ─────────────────────────────────────────────── demolition

  /** What a bulldoze would hit (previews / confirmation). */
  bulldozeQuote(tiles: number[], filter: BulldozeFilter = 'all'): { buildings: BuildingInstance[]; roads: number; props: number; nature: number; refund: number; value: number } {
    const p = this.game.planet;
    const out = { buildings: [] as BuildingInstance[], roads: 0, props: 0, nature: 0, refund: 0, value: 0 };
    if (!p) return out;
    const set = new Set(tiles);
    if (filter === 'all' || filter === 'buildings') {
      const seen = new Set<number>();
      for (const t of tiles) {
        const id = p.building[t];
        if (id < 0 || seen.has(id)) continue;
        seen.add(id);
        const b = p.buildings.get(id);
        if (!b) continue;
        out.buildings.push(b);
        const def = getItem(b.defId);
        const cost = def?.cost ?? 0;
        out.value += cost;
        if (b.builtDay === this.today && !def?.growable) out.refund += cost * 0.75;
      }
    }
    if (filter === 'all' || filter === 'roads')
      for (const t of tiles)
        if (p.road[t]) {
          out.roads++;
          const laid = this.roadLaid.get(t);
          if (laid && laid.day === this.today) out.refund += laid.cost * 0.75;
        }
    if (filter === 'all' || filter === 'nature') for (const pr of p.props.values()) if (set.has(pr.tile)) out.props++;
    if (filter === 'nature') for (const t of tiles) if (NATURE.has(p.feature[t]) && p.building[t] < 0) out.nature++;
    if (filter === 'all') for (const t of tiles) if (p.feature[t] === Feature.Rubble) out.nature++;
    if (this.sandbox) out.refund = 0;
    out.refund = Math.round(out.refund);
    return out;
  }

  bulldoze(tiles: number[], o: { filter?: BulldozeFilter; quiet?: boolean } = {}): BulldozeResult {
    const g = this.game;
    const p = g.planet;
    const ops = g.ops;
    const res: BulldozeResult = { buildings: 0, roads: 0, props: 0, nature: 0, refund: 0 };
    if (!p || !ops || !tiles.length) return res;
    const filter = o.filter ?? 'all';
    const q = this.bulldozeQuote(tiles, filter);
    if (!q.buildings.length && !q.roads && !q.props && !q.nature) return res;
    return this.group('Bulldoze', (rec) => {
      rec?.touch(tiles);
      let big = false;
      for (const b of q.buildings) {
        if ((getItem(b.defId)?.footprint ?? 1) > 1) big = true;
        if (ops.removeBuilding(b.id, 'bulldoze')) res.buildings++;
      }
      if (filter === 'all' || filter === 'roads') {
        const roads = tiles.filter((t) => p.road[t] !== 0);
        if (roads.length) {
          ops.removeRoad(roads);
          res.roads = roads.length;
          for (const t of roads) this.roadLaid.delete(t);
        }
      }
      if (filter === 'all' || filter === 'nature') {
        const set = new Set(tiles);
        for (const pr of [...p.props.values()]) if (set.has(pr.tile) && ops.removeProp(pr.id)) res.props++;
      }
      const clearFeat = tiles.filter((t) => p.building[t] < 0 && (filter === 'nature' ? NATURE.has(p.feature[t]) : filter === 'all' && p.feature[t] === Feature.Rubble));
      if (clearFeat.length) {
        ops.setFeature(clearFeat, Feature.None);
        res.nature = clearFeat.length;
      }
      res.refund = q.refund;
      this.refund(q.refund);
      if (!o.quiet) this.sfx(big || res.buildings > 3 ? 'demolish' : 'bulldoze');
      if (q.refund > 0 && !o.quiet) this.sfx('money', 0.3, 0.5);
      return res;
    });
  }

  // ─────────────────────────────────────────────── terrain

  /** Credits for a terraform step on `n` tiles. */
  terraformQuote(mode: TerraformMode, n: number, amount = 1): number {
    if (this.sandbox) return 0;
    return Math.round((TERRAFORM_COST[mode] ?? 0) * n * Math.max(1, Math.abs(amount)));
  }

  /** Can terraforming touch this tile? (buildings / roads only with sandbox force) */
  terraformable(t: number, force = false): boolean {
    const p = this.game.planet;
    if (!p) return false;
    if (p.flags[t] & TileFlag.Locked) return false;
    if (force && this.sandbox) return true;
    return p.building[t] < 0 && p.road[t] === 0;
  }

  /**
   * Terraform. raise / lower: `amount` levels · level: absolute level `amount` · smooth: one step toward the
   * neighbour average · biome: opts.biome · forest: plant trees · clear: strip natural features ·
   * deposit (sandbox): opts.feature · sea (sandbox): sea level += amount. Returns changed tiles.
   */
  terraform(tiles: number[], mode: TerraformMode, amount = 1, o: { force?: boolean; biome?: Biome; feature?: Feature; quiet?: boolean } = {}): number[] {
    const g = this.game;
    const p = g.planet;
    const ops = g.ops;
    if (!p || !ops) return [];
    if ((mode === 'deposit' || mode === 'sea') && !this.sandbox) {
      this.feedback('Sandbox only', mode === 'sea' ? 'Moving the oceans is a privilege of the sandbox gods.' : 'Conjuring deposits is a sandbox power.', 'info', 'lock');
      return [];
    }
    if (mode === 'sea') {
      this.setSeaLevel(p.seaOffset + amount);
      return [];
    }
    const force = !!o.force && this.sandbox;
    let list = tiles.filter((t) => this.terraformable(t, force));
    if (mode === 'forest') list = list.filter((t) => !p.isWater(t) && p.building[t] < 0 && p.road[t] === 0 && p.feature[t] !== Feature.DenseTrees);
    if (mode === 'clear') list = list.filter((t) => NATURE.has(p.feature[t]));
    if (mode === 'deposit') list = list.filter((t) => p.building[t] < 0 && p.road[t] === 0 && p.feature[t] !== o.feature);
    if (mode === 'biome') list = list.filter((t) => o.biome !== undefined && p.biome[t] !== o.biome);
    if (!list.length) return [];
    // compute target levels for elevation modes
    let levels: number[] | null = null;
    if (mode === 'raise' || mode === 'lower' || mode === 'level' || mode === 'smooth') {
      const d = mode === 'lower' ? -Math.abs(amount) : Math.abs(amount);
      levels = list.map((t) => {
        const e = p.elevation[t];
        if (mode === 'raise' || mode === 'lower') return clampLevel(e + d);
        if (mode === 'level') return clampLevel(Math.round(amount));
        let s = 0, n = 0;
        for (const q of p.grid.neighbors(t)) {
          s += p.elevation[q];
          n++;
        }
        const avg = s / Math.max(1, n);
        return clampLevel(Math.abs(avg - e) < 0.6 ? e : e + Math.sign(avg - e));
      });
      const keep: number[] = [];
      const keepLv: number[] = [];
      list.forEach((t, i) => {
        if (levels![i] !== p.elevation[t]) {
          keep.push(t);
          keepLv.push(levels![i]);
        }
      });
      list = keep;
      levels = keepLv;
      if (!list.length) return [];
    }
    const cost = this.terraformQuote(mode, list.length);
    return this.group('Terraform', (rec) => {
      if (!this.spend(cost, 'Terraforming')) return [];
      rec?.touch(list);
      let changed: number[] = [];
      switch (mode) {
        case 'raise':
        case 'lower':
        case 'level':
        case 'smooth': {
          if (force) {
            for (const t of list) if (p.building[t] >= 0) ops.removeBuilding(p.building[t], 'terraform');
            const roads = list.filter((t) => p.road[t] !== 0);
            if (roads.length) ops.removeRoad(roads);
          }
          changed = ops.setElevation(list, levels!);
          rebiome(p, ops, changed);
          if (!o.quiet) this.sfx('terraform', 0.11, 0.8, mode === 'lower' ? 0.85 : 1.1);
          break;
        }
        case 'biome':
          ops.setBiome(list, o.biome!);
          changed = list;
          if (!o.quiet) this.sfx('paint', 0.1, 0.6);
          break;
        case 'forest': {
          const dense = list.filter((t) => p.feature[t] === Feature.Trees);
          const light = list.filter((t) => p.feature[t] !== Feature.Trees);
          if (dense.length) ops.setFeature(dense, Feature.DenseTrees);
          if (light.length) ops.setFeature(light, p.spec.type === 'terran' || p.spec.type === 'jungle' || p.spec.type === 'tundra' ? Feature.Trees : Feature.AlienFlora);
          changed = list;
          if (!o.quiet) this.sfx('magic', 0.12, 0.45);
          break;
        }
        case 'clear':
          ops.setFeature(list, Feature.None);
          changed = list;
          if (!o.quiet) this.sfx('bulldoze', 0.12, 0.6);
          break;
        case 'deposit':
          ops.setFeature(list, o.feature ?? Feature.Ore);
          changed = list;
          if (!o.quiet) this.sfx('magic', 0.12);
          break;
      }
      return changed;
    });
  }

  /** Sandbox: global sea level (in terrace levels). */
  setSeaLevel(level: number): void {
    const g = this.game;
    const p = g.planet;
    if (!p || !g.ops) return;
    if (!this.sandbox) {
      this.feedback('Sandbox only', 'Moving the oceans is a privilege of the sandbox gods.', 'info', 'lock');
      return;
    }
    if (!p.spec.hasOcean) {
      this.feedback('No ocean here', 'This world is bone dry — there is no sea to raise.', 'info', 'water');
      return;
    }
    const v = clampLevel(Math.round(level));
    if (v === p.seaOffset) return;
    this.group(v > p.seaOffset ? 'Raise the seas' : 'Lower the seas', (rec) => {
      rec?.touchSea();
      g.ops!.setSeaOffset(v);
      this.sfx(v > p.seaOffset ? 'water' : 'splash', 0.15);
    });
  }

  // ─────────────────────────────────────────────── props & orbitals

  addProp(defId: string, tile: number, u = 0, v = 0, yaw = 0, scale = 1, tint?: number, o: { quiet?: boolean } = {}): PropInstance | null {
    const g = this.game;
    const p = g.planet;
    const def = getItem(defId);
    if (!p || !g.ops || !def) return null;
    if (!this.unlocked(def)) {
      this.feedback(`${def.name} is locked`, this.lockReason(def), 'warn', 'lock');
      return null;
    }
    return this.group(`Place ${def.name}`, (rec) => {
      if (!this.spend(def.cost, def.name)) return null;
      rec?.touch([tile]);
      const pr = g.ops!.addProp(defId, tile, u, v, yaw, scale, tint);
      if (!pr) {
        this.refund(def.cost);
        return null;
      }
      this.sfx('place', o.quiet ? 0.09 : 0.03, o.quiet ? 0.45 : 0.7, 1.15 + Math.random() * 0.3);
      return pr;
    });
  }

  removeProp(id: number): boolean {
    const g = this.game;
    const pr = g.planet?.props.get(id);
    if (!pr || !g.ops) return false;
    return this.group('Remove prop', (rec) => {
      rec?.touch([pr.tile]);
      g.ops!.removeProp(id);
      this.sfx('bulldoze', 0.05, 0.5);
      return true;
    });
  }

  addOrbital(defId: string, params: Partial<Omit<OrbitalInstance, 'id' | 'defId'>> = {}): OrbitalInstance | null {
    const g = this.game;
    const p = g.planet;
    const def = getItem(defId);
    if (!p || !g.ops || !def) return null;
    if (!this.unlocked(def)) {
      this.feedback(`${def.name} is locked`, this.lockReason(def), 'warn', 'lock');
      return null;
    }
    if (def.unique) for (const o of p.orbitals.values()) if (o.defId === defId) {
      this.feedback('Only one allowed', `${def.name} already circles this world.`, 'info', 'orbital');
      return null;
    }
    return this.group(`Launch ${def.name}`, (rec) => {
      if (!this.spend(def.cost, def.name)) return null;
      const o = g.ops!.addOrbital(defId, params);
      if (!o) {
        this.refund(def.cost);
        return null;
      }
      rec?.touchOrbital(o.id, true);
      return o;
    });
  }

  removeOrbital(id: number): boolean {
    const g = this.game;
    if (!g.planet?.orbitals.has(id) || !g.ops) return false;
    return this.group('Deorbit', (rec) => {
      rec?.touchOrbital(id);
      g.ops!.removeOrbital(id);
      this.sfx('whoosh', 0.1);
      return true;
    });
  }
}

// ─────────────────────────────────────────────── helpers

function clampLevel(v: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(v)));
}

/** After an elevation change, let terrain choose what the ground should look like now (grouped by result). */
function rebiome(p: Planet, ops: PlanetOps, tiles: number[]): void {
  if (!tiles.length) return;
  const groups = new Map<number, number[]>();
  for (const t of tiles) {
    let b: number;
    try {
      b = deriveBiome(p, t);
    } catch {
      continue;
    }
    if (b === p.biome[t]) continue;
    let list = groups.get(b);
    if (!list) groups.set(b, (list = []));
    list.push(t);
  }
  for (const [b, list] of groups) ops.setBiome(list, b);
}

/** Two-word versions of PlanetOps reasons for tight spots (tool bar cost slot, floating tags). */
export function shortReason(r?: string): string {
  switch (r) {
    case 'Needs road access':
      return 'Needs a road';
    case 'Something is in the way':
      return 'Occupied';
    case 'Terrain too steep':
      return 'Too steep';
    case 'Cannot build on water':
      return 'On water';
    case 'Must be placed on water':
      return 'Needs water';
    case 'Needs a matching resource deposit':
      return 'Needs a deposit';
    case 'Must be on the coast':
      return 'Needs coast';
    case 'Only one per planet':
      return 'Already built';
    case 'Tile is locked':
      return 'Locked';
    case undefined:
      return 'Not here';
    default:
      return r.length > 22 ? r.replace(/ —.*$/, '') : r;
  }
}

/** Turn PlanetOps reasons into friendlier guidance. */
export function friendlyReason(r?: string): string {
  switch (r) {
    case 'Needs road access':
      return 'Needs road access — lay a road beside it first.';
    case 'Something is in the way':
      return 'Something is in the way — bulldoze it or pick another spot.';
    case 'Terrain too steep':
      return 'Too steep — flatten the ground with Terraform.';
    case 'Cannot build on water':
      return "Can't build on water (yet).";
    case 'Must be placed on water':
      return 'This one floats — place it on water.';
    case 'Needs a matching resource deposit':
      return 'Needs a matching resource deposit underneath.';
    case 'Must be on the coast':
      return 'Must touch the coast.';
    case 'Only one per planet':
      return 'One per planet — you already have it.';
    case 'Tile is locked':
      return 'This ground is locked.';
    default:
      return r ?? 'Not here';
  }
}

const DISTRICT_A = ['Neon', 'Old', 'New', 'Upper', 'Lower', 'Crater', 'Solar', 'Glass', 'Quantum', 'Velvet', 'Iron', 'Cobalt', 'Orbit', 'Lumen', 'Aurora', 'Echo', 'Nova', 'Copper', 'Silent', 'Comet', 'Prism', 'Ember', 'Harbor', 'Moss'];
const DISTRICT_B = ['Heights', 'Quarter', 'Commons', 'Gardens', 'Row', 'Bay', 'Point', 'Hollow', 'Terrace', 'Market', 'Docks', 'Village', 'Park', 'Spire', 'Flats', 'Reach', 'Crossing', 'Yards', 'Ward', 'Vale'];
export const DISTRICT_COLORS = [0xff7a8a, 0xffb35c, 0xffe066, 0x9be564, 0x4fe0b0, 0x4fd2ff, 0x6f8cff, 0xa77bff, 0xe07bff, 0xff7ad9, 0xc9a27a, 0x9fb2c8];

/** A district name not already in use. */
export function districtName(existing: (District | undefined)[]): string {
  const used = new Set(existing.filter(Boolean).map((d) => d!.name));
  const seed = (existing.length * 7 + Math.floor(Math.random() * 1000)) >>> 0;
  for (let k = 0; k < 200; k++) {
    const a = DISTRICT_A[(seed + k * 5) % DISTRICT_A.length];
    const b = DISTRICT_B[(seed * 3 + k * 7) % DISTRICT_B.length];
    const n = `${a} ${b}`;
    if (!used.has(n)) return n;
  }
  return `District ${existing.length}`;
}

/** Next district colour (cycles a palette that avoids the zone colours). */
export function districtColor(existing: (District | undefined)[]): number {
  const used = new Set(existing.filter(Boolean).map((d) => d!.color));
  for (const c of DISTRICT_COLORS) if (!used.has(c)) return c;
  return DISTRICT_COLORS[existing.length % DISTRICT_COLORS.length];
}
