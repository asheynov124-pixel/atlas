/**
 * OWNER: life.
 * SkyTraffic — the third dimension of the city:
 *   • flying cars stream along aerial lanes (three altitude bands), weaving past the flanks of tall towers on smooth
 *     Catmull-Rom curves and banking into turns; tail lights and headlights at night
 *   • delivery drones hop from shops, factories and drone pads to rooftops: vertical take-off, cruise, gentle
 *     landing, a moment on the roof, then off again — blinking green/red LEDs
 *   • air taxis shuttle between drone ports and skyscraper roofs with white anti-collision strobes
 * Counts scale with population and the quality tier; nothing flies until the city has people.
 */
import { Vector3 } from 'three';
import { game } from '../../game/instance';
import { clamp, frameFwd, frameUp, newFrame, roll, smoothstep } from './common';
import type { LifeCtx } from './ctx';
import type { Site, Sites } from './sites';

const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _d = new Vector3();
const _up = new Vector3();
const _t = new Vector3();
const _fr = newFrame();

const CAR_PAINT: [number, number, number][] = [
  [0.9, 0.92, 0.95], [0.85, 0.08, 0.08], [0.02, 0.35, 0.85], [0.95, 0.55, 0.02], [0.08, 0.7, 0.62], [0.05, 0.05, 0.06], [0.55, 0.2, 0.85], [0.95, 0.75, 0.05],
];

/** Flying car on a lane of waypoints (Catmull-Rom through w0..w3, currently between w1 and w2). */
class Flyer {
  active = false;
  id = 0;
  w = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  /** altitudes (above R) of the waypoints */
  h = [0, 0, 0, 0];
  t = 0;
  segLen = 1;
  speed = 1.2;
  band = 0;
  color = 0;
  bank = 0;
  born = -10;
  dying = -1;
  pos = new Vector3();
  dir = new Vector3(0, 0, 1);
  prevDir = new Vector3(0, 0, 1);
  last: number[] = [-1, -1];
}

/** Hopper: take-off → cruise → landing → rest (drones, air taxis). */
class Hopper {
  active = false;
  id = 0;
  kind: 'drone' | 'airTaxi' = 'drone';
  from = new Vector3();
  to = new Vector3();
  /** heights above R at the end points (ground + roof) */
  hFrom = 0;
  hTo = 0;
  cruise = 1.5;
  phase = 0;
  t = 0;
  dur = 1;
  speed = 0.8;
  heading = new Vector3(0, 0, 1);
  pos = new Vector3();
  rest = 0;
  site = -1;
  born = -10;
}

export class SkyTraffic {
  private flyers: Flyer[] = [];
  private hoppers: Hopper[] = [];
  private anchors: Site[] = [];
  private homes: Site[] = [];
  private sources: Site[] = [];
  private pads: Site[] = [];
  private roofs: Site[] = [];
  private version = -1;
  private nextId = 1;
  flyerCount = 0;
  hopperCount = 0;
  visible = 0;

  constructor(private sites: Sites) {
    for (let i = 0; i < 48; i++) this.flyers.push(new Flyer());
    for (let i = 0; i < 64; i++) this.hoppers.push(new Hopper());
  }

  private index(): void {
    const s = this.sites;
    this.version = s.version;
    this.anchors = s.towers.slice(0, 60);
    if (this.anchors.length < 4) this.anchors = s.all.filter((x) => x.top >= 1.4).slice(0, 60);
    this.homes = s.all.filter((x) => x.family === 'R');
    this.sources = s.all.filter((x) => x.family === 'C' || x.family === 'I' || x.tags.includes('drone') || x.tags.includes('drones') || x.tags.includes('cargo'));
    this.pads = s.all.filter((x) => x.tags.includes('heliport') || x.tags.includes('drone'));
    this.roofs = s.all.filter((x) => x.top >= 2.5 && x.top < 20);
  }

  // ───────────────────────────────────────────── flying cars

  /** Pick a waypoint beside an anchor tower (or over the city) at band altitude; returns false if none. */
  private waypoint(ctx: LifeCtx, f: Flyer, from: Vector3 | null, out: Vector3, slot: number): boolean {
    const n = this.anchors.length;
    if (!n) return false;
    const R = ctx.planet.radius;
    const alt = 1.8 + f.band * 0.85;
    for (let tries = 0; tries < 8; tries++) {
      const i = Math.floor(ctx.rng.next() * n);
      if (f.last[0] === i || f.last[1] === i) continue;
      const s = this.anchors[i];
      // pass beside the tower: offset sideways by its radius
      const ang = ctx.rng.next() * Math.PI * 2;
      _t.copy(s.right).multiplyScalar(Math.cos(ang)).addScaledVector(s.fwd, Math.sin(ang));
      out.copy(s.pos).addScaledVector(_t, s.radius * 0.9 + 0.45);
      if (from) {
        const d = out.distanceTo(from);
        if (d < 2.5 || d > 16) continue;
      }
      const base = out.length();
      out.multiplyScalar((R + Math.max(alt, base - R + 0.9)) / base);
      f.h[slot] = out.length() - R;
      f.last[1] = f.last[0];
      f.last[0] = i;
      return true;
    }
    return false;
  }

  private spawnFlyer(ctx: LifeCtx): void {
    const f = this.flyers.find((x) => !x.active);
    if (!f || this.anchors.length < 2) return;
    f.id = this.nextId++;
    f.band = Math.floor(ctx.rng.next() * 3);
    f.color = Math.floor(ctx.rng.next() * CAR_PAINT.length);
    f.speed = 1.05 + ctx.rng.next() * 0.5;
    f.last[0] = f.last[1] = -1;
    if (!this.waypoint(ctx, f, null, f.w[0], 0)) return;
    for (let k = 1; k < 4; k++) if (!this.waypoint(ctx, f, f.w[k - 1], f.w[k], k)) return;
    f.t = ctx.rng.next();
    f.segLen = Math.max(0.5, f.w[1].distanceTo(f.w[2]));
    f.born = ctx.time;
    f.dying = -1;
    f.active = true;
    f.bank = 0;
    catmull(f, f.t, f.pos, f.dir);
    f.prevDir.copy(f.dir);
    this.flyerCount++;
  }

  private stepFlyer(ctx: LifeCtx, f: Flyer, dt: number): void {
    f.t += (f.speed * dt) / f.segLen;
    while (f.t >= 1) {
      f.t -= 1;
      const w = f.w;
      const tmp = w[0];
      w[0] = w[1];
      w[1] = w[2];
      w[2] = w[3];
      w[3] = tmp;
      f.h[0] = f.h[1];
      f.h[1] = f.h[2];
      f.h[2] = f.h[3];
      if (!this.waypoint(ctx, f, w[2], w[3], 3)) w[3].copy(w[2]).multiplyScalar(1.0001);
      f.segLen = Math.max(0.5, w[1].distanceTo(w[2]));
    }
    f.prevDir.copy(f.dir);
    catmull(f, f.t, f.pos, f.dir);
    // bank from the turn rate around the local up
    _up.copy(f.pos).normalize();
    _t.crossVectors(f.prevDir, f.dir);
    const yawRate = dt > 0 ? _t.dot(_up) / dt : 0;
    f.bank += (clamp(-yawRate * 0.9, -0.6, 0.6) - f.bank) * Math.min(1, dt * 4);
  }

  // ───────────────────────────────────────────── drones & air taxis

  private launchHopper(ctx: LifeCtx, h: Hopper, kind: 'drone' | 'airTaxi', fromSite: Site | null): boolean {
    const R = ctx.planet.radius;
    const pool = kind === 'drone' ? this.homes : this.roofs.length ? this.roofs : this.homes;
    const src = fromSite ?? (kind === 'drone' ? pick(ctx, this.sources) : pick(ctx, this.pads.length ? this.pads : this.roofs));
    if (!src || !pool.length) return false;
    let dst: Site | null = null;
    for (let tries = 0; tries < 8; tries++) {
      const c = pool[Math.floor(ctx.rng.next() * pool.length)];
      const d = c.pos.distanceTo(src.pos);
      if (c !== src && d > 2 && d < (kind === 'drone' ? 14 : 24)) {
        dst = c;
        break;
      }
    }
    if (!dst) return false;
    h.kind = kind;
    h.id = this.nextId++;
    roofPoint(src, ctx, h.from);
    roofPoint(dst, ctx, h.to);
    h.hFrom = h.from.length() - R;
    h.hTo = h.to.length() - R;
    h.cruise = Math.max(h.hFrom, h.hTo) + (kind === 'drone' ? 0.6 + ctx.rng.next() * 0.5 : 1.0 + ctx.rng.next() * 0.8);
    h.speed = kind === 'drone' ? 0.75 + ctx.rng.next() * 0.25 : 1.2 + ctx.rng.next() * 0.3;
    h.phase = 0;
    h.t = 0;
    h.dur = (h.cruise - h.hFrom) / (kind === 'drone' ? 0.45 : 0.5);
    h.site = dst.id;
    h.heading.copy(h.to).sub(h.from);
    h.active = true;
    h.born = ctx.time;
    return true;
  }

  private stepHopper(ctx: LifeCtx, h: Hopper, dt: number): void {
    const R = ctx.planet.radius;
    h.t += dt;
    const ua = _a.copy(h.from).normalize();
    const ub = _b.copy(h.to).normalize();
    if (h.phase === 0) {
      // vertical climb with ease
      const k = smoothstep(0, 1, h.t / h.dur);
      h.pos.copy(ua).multiplyScalar(R + h.hFrom + (h.cruise - h.hFrom) * k);
      if (h.t >= h.dur) {
        h.phase = 1;
        h.t = 0;
        const ang = Math.acos(clamp(ua.dot(ub), -1, 1));
        h.dur = Math.max(0.5, (ang * (R + h.cruise)) / h.speed);
      }
    } else if (h.phase === 1) {
      const k = smoothstep(0, 1, h.t / h.dur) * 0.15 + (h.t / h.dur) * 0.85;
      slerp(ua, ub, Math.min(1, k), _p);
      h.pos.copy(_p).multiplyScalar(R + h.cruise);
      _d.copy(ub).sub(ua);
      h.heading.copy(_d);
      if (h.t >= h.dur) {
        h.phase = 2;
        h.t = 0;
        h.dur = (h.cruise - h.hTo) / (h.kind === 'drone' ? 0.4 : 0.45);
      }
    } else if (h.phase === 2) {
      const k = smoothstep(0, 1, h.t / h.dur);
      h.pos.copy(ub).multiplyScalar(R + h.cruise + (h.hTo - h.cruise) * k);
      if (h.t >= h.dur) {
        h.phase = 3;
        h.t = 0;
        h.rest = h.kind === 'drone' ? 1.2 + ctx.rng.next() * 1.5 : 3 + ctx.rng.next() * 4;
      }
    } else {
      h.pos.copy(h.to);
      if (h.t >= h.rest) {
        // next leg from where we landed
        const site = this.sites.get(h.site) ?? null;
        if (!this.launchHopper(ctx, h, h.kind, site)) h.active = false;
      }
    }
  }

  update(ctx: LifeCtx, dt: number): void {
    this.sites.refresh();
    if (this.version !== this.sites.version) this.index();
    const pop = game?.sim?.getMetric?.('population') ?? 0;
    const tierBoost = (game?.empire?.s?.tier ?? 3) >= 2 || ctx.planet.buildings.size > 40 ? 1 : 0.5;
    const wantF = this.anchors.length >= 2 ? Math.min(this.flyers.length, Math.round(clamp(pop / 140 + this.anchors.length * 0.6, 0, 40) * ctx.density * tierBoost)) : 0;
    const wantD = this.homes.length && this.sources.length ? Math.min(44, Math.round(clamp(pop / 160 + this.pads.length * 3, 0, 36) * ctx.density)) : 0;
    const wantT = this.roofs.length + this.pads.length >= 2 ? Math.min(16, Math.round((this.pads.length * 2.5 + this.roofs.length * 0.18) * ctx.density)) : 0;
    let nf = 0, nd = 0, nt = 0;
    for (const f of this.flyers) if (f.active) nf++;
    for (const h of this.hoppers) if (h.active) h.kind === 'drone' ? nd++ : nt++;
    if (nf < wantF) this.spawnFlyer(ctx);
    if (nd < wantD) {
      const h = this.hoppers.find((x) => !x.active);
      if (h) this.launchHopper(ctx, h, 'drone', null);
    }
    if (nt < wantT) {
      const h = this.hoppers.find((x) => !x.active);
      if (h) this.launchHopper(ctx, h, 'airTaxi', null);
    }
    this.flyerCount = nf;
    this.hopperCount = nd + nt;
    if (dt <= 0) return;
    for (const f of this.flyers) {
      if (!f.active) continue;
      if (nf > wantF + 2 && f.dying < 0) {
        f.dying = ctx.time;
        nf--;
      }
      if (f.dying >= 0 && ctx.time - f.dying > 0.8) {
        f.active = false;
        continue;
      }
      this.stepFlyer(ctx, f, dt);
    }
    for (const h of this.hoppers) if (h.active) this.stepHopper(ctx, h, dt);
  }

  render(ctx: LifeCtx): void {
    this.visible = 0;
    const cull = ctx.cull;
    if (cull.altitude > 75) return;
    const night = cull.night;
    const sp = ctx.sprites;
    for (const f of this.flyers) {
      if (!f.active) continue;
      if (!cull.visible(f.pos.x, f.pos.y, f.pos.z, 0.4, 75)) continue;
      if (ctx.budget <= 0) return;
      ctx.budget--;
      this.visible++;
      _up.copy(f.pos).normalize();
      roll(frameFwd(_fr, f.dir, _up), f.bank);
      let s = smoothstep(0, 0.8, ctx.time - f.born);
      if (f.dying >= 0) s *= 1 - smoothstep(0, 0.8, ctx.time - f.dying);
      const d = Math.sqrt(cull.dist2(f.pos.x, f.pos.y, f.pos.z));
      s *= 0.82 * (d > 14 ? Math.min(1.3, 1 + (d - 14) * 0.01) : 1);
      const c = CAR_PAINT[f.color];
      ctx.fleet('flyingCar').push(f.pos.x, f.pos.y, f.pos.z, _fr.r.x, _fr.r.y, _fr.r.z, _fr.u.x, _fr.u.y, _fr.u.z, _fr.f.x, _fr.f.y, _fr.f.z, s, c[0], c[1], c[2]);
      _p.copy(f.pos).addScaledVector(_fr.f, -0.115 * s);
      sp.push(_p.x, _p.y, _p.z, 0.03, 1.8, 0.12, 0.08, 0.65);
      if (night > 0.02) {
        _p.copy(f.pos).addScaledVector(_fr.f, 0.115 * s);
        sp.push(_p.x, _p.y, _p.z, 0.035, 1.5, 1.4, 1.2, 1);
        _p.copy(f.pos).addScaledVector(_fr.u, -0.03 * s);
        sp.push(_p.x, _p.y, _p.z, 0.05, 0.15, 0.7, 1.1, 1);
      }
    }
    for (const h of this.hoppers) {
      if (!h.active) continue;
      if (!cull.visible(h.pos.x, h.pos.y, h.pos.z, 0.3, 60)) continue;
      if (ctx.budget <= 0) return;
      ctx.budget--;
      this.visible++;
      _up.copy(h.pos).normalize();
      frameUp(_fr, _up, h.heading);
      // tilt forward while cruising
      const tilt = h.phase === 1 ? 0.18 : 0;
      if (tilt) {
        _fr.f.addScaledVector(_up, -tilt).normalize();
        _fr.u.crossVectors(_fr.f, _fr.r).normalize();
      }
      const d = Math.sqrt(cull.dist2(h.pos.x, h.pos.y, h.pos.z));
      let s = (h.kind === 'drone' ? 1.1 : 0.85) * (d > 10 ? Math.min(1.45, 1 + (d - 10) * 0.016) : 1);
      s *= smoothstep(0, 0.5, ctx.time - h.born);
      const bob = Math.sin(ctx.realTime * 3.1 + h.id) * 0.01;
      const px = h.pos.x + _up.x * bob, py = h.pos.y + _up.y * bob, pz = h.pos.z + _up.z * bob;
      ctx.fleet(h.kind).push(px, py, pz, _fr.r.x, _fr.r.y, _fr.r.z, _fr.u.x, _fr.u.y, _fr.u.z, _fr.f.x, _fr.f.y, _fr.f.z, s, 1, 1, 1);
      if (h.kind === 'drone') {
        sp.push(px + _fr.r.x * 0.04, py + _fr.r.y * 0.04, pz + _fr.r.z * 0.04, 0.03, 0.2, 1.8, 0.4, 0.5, 1.4, (h.id * 0.31) % 1, 0.5);
        sp.push(px - _fr.r.x * 0.04, py - _fr.r.y * 0.04, pz - _fr.r.z * 0.04, 0.03, 1.8, 0.15, 0.1, 0.5, 1.4, (h.id * 0.31 + 0.5) % 1, 0.5);
      } else {
        sp.push(px + _up.x * 0.06, py + _up.y * 0.06, pz + _up.z * 0.06, 0.045, 1.5, 1.5, 1.7, 0.6, 1.1, (h.id * 0.17) % 1, 0.1);
        if (night > 0.02) sp.push(px - _up.x * 0.07, py - _up.y * 0.07, pz - _up.z * 0.07, 0.06, 0.4, 1.3, 1.2, 1);
      }
    }
  }

  dispose(): void {
    this.flyers.length = 0;
    this.hoppers.length = 0;
  }
}

function pick(ctx: LifeCtx, list: Site[]): Site | null {
  return list.length ? list[Math.floor(ctx.rng.next() * list.length)] : null;
}

/** A landing spot on a building's roof (slightly off-centre, deterministic per call). */
function roofPoint(s: Site, ctx: LifeCtx, out: Vector3): Vector3 {
  const r = s.radius * 0.25;
  out.copy(s.pos).addScaledVector(s.up, s.top + 0.06).addScaledVector(s.right, (ctx.rng.next() - 0.5) * r).addScaledVector(s.fwd, (ctx.rng.next() - 0.5) * r);
  return out;
}

/** Spherical interpolation between unit vectors. */
function slerp(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const d = clamp(a.dot(b), -1, 1);
  const th = Math.acos(d);
  if (th < 1e-5) return out.copy(a);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}

/** Centripetal-ish Catmull-Rom between w1 and w2, renormalised to the interpolated altitude. */
function catmull(f: Flyer, t: number, out: Vector3, dir: Vector3): void {
  const [p0, p1, p2, p3] = f.w;
  const t2 = t * t, t3 = t2 * t;
  const a = -0.5 * t3 + t2 - 0.5 * t, b = 1.5 * t3 - 2.5 * t2 + 1, c = -1.5 * t3 + 2 * t2 + 0.5 * t, d = 0.5 * t3 - 0.5 * t2;
  out.set(
    p0.x * a + p1.x * b + p2.x * c + p3.x * d,
    p0.y * a + p1.y * b + p2.y * c + p3.y * d,
    p0.z * a + p1.z * b + p2.z * c + p3.z * d,
  );
  const da = -1.5 * t2 + 2 * t - 0.5, db = 4.5 * t2 - 5 * t, dc = -4.5 * t2 + 4 * t + 0.5, dd = 1.5 * t2 - t;
  dir.set(
    p0.x * da + p1.x * db + p2.x * dc + p3.x * dd,
    p0.y * da + p1.y * db + p2.y * dc + p3.y * dd,
    p0.z * da + p1.z * db + p2.z * dc + p3.z * dd,
  );
  const r1 = p1.length(), r2 = p2.length();
  const r = r1 + (r2 - r1) * (t * t * (3 - 2 * t));
  out.multiplyScalar(r / (out.length() || 1));
  // keep heading tangent-ish but allow climbs between lane altitudes
  const up = _b.copy(out).normalize();
  const climb = (r2 - r1) / Math.max(0.5, f.segLen);
  dir.addScaledVector(up, -dir.dot(up)).normalize().addScaledVector(up, clamp(climb, -0.4, 0.4)).normalize();
}
