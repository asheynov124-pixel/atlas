/**
 * Game — the orchestrator (FOUNDATION). Owns the engine, the empire (save state), the active planet + PlanetView,
 * the active View, the clock and every subsystem. Runs the main loop and publishes UI state.
 *
 * Access it anywhere via `import { game } from './instance'`.
 */
import { effect } from '@preact/signals';
import { bus } from '../core/events';
import { settings } from '../core/settings';
import type { GameMode, PlanetSpec, PlanetTypeId, ViewKind } from '../core/types';
import { readSave, writeSave, type SaveFile } from '../core/save';
import { footprintOf } from '../content/catalog';
import { Engine } from '../render/Engine';
import { PlanetView } from '../render/PlanetView';
import type { View } from '../render/View';
import { CameraRig } from '../render/CameraRig';
import { InputController } from '../input/InputController';
import { ToolManager } from '../tools/ToolManager';
import { Simulation } from '../sim/Simulation';
import { Progression } from '../cosmos/Progression';
import { Cosmos } from '../cosmos/Cosmos';
import { GodPowers } from '../god/GodPowers';
import { AudioEngine } from '../audio/AudioEngine';
import { Studio } from '../studio/Studio';
import { generatePlanet } from '../world/planetgen';
import { Planet } from '../world/planet';
import { PlanetOps } from '../world/ops';
import { ui, notify } from '../ui/store';
import { panels } from '../ui/registry';
import { Clock } from './Clock';
import { Commands } from './Commands';
import { Empire } from './Empire';
import type { System } from './System';
import { setGame } from './instance';

export interface NewGameOptions {
  empireName?: string;
  cityName?: string;
  planetName?: string;
  planetType?: PlanetTypeId;
  seed?: number;
  /** planet size (Goldberg frequency; default from the home spec, 40) */
  frequency?: number;
}

export class Game {
  readonly engine: Engine;
  readonly clock = new Clock();
  empire: Empire = Empire.create('sandbox', 'Sandbox', 1);
  /** active planet (null before a game starts) */
  planet: Planet | null = null;
  ops: PlanetOps | null = null;
  planetView: PlanetView | null = null;
  activeView: View | null = null;

  readonly audio: AudioEngine;
  readonly sim: Simulation;
  readonly progression: Progression;
  readonly cosmos: Cosmos;
  readonly camera: CameraRig;
  readonly tools: ToolManager;
  readonly commands: Commands;
  readonly input: InputController;
  readonly god: GodPowers;
  readonly studio: Studio;
  readonly systems: System[];

  ready = false;
  private last = 0;
  private uiTimer = 0;
  private autosaveTimer = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lensTimer = 0;
  private running = false;
  /** seconds a full-screen panel (e.g. Research) has covered the 3D view — rendering pauses to save battery */
  private coveredFor = 0;

  constructor(container: HTMLElement) {
    setGame(this);
    this.engine = new Engine(container);
    this.audio = new AudioEngine(this);
    this.sim = new Simulation(this);
    this.progression = new Progression(this);
    this.cosmos = new Cosmos(this);
    this.camera = new CameraRig(this);
    this.tools = new ToolManager(this);
    this.commands = new Commands(this);
    this.input = new InputController(this);
    this.god = new GodPowers(this);
    this.studio = new Studio(this);
    this.systems = [this.audio, this.sim, this.progression, this.cosmos, this.camera, this.tools, this.commands, this.input, this.god, this.studio];
    this.engine.onResized((w, h) => this.activeView?.onResize?.(w, h));
  }

  async boot(): Promise<void> {
    for (const s of this.systems) {
      try {
        await s.init?.();
      } catch (e) {
        console.error('[game] system init failed', s, e);
      }
    }
    // lens overlay glue
    effect(() => {
      const id = ui.lens.value;
      this.lensTimer = 0;
      if (!id) this.planetView?.surface.overlay.showValues(null);
      bus.emit('lens:changed', { lensId: id });
    });
    bus.on('settings:changed', () => {
      const t = Engine.tierFor(settings.value.quality, this.engine.mobile);
      if (settings.value.quality !== 'auto') this.engine.setQuality(t);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.planet && settings.value.autosave) void this.save('auto');
    });
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    ui.loading.value = null;
    ui.screen.value = 'menu';
    this.ready = true;
  }

  // ─────────────────────────────────────────────── game lifecycle
  newGame(mode: GameMode, o: NewGameOptions = {}): void {
    ui.loading.value = mode === 'sandbox' ? 'Forging a sandbox universe…' : 'Seeding your homeworld…';
    const seed = o.seed ?? Math.floor(Math.random() * 1e9);
    // tear the old world down first, so it is saved into the OLD empire (not restored into the new one)
    this.unloadPlanet();
    this.empire = Empire.create(mode, o.empireName ?? (mode === 'sandbox' ? 'Sandbox' : 'New Empire'), seed);
    this.clock.day = 0;
    this.clock.setSpeed(1);
    this.clock.timeOfDay = 0.28;
    this.autosaveTimer = 0;
    ui.mode.value = mode;
    ui.news.value = [];
    this.studio.loadFromEmpire();
    const home = this.cosmos.homePlanetSpec({ seed, name: o.planetName, type: o.planetType });
    const spec = o.frequency ? { ...home, frequency: o.frequency } : home;
    this.enterPlanet(spec, { cityName: o.cityName });
    ui.screen.value = 'game';
    ui.loading.value = null;
  }

  /**
   * Make `spec` the active planet: serialise the current one into the empire, then restore the target from
   * the empire (if colonised before) or generate it fresh.
   */
  enterPlanet(spec: PlanetSpec, o: { cityName?: string } = {}): Planet {
    this.unloadPlanet();
    const saved = this.empire.s.planets[spec.id];
    const planet = saved ? Planet.deserialize(saved, footprintOf) : generatePlanet(spec);
    if (!saved) {
      planet.city.foundedDay = Math.floor(this.clock.day);
      if (o.cityName) planet.city.name = o.cityName;
    }
    this.planet = planet;
    this.ops = new PlanetOps(planet);
    this.empire.s.currentPlanet = spec.id;
    if (!this.empire.s.visited.includes('planet:' + spec.id)) this.empire.s.visited.push('planet:' + spec.id);
    const view = new PlanetView(planet);
    this.planetView = view;
    this.camera.attach(view);
    this.setView(view);
    for (const s of this.systems) {
      try {
        s.onPlanetLoaded?.(planet);
      } catch (e) {
        console.error('[game] onPlanetLoaded failed', s, e);
      }
    }
    bus.emit('planet:loaded', { planet });
    ui.planetId.value = spec.id;
    ui.planetName.value = spec.name;
    ui.cityName.value = planet.city.name;
    ui.selection.value = null;
    this.publishUI();
    return planet;
  }

  /** Serialise and tear down the active planet (keeps the empire). */
  unloadPlanet(): void {
    const p = this.planet;
    if (!p) return;
    bus.emit('planet:unloading', { planet: p });
    for (const s of this.systems) {
      try {
        s.onPlanetUnloading?.(p);
      } catch (e) {
        console.error('[game] onPlanetUnloading failed', s, e);
      }
    }
    this.empire.s.planets[p.spec.id] = p.serialize();
    if (this.activeView === this.planetView) this.activeView = null;
    this.planetView?.dispose();
    this.planetView = null;
    this.planet = null;
    this.ops = null;
  }

  /** Switch the rendered view (planet / system / galaxy / universe / studio). */
  setView(view: View): void {
    if (this.activeView === view) return;
    this.activeView?.exit?.();
    this.activeView = view;
    view.onResize?.(this.engine.width, this.engine.height);
    view.enter?.();
    ui.view.value = view.kind;
    bus.emit('view:changed', { view: view.kind });
  }

  /** Return to the active planet's surface view. */
  showPlanet(): void {
    if (this.planetView) this.setView(this.planetView);
  }

  get viewKind(): ViewKind {
    return this.activeView?.kind ?? 'planet';
  }

  // ─────────────────────────────────────────────── save / load
  snapshot(slot: string): SaveFile {
    const e = this.empire;
    if (this.planet) e.s.planets[this.planet.spec.id] = this.planet.serialize();
    e.s.day = this.clock.day;
    return {
      v: 1,
      meta: {
        slot,
        name: e.s.name,
        mode: e.s.mode,
        planetName: this.planet?.spec.name ?? '',
        cityName: this.planet?.city.name,
        tier: e.s.tier,
        population: Math.round(this.sim.getMetric('population')),
        day: Math.floor(this.clock.day),
        savedAt: Date.now(),
      },
      empire: JSON.parse(JSON.stringify(e.s)),
    };
  }

  async save(slot = 'auto'): Promise<boolean> {
    if (!this.planet) return false;
    try {
      await writeSave(this.snapshot(slot));
      bus.emit('game:saved', { slot });
      return true;
    } catch (err) {
      console.error('[game] save failed', err);
      notify({ title: 'Save failed', body: String((err as Error).message ?? err), kind: 'bad', icon: '💾' });
      return false;
    }
  }

  async load(slot: string): Promise<boolean> {
    const f = await readSave(slot);
    if (!f) return false;
    ui.loading.value = 'Loading ' + f.meta.name + '…';
    this.unloadPlanet();
    this.empire = new Empire(f.empire);
    this.clock.day = f.empire.day;
    this.autosaveTimer = 0;
    ui.mode.value = f.empire.mode;
    ui.news.value = [];
    // custom (Architect Studio) designs must be registered before the planet deserialises, so their footprints resolve
    this.studio.loadFromEmpire();
    const id = f.empire.currentPlanet;
    const spec = f.empire.planets[id]?.spec ?? this.cosmos.planetSpec(id) ?? this.cosmos.homePlanetSpec();
    this.enterPlanet(spec);
    ui.screen.value = 'game';
    ui.loading.value = null;
    bus.emit('game:loaded', { slot });
    return true;
  }

  /** Quit to the main menu (autosaves first). */
  async quitToMenu(): Promise<void> {
    if (this.planet && settings.value.autosave) await this.save('auto');
    this.unloadPlanet();
    this.activeView = null;
    ui.screen.value = 'menu';
  }

  // ─────────────────────────────────────────────── main loop
  private frame = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden) return;
    this.step(dt);
  };

  /** One frame of game logic + render (exposed for tests / headless stepping). */
  step(dt: number): void {
    const inGame = ui.screen.value === 'game' && !!this.planet;
    const dayLength = this.planet?.spec.dayLength ?? 240;
    const days = inGame ? this.clock.advance(dt, dayLength) : (this.clock.time += dt, 0);
    if (inGame) this.empire.s.playSeconds += dt;
    if (days > 0 && this.planet) {
      try {
        this.sim.tick(days);
      } catch (e) {
        console.error('[game] sim.tick failed', e);
      }
      this.empire.s.day = this.clock.day;
    }
    for (const s of this.systems) {
      if (!s.update) continue;
      try {
        s.update(dt);
      } catch (e) {
        console.error('[game] system update failed', s, e);
      }
    }
    const pid = ui.panel.value;
    this.coveredFor = pid && panels.get(pid)?.kind === 'full' ? this.coveredFor + dt : 0;
    if (this.activeView) {
      try {
        this.activeView.update(dt);
        // a full-screen panel hides the world: keep simulating, stop drawing once its fade-in is done
        if (this.coveredFor < 0.5) this.engine.render(this.activeView, dt);
      } catch (e) {
        console.error('[game] render failed', e);
      }
    } else if (ui.screen.value !== 'game') {
      this.engine.renderer.clear();
    }
    // lens refresh
    if (ui.lens.value && this.planetView && (this.lensTimer -= dt) <= 0) {
      this.lensTimer = 1.5;
      const lens = this.sim.lenses.find((l) => l.id === ui.lens.value);
      if (lens) this.planetView.surface.overlay.showValues(lens.values(this.planetView.planet), lens.ramp);
    }
    // fps
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) {
      ui.fps.value = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if ((this.uiTimer -= dt) <= 0) {
      this.uiTimer = 0.2;
      this.publishUI();
    }
    if (inGame && settings.value.autosave && (this.autosaveTimer += dt) > settings.value.autosaveMinutes * 60) {
      this.autosaveTimer = 0;
      void this.save('auto');
    }
  }

  /** Push game state into UI signals (≈5 Hz). */
  publishUI(): void {
    const st = this.sim.stats;
    ui.money.value = Math.floor(this.empire.money);
    ui.research.value = Math.floor(this.empire.s.research);
    ui.population.value = Math.floor(st.population ?? 0);
    ui.happiness.value = Math.round(st.happiness ?? 50);
    ui.income.value = Math.round(st.monthlyIncome ?? 0);
    ui.demand.value = { ...this.sim.demand };
    ui.stats.value = { ...st };
    ui.dateLabel.value = this.clock.label();
    ui.day.value = Math.floor(this.clock.day);
    ui.speed.value = this.clock.speed;
    ui.tier.value = this.empire.s.tier;
    ui.canUndo.value = this.commands.canUndo;
    ui.canRedo.value = this.commands.canRedo;
    if (this.planet) ui.cityName.value = this.planet.city.name;
  }

  /** Small machine-readable status for tests. */
  debugInfo(): Record<string, unknown> {
    return {
      screen: ui.screen.value,
      view: this.viewKind,
      planet: this.planet?.spec.id ?? null,
      tiles: this.planet?.count ?? 0,
      buildings: this.planet?.buildings.size ?? 0,
      props: this.planet?.props.size ?? 0,
      population: this.sim.getMetric('population'),
      money: this.empire.money,
      day: Math.floor(this.clock.day),
      fps: ui.fps.value,
      tier: this.engine.tier,
      render: this.engine.info(),
    };
  }
}
