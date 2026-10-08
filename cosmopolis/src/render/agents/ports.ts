/**
 * OWNER: life.
 * Ports — the big set pieces, each a looping little show driven by the agent clock:
 *   • spaceports ('spaceport' tag): a VTOL shuttle stands on the landing pad, lights up (ground smoke ring, flame,
 *     smoke column, a soft world flash when you are close), climbs, pitches downrange and fades into the sky; later
 *     it returns tail-first on a retro-burn and settles back on the pad
 *   • skyports ('airport' tag): airliners roll down the runway, rotate, climb out over the city; others come in on a
 *     long approach from the opposite side, flare, touch down and roll out — nav lights, strobes, landing lights
 *   • mass drivers ('massdriver' tag): a cargo sled screams up the coil rail and is flung skyward in a spark trail
 *   • space elevators ('elevator' tag): two climbers ride the tether, one up while the other comes down
 * Layouts match the utilities role's meshes (content/meshes/utilities/transit.ts); unknown buildings carrying the
 * same tags get sensible generic layouts (launch from the roof, runway through the centre).
 */
import { Vector3 } from 'three';
import { clamp, frameFwd, hf, newFrame, smoothstep } from './common';
import type { LifeCtx } from './ctx';
import type { Site, Sites } from './sites';

const PAD_TOP = 0.062;

interface PortState {
  site: Site;
  kind: 'space' | 'air' | 'driver' | 'elevator';
  phase: number;
  t: number;
  dur: number;
  seed: number;
  flashed: boolean;
  /** emission bookkeeping (rate-based, interpolated trails) */
  prev: Vector3;
  hasPrev: boolean;
  lastT: number;
  accF: number;
  accS: number;
  accG: number;
}

const _p = new Vector3();
const _q = new Vector3();
const _v = new Vector3();
const _d = new Vector3();
const _up = new Vector3();
const _base = new Vector3();
const _dr = new Vector3();
const _fr = newFrame();
/** runway layout scratch (site-local units) */
const _rw = { y: 0, z: 0, x0: 0, x1: 0 };

export class Ports {
  private states = new Map<number, PortState>();
  private version = -1;
  active = 0;

  constructor(private sites: Sites) {}

  private index(): void {
    this.version = this.sites.version;
    const keep = new Map<number, PortState>();
    const add = (kind: PortState['kind'], list: Site[]) => {
      for (const s of list) {
        const old = this.states.get(s.id);
        keep.set(s.id, old && old.kind === kind ? { ...old, site: s } : { site: s, kind, phase: 0, t: hf(s.id, 1) * 6, dur: 6 + hf(s.id, 2) * 6, seed: hf(s.id, 3), flashed: false, prev: new Vector3(), hasPrev: false, lastT: 0, accF: 0, accS: 0, accG: 0 });
      }
    };
    add('space', this.sites.tagged('spaceport'));
    add('air', this.sites.tagged('airport'));
    add('driver', this.sites.tagged('massdriver'));
    add('elevator', this.sites.tagged('elevator'));
    this.states = keep;
  }

  update(ctx: LifeCtx, dt: number): void {
    this.sites.refresh();
    if (this.version !== this.sites.version) this.index();
    this.active = 0;
    for (const st of this.states.values()) {
      st.t += dt;
      if (st.kind === 'space') this.stepSpace(ctx, st);
      else if (st.kind === 'air') this.stepAir(ctx, st);
      else if (st.kind === 'driver') this.stepDriver(st);
    }
  }

  // ───────────────────────────────────────────── spaceport

  private padPoint(st: PortState, out: Vector3): Vector3 {
    const s = st.site;
    if (s.defId === 'tr.spaceport') return this.sites.local(s, -0.68, PAD_TOP + 0.1, 0.42, out);
    return out.copy(s.pos).addScaledVector(s.up, s.top + 0.1);
  }

  private stepSpace(ctx: LifeCtx, st: PortState): void {
    // phases: 0 on the pad · 1 launch · 2 away · 3 landing
    if (st.t < st.dur) return;
    st.t = 0;
    st.phase = (st.phase + 1) % 4;
    st.flashed = false;
    st.dur = st.phase === 0 ? 10 + ctx.rng.next() * 10 : st.phase === 1 ? 14 : st.phase === 2 ? 18 + ctx.rng.next() * 20 : 10;
  }

  /** Shuttle pose for the current phase; returns false when not drawn. */
  private shuttlePose(st: PortState, pos: Vector3, dir: Vector3): boolean {
    const s = st.site;
    this.padPoint(st, _base);
    _up.copy(_base).normalize();
    const a = st.seed * Math.PI * 2;
    _dr.copy(s.right).multiplyScalar(Math.cos(a)).addScaledVector(s.fwd, Math.sin(a));
    if (st.phase === 0) {
      pos.copy(_base);
      dir.copy(_up);
      return true;
    }
    if (st.phase === 2) return false;
    const t = st.t;
    let h: number, x: number, dh: number, dx: number;
    if (st.phase === 1) {
      h = 0.055 * Math.pow(t, 2.6);
      dh = 0.055 * 2.6 * Math.pow(t, 1.6);
      const tt = Math.max(0, t - 2.2);
      x = 0.005 * Math.pow(tt, 3.2);
      dx = 0.005 * 3.2 * Math.pow(tt, 2.2);
    } else {
      const k = clamp(t / st.dur, 0, 1);
      h = 34 * Math.pow(1 - k, 2.6);
      dh = 34 * 2.6 * Math.pow(1 - k, 1.6) / st.dur;
      x = 7 * Math.pow(1 - k, 3);
      dx = 7 * 3 * Math.pow(1 - k, 2) / st.dur;
    }
    pos.copy(_base).addScaledVector(_up, h).addScaledVector(_dr, x);
    // nose follows the velocity on the way up; tail-first (nose up) on the way down
    dir.copy(_up).multiplyScalar(Math.max(0.2, dh)).addScaledVector(_dr, st.phase === 1 ? dx : -dx * 0.3).normalize();
    return true;
  }

  // ───────────────────────────────────────────── skyport

  private runway(st: PortState): typeof _rw {
    if (st.site.defId === 'tr.skyport') {
      _rw.y = PAD_TOP + 0.115;
      _rw.z = -1.9;
      _rw.x0 = -1.0;
      _rw.x1 = 3.3;
    } else {
      const r = st.site.radius / st.site.scale;
      _rw.y = 0.12;
      _rw.z = 0;
      _rw.x0 = -r * 0.6;
      _rw.x1 = r * 0.7;
    }
    return _rw;
  }

  private stepAir(ctx: LifeCtx, st: PortState): void {
    // phases: 0 gap · 1 take-off · 2 gap · 3 landing
    if (st.t < st.dur) return;
    st.t = 0;
    st.phase = (st.phase + 1) % 4;
    st.dur = st.phase === 1 ? 22 : st.phase === 3 ? 22 : 6 + ctx.rng.next() * 12;
  }

  /** Point `dist` along the great circle from base toward tangent dir t, `h` above base height. */
  private along(base: Vector3, t: Vector3, dist: number, h: number, out: Vector3): Vector3 {
    const r = base.length();
    const th = dist / r;
    _q.copy(base).normalize();
    out.copy(_q).multiplyScalar(Math.cos(th)).addScaledVector(t, Math.sin(th)).multiplyScalar(r + h);
    return out;
  }

  private planePose(st: PortState, pos: Vector3, dir: Vector3): number {
    const s = st.site;
    const rw = this.runway(st);
    const t = st.t;
    if (st.phase === 1) {
      // roll from x0 accelerating along +right, rotate near the end, climb out
      const a = 0.5;
      const vRot = 2.0;
      const tRot = vRot / a;
      let x: number, h: number, pitch = 0;
      if (t < tRot) {
        x = rw.x0 + 0.5 * a * t * t;
        h = 0;
      } else {
        const t2 = t - tRot;
        x = rw.x0 + 0.5 * a * tRot * tRot + vRot * t2 + 0.15 * t2 * t2;
        const climb = smoothstep(0, 1.5, t2);
        h = Math.max(0, (x - (rw.x0 + 0.5 * a * tRot * tRot)) * 0.17 * climb);
        pitch = 0.17 * climb;
      }
      // travel from the runway start (x0) along the site's right axis
      this.sites.local(s, rw.x0, rw.y, rw.z, _base);
      this.along(_base, s.right, x - rw.x0, h, pos);
      _up.copy(pos).normalize();
      _v.copy(s.right).addScaledVector(_up, -s.right.dot(_up)).normalize();
      dir.copy(_v).addScaledVector(_up, pitch).normalize();
      return x - rw.x0 > 42 ? 0 : clamp((44 - (x - rw.x0)) / 4, 0, 1);
    }
    if (st.phase === 3) {
      // approach from +right toward −right, touchdown at x1, roll-out
      const total = 34;
      const vApp = 2.3;
      const tTouch = total / vApp;
      this.sites.local(s, rw.x1, rw.y, rw.z, _base);
      _d.copy(s.right).negate();
      let dist: number, h: number, pitch = 0, fade = 1;
      if (t < tTouch) {
        const remain = total - vApp * t;
        dist = -remain;
        h = remain * 0.12 * smoothstep(0, 3, remain) + 0.0;
        pitch = -0.05 + 0.1 * smoothstep(3, 0, remain);
        fade = clamp(t / 1.5, 0, 1);
      } else {
        const t2 = t - tTouch;
        const dec = 0.75;
        const tt = Math.min(t2, vApp / dec);
        dist = vApp * tt - 0.5 * dec * tt * tt;
        h = 0;
        if (t2 > vApp / dec + 1.2) fade = 1 - clamp((t2 - vApp / dec - 1.2) / 1.2, 0, 1);
      }
      this.along(_base, _d, dist, h, pos);
      _up.copy(pos).normalize();
      _v.copy(_d).addScaledVector(_up, -_d.dot(_up)).normalize();
      dir.copy(_v).addScaledVector(_up, pitch).normalize();
      return fade;
    }
    return 0;
  }

  // ───────────────────────────────────────────── mass driver

  private stepDriver(st: PortState): void {
    // phases: 0 waiting · 1 launch run (1.6 s) · 2 flight (2 s)
    if (st.t < st.dur) return;
    st.t = 0;
    st.phase = (st.phase + 1) % 3;
    st.dur = st.phase === 0 ? 9 + st.seed * 8 : st.phase === 1 ? 1.6 : 2.2;
  }

  /** Point at fraction t along a mass driver's coil rail (site-local layout of tr.massdriver, generic otherwise). */
  private railAt(s: Site, t: number, o: Vector3): Vector3 {
    if (s.defId !== 'tr.massdriver') return this.sites.local(s, 0, (s.top * t) / s.scale, -t * 2, o);
    const z0 = 1.3, y0 = PAD_TOP + 0.43, z1 = -4.6, y1 = PAD_TOP + 4.28;
    return this.sites.local(s, 0, y0 + (y1 - y0) * (t * t * 0.55 + t * 0.45), z0 + (z1 - z0) * t, o);
  }

  private sledPose(st: PortState, pos: Vector3, dir: Vector3): boolean {
    if (st.phase === 0) return false;
    const s = st.site;
    if (st.phase === 1) {
      const k = Math.pow(clamp(st.t / st.dur, 0, 1), 2);
      this.railAt(s, k, pos);
      this.railAt(s, Math.max(0, k - 0.02), _v);
      this.railAt(s, Math.max(0.02, k), _q);
      dir.copy(_q).sub(_v).normalize();
      return true;
    }
    this.railAt(s, 1, _q);
    this.railAt(s, 0.98, _v);
    dir.copy(_q).sub(_v).normalize();
    pos.copy(_q).addScaledVector(dir, st.t * 18);
    return st.t < 2;
  }

  // ───────────────────────────────────────────── render

  render(ctx: LifeCtx): void {
    const cull = ctx.cull;
    const sp = ctx.sprites;
    const night = cull.night;
    for (const st of this.states.values()) {
      const s = st.site;
      // big shows: generous distance limits
      if (st.kind === 'space') {
        if (!this.shuttlePose(st, _p, _d)) continue;
        if (!cull.visible(_p.x, _p.y, _p.z, 1.5, 260)) continue;
        ctx.budget--;
        this.active++;
        // shuttle +Y is its nose: Y = travel dir, Z = downrange (or the site's forward), X = Y × Z
        _v.copy(_dr).addScaledVector(_d, -_d.dot(_dr));
        if (_v.lengthSq() < 1e-4) _v.copy(s.fwd).addScaledVector(_d, -_d.dot(s.fwd));
        _v.normalize();
        _q.crossVectors(_d, _v).normalize();
        let sc = 1;
        if (st.phase === 1) sc = 1 - smoothstep(st.dur - 2, st.dur, st.t);
        if (st.phase === 3) sc = smoothstep(0, 1.2, st.t);
        ctx.fleet('shuttle').push(_p.x, _p.y, _p.z, _q.x, _q.y, _q.z, _d.x, _d.y, _d.z, _v.x, _v.y, _v.z, sc, 1, 1, 1);
        const burning = (st.phase === 1 && st.t > 0.4) || (st.phase === 3 && st.t > st.dur * 0.45 && st.t < st.dur - 0.2);
        const igniting = st.phase === 1 && st.t < 2.6;
        if (st.phase === 0 && night > 0.02) {
          _q.copy(_p).addScaledVector(_d, 1.3);
          sp.push(_q.x, _q.y, _q.z, 0.14, 2.4, 0.2, 0.1, 0.6, 0.6, st.seed, 0.25);
        }
        if (burning || igniting) {
          _q.copy(_p).addScaledVector(_d, -0.12 * sc);
          const thr = st.phase === 1 ? clamp(st.t / 1.2, 0, 1) : 0.8;
          sp.push(_q.x, _q.y, _q.z, 0.45 * sc * thr + 0.05, 3.0, 1.7, 0.7, 0);
          sp.push(_q.x, _q.y, _q.z, 0.95 * sc * thr, 1.0, 0.42, 0.12, 0);
          const close = cull.dist2(_q.x, _q.y, _q.z) < 140 * 140;
          // rate-based emission, interpolated between frames so the trail is continuous at any frame rate
          const dtE = Math.min(0.25, Math.max(0, ctx.time - st.lastT));
          st.lastT = ctx.time;
          if (!st.hasPrev) {
            st.prev.copy(_q);
            st.hasPrev = true;
          }
          if (close && dtE > 0) {
            const alt = _q.length() - ctx.planet.radius;
            st.accF += dtE * 38;
            st.accS += dtE * (alt < 32 ? 22 : 0) * thr;
            const nf = Math.floor(st.accF), ns = Math.floor(st.accS);
            st.accF -= nf;
            st.accS -= ns;
            const j = ctx.rng;
            for (let k = 0; k < nf; k++) {
              _v.copy(st.prev).lerp(_q, (k + 1) / nf);
              ctx.flames.emit(_v.x, _v.y, _v.z, -_d.x * 2.4 + (j.next() - 0.5) * 0.5, -_d.y * 2.4 + (j.next() - 0.5) * 0.5, -_d.z * 2.4 + (j.next() - 0.5) * 0.5, 0.35, 0.12 * sc, 0.32 * sc, 1.6, 0.9, 0.35, 1, 3);
            }
            for (let k = 0; k < ns; k++) {
              _v.copy(st.prev).lerp(_q, (k + 1) / ns);
              ctx.smoke.emit(_v.x, _v.y, _v.z, -_d.x * 0.5 + (j.next() - 0.5) * 0.2, -_d.y * 0.5 + (j.next() - 0.5) * 0.2, -_d.z * 0.5 + (j.next() - 0.5) * 0.2, 5, 0.22, 1.35, 0.94, 0.93, 0.91, 0.42, 0.7, 0.03);
            }
            // ground smoke ring at ignition / touchdown
            if ((st.phase === 1 && st.t < 2.5) || (st.phase === 3 && st.t > st.dur - 2.5)) {
              this.padPoint(st, _base);
              _up.copy(_base).normalize();
              st.accG += dtE * 16;
              const ng = Math.floor(st.accG);
              st.accG -= ng;
              for (let k = 0; k < ng; k++) {
                const a = j.next() * Math.PI * 2;
                _v.copy(s.right).multiplyScalar(Math.cos(a)).addScaledVector(s.fwd, Math.sin(a));
                const sp0 = 0.8 + j.next() * 0.8;
                ctx.smoke.emit(_base.x, _base.y, _base.z, _v.x * sp0 + _up.x * 0.1, _v.y * sp0 + _up.y * 0.1, _v.z * sp0 + _up.z * 0.1, 3.5, 0.3, 1.3, 0.95, 0.93, 0.9, 0.55, 0.9, 0.02);
              }
            }
          }
          st.prev.copy(_q);
          // a warm flash on the surroundings at ignition when the camera is close
          if (st.phase === 1 && !st.flashed && st.t > 0.5 && cull.dist2(_q.x, _q.y, _q.z) < 40 * 40) {
            st.flashed = true;
            try {
              (ctx.view.env as unknown as { flash?: (c: number, i?: number, s?: number) => void }).flash?.(0xffb36a, 0.12, 1.2);
            } catch {
              /* optional */
            }
          }
        } else st.hasPrev = false;
      } else if (st.kind === 'air') {
        const fade = this.planePose(st, _p, _d);
        if (fade <= 0.01) continue;
        if (!cull.visible(_p.x, _p.y, _p.z, 1.2, 160)) continue;
        ctx.budget--;
        this.active++;
        _up.copy(_p).normalize();
        const fr = frameFwd(_fr, _d, _up);
        const sc = fade;
        ctx.fleet('airliner').push(_p.x, _p.y, _p.z, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, sc, hf(s.id, st.phase) > 0.5 ? 0.9 : 0.05, 0.25, hf(s.id, st.phase + 7) > 0.5 ? 0.85 : 0.2);
        // nav lights: red left, green right, white tail strobe, landing light
        _q.copy(_p).addScaledVector(fr.r, -0.6 * sc).addScaledVector(fr.f, -0.12 * sc);
        sp.push(_q.x, _q.y, _q.z, 0.07, 2.4, 0.1, 0.1, 0.5);
        _q.copy(_p).addScaledVector(fr.r, 0.6 * sc).addScaledVector(fr.f, -0.12 * sc);
        sp.push(_q.x, _q.y, _q.z, 0.07, 0.1, 2.4, 0.3, 0.5);
        _q.copy(_p).addScaledVector(fr.f, -0.72 * sc).addScaledVector(fr.u, 0.25 * sc);
        sp.push(_q.x, _q.y, _q.z, 0.1, 2.6, 2.6, 2.8, 0.3, 1.2, st.seed, 0.1);
        if (night > 0.02) {
          _q.copy(_p).addScaledVector(fr.f, 0.62 * sc).addScaledVector(fr.u, -0.05);
          sp.push(_q.x, _q.y, _q.z, 0.3, 1.8, 1.7, 1.5, 1);
        }
      } else if (st.kind === 'driver') {
        if (!this.sledPose(st, _p, _d)) continue;
        if (!cull.visible(_p.x, _p.y, _p.z, 0.8, 140)) continue;
        ctx.budget--;
        this.active++;
        _up.copy(_p).normalize();
        const fr = frameFwd(_fr, _d, _up);
        const sc = st.phase === 2 ? 1 - smoothstep(1.2, 2, st.t) : 1;
        ctx.fleet('sled').push(_p.x, _p.y, _p.z, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, sc, 1, 1, 1);
        sp.push(_p.x, _p.y, _p.z, 0.5 * sc, 0.6, 1.8, 2.6, 0);
        if (cull.dist2(_p.x, _p.y, _p.z) < 90 * 90) {
          for (let k = 0; k < 2; k++) {
            const j = ctx.rng;
            ctx.flames.emit(_p.x, _p.y, _p.z, -_d.x * 1.5 + (j.next() - 0.5) * 0.6, -_d.y * 1.5 + (j.next() - 0.5) * 0.6, -_d.z * 1.5 + (j.next() - 0.5) * 0.6, 0.5, 0.08, 0.02, 0.5, 0.9, 1.6, 0.9, 1.5);
          }
        }
      } else {
        // elevator: two climbers, one up, one down; long cycle
        const cycle = 70;
        for (let k = 0; k < 2; k++) {
          const t = (ctx.time / cycle + st.seed + k * 0.5) % 1;
          // 0..0.07 bottom wait · 0.07..0.5 ascend · 0.5..0.57 top wait · 0.57..1 descend
          let y: number;
          if (t < 0.07) y = 0;
          else if (t < 0.5) y = smoothstep(0.07, 0.5, t);
          else if (t < 0.57) y = 1;
          else y = 1 - smoothstep(0.57, 1, t);
          const generic = s.defId !== 'tr.elevator';
          const ybase = generic ? s.top * 0.1 : PAD_TOP + 3.4;
          const ytop = generic ? s.top - 1 : PAD_TOP + 118;
          this.sites.local(s, k ? 0.36 : -0.36, ybase + (ytop - ybase) * y, 0, _p);
          if (!cull.visible(_p.x, _p.y, _p.z, 0.8, 320)) continue;
          ctx.budget--;
          this.active++;
          const dist = Math.sqrt(cull.dist2(_p.x, _p.y, _p.z));
          const sc = 1.1 * (dist > 20 ? Math.min(2.4, 1 + (dist - 20) * 0.012) : 1);
          ctx.fleet('climber').push(_p.x, _p.y, _p.z, s.right.x, s.right.y, s.right.z, s.up.x, s.up.y, s.up.z, s.fwd.x, s.fwd.y, s.fwd.z, sc, 1, 1, 1);
          sp.push(_p.x, _p.y, _p.z, 0.5, 0.6, 1.6, 2.2, 0.3, 0.9, (st.seed + k * 0.37) % 1, 0.3);
        }
      }
    }
  }

  dispose(): void {
    this.states.clear();
  }
}
