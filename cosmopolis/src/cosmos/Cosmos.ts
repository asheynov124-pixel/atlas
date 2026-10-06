/**
 * OWNER: cosmos agent.
 * Cosmos — the universe outside the active planet: System / Galaxy / Universe views (3D scenes implementing View),
 * cinematic transitions (render-target blends: planet zooms out into its star system, levels zoom into each other),
 * warp travel (star-streak tunnel + flash + fly-in), travel & colonisation rules, colony bookkeeping, and the
 * sandbox Planet Forge (custom planet specs).
 *
 * CONTRACT
 *   galaxies                                  the universe (rebuilt from empire.s.universeSeed)
 *   homePlanetSpec(opts?)                     → PlanetSpec for a new game
 *   planetSpec(id)                            → PlanetSpec | null (current, forged, saved or catalogue)
 *   openView(kind, focusId?)                  'system' | 'galaxy' | 'universe' (focusId: planet / system / galaxy id)
 *   requestZoomOut()                          planet camera zoomed past max → system view (then galaxy, universe)
 *   zoomIn() · backToPlanet() · select(id | null)
 *   travelTo(planetId)                        warp + game.enterPlanet (career: founding cost, settlers' grant)
 *   canTravel(planetId)                       { ok, reason?, cost, grant, founded, current, reqs, colonisable }
 *   forgePlanet(partial)                      sandbox: create + register a custom PlanetSpec (appears in the system)
 *   systemOf(planetId) · entryOf(planetId) · colonies() · systemState / galaxyState / planetState
 * URL hooks: &cosmos=system|galaxy|universe · &cosmosSelect=<id> · &cosmosPanel=research|colonies|forge ·
 *            &warpTo=<planetId>. Test hook: window.__cosmos.
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { PlanetSpec, PlanetTypeId, StarKind } from '../core/types';
import { bus } from '../core/events';
import { settings } from '../core/settings';
import { Rng, hashString } from '../core/rng';
import { PLANET_TYPES } from '../content/planetTypes';
import { notify, ui } from '../ui/store';
import type { View } from '../render/View';
import type { ColonySummary } from '../game/Empire';
import { HOME_PLANET_ID, STAR_INFO, buildUniverse, findGalaxy, findPlanet, findSystem, homeSpec, idParts, rollSpec, type Galaxy, type PlanetEntry, type StarSystem } from './Universe';
import type { ReqStatus } from './Progression';
import { cx, setFlash, type CosmosLevel } from './state';
import { SystemView } from './render/SystemView';
import { GalaxyView } from './render/GalaxyView';
import { UniverseView } from './render/UniverseView';
import { BlendView, WarpView, type BlendMode } from './render/WarpView';
import type { CosmosView, LabelState } from './render/CosmosView';

export interface TravelCheck {
  ok: boolean;
  reason?: string;
  cost: number;
  grant: number;
  founded: boolean;
  current: boolean;
  colonisable: boolean;
  reqs: ReqStatus[];
}

export interface ColonyInfo {
  id: string;
  planetName: string;
  cityName: string;
  type: PlanetTypeId;
  population: number;
  happiness: number;
  income: number;
  research: number;
  foundedDay: number;
  systemName: string;
  galaxyName: string;
  current: boolean;
  home: boolean;
}

interface WarpState {
  view: WarpView;
  planetId: string;
  spec: PlanetSpec;
  stage: 'jump' | 'flash' | 'arrive' | 'fade';
  t: number;
  frames: number;
}

const LEVEL_ORDER: Record<CosmosLevel, number> = { system: 0, galaxy: 1, universe: 2 };

function reduceMotion(): boolean {
  if (settings.value.reduceMotion) return true;
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class Cosmos implements System {
  galaxies: Galaxy[] = [];
  private custom = new Map<string, PlanetSpec>();
  private forged = new Map<string, PlanetEntry>();
  private seed = -1;
  private empireRef: unknown = null;
  private sysView: SystemView | null = null;
  private galView: GalaxyView | null = null;
  private uniView: UniverseView | null = null;
  private blend: BlendView | null = null;
  private blendAfter: (() => void) | null = null;
  private warp: WarpState | null = null;
  private flashT = 0;
  private summaryTimer = 0;
  private params: URLSearchParams | null = null;
  private paramsDone = false;
  private offs: (() => void)[] = [];
  private lastTap = { id: '', t: 0 };

  constructor(private game: Game) {}

  // ───────────────────────────── lifecycle

  init(): void {
    try {
      this.params = new URLSearchParams(location.search);
    } catch {
      this.params = null;
    }
    this.offs.push(
      bus.on('planet:unloading', ({ planet }) => this.storeSummary(planet.spec.id)),
      bus.on('planet:loaded', ({ planet }) => this.onPlanetEntered(planet.spec.id)),
      bus.on('unlock', () => this.dataChanged()),
      bus.on('game:loaded', () => {
        this.ensureUniverse(true);
        this.dataChanged();
      }),
    );
    this.installTestHooks();
  }

  dispose(): void {
    this.offs.forEach((o) => o());
    this.offs = [];
    this.disposeViews(null);
  }

  update(dt: number): void {
    const g = this.game;
    this.ensureUniverse();
    // hand over finished blends
    if (this.blend && this.blend.done) this.finishBlend();
    if (this.warp) this.stepWarp(dt);
    if (this.flashT > 0 && !this.warp) {
      this.flashT = Math.max(0, this.flashT - dt / (reduceMotion() ? 0.25 : 0.75));
      setFlash(this.flashT * this.flashT);
    }
    if (g.planet && ui.screen.value === 'game') {
      if ((this.summaryTimer -= dt) <= 0) {
        this.summaryTimer = 5;
        this.storeSummary(g.planet.spec.id);
      }
      if (!this.paramsDone) this.applyParams();
    }
  }

  // ───────────────────────────── universe data

  private ensureUniverse(force = false): void {
    const e = this.game.empire;
    if (!force && e === this.empireRef && e.s.universeSeed === this.seed && this.galaxies.length) return;
    this.empireRef = e;
    this.seed = e.s.universeSeed;
    this.galaxies = buildUniverse(this.seed);
    this.custom.clear();
    this.forged.clear();
    const ext = this.ext();
    for (const spec of (ext.forged ?? []) as PlanetSpec[]) if (spec && spec.id) this.addForged(spec, (ext.forgedSystems ?? {})[spec.id]);
  }

  private ext(): { forged?: PlanetSpec[]; forgedSystems?: Record<string, string>; [k: string]: unknown } {
    const s = this.game.empire.s;
    if (!s.ext.cosmos || typeof s.ext.cosmos !== 'object') s.ext.cosmos = {};
    return s.ext.cosmos as { forged?: PlanetSpec[]; forgedSystems?: Record<string, string> };
  }

  homePlanetSpec(opts: { seed?: number; name?: string; type?: PlanetTypeId } = {}): PlanetSpec {
    const s = homeSpec(opts.seed ?? this.game.empire.s.universeSeed, opts.name);
    if (!opts.type || opts.type === 'terran') return s;
    // a non-terran homeworld takes its archetype's look but stays a gentle, flat-enough start
    const a = PLANET_TYPES[opts.type];
    return { ...s, type: opts.type, hasOcean: a.hasOcean, oceanColor: a.oceanColor, atmosphere: { ...a.atmosphere }, cloudCover: a.cloudCover, temperature: a.temperature, mountains: Math.min(0.55, a.ruggedness) };
  }

  planetSpec(id: string): PlanetSpec | null {
    this.ensureUniverse();
    if (this.game.planet?.spec.id === id) return this.game.planet.spec;
    if (this.custom.has(id)) return this.custom.get(id)!;
    const saved = this.game.empire.s.planets[id]?.spec;
    if (saved) return saved;
    if (id === HOME_PLANET_ID) return this.homePlanetSpec();
    return findPlanet(this.galaxies, id)?.spec ?? null;
  }

  /** Catalogue entry for a planet id (forged worlds included). */
  entryOf(id: string): PlanetEntry | null {
    this.ensureUniverse();
    return this.forged.get(id) ?? findPlanet(this.galaxies, id) ?? null;
  }

  systemOf(planetId: string): StarSystem | null {
    this.ensureUniverse();
    const f = this.forged.get(planetId);
    if (f) return findSystem(this.galaxies, f.systemId) ?? null;
    return findSystem(this.galaxies, planetId) ?? null;
  }

  galaxyOf(id: string): Galaxy | null {
    const sys = this.systemOf(id) ?? findSystem(this.galaxies, id);
    if (sys) return findGalaxy(this.galaxies, sys.galaxyId) ?? null;
    return findGalaxy(this.galaxies, idParts(id)?.galaxy ?? id) ?? null;
  }

  private currentId(): string {
    return this.game.planet?.spec.id ?? this.game.empire.s.currentPlanet ?? HOME_PLANET_ID;
  }

  /** Has this world been settled (it has a saved PlanetSave or is the active planet)? */
  isFounded(id: string): boolean {
    return id === this.game.planet?.spec.id || !!this.game.empire.s.planets[id];
  }

  // ───────────────────────────── states for views & UI

  planetState(e: PlanetEntry): LabelState {
    if (e.kind === 'giant') return 'neutral';
    if (e.id === this.game.planet?.spec.id) return 'current';
    if (this.isFounded(e.id)) return e.id === HOME_PLANET_ID ? 'home' : 'colony';
    if (!this.game.progression.meets(e)) return 'locked';
    return 'open';
  }

  systemState(s: StarSystem): LabelState {
    const cur = this.systemOf(this.currentId());
    if (cur?.id === s.id) return 'current';
    if (s.planets.some((p) => this.isFounded(p.id)) || [...this.forged.values()].some((f) => f.systemId === s.id && this.isFounded(f.id))) return 'colony';
    const g = findGalaxy(this.galaxies, s.galaxyId);
    if ((g && !this.game.progression.meets(g)) || !this.game.progression.meets(s)) return 'locked';
    return 'open';
  }

  galaxyState(g: Galaxy): LabelState {
    const cur = this.galaxyOf(this.currentId());
    if (cur?.id === g.id) return 'current';
    if (g.systems.some((s) => s.planets.some((p) => this.isFounded(p.id)))) return 'colony';
    return this.game.progression.meets(g) ? 'open' : 'locked';
  }

  systemSub(s: StarSystem): string {
    const st = this.systemState(s);
    const worlds = s.planets.filter((p) => !p.parent).length;
    const cols = s.planets.filter((p) => this.isFounded(p.id)).length;
    if (st === 'current') return 'You are here';
    if (st === 'locked') return 'Locked';
    if (cols) return `${cols} ${cols === 1 ? 'colony' : 'colonies'}`;
    return `${STAR_INFO[s.star].name} · ${worlds} worlds`;
  }

  galaxySub(g: Galaxy): string {
    const st = this.galaxyState(g);
    if (st === 'current') return 'You are here';
    if (st === 'locked') return 'Locked';
    const cols = g.systems.reduce((n, s) => n + s.planets.filter((p) => this.isFounded(p.id)).length, 0);
    return cols ? `${cols} ${cols === 1 ? 'colony' : 'colonies'}` : `${g.systems.length} star systems`;
  }

  private dataChanged(): void {
    cx.version.value++;
    try {
      this.sysView?.refreshStates();
      this.galView?.refreshStates();
      this.uniView?.refreshStates();
    } catch (e) {
      console.error('[cosmos] refresh failed', e);
    }
  }

  // ───────────────────────────── views

  private get pixelRatio(): number {
    return this.game.engine.pixelRatio || 1;
  }

  private get lowPower(): boolean {
    return this.game.engine.tier <= 0 || (this.game.engine.mobile && this.game.engine.tier <= 1);
  }

  private makeSystemView(sysId: string): SystemView | null {
    const sys = findSystem(this.galaxies, sysId);
    const gal = sys && findGalaxy(this.galaxies, sys.galaxyId);
    if (!sys || !gal) return null;
    if (this.sysView?.system.id === sysId) return this.sysView;
    // forged worlds join their host system
    const extra = [...this.forged.values()].filter((f) => f.systemId === sys.id);
    const withForged: StarSystem = extra.length ? { ...sys, planets: [...sys.planets, ...extra] } : sys;
    const v = new SystemView(withForged, gal, {
      spec: (e) => this.planetSpec(e.id) ?? e.spec,
      status: (e) => this.planetState(e),
      pixelRatio: this.pixelRatio,
      seed: this.seed,
    });
    v.onResize(this.game.engine.width, this.game.engine.height);
    v.onOvershoot = (d) => (d > 0 ? this.levelUp() : this.zoomIn());
    this.retire(this.sysView);
    this.sysView = v;
    return v;
  }

  private makeGalaxyView(gid: string): GalaxyView | null {
    const gal = findGalaxy(this.galaxies, gid);
    if (!gal) return null;
    if (this.galView?.galaxy.id === gid) return this.galView;
    const v = new GalaxyView(gal, {
      systemState: (s) => this.systemState(s),
      systemSub: (s) => this.systemSub(s),
      pixelRatio: this.pixelRatio,
      seed: this.seed,
      lowPower: this.lowPower,
    });
    v.onResize(this.game.engine.width, this.game.engine.height);
    v.onOvershoot = (d) => (d > 0 ? this.levelUp() : this.zoomIn());
    this.retire(this.galView);
    this.galView = v;
    return v;
  }

  private makeUniverseView(): UniverseView {
    if (this.uniView) return this.uniView;
    const v = new UniverseView(this.galaxies, {
      galaxyState: (g) => this.galaxyState(g),
      galaxySub: (g) => this.galaxySub(g),
      pixelRatio: this.pixelRatio,
      seed: this.seed,
      lowPower: this.lowPower,
    });
    v.onResize(this.game.engine.width, this.game.engine.height);
    v.onOvershoot = (d) => (d > 0 ? undefined : this.zoomIn());
    this.uniView = v;
    return v;
  }

  /** dispose a replaced view once no blend uses it */
  private retired: View[] = [];
  private retire(v: View | null): void {
    if (v) this.retired.push(v);
  }
  private flushRetired(): void {
    const keep = new Set<View | null>([this.game.activeView, this.blend?.from ?? null, this.blend?.to ?? null]);
    this.retired = this.retired.filter((v) => {
      if (keep.has(v)) return true;
      try {
        v.dispose();
      } catch (e) {
        console.error('[cosmos] view dispose failed', e);
      }
      return false;
    });
  }

  private disposeViews(keep: View | null): void {
    for (const v of [this.sysView, this.galView, this.uniView]) if (v && v !== keep) this.retire(v);
    if (this.sysView !== keep) this.sysView = null;
    if (this.galView !== keep) this.galView = null;
    if (this.uniView !== keep) this.uniView = null;
    this.flushRetired();
  }

  private activeCosmosView(): CosmosView | null {
    const v = this.blend ? this.blend.to : this.game.activeView;
    return v === this.sysView || v === this.galView || v === this.uniView ? (v as CosmosView) : null;
  }

  private transition(next: View, mode: BlendMode, duration: number, after?: () => void): void {
    const g = this.game;
    if (this.blend) this.finishBlend();
    const from = g.activeView;
    if (!from || from === next || reduceMotion() || duration <= 0) {
      g.setView(next);
      after?.();
      this.flushRetired();
      return;
    }
    try {
      const b = new BlendView(g.engine.renderer, from, next, duration, mode, g.engine.mobile ? 0.75 : 1);
      b.onResize(g.engine.width, g.engine.height);
      this.blend = b;
      this.blendAfter = after ?? null;
      cx.busy.value = true;
      g.setView(b);
    } catch (e) {
      console.error('[cosmos] transition failed — switching directly', e);
      this.blend = null;
      g.setView(next);
      after?.();
    }
  }

  private finishBlend(): void {
    const b = this.blend;
    if (!b) return;
    this.blend = null;
    const after = this.blendAfter;
    this.blendAfter = null;
    this.game.setView(b.to);
    b.dispose();
    cx.busy.value = false;
    try {
      after?.();
    } catch (e) {
      console.error('[cosmos] post-transition step failed', e);
    }
    this.flushRetired();
  }

  private setLevel(level: CosmosLevel | null, galaxyId?: string, systemId?: string): void {
    cx.level.value = level;
    if (galaxyId !== undefined) cx.galaxyId.value = galaxyId;
    if (systemId !== undefined) cx.systemId.value = systemId;
    try {
      if (level) this.game.audio.setMood(level === 'system' ? 'space' : 'galaxy');
    } catch {
      /* audio optional */
    }
  }

  /** Open a cosmos level. focusId: a planet, system or galaxy id to centre on (defaults to where you are). */
  openView(kind: CosmosLevel, focusId?: string, instant = false): void {
    try {
      this.ensureUniverse();
      if (this.warp) return;
      const g = this.game;
      const cur = this.currentId();
      const prevLevel = cx.level.value;
      const fromPlanet = !prevLevel || g.activeView === g.planetView;
      const curSys = this.systemOf(cur);
      let next: CosmosView | null = null;
      let mode: BlendMode = 'cross';
      if (kind === 'system') {
        const sysId = (focusId && (this.systemOf(focusId)?.id ?? (findSystem(this.galaxies, focusId)?.id || ''))) || (prevLevel ? cx.systemId.value : '') || curSys?.id || 'g0.s0';
        const v = this.makeSystemView(sysId);
        if (!v) return;
        const planetFocus = focusId && v.bodies.has(focusId) ? focusId : fromPlanet && v.bodies.has(cur) ? cur : null;
        if (fromPlanet && planetFocus === cur) {
          // start tight on the current world, then pull back to reveal the system
          v.focus(cur, true);
          const size = v.bodies.get(cur)!.entry.size;
          v.cam.dist = size * 2.1;
          v.cam.goalDist = size * 6.5 + 2;
          v.select(cur);
          cx.selected.value = { kind: 'planet', id: cur };
        } else if (planetFocus) {
          v.focus(planetFocus, false);
          v.select(planetFocus);
          cx.selected.value = { kind: 'planet', id: planetFocus };
        } else if (!prevLevel || prevLevel !== 'system') {
          v.focus(null, true);
          v.select(null);
          cx.selected.value = null;
        }
        this.setLevel('system', v.galaxy.id, v.system.id);
        next = v;
        mode = fromPlanet ? 'out' : prevLevel && LEVEL_ORDER[prevLevel] > 0 ? 'in' : 'cross';
      } else if (kind === 'galaxy') {
        const gid = (focusId && this.galaxyOf(focusId)?.id) || cx.galaxyId.value || this.galaxyOf(cur)?.id || 'g0';
        const v = this.makeGalaxyView(gid);
        if (!v) return;
        const sysFocus = (focusId && (findSystem(this.galaxies, focusId)?.id ?? this.systemOf(focusId)?.id)) || (prevLevel === 'system' ? cx.systemId.value : curSys?.galaxyId === gid ? curSys.id : null);
        if (sysFocus && v.galaxy.systems.some((s) => s.id === sysFocus)) {
          v.focus(sysFocus, prevLevel !== 'galaxy');
          if (prevLevel === 'system') {
            v.cam.dist = 6;
            v.cam.goalDist = v.galaxy.radius * 0.55;
          }
          v.select(sysFocus);
          cx.selected.value = { kind: 'system', id: sysFocus };
        } else {
          v.focus(null, true);
          v.select(null);
          cx.selected.value = null;
        }
        this.setLevel('galaxy', gid, sysFocus ?? cx.systemId.value);
        next = v;
        mode = fromPlanet || (prevLevel && LEVEL_ORDER[prevLevel] < 1) ? 'out' : prevLevel === 'universe' ? 'in' : 'cross';
      } else {
        const v = this.makeUniverseView();
        const gid = (focusId && this.galaxyOf(focusId)?.id) || cx.galaxyId.value || this.galaxyOf(cur)?.id || 'g0';
        v.refreshStates();
        v.focus(gid, prevLevel !== 'universe');
        if (prevLevel === 'galaxy') {
          v.cam.dist = 60;
          v.cam.goalDist = 260;
        }
        v.select(gid);
        cx.selected.value = { kind: 'galaxy', id: gid };
        this.setLevel('universe', gid);
        next = v;
        mode = 'out';
      }
      if (!next) return;
      g.audio.sfx(fromPlanet ? 'whoosh' : 'open');
      this.transition(next, mode, instant ? 0 : fromPlanet ? 1.0 : 0.85);
    } catch (e) {
      console.error('[cosmos] openView failed', e);
      notify({ title: 'Star map unavailable', body: String((e as Error)?.message ?? e), kind: 'warn', icon: 'map' });
    }
  }

  /** Planet camera zoomed past its maximum → system view (or the next level up when already in space). */
  requestZoomOut(): void {
    if (this.blend || this.warp) return;
    const lvl = cx.level.value;
    if (!lvl || this.game.activeView === this.game.planetView) this.openView('system');
    else this.levelUp();
  }

  levelUp(): void {
    if (this.blend || this.warp) return;
    const lvl = cx.level.value;
    if (lvl === 'system') this.openView('galaxy', cx.systemId.value);
    else if (lvl === 'galaxy') this.openView('universe', cx.galaxyId.value);
  }

  /** Go one level down toward the selection (or the current world). */
  zoomIn(): void {
    if (this.blend || this.warp) return;
    const lvl = cx.level.value;
    const sel = cx.selected.value;
    if (lvl === 'universe') this.openView('galaxy', sel?.kind === 'galaxy' ? sel.id : cx.galaxyId.value);
    else if (lvl === 'galaxy') {
      const sysId = sel?.kind === 'system' ? sel.id : this.galView?.focusId ?? this.systemOf(this.currentId())?.id;
      if (sysId) this.openView('system', sysId);
    } else if (lvl === 'system') {
      const v = this.sysView;
      const target = (sel?.kind === 'planet' && sel.id) || v?.focusId;
      if (target && target === this.game.planet?.spec.id) this.backToPlanet();
    }
  }

  /** Leave the star map and return to the active planet's surface. */
  backToPlanet(): void {
    const g = this.game;
    if (!g.planetView || this.warp) return;
    if (g.activeView === g.planetView && !this.blend) return;
    const cam = g.camera as unknown as { distance?: number; maxDistance?: number; flyTo?: (w: unknown, o: unknown) => unknown; target?: unknown };
    try {
      if (typeof cam.maxDistance === 'number') cam.distance = cam.maxDistance;
      const R = g.planet?.radius ?? 60;
      if (typeof cam.flyTo === 'function') void cam.flyTo(cam.target, { distance: R * 1.55, duration: 1.4 });
    } catch {
      /* camera optional */
    }
    g.audio.sfx('whoosh');
    this.setLevel(null);
    cx.selected.value = null;
    this.transition(g.planetView, 'in', 0.9, () => {
      this.disposeViews(null);
      this.restoreMood();
    });
  }

  private restoreMood(): void {
    try {
      const t = this.game.clock.timeOfDay;
      const night = settings.value.dayNight === 'night' || (settings.value.dayNight === 'cycle' && (t > 0.55 && t < 0.95));
      this.game.audio.setMood(night ? 'night' : 'day');
    } catch {
      /* audio optional */
    }
  }

  // ───────────────────────────── input (from the cosmos HUD gesture layer)

  rotate(dx: number, dy: number): void {
    this.activeCosmosView()?.rotate(dx, dy);
  }

  zoom(f: number): void {
    this.activeCosmosView()?.zoom(f);
  }

  /** Tap at CSS pixel position. */
  tap(x: number, y: number): void {
    const v = this.activeCosmosView();
    if (!v || this.blend) return;
    const id = v.pick(x, y);
    const now = performance.now();
    const dbl = id && this.lastTap.id === id && now - this.lastTap.t < 380;
    this.lastTap = { id: id ?? '', t: now };
    if (!id) {
      this.select(null);
      return;
    }
    if (dbl) {
      this.activate(id);
      return;
    }
    this.select(id);
  }

  /** Double-tap / primary action on a body: enter it. */
  activate(id: string): void {
    const lvl = cx.level.value;
    if (lvl === 'universe') this.openView('galaxy', id);
    else if (lvl === 'galaxy') this.openView('system', id);
    else if (lvl === 'system' && id === this.game.planet?.spec.id) this.backToPlanet();
    else if (lvl === 'system') this.select(id);
  }

  select(id: string | null): void {
    const v = this.activeCosmosView();
    if (!v) return;
    if (!id) {
      v.select(null);
      cx.selected.value = null;
      return;
    }
    let kind: 'planet' | 'star' | 'system' | 'galaxy' = 'planet';
    if (v.kind === 'galaxy') kind = 'system';
    else if (v.kind === 'universe') kind = 'galaxy';
    else if (id.endsWith('.star')) kind = 'star';
    v.select(id);
    v.focus(id, false);
    cx.selected.value = { kind, id };
    this.game.audio.sfx('tap');
  }

  // ───────────────────────────── travel & colonisation

  colonyCost(id: string): { cost: number; grant: number } {
    const e = this.game.empire;
    if (e.sandbox) return { cost: 0, grant: 0 };
    const cur = this.currentId();
    const here = this.systemOf(cur);
    const there = this.systemOf(id);
    const homeMoon = id.startsWith(HOME_PLANET_ID + '.m');
    let base = 60_000;
    if (homeMoon) base = 30_000;
    else if (here && there && here.id === there.id) base = 60_000;
    else if (here && there && here.galaxyId === there.galaxyId) base = 300_000;
    else base = 1_500_000;
    if (there?.star === 'blackhole') base *= 1.5;
    const colonies = Object.keys(e.s.planets).length + 1;
    const mult = (1 + 0.12 * Math.max(0, colonies - 1)) * this.game.progression.techBonus('colonyCost');
    const cost = Math.round((base * mult) / 1000) * 1000;
    return { cost, grant: Math.round((cost * 0.4) / 1000) * 1000 };
  }

  canTravel(planetId: string): TravelCheck {
    this.ensureUniverse();
    const e = this.game.empire;
    const entry = this.entryOf(planetId);
    const spec = this.planetSpec(planetId);
    const current = planetId === this.game.planet?.spec.id;
    const founded = this.isFounded(planetId);
    const none: TravelCheck = { ok: false, cost: 0, grant: 0, founded, current, colonisable: false, reqs: [] };
    if (!spec && !entry) return { ...none, reason: 'Unknown world' };
    if (entry && !entry.colonisable) return { ...none, reason: entry.kind === 'giant' ? 'A gas giant has no surface — try one of its moons.' : 'This world cannot be settled.' };
    if (current) return { ok: true, cost: 0, grant: 0, founded: true, current: true, colonisable: true, reqs: [] };
    if (e.sandbox || founded) return { ok: true, cost: 0, grant: 0, founded, current, colonisable: true, reqs: [] };
    const reqs = entry ? this.game.progression.reqsFor(entry) : [];
    const { cost, grant } = this.colonyCost(planetId);
    const fail = reqs.find((r) => !r.ok);
    if (fail) return { ok: false, reason: fail.label, cost, grant, founded, current, colonisable: true, reqs };
    if (e.s.money < cost) return { ok: false, reason: `Charter costs ₡${cost.toLocaleString('en-US')}`, cost, grant, founded, current, colonisable: true, reqs };
    return { ok: true, cost, grant, founded, current, colonisable: true, reqs };
  }

  async travelTo(planetId: string): Promise<void> {
    const g = this.game;
    try {
      if (this.warp) return;
      const chk = this.canTravel(planetId);
      if (!chk.ok) {
        notify({ title: 'Cannot travel there yet', body: chk.reason, kind: 'warn', icon: 'lock' });
        g.audio.sfx('error');
        return;
      }
      if (chk.current) {
        if (g.activeView !== g.planetView) this.backToPlanet();
        return;
      }
      const spec = this.planetSpec(planetId);
      if (!spec) return;
      const entry = this.entryOf(planetId);
      if (!chk.founded && !g.empire.sandbox) {
        if (!g.empire.spend(chk.cost)) {
          notify({ title: 'Not enough credits', body: `The colony charter costs ₡${chk.cost.toLocaleString('en-US')}.`, kind: 'bad', icon: 'money' });
          g.audio.sfx('error');
          return;
        }
        g.progression.registerColony(planetId, spec.name, chk.grant);
      }
      const here = this.systemOf(this.currentId());
      const there = this.systemOf(planetId);
      const kind = here && there && here.id === there.id ? 'local' : here && there && here.galaxyId === there.galaxyId ? 'interstellar' : 'intergalactic';
      const star = there ? STAR_INFO[there.star] : STAR_INFO.yellow;
      const color = kind === 'intergalactic' ? 0x9f7bff : there?.star === 'blackhole' ? 0xff9a50 : star.glow;
      const wv = new WarpView('system', color);
      const speed = g.progression.techBonus('warpSpeed');
      wv.duration = (reduceMotion() ? 0.8 : kind === 'intergalactic' ? 3.4 : kind === 'interstellar' ? 2.8 : 2.2) / Math.max(0.5, speed);
      wv.onResize(g.engine.width, g.engine.height);
      cx.warping.value = { name: spec.name, kind, distance: kind === 'local' ? `${(Math.abs((entry?.orbit ?? 30) - 28) * 0.21 + 0.4).toFixed(1)} AU` : kind === 'interstellar' ? `${(4 + (hashString(planetId) % 900) / 37).toFixed(1)} light-years` : `${(2 + (hashString(planetId) % 300) / 40).toFixed(1)} million light-years` };
      cx.selected.value = null;
      g.audio.sfx('warp');
      this.warp = { view: wv, planetId, spec, stage: 'jump', t: 0, frames: 0 };
      this.transition(wv, 'cross', reduceMotion() ? 0 : 0.55);
    } catch (e) {
      console.error('[cosmos] travel failed', e);
      this.warp = null;
      cx.warping.value = null;
      notify({ title: 'Warp drive malfunction', body: 'The jump was aborted. Your colonists are mostly fine.', kind: 'bad', icon: 'warp' });
    }
  }

  private stepWarp(dt: number): void {
    const w = this.warp!;
    const g = this.game;
    w.t += dt;
    w.frames++;
    try {
      if (w.stage === 'jump') {
        const p = w.view.progress;
        if (p > 0.82) setFlash(Math.pow((p - 0.82) / 0.18, 2), '#eef6ff');
        if (p >= 1 && !this.blend) {
          w.stage = 'flash';
          w.frames = 0;
          setFlash(1, '#ffffff');
        }
      } else if (w.stage === 'flash') {
        // let the white frame paint before the heavy planet swap
        if (w.frames >= 2) {
          w.stage = 'arrive';
          this.arrive(w);
          w.stage = 'fade';
          w.t = 0;
          this.flashT = 1;
        }
      } else if (w.stage === 'fade') {
        this.flashT = Math.max(0, 1 - w.t / (reduceMotion() ? 0.3 : 0.9));
        setFlash(this.flashT * this.flashT, '#ffffff');
        if (this.flashT <= 0) {
          this.warp = null;
          cx.warping.value = null;
        }
      }
    } catch (e) {
      console.error('[cosmos] warp step failed', e);
      this.warp = null;
      cx.warping.value = null;
      setFlash(0);
      if (g.planetView) g.setView(g.planetView);
    }
  }

  private arrive(w: WarpState): void {
    const g = this.game;
    const warpView = w.view;
    if (this.blend) this.finishBlend();
    this.setLevel(null);
    g.enterPlanet(w.spec);
    warpView.dispose();
    this.disposeViews(null);
    // cinematic fly-in from orbit
    try {
      const cam = g.camera as unknown as { distance?: number; maxDistance?: number; flyTo?: (w: unknown, o: unknown) => unknown; snap?: () => void };
      const R = g.planet?.radius ?? 60;
      let tile: number | undefined;
      const site = (g.planet?.ext?.terrain as { site?: number } | undefined)?.site;
      if (typeof site === 'number') tile = site;
      if (typeof cam.maxDistance === 'number') {
        cam.distance = cam.maxDistance;
        cam.snap?.();
      }
      if (typeof cam.flyTo === 'function') void cam.flyTo(tile ?? (g.camera as unknown as { target: unknown }).target, { distance: R * 0.9, tilt: 0.55, duration: 2.4 });
    } catch {
      /* camera optional */
    }
    this.restoreMood();
    const first = !Object.prototype.hasOwnProperty.call(g.empire.s.colonies, w.planetId) && w.planetId !== HOME_PLANET_ID;
    const sys = this.systemOf(w.planetId);
    notify({
      title: first ? `Welcome to ${w.spec.name}` : `Back on ${w.spec.name}`,
      body: first ? `${PLANET_TYPES[w.spec.type]?.tagline ?? ''} ${sys ? `· ${sys.name}` : ''}`.trim() : g.planet?.city.name ?? undefined,
      kind: 'good',
      icon: 'rocket',
    });
    this.storeSummary(w.planetId);
    this.dataChanged();
  }

  // ───────────────────────────── colonies

  private storeSummary(id: string): void {
    const g = this.game;
    if (!g.planet || g.planet.spec.id !== id) return;
    let s: ColonySummary | null = null;
    try {
      const sim = g.sim as unknown as { colonySummary?: () => ColonySummary };
      if (typeof sim.colonySummary === 'function') s = sim.colonySummary();
    } catch {
      s = null;
    }
    if (!s) {
      s = { planetId: id, name: g.planet.city.name, population: Math.round(g.sim.getMetric?.('population') ?? 0), happiness: Math.round(ui.happiness.value), income: Math.round(ui.income.value), foundedDay: g.planet.city.foundedDay, research: 0 };
    }
    if (!s.planetId) s.planetId = id;
    g.empire.s.colonies[id] = s;
  }

  colonies(): ColonyInfo[] {
    const g = this.game;
    const ids = new Set(Object.keys(g.empire.s.planets));
    if (g.planet) ids.add(g.planet.spec.id);
    const out: ColonyInfo[] = [];
    for (const id of ids) {
      const spec = this.planetSpec(id);
      const sys = this.systemOf(id);
      const gal = sys ? findGalaxy(this.galaxies, sys.galaxyId) : null;
      const cur = g.planet?.spec.id === id;
      const sum = g.empire.s.colonies[id];
      out.push({
        id,
        planetName: spec?.name ?? id,
        cityName: cur ? g.planet!.city.name : sum?.name || (g.empire.s.planets[id] as { city?: { name?: string } } | undefined)?.city?.name || spec?.name || id,
        type: spec?.type ?? 'terran',
        population: cur ? ui.population.value : sum?.population ?? 0,
        happiness: cur ? ui.happiness.value : sum?.happiness ?? 50,
        income: cur ? ui.income.value : sum?.income ?? 0,
        research: sum?.research ?? 0,
        foundedDay: sum?.foundedDay ?? 0,
        systemName: sys?.name ?? 'Deep space',
        galaxyName: gal?.name ?? '',
        current: cur,
        home: id === HOME_PLANET_ID,
      });
    }
    return out.sort((a, b) => Number(b.current) - Number(a.current) || Number(b.home) - Number(a.home) || b.population - a.population);
  }

  private onPlanetEntered(id: string): void {
    const sys = this.systemOf(id);
    // tell the planet's sky what kind of sun it has (space-post renderer, optional)
    try {
      const env = this.game.planetView?.env as unknown as { setStar?: (k: StarKind, o?: unknown) => void } | undefined;
      if (sys && env && typeof env.setStar === 'function') env.setStar(sys.star, { companion: sys.companion, color: STAR_INFO[sys.star].color });
    } catch (e) {
      console.warn('[cosmos] setStar failed', e);
    }
    if (sys) {
      cx.systemId.value = sys.id;
      cx.galaxyId.value = sys.galaxyId;
    }
    if (this.game.activeView === this.game.planetView) cx.level.value = null;
    this.dataChanged();
  }

  // ───────────────────────────── Planet Forge (sandbox)

  private addForged(spec: PlanetSpec, systemId?: string): PlanetEntry {
    const sysId = systemId && findSystem(this.galaxies, systemId) ? systemId : this.systemOf(this.currentId())?.id ?? 'g0.s0';
    const sys = findSystem(this.galaxies, sysId)!;
    const outer = Math.max(30, ...sys.planets.filter((p) => !p.parent).map((p) => p.orbit));
    const n = [...this.forged.values()].filter((f) => f.systemId === sysId).length;
    const size = 0.6 + ((spec.frequency - 16) / 48) * 1.0;
    const entry: PlanetEntry = {
      id: spec.id,
      name: spec.name,
      spec,
      orbit: outer + 12 + n * 9,
      kind: 'planet',
      colonisable: true,
      reqs: [],
      size,
      phase: (hashString(spec.id) % 628) / 100,
      speed: 0.05 * Math.pow(12 / (outer + 12 + n * 9), 1.5),
      inclination: 0.02,
      galaxyId: sys.galaxyId,
      systemId: sysId,
      description: 'A world of your own design, hammered out on the Planet Forge.',
    };
    this.custom.set(spec.id, spec);
    this.forged.set(spec.id, entry);
    return entry;
  }

  /** Sandbox: create + register a custom planet (joins the current star system). */
  forgePlanet(partial: Partial<PlanetSpec>): PlanetSpec {
    this.ensureUniverse();
    const ext = this.ext();
    const n = (ext.forged?.length ?? 0) + 1;
    const type = partial.type ?? 'terran';
    const seed = partial.seed ?? new Rng(Date.now() & 0xffffff).int(1, 1e9);
    const base = rollSpec(`sandbox.${n}`, partial.name ?? `New World ${n}`, type, seed);
    const spec: PlanetSpec = { ...base, ...partial, id: partial.id ?? `sandbox.${n}`, type, seed, tags: [...(partial.tags ?? []), 'forged'] };
    const sysId = this.systemOf(this.currentId())?.id ?? 'g0.s0';
    ext.forged = [...(ext.forged ?? []).filter((s) => s.id !== spec.id), spec];
    ext.forgedSystems = { ...(ext.forgedSystems ?? {}), [spec.id]: sysId };
    this.addForged(spec, sysId);
    this.game.empire.bump('cosmos.forged');
    // the system view must be rebuilt to show the new world
    if (this.sysView && this.sysView.system.id === sysId && this.game.activeView !== this.sysView) {
      this.retire(this.sysView);
      this.sysView = null;
      this.flushRetired();
    }
    this.dataChanged();
    return spec;
  }

  // ───────────────────────────── URL params & test hooks

  private applyParams(): void {
    this.paramsDone = true;
    const p = this.params;
    if (!p) return;
    const lvl = p.get('cosmos') as CosmosLevel | null;
    const sel = p.get('cosmosSelect');
    if (lvl === 'system' || lvl === 'galaxy' || lvl === 'universe') {
      this.openView(lvl, sel ?? undefined, true);
      if (sel) this.select(sel);
    }
    const panel = p.get('cosmosPanel');
    if (panel) ui.panel.value = panel;
    const warp = p.get('warpTo');
    if (warp) void this.travelTo(warp);
  }

  private installTestHooks(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as { __cosmos: unknown }).__cosmos = {
      cosmos: this,
      openView: (k: CosmosLevel, id?: string, instant?: boolean) => this.openView(k, id, instant),
      select: (id: string | null) => this.select(id),
      travel: (id: string) => this.travelTo(id),
      back: () => this.backToPlanet(),
      zoomIn: () => this.zoomIn(),
      levelUp: () => this.levelUp(),
      forge: (p: Partial<PlanetSpec>) => this.forgePlanet(p),
      state: () => ({ level: cx.level.value, galaxy: cx.galaxyId.value, system: cx.systemId.value, selected: cx.selected.value, warping: cx.warping.value, busy: cx.busy.value, view: this.game.viewKind }),
    };
  }
}
