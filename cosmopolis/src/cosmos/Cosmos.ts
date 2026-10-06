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
 *   zoomIn() · levelUp() · backToPlanet() · select(id | null) · activate(id)
 *   HUD bridge: rotate(dx, dy) · zoom(f) · fling() · tap(x, y) · labelTap(id) · refreshLabels() ·
 *               setHudFrame(cardRect | null, topPx) — the views shift their lens so a selection is never under the card
 *   travelTo(planetId)                        warp + game.enterPlanet (career: founding cost, settlers' grant)
 *   canTravel(planetId)                       { ok, reason?, cost, grant, founded, current, reqs, colonisable }
 *   forgePlanet(partial)                      sandbox: create + register a custom PlanetSpec (appears in the system)
 *   systemOf(planetId) · entryOf(planetId) · galaxyOf(id) · isFounded(id) · colonyCost(id) · colonies()
 *   planetState / systemState / galaxyState (+ systemSub / galaxySub label texts)
 * Camera: zooming out of the planet remembers the planet camera pose and flies back to it on return; arriving at a
 * new world starts at the edge of orbit and glides down onto the city. Quick successive zooms complete the running
 * blend instead of being ignored. Views are rebuilt when the universe changes (new game / load).
 * URL hooks: &cosmos=system|galaxy|universe · &cosmosSelect=<id> · &cosmosPanel=research|colonies|forge ·
 *            &warpTo=<planetId>. Test hook: window.__cosmos.
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { PlanetSpec, PlanetTypeId, StarKind } from '../core/types';
import { bus } from '../core/events';
import { settings } from '../core/settings';
import { Rng, hashString } from '../core/rng';
import { Vector3 } from 'three';
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

/** The parts of the planet CameraRig the cosmos uses (read defensively — tools owns the rig). */
interface CamLike {
  target?: Vector3;
  distance?: number;
  maxDistance?: number;
  heading?: number;
  tilt?: number;
  flyTo?: (where: number | Vector3, o: { distance?: number; heading?: number; tilt?: number; duration?: number }) => Promise<void>;
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
  /** screen rect of the HUD info card + height of the top chrome (CSS px) — the views shift their lens around it */
  private frame: { card: { left: number; top: number; right: number; bottom: number } | null; top: number } = { card: null, top: 110 };
  /** planet camera pose when the star map was opened (restored on the way back) */
  private planetPose: { target: Vector3; distance: number; heading: number; tilt: number } | null = null;

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
    // views built for the previous universe (another save) must not be reused
    this.disposeViews(null);
    this.planetPose = null;
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
          // start tight on the current world, then pull back to reveal its moons and orbit ("you are here" is
          // labelled; the card opens on tap so the first look at the system is unobstructed)
          v.focus(cur, true);
          const size = v.bodies.get(cur)!.entry.size;
          v.cam.dist = size * 2.1;
          v.cam.goalDist = size * 6.5 + 2;
          v.select(null);
          cx.selected.value = null;
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
        const explicit = !!focusId && !!findSystem(this.galaxies, focusId);
        const sysFocus = (focusId && (findSystem(this.galaxies, focusId)?.id ?? this.systemOf(focusId)?.id)) || (prevLevel === 'system' ? cx.systemId.value : curSys?.galaxyId === gid ? curSys.id : null);
        if (sysFocus && v.galaxy.systems.some((s) => s.id === sysFocus)) {
          if (explicit && prevLevel !== 'system') {
            // asked for a particular system: fly to it and open its card
            v.focus(sysFocus, prevLevel !== 'galaxy');
            v.select(sysFocus);
            cx.selected.value = { kind: 'system', id: sysFocus };
          } else {
            // zooming out is about the big picture: start at the system we came from, then pull back to frame the
            // whole galaxy ("you are here" stays marked); cards open on tap
            v.focus(sysFocus, true);
            v.cam.dist = 6;
            v.focus(null, false);
            v.select(null);
            cx.selected.value = null;
          }
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
        if (prevLevel === 'universe') v.focus(null, false);
        else {
          // start at the galaxy we came from, then pull back until all six are in view
          v.focus(gid, true);
          v.cam.dist = prevLevel === 'galaxy' ? 90 : 160;
          v.focus(null, false);
        }
        // the big picture: frame where you came from, cards open on tap
        v.select(null);
        cx.selected.value = null;
        this.setLevel('universe', gid);
        next = v;
        mode = 'out';
      }
      if (!next) return;
      if (fromPlanet) this.savePlanetPose();
      this.applyFrameShift(true, next);
      g.audio.sfx(fromPlanet ? 'whoosh' : 'open');
      this.transition(next, mode, instant ? 0 : fromPlanet ? 1.0 : 0.85);
    } catch (e) {
      console.error('[cosmos] openView failed', e);
      notify({ title: 'Star map unavailable', body: String((e as Error)?.message ?? e), kind: 'warn', icon: 'map' });
    }
  }

  /** Planet camera zoomed past its maximum → system view (or the next level up when already in space). */
  requestZoomOut(): void {
    if (this.warp) return;
    const lvl = cx.level.value;
    if (!lvl || this.game.activeView === this.game.planetView) this.openView('system');
    else this.levelUp();
  }

  levelUp(): void {
    // a running blend is completed by the next transition, so quick successive zooms are never swallowed
    if (this.warp) return;
    const lvl = cx.level.value;
    if (lvl === 'system') this.openView('galaxy', cx.systemId.value);
    else if (lvl === 'galaxy') this.openView('universe', cx.galaxyId.value);
  }

  /** Go one level down toward the selection (or the current world). */
  zoomIn(): void {
    if (this.warp) return;
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
    const cam = g.camera as unknown as CamLike;
    try {
      const R = g.planet?.radius ?? 60;
      const pose = this.planetPose;
      this.planetPose = null;
      if (typeof cam.maxDistance === 'number') cam.distance = cam.maxDistance;
      if (typeof cam.flyTo === 'function') {
        if (pose) void cam.flyTo(pose.target, { distance: pose.distance, heading: pose.heading, tilt: pose.tilt, duration: 1.5 });
        else if (cam.target) void cam.flyTo(cam.target, { distance: R * 1.55, duration: 1.4 });
      }
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

  private savePlanetPose(): void {
    const cam = this.game.camera as unknown as CamLike;
    try {
      if (cam.target instanceof Vector3 && typeof cam.distance === 'number') {
        // a pinch past the limit leaves the camera at max distance — come back a little closer than that
        const d = typeof cam.maxDistance === 'number' ? Math.min(cam.distance, cam.maxDistance * 0.78) : cam.distance;
        this.planetPose = { target: cam.target.clone(), distance: d, heading: cam.heading ?? 0, tilt: cam.tilt ?? 0.5 };
      }
    } catch {
      this.planetPose = null;
    }
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

  // ───────────────────────────── framing around the HUD

  /** The HUD reports where its info card is (null = none) and where the top chrome ends. */
  setHudFrame(card: { left: number; top: number; right: number; bottom: number } | null, top: number): void {
    this.frame = { card, top };
    this.applyFrameShift(false);
  }

  /** Shift the active view's lens so the selected body sits in the free part of the screen, not under the card. */
  private applyFrameShift(snap: boolean, view?: CosmosView): void {
    const v = view ?? this.activeCosmosView();
    if (!v) return;
    const W = this.game.engine.width, H = this.game.engine.height;
    const r = this.frame.card;
    let sx = 0, sy = 0;
    if (r && cx.selected.value) {
      const w = r.right - r.left;
      if (w > W * 0.6) {
        // bottom card (portrait phones): centre the free band between the top chrome and the card
        const freeTop = Math.min(this.frame.top, H * 0.3);
        sy = Math.max(0, H / 2 - (freeTop + r.top) / 2);
      } else if (r.left < W * 0.3 && r.bottom - r.top > H * 0.45) {
        // left-docked card (landscape phones, big screens): centre the free band right of it
        sx = Math.max(0, (r.right + (W - 64)) / 2 - W / 2);
      }
    }
    v.setFrameShift(sx, sy, snap);
  }

  // ───────────────────────────── input (from the cosmos HUD gesture layer)

  rotate(dx: number, dy: number): void {
    this.activeCosmosView()?.rotate(dx, dy);
  }

  /** Drag released: keep a little orbit momentum. */
  fling(): void {
    this.activeCosmosView()?.cam.fling();
  }

  /** Re-send the active view's labels to the DOM label layer (it mounted late or was rebuilt). */
  refreshLabels(): void {
    this.activeCosmosView()?.refreshLabels();
  }

  /** A body's name tag was tapped: select it; tapping the selected tag again enters it. */
  labelTap(id: string): void {
    if (this.blend || this.warp) return;
    const sel = cx.selected.value;
    if (sel && sel.id === id) {
      this.activate(id);
      return;
    }
    this.lastTap = { id, t: performance.now() };
    this.select(id);
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
      this.applyFrameShift(false);
      return;
    }
    let kind: 'planet' | 'star' | 'system' | 'galaxy' = 'planet';
    if (v.kind === 'galaxy') kind = 'system';
    else if (v.kind === 'universe') kind = 'galaxy';
    else if (id.endsWith('.star')) kind = 'star';
    v.select(id);
    v.focus(id, false);
    cx.selected.value = { kind, id };
    this.applyFrameShift(false);
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
          // the jump is over: the HUD title goes, the flash fades out over the new world
          cx.warping.value = null;
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
    this.planetPose = null;
    try {
      const cam = g.camera as unknown as CamLike;
      const R = g.planet?.radius ?? 60;
      // start from the edge of orbit and glide down onto the city (or the recommended settlement site)
      if (typeof cam.maxDistance === 'number') cam.distance = cam.maxDistance;
      if (typeof cam.flyTo === 'function' && cam.target) void cam.flyTo(cam.target, { distance: R * 0.95, tilt: 0.55, duration: reduceMotion() ? 0.3 : 2.6 });
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
