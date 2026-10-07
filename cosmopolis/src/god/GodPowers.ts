/**
 * OWNER: god.
 * GodPowers — disasters and divine interventions, from a lightning bolt to swallowing the planet with a black hole.
 * 50+ powers in 7 categories (god/powers/*). Each power has gameplay effects through PlanetOps (god/damage.ts),
 * bespoke FX (render/fx), camera shake, audio, screen flashes, news and a damage report. Planet-ending powers
 * confirm first (tools / UI) and every destructive power is covered by Chrono (snapshot → Rewind Time banner).
 *
 * CONTRACT
 *   powers: GodPowerDef[]               (PowerSpec[] — GodPowerDef + run())
 *   trigger(id, target?) → boolean      target: { tile?, point?, path? }   (false when locked / cooling / invalid)
 *   stopAll()                           active: number (running effects)
 * Extras (UI / tests)
 *   chrono: Chrono (rewind(), accept(), available) · cooldownLeft(id) · locked(id) → reason | null
 *   want(effectKey, mods) — world modifiers (apocalypse tint, storm, sun dim, aurora, night lights) mixed per frame
 *   frame(dir|tile, distance, tilt?) — cinematic camera for big events · sfx / loop / shake / flash / news helpers
 *   scheduler: random natural disasters in career when settings.randomDisasters (telegraphed with a warning)
 *
 * URL hooks: &god=<powerId>[&godTile=<n>][&godIntensity=0.5..2][&godPath=a,b,c][&godChoice=<id>] trigger once ready
 * (default tile: the camera target; drag powers get an automatic path through the city).
 *
 * Persistence: planet.ext.god = { star?, events } (a supernova leaves a neutron star behind…).
 */
import { Vector3 } from 'three';
import type { Game } from '../game/Game';
import { getItem } from '../content/catalog';
import type { System } from '../game/System';
import { TileFlag, type LoopName, type SfxName, type StarKind } from '../core/types';
import { bus } from '../core/events';
import { settings } from '../core/settings';
import { Rng } from '../core/rng';
import { shared } from '../render/materials';
import type { LoopHandle } from '../audio/AudioEngine';
import type { Planet } from '../world/planet';
import { tileNormal } from '../world/geo';
import { notify, pushNews, ui } from '../ui/store';
import { Chrono } from './chrono';
import { Damage, buildingHeight } from './damage';
import { PRESETS, fxRand } from '../render/fx/particles';
import { Effect, type PowerCtx, type PowerSpec } from './effect';
import { godUi, screenFlash, showBanner } from './state';
import { Scheduler } from './scheduler';
import { POWERS } from './powers';

export type GodCategory = 'weather' | 'earth' | 'sky' | 'cosmic' | 'creature' | 'creation' | 'apocalypse';

export interface GodTarget {
  tile?: number;
  point?: Vector3;
  path?: number[];
}

export interface GodPowerDef {
  id: string;
  name: string;
  icon: string;
  category: GodCategory;
  description: string;
  flavor?: string;
  /** 'tile' = tap a spot, 'drag' = draw a path, 'global' = whole planet, no target */
  targeting: 'tile' | 'drag' | 'global';
  /** career tier required (sandbox ignores) */
  tier?: number;
  /** destroys / transforms the whole planet — confirm + Chrono snapshot */
  planetEnding?: boolean;
  /** seconds */
  cooldown?: number;
  /** 0 benevolent … 5 catastrophic (UI danger rating; ≥ 1 is destructive → snapshot; ≥ 4 offers Rewind) */
  danger?: number;
  /** can strike on its own as a random natural disaster (career) */
  natural?: boolean;
  /** UI accent colour (0xRRGGBB) */
  color?: number;
  /** short targeting tip shown in the panel */
  tip?: string;
  /** confirm before casting even though it is not planet-ending */
  confirm?: boolean;
  /** take a Chrono snapshot even though it's benevolent (world-changing miracles can be undone) */
  rewindable?: boolean;
  /** variants the player picks in the God panel (e.g. terraform target); the pick arrives as ctx.choice */
  choices?: { id: string; label: string; icon?: string }[];
}

/** Planet-level persistent god state (planet.ext.god). */
export interface GodPlanetState {
  star?: StarKind;
  /** count of disasters endured on this world */
  events?: number;
}

export interface WorldMods {
  /** 0..1 apocalypse tint (max wins) */
  apocalypse?: number;
  /** sunlight multiplier (product) */
  sun?: number;
  /** 0..1 window / street lights multiplier (min wins) */
  lights?: number;
  /** cloud cover override 0..1 (max wins) */
  clouds?: number;
  /** storminess 0..1 (max wins) */
  storm?: number;
  /** aurora intensity (max wins) */
  aurora?: number;
  /** lava / crystal glow multiplier (max wins) */
  glow?: number;
  /** red screen vignette 0..1 (max wins) */
  dread?: number;
}

export const CATEGORY_COLOR: Record<GodCategory, number> = {
  weather: 0x7cc4ff,
  earth: 0xffb35c,
  sky: 0xffe066,
  cosmic: 0xa77bff,
  creature: 0x9be564,
  creation: 0x5ef2a0,
  apocalypse: 0xff5a6e,
};

const _v = new Vector3();
const _n2 = new Vector3();
const _p2 = new Vector3();

export class GodPowers implements System {
  powers: GodPowerDef[] = POWERS;
  active = 0;
  readonly chrono: Chrono;
  readonly scheduler: Scheduler;
  private effects: Effect[] = [];
  private byId = new Map<string, PowerSpec>(POWERS.map((p) => [p.id, p]));
  private mods = new Map<number, WorldMods>();
  private modsActive = false;
  private cur = { apocalypse: 0, sun: 1, lights: 1, clouds: -1, storm: 0, aurora: -1, glow: -1, dread: 0 };
  private uiTimer = 0;
  private urlDone = false;
  private damageCache: { planet: Planet; dmg: Damage } | null = null;
  private seed = (Date.now() & 0xffffff) ^ 0x5bd1e995;
  private offs: (() => void)[] = [];
  /** tiles currently on fire (flames & smoke drawn over them — the sim spreads and fights the fires) */
  private fires = new Set<number>();
  private fireList: number[] = [];
  private fireDirty = false;
  private fireTimer = 0;

  constructor(private game: Game) {
    this.chrono = new Chrono(game);
    this.scheduler = new Scheduler(game, this);
  }

  init(): void {
    this.offs.push(
      bus.on('game:loaded', () => this.chrono.clear()),
      bus.on('tiles:flags', ({ tiles }) => {
        const p = this.game.planet;
        if (!p) return;
        for (const t of tiles) {
          if (p.flags[t] & TileFlag.Burning) this.fires.add(t);
          else this.fires.delete(t);
        }
        this.fireDirty = true;
      }),
    );
  }

  onPlanetLoaded(planet: Planet): void {
    this.damageCache = null;
    this.fires.clear();
    for (let t = 0; t < planet.count; t++) if (planet.flags[t] & TileFlag.Burning) this.fires.add(t);
    this.fireDirty = true;
    const st = this.state(planet);
    // a world that lost its sun keeps the remnant
    if (st.star) {
      try {
        this.game.planetView?.env.setStar(st.star);
      } catch {
        /* env optional */
      }
    }
    this.scheduler.reset();
  }

  onPlanetUnloading(): void {
    this.stopAll(true);
    this.damageCache = null;
  }

  dispose(): void {
    this.stopAll(true);
    this.offs.forEach((f) => f());
  }

  // ─────────────────────────────────────────────── queries

  get(id: string): PowerSpec | undefined {
    return this.byId.get(id);
  }

  /** Planet-level persistent state. */
  state(planet: Planet | null = this.game.planet): GodPlanetState {
    if (!planet) return {};
    let s = planet.ext.god as GodPlanetState | undefined;
    if (!s || typeof s !== 'object') planet.ext.god = s = {};
    return s;
  }

  /** Reason a power can't be used (career tiers), or null. */
  locked(id: string): string | null {
    const def = this.byId.get(id);
    if (!def) return 'Unknown power';
    const e = this.game.empire;
    if (e.sandbox) return null;
    const tier = def.tier ?? 0;
    let ok: boolean;
    try {
      const prog = this.game.progression as unknown as { isUnlocked?: (k: string) => boolean };
      ok = typeof prog?.isUnlocked === 'function' ? !!prog.isUnlocked('power:' + id) : tier <= e.s.tier;
    } catch {
      ok = tier <= e.s.tier;
    }
    if (ok) return null;
    const names = ['Outpost', 'Settlement', 'Township', 'Colony City', 'Metropolis', 'Megacity', 'Interplanetary Power', 'Stellar Civilisation', 'Galactic Civilisation'];
    return `Unlocks at ${names[tier] ?? 'tier ' + tier}`;
  }

  /** Seconds until a power may be cast again (career). */
  cooldownLeft(id: string): number {
    if (this.game.empire.sandbox) return 0;
    const until = godUi.cooldowns.value[id] ?? 0;
    return Math.max(0, (until - performance.now()) / 1000);
  }

  /** Damage helper bound to the active planet. */
  damage(): Damage | null {
    const g = this.game;
    if (!g.planet || !g.ops || !g.planetView) return null;
    if (!this.damageCache || this.damageCache.planet !== g.planet) this.damageCache = { planet: g.planet, dmg: new Damage(g.planet, g.ops, g.planetView, g.planetView.fx) };
    return this.damageCache.dmg;
  }

  /** Count of defensive orbitals (items tagged "defense") around the active planet. */
  defenses(): number {
    const p = this.game.planet;
    if (!p) return 0;
    let n = 0;
    for (const o of p.orbitals.values()) {
      const tags = getTags(o.defId);
      if (tags.includes('defense')) n++;
    }
    return n;
  }

  // ─────────────────────────────────────────────── trigger

  trigger(id: string, target: GodTarget = {}, o: { natural?: boolean; intensity?: number; choice?: string; camera?: boolean } = {}): boolean {
    const g = this.game;
    const def = this.byId.get(id);
    const planet = g.planet, ops = g.ops, view = g.planetView;
    if (!def || !planet || !ops || !view) return false;
    if (g.activeView !== view) g.showPlanet();
    if (!o.natural) {
      if (this.locked(id)) return false;
      if (this.cooldownLeft(id) > 0) return false;
    }
    // resolve the target
    let tile = target.tile;
    if (tile === undefined || tile < 0 || tile >= planet.count) {
      if (target.point) tile = planet.grid.tileAt(target.point.x, target.point.y, target.point.z);
      else if (target.path?.length) tile = target.path[0];
      else tile = safeTargetTile(g);
    }
    const ctx: PowerCtx = {
      game: g,
      god: this,
      planet,
      ops,
      view,
      fx: view.fx,
      def,
      target: { ...target, tile },
      intensity: Math.max(0.35, Math.min(2.5, o.intensity ?? godUi.intensity.value ?? 1)),
      rng: new Rng((this.seed = (this.seed * 1103515245 + 12345) >>> 0)),
      natural: !!o.natural,
      choice: o.choice ?? godUi.choice.value[id] ?? def.choices?.[0]?.id,
      camera: o.camera ?? true,
    };
    if (def.targeting === 'drag' && (!ctx.target.path || ctx.target.path.length < 2)) ctx.target.path = autoPath(planet, tile, ctx.rng);
    if (def.resolve && !def.resolve(ctx)) return false;
    const destructive = (def.danger ?? 0) >= 1 || !!def.planetEnding;
    if (destructive || def.rewindable) this.chrono.snapshot(def.name, this.effects.length);
    let eff: Effect | null = null;
    try {
      eff = def.run(ctx);
    } catch (e) {
      console.error('[god] power failed to start', id, e);
      return false;
    }
    if (eff) {
      (eff as Effect & { destructive?: boolean }).destructive = destructive;
      this.effects.push(eff);
      this.active = this.effects.length;
    }
    if (destructive) bus.emit('disaster:start', { powerId: id, tile: ctx.target.tile });
    if (!eff && destructive) bus.emit('disaster:end', { powerId: id });
    // bookkeeping
    if (!g.empire.sandbox && def.cooldown) godUi.cooldowns.value = { ...godUi.cooldowns.value, [id]: performance.now() + def.cooldown * 1000 };
    if (!o.natural) godUi.recent.value = [id, ...godUi.recent.value.filter((x) => x !== id)].slice(0, 6);
    if (destructive) this.state(planet).events = (this.state(planet).events ?? 0) + 1;
    this.publish();
    return true;
  }

  /** Stop every running effect (planet change, rewind). */
  stopAll(silent = false): void {
    const list = this.effects;
    this.effects = [];
    for (const e of list) {
      try {
        e.end();
      } catch (err) {
        console.error('[god] effect end failed', err);
      }
      if (!silent && (e as Effect & { destructive?: boolean }).destructive) bus.emit('disaster:end', { powerId: e.ctx.def.id });
    }
    this.mods.clear();
    this.active = 0;
    try {
      this.game.planetView?.fx.clearAll();
    } catch {
      /* view gone */
    }
    this.applyMods(1, true);
    godUi.dread.value = 0;
    this.publish();
  }

  // ─────────────────────────────────────────────── frame

  update(dt: number): void {
    const g = this.game;
    this.chrono.update();
    this.urlHook();
    const view = g.planetView;
    if (view) {
      // freeze FX while composing a photo of a paused world
      const freeze = ui.photo.value && g.clock.speed === 0;
      view.fx.timeScale = freeze ? 0 : 1;
    }
    const fdt = view && view.fx.timeScale === 0 ? 0 : dt;
    if (this.effects.length) {
      this.chrono.touch();
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const e = this.effects[i];
        if (fdt > 0) {
          e.t += fdt;
          try {
            e.step(fdt);
            e.tickBeams();
          } catch (err) {
            console.error('[god] effect step failed', e.ctx.def.id, err);
            e.done = true;
          }
        }
        if (e.done) {
          this.effects.splice(i, 1);
          this.finish(e);
        }
      }
      this.active = this.effects.length;
    }
    this.applyMods(dt, false);
    if (view && fdt > 0 && this.fires.size) this.drawFires(fdt);
    try {
      this.scheduler.update(dt);
    } catch (err) {
      console.error('[god] scheduler failed', err);
    }
    if ((this.uiTimer -= dt) <= 0) {
      this.uiTimer = 0.25;
      this.publish();
    }
  }

  /** Flames, embers and smoke columns over burning tiles (amortised: a few tiles per tick). */
  private drawFires(dt: number): void {
    if ((this.fireTimer -= dt) > 0) return;
    this.fireTimer = 0.06;
    const g = this.game;
    const p = g.planet, view = g.planetView;
    if (!p || !view) return;
    if (this.fireDirty) {
      this.fireList = [...this.fires];
      this.fireDirty = false;
    }
    const fx = view.fx;
    const n = Math.min(this.fireList.length, fx.q(8));
    for (let i = 0; i < n; i++) {
      const t = this.fireList[Math.floor(fxRand() * this.fireList.length)];
      if (!(p.flags[t] & TileFlag.Burning)) continue;
      const id = p.building[t];
      const b = id >= 0 ? p.buildings.get(id) : undefined;
      const h = b ? Math.min(5, buildingHeight(b) * 0.75) : 0.1;
      tileNormal(p, t, _n2);
      fx.surface(t, _p2, h);
      fx.particles.emit(PRESETS.fire, _p2, _n2, b ? 5 : 3, 1.2, b ? 1.6 : 1.1);
      if (fxRand() < 0.6) fx.particles.emit(PRESETS.darkSmoke, _p2.addScaledVector(_n2, 1), _n2, 1, 0.8, b ? 0.75 : 0.5, 1.2);
      if (fxRand() < 0.3) fx.particles.emit(PRESETS.ember, _p2, _n2, 2, 1.2);
    }
  }

  private finish(e: Effect): void {
    try {
      e.end();
    } catch (err) {
      console.error('[god] effect end failed', err);
    }
    this.mods.delete(e.key);
    const def = e.ctx.def;
    const destructive = (e as Effect & { destructive?: boolean }).destructive;
    if (destructive) bus.emit('disaster:end', { powerId: def.id });
    this.reportDamage(e);
    if (destructive && ((def.danger ?? 0) >= 4 || def.planetEnding) && !godUi.rewind.value && !godUi.rewinding.value) this.chrono.offer(!!def.planetEnding);
  }

  private reportDamage(e: Effect): void {
    const r = e.report;
    if (r.destroyed + r.burned + r.flooded + r.frozen <= 0) return;
    const def = e.ctx.def;
    const parts: string[] = [];
    if (r.destroyed) parts.push(`${r.destroyed} building${r.destroyed === 1 ? '' : 's'} destroyed`);
    if (r.displaced >= 1) parts.push(`~${fmt(Math.round(r.displaced))} displaced`);
    if (r.burned) parts.push(`${r.burned} tiles ablaze`);
    if (r.flooded) parts.push(`${r.flooded} tiles flooded`);
    if (r.frozen) parts.push(`${r.frozen} tiles frozen`);
    const body = parts.join(' · ');
    if (r.destroyed >= 3 || r.burned + r.flooded + r.frozen >= 12) notify({ title: `${def.name} aftermath`, body, kind: 'bad', icon: def.icon, tile: e.ctx.target.tile });
    const quips = [
      `Insurance adjusters are calling it "an act of god". Technically correct.`,
      `The mayor says the city will rebuild "bigger, better and slightly further away".`,
      `Local hardware stores report record sales of brooms.`,
      `Experts recommend "not being there next time".`,
      `Thoughts and prayers have been sent. Prayers were, it seems, received.`,
    ];
    pushNews({ author: 'Cosmo News 24', handle: '@cosmonews', icon: '📰', text: `${def.name} report: ${body}. ${quips[Math.floor(Math.random() * quips.length)]}`, tile: e.ctx.target.tile });
  }

  // ─────────────────────────────────────────────── world modifiers

  /** Request world modifiers for an effect (cleared automatically when it ends). */
  want(effectKey: number, m: WorldMods): void {
    this.mods.set(effectKey, { ...(this.mods.get(effectKey) ?? {}), ...m });
  }

  private applyMods(dt: number, snap: boolean): void {
    const view = this.game.planetView;
    if (!this.mods.size && !this.modsActive) return;
    let apocalypse = 0, sun = 1, lights = 1, clouds = -1, storm = 0, aurora = -1, glow = -1, dread = 0;
    for (const m of this.mods.values()) {
      if (m.apocalypse !== undefined) apocalypse = Math.max(apocalypse, m.apocalypse);
      if (m.sun !== undefined) sun *= m.sun;
      if (m.lights !== undefined) lights = Math.min(lights, m.lights);
      if (m.clouds !== undefined) clouds = Math.max(clouds, m.clouds);
      if (m.storm !== undefined) storm = Math.max(storm, m.storm);
      if (m.aurora !== undefined) aurora = Math.max(aurora, m.aurora);
      if (m.glow !== undefined) glow = Math.max(glow, m.glow);
      if (m.dread !== undefined) dread = Math.max(dread, m.dread);
    }
    const c = this.cur;
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.2);
    c.apocalypse += (apocalypse - c.apocalypse) * k;
    c.sun += (sun - c.sun) * k;
    c.lights += (lights - c.lights) * (snap ? 1 : 1 - Math.exp(-dt * 6));
    c.storm += (storm - c.storm) * k;
    c.dread += (dread - c.dread) * k;
    shared.uApocalypse.value = c.apocalypse < 0.002 ? 0 : c.apocalypse;
    shared.uNightLights.value = c.lights;
    godUi.dread.value = c.dread < 0.01 ? 0 : Math.round(c.dread * 100) / 100;
    if (view) {
      try {
        view.env.sunBoost = c.sun;
        const s = view.surface;
        s.setStorm(c.storm < 0.01 ? 0 : c.storm);
        s.setCloudCover(clouds >= 0 ? clouds : null);
        s.setAurora(aurora >= 0 ? aurora : null);
        if (glow >= 0) s.setGlow(glow);
        else if (c.glow >= 0) s.setGlow(1);
        c.glow = glow;
        c.clouds = clouds;
        c.aurora = aurora;
      } catch {
        /* surface/env may be in flux */
      }
    }
    const settled = !this.mods.size && c.apocalypse < 0.002 && Math.abs(c.sun - 1) < 0.002 && Math.abs(c.lights - 1) < 0.002 && c.storm < 0.01 && c.dread < 0.01;
    this.modsActive = !settled;
    if (settled) {
      c.apocalypse = 0;
      c.sun = 1;
      c.lights = 1;
      c.storm = 0;
      c.dread = 0;
      shared.uApocalypse.value = 0;
      shared.uNightLights.value = 1;
      if (view) {
        try {
          view.env.sunBoost = 1;
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ─────────────────────────────────────────────── services for effects

  sfx(name: SfxName, volume = 1, pitch = 1): void {
    try {
      this.game.audio?.sfx(name, { volume, pitch });
    } catch {
      /* audio optional */
    }
  }

  loop(name: LoopName, volume = 0.6): LoopHandle {
    try {
      const h = this.game.audio?.loop(name, { volume });
      if (h) return h;
    } catch {
      /* audio optional */
    }
    return { setVolume() {}, stop() {} };
  }

  shake(intensity: number, seconds: number): void {
    try {
      this.game.camera?.shake(intensity, seconds);
    } catch {
      /* camera optional */
    }
  }

  /** World light flash + (optionally) a screen flash overlay. */
  flash(color: number, intensity = 2, seconds = 1, screen = 0): void {
    try {
      this.game.planetView?.env.flash(color, intensity, seconds);
    } catch {
      /* env optional */
    }
    if (screen > 0 && !settings.value.reduceMotion) screenFlash('#' + color.toString(16).padStart(6, '0'), screen, Math.max(0.25, seconds * 0.8));
    else if (screen > 0) screenFlash('#' + color.toString(16).padStart(6, '0'), screen * 0.35, Math.max(0.25, seconds * 0.8));
  }

  banner(title: string, subtitle: string | undefined, icon: string, color: number, duration = 4.2): void {
    showBanner(title, subtitle, icon, '#' + color.toString(16).padStart(6, '0'), duration);
  }

  news(author: string, handle: string, icon: string, text: string, tile?: number): void {
    pushNews({ author, handle, icon, text, tile });
  }

  /**
   * Start a sim city event (real gameplay mods: happiness, tourism, health…) re-using one of the sim's event ids
   * (cityEvents.ts) under a custom name — e.g. an aurora show runs as a 'festival'. Duck-typed: no-op if the sim
   * doesn't expose events.
   */
  cityEvent(id: string, name: string, icon: string, description: string, days: number, tile?: number): void {
    try {
      const sim = this.game.sim as unknown as { events?: { id: string; name: string; icon: string; description: string; daysLeft: number; tile?: number }[]; recomputeMods?: () => void };
      if (!Array.isArray(sim.events)) return;
      const ex = sim.events.find((e) => e.id === id);
      if (ex) {
        ex.daysLeft = Math.max(ex.daysLeft, days);
        ex.name = name;
        ex.icon = icon;
        ex.description = description;
      } else sim.events.push({ id, name, icon, description, daysLeft: days, tile });
      if (typeof sim.recomputeMods === 'function') sim.recomputeMods();
    } catch (e) {
      console.warn('[god] city event failed', e);
    }
  }

  /**
   * Fly the camera to frame an event (tile or direction). `toward` (tile or direction) turns the view so the
   * camera looks across the target toward it (e.g. from the coast out to sea, where the tsunami comes from).
   */
  frame(where: number | Vector3, distance: number, tilt?: number, duration?: number, toward?: number | Vector3): void {
    try {
      const cam = this.game.camera;
      const p = this.game.planet;
      const dir = typeof where === 'number' ? (p ? tileNormal(p, where, new Vector3()) : new Vector3(0, 0, 1)) : where.clone().normalize();
      let heading: number | undefined;
      if (toward !== undefined) {
        const to = typeof toward === 'number' ? (p ? tileNormal(p, toward, new Vector3()) : dir.clone()) : toward.clone().normalize();
        heading = headingToward(dir, to);
      }
      void cam.flyTo(dir, { distance, tilt, duration, heading });
    } catch {
      /* camera optional */
    }
  }

  // ─────────────────────────────────────────────── UI publish & URL hook

  private publish(): void {
    godUi.active.value = this.effects
      .filter((e) => !e.done)
      .map((e) => ({ key: e.key, id: e.ctx.def.id, name: e.ctx.def.name, icon: e.ctx.def.icon, category: e.ctx.def.category, progress: e.progress }));
  }

  private urlHook(): void {
    if (this.urlDone) return;
    const w = globalThis as unknown as { __cosmo?: { ready?: boolean; params?: URLSearchParams } };
    if (!w.__cosmo) {
      this.urlDone = true;
      return;
    }
    if (!w.__cosmo.ready || !this.game.planet) return;
    this.urlDone = true;
    const params = w.__cosmo.params ?? new URLSearchParams(location.search);
    const id = params.get('god');
    if (!id) return;
    const target: GodTarget = {};
    if (params.has('godTile')) target.tile = Number(params.get('godTile'));
    if (params.has('godPath')) target.path = params.get('godPath')!.split(',').map(Number).filter((n) => Number.isFinite(n));
    const intensity = params.has('godIntensity') ? Number(params.get('godIntensity')) : undefined;
    const choice = params.get('godChoice') ?? undefined;
    const ok = this.trigger(id, target, { intensity, choice });
    console.info(`[god] url trigger ${id} → ${ok}`);
  }
}

/** CameraRig heading (radians from local north) that looks from `at` toward `to` (both unit directions). */
export function headingToward(at: Vector3, to: Vector3): number {
  const up = _v.copy(at).normalize();
  const n0 = new Vector3(0, 1, 0).addScaledVector(up, -up.y);
  if (n0.lengthSq() < 1e-8) n0.set(0, 0, up.y > 0 ? -1 : 1);
  n0.normalize();
  const r0 = new Vector3().crossVectors(n0, up).normalize();
  const d = to.clone().addScaledVector(up, -to.dot(up));
  if (d.lengthSq() < 1e-10) return 0;
  return Math.atan2(d.dot(r0), d.dot(n0));
}

function getTags(defId: string): string[] {
  return getItem(defId)?.tags ?? [];
}

/** The tile the camera is looking at (or the city centre). */
function safeTargetTile(g: Game): number {
  try {
    const t = g.camera.targetTile();
    if (t >= 0) return t;
  } catch {
    /* ignore */
  }
  const p = g.planet!;
  for (const b of p.buildings.values()) return b.tile;
  return 0;
}

/** A wandering path of ~18–30 tiles from `start` (drag powers without a drawn path). */
export function autoPath(p: Planet, start: number, rng: Rng): number[] {
  const g = p.grid;
  // head toward the densest nearby building cluster, then wander
  let goal = -1;
  let best = -1;
  for (const t of g.disk(start, 9)) {
    if (p.building[t] < 0) continue;
    let s = 0;
    for (const n of g.disk(t, 2)) if (p.building[n] >= 0) s++;
    s += rng.next() * 2;
    if (s > best) {
      best = s;
      goal = t;
    }
  }
  const path = [start];
  let cur = start;
  const len = 18 + Math.floor(rng.next() * 12);
  let heading = -1;
  for (let i = 0; i < len; i++) {
    const nbrs = g.neighbors(cur);
    let next: number;
    if (goal >= 0 && cur !== goal && i < len * 0.6) {
      const step = g.path(cur, goal);
      next = step[1] ?? nbrs[0];
    } else {
      if (heading < 0) heading = Math.floor(rng.next() * nbrs.length);
      heading = (heading + (rng.next() < 0.3 ? (rng.next() < 0.5 ? 1 : -1) : 0) + nbrs.length) % nbrs.length;
      next = nbrs[heading % nbrs.length];
    }
    if (path.includes(next)) next = nbrs[Math.floor(rng.next() * nbrs.length)];
    path.push(next);
    cur = next;
  }
  return path;
}

function fmt(n: number): string {
  return n >= 10000 ? Math.round(n / 1000) + 'k' : n.toLocaleString('en-US');
}
