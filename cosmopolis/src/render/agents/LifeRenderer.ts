/**
 * OWNER: life agent.
 * LifeRenderer — the city breathes. Purely visual, instanced, culled and pooled:
 *   • RoadTraffic   hover-cars, vans, shuttles, trucks, taxis, police / ambulances / fire engines (light bars),
 *                   garbage compactors — lanes, smooth turns, junction slow-downs, signals, queues, bus stops,
 *                   emergency dispatch to fires & disasters; head/tail lights + headlight pools at night
 *   • RailTraffic   maglev trains (multi-car, dwell at maglev stations) and hyperloop pods racing through tubes
 *   • SkyTraffic    flying cars weaving between towers on aerial lanes, delivery drones, air taxis from drone ports
 *   • Ports         VTOL shuttles launching from / landing at spaceports, airliners taking off and landing at
 *                   skyports, mass-driver sleds, space-elevator climbers
 *   • SeaTraffic    speedboats, sailboats, hovercraft, trawlers, ferries and container ships near harbours and
 *                   coasts (with wakes), and the occasional breaching space whale on ocean worlds
 *   • Fauna         flocks of birds or alien flyers chosen by biome / planet type
 *   • Beacons       blinking red aviation lights on very tall buildings
 *   • Pedestrians   tiny citizens strolling the pavements near shops and parks (street-level zoom only)
 * Density follows population, road count and the quality tier; ≤ 600 moving agents are drawn per frame.
 *
 * Public extras (for UI / camera / tests): stats(), vehicleCount, followRandom(kind) → getter for CameraRig.follow,
 * dispatch(tile) (emergency response). URL: &life=0 disables, &life=dense doubles density (screenshots).
 */
import { Group } from 'three';
import { bus } from '../../core/events';
import { hashString } from '../../core/rng';
import { game } from '../../game/instance';
import type { BufferGeometry } from 'three';
import type { PlanetView } from '../PlanetView';
import { shared } from '../materials';
import { DecalBatch, KitBatch, Particles, SpriteBatch } from './batch';
import { Cull, FastRng, MOTION_SPEED } from './common';
import type { FleetKey, LifeCtx } from './ctx';
import { RoadTraffic } from './traffic';
import * as M from './vehicles';

const FACTORIES: Record<FleetKey, () => BufferGeometry> = {
  sedan: M.sedan,
  coupe: M.coupe,
  van: M.van,
  bus: M.bus,
  truck: M.truck,
  taxi: M.taxi,
  police: M.police,
  ambulance: M.ambulance,
  fire: M.fireTruck,
  garbage: M.garbageTruck,
  maglevHead: () => M.maglevCar(true),
  maglevCar: () => M.maglevCar(false),
  hyperPod: M.hyperPod,
  flyingCar: M.flyingCar,
  drone: M.drone,
  airTaxi: M.airTaxi,
  airliner: M.airliner,
  shuttle: M.shuttle,
  sled: M.sled,
  climber: M.climber,
  speedboat: M.speedboat,
  sailboat: M.sailboat,
  hovercraft: M.hovercraft,
  ferry: M.ferry,
  cargoShip: M.cargoShip,
  trawler: M.trawler,
  whale: M.whale,
  birdUp: () => M.flyer(1),
  birdMid: () => M.flyer(0.1),
  birdDown: () => M.flyer(-1),
  glowUp: () => M.flyer(1, true),
  glowMid: () => M.flyer(0.1, true),
  glowDown: () => M.flyer(-1, true),
  pedestrian: M.pedestrian,
};

/** Hard cap on moving agents drawn per frame (iPhone budget). */
const VISIBLE_BUDGET = 600;

interface Sub {
  update(ctx: LifeCtx, dt: number): void;
  render(ctx: LifeCtx): void;
  dispose(): void;
}

export class LifeRenderer {
  readonly group = new Group();
  private readonly ctx: LifeCtx;
  private readonly batches = new Map<FleetKey, KitBatch>();
  private readonly cull = new Cull();
  readonly traffic: RoadTraffic;
  private subs: { name: string; sub: Sub }[] = [];
  private offs: (() => void)[] = [];
  private failed = new Set<string>();
  private time = 0;
  private enabled = true;
  private dense = 1;

  constructor(private view: PlanetView) {
    this.group.name = 'life';
    view.root.add(this.group);
    const planet = view.planet;
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    this.enabled = params?.get('life') !== '0';
    this.dense = params?.get('life') === 'dense' ? 2 : 1;
    const g = this.group;
    this.ctx = {
      view,
      planet,
      cull: this.cull,
      time: 0,
      realTime: 0,
      fleet: (key) => this.fleet(key),
      sprites: new SpriteBatch(g, 2048, 'glow'),
      beams: new DecalBatch(g, 256, 'beams', 1, true),
      wakes: new DecalBatch(g, 64, 'wakes', 2, false),
      rings: new DecalBatch(g, 32, 'rings', 3, false),
      smoke: new Particles(g, 900, 'smoke', false),
      flames: new Particles(g, 500, 'flames', true),
      rng: new FastRng(hashString(planet.spec.id) ^ planet.spec.seed),
      density: 1,
      budget: VISIBLE_BUDGET,
    };
    this.traffic = new RoadTraffic(planet);
    this.subs.push({ name: 'traffic', sub: this.traffic });

    this.offs.push(
      bus.on('tiles:road', () => this.traffic.invalidate()),
      bus.on('tiles:terrain', () => this.traffic.invalidate()),
      bus.on('building:added', () => this.traffic.invalidate()),
      bus.on('building:removed', () => this.traffic.invalidate()),
      bus.on('tiles:zone', () => this.traffic.invalidate()),
      bus.on('tiles:flags', ({ tiles }) => this.safe('flags', () => this.traffic.onFlags(this.ctx, tiles))),
      bus.on('disaster:start', ({ tile }) => this.safe('disaster', () => this.traffic.onDisaster(this.ctx, tile))),
    );
  }

  private fleet(key: FleetKey): KitBatch {
    let b = this.batches.get(key);
    if (!b) {
      b = new KitBatch(this.group, FACTORIES[key](), 32, key);
      b.begin();
      this.batches.set(key, b);
    }
    return b;
  }

  private safe(name: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (!this.failed.has(name)) {
        this.failed.add(name);
        console.error(`[life] ${name} failed`, e);
      }
    }
  }

  /** Total moving agents currently simulated. */
  get vehicleCount(): number {
    return this.traffic.active;
  }

  stats(): Record<string, number> {
    const out: Record<string, number> = { cars: this.traffic.active, carsTarget: this.traffic.target, carsVisible: this.traffic.visible, roadTiles: this.traffic.networkSize };
    let drawn = 0;
    for (const b of this.batches.values()) drawn += b.count;
    out.drawn = drawn;
    out.sprites = this.ctx.sprites.count;
    return out;
  }

  /** Emergency services rush to a tile. */
  dispatch(tile: number): void {
    this.safe('dispatch', () => this.traffic.onDisaster(this.ctx, tile));
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const view = this.view;
    const speed = game?.clock?.speed ?? 1;
    const mdt = dt * (MOTION_SPEED[speed] ?? 1);
    this.time += mdt;
    ctx.time = this.time;
    ctx.realTime = shared.uTime.value;
    const tier = game?.engine?.tier ?? 2;
    ctx.density = (tier <= 0 ? 0.45 : tier === 1 ? 0.7 : 1) * this.dense;
    ctx.budget = VISIBLE_BUDGET;
    this.cull.update(view.camera, view.planet.radius, view.sunDir);
    for (const s of this.subs) this.safe(s.name, () => s.sub.update(ctx, mdt));
    for (const b of this.batches.values()) b.begin();
    ctx.sprites.begin();
    ctx.beams.begin();
    ctx.wakes.begin();
    ctx.rings.begin();
    for (const s of this.subs) this.safe(s.name + ':render', () => s.sub.render(ctx));
    for (const b of this.batches.values()) b.end();
    ctx.sprites.end();
    ctx.beams.end();
    ctx.wakes.end();
    ctx.rings.end();
    ctx.smoke.flush();
    ctx.flames.flush();
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs.length = 0;
    for (const s of this.subs) this.safe(s.name + ':dispose', () => s.sub.dispose());
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.ctx.sprites.dispose();
    this.ctx.beams.dispose();
    this.ctx.wakes.dispose();
    this.ctx.rings.dispose();
    this.ctx.smoke.dispose();
    this.ctx.flames.dispose();
    this.group.removeFromParent();
  }
}

