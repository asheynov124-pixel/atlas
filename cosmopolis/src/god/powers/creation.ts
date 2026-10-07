/**
 * OWNER: god.
 * Creation powers (benevolent): blessing (a pillar of golden light: Blessed tiles, damage healed, abandoned homes
 * revived), raise mountain, create island, plant forest, rain of gold (money + a festival), terraform world (sweep
 * the globe into another archetype — pick it in the panel), aurora show (sky-wide curtains + festival) and life
 * bloom (flowers everywhere).
 */
import { Vector3 } from 'three';
import { Biome, BuildingState, Feature, TileFlag, type PlanetTypeId } from '../../core/types';
import { PLANET_TYPES } from '../../content/planetTypes';
import { deriveBiome } from '../../world/planetgen';
import type { FxObject } from '../../render/fx/FxLayer';
import { PRESETS, fxRand } from '../../render/fx/particles';
import { ShellMode, type Shell } from '../../render/fx/shells';
import { Curtain } from '../../render/fx/sky';
import { InstState } from '../../render/materials';
import { Effect, type PowerCtx, type PowerSpec } from '../effect';
import { notify } from '../../ui/store';
import { clamp01, envelope, skyPoint, smooth, sortedByAngle, tangents, tilesToAngle } from './common';

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();

/** Re-derive biomes for tiles, grouped into as few setBiome calls as possible. */
function rebiome(e: Effect, tiles: ArrayLike<number>): void {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const b = deriveBiome(e.planet, t);
    if (e.planet.biome[t] === b) continue;
    let g = groups.get(b);
    if (!g) groups.set(b, (g = []));
    g.push(t);
  }
  for (const [b, list] of groups) e.ops.setBiome(list, b);
}

// ───────────────────────────────────────────────────────────── blessing

class BlessEffect extends Effect {
  private dur = 9;
  private r = Math.round(2 + 2 * this.k);
  private tiles = this.planet.grid.disk(this.ctx.target.tile, this.r);
  private top = new Vector3();
  private bottom = new Vector3();
  private ray = this.beam();
  private up = this.nrm(this.ctx.target.tile, new Vector3());
  private glowing: number[] = [];
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.pos(ctx.target.tile, this.bottom);
    skyPoint(this.R, this.up, 60, 0, 0, this.top);
    this.ray.u.uCore.value.setHex(0xfffbe8);
    this.ray.u.uSpeed.value = 2;
    this.sfx('magic', 1);
    this.sfx('chime', 0.8, 0.8);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.12, 0.4);
    this.ray.set(this.bottom, this.top, (1.2 + 1.2 * this.k) * (0.6 + 0.4 * env), 0xffd36b, 1.3 * env);
    if (this.every('holy', 0.04, dt)) {
      const t = this.tiles[Math.floor(fxRand() * this.tiles.length)];
      this.fx.particles.emit(PRESETS.holy, this.pos(t, _a, 0.2), this.nrm(t, _n), 3, 1.2);
      if (fxRand() < 0.3) this.fx.particles.emit(PRESETS.magic, this.pos(t, _a, 1), _n, 2);
    }
    if (this.once('bless', 1.2)) this.bless();
    if (this.t >= this.dur) this.done = true;
  }
  private bless(): void {
    const p = this.planet;
    this.god.flash(0xfff1c0, 2.2, 1, 0.25);
    const dmg = this.god.damage();
    dmg?.flag(this.tiles, TileFlag.Blessed, true);
    // misery washes away; rubble melts into flowers; the abandoned move back in
    this.ops.setFlags(this.tiles, TileFlag.Burning | TileFlag.Scorched | TileFlag.Irradiated | TileFlag.Goo | TileFlag.Frozen | TileFlag.Flooded, false);
    const rubble = this.tiles.filter((t) => p.feature[t] === Feature.Rubble || p.feature[t] === Feature.Crater);
    if (rubble.length) this.ops.setFeature(rubble, Feature.Flowers);
    let revived = 0;
    for (const b of dmg?.buildingsOn(this.tiles) ?? []) {
      if (b.state === BuildingState.Abandoned || b.state === BuildingState.Burning) {
        this.ops.updateBuilding(b.id, { state: BuildingState.Active });
        revived++;
      }
      this.ctx.view.buildings.forceState(b.id, InstState.Blessed);
      this.glowing.push(b.id);
    }
    this.god.cityEvent('festival', 'Day of Blessings', '✨', 'A pillar of golden light touched the city. Everyone feels inexplicably wonderful.', 10, this.ctx.target.tile);
    this.god.news('Hypernet', '@hypernet', '✨', revived ? `A beam of golden light just fixed ${revived} buildings on my street. Also my back pain. Also my marriage??` : 'A beam of golden light hit the plaza and now everyone is hugging. I am not complaining.', this.ctx.target.tile);
  }
  protected override cleanup(): void {
    for (const id of this.glowing) this.ctx.view.buildings.forceState(id, null);
  }
}

// ───────────────────────────────────────────────────────────── raise mountain

class MountainEffect extends Effect {
  private r = Math.round(3 + 1.5 * this.k);
  private tiles = this.planet.grid.disk(this.ctx.target.tile, this.r);
  private base = this.tiles.map((t) => this.planet.elevation[t]);
  private height = Math.round(8 + 5 * this.k);
  private goal: number[];
  private stage = 0;
  private stages = 8;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const g = p.grid;
    const maxA = Math.max(1e-4, tilesToAngle(p, this.r + 0.5));
    const top = Math.max(...this.base) + this.height;
    this.goal = this.tiles.map((t, i) => {
      const d = g.angle(ctx.target.tile, t) / maxA;
      const ridge = 1 + 0.25 * Math.sin(Math.atan2(t % 7, 3) * 3 + d * 6);
      return Math.max(this.base[i], Math.round(this.base[i] + (top - this.base[i]) * Math.pow(Math.max(0, 1 - d), 1.6) * ridge));
    });
    this.sfx('rumble', 0.9);
    this.sfx('terraform', 0.8);
  }
  step(dt: number): void {
    this.progress = clamp01(this.t / 4.5);
    const st = Math.floor(smooth(0.2, 3.8, this.t) * this.stages);
    if (st > this.stage) {
      this.stage = st;
      const f = st / this.stages;
      this.ops.setElevation(this.tiles, this.tiles.map((_, i) => Math.round(this.base[i] + (this.goal[i] - this.base[i]) * f)));
      this.god.shake(0.25, 0.4);
      for (let i = 0; i < 4; i++) {
        const t = this.tiles[Math.floor(fxRand() * this.tiles.length)];
        this.fx.particles.emit(PRESETS.dust, this.pos(t, _a), this.nrm(t, _n), 3, 1.4);
      }
      if (st >= this.stages) {
        rebiome(this, this.tiles);
        // fresh slopes grow a few trees and rocks
        const free = this.tiles.filter((t) => this.planet.building[t] < 0 && this.planet.road[t] === 0 && !this.planet.isWater(t));
        this.ops.setFeature(free.filter(() => this.rng.next() < 0.15), Feature.Rocks);
        this.ops.setFeature(free.filter((t) => this.planet.elevation[t] < 9 && this.rng.next() < 0.2), Feature.Trees);
        this.sfx('chime', 0.5, 0.7);
      }
    }
    if (this.every('sparkle', 0.08, dt) && this.t < 4.5) {
      const t = this.tiles[Math.floor(fxRand() * this.tiles.length)];
      this.fx.particles.emit(PRESETS.magic, this.pos(t, _a, 0.5), this.nrm(t, _n), 2);
    }
    if (this.t > 5) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── create island

class IslandEffect extends Effect {
  private r = Math.round(3 + 2 * this.k);
  private tiles = this.planet.grid.disk(this.ctx.target.tile, this.r);
  private base = this.tiles.map((t) => this.planet.elevation[t]);
  private goal: number[];
  private stage = 0;
  private stages = 7;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const g = p.grid;
    const maxA = Math.max(1e-4, tilesToAngle(p, this.r + 0.5));
    const sea = p.seaOffset;
    const peak = sea + 3 + Math.round(2 * this.k);
    this.goal = this.tiles.map((t, i) => {
      const d = g.angle(ctx.target.tile, t) / maxA;
      const wob = (Math.sin(t * 12.9898) * 43758.5453) % 1;
      const h = sea - 1 + (peak - sea + 1.5) * Math.pow(Math.max(0, 1 - d), 0.9) + (wob - 0.5) * 1.2;
      return Math.max(this.base[i], Math.round(h));
    });
    this.sfx('splash', 0.9, 0.7);
    this.sfx('rumble', 0.6);
    this.god.frame(ctx.target.tile, 60, 0.95, 2);
  }
  step(dt: number): void {
    this.progress = clamp01(this.t / 5);
    const st = Math.floor(smooth(0.3, 4, this.t) * this.stages);
    if (st > this.stage) {
      this.stage = st;
      const f = st / this.stages;
      this.ops.setElevation(this.tiles, this.tiles.map((_, i) => Math.round(this.base[i] + (this.goal[i] - this.base[i]) * f)));
      if (st >= this.stages) this.finish();
    }
    if (this.every('steam', 0.05, dt) && this.t < 4.5) {
      const t = this.tiles[Math.floor(fxRand() * this.tiles.length)];
      const n = this.nrm(t, _n);
      this.fx.particles.emit(PRESETS.splash, this.pos(t, _a), n, 3, 1.5);
      this.fx.particles.emit(PRESETS.steam, this.pos(t, _a), n, 2, 1.2, 1.2);
    }
    if (this.t > 5.5) this.done = true;
  }
  private finish(): void {
    const p = this.planet;
    rebiome(this, this.tiles);
    const land = this.tiles.filter((t) => !p.isWater(t) && p.building[t] < 0 && p.road[t] === 0);
    // palms on the beach, a little forest inland
    this.ops.setFeature(land.filter(() => this.rng.next() < 0.35), Feature.Trees);
    this.ops.setFeature(land.filter((t) => p.feature[t] === Feature.None && this.rng.next() < 0.08), Feature.Flowers);
    this.sfx('chime', 0.8);
    this.god.news('Cartography Guild', '@maps', '🏝️', `A brand-new island has appeared off the coast. We are calling it "Island". Naming is hard.`, this.ctx.target.tile);
  }
}

// ───────────────────────────────────────────────────────────── plant forest / life bloom

class GrowEffect extends Effect {
  private order: { tiles: Int32Array; angles: Float32Array };
  private idx = 0;
  private ang: number;
  private dur = 6;
  constructor(ctx: PowerCtx, private kind: 'forest' | 'bloom') {
    super(ctx);
    this.ang = tilesToAngle(this.planet, kind === 'forest' ? 3 + 2.5 * this.k : 6 + 5 * this.k);
    this.order = sortedByAngle(this.planet, ctx.target.tile, this.ang);
    this.sfx('chime', 0.8, kind === 'forest' ? 0.8 : 1.2);
    this.sfx('magic', 0.6);
  }
  step(dt: number): void {
    const p = this.planet;
    this.progress = clamp01(this.t / this.dur);
    const reach = this.ang * smooth(0, this.dur * 0.8, this.t);
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= reach) batch.push(this.order.tiles[this.idx++]);
    if (batch.length) {
      const free = batch.filter((t) => !p.isWater(t) && p.building[t] < 0 && p.road[t] === 0);
      const alien = p.spec.type === 'fungal' || p.spec.type === 'crystal' || p.spec.type === 'toxic';
      if (this.kind === 'forest') {
        const dense = free.filter(() => this.rng.next() < 0.45);
        const light = free.filter((t) => !dense.includes(t) && this.rng.next() < 0.7);
        this.ops.setFeature(dense, alien ? Feature.AlienFlora : Feature.DenseTrees);
        this.ops.setFeature(light, alien ? Feature.AlienFlora : Feature.Trees);
        const green = free.filter((t) => p.biome[t] === Biome.Grass || p.biome[t] === Biome.Savanna || p.biome[t] === Biome.Meadow || p.biome[t] === Biome.Desert);
        if (green.length && !alien) this.ops.setBiome(green, Biome.Forest);
      } else {
        const fl = free.filter((t) => p.feature[t] === Feature.None || p.feature[t] === Feature.Rubble || p.feature[t] === Feature.Crater);
        this.ops.setFeature(fl.filter(() => this.rng.next() < 0.75), alien ? Feature.AlienFlora : Feature.Flowers);
        const meadow = free.filter((t) => p.biome[t] === Biome.Grass || p.biome[t] === Biome.Savanna || p.biome[t] === Biome.Ash || p.biome[t] === Biome.Desert || p.biome[t] === Biome.Tundra);
        if (meadow.length) this.ops.setBiome(meadow, Biome.Meadow);
        this.ops.setFlags(batch, TileFlag.Scorched, false);
      }
      for (let i = 0; i < Math.min(6, free.length); i++) {
        const t = free[Math.floor(fxRand() * free.length)];
        this.fx.particles.emit(this.kind === 'forest' ? PRESETS.leaf : PRESETS.petal, this.pos(t, _a, 0.4), this.nrm(t, _n), 3, 1);
        this.fx.particles.emit(PRESETS.magic, this.pos(t, _a, 0.6), _n, 1, 0.8);
      }
    }
    if (this.t >= this.dur) {
      if (this.kind === 'bloom') this.god.cityEvent('festival', 'Blossom Festival', '🌸', 'The whole city is in bloom. Pollen counts are high; so are spirits.', 8, this.ctx.target.tile);
      this.done = true;
    }
  }
}

// ───────────────────────────────────────────────────────────── rain of gold

class GoldEffect extends Effect {
  private dur = 10;
  private ang = tilesToAngle(this.planet, 5 + 3 * this.k);
  private paid = false;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.sfx('money', 1);
    this.sfx('chime', 0.8, 1.3);
    this.god.flash(0xffe08a, 1.6, 0.8, 0.15);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.1, 0.3);
    const n = Math.round(this.fx.q(8) * env);
    for (let i = 0; i < n; i++) {
      const t = this.randomTileNear(this.ctx.target.tile, this.ang);
      const up = this.nrm(t, _n);
      this.at(up, 8 + fxRand() * 6, _a);
      tangents(up, _e1, _e2);
      this.fx.particles.emitAt(PRESETS.gold, _a.x, _a.y, _a.z, -up.x * 3 + _e1.x * (fxRand() - 0.5), -up.y * 3 + _e1.y * (fxRand() - 0.5), -up.z * 3 + _e1.z * (fxRand() - 0.5), 1, 1.8);
    }
    if (this.every('glint', 0.1, dt)) {
      const t = this.randomTileNear(this.ctx.target.tile, this.ang);
      this.fx.particles.emit(PRESETS.magic, this.pos(t, _b, 0.3), this.nrm(t, _n), 3, 0.8);
    }
    if (!this.paid && u > 0.4) {
      this.paid = true;
      const g = this.ctx.game;
      let pop = 0;
      try {
        pop = g.sim.getMetric('population');
      } catch {
        pop = 0;
      }
      const amount = Math.round((5000 + pop * 3) * this.k);
      g.empire.earn(amount);
      this.god.cityEvent('festival', 'Gold Rush', '🪙', 'It rained money. Literally. Shops report record sales of wheelbarrows.', 6, this.ctx.target.tile);
      this.god.banner('RAIN OF GOLD', g.empire.sandbox ? 'The streets are paved with it' : `+§${amount.toLocaleString('en-US')} in the treasury`, 'coin', 0xffd36b, 3);
      this.god.news('Hypernet', '@hypernet', '🪙', 'it is raining coins. i repeat. it is RAINING COINS. bring buckets. bring ALL the buckets.', this.ctx.target.tile);
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── terraform world

const TERRAFORM_TARGETS: PlanetTypeId[] = ['terran', 'jungle', 'desert', 'arctic', 'ocean', 'volcanic', 'crystal', 'fungal', 'toxic', 'machine'];
const TERRAFORM_ICONS: Record<string, string> = { terran: 'globe', jungle: 'tree', desert: 'sun', arctic: 'snowflake', ocean: 'wave', volcanic: 'volcano', crystal: 'sparkles', fungal: 'flower', toxic: 'biohazard', machine: 'gear' };

class TerraformEffect extends Effect {
  private dur = 26;
  private order: { tiles: Int32Array; angles: Float32Array };
  private idx = 0;
  private front: Shell & FxObject;
  private center = this.nrm(this.ctx.target.tile, new Vector3());
  private target: PlanetTypeId;
  private complete = false;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const want = (ctx.choice as PlanetTypeId) || 'terran';
    this.target = want === p.spec.type ? (want === 'terran' ? 'jungle' : 'terran') : want;
    const arch = PLANET_TYPES[this.target];
    // the planet's identity changes now; the land follows as the wave sweeps around the globe
    const spec = p.spec;
    spec.type = this.target;
    spec.atmosphere = { ...arch.atmosphere };
    spec.oceanColor = arch.oceanColor;
    spec.cloudCover = arch.cloudCover;
    spec.temperature = arch.temperature;
    spec.palette = undefined;
    this.order = sortedByAngle(p, ctx.target.tile, Math.PI + 0.01);
    this.front = this.own(this.fx.shell(ShellMode.Front, 40, 256));
    this.front.setCenter(this.center).colors(arch.palette.land, arch.palette.lowland);
    this.front.u.uR.value = this.R + 0.9;
    this.front.u.uWidth.value = 0.05;
    try {
      this.ctx.view.surface.atmosphere.setColor(arch.atmosphere.color);
    } catch {
      /* optional */
    }
    this.god.frame(ctx.target.tile, this.R * 2.6, 0.3, 2.5);
    this.god.banner('TERRAFORMING', `${PLANET_TYPES[this.target].name}: ${arch.tagline}`, TERRAFORM_ICONS[this.target] ?? 'globe', arch.palette.land, 4.2);
    this.sfx('terraform', 1);
    this.sfx('magic', 0.8, 0.7);
    this.loop('hum', 0.4);
  }
  step(dt: number): void {
    const p = this.planet;
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const a = Math.PI * smooth(0.04, 0.92, u);
    this.front.range(Math.max(0, a - 0.2), Math.min(Math.PI, a + 0.05));
    this.front.u.uAngle.value = a;
    this.front.u.uIntensity.value = envelope(u, 0.04, 0.12);
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= a && batch.length < 900) batch.push(this.order.tiles[this.idx++]);
    if (batch.length) {
      rebiome(this, batch);
      // the new world's flora
      const arch = PLANET_TYPES[this.target];
      const free = batch.filter((t) => !p.isWater(t) && p.building[t] < 0 && p.road[t] === 0);
      const strip = free.filter((t) => p.feature[t] === Feature.Trees || p.feature[t] === Feature.DenseTrees || p.feature[t] === Feature.Flowers || p.feature[t] === Feature.AlienFlora);
      if (strip.length) this.ops.setFeature(strip, Feature.None);
      for (const [f, chance] of Object.entries(arch.features)) {
        const feat = Number(f) as Feature;
        if (feat === Feature.Ruins || feat === Feature.Ore || feat === Feature.GasVent || feat === Feature.CrystalDeposit) continue;
        const pick = free.filter((t) => p.feature[t] === Feature.None && this.rng.next() < (chance ?? 0) * 1.5);
        if (pick.length) this.ops.setFeature(pick, feat);
      }
      for (let i = 0; i < Math.min(5, batch.length); i++) {
        const t = batch[Math.floor(fxRand() * batch.length)];
        this.fx.particles.emit(PRESETS.magic, this.pos(t, _a, 0.4), this.nrm(t, _n), 2, 1.2);
      }
    }
    if (this.t >= this.dur) {
      this.complete = true;
      this.done = true;
    }
  }
  protected override cleanup(): void {
    if (!this.complete) return;
    const god = this.god;
    const name = PLANET_TYPES[this.target].name;
    // rebuild the view so water, sky and palette match the new world (after this frame)
    setTimeout(() => {
      try {
        god.chrono.refresh();
        god.flash(0xffffff, 2, 0.8, 0.35);
        notify({ title: 'Terraforming complete', body: `${this.planet.spec.name} is now a ${name} world.`, kind: 'good', icon: 'globe' });
      } catch (e) {
        console.error('[god] terraform refresh failed', e);
      }
    }, 30);
  }
}

// ───────────────────────────────────────────────────────────── aurora show

class AuroraEffect extends Effect {
  private dur = 32;
  private curtains: (Curtain & FxObject)[] = [];
  constructor(ctx: PowerCtx) {
    super(ctx);
    const c = this.nrm(ctx.target.tile, new Vector3());
    tangents(c, _e1, _e2);
    const cols: [number, number][] = [
      [0x4dffa6, 0xb26bff],
      [0x6affd8, 0xff6ad8],
      [0x7ad8ff, 0x8a6aff],
    ];
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 9;
      const center = skyPoint(this.R, c, 13 + i * 2, off, (i - 1) * 4, new Vector3());
      const along = _e1.clone().multiplyScalar(Math.cos(i * 0.6)).addScaledVector(_e2, Math.sin(i * 0.6)).normalize();
      this.curtains.push(this.own(new Curtain(this.fx.planetGroup, center, center.clone().normalize(), along, 46, 16, cols[i][0], cols[i][1]) as Curtain & FxObject));
    }
    this.sfx('chime', 0.9, 0.6);
    this.god.cityEvent('festival', 'Aurora Festival', '🌌', 'The whole sky is dancing. Rooftop parties until dawn.', 10, ctx.target.tile);
    this.god.news('Hypernet', '@hypernet', '🌌', 'the sky is doing the thing again!! everyone get on a roof!!', ctx.target.tile);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.12, 0.25);
    this.god.want(this.key, { aurora: 3 * env, lights: 1 - 0.25 * env });
    this.curtains.forEach((c, i) => (c.intensity = env * (0.8 + 0.2 * Math.sin(this.t * 0.7 + i * 2))));
    if (this.every('sparks', 0.12, dt)) {
      const t = this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, 8));
      this.fx.particles.emit(PRESETS.aurora, this.pos(t, _a, 12 + fxRand() * 4), this.nrm(t, _n), 1, 0.4);
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── definitions

export const CREATION: PowerSpec[] = [
  {
    id: 'bless', name: 'Blessing', icon: 'sparkles', category: 'creation', targeting: 'tile', tier: 0, danger: 0, cooldown: 30, color: 0xffd36b,
    description: 'A pillar of golden light: damage heals, rubble blooms, abandoned homes are lived in again, and the district is protected.',
    flavor: 'Results may include spontaneous hugging.',
    run: (c) => new BlessEffect(c),
  },
  {
    id: 'mountain', name: 'Raise Mountain', icon: 'raise', category: 'creation', targeting: 'tile', tier: 1, danger: 0, cooldown: 20, color: 0xb8a68e, rewindable: true,
    description: 'Pull a snow-capped peak out of the ground. The neighbourhood rides up with it.',
    flavor: 'Faith moves mountains. You skip the faith.',
    run: (c) => new MountainEffect(c),
  },
  {
    id: 'island', name: 'Create Island', icon: 'globe', category: 'creation', targeting: 'tile', tier: 1, danger: 0, cooldown: 25, color: 0x5ef2c8, rewindable: true,
    description: 'Raise a new island from the sea floor — beaches, palms and fresh real estate.',
    flavor: 'Beachfront property, zero previous owners.',
    tip: 'Tap the open sea',
    resolve: (c) => {
      if (!c.planet.isWater(c.target.tile)) {
        notify({ title: 'Islands need water', body: 'Tap the sea to raise an island.', kind: 'info', icon: 'globe' });
        return false;
      }
      return true;
    },
    run: (c) => new IslandEffect(c),
  },
  {
    id: 'forest', name: 'Plant Forest', icon: 'tree', category: 'creation', targeting: 'tile', tier: 0, danger: 0, cooldown: 10,
    description: 'A forest sweeps outward from your touch, filling every free tile with trees.',
    flavor: 'The best time to plant a tree was twenty years ago. The second best is now, instantly, by magic.',
    run: (c) => new GrowEffect(c, 'forest'),
  },
  {
    id: 'gold', name: 'Rain of Gold', icon: 'coin', category: 'creation', targeting: 'tile', tier: 2, danger: 0, cooldown: 300, color: 0xffd36b,
    description: 'Coins pour from the sky: a windfall for the treasury and a gold-rush festival for the city.',
    flavor: 'Economists are furious. Everyone else is thrilled.',
    run: (c) => new GoldEffect(c),
  },
  {
    id: 'terraform', name: 'Terraform World', icon: 'globe', category: 'creation', targeting: 'global', tier: 6, danger: 0, cooldown: 600, color: 0x5ef2a0, rewindable: true, confirm: true,
    description: 'A wave of transformation circles the globe and remakes the whole planet into another archetype. Cities survive; the scenery does not.',
    flavor: 'Not happy with your planet? Return it for a different one.',
    choices: TERRAFORM_TARGETS.map((id) => ({ id, label: PLANET_TYPES[id].name, icon: TERRAFORM_ICONS[id] })),
    run: (c) => new TerraformEffect(c),
  },
  {
    id: 'aurora', name: 'Aurora Show', icon: 'sparkles', category: 'creation', targeting: 'tile', tier: 0, danger: 0, cooldown: 60, color: 0x7affc8,
    description: 'Curtains of green and violet light ripple across the whole sky. The city throws a rooftop festival. Best at night.',
    flavor: 'Free light show. Batteries not included. Or needed.',
    run: (c) => new AuroraEffect(c),
  },
  {
    id: 'bloom', name: 'Life Bloom', icon: 'flower', category: 'creation', targeting: 'tile', tier: 1, danger: 0, cooldown: 40, color: 0xff9ad8,
    description: 'Flowers burst from every free tile in a huge radius; scorched and grey land turns to meadow.',
    flavor: 'Hay fever has entered the chat.',
    run: (c) => new GrowEffect(c, 'bloom'),
  },
];
