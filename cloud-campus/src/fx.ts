import { rand, type Vec } from './types';

/** Visual-only effects. Physics never reads from here. Velocities are px/second. */

export type PKind = 'dot' | 'smoke' | 'flame' | 'spark' | 'shard' | 'leaf' | 'star' | 'bubble';

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; grow: number;
  color: string; drag: number; g: number; kind: PKind; rot: number; vr: number;
}
export interface Ring {
  x: number; y: number; r0: number; r1: number; life: number; max: number;
  color: string; width: number; a0: number; a1: number;
}
export interface Beam { pts: Vec[]; life: number; max: number; color: string; width: number; glow: string }
export interface Floater { x: number; y: number; text: string; life: number; max: number; color: string }

const MAX_PARTICLES = 900;

export class Fx {
  parts: Particle[] = [];
  rings: Ring[] = [];
  beams: Beam[] = [];
  floaters: Floater[] = [];
  flash = 0;
  flashColor = '255,255,255';
  shake = 0;

  p(o: Partial<Particle> & { x: number; y: number }) {
    if (this.parts.length >= MAX_PARTICLES) this.parts.splice(0, 60);
    const max = o.max ?? o.life ?? 0.6;
    this.parts.push({
      vx: 0, vy: 0, size: 3, grow: 0, color: '#fff', drag: 1.5, g: 0, kind: 'dot',
      rot: Math.random() * 6.28, vr: 0, ...o, life: max, max,
    });
  }

  update(dt: number) {
    for (const p of this.parts) {
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size = Math.max(0, p.size + p.grow * dt);
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    for (const f of this.floaters) { f.life -= dt; f.y -= 28 * dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  puff(x: number, y: number, color = 'rgba(255,255,255,0.95)', n = 12, speed = 110) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.3, 1) * speed;
      this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 20, max: rand(0.4, 0.8), size: rand(6, 12), grow: 14, color, drag: 3.5, kind: 'smoke' });
    }
  }

  dust(x: number, y: number, n = 6, spread = 1) {
    for (let i = 0; i < n; i++) {
      this.p({ x: x + rand(-8, 8) * spread, y, vx: rand(-90, 90) * spread, vy: rand(-50, -10), max: rand(0.3, 0.6), size: rand(3, 6), grow: 10, color: 'rgba(230,220,200,0.8)', drag: 4, kind: 'smoke' });
    }
  }

  sparks(x: number, y: number, color: string, n = 10, speed = 260, g = 400) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.35, 1) * speed;
      this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: rand(0.2, 0.5), size: rand(1.5, 3), color, drag: 2, g, kind: 'spark' });
    }
  }

  flames(x: number, y: number, n = 3, spread = 8, vx = 0, vy = -60) {
    for (let i = 0; i < n; i++) {
      this.p({
        x: x + rand(-spread, spread), y: y + rand(-spread, spread) * 0.5,
        vx: vx + rand(-30, 30), vy: vy + rand(-40, 10), max: rand(0.25, 0.55),
        size: rand(5, 10), grow: -12, color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f', drag: 2, g: -120, kind: 'flame',
      });
    }
  }

  steam(x: number, y: number, n = 8) {
    for (let i = 0; i < n; i++) {
      this.p({ x: x + rand(-14, 14), y: y + rand(-14, 14), vx: rand(-25, 25), vy: rand(-80, -30), max: rand(0.6, 1.1), size: rand(6, 10), grow: 16, color: 'rgba(235,245,255,0.7)', drag: 1.5, kind: 'smoke' });
    }
  }

  shards(x: number, y: number, color: string, n = 10, speed = 240) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.3, 1) * speed;
      this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, max: rand(0.4, 0.8), size: rand(3, 6), color, drag: 1, g: 700, kind: 'shard', vr: rand(-12, 12) });
    }
  }

  leaves(x: number, y: number, n = 5) {
    for (let i = 0; i < n; i++) {
      this.p({ x, y, vx: rand(-70, 70), vy: rand(-90, -20), max: rand(0.6, 1.1), size: rand(3, 5), color: Math.random() < 0.5 ? '#4fc263' : '#2f8f45', drag: 2, g: 160, kind: 'leaf', vr: rand(-6, 6) });
    }
  }

  stars(x: number, y: number, color = '#fff6b0', n = 6) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      this.p({ x, y, vx: Math.cos(a) * rand(30, 120), vy: Math.sin(a) * rand(30, 120), max: rand(0.4, 0.9), size: rand(3, 6), color, drag: 2, kind: 'star', vr: rand(-5, 5) });
    }
  }

  bubbles(x: number, y: number, color: string, n = 6) {
    for (let i = 0; i < n; i++) {
      this.p({ x: x + rand(-10, 10), y, vx: rand(-40, 40), vy: rand(-90, -30), max: rand(0.4, 0.8), size: rand(2, 5), color, drag: 2, g: 200, kind: 'bubble' });
    }
  }

  ring(x: number, y: number, r1: number, color: string, width = 4, life = 0.4, a0 = 0, a1 = Math.PI * 2, r0 = 6) {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width, a0, a1 });
  }

  beam(pts: Vec[], color: string, width = 4, life = 0.2, glow = color) {
    this.beams.push({ pts, life, max: life, color, width, glow });
  }

  zigzag(a: Vec, b: Vec, segs = 8, amp = 8): Vec[] {
    const pts: Vec[] = [a];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const o = rand(-amp, amp);
      pts.push({ x: a.x + dx * t + nx * o, y: a.y + dy * t + ny * o });
    }
    pts.push(b);
    return pts;
  }

  text(x: number, y: number, text: string, color = '#fff') {
    this.floaters.push({ x, y, text, life: 1.1, max: 1.1, color });
  }

  flashScreen(alpha: number, rgb = '255,255,255') {
    this.flash = Math.max(this.flash, alpha);
    this.flashColor = rgb;
  }

  addShake(n: number) {
    this.shake = Math.min(20, this.shake + n);
  }
}
