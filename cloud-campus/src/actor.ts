import Matter from 'matter-js';
import type { World } from './world';
import { norm, rand, setTag, sign, tagOf, type CharacterDef, type Form, type PowerId, type Vec } from './types';

const { Bodies, Body, Composite, Constraint, Bounds } = Matter;

interface Hold {
  body: Matter.Body;
  c: Matter.Constraint;
  prevGroup: number;
}

const SKINS = ['#f1c9a5', '#d9a27a', '#a8714a', '#7a4b2c', '#e8b896', '#c68c5f'];
const HAIRS = ['#2b1d14', '#5a3a1e', '#c9a14a', '#1a1a22', '#8b2f1f', '#d8d0c8', '#3b2a4f'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A character instance: one Matter body plus control state. Possessed actors
 * read `ctrl` from the keyboard; everyone else gets `ctrl` from `think()`.
 */
export class Actor {
  static nextId = 1;
  readonly id = Actor.nextId++;
  /** Unique negative collision group: things this actor holds or shoots never hit it. */
  readonly group = Body.nextGroup(true);
  body!: Matter.Body;
  dims = { w: 0, h: 0, round: false };
  baseInertia = 1;

  form: Form = 'normal';
  babyT = 0;
  frozenT = 0;
  burnT = 0;
  dazeT = 0;
  staggerT = 0;
  tumbleT = 0;
  uprighting = false;
  noGravT = 0;
  dashT = 0;
  ramT = 0;
  ramPow = 0;
  ramHit = new Set<number>();
  cometT = 0;
  whirlT = 0;
  armT = 0;
  arm: Vec | null = null;
  cd = [0, 0];

  grounded = false;
  coyote = 0;
  jumpBuf = 0;
  prevVy = 0;
  jumpedAt = -99;
  copiedJump = -99;
  facing = 1;
  aim: Vec = { x: 0, y: 0 };
  walk = 0;
  slick = false;
  ctrl = { move: 0, jump: false, down: false };

  holding: Hold | null = null;
  heldBy: Actor | null = null;
  owner: Actor | null = null;
  followOffset = rand(-90, 90);
  rush: { x: number; y: number; t: number } | null = null;
  ai = { t: rand(0, 2), mode: 'idle' as 'idle' | 'walk', dir: Math.random() < 0.5 ? -1 : 1, stuck: 0 };

  dead = false;
  respawnT = 0;
  removed = false;
  trail: { x: number; y: number; a: number }[] = [];

  readonly skin: string;
  readonly hair: string;
  readonly hairStyle: number;

  constructor(public world: World, public def: CharacterDef, x: number, y: number) {
    const h = hash(def.id);
    this.skin = SKINS[h % SKINS.length];
    this.hair = HAIRS[(h >>> 4) % HAIRS.length];
    this.hairStyle = (h >>> 9) % 4;
    this.buildBody(x, y);
    Composite.add(world.engine.world, this.body);
    this.aim = { x: x + 100, y };
  }

  get pos() {
    return this.body.position;
  }
  get vel() {
    return this.body.velocity;
  }

  has(p: PowerId) {
    return this.def.powers.includes(p);
  }
  canFly() {
    return this.has('flight') && this.form === 'normal' && this.babyT <= 0;
  }
  invuln() {
    return this.has('invuln');
  }
  /** Can steer and jump. */
  canMove() {
    return !this.dead && this.frozenT <= 0 && this.dazeT <= 0 && !this.heldBy && this.staggerT <= 0 && this.tumbleT <= 0 && this.dashT <= 0 && !this.uprighting;
  }
  /** Can use powers. Babies and the frozen cannot. */
  canAct() {
    return !this.dead && this.frozenT <= 0 && this.dazeT <= 0 && !this.heldBy && this.babyT <= 0;
  }
  isPossessed() {
    return this.world.possessed === this;
  }

  sizeMult() {
    return (this.form === 'giant' ? 2.1 : 1) * (this.babyT > 0 ? 0.6 : 1);
  }

  /** Point where powers come out of. */
  hand(): Vec {
    const p = this.pos;
    if (this.dims.round) return { x: p.x, y: p.y };
    return { x: p.x + this.facing * this.dims.w * 0.25, y: p.y - this.dims.h * 0.12 };
  }

  aimDir(aim: Vec = this.aim): Vec {
    const o = this.hand();
    const d = norm(aim.x - o.x, aim.y - o.y);
    return d.x === 0 && d.y === 0 ? { x: this.facing, y: 0 } : d;
  }

  // ---------------------------------------------------------------- bodies

  private shape() {
    const r = this.def.radius * this.sizeMult();
    switch (this.form) {
      case 'puddle': return { w: r * 3.2, h: r * 0.62, round: false };
      case 'guinea': return { w: r * 1.35, h: r * 0.9, round: false };
      case 'rock': return { w: r * 2.7, h: r * 2.7, round: true };
      default: return { w: r * 1.25, h: r * 2.7, round: false };
    }
  }

  private massMult() {
    const baby = this.babyT > 0 ? 0.5 : 1;
    switch (this.form) {
      case 'puddle': return 0.9 * baby;
      case 'guinea': return 0.22 * baby;
      case 'rock': return 7 * baby;
      case 'giant': return 6 * baby;
      default: return baby;
    }
  }

  buildBody(x: number, y: number, vx = 0, vy = 0) {
    const s = this.shape();
    this.dims = s;
    const common = {
      friction: this.form === 'puddle' ? 0 : 0.04,
      frictionStatic: 0.2,
      frictionAir: 0.012,
      restitution: 0.04,
      collisionFilter: { group: this.group, category: 0x0001, mask: 0xffffffff },
    };
    let body: Matter.Body;
    if (s.round) {
      body = Bodies.circle(x, y, s.w / 2, { ...common, friction: 0.8, restitution: 0.12 }, 24);
    } else {
      const ch = Math.min(s.w, s.h) * 0.45;
      body = Bodies.rectangle(x, y, s.w, s.h, { ...common, chamfer: { radius: ch } });
    }
    setTag(body, { kind: 'actor', actor: this });
    Body.setMass(body, this.def.mass * this.massMult());
    this.baseInertia = body.inertia;
    if (!s.round) Body.setInertia(body, Infinity);
    Body.setVelocity(body, { x: vx, y: vy });
    this.body = body;
    this.tumbleT = 0;
    this.uprighting = false;
  }

  /** Swap the body for the current form/size, keeping feet planted and momentum. */
  rebuild() {
    const w = this.world;
    const old = this.body;
    const bottom = old.bounds.max.y;
    const { x } = old.position;
    const v = { ...old.velocity };
    w.detachBody(old);
    Composite.remove(w.engine.world, old);
    const s = this.shape();
    this.buildBody(x, bottom - s.h / 2 - 1, v.x, v.y);
    Composite.add(w.engine.world, this.body);
  }

  setForm(f: Form) {
    const next = this.form === f ? 'normal' : f;
    this.form = next;
    this.rebuild();
    return next;
  }

  // ---------------------------------------------------------------- statuses

  knockScale() {
    let k = 1;
    if (this.invuln()) k *= 0.3;
    if (this.form === 'rock') k *= 0.35;
    if (this.form === 'giant') k *= 0.5;
    if (this.babyT > 0) k *= 1.3;
    return k;
  }

  onKnock(mag: number) {
    if (this.dead) return;
    this.staggerT = Math.max(this.staggerT, Math.min(0.7, mag * 0.045));
    if (mag > 9 && !this.dims.round && !this.invuln()) this.startTumble();
  }

  startTumble(spin = 0.12) {
    if (this.dims.round || this.dead) return;
    if (this.tumbleT <= 0 && !this.uprighting) Body.setInertia(this.body, this.baseInertia);
    this.uprighting = false;
    this.tumbleT = 1.3;
    Body.setAngularVelocity(this.body, this.body.angularVelocity + rand(-spin, spin));
  }

  freeze(t: number) {
    if (this.invuln() || this.has('ice') || this.dead) return false;
    if (this.has('fire')) { this.world.fx.steam(this.pos.x, this.pos.y, 6); return false; }
    this.frozenT = t;
    this.burnT = 0;
    this.release();
    this.body.friction = 0;
    return true;
  }

  ignite(t = 3.5) {
    if (this.invuln() || this.has('fire') || this.dead) return;
    if (this.frozenT > 0) {
      this.frozenT = 0;
      this.world.fx.steam(this.pos.x, this.pos.y, 10);
      return;
    }
    this.burnT = Math.max(this.burnT, t);
  }

  daze(t: number) {
    if (this.invuln() || this.dead) return;
    this.dazeT = Math.max(this.dazeT, t);
  }

  babify(t: number) {
    if (this.invuln() || this.dead) return false;
    const was = this.babyT > 0;
    this.babyT = t;
    if (!was) {
      this.release();
      this.rebuild();
    }
    return true;
  }

  /** Clear negative statuses (Nurse Spex). */
  cleanse() {
    this.frozenT = 0;
    this.burnT = 0;
    this.dazeT = 0;
    if (this.babyT > 0) {
      this.babyT = 0;
      this.rebuild();
    }
  }

  dash(d: Vec, speed: number, t: number, ramPow: number, noGrav = t) {
    Body.setVelocity(this.body, { x: d.x * speed, y: d.y * speed });
    this.dashT = t;
    this.ramT = Math.max(this.ramT, t);
    this.ramPow = ramPow;
    this.ramHit.clear();
    this.noGravT = Math.max(this.noGravT, noGrav);
  }

  // ---------------------------------------------------------------- holding

  grab(b: Matter.Body) {
    const w = this.world;
    this.release();
    const t = tagOf(b);
    if (t?.kind === 'actor') {
      t.actor.release();
      if (t.actor.heldBy) t.actor.heldBy.release();
      t.actor.heldBy = this;
    } else {
      for (const a of w.actors) if (a.holding?.body === b) a.release();
    }
    // World-anchored spring: the held body chases the hand without dragging the holder.
    const c = Constraint.create({ pointA: this.hand(), bodyB: b, pointB: { x: 0, y: 0 }, length: 0, stiffness: 0.2, damping: 0.12 });
    Composite.add(w.engine.world, c);
    const prevGroup = b.collisionFilter.group ?? 0;
    b.collisionFilter.group = this.group;
    this.holding = { body: b, c, prevGroup };
  }

  release(vel?: Vec, spin = 0) {
    const h = this.holding;
    if (!h) return;
    this.holding = null;
    const w = this.world;
    Composite.remove(w.engine.world, h.c);
    const t = tagOf(h.body);
    if (vel) {
      Body.setVelocity(h.body, vel);
      if (t?.kind !== 'actor') Body.setAngularVelocity(h.body, spin);
    }
    if (t?.kind === 'actor') {
      t.actor.heldBy = null;
      if (vel) {
        t.actor.startTumble(0.25);
        t.actor.staggerT = 0.6;
      }
    }
    const group = this.group;
    w.later(0.3, () => {
      if (h.body.collisionFilter.group === group) h.body.collisionFilter.group = h.prevGroup;
    });
  }

  // ---------------------------------------------------------------- AI

  think(dt: number) {
    const w = this.world;
    const c = this.ctrl;
    c.move = 0;
    c.jump = false;
    c.down = false;
    if (this.dead || !this.canMove()) return;
    const p = this.pos;
    const ai = this.ai;
    ai.t -= dt;
    let cliffCare = true;

    if (this.owner && (this.owner.removed || this.owner.dead)) {
      if (this.owner.removed) this.owner = null;
    }

    if (this.rush) {
      const dx = this.rush.x - p.x;
      if (Math.abs(dx) > 18) c.move = sign(dx);
      if (this.rush.y < p.y - 70 && this.grounded) this.jumpBuf = 0.1;
      this.rush.t -= dt;
      if (this.rush.t <= 0) this.rush = null;
      cliffCare = false;
    } else if (this.burnT > 0) {
      if (ai.t <= 0) { ai.dir = Math.random() < 0.5 ? -1 : 1; ai.t = rand(0.3, 0.7); }
      c.move = ai.dir;
      if (Math.random() < dt * 2.5) this.jumpBuf = 0.1;
    } else if (this.owner && !this.owner.dead) {
      const o = this.owner;
      const dx = o.pos.x + this.followOffset - p.x;
      if (Math.abs(dx) > 36) c.move = sign(dx);
      if (o.jumpedAt > this.copiedJump && w.time - o.jumpedAt > 0.08 + (this.id % 5) * 0.04) {
        this.copiedJump = o.jumpedAt;
        this.jumpBuf = 0.12;
      }
      if (o.pos.y < p.y - 120 && this.grounded && Math.random() < dt * 3) this.jumpBuf = 0.1;
    } else {
      const beacon = w.nearestBeacon(p.x, p.y, 720);
      if (beacon) {
        const dx = beacon.x - p.x;
        if (Math.abs(dx) > 26) c.move = sign(dx);
        if (beacon.y < p.y - 80 && this.grounded && Math.random() < dt * 2) this.jumpBuf = 0.1;
      } else {
        if (ai.t <= 0) {
          if (Math.random() < 0.55) { ai.mode = 'idle'; ai.t = rand(1, 3.5); }
          else { ai.mode = 'walk'; ai.t = rand(0.8, 2.6); ai.dir = Math.random() < 0.5 ? -1 : 1; }
        }
        if (ai.mode === 'walk') c.move = ai.dir;
        if (Math.random() < dt * 0.08 && this.grounded) this.jumpBuf = 0.1;
      }
    }

    if (c.move !== 0 && this.grounded) {
      if (cliffCare && !w.groundAhead(this, c.move)) {
        ai.dir = -c.move;
        c.move = 0;
        if (ai.mode === 'walk') ai.t = Math.min(ai.t, 0.3);
      } else if (Math.abs(this.vel.x) < 0.4) {
        ai.stuck += dt;
        if (ai.stuck > 0.35) { this.jumpBuf = 0.1; ai.stuck = 0; }
      } else ai.stuck = 0;
    }
    if (c.move !== 0) this.aim = { x: p.x + c.move * 160, y: p.y - 10 };

    if (w.rowdy && this.canAct() && Math.random() < dt * 0.3) {
      const target = w.nearestActor(this, 520);
      if (target) {
        this.aim = { x: target.pos.x, y: target.pos.y };
        this.facing = sign(target.pos.x - p.x);
        w.trigger(this, Math.random() < 0.6 ? 0 : 1);
      }
    }
  }

  // ---------------------------------------------------------------- step

  update(dt: number) {
    const w = this.world;
    if (this.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) w.respawnActor(this);
      return;
    }
    const b = this.body;

    this.cd[0] = Math.max(0, this.cd[0] - dt);
    this.cd[1] = Math.max(0, this.cd[1] - dt);
    this.staggerT = Math.max(0, this.staggerT - dt);
    this.dazeT = Math.max(0, this.dazeT - dt);
    this.noGravT = Math.max(0, this.noGravT - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.armT = Math.max(0, this.armT - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.ramT > 0) this.ramT = Math.max(0, this.ramT - dt);
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      if (this.frozenT <= 0) {
        this.frozenT = 0;
        b.friction = this.form === 'puddle' ? 0 : 0.04;
        w.fx.shards(b.position.x, b.position.y, 'rgba(200,240,255,0.9)', 10);
      }
    }
    if (this.burnT > 0) {
      this.burnT -= dt;
      if (Math.random() < 0.7) w.fx.flames(b.position.x, b.position.y - this.dims.h * 0.2, 1, this.dims.w * 0.4);
    }
    if (this.babyT > 0) {
      this.babyT -= dt;
      if (this.babyT <= 0) {
        this.babyT = 0;
        this.rebuild();
        w.fx.puff(this.pos.x, this.pos.y, 'rgba(255,190,230,0.9)', 10);
        return;
      }
    }
    if (this.cometT > 0) {
      this.cometT -= dt;
      w.fx.flames(b.position.x - b.velocity.x * 2, b.position.y - b.velocity.y * 2, 3, 6, -b.velocity.x * 20, -b.velocity.y * 20);
      if (this.cometT <= 0) {
        this.cometT = 0;
        w.blast(b.position.x, b.position.y, 120, 14, { owner: this, exclude: [b], ignite: false, upBias: 0.5 });
        w.fx.ring(b.position.x, b.position.y, 130, 'rgba(255,200,90,0.9)', 6, 0.45);
        w.fx.sparks(b.position.x, b.position.y, '#ffd27a', 18, 320);
        w.fx.addShake(7);
      }
    }

    // Ground and landings.
    const wasGrounded = this.grounded;
    this.grounded = b.velocity.y > -1.2 && w.isGrounded(this);
    if (this.grounded) this.coyote = 0.1;
    if (this.grounded && !wasGrounded && this.prevVy > 6) {
      w.fx.dust(b.position.x, b.bounds.max.y, Math.min(14, Math.round(this.prevVy)), this.dims.w / 30);
      if ((this.form === 'giant' || this.form === 'rock') && this.prevVy > 8) {
        w.blast(b.position.x, b.bounds.max.y, 150, 7, { owner: this, exclude: [b], upBias: 1.2 });
        w.fx.addShake(5);
      }
    }

    // Tumbling: free rotation, then ease back upright.
    if (this.tumbleT > 0) {
      this.tumbleT -= dt;
      if (this.tumbleT <= 0 || (this.grounded && this.tumbleT < 0.75 && b.speed < 3)) {
        this.tumbleT = 0;
        this.uprighting = true;
      }
    }
    if (this.uprighting) {
      const a = Math.atan2(Math.sin(b.angle), Math.cos(b.angle));
      Body.setAngularVelocity(b, 0);
      if (Math.abs(a) < 0.04) {
        Body.setAngle(b, 0);
        Body.setInertia(b, Infinity);
        this.uprighting = false;
      } else Body.setAngle(b, a * 0.78);
    }

    let vx = b.velocity.x;
    let vy = b.velocity.y;
    const fly = this.canFly();
    const ctl = this.canMove();

    if (this.isPossessed()) {
      if (ctl || this.dashT > 0) this.facing = this.aim.x >= b.position.x ? 1 : -1;
    } else if (this.ctrl.move !== 0) this.facing = sign(this.ctrl.move);

    if (ctl) {
      const top = this.moveSpeed();
      const target = this.ctrl.move * top;
      if (this.form === 'rock') {
        const r = this.dims.w / 2;
        const av = this.ctrl.move !== 0 ? (target / r) : b.angularVelocity * 0.97;
        Body.setAngularVelocity(b, b.angularVelocity + (av - b.angularVelocity) * 0.15);
        if (this.ctrl.move !== 0) vx += (target - vx) * (this.grounded ? 0.05 : 0.02);
      } else {
        let k = this.grounded ? 0.3 : fly ? 0.12 : 0.07;
        if (this.slick) k *= 0.06;
        if (this.ctrl.move !== 0 || this.grounded) {
          if (!(this.ctrl.move === 0 && Math.abs(vx) > top * 1.6 && !this.grounded)) vx += (target - vx) * k;
        }
      }
      if (this.jumpBuf > 0 && this.coyote > 0) {
        vy = -this.jumpSpeed();
        this.jumpBuf = 0;
        this.coyote = 0;
        this.grounded = false;
        this.jumpedAt = w.time;
        w.fx.dust(b.position.x, b.bounds.max.y, 4, this.dims.w / 30);
      } else if (fly && this.ctrl.jump && !this.grounded) {
        vy = Math.max(vy - 0.9, -8.5);
        if (Math.random() < 0.5) w.fx.p({ x: b.position.x + rand(-4, 4), y: b.bounds.max.y, vy: 90, vx: rand(-20, 20), max: 0.3, size: 4, grow: 8, color: 'rgba(255,255,255,0.7)', kind: 'smoke' });
      }
      if (this.isPossessed() || this.ctrl.move !== 0) this.walk += Math.abs(vx) * 0.11;
    }
    if (Math.abs(vx - b.velocity.x) > 1e-4 || Math.abs(vy - b.velocity.y) > 1e-4) Body.setVelocity(b, { x: vx, y: vy });

    // Gravity compensation: comets and dashes ignore gravity, fliers glide.
    let comp = 0;
    if (this.noGravT > 0 || this.cometT > 0) comp = 1;
    else if (fly && ctl && !this.grounded) comp = this.ctrl.down ? -0.4 : this.ctrl.jump || b.velocity.y > 0 ? 0.7 : 0;
    if (this.heldBy) comp = 0;
    if (comp !== 0) w.antiGravity(b, comp);

    if (this.ramT > 0) this.doRam();
    if (this.whirlT > 0) this.doWhirl(dt);
    if (this.holding) this.updateHold();

    if (this.ramT > 0 || this.cometT > 0 || b.speed > 16) {
      this.trail.push({ x: b.position.x, y: b.position.y, a: b.angle });
      if (this.trail.length > 8) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();

    this.prevVy = b.velocity.y;
  }

  moveSpeed() {
    let s = this.def.speed;
    if (this.form === 'puddle') s *= 1.35;
    if (this.form === 'guinea') s *= 1.45;
    if (this.form === 'giant') s *= 0.85;
    if (this.form === 'rock') s *= 1.2;
    if (this.babyT > 0) s *= 0.55;
    return s;
  }

  jumpSpeed() {
    let j = 9.6;
    if (this.form === 'puddle') j *= 0.62;
    if (this.form === 'guinea') j *= 1.05;
    if (this.form === 'rock') j *= 0.7;
    if (this.form === 'giant') j *= 1.12;
    if (this.babyT > 0) j *= 0.7;
    return j;
  }

  private doRam() {
    const w = this.world;
    const b = this.body;
    const sp = b.speed;
    if (sp < 2.5) return;
    const box = { min: { x: b.bounds.min.x - 6, y: b.bounds.min.y - 6 }, max: { x: b.bounds.max.x + 6, y: b.bounds.max.y + 6 } };
    const dx = b.velocity.x / sp, dy = b.velocity.y / sp;
    for (const o of w.dynamicBodies()) {
      if (o === b || this.ramHit.has(o.id) || o.collisionFilter.group === this.group) continue;
      if (!Bounds.overlaps(box, o.bounds)) continue;
      const ot = tagOf(o);
      if (ot?.kind === 'actor' && ot.actor.owner && ot.actor.owner === (this.owner ?? this)) continue;
      this.ramHit.add(o.id);
      const n = norm(o.position.x - b.position.x, o.position.y - b.position.y);
      w.kick(o, dx * this.ramPow + n.x * 2, dy * this.ramPow + n.y * 2 - 3);
      w.fx.sparks(o.position.x, o.position.y, '#fff3c4', 8, 220);
      w.fx.addShake(2.5);
    }
  }

  private doWhirl(dt: number) {
    const w = this.world;
    const p = this.pos;
    this.whirlT -= dt;
    const spin = this.facing;
    for (const o of w.dynamicBodies()) {
      if (o === this.body) continue;
      const dx = o.position.x - p.x, dy = o.position.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 200 || d < 1) continue;
      const f = 1 - d / 200;
      const tx = (-dy / d) * spin, ty = (dx / d) * spin;
      let vx = o.velocity.x + (tx * 1.1 - dx / d * 0.25) * f;
      let vy = o.velocity.y + (ty * 1.1 - dy / d * 0.25 - 0.75) * f;
      const s = Math.hypot(vx, vy);
      if (s > 15) { vx *= 15 / s; vy *= 15 / s; }
      Body.setVelocity(o, { x: vx, y: vy });
      const t = tagOf(o);
      if (t?.kind === 'actor') t.actor.staggerT = Math.max(t.actor.staggerT, 0.2);
    }
    const a = w.time * 18;
    for (let i = 0; i < 2; i++) {
      const r = rand(30, 180);
      const ang = a + rand(0, 6.28);
      w.fx.p({ x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r * 0.6, vx: -Math.sin(ang) * 300 * spin, vy: Math.cos(ang) * 180 * spin - 40, max: 0.3, size: 2, color: 'rgba(255,240,220,0.8)', kind: 'spark' });
    }
    if (this.whirlT <= 0) this.whirlT = 0;
  }

  private updateHold() {
    const w = this.world;
    const h = this.holding!;
    const ht = tagOf(h.body);
    if (!w.hasBody(h.body) || (ht?.kind === 'actor' && ht.actor.dead)) {
      this.holding = null;
      Composite.remove(w.engine.world, h.c);
      return;
    }
    const d = this.aimDir();
    const hb = h.body.bounds;
    const reach = this.dims.w * 0.6 + Math.max(hb.max.x - hb.min.x, hb.max.y - hb.min.y) * 0.55 + 8;
    const o = { x: this.pos.x, y: this.pos.y - this.dims.h * 0.15 };
    h.c.pointA = { x: o.x + d.x * reach, y: o.y + d.y * reach };
    w.antiGravity(h.body, 1);
    const v = h.body.velocity;
    const me = this.body.velocity;
    Body.setVelocity(h.body, { x: v.x + (me.x - v.x) * 0.12, y: v.y + (me.y - v.y) * 0.12 });
    Body.setAngularVelocity(h.body, h.body.angularVelocity * 0.85);
  }
}

export function clampAimWithin(a: Actor, aim: Vec, maxDist: number): Vec {
  const dx = aim.x - a.pos.x, dy = aim.y - a.pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxDist) return aim;
  return { x: a.pos.x + (dx / d) * maxDist, y: a.pos.y + (dy / d) * maxDist };
}

