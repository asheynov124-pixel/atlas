/**
 * OWNER: life.
 * Celebrations — after dark the city throws parties: fireworks rise from stadiums, venues, attractions, nightlife
 * and landmarks near the camera, climb on sparkling trails and burst into peonies, rings and willows of colour.
 * Everything is GPU particles (the shared additive `flames` system) plus a brief sprite flash per burst, so a full
 * show costs a few hundred particles and no draw calls of its own. Quiet by day and when zoomed far out.
 */
import { Vector3 } from 'three';
import { linHex } from './batch';
import { firstFree } from './common';
import type { LifeCtx } from './ctx';
import type { Site, Sites } from './sites';

const PARTY_TAGS = ['venue', 'sports', 'attraction', 'nightlife', 'festival', 'landmark', 'wonder', 'resort', 'casino', 'park', 'plaza', 'culture', 'holiday', 'beach'];
const COLORS = [0xff4a6a, 0xffc84a, 0x6affb0, 0x5ab8ff, 0xc87aff, 0xffffff, 0xff8a3a, 0x7af0ff];
const LIN = new Float32Array(COLORS.length * 3);
COLORS.forEach((h, i) => linHex(h, LIN, i * 3));

interface Shell {
  active: boolean;
  pos: Vector3;
  vel: Vector3;
  t: number;
  fuse: number;
  color: number;
  color2: number;
  style: number;
}

interface Flash {
  t: number;
  pos: Vector3;
  color: number;
}

const _up = new Vector3();
const _d = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

export class Celebrations {
  private venues: Site[] = [];
  private version = -1;
  private shells: Shell[] = [];
  private flashes: Flash[] = [];
  private timer = 3;
  bursts = 0;

  constructor(private sites: Sites) {
    for (let i = 0; i < 10; i++) this.shells.push({ active: false, pos: new Vector3(), vel: new Vector3(), t: 0, fuse: 1, color: 0, color2: 0, style: 0 });
    for (let i = 0; i < 10; i++) this.flashes.push({ t: 99, pos: new Vector3(), color: 0 });
  }

  update(ctx: LifeCtx, dt: number): void {
    this.sites.refresh();
    if (this.version !== this.sites.version) {
      this.version = this.sites.version;
      this.venues = this.sites.all.filter((s) => s.tags.some((t) => PARTY_TAGS.includes(t)));
    }
    const cull = ctx.cull;
    if (dt <= 0) return;
    for (const f of this.flashes) f.t += dt;
    const party = cull.night > 0.55 && cull.altitude < 90 && (this.venues.length > 0 || this.sites.towers.length > 0);
    if (party && (this.timer -= dt) <= 0) {
      this.timer = 5 + ctx.rng.next() * 9;
      // a venue in view — or, failing that, a skyscraper roof (New Year's style)
      for (let tries = 0; tries < 12; tries++) {
        const list = tries < 8 && this.venues.length ? this.venues : this.sites.towers;
        if (!list.length) continue;
        const s = list[Math.floor(ctx.rng.next() * list.length)];
        if (!cull.visible(s.pos.x, s.pos.y, s.pos.z, 6, 80)) continue;
        const n = 1 + Math.floor(ctx.rng.next() * 3);
        for (let k = 0; k < n; k++) this.launch(ctx, s, k * 0.25);
        break;
      }
    }
    for (const sh of this.shells) {
      if (!sh.active) continue;
      if (sh.t < 0) {
        sh.t += dt;
        continue;
      }
      sh.t += dt;
      _up.copy(sh.pos).normalize();
      sh.vel.addScaledVector(_up, -2.2 * dt);
      _a.copy(sh.pos);
      sh.pos.addScaledVector(sh.vel, dt);
      // sparkling trail
      const steps = 2;
      for (let k = 0; k < steps; k++) {
        _b.copy(_a).lerp(sh.pos, (k + 1) / steps);
        const j = ctx.rng;
        ctx.flames.emit(_b.x, _b.y, _b.z, (j.next() - 0.5) * 0.15, (j.next() - 0.5) * 0.15, (j.next() - 0.5) * 0.15, 0.5, 0.05, 0.01, 1.6, 1.1, 0.6, 1, 1.5, -0.4);
      }
      if (sh.t >= sh.fuse) this.burst(ctx, sh);
    }
  }

  private launch(ctx: LifeCtx, s: Site, delay: number): void {
    const sh = firstFree(this.shells);
    if (!sh) return;
    const r = ctx.rng;
    sh.pos.copy(s.pos).addScaledVector(s.up, s.top + 0.2).addScaledVector(s.right, (r.next() - 0.5) * s.radius).addScaledVector(s.fwd, (r.next() - 0.5) * s.radius);
    _d.copy(s.up).multiplyScalar(4.2 + r.next() * 1.4).addScaledVector(s.right, (r.next() - 0.5) * 0.8).addScaledVector(s.fwd, (r.next() - 0.5) * 0.8);
    sh.vel.copy(_d);
    sh.t = -delay;
    sh.fuse = 0.9 + r.next() * 0.5;
    sh.color = Math.floor(r.next() * COLORS.length);
    sh.color2 = Math.floor(r.next() * COLORS.length);
    sh.style = Math.floor(r.next() * 3);
    sh.active = true;
  }

  private burst(ctx: LifeCtx, sh: Shell): void {
    sh.active = false;
    this.bursts++;
    const r = ctx.rng;
    const n = sh.style === 1 ? 28 : 40;
    _up.copy(sh.pos).normalize();
    for (let i = 0; i < n; i++) {
      // random direction on a sphere (ring style: flattened to a plane)
      const z = r.next() * 2 - 1, a = r.next() * Math.PI * 2, q = Math.sqrt(1 - z * z);
      _d.set(q * Math.cos(a), z, q * Math.sin(a));
      if (sh.style === 1) _d.addScaledVector(_up, -_d.dot(_up)).normalize();
      const sp = (sh.style === 1 ? 2.4 : 1.6 + r.next() * 0.9) * (sh.style === 2 ? 0.8 : 1);
      const ci = (i & 1 ? sh.color : sh.color2) * 3;
      const life = sh.style === 2 ? 2.4 : 1.5;
      ctx.flames.emit(sh.pos.x, sh.pos.y, sh.pos.z, _d.x * sp, _d.y * sp, _d.z * sp, life, 0.09, 0.03, LIN[ci] * 2, LIN[ci + 1] * 2, LIN[ci + 2] * 2, 1, sh.style === 2 ? 0.9 : 1.6, sh.style === 2 ? -1.2 : -0.5);
    }
    const f = this.flashes.find((x) => x.t > 0.4) ?? this.flashes[0];
    f.t = 0;
    f.pos.copy(sh.pos);
    f.color = sh.color;
  }

  render(ctx: LifeCtx): void {
    for (const f of this.flashes) {
      if (f.t > 0.35) continue;
      const k = 1 - f.t / 0.35;
      const ci = f.color * 3;
      ctx.sprites.push(f.pos.x, f.pos.y, f.pos.z, 1.6 * k + 0.2, LIN[ci] * 2 * k, LIN[ci + 1] * 2 * k, LIN[ci + 2] * 2 * k, 0);
    }
  }

  dispose(): void {
    this.shells.length = 0;
    this.flashes.length = 0;
  }
}
