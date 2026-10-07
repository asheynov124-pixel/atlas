import Matter from 'matter-js';
import { clampAimWithin, type Actor } from './actor';
import type { World } from './world';
import { bodyRadius } from './world';
import { clamp, norm, rand, sign, tagOf, type CharacterDef, type PowerId, type Vec } from './types';

const { Body, Constraint } = Matter;

/**
 * Power registry. Each power is a function of (caster, aim, world) plus a
 * cooldown and a cap (max live objects it may own; 0 = not applicable).
 *
 * Slot binding: J = first active power, K = second active power; a character
 * with a single active power gets that power's `alt` on K. Passive powers
 * (invuln) have no slot; flight is active (a dash) and also unlocks hold-Space flying.
 */
export type PowerFn = (caster: Actor, aim: Vec, world: World) => boolean | void;

export interface PowerAction {
  name: string;
  cooldown: number;
  use: PowerFn;
}

export interface PowerDef extends PowerAction {
  id: PowerId;
  cap: number;
  passive?: boolean;
  alt?: PowerAction;
  /** One-line trait shown in the HUD. */
  trait?: string;
}

export interface Slot extends PowerAction {
  power: PowerId;
}

// ------------------------------------------------------------------ helpers

function shoot(c: Actor, aim: Vec) {
  return { from: c.hand(), d: c.aimDir(aim) };
}

function recoil(c: Actor, d: Vec, amount: number) {
  Body.setVelocity(c.body, { x: c.vel.x - d.x * amount, y: c.vel.y - d.y * amount });
}

function beamTo(w: World, from: Vec, to: Vec, color: string, width = 4, life = 0.18) {
  w.fx.beam([from, to], color, width, life);
}

/** Who/what is the vine, ray or arm aimed at? */
function aimedBody(c: Actor, aim: Vec, w: World, range: number) {
  const { from, d } = shoot(c, aim);
  return { from, d, hit: w.raycast(from, d, range, { ignore: [c.body] }) };
}

// ------------------------------------------------------------------ strength

const haymaker: PowerFn = (c, aim, w) => {
  const { from, d } = shoot(c, aim);
  w.cone(from, d, 120, 0.65, 22, { owner: c, exclude: [c.body], upBias: 0.35 });
  w.fx.ring(from.x, from.y, 90, 'rgba(255,255,255,0.85)', 5, 0.22, Math.atan2(d.y, d.x) - 0.7, Math.atan2(d.y, d.x) + 0.7);
  w.fx.addShake(4);
  recoil(c, d, 1.5);
};

const grabOrThrow: PowerFn = (c, aim, w) => {
  if (c.holding) {
    const held = c.holding.body;
    const d = c.aimDir(aim);
    const speed = clamp(30 / Math.pow(Math.max(held.mass, 0.2), 0.16), 15, 31);
    c.release({ x: d.x * speed + c.vel.x * 0.4, y: d.y * speed + c.vel.y * 0.4 - 1 }, rand(-0.25, 0.25));
    recoil(c, d, Math.min(4, held.mass * 0.5));
    w.fx.ring(held.position.x, held.position.y, 36, 'rgba(255,255,255,0.8)', 3, 0.2);
    w.fx.addShake(Math.min(6, 1 + held.mass * 0.4));
    return;
  }
  const d = c.aimDir(aim);
  const reach = c.dims.h * 0.75 + 34;
  const probe = { x: c.pos.x + d.x * reach * 0.55, y: c.pos.y - c.dims.h * 0.1 + d.y * reach * 0.55 };
  let best: Matter.Body | null = null;
  let bd = Infinity;
  for (const b of w.dynamicBodies()) {
    if (b === c.body) continue;
    const dd = Math.hypot(b.position.x - probe.x, b.position.y - probe.y) - bodyRadius(b) * 0.7;
    if (dd < reach * 0.75 && dd < bd) { bd = dd; best = b; }
  }
  if (!best) return haymaker(c, aim, w);
  c.grab(best);
  w.fx.ring(best.position.x, best.position.y, 30, 'rgba(122,247,255,0.9)', 3, 0.25);
};

// ------------------------------------------------------------------ flight

const skyDash: PowerFn = (c, aim, w) => {
  const d = c.aimDir(aim);
  c.dash(d, 21, 0.32, 12, 0.32);
  w.fx.ring(c.pos.x, c.pos.y, 40, 'rgba(255,255,255,0.8)', 3, 0.25);
};

const jetBurst: PowerFn = (c, _aim, w) => {
  Body.setVelocity(c.body, { x: c.vel.x * 0.6, y: -15 });
  c.noGravT = 0.25;
  w.cone({ x: c.pos.x, y: c.pos.y + c.dims.h * 0.3 }, { x: 0, y: 1 }, 190, 0.75, 14, { owner: c, exclude: [c.body], upBias: -0.2 });
  w.fx.ring(c.pos.x, c.body.bounds.max.y, 110, 'rgba(255,255,255,0.85)', 5, 0.3, 0.2, Math.PI - 0.2);
  w.fx.puff(c.pos.x, c.body.bounds.max.y, 'rgba(255,255,255,0.9)', 10, 160);
};

// ------------------------------------------------------------------ plants

const vineLash: PowerFn = (c, aim, w) => {
  const { from, d, hit } = aimedBody(c, aim, w, 540);
  if (!hit) {
    beamTo(w, from, { x: from.x + d.x * 540, y: from.y + d.y * 540 }, '#3fae5a', 3, 0.15);
    return;
  }
  const dist = Math.hypot(hit.point.x - c.pos.x, hit.point.y - c.pos.y);
  if (hit.body.isStatic) {
    // Grapple: anchor to the world and reel in, so Layla swings.
    const con = Constraint.create({ bodyA: c.body, pointA: { x: 0, y: 0 }, pointB: { ...hit.point }, length: dist, stiffness: 0.05, damping: 0.05 });
    w.addVine(c, con, 3.2, Math.max(60, dist * 0.5), 'lash', POWERS.plants.cap);
    Body.setVelocity(c.body, { x: c.vel.x + d.x * 2, y: c.vel.y - 3 });
  } else {
    // Lasso: tie the target to Layla and yank it in.
    const con = Constraint.create({ bodyA: c.body, pointA: { x: 0, y: 0 }, bodyB: hit.body, pointB: { x: 0, y: 0 }, length: dist, stiffness: 0.045, damping: 0.05 });
    w.addVine(c, con, 3, 45, 'lash', POWERS.plants.cap);
    const t = tagOf(hit.body);
    if (t?.kind === 'actor') t.actor.staggerT = Math.max(t.actor.staggerT, 0.6);
  }
  w.fx.leaves(hit.point.x, hit.point.y, 6);
};

const rootSnare: PowerFn = (c, aim, w) => {
  const at = clampAimWithin(c, aim, 380);
  let target: Matter.Body | null = null;
  let bd = 150;
  for (const b of w.dynamicBodies()) {
    if (b === c.body) continue;
    const d = Math.hypot(b.position.x - at.x, b.position.y - at.y);
    if (d < bd) { bd = d; target = b; }
  }
  if (!target) {
    w.fx.leaves(at.x, at.y, 6);
    w.fx.text(at.x, at.y - 20, 'nothing to root', '#bfe8c4');
    return false;
  }
  const ground = w.groundBelow(target.position.x, target.position.y, 700);
  if (!ground) return false;
  const con = Constraint.create({ pointA: { ...ground }, bodyB: target, pointB: { x: 0, y: 0 }, length: Math.hypot(target.position.x - ground.x, target.position.y - ground.y), stiffness: 0.03, damping: 0.08 });
  w.addVine(c, con, 5.5, 14, 'root', POWERS.plants.cap);
  w.fx.leaves(ground.x, ground.y, 10);
  const t = tagOf(target);
  if (t?.kind === 'actor') t.actor.staggerT = Math.max(t.actor.staggerT, 1);
};

// ------------------------------------------------------------------ fire

const fireball: PowerFn = (c, aim, w) => {
  const { from, d } = shoot(c, aim);
  const mine = w.projectiles.filter((p) => p.owner === c && p.kind === 'fireball');
  if (mine.length >= POWERS.fire.cap) return false;
  w.spawnProjectile(c, 'fireball', from.x + d.x * 12, from.y + d.y * 12, d.x * 17 + c.vel.x * 0.3, d.y * 17 + c.vel.y * 0.3, 7, 0.88, 2.2);
  w.fx.flames(from.x, from.y, 5, 4, d.x * 120, d.y * 120);
  recoil(c, d, 0.6);
};

const flameJet: PowerFn = (c, aim, w) => {
  const { from, d } = shoot(c, aim);
  w.cone(from, d, 240, 0.42, 10, { owner: c, exclude: [c.body], ignite: true, upBias: 0.15 });
  for (let i = 0; i < 36; i++) {
    const a = Math.atan2(d.y, d.x) + rand(-0.4, 0.4);
    const s = rand(380, 700);
    w.fx.p({ x: from.x, y: from.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rand(0.25, 0.45), size: rand(6, 12), grow: 10, color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f', drag: 3, g: -100, kind: 'flame' });
  }
  recoil(c, d, 2);
  w.fx.addShake(3);
};

// ------------------------------------------------------------------ forms

function toggleForm(form: 'puddle' | 'guinea' | 'rock' | 'giant', color: string): PowerFn {
  return (c, _aim, w) => {
    const now = c.setForm(form);
    w.fx.puff(c.pos.x, c.pos.y, color, 14, 120);
    w.fx.text(c.pos.x, c.pos.y - c.dims.h / 2 - 16, now === 'normal' ? 'back to normal' : now, '#fff');
    if (now === 'giant' || form === 'rock') w.fx.addShake(form === 'rock' ? 4 : 6);
  };
}

const slickSpill: PowerFn = (c, aim, w) => {
  const at = clampAimWithin(c, aim, 340);
  const g = w.groundBelow(at.x, at.y - 40, 600);
  if (!g) return false;
  const mine = w.slicks.filter((s) => s.owner === c);
  if (mine.length >= POWERS.melt.cap) w.slicks.splice(w.slicks.indexOf(mine[0]), 1);
  w.slicks.push({ owner: c, x: g.x, y: g.y, w: 170, life: 7, max: 7 });
  w.fx.bubbles(g.x, g.y - 4, 'rgba(160,130,255,0.9)', 14);
};

const scurry: PowerFn = (c, aim, w) => {
  const dir = sign(aim.x - c.pos.x);
  c.dash({ x: dir * 0.97, y: -0.25 }, c.form === 'guinea' ? 17 : 12, 0.35, c.form === 'guinea' ? 7 : 5, 0.12);
  w.fx.dust(c.pos.x, c.body.bounds.max.y, 6);
};

const boulderCharge: PowerFn = (c, aim, w) => {
  if (c.form !== 'rock') toggleForm('rock', 'rgba(170,160,140,0.9)')(c, aim, w);
  const dir = sign(aim.x - c.pos.x);
  Body.setVelocity(c.body, { x: dir * 17, y: c.vel.y - 2 });
  Body.setAngularVelocity(c.body, dir * 0.45);
  c.ramT = 0.9;
  c.ramPow = 15;
  c.ramHit.clear();
  w.fx.dust(c.pos.x, c.body.bounds.max.y, 10, 2);
};

const stomp: PowerFn = (c, aim, w) => {
  if (c.form !== 'giant') toggleForm('giant', 'rgba(255,220,160,0.9)')(c, aim, w);
  const foot = { x: c.pos.x, y: c.body.bounds.max.y };
  w.blast(foot.x, foot.y, 240, 17, { owner: c, exclude: [c.body], upBias: 1.6 });
  w.fx.ring(foot.x, foot.y, 230, 'rgba(255,230,180,0.85)', 7, 0.4, Math.PI, Math.PI * 2);
  w.fx.dust(foot.x, foot.y, 20, 4);
  w.fx.addShake(10);
};

// ------------------------------------------------------------------ glow

const flash: PowerFn = (c, _aim, w) => {
  const p = c.pos;
  w.blast(p.x, p.y, 250, 6, { owner: c, exclude: [c.body], stun: 1.8, upBias: 0.2 });
  w.revealT = 4;
  w.fx.ring(p.x, p.y, 260, 'rgba(255,250,190,0.95)', 10, 0.45);
  w.fx.stars(p.x, p.y, '#fff6b0', 14);
  w.fx.flashScreen(0.55, '255,250,210');
};

const beacon: PowerFn = (c, aim, w) => {
  const at = clampAimWithin(c, aim, 320);
  const mine = w.beacons.filter((b) => b.owner === c);
  if (mine.length >= POWERS.glow.cap) w.beacons.splice(w.beacons.indexOf(mine[0]), 1);
  w.beacons.push({ owner: c, x: at.x, y: at.y, life: 8, max: 8 });
  w.fx.ring(at.x, at.y, 60, 'rgba(255,246,160,0.9)', 4, 0.4);
};

// ------------------------------------------------------------------ tech / pacifier

const hijack: PowerFn = (c, aim, w) => {
  const m = w.findMachine(c, 560, aim);
  if (!m) {
    w.fx.text(c.pos.x, c.pos.y - 50, 'no machine in range', '#b9ffd9');
    return false;
  }
  const to = { x: m.x, y: m.y - m.h * 0.6 };
  w.fx.beam(w.fx.zigzag(c.hand(), to, 10, 9), '#8affc1', 2.5, 0.3, 'rgba(138,255,193,0.5)');
  w.activateMachine(m, c, aim);
};

const pacifierRay: PowerFn = (c, aim, w) => {
  const { from, d, hit } = aimedBody(c, aim, w, 540);
  const end = hit ? hit.point : { x: from.x + d.x * 540, y: from.y + d.y * 540 };
  beamTo(w, from, end, '#ff7fd0', 5, 0.22);
  w.fx.stars(end.x, end.y, '#ffc0e8', 5);
  if (!hit) return;
  const t = tagOf(hit.body);
  if (t?.kind === 'actor') {
    if (t.actor.babify(8)) w.fx.text(end.x, end.y - 30, 'babified!', '#ffc0e8');
    else w.fx.text(end.x, end.y - 30, 'immune', '#ddd');
  } else if (t?.kind === 'prop' && t.prop.scale > 0.35) {
    Body.scale(hit.body, 0.72, 0.72);
    t.prop.scale *= 0.72;
    w.fx.text(end.x, end.y - 20, 'shrunk', '#ffc0e8');
  }
};

// ------------------------------------------------------------------ clone

const split: PowerFn = (c, _aim, w) => {
  const root = c.owner ?? c;
  const clones = w.actors.filter((a) => a.owner === root);
  if (clones.length >= POWERS.clone.cap) w.removeActor(clones[0]);
  const n = w.spawnActor(c.def, c.pos.x + c.facing * 26, c.pos.y - 8, { owner: root, quiet: true });
  if (!n) return false;
  Body.setVelocity(n.body, { x: c.facing * 5, y: -6 });
  w.fx.puff(n.pos.x, n.pos.y, 'rgba(255,170,210,0.9)', 10, 90);
};

const swarm: PowerFn = (c, aim, w) => {
  const root = c.owner ?? c;
  let crew = w.actors.filter((a) => a.owner === root && a !== c && !a.dead);
  if (!crew.length) {
    split(c, aim, w);
    crew = w.actors.filter((a) => a.owner === root && a !== c);
  }
  for (const a of crew) {
    a.rush = { x: aim.x, y: aim.y, t: 2.4 };
    a.ramT = 2.4;
    a.ramPow = 7;
    a.ramHit.clear();
  }
  w.fx.ring(aim.x, aim.y, 40, 'rgba(255,150,200,0.9)', 3, 0.4);
};

// ------------------------------------------------------------------ stretch

const stretchPunch: PowerFn = (c, aim, w) => {
  const { from, d, hit } = aimedBody(c, aim, w, 340);
  const end = hit ? hit.point : { x: from.x + d.x * 340, y: from.y + d.y * 340 };
  c.arm = end;
  c.armT = 0.25;
  if (!hit) return;
  if (hit.body.isStatic) {
    c.dash(norm(end.x - c.pos.x, end.y - c.pos.y), 19, 0.28, 8, 0.28);
    w.fx.text(end.x, end.y - 16, 'zip!', '#bff');
  } else {
    w.kick(hit.body, d.x * 19, d.y * 19 - 3);
    w.fx.sparks(end.x, end.y, '#fff', 10, 260);
    w.fx.ring(end.x, end.y, 34, 'rgba(255,255,255,0.9)', 4, 0.2);
    w.fx.addShake(4);
  }
};

const yank: PowerFn = (c, aim, w) => {
  const { from, d, hit } = aimedBody(c, aim, w, 380);
  const end = hit ? hit.point : { x: from.x + d.x * 380, y: from.y + d.y * 380 };
  c.arm = end;
  c.armT = 0.3;
  if (!hit || hit.body.isStatic) return;
  const back = norm(c.pos.x - hit.body.position.x, c.pos.y - hit.body.position.y);
  const t = tagOf(hit.body);
  if (t?.kind === 'actor') t.actor.onKnock(10);
  Body.setVelocity(hit.body, { x: back.x * 17, y: back.y * 17 - 5 });
  w.fx.text(end.x, end.y - 16, 'yoink', '#bff');
};

// ------------------------------------------------------------------ speed

const blurDash: PowerFn = (c, aim, w) => {
  const d0 = c.aimDir(aim);
  const d = norm(d0.x, clamp(d0.y, -0.35, 0.35));
  c.dash(d, 34, 0.3, 13, 0.3);
  w.fx.addShake(2);
};

const whirlwind: PowerFn = (c, _aim, w) => {
  c.whirlT = 1.4;
  w.fx.ring(c.pos.x, c.pos.y, 190, 'rgba(255,240,220,0.7)', 3, 0.5);
};

// ------------------------------------------------------------------ ice

const freezeRay: PowerFn = (c, aim, w) => {
  const { from, d, hit } = aimedBody(c, aim, w, 500);
  const end = hit ? hit.point : { x: from.x + d.x * 500, y: from.y + d.y * 500 };
  beamTo(w, from, end, '#bff0ff', 5, 0.25);
  w.fx.shards(end.x, end.y, 'rgba(200,240,255,0.95)', 8, 160);
  if (!hit) return;
  const t = tagOf(hit.body);
  if (t?.kind === 'actor') {
    if (t.actor.freeze(4)) {
      w.kick(hit.body, d.x * 3, d.y * 3);
      w.fx.text(end.x, end.y - 30, 'frozen', '#bff0ff');
    }
  } else if (t?.kind === 'prop') {
    t.prop.frozenT = 7;
    t.prop.burnT = 0;
    w.kick(hit.body, d.x * 4, d.y * 4);
  }
};

const iceWall: PowerFn = (c, aim, w) => {
  const at = clampAimWithin(c, aim, 300);
  const g = w.groundBelow(at.x, at.y, 160);
  const h = 120, wd = 34;
  if (g) w.addIce(c, g.x, g.y - h / 2 + 2, wd, h, 9, POWERS.ice.cap);
  else w.addIce(c, at.x, at.y, 120, 22, 9, POWERS.ice.cap); // floating ice ledge
  w.fx.shards(at.x, at.y, 'rgba(200,240,255,0.95)', 10, 140);
};

// ------------------------------------------------------------------ comet

const cometForm: PowerFn = (c, aim, w) => {
  const d = c.aimDir(aim);
  c.cometT = 1.0;
  c.dash(d, 24, 1.0, 17, 1.0);
  w.fx.ring(c.pos.x, c.pos.y, 50, 'rgba(255,200,90,0.9)', 4, 0.3);
};

const cometRing: PowerFn = (c, _aim, w) => {
  const mine = w.projectiles.filter((p) => p.owner === c && p.kind === 'spark').length;
  const n = Math.min(8, POWERS.comet.cap - mine);
  if (n <= 0) return false;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
    w.spawnProjectile(c, 'spark', c.pos.x + Math.cos(a) * 24, c.pos.y + Math.sin(a) * 24, Math.cos(a) * 15, Math.sin(a) * 15, 5, 1, 0.8);
  }
  w.fx.ring(c.pos.x, c.pos.y, 70, 'rgba(255,220,120,0.9)', 4, 0.3);
};

// ------------------------------------------------------------------ sonic

const sonicBoom: PowerFn = (c, aim, w) => {
  const { from, d } = shoot(c, aim);
  w.cone(from, d, 380, 0.5, 23, { owner: c, exclude: [c.body], stun: 1, shatter: true, upBias: 0.25 });
  const a = Math.atan2(d.y, d.x);
  for (let i = 0; i < 4; i++) {
    w.later(i * 0.05, () => w.fx.ring(from.x, from.y, 120 + i * 80, 'rgba(255,255,255,0.75)', 6 - i, 0.35, a - 0.5, a + 0.5, 20 + i * 40));
  }
  recoil(c, d, 2.5);
  w.fx.addShake(9);
};

const whistle: PowerFn = (c, _aim, w) => {
  const p = c.pos;
  w.blast(p.x, p.y, 160, 13, { owner: c, exclude: [c.body], stun: 1.5, shatter: true, upBias: 0.5 });
  w.fx.ring(p.x, p.y, 170, 'rgba(255,255,255,0.85)', 6, 0.35);
  w.fx.ring(p.x, p.y, 110, 'rgba(255,255,255,0.6)', 3, 0.25);
  w.fx.addShake(5);
};

// ------------------------------------------------------------------ xray

const xrayScan: PowerFn = (c, _aim, w) => {
  w.xrayT = 6;
  w.revealT = Math.max(w.revealT, 6);
  w.fx.ring(c.pos.x, c.pos.y, 400, 'rgba(120,200,255,0.8)', 3, 0.6);
};

const triage: PowerFn = (c, _aim, w) => {
  const p = c.pos;
  for (const a of w.actors) {
    if (a.dead || Math.hypot(a.pos.x - p.x, a.pos.y - p.y) > 170) continue;
    a.cleanse();
    if (a !== c) {
      Body.setVelocity(a.body, { x: a.vel.x * 0.3, y: -7 });
      a.noGravT = 0.4;
    }
    w.fx.text(a.pos.x, a.pos.y - a.dims.h / 2 - 14, '+', '#9effa8');
  }
  w.blast(p.x, p.y, 170, 4, { owner: c, exclude: [c.body], upBias: 1.5 });
  w.fx.ring(p.x, p.y, 170, 'rgba(160,255,180,0.85)', 4, 0.4);
  w.fx.bubbles(p.x, p.y, 'rgba(160,255,180,0.9)', 12);
};

// ------------------------------------------------------------------ registry

export const POWERS: Record<PowerId, PowerDef> = {
  strength: { id: 'strength', name: 'Grab / Throw', cooldown: 0.25, cap: 0, use: grabOrThrow, alt: { name: 'Haymaker', cooldown: 0.6, use: haymaker }, trait: 'Super strength' },
  flight: { id: 'flight', name: 'Sky Dash', cooldown: 0.7, cap: 0, use: skyDash, alt: { name: 'Jet Burst', cooldown: 1.1, use: jetBurst }, trait: 'Flight: hold Space' },
  invuln: { id: 'invuln', name: 'Invulnerable', cooldown: 0, cap: 0, passive: true, use: () => false, trait: 'Invulnerable: shrugs off ice, fire, rays' },
  plants: { id: 'plants', name: 'Vine Lash', cooldown: 0.45, cap: 4, use: vineLash, alt: { name: 'Root Snare', cooldown: 1.2, use: rootSnare } },
  fire: { id: 'fire', name: 'Fireball', cooldown: 0.32, cap: 5, use: fireball, alt: { name: 'Flame Jet', cooldown: 1.1, use: flameJet }, trait: 'Fireproof' },
  melt: { id: 'melt', name: 'Melt', cooldown: 0.5, cap: 2, use: toggleForm('puddle', 'rgba(160,130,255,0.9)'), alt: { name: 'Slick Spill', cooldown: 1.5, use: slickSpill } },
  guinea: { id: 'guinea', name: 'Guinea Form', cooldown: 0.5, cap: 0, use: toggleForm('guinea', 'rgba(255,190,230,0.9)'), alt: { name: 'Scurry', cooldown: 0.6, use: scurry } },
  glow: { id: 'glow', name: 'Flash', cooldown: 2.2, cap: 2, use: flash, alt: { name: 'Beacon', cooldown: 1.5, use: beacon } },
  tech: { id: 'tech', name: 'Hijack Machine', cooldown: 1.1, cap: 0, use: hijack },
  pacifier: { id: 'pacifier', name: 'Pacifier Ray', cooldown: 1.6, cap: 0, use: pacifierRay },
  clone: { id: 'clone', name: 'Split', cooldown: 0.7, cap: 5, use: split, alt: { name: 'Swarm', cooldown: 1.5, use: swarm } },
  stretch: { id: 'stretch', name: 'Stretch Punch', cooldown: 0.45, cap: 0, use: stretchPunch, alt: { name: 'Yank', cooldown: 0.9, use: yank } },
  speed: { id: 'speed', name: 'Blur Dash', cooldown: 0.6, cap: 0, use: blurDash, alt: { name: 'Whirlwind', cooldown: 2.2, use: whirlwind }, trait: 'Super speed' },
  rock: { id: 'rock', name: 'Rock Form', cooldown: 0.6, cap: 0, use: toggleForm('rock', 'rgba(170,160,140,0.9)'), alt: { name: 'Boulder Charge', cooldown: 1.2, use: boulderCharge } },
  ice: { id: 'ice', name: 'Freeze Ray', cooldown: 0.8, cap: 3, use: freezeRay, alt: { name: 'Ice Wall', cooldown: 0.9, use: iceWall } },
  comet: { id: 'comet', name: 'Comet', cooldown: 1.4, cap: 8, use: cometForm, alt: { name: 'Comet Ring', cooldown: 1.2, use: cometRing } },
  sonic: { id: 'sonic', name: 'Sonic Boom', cooldown: 1.6, cap: 0, use: sonicBoom, alt: { name: 'Whistle', cooldown: 1, use: whistle } },
  grow: { id: 'grow', name: 'Grow', cooldown: 0.6, cap: 0, use: toggleForm('giant', 'rgba(255,220,160,0.9)'), alt: { name: 'Stomp', cooldown: 1.4, use: stomp } },
  xray: { id: 'xray', name: 'X-Ray Scan', cooldown: 3, cap: 0, use: xrayScan, alt: { name: 'Triage Pulse', cooldown: 2, use: triage }, trait: 'Sees hidden things' },
};

const slotCache = new Map<string, Slot[]>();

export function slotsFor(def: CharacterDef): Slot[] {
  const hit = slotCache.get(def.id);
  if (hit) return hit;
  const actives = def.powers.map((id) => POWERS[id]).filter((p) => !p.passive);
  const slots: Slot[] = actives.slice(0, 2).map((p) => ({ power: p.id, name: p.name, cooldown: p.cooldown, use: p.use }));
  if (slots.length === 1 && actives[0].alt) slots.push({ power: actives[0].id, ...actives[0].alt });
  slotCache.set(def.id, slots);
  return slots;
}

export function traitsFor(def: CharacterDef): string[] {
  return def.powers.map((id) => POWERS[id].trait).filter((t): t is string => !!t);
}
