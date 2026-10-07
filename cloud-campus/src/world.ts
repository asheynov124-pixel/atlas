import Matter from 'matter-js';
import { Actor } from './actor';
import { Fx } from './fx';
import { slotsFor } from './powers';
import { DEF_BY_ID } from './roster';
import {
  clamp, norm, rand, setTag, sign, tagOf,
  type CharacterDef, type IceWall, type Projectile, type Prop, type PropType, type Vec,
} from './types';

const { Engine, Bodies, Body, Composite, Events, Query, Bounds } = Matter;

export const STEP = 1 / 60;
export const PAD = { x: 60, y: 0 };
export const INTAKE = { x: 300, y: -12 };
export const CORE = { x: 140, y: 205 };
export const FALL_Y = 900;
export const PROP_CAP = 40;
export const ACTOR_CAP = 24;

export const ZONES = [
  { name: 'GYM', x0: -1500, x1: -880 },
  { name: 'LOCKER ROW', x0: -880, x1: -300 },
  { name: 'COURTYARD', x0: -300, x1: 470 },
  { name: 'CAFETERIA', x0: 470, x1: 1150 },
];

export type TerrainStyle = 'ground' | 'step' | 'ledge' | 'rim' | 'board' | 'islet' | 'post' | 'cloud';

export interface Machine {
  kind: 'locker' | 'vending' | 'pitcher';
  x: number; y: number; w: number; h: number;
  openT: number;
  hasCell: boolean;
  hum: number;
}
export interface Vine {
  owner: Actor;
  c: Matter.Constraint;
  life: number;
  max: number;
  shrinkTo: number;
  kind: 'lash' | 'root';
}
export interface Slick { owner: Actor; x: number; y: number; w: number; life: number; max: number }
export interface Beacon { owner: Actor; x: number; y: number; life: number; max: number }
export interface HitOpts {
  owner?: Actor;
  exclude?: Matter.Body[];
  ignite?: boolean;
  freeze?: number;
  stun?: number;
  upBias?: number;
  shatter?: boolean;
}
export interface RayHit { body: Matter.Body; point: Vec; dist: number }
export type CoreMode = 'on' | 'off' | 'over';

const massFactor = (m: number) => clamp(Math.sqrt(3 / Math.max(0.05, m)), 0.22, 1.7);

export function bodyRadius(b: Matter.Body) {
  return Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2;
}

/** Keep at most `cap` items owned by `owner` (oldest go first). */
export function capList<T extends { owner: Actor }>(list: T[], owner: Actor, cap: number, remove: (t: T) => void) {
  if (cap <= 0) return;
  let mine = list.filter((t) => t.owner === owner);
  while (mine.length >= cap) {
    remove(mine[0]);
    mine = list.filter((t) => t.owner === owner);
  }
}

export class World {
  engine = Engine.create({ enableSleeping: false });
  fx = new Fx();
  time = 0;
  actors: Actor[] = [];
  props: Prop[] = [];
  projectiles: Projectile[] = [];
  vines: Vine[] = [];
  ice: IceWall[] = [];
  slicks: Slick[] = [];
  beacons: Beacon[] = [];
  machines: Machine[] = [];
  terrain: { body: Matter.Body; style: TerrainStyle }[] = [];
  intake!: Matter.Body;
  possessed: Actor | null = null;
  core = { mode: 'on' as CoreMode, overT: 0, blendOff: 0, blendOver: 0 };
  tilt = 0;
  xrayT = 0;
  revealT = 0;
  rowdy = false;
  private timers: { t: number; fn: () => void }[] = [];
  private contacts: [Matter.Body, Matter.Body][] = [];
  private onCollide = (e: Matter.IEventCollision<Matter.Engine>) => {
    for (const p of e.pairs) this.contacts.push([p.bodyA.parent ?? p.bodyA, p.bodyB.parent ?? p.bodyB]);
  };

  constructor(public toast: (msg: string) => void) {
    this.engine.gravity.y = 1;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    Events.on(this.engine, 'collisionStart', this.onCollide);
    this.buildCampus();
    this.populate();
  }

  destroy() {
    Events.off(this.engine, 'collisionStart', this.onCollide);
    Composite.clear(this.engine.world, false, true);
    Engine.clear(this.engine);
  }

  later(t: number, fn: () => void) {
    this.timers.push({ t, fn });
  }

  // ================================================================ layout

  private addTerrain(x: number, y: number, w: number, h: number, style: TerrainStyle, opts: Matter.IChamferableBodyDefinition = {}) {
    const b = Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0.6, ...opts });
    setTag(b, { kind: 'terrain' });
    Composite.add(this.engine.world, b);
    this.terrain.push({ body: b, style });
    return b;
  }

  private buildCampus() {
    // One connected slab: gym | lockers | courtyard | cafeteria. Top surface at y = 0.
    this.addTerrain(-175, 35, 2650, 70, 'ground');
    this.addTerrain(-1495, -14, 10, 28, 'post');
    // Gym bleachers and hoop.
    this.addTerrain(-1450, -40, 100, 80, 'step');
    this.addTerrain(-1360, -20, 80, 40, 'step');
    this.addTerrain(-1012, -262, 8, 72, 'board');
    const rimA = Bodies.circle(-1060, -236, 4, { isStatic: true });
    const rimB = Bodies.circle(-1020, -236, 4, { isStatic: true });
    for (const r of [rimA, rimB]) {
      setTag(r, { kind: 'terrain' });
      Composite.add(this.engine.world, r);
      this.terrain.push({ body: r, style: 'rim' });
    }
    // Cafeteria stairs and balcony.
    this.addTerrain(530, -25, 60, 50, 'step');
    this.addTerrain(590, -55, 60, 110, 'step');
    this.addTerrain(780, -198, 320, 16, 'ledge');
    // A sky ledge above the courtyard and a detached islet past the open edge.
    this.addTerrain(100, -430, 170, 16, 'cloud');
    this.addTerrain(1390, 50, 200, 40, 'islet');

    // Core intake socket (sensor) in the courtyard floor.
    this.intake = Bodies.rectangle(INTAKE.x, INTAKE.y, 54, 26, { isStatic: true, isSensor: true });
    setTag(this.intake, { kind: 'sensor', id: 'intake' });
    Composite.add(this.engine.world, this.intake);

    // Machines (background, hijackable).
    this.machines.push({ kind: 'pitcher', x: -930, y: 0, w: 54, h: 62, openT: 0, hasCell: false, hum: 0 });
    for (let i = 0; i < 6; i++) {
      this.machines.push({ kind: 'locker', x: -800 + i * 56, y: 0, w: 48, h: 122, openT: 0, hasCell: false, hum: 0 });
    }
    this.machines.push({ kind: 'vending', x: -400, y: 0, w: 72, h: 142, openT: 0, hasCell: false, hum: 0 });
  }

  private populate() {
    const P = (t: PropType, x: number, y: number) => this.spawnProp(t, x, y, { quiet: true });
    // Gym
    P('mat', -1240, -8); P('mat', -1112, -8);
    P('dummy', -1180, -52); P('ball', -1040, -90);
    // Courtyard
    P('crate', -185, -21); P('crate', -141, -21); P('crate', -163, -63);
    P('crate', 200, -21);
    // Cafeteria
    for (const x of [700, 860, 1020]) P('table', x, -24);
    for (const x of [630, 780, 940, 1095]) P('chair', x, -28);
    P('tray', 690, -52); P('tray', 875, -52); P('tray', 1030, -52);
    // Islet
    P('crate', 1390, 9);

    this.hideCell();

    const cast: [string, number][] = [
      ['will', -40], ['layla', -230], ['warren', 260], ['zach', 380],
      ['speed', 720], ['gwen', -560], ['boomer', -1150],
    ];
    for (const [id, x] of cast) this.spawnActor(DEF_BY_ID[id], x, -60, { quiet: true });
    this.possess(this.actors[0]);
  }

  // ================================================================ spawning

  spawnActor(def: CharacterDef, x: number, y: number, opts: { owner?: Actor; quiet?: boolean } = {}) {
    if (this.actors.length >= ACTOR_CAP) {
      this.toast(`Campus is full (${ACTOR_CAP} characters). Despawn someone from the strip first.`);
      return null;
    }
    const a = new Actor(this, def, x, y);
    a.owner = opts.owner ?? null;
    this.actors.push(a);
    if (!opts.quiet) this.fx.puff(x, y, 'rgba(255,255,255,0.95)', 14);
    return a;
  }

  removeActor(a: Actor) {
    if (a.removed) return;
    a.release();
    a.heldBy?.release();
    if (!a.dead) {
      this.detachBody(a.body);
      Composite.remove(this.engine.world, a.body);
    }
    a.removed = true;
    this.fx.puff(a.pos.x, a.pos.y, 'rgba(255,255,255,0.9)', 12);
    this.actors = this.actors.filter((x) => x !== a);
    for (const o of this.actors) if (o.owner === a) o.owner = null;
    if (this.possessed === a) this.possess(this.actors[0] ?? null);
  }

  possess(a: Actor | null) {
    if (this.possessed) this.possessed.ctrl = { move: 0, jump: false, down: false };
    this.possessed = a;
    if (a) {
      a.rush = null;
      this.fx.ring(a.pos.x, a.pos.y, 46, 'rgba(122,247,255,0.9)', 3, 0.35);
    }
  }

  cycle(dir: number) {
    if (!this.actors.length) return;
    const i = this.possessed ? this.actors.indexOf(this.possessed) : -1;
    const n = this.actors.length;
    this.possess(this.actors[(i + dir + n) % n]);
  }

  /** Where the spawn menu drops things: just ahead of the possessed character. */
  spawnPoint(): Vec {
    const me = this.possessed;
    if (!me || me.dead) return { x: PAD.x, y: PAD.y - 160 };
    return { x: me.pos.x + me.facing * 90, y: me.pos.y - 130 };
  }

  makePropBody(type: PropType, x: number, y: number): { body: Matter.Body; color: string; mass: number } {
    const o = { friction: 0.12, frictionAir: 0.01, restitution: 0.1 };
    switch (type) {
      case 'crate': return { body: Bodies.rectangle(x, y, 42, 42, { ...o, chamfer: { radius: 3 } }), color: '#b07a3c', mass: 2.2 };
      case 'ball': return { body: Bodies.circle(x, y, 17, { ...o, restitution: 0.82, friction: 0.05, frictionAir: 0.004 }), color: '#e2632c', mass: 0.6 };
      case 'dodgeball': return { body: Bodies.circle(x, y, 10, { ...o, restitution: 0.7, frictionAir: 0.004 }), color: '#d23b3b', mass: 0.35 };
      case 'mat': return { body: Bodies.rectangle(x, y, 124, 16, { ...o, restitution: 0.02, friction: 0.9, chamfer: { radius: 6 } }), color: '#2f6db0', mass: 3 };
      case 'dummy': return { body: Bodies.rectangle(x, y, 28, 74, { ...o, chamfer: { radius: 12 } }), color: '#c9b28a', mass: 3.2 };
      case 'tray': return { body: Bodies.rectangle(x, y, 36, 6, { ...o, chamfer: { radius: 2 } }), color: '#9aa7b3', mass: 0.35 };
      case 'can': return { body: Bodies.rectangle(x, y, 9, 15, { ...o, restitution: 0.3, chamfer: { radius: 2 } }), color: ['#d83a3a', '#2f8fd8', '#3fbf5a', '#f2b632'][Math.floor(rand(0, 4))], mass: 0.15 };
      case 'book': return { body: Bodies.rectangle(x, y, 18, 11, { ...o, chamfer: { radius: 1 } }), color: ['#7d3cbf', '#c93d3d', '#2e7d6a', '#d98f2b', '#3456a8'][Math.floor(rand(0, 5))], mass: 0.2 };
      case 'cell': return { body: Bodies.rectangle(x, y, 18, 28, { ...o, chamfer: { radius: 8 } }), color: '#7af7ff', mass: 0.8 };
      case 'table': {
        const top = Bodies.rectangle(x, y - 16, 112, 10);
        const l1 = Bodies.rectangle(x - 44, y + 6, 8, 35);
        const l2 = Bodies.rectangle(x + 44, y + 6, 8, 35);
        return { body: Body.create({ parts: [top, l1, l2], ...o }), color: '#8a5a34', mass: 5 };
      }
      case 'chair': {
        const side = Math.random() < 0.5 ? -1 : 1;
        const seat = Bodies.rectangle(x, y + 6, 30, 6);
        const back = Bodies.rectangle(x + side * 13, y - 10, 5, 32);
        const l1 = Bodies.rectangle(x - 11, y + 17, 4, 17);
        const l2 = Bodies.rectangle(x + 11, y + 17, 4, 17);
        return { body: Body.create({ parts: [seat, back, l1, l2], ...o }), color: ['#c0623a', '#3a8fc0', '#5aa04a', '#c0a03a'][Math.floor(rand(0, 4))], mass: 1.4 };
      }
    }
  }

  spawnProp(type: PropType, x: number, y: number, opts: { vx?: number; vy?: number; spin?: number; quiet?: boolean } = {}) {
    while (this.props.length >= PROP_CAP) {
      const victim = this.props.find((p) => p.debris) ?? this.props.find((p) => p.type !== 'cell');
      if (!victim) break;
      this.removeProp(victim, true);
    }
    const { body, color, mass } = this.makePropBody(type, x, y);
    Body.setMass(body, mass);
    const prop: Prop = {
      body, type, color, born: this.time,
      debris: type === 'can' || type === 'book' || type === 'dodgeball',
      baseFriction: body.friction, burnT: 0, charred: 0, frozenT: 0, scale: 1,
    };
    setTag(body, { kind: 'prop', prop });
    if (opts.vx || opts.vy) Body.setVelocity(body, { x: opts.vx ?? 0, y: opts.vy ?? 0 });
    if (opts.spin) Body.setAngularVelocity(body, opts.spin);
    Composite.add(this.engine.world, body);
    this.props.push(prop);
    if (!opts.quiet) this.fx.puff(x, y, 'rgba(255,255,255,0.9)', 8, 80);
    return prop;
  }

  removeProp(p: Prop, puff = false) {
    this.detachBody(p.body);
    Composite.remove(this.engine.world, p.body);
    this.props = this.props.filter((x) => x !== p);
    if (puff) this.fx.puff(p.body.position.x, p.body.position.y, 'rgba(255,255,255,0.8)', 6, 60);
  }

  spawnProjectile(owner: Actor, kind: Projectile['kind'], x: number, y: number, vx: number, vy: number, r: number, gravityComp: number, life: number) {
    const body = Bodies.circle(x, y, r, {
      frictionAir: 0, friction: 0, restitution: 0.3,
      collisionFilter: { group: owner.group, category: 0x0002, mask: 0xffffffff },
    });
    Body.setMass(body, kind === 'fireball' ? 0.5 : 0.3);
    Body.setVelocity(body, { x: vx, y: vy });
    const proj: Projectile = { body, owner, kind, life, gravityComp, dead: false };
    setTag(body, { kind: 'proj', proj });
    Composite.add(this.engine.world, body);
    this.projectiles.push(proj);
    return proj;
  }

  private removeProjectile(p: Projectile) {
    p.dead = true;
    Composite.remove(this.engine.world, p.body);
    this.projectiles = this.projectiles.filter((x) => x !== p);
  }

  // ================================================================ hazards

  addVine(owner: Actor, c: Matter.Constraint, life: number, shrinkTo: number, kind: Vine['kind'], cap: number) {
    capList(this.vines, owner, cap, (v) => this.removeVine(v));
    Composite.add(this.engine.world, c);
    this.vines.push({ owner, c, life, max: life, shrinkTo, kind });
  }

  vineEnds(v: Vine): [Vec, Vec] {
    const c = v.c;
    const a = c.bodyA ? { x: c.bodyA.position.x + c.pointA.x, y: c.bodyA.position.y + c.pointA.y } : { x: c.pointA.x, y: c.pointA.y };
    const b = c.bodyB ? { x: c.bodyB.position.x + c.pointB.x, y: c.bodyB.position.y + c.pointB.y } : { x: c.pointB.x, y: c.pointB.y };
    return [a, b];
  }

  removeVine(v: Vine, burnt = false) {
    Composite.remove(this.engine.world, v.c);
    this.vines = this.vines.filter((x) => x !== v);
    const [a, b] = this.vineEnds(v);
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (burnt) { this.fx.flames(m.x, m.y, 6, 20); this.fx.text(m.x, m.y - 10, 'vine burnt', '#ffb070'); }
    else this.fx.leaves(m.x, m.y, 4);
  }

  addIce(owner: Actor, x: number, y: number, w: number, h: number, life: number, cap: number) {
    capList(this.ice, owner, cap, (i) => this.removeIce(i, 'shatter'));
    const body = Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0.02, chamfer: { radius: 4 } });
    const ice: IceWall = { body, owner, life, max: life, w, h };
    setTag(body, { kind: 'ice', ice });
    Composite.add(this.engine.world, body);
    this.ice.push(ice);
    // Shove anything we just encased upward so it is not stuck inside.
    for (const o of this.dynamicBodies()) {
      if (Bounds.overlaps(o.bounds, body.bounds)) {
        Body.setPosition(o, { x: o.position.x, y: body.bounds.min.y - bodyRadius(o) - 2 });
        Body.setVelocity(o, { x: o.velocity.x, y: -3 });
      }
    }
    return ice;
  }

  removeIce(i: IceWall, how: 'melt' | 'shatter' | 'expire') {
    Composite.remove(this.engine.world, i.body);
    this.ice = this.ice.filter((x) => x !== i);
    const { x, y } = i.body.position;
    if (how === 'melt') this.fx.steam(x, y, 14);
    else this.fx.shards(x, y, 'rgba(190,235,255,0.95)', 16, 260);
  }

  nearestBeacon(x: number, y: number, r: number) {
    let best: Beacon | null = null;
    let bd = r;
    for (const b of this.beacons) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  nearestActor(a: Actor, r: number) {
    let best: Actor | null = null;
    let bd = r;
    for (const o of this.actors) {
      if (o === a || o.dead || o.owner === a || a.owner === o) continue;
      const d = Math.hypot(o.pos.x - a.pos.x, o.pos.y - a.pos.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ================================================================ machines + core

  hideCell() {
    if (this.props.some((p) => p.type === 'cell')) return;
    const lockers = this.machines.filter((m) => m.kind === 'locker');
    for (const m of lockers) m.hasCell = false;
    lockers[Math.floor(rand(0, lockers.length))].hasCell = true;
  }

  /** The machine under the aim point, else the nearest one to the caster. */
  findMachine(caster: Actor, maxDist: number, aim?: Vec) {
    if (aim) {
      for (const m of this.machines) {
        const inX = Math.abs(aim.x - m.x) < m.w / 2 + 10;
        const inY = aim.y > m.y - m.h - 10 && aim.y < m.y + 10;
        if (inX && inY && Math.hypot(m.x - caster.pos.x, m.y - m.h / 2 - caster.pos.y) < maxDist * 1.6) return m;
      }
    }
    let best: Machine | null = null;
    let bd = maxDist;
    for (const m of this.machines) {
      const d = Math.hypot(m.x - caster.pos.x, m.y - m.h / 2 - caster.pos.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  activateMachine(m: Machine, caster: Actor, aim: Vec) {
    const from = { x: m.x, y: m.y - m.h * 0.62 };
    // Aimed at the machine itself: it fires away from the caster. Aimed elsewhere: it fires at the aim point.
    const onMachine = Math.abs(aim.x - m.x) < m.w / 2 + 10 && aim.y > m.y - m.h - 10 && aim.y < m.y + 10;
    let d = norm(aim.x - from.x, aim.y - from.y);
    if (onMachine || Math.hypot(aim.x - from.x, aim.y - from.y) < 70) d = norm(sign(m.x - caster.pos.x) || caster.facing, -0.45);
    m.hum = 0.7;
    this.fx.sparks(from.x, from.y, '#8affc1', 10, 200);
    if (m.kind === 'locker') {
      m.openT = 2.4;
      const n = 2 + Math.floor(rand(0, 3));
      for (let i = 0; i < n; i++) {
        this.later(i * 0.07, () => this.spawnProp('book', from.x + d.x * 18, from.y + rand(-20, 20), { vx: d.x * rand(9, 14) + rand(-2, 2), vy: d.y * rand(9, 14) - 2, spin: rand(-0.4, 0.4), quiet: true }));
      }
      if (m.hasCell) {
        m.hasCell = false;
        this.later(0.25, () => {
          this.spawnProp('cell', from.x + d.x * 18, from.y, { vx: d.x * 8, vy: -6, quiet: true });
          this.fx.stars(from.x, from.y, '#7af7ff', 12);
          this.toast('Power cell! Carry or throw it into the glowing intake in the courtyard.');
        });
      } else this.fx.text(from.x, from.y - 30, 'just books', '#d8e4ff');
    } else if (m.kind === 'vending') {
      for (let i = 0; i < 6; i++) {
        this.later(i * 0.09, () => {
          const s = rand(14, 19);
          this.spawnProp('can', from.x + d.x * 30, from.y + 20, { vx: d.x * s + rand(-1.5, 1.5), vy: d.y * s + rand(-1.5, 1.5), spin: rand(-0.5, 0.5), quiet: true });
          this.fx.sparks(from.x + d.x * 30, from.y + 20, '#fff', 4, 120);
        });
      }
    } else {
      for (let i = 0; i < 3; i++) {
        this.later(i * 0.18, () => {
          this.spawnProp('dodgeball', from.x + d.x * 30, from.y, { vx: d.x * 21, vy: d.y * 21, quiet: true });
          this.fx.ring(from.x + d.x * 30, from.y, 24, 'rgba(255,255,255,0.8)', 3, 0.2);
        });
      }
    }
  }

  toggleCore() {
    if (this.core.mode === 'off') {
      this.core.mode = 'on';
      this.toast('Core online. Gravity back to normal.');
    } else {
      this.core.mode = 'off';
      this.toast('Core offline! Gravity is surging and the campus is tipping toward the edge.');
    }
  }

  private consumeCell(p: Prop) {
    this.removeProp(p);
    this.core.mode = 'over';
    this.core.overT = 20;
    this.fx.ring(INTAKE.x, INTAKE.y, 220, 'rgba(180,140,255,0.9)', 8, 0.8);
    this.fx.stars(INTAKE.x, INTAKE.y, '#c9b2ff', 24);
    this.fx.flashScreen(0.45, '200,170,255');
    this.toast('Core overcharged: low gravity for 20 seconds!');
    this.later(22, () => this.hideCell());
  }

  private updateCore(dt: number) {
    const c = this.core;
    if (c.mode === 'over') {
      c.overT -= dt;
      if (c.overT <= 0) {
        c.mode = 'on';
        this.toast('Overcharge spent. The cell regrows in a locker somewhere…');
      }
    }
    const gx = c.mode === 'off' ? 0.34 : 0;
    const gy = c.mode === 'off' ? 1.7 : c.mode === 'over' ? 0.42 : 1;
    const k = 1 - Math.exp(-dt * 2);
    const g = this.engine.gravity;
    g.x += (gx - g.x) * k;
    g.y += (gy - g.y) * k;
    c.blendOff += ((c.mode === 'off' ? 1 : 0) - c.blendOff) * k;
    c.blendOver += ((c.mode === 'over' ? 1 : 0) - c.blendOver) * k;
    this.tilt += ((c.mode === 'off' ? 0.05 : 0) - this.tilt) * k;
    if (c.mode === 'off') {
      if (Math.random() < dt * 4) this.fx.sparks(CORE.x + rand(-30, 30), CORE.y + rand(-30, 30), '#ff6a4a', 4, 160, 200);
      if (Math.random() < dt * 0.8) this.fx.addShake(2);
    }
  }

  // ================================================================ queries

  hasBody(b: Matter.Body) {
    return Composite.get(this.engine.world, b.id, 'body') !== null;
  }

  /** Every moving thing you can push: live actors and props. */
  dynamicBodies(): Matter.Body[] {
    const out: Matter.Body[] = [];
    for (const a of this.actors) if (!a.dead) out.push(a.body);
    for (const p of this.props) out.push(p.body);
    return out;
  }

  private solids(): Matter.Body[] {
    const out = this.dynamicBodies();
    for (const t of this.terrain) out.push(t.body);
    for (const i of this.ice) out.push(i.body);
    return out;
  }

  private standables(a: Actor) {
    return this.solids().filter((o) => o !== a.body && o.collisionFilter.group !== a.group);
  }

  isGrounded(a: Actor) {
    const b = a.body;
    const bb = b.bounds;
    const y = bb.max.y + 2.5;
    const xs = a.dims.round ? [b.position.x] : [bb.min.x + 4, b.position.x, bb.max.x - 4];
    const region = { min: { x: bb.min.x, y: bb.max.y - 2 }, max: { x: bb.max.x, y: bb.max.y + 4 } };
    const near = this.standables(a).filter((o) => Bounds.overlaps(o.bounds, region));
    if (!near.length) return false;
    return xs.some((x) => Query.point(near, { x, y }).length > 0);
  }

  groundAhead(a: Actor, dir: number) {
    const bb = a.body.bounds;
    const x = (dir > 0 ? bb.max.x : bb.min.x) + dir * 16;
    const cands = this.standables(a);
    for (let dy = 6; dy <= 90; dy += 12) {
      if (Query.point(cands, { x, y: bb.max.y + dy }).length) return true;
    }
    return false;
  }

  /** Step along a ray and return the first solid it touches. */
  raycast(from: Vec, dir: Vec, len: number, opts: { ignore?: Matter.Body[]; dynamicOnly?: boolean; staticOnly?: boolean } = {}): RayHit | null {
    const ignore = new Set(opts.ignore ?? []);
    let cands = opts.dynamicOnly ? this.dynamicBodies() : opts.staticOnly ? [...this.terrain.map((t) => t.body), ...this.ice.map((i) => i.body)] : this.solids();
    const to = { x: from.x + dir.x * len, y: from.y + dir.y * len };
    const box = { min: { x: Math.min(from.x, to.x) - 2, y: Math.min(from.y, to.y) - 2 }, max: { x: Math.max(from.x, to.x) + 2, y: Math.max(from.y, to.y) + 2 } };
    cands = cands.filter((b) => !ignore.has(b) && Bounds.overlaps(b.bounds, box));
    if (!cands.length) return null;
    for (let s = 0; s <= len; s += 6) {
      const p = { x: from.x + dir.x * s, y: from.y + dir.y * s };
      const hit = Query.point(cands, p);
      if (hit.length) return { body: hit[0], point: p, dist: s };
    }
    return null;
  }

  groundBelow(x: number, y: number, maxDist = 600): Vec | null {
    const h = this.raycast({ x, y }, { x: 0, y: 1 }, maxDist, { staticOnly: true });
    return h ? h.point : null;
  }

  // ================================================================ forces

  kick(b: Matter.Body, dx: number, dy: number) {
    if (b.isStatic) return;
    let k = 1;
    const t = tagOf(b);
    if (t?.kind === 'actor') {
      if (t.actor.dead) return;
      k = t.actor.knockScale();
      t.actor.onKnock(Math.hypot(dx, dy) * k);
    }
    let vx = b.velocity.x + dx * k;
    let vy = b.velocity.y + dy * k;
    const s = Math.hypot(vx, vy);
    if (s > 42) { vx *= 42 / s; vy *= 42 / s; }
    Body.setVelocity(b, { x: vx, y: vy });
  }

  antiGravity(b: Matter.Body, comp: number) {
    const g = this.engine.gravity;
    Body.applyForce(b, b.position, { x: -g.x * g.scale * b.mass * comp, y: -g.y * g.scale * b.mass * comp });
  }

  private applyStatus(b: Matter.Body, o: HitOpts, f: number) {
    const t = tagOf(b);
    if (t?.kind === 'actor') {
      if (t.actor === o.owner) return;
      if (o.ignite) t.actor.ignite();
      if (o.stun) t.actor.daze(o.stun * f);
      if (o.freeze) t.actor.freeze(o.freeze);
    } else if (t?.kind === 'prop') {
      const p = t.prop;
      if (o.ignite) {
        if (p.frozenT > 0) { p.frozenT = 0; this.fx.steam(b.position.x, b.position.y, 6); }
        else p.burnT = Math.max(p.burnT, 5);
      }
      if (o.freeze) { p.frozenT = o.freeze; p.burnT = 0; }
    }
  }

  private hazardsAt(test: (p: Vec) => boolean, o: HitOpts) {
    if (o.ignite) {
      for (const v of [...this.vines]) {
        const [a, b] = this.vineEnds(v);
        if (test(a) || test(b) || test({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) this.removeVine(v, true);
      }
      for (const i of [...this.ice]) if (test(i.body.position)) this.removeIce(i, 'melt');
    }
    if (o.shatter) for (const i of [...this.ice]) if (test(i.body.position)) this.removeIce(i, 'shatter');
  }

  /** Radial impulse. Heavier bodies move less, but everything moves. */
  blast(x: number, y: number, r: number, power: number, o: HitOpts = {}) {
    const ex = new Set(o.exclude ?? []);
    for (const b of this.dynamicBodies()) {
      if (ex.has(b)) continue;
      const dx = b.position.x - x, dy = b.position.y - y;
      const d = Math.max(0, Math.hypot(dx, dy) - bodyRadius(b) * 0.6);
      if (d > r) continue;
      const f = 1 - (d / r) * 0.7;
      let n = norm(dx, dy);
      if (n.x === 0 && n.y === 0) n = { x: 0, y: -1 };
      n = norm(n.x, n.y - (o.upBias ?? 0.35));
      const dv = power * f * massFactor(b.mass);
      this.kick(b, n.x * dv, n.y * dv);
      this.applyStatus(b, o, f);
    }
    this.hazardsAt((p) => Math.hypot(p.x - x, p.y - y) < r + 20, o);
  }

  /** Directional impulse inside a cone. */
  cone(origin: Vec, dir: Vec, range: number, half: number, power: number, o: HitOpts = {}) {
    const ex = new Set(o.exclude ?? []);
    const inCone = (p: Vec, pad = 0) => {
      const vx = p.x - origin.x, vy = p.y - origin.y;
      const d = Math.hypot(vx, vy);
      if (d > range + pad) return false;
      if (d < 18 + pad) return true;
      const cos = (vx * dir.x + vy * dir.y) / d;
      return Math.acos(clamp(cos, -1, 1)) <= half + Math.atan2(pad, d);
    };
    for (const b of this.dynamicBodies()) {
      if (ex.has(b)) continue;
      const pad = bodyRadius(b) * 0.6;
      if (!inCone(b.position, pad)) continue;
      const d = Math.hypot(b.position.x - origin.x, b.position.y - origin.y);
      const f = 1 - clamp(d / range, 0, 1) * 0.6;
      const n = norm(b.position.x - origin.x, b.position.y - origin.y);
      const push = norm(dir.x * 0.75 + n.x * 0.25, dir.y * 0.75 + n.y * 0.25 - (o.upBias ?? 0.2));
      const dv = power * f * massFactor(b.mass);
      this.kick(b, push.x * dv, push.y * dv);
      this.applyStatus(b, o, f);
    }
    this.hazardsAt((p) => inCone(p, 20), o);
  }

  /** Drop every constraint/hold that references a body (before it is removed or swapped). */
  detachBody(b: Matter.Body) {
    for (const v of [...this.vines]) if (v.c.bodyA === b || v.c.bodyB === b) this.removeVine(v);
    for (const a of this.actors) {
      if (a.holding?.body === b || a.body === b) a.release();
    }
    const t = tagOf(b);
    if (t?.kind === 'actor' && t.actor.heldBy) t.actor.heldBy.release();
  }

  // ================================================================ powers

  trigger(a: Actor, slot: number) {
    if (a.dead || !a.canAct()) {
      if (a.babyT > 0 && a.isPossessed()) this.fx.text(a.pos.x, a.pos.y - 40, 'goo goo', '#ffc0e0');
      return false;
    }
    const s = slotsFor(a.def)[slot];
    if (!s || a.cd[slot] > 0) return false;
    const ok = s.use(a, { ...a.aim }, this);
    if (ok !== false) a.cd[slot] = s.cooldown;
    return ok !== false;
  }

  // ================================================================ step

  private die(a: Actor) {
    a.release();
    a.heldBy?.release();
    this.detachBody(a.body);
    Composite.remove(this.engine.world, a.body);
    a.dead = true;
    a.respawnT = 1.5;
    a.rush = null;
  }

  respawnActor(a: Actor) {
    a.dead = false;
    a.form = 'normal';
    a.babyT = a.frozenT = a.burnT = a.dazeT = a.staggerT = a.noGravT = a.dashT = a.ramT = a.cometT = a.whirlT = 0;
    a.trail = [];
    const x = PAD.x + rand(-30, 30);
    a.buildBody(x, PAD.y - 60);
    Body.setPosition(a.body, { x, y: PAD.y - a.dims.h / 2 - 4 });
    Composite.add(this.engine.world, a.body);
    this.fx.puff(x, PAD.y - a.dims.h / 2, 'rgba(255,255,255,0.95)', 14);
  }

  private inSlick(b: Matter.Body) {
    for (const s of this.slicks) {
      if (Math.abs(b.position.x - s.x) < s.w / 2 && b.bounds.max.y > s.y - 16 && b.bounds.max.y < s.y + 8) return true;
    }
    return false;
  }

  step(dt: number) {
    this.time += dt;
    this.updateCore(dt);
    this.xrayT = Math.max(0, this.xrayT - dt);
    this.revealT = Math.max(0, this.revealT - dt);

    for (const a of this.actors) {
      if (a.dead) continue;
      a.slick = this.inSlick(a.body);
      if (a.slick && a.frozenT <= 0) a.body.friction = 0;
      else if (a.frozenT <= 0) a.body.friction = a.form === 'puddle' ? 0 : a.form === 'rock' ? 0.8 : 0.04;
      if (!a.isPossessed()) a.think(dt);
    }
    for (const a of [...this.actors]) a.update(dt);

    this.updateProps(dt);

    for (const p of [...this.projectiles]) {
      p.life -= dt;
      this.antiGravity(p.body, p.gravityComp);
      const { x, y } = p.body.position;
      if (p.kind === 'fireball') this.fx.flames(x, y, 2, 4, -p.body.velocity.x * 15, -p.body.velocity.y * 15);
      else this.fx.p({ x, y, max: 0.25, size: 4, grow: -10, color: '#ffe08a', kind: 'spark' });
      if (p.life <= 0 || y > FALL_Y || Math.abs(x) > 6000 || y < -4000) {
        this.fx.puff(x, y, 'rgba(120,120,120,0.6)', 4, 40);
        this.removeProjectile(p);
      }
    }

    for (const v of [...this.vines]) {
      v.life -= dt;
      v.c.length = Math.max(v.shrinkTo, v.c.length - dt * 420);
      const gone = (v.c.bodyA && !this.hasBody(v.c.bodyA)) || (v.c.bodyB && !this.hasBody(v.c.bodyB));
      if (v.life <= 0 || gone) this.removeVine(v);
    }
    for (const i of [...this.ice]) {
      i.life -= dt;
      if (i.life <= 0) this.removeIce(i, 'melt');
    }
    for (const s of this.slicks) s.life -= dt;
    this.slicks = this.slicks.filter((s) => s.life > 0);
    for (const b of this.beacons) {
      b.life -= dt;
      if (Math.random() < dt * 8) this.fx.p({ x: b.x + rand(-10, 10), y: b.y + rand(-10, 10), vy: -30, max: 0.6, size: 3, color: '#fff6a0', kind: 'star' });
    }
    this.beacons = this.beacons.filter((b) => b.life > 0);

    for (const m of this.machines) {
      m.openT = Math.max(0, m.openT - dt);
      m.hum = Math.max(0, m.hum - dt);
    }

    Engine.update(this.engine, 1000 / 60);

    // Contacts collected during the update.
    const contacts = this.contacts;
    this.contacts = [];
    for (const [a, b] of contacts) {
      this.onContact(a, b);
      this.onContact(b, a);
    }

    // Edge-fall volume.
    for (const a of this.actors) {
      if (!a.dead && a.pos.y > FALL_Y) this.die(a);
    }
    for (const p of [...this.props]) {
      if (p.body.position.y <= FALL_Y && Math.abs(p.body.position.x) < 8000) continue;
      this.removeProp(p);
      if (p.type === 'cell') {
        this.later(1.5, () => {
          this.hideCell();
          this.toast('The power cell fell off campus. It has reappeared in a locker.');
        });
      } else if (!p.debris) {
        const type = p.type;
        this.later(1.5, () => this.spawnProp(type, PAD.x + rand(-40, 40), PAD.y - 70));
      }
    }

    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();

    this.fx.update(dt);
  }

  private onContact(self: Matter.Body, other: Matter.Body) {
    const t = tagOf(self);
    if (!t) return;
    if (t.kind === 'proj' && !t.proj.dead && !other.isSensor) {
      const p = t.proj;
      const { x, y } = self.position;
      if (p.kind === 'fireball') {
        this.blast(x, y, 90, 12, { owner: p.owner, ignite: true, upBias: 0.45 });
        this.fx.ring(x, y, 80, 'rgba(255,150,60,0.9)', 5, 0.3);
        this.fx.flames(x, y, 14, 16);
        this.fx.sparks(x, y, '#ffcf6a', 10, 260);
        this.fx.addShake(4);
      } else {
        const v = norm(self.velocity.x, self.velocity.y);
        this.kick(other, v.x * 9, v.y * 9 - 2);
        this.fx.sparks(x, y, '#ffe08a', 8, 200);
      }
      this.removeProjectile(p);
    } else if (t.kind === 'sensor' && t.id === 'intake') {
      const ot = tagOf(other);
      if (ot?.kind === 'prop' && ot.prop.type === 'cell' && this.props.includes(ot.prop)) {
        for (const a of this.actors) if (a.holding?.body === other) a.release();
        this.consumeCell(ot.prop);
      }
    }
  }

  private updateProps(dt: number) {
    for (const p of this.props) {
      const b = p.body;
      if (p.frozenT > 0) p.frozenT = Math.max(0, p.frozenT - dt);
      const slick = p.frozenT > 0 || this.inSlick(b);
      b.friction = slick ? 0 : p.baseFriction;
      if (p.burnT > 0) {
        p.burnT -= dt;
        p.charred = Math.min(1, p.charred + dt * 0.18);
        if (Math.random() < 0.6) this.fx.flames(b.position.x, b.position.y - 4, 1, bodyRadius(b) * 0.6);
        if (Math.random() < dt * 1.2) {
          const box = { min: { x: b.bounds.min.x - 10, y: b.bounds.min.y - 10 }, max: { x: b.bounds.max.x + 10, y: b.bounds.max.y + 10 } };
          for (const q of this.props) if (q !== p && q.burnT <= 0 && q.frozenT <= 0 && Bounds.overlaps(q.body.bounds, box)) q.burnT = 4;
          for (const a of this.actors) if (!a.dead && Bounds.overlaps(a.body.bounds, box)) a.ignite(2);
        }
      }
      if (p.type === 'cell' && Math.random() < dt * 6) {
        this.fx.p({ x: b.position.x + rand(-8, 8), y: b.position.y + rand(-12, 12), vy: -25, max: 0.5, size: 2.5, color: '#7af7ff', kind: 'star' });
      }
      for (const bc of this.beacons) {
        const dx = bc.x - b.position.x, dy = bc.y - b.position.y;
        const d = Math.hypot(dx, dy);
        if (d < 280 && d > 12 && b.mass < 3) {
          this.antiGravity(b, 0.75);
          Body.setVelocity(b, { x: b.velocity.x * 0.98 + (dx / d) * 0.12, y: b.velocity.y * 0.98 + (dy / d) * 0.12 });
        }
      }
    }
  }
}

