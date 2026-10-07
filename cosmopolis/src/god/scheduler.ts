/**
 * OWNER: god.
 * Scheduler — random natural disasters (career only, settings.randomDisasters). Rare: on average one every
 * ~7 in-game months once the city has 300+ citizens, never two at once, at least ~3 months apart. Each one is
 * picked from the planet archetype's hazard list (weather / earth / sky powers only), aimed near the city and
 * TELEGRAPHED: a warning toast + countdown overlay ~10 s before it strikes, so players can brace (or pause).
 */
import type { Game } from '../game/Game';
import { settings } from '../core/settings';
import { bus } from '../core/events';
import { PLANET_TYPES } from '../content/planetTypes';
import { notify } from '../ui/store';
import type { GodPowers } from './GodPowers';
import { godUi, nextKey } from './state';

/** archetype hazard names → power ids */
const HAZARD_POWERS: Record<string, string[]> = {
  tornado: ['tornado'],
  earthquake: ['earthquake'],
  quake: ['earthquake'],
  icequake: ['earthquake', 'flash_freeze'],
  moonquake: ['earthquake'],
  shatterquake: ['earthquake'],
  resonance: ['earthquake'],
  tsunami: ['tsunami'],
  wildfire: ['wildfire'],
  meteor: ['meteor', 'meteor_shower'],
  sandstorm: ['sandstorm'],
  heatwave: ['heatwave'],
  blizzard: ['blizzard'],
  avalanche: ['landslide'],
  eruption: ['volcano'],
  lavaflow: ['volcano', 'rift'],
  hurricane: ['thunderstorm', 'hypercane'],
  monsoon: ['thunderstorm', 'megaflood'],
  acidrain: ['acid_rain'],
  solarflare: ['solar_flare'],
  sporestorm: ['thunderstorm'],
};
const FALLBACK = ['lightning', 'thunderstorm', 'earthquake', 'meteor', 'tornado'];

const WARN: Record<string, { title: string; body: string }> = {
  tornado: { title: 'Tornado warning', body: 'Rotation detected near the city. Secure anything you love.' },
  earthquake: { title: 'Seismic alert', body: 'Foreshocks detected. Stand in a doorway. Any doorway.' },
  tsunami: { title: 'Tsunami warning', body: 'The sea is pulling back. Head for high ground.' },
  wildfire: { title: 'Fire weather', body: 'Dry winds and tinder-dry forests. Firefighters on alert.' },
  meteor: { title: 'Impact alert', body: 'Observatories track an incoming meteor. Do not look up. Or do.' },
  meteor_shower: { title: 'Meteor shower inbound', body: 'A debris stream is crossing our orbit. Expect fireworks.' },
  sandstorm: { title: 'Dust wall approaching', body: 'A haboob is rolling in. Close the windows.' },
  heatwave: { title: 'Heat dome forming', body: 'Record temperatures expected. Hydrate.' },
  blizzard: { title: 'Blizzard warning', body: 'A polar front is moving in. Stock up on cocoa.' },
  flash_freeze: { title: 'Flash freeze', body: 'Temperatures are plummeting. Fast.' },
  landslide: { title: 'Slope failure risk', body: 'Saturated hillsides are starting to move.' },
  volcano: { title: 'Volcanic unrest', body: 'Ground swelling detected. Something is coming up.' },
  rift: { title: 'Rift activity', body: 'The crust is splitting. Magma is very interested in your city.' },
  thunderstorm: { title: 'Severe storm', body: 'A supercell is building. Lightning likely.' },
  hypercane: { title: 'Hypercane forming', body: 'An ocean storm of unprecedented size is spinning up.' },
  megaflood: { title: 'Flood warning', body: 'Sea levels are surging. Move valuables upstairs.' },
  acid_rain: { title: 'Acid rain advisory', body: 'Umbrellas will not help. Stay inside.' },
  solar_flare: { title: 'Solar storm', body: 'A coronal mass ejection is inbound. Expect outages.' },
  lightning: { title: 'Lightning risk', body: 'Static is building over the city.' },
};

export class Scheduler {
  private cooldownDays = 60;
  private pending: { id: string; tile: number; at: number; intensity: number } | null = null;
  private offs: (() => void)[] = [];

  constructor(private game: Game, private god: GodPowers) {
    this.offs.push(bus.on('sim:day', () => this.onDay()));
  }

  reset(): void {
    this.pending = null;
    this.cooldownDays = 60;
    godUi.warning.value = null;
  }

  private get enabled(): boolean {
    const g = this.game;
    return !!g.planet && !g.empire.sandbox && settings.value.randomDisasters && g.activeView === g.planetView;
  }

  private onDay(): void {
    if (!this.enabled || this.pending || this.god.active > 0) return;
    if (this.cooldownDays > 0) {
      this.cooldownDays--;
      return;
    }
    let pop = 0;
    try {
      pop = this.game.sim.getMetric('population');
    } catch {
      pop = 0;
    }
    if (pop < 300) return;
    // ~1 per 210 days on average
    if (Math.random() > 1 / 210) return;
    this.schedule();
  }

  /** Pick a hazard for this world and telegraph it. (Also handy from the console.) */
  schedule(forceId?: string): boolean {
    const g = this.game;
    const p = g.planet;
    if (!p) return false;
    const arch = PLANET_TYPES[p.spec.type];
    const pool: string[] = [];
    for (const h of arch?.hazards ?? []) for (const id of HAZARD_POWERS[h] ?? []) pool.push(id);
    const candidates = (forceId ? [forceId] : pool.length ? pool : FALLBACK).filter((id) => {
      const d = this.god.get(id);
      return d && d.natural && (d.category === 'weather' || d.category === 'earth' || d.category === 'sky');
    });
    if (!candidates.length) return false;
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    // aim near the city: a random building's tile, offset a bit
    const tiles: number[] = [];
    for (const b of p.buildings.values()) tiles.push(b.tile);
    if (!tiles.length) return false;
    const center = tiles[Math.floor(Math.random() * tiles.length)];
    const disk = p.grid.disk(center, 4);
    const tile = disk[Math.floor(Math.random() * disk.length)];
    const lead = 10_000;
    this.pending = { id, tile, at: performance.now() + lead, intensity: 0.65 + Math.random() * 0.45 };
    const def = this.god.get(id)!;
    const w = WARN[id] ?? { title: `${def.name} incoming`, body: def.description };
    godUi.warning.value = { key: nextKey(), title: w.title, body: w.body, icon: def.icon, at: this.pending.at, tile };
    notify({ title: w.title, body: w.body, kind: 'warn', icon: def.icon, tile });
    this.god.sfx('alarm', 0.6);
    this.cooldownDays = 90;
    return true;
  }

  update(dt: number): void {
    const pd = this.pending;
    if (!pd) return;
    if (!this.game.planet) {
      this.reset();
      return;
    }
    // a paused world holds its breath
    if (this.game.clock.speed === 0) {
      pd.at += dt * 1000;
      const w = godUi.warning.value;
      if (w) godUi.warning.value = { ...w, at: pd.at };
      return;
    }
    if (performance.now() >= pd.at) {
      this.pending = null;
      godUi.warning.value = null;
      this.god.trigger(pd.id, { tile: pd.tile }, { natural: true, intensity: pd.intensity });
    }
  }

  dispose(): void {
    this.offs.forEach((f) => f());
  }
}
