import Matter from 'matter-js';
import type { Actor } from './actor';
import type { Camera } from './camera';
import { CORE, FALL_Y, INTAKE, PAD, ZONES, type Machine, type World } from './world';
import { clamp, tagOf, type Prop, type Vec } from './types';

const { Composite } = Matter;

// ------------------------------------------------------------------ color utils

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb(r: number, g: number, b: number, a = 1) {
  return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
export function shade(hex: string, amt: number, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return rgb(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p, a);
}
function mix(h1: string, h2: string, t: number) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return rgb(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

// Seeded RNG so the scenery is stable between reloads.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

interface Cloud { x: number; y: number; s: number; puffs: { dx: number; dy: number; r: number }[] }

const SKY = {
  on: ['#3d7fd6', '#8cc3f0', '#ffe2bf'],
  off: ['#2a2350', '#7a4a7a', '#f08a62'],
  over: ['#4a2fb0', '#9a78f0', '#ffd0f4'],
};

export class Renderer {
  private layers: { f: number; alpha: number; clouds: Cloud[] }[] = [];
  private island: Vec[] = [];
  private isletRock: Vec[] = [];

  constructor() {
    const r = rng(7);
    const mk = (n: number, f: number, alpha: number, y0: number, y1: number, s0: number, s1: number) => {
      const clouds: Cloud[] = [];
      for (let i = 0; i < n; i++) {
        const puffs = [];
        const k = 3 + Math.floor(r() * 4);
        for (let j = 0; j < k; j++) puffs.push({ dx: (j - k / 2) * 26 + r() * 14, dy: -r() * 18, r: 20 + r() * 22 });
        clouds.push({ x: r() * 4000, y: y0 + r() * (y1 - y0), s: s0 + r() * (s1 - s0), puffs });
      }
      this.layers.push({ f, alpha, clouds });
    };
    mk(14, 0.06, 0.55, -0.45, 0.1, 0.6, 1.0);
    mk(12, 0.16, 0.7, -0.3, 0.35, 0.9, 1.4);
    mk(9, 0.32, 0.85, 0.1, 0.6, 1.3, 1.9);
    mk(7, 1.35, 0.5, 0.7, 1.1, 2.2, 3.0);

    const ir = rng(11);
    const x0 = -1500, x1 = 1150;
    this.island.push({ x: x0, y: 68 });
    for (let x = x0; x <= x1; x += 70) {
      const t = (x - x0) / (x1 - x0);
      this.island.push({ x: x + ir() * 20 - 10, y: 80 + 70 * Math.sin(Math.PI * t) + 190 * Math.pow(Math.sin(Math.PI * t), 3) + ir() * 40 });
    }
    this.island.push({ x: x1, y: 68 });
    this.isletRock = [{ x: 1292, y: 68 }, { x: 1320, y: 110 }, { x: 1370, y: 160 }, { x: 1400, y: 190 }, { x: 1440, y: 140 }, { x: 1488, y: 68 }];
  }

  draw(ctx: CanvasRenderingContext2D, w: World, cam: Camera, mouseWorld: Vec, dpr: number, debug: boolean, fps: number) {
    const W = cam.w, H = cam.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sky(ctx, w, W, H);
    for (let i = 0; i < 3; i++) this.cloudLayer(ctx, cam, i, W, H);

    cam.apply(ctx, dpr);
    this.underside(ctx, w);
    this.facades(ctx, w);
    for (const m of w.machines) this.machine(ctx, w, m);
    this.ground(ctx, w);
    this.markers(ctx, w);
    for (const v of w.vines) this.vine(ctx, w, v.kind, w.vineEnds(v), v.life / v.max);
    for (const p of w.props) this.prop(ctx, w, p);
    for (const i of w.ice) this.iceWall(ctx, i.body, i.w, i.h, i.life / i.max);
    for (const a of w.actors) if (!a.dead) this.actor(ctx, w, a);
    for (const p of w.projectiles) this.projectile(ctx, p.body, p.kind);
    this.fx(ctx, w);
    if (w.xrayT > 0) this.xray(ctx, w, cam, dpr);
    this.reticle(ctx, w, mouseWorld);
    if (debug) this.debug(ctx, w);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cloudLayer(ctx, cam, 3, W, H);
    if (w.fx.flash > 0) {
      ctx.fillStyle = `rgba(${w.fx.flashColor},${clamp(w.fx.flash, 0, 0.8)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (w.core.blendOff > 0.02) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      const pulse = 0.18 + 0.1 * Math.sin(w.time * 6);
      g.addColorStop(0, 'rgba(255,40,40,0)');
      g.addColorStop(1, `rgba(255,40,40,${pulse * w.core.blendOff})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (debug) this.debugText(ctx, w, fps);
  }

  // ------------------------------------------------------------------ backdrop

  private sky(ctx: CanvasRenderingContext2D, w: World, W: number, H: number) {
    const { blendOff, blendOver } = w.core;
    const stops = [0, 1, 2].map((i) => {
      const base = mix(SKY.on[i], SKY.off[i], blendOff);
      return blendOver > 0.01 ? mix(toHex(base), SKY.over[i], blendOver) : base;
    });
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.55, stops[1]);
    g.addColorStop(1, stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun disc
    const sg = ctx.createRadialGradient(W * 0.82, H * 0.2, 4, W * 0.82, H * 0.2, 120);
    sg.addColorStop(0, 'rgba(255,250,230,0.9)');
    sg.addColorStop(1, 'rgba(255,250,230,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
  }

  private cloudLayer(ctx: CanvasRenderingContext2D, cam: Camera, i: number, W: number, H: number) {
    const L = this.layers[i];
    const wrap = 4000;
    ctx.fillStyle = `rgba(255,255,255,${L.alpha})`;
    for (const c of L.clouds) {
      let x = (c.x - cam.x * L.f * cam.zoom) % wrap;
      if (x < 0) x += wrap;
      x = x - 400;
      if (x > W + 400) continue;
      const y = H * 0.5 + c.y * H - (cam.y + 140) * L.f * cam.zoom;
      const s = c.s * (i === 3 ? 1 : cam.zoom * 0.8 + 0.2);
      ctx.beginPath();
      for (const p of c.puffs) {
        ctx.moveTo(x + p.dx * s + p.r * s, y + p.dy * s);
        ctx.arc(x + p.dx * s, y + p.dy * s, p.r * s, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  private underside(ctx: CanvasRenderingContext2D, w: World) {
    const poly = (pts: Vec[]) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.closePath();
    };
    const g = ctx.createLinearGradient(0, 60, 0, 360);
    g.addColorStop(0, '#8b6a4b');
    g.addColorStop(1, '#4c3a52');
    ctx.fillStyle = g;
    poly(this.island);
    ctx.fill();
    poly(this.isletRock);
    ctx.fill();
    // Rock strata, clipped to the island.
    ctx.save();
    poly(this.island);
    ctx.clip();
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(0,0,0,0.1)' : 'rgba(255,230,200,0.08)';
      ctx.beginPath();
      for (let x = -1500; x <= 1150; x += 50) {
        const y = 105 + i * 48 + Math.sin(x * 0.004 + i * 1.7) * 14 + Math.sin(x * 0.013 + i) * 5;
        x === -1500 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Core chamber + conduit to the intake.
    const mode = w.core.mode;
    const flick = mode === 'off' ? (Math.random() < 0.3 ? 0.25 : 0.6) : 1;
    const col = mode === 'off' ? '#ff5a4a' : mode === 'over' ? '#c9a2ff' : '#7af7ff';
    const pulse = 1 + 0.08 * Math.sin(w.time * (mode === 'over' ? 9 : 3));
    ctx.fillStyle = 'rgba(20,14,34,0.85)';
    ctx.beginPath();
    ctx.ellipse(CORE.x, CORE.y, 74, 64, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(toHex(col), 0, 0.55 * flick);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(CORE.x + 30, CORE.y - 40);
    ctx.lineTo(INTAKE.x, 140);
    ctx.lineTo(INTAKE.x, INTAKE.y + 10);
    ctx.stroke();
    const glow = ctx.createRadialGradient(CORE.x, CORE.y, 4, CORE.x, CORE.y, 90 * pulse);
    glow.addColorStop(0, shade(toHex(col), 0.6, 0.95 * flick));
    glow.addColorStop(0.35, shade(toHex(col), 0, 0.6 * flick));
    glow.addColorStop(1, shade(toHex(col), 0, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(CORE.x, CORE.y, 90 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(toHex(col), 0.3, 0.8 * flick);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(CORE.x, CORE.y, 40, 14, w.time * (mode === 'off' ? 0.4 : 1.5) + (i * Math.PI) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = shade(toHex(col), 0.7, flick);
    ctx.beginPath();
    ctx.arc(CORE.x, CORE.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  private facades(ctx: CanvasRenderingContext2D, w: World) {
    const sign = (x: number, y: number, text: string, size = 22) => {
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      const tw = ctx.measureText(text).width;
      const k = size / 22;
      ctx.fillStyle = 'rgba(20,32,58,0.85)';
      roundRect(ctx, x - tw / 2 - 12 * k, y - 18 * k, tw + 24 * k, 30 * k, 6 * k);
      ctx.fill();
      ctx.fillStyle = '#f6f1e4';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y + 5 * k);
      ctx.textAlign = 'left';
    };
    // Gym
    ctx.fillStyle = '#c9b79c';
    ctx.fillRect(-1500, -340, 620, 340);
    ctx.fillStyle = '#a8957a';
    ctx.fillRect(-1500, -352, 620, 22);
    ctx.fillStyle = 'rgba(160,210,240,0.55)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.rect(-1450 + i * 145, -300, 90, 70);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(-1500, -60, 620, 60);
    // Hoop pole and net
    ctx.strokeStyle = '#6b6f78';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-1004, 0);
    ctx.lineTo(-1004, -226);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-1060 + i * 10, -236);
      ctx.lineTo(-1052 + i * 6, -206);
      ctx.stroke();
    }
    sign(-1190, -380, ZONES[0].name);

    // Locker hallway
    ctx.fillStyle = '#9fb4c8';
    ctx.fillRect(-880, -270, 580, 270);
    ctx.fillStyle = '#7f95ab';
    ctx.fillRect(-880, -282, 580, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-880, -200, 580, 4);
    sign(-590, -305, ZONES[1].name);

    // Courtyard tree and signpost
    ctx.fillStyle = '#6b4a2e';
    ctx.fillRect(-268, -120, 14, 120);
    ctx.fillStyle = '#4a9a4f';
    for (const [dx, dy, r] of [[-261, -150, 46], [-300, -120, 32], [-222, -118, 34], [-262, -190, 30]]) {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(-130, -46, 6, 46);
    sign(-127, -56, ZONES[2].name, 11);

    // Cafeteria
    ctx.fillStyle = '#e3c9a8';
    ctx.fillRect(470, -380, 680, 380);
    ctx.fillStyle = '#c2a582';
    ctx.fillRect(470, -392, 680, 22);
    ctx.fillStyle = 'rgba(160,210,240,0.55)';
    for (let i = 0; i < 5; i++) ctx.fillRect(500 + i * 130, -340, 90, 100);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(470, -130, 680, 130);
    // Balcony railing
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(625, -232);
    ctx.lineTo(935, -232);
    for (let x = 630; x <= 935; x += 22) {
      ctx.moveTo(x, -232);
      ctx.lineTo(x, -206);
    }
    ctx.stroke();
    sign(810, -415, ZONES[3].name);
    void w;
  }

  private machine(ctx: CanvasRenderingContext2D, w: World, m: Machine) {
    const x0 = m.x - m.w / 2, y0 = m.y - m.h;
    const hum = m.hum > 0 && Math.sin(w.time * 40) > 0;
    if (m.kind === 'locker') {
      ctx.fillStyle = '#3c5068';
      ctx.fillRect(x0, y0, m.w, m.h);
      const reveal = m.hasCell && w.revealT > 0;
      if (m.openT > 0 || reveal) {
        ctx.fillStyle = '#1a2230';
        ctx.fillRect(x0 + 3, y0 + 3, m.w - 6, m.h - 6);
      }
      if (reveal) {
        const g = ctx.createRadialGradient(m.x, y0 + m.h * 0.4, 2, m.x, y0 + m.h * 0.4, 60);
        g.addColorStop(0, 'rgba(122,247,255,0.9)');
        g.addColorStop(1, 'rgba(122,247,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(m.x - 60, y0 - 20, 120, m.h + 20);
        ctx.fillStyle = '#7af7ff';
        roundRect(ctx, m.x - 8, y0 + m.h * 0.4 - 13, 16, 26, 7);
        ctx.fill();
      }
      if (m.openT > 0) {
        const swing = Math.min(1, m.openT * 3);
        ctx.fillStyle = hum ? '#7fe0b0' : '#6f8fb0';
        ctx.beginPath();
        ctx.moveTo(x0 + m.w, y0 + 2);
        ctx.lineTo(x0 + m.w + 20 * swing, y0 + 10);
        ctx.lineTo(x0 + m.w + 20 * swing, y0 + m.h - 10);
        ctx.lineTo(x0 + m.w, y0 + m.h - 2);
        ctx.fill();
      } else if (!reveal) {
        ctx.fillStyle = hum ? '#7fe0b0' : '#6f8fb0';
        ctx.fillRect(x0 + 3, y0 + 3, m.w - 6, m.h - 6);
        ctx.strokeStyle = 'rgba(20,30,45,0.6)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x0 + 12, y0 + 14 + i * 7);
          ctx.lineTo(x0 + m.w - 12, y0 + 14 + i * 7);
          ctx.stroke();
        }
        ctx.fillStyle = '#d9e2ea';
        ctx.fillRect(x0 + m.w - 12, y0 + m.h * 0.5, 4, 14);
      }
    } else if (m.kind === 'vending') {
      ctx.fillStyle = hum ? '#ff6a5a' : '#c23b3b';
      roundRect(ctx, x0, y0, m.w, m.h, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,235,255,0.75)';
      ctx.fillRect(x0 + 8, y0 + 12, m.w - 26, m.h - 50);
      const cols = ['#d83a3a', '#2f8fd8', '#3fbf5a', '#f2b632'];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        ctx.fillStyle = cols[(r + c) % 4];
        ctx.fillRect(x0 + 13 + c * 10, y0 + 18 + r * 22, 6, 14);
      }
      ctx.fillStyle = '#222';
      ctx.fillRect(x0 + 10, y0 + m.h - 30, m.w - 30, 14);
      ctx.fillStyle = hum ? '#8affc1' : '#f7d36b';
      ctx.fillRect(x0 + m.w - 14, y0 + 20, 6, 30);
    } else {
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(m.x - 4, y0 + 30, 8, m.h - 30);
      ctx.fillRect(m.x - 20, m.y - 6, 40, 6);
      ctx.save();
      ctx.translate(m.x, y0 + 26);
      ctx.rotate(-0.4);
      ctx.fillStyle = hum ? '#7fe0b0' : '#e2a33a';
      roundRect(ctx, -22, -12, 48, 24, 10);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(24, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private ground(ctx: CanvasRenderingContext2D, w: World) {
    for (const t of w.terrain) {
      const b = t.body;
      const { min, max } = b.bounds;
      const bw = max.x - min.x, bh = max.y - min.y;
      switch (t.style) {
        case 'ground':
        case 'islet': {
          ctx.fillStyle = '#b9a58a';
          ctx.fillRect(min.x, min.y, bw, bh);
          ctx.strokeStyle = 'rgba(90,70,50,0.25)';
          ctx.lineWidth = 2;
          for (let y = min.y + 22; y < max.y; y += 18) {
            ctx.beginPath();
            ctx.moveTo(min.x, y);
            ctx.lineTo(max.x, y);
            ctx.stroke();
          }
          ctx.fillStyle = '#6fbf5a';
          ctx.fillRect(min.x, min.y, bw, 9);
          ctx.fillStyle = '#58a447';
          ctx.fillRect(min.x, min.y + 7, bw, 3);
          // Zone floors
          if (t.style === 'ground') {
            ctx.fillStyle = '#d8b98a';
            ctx.fillRect(-1500, -1, 620, 10); // gym wood
            ctx.fillStyle = '#c4ccd6';
            ctx.fillRect(-880, -1, 580, 10); // hallway tile
            ctx.fillStyle = '#e8d8c0';
            ctx.fillRect(470, -1, 680, 10); // cafeteria tile
          }
          break;
        }
        case 'step':
          ctx.fillStyle = '#a98f6e';
          ctx.fillRect(min.x, min.y, bw, bh);
          ctx.fillStyle = '#c9ad88';
          ctx.fillRect(min.x, min.y, bw, 5);
          break;
        case 'ledge':
          ctx.fillStyle = '#c7a27a';
          ctx.fillRect(min.x, min.y, bw, bh);
          ctx.fillStyle = '#e0bf95';
          ctx.fillRect(min.x, min.y, bw, 4);
          break;
        case 'cloud': {
          ctx.fillStyle = 'rgba(255,255,255,0.96)';
          ctx.beginPath();
          for (let x = min.x + 12; x < max.x; x += 26) {
            ctx.moveTo(x + 18, min.y + 8);
            ctx.arc(x, min.y + 8, 18, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.fillRect(min.x, min.y + 4, bw, bh);
          break;
        }
        case 'rim':
          ctx.fillStyle = '#ff7a2e';
          ctx.beginPath();
          ctx.arc(b.position.x, b.position.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ff7a2e';
          ctx.lineWidth = 3;
          if (b.position.x < -1040) {
            ctx.beginPath();
            ctx.moveTo(-1060, -236);
            ctx.lineTo(-1020, -236);
            ctx.stroke();
          }
          break;
        case 'board':
          ctx.fillStyle = '#f4f4f4';
          ctx.fillRect(min.x, min.y, bw, bh);
          ctx.strokeStyle = '#d33';
          ctx.lineWidth = 2;
          ctx.strokeRect(min.x + 1, min.y + 22, bw - 2, 20);
          break;
        case 'post':
          ctx.fillStyle = '#7a7f8a';
          ctx.fillRect(min.x, min.y, bw, bh);
          break;
      }
    }
  }

  private markers(ctx: CanvasRenderingContext2D, w: World) {
    // Respawn pad
    const t = w.time;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(PAD.x, PAD.y + 2, 52, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(122,247,255,${0.5 + 0.3 * Math.sin(t * 3)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(PAD.x, PAD.y + 2, 44, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Intake socket
    const col = w.core.mode === 'off' ? '#ff5a4a' : w.core.mode === 'over' ? '#c9a2ff' : '#7af7ff';
    ctx.fillStyle = '#2a3448';
    roundRect(ctx, INTAKE.x - 30, -4, 60, 12, 4);
    ctx.fill();
    ctx.fillStyle = shade(toHex(col), 0, 0.6 + 0.3 * Math.sin(t * 5));
    roundRect(ctx, INTAKE.x - 20, -2, 40, 6, 3);
    ctx.fill();
    const hasCell = w.props.some((p) => p.type === 'cell');
    if (hasCell) {
      ctx.strokeStyle = shade('#7af7ff', 0, 0.35 + 0.25 * Math.sin(t * 6));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(INTAKE.x - 10, -40);
      ctx.lineTo(INTAKE.x, -22);
      ctx.lineTo(INTAKE.x + 10, -40);
      ctx.stroke();
    }
    // Slick puddles
    for (const s of w.slicks) {
      const a = clamp(s.life / 1.2, 0, 1) * 0.75;
      ctx.fillStyle = `rgba(150,120,255,${a})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y - 1, s.w / 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${a * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(s.x - s.w * 0.15, s.y - 3, s.w * 0.18, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Beacons
    for (const b of w.beacons) {
      const a = clamp(b.life / 1, 0, 1);
      const r = 70 + 8 * Math.sin(w.time * 5);
      const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, r);
      g.addColorStop(0, `rgba(255,250,200,${0.95 * a})`);
      g.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private vine(ctx: CanvasRenderingContext2D, w: World, kind: 'lash' | 'root', ends: [Vec, Vec], life: number) {
    const [a, b] = ends;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const segs = Math.max(6, Math.floor(len / 18));
    const pts: Vec[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const wob = Math.sin(t * Math.PI * (kind === 'root' ? 5 : 3) + w.time * 6) * 5 * Math.sin(t * Math.PI);
      pts.push({ x: a.x + dx * t + nx * wob, y: a.y + dy * t + ny * wob });
    }
    ctx.globalAlpha = clamp(life * 3, 0, 1);
    ctx.strokeStyle = '#2f7d3c';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.strokeStyle = '#4fc263';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#5fd273';
    for (let i = 2; i < pts.length - 1; i += 2) {
      const p = pts[i];
      ctx.beginPath();
      ctx.ellipse(p.x + nx * 5, p.y + ny * 5, 6, 3, Math.atan2(ny, nx) + (i % 4 ? 0.6 : -0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private prop(ctx: CanvasRenderingContext2D, w: World, p: Prop) {
    const b = p.body;
    let color = p.color;
    if (p.charred > 0) color = toHex(mix(p.color, '#2a2220', p.charred * 0.75));
    if (p.frozenT > 0) color = mix(color, '#cfefff', 0.55);
    const parts = b.parts.length > 1 ? b.parts.slice(1) : [b];
    if (p.type === 'cell') {
      const g = ctx.createRadialGradient(b.position.x, b.position.y, 2, b.position.x, b.position.y, 44);
      g.addColorStop(0, 'rgba(122,247,255,0.7)');
      g.addColorStop(1, 'rgba(122,247,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, 44, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const part of parts) {
      ctx.beginPath();
      const v = part.vertices;
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,10,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    const s = p.scale;
    ctx.strokeStyle = 'rgba(40,25,10,0.4)';
    ctx.lineWidth = 2;
    if (p.type === 'crate') {
      ctx.strokeRect(-15 * s, -15 * s, 30 * s, 30 * s);
      ctx.beginPath();
      ctx.moveTo(-15 * s, -15 * s);
      ctx.lineTo(15 * s, 15 * s);
      ctx.stroke();
    } else if (p.type === 'ball' || p.type === 'dodgeball') {
      const r = (p.type === 'ball' ? 17 : 10) * s;
      ctx.strokeStyle = 'rgba(40,20,10,0.55)';
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.stroke();
    } else if (p.type === 'dummy') {
      ctx.fillStyle = '#d2463a';
      ctx.beginPath();
      ctx.arc(0, -12 * s, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, -12 * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'cell') {
      ctx.fillStyle = '#e8ffff';
      roundRect(ctx, -4 * s, -9 * s, 8 * s, 18 * s, 3);
      ctx.fill();
    } else if (p.type === 'mat') {
      ctx.beginPath();
      ctx.moveTo(-20 * s, -6 * s);
      ctx.lineTo(-20 * s, 6 * s);
      ctx.moveTo(20 * s, -6 * s);
      ctx.lineTo(20 * s, 6 * s);
      ctx.stroke();
    }
    ctx.restore();
    if (p.frozenT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.bounds.min.x + 3, b.bounds.min.y + 6);
      ctx.lineTo(b.bounds.min.x + 9, b.bounds.min.y + 2);
      ctx.stroke();
    }
  }

  private iceWall(ctx: CanvasRenderingContext2D, b: Matter.Body, w: number, h: number, life: number) {
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.globalAlpha = clamp(life * 4, 0.25, 1);
    ctx.fillStyle = 'rgba(180,230,255,0.72)';
    roundRect(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6, -h / 2 + 8);
    ctx.lineTo(-w / 2 + 12, -h / 2 + 22);
    ctx.moveTo(w / 2 - 8, h / 2 - 20);
    ctx.lineTo(w / 2 - 14, h / 2 - 8);
    ctx.stroke();
    ctx.restore();
  }

  private projectile(ctx: CanvasRenderingContext2D, b: Matter.Body, kind: 'fireball' | 'spark') {
    const { x, y } = b.position;
    const r = kind === 'fireball' ? 20 : 12;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    if (kind === 'fireball') {
      g.addColorStop(0, '#fff6c0');
      g.addColorStop(0.35, '#ffb02e');
      g.addColorStop(1, 'rgba(255,80,20,0)');
    } else {
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(1, 'rgba(255,210,100,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ------------------------------------------------------------------ actors

  private actor(ctx: CanvasRenderingContext2D, w: World, a: Actor) {
    const b = a.body;
    const col = a.def.color;
    // Motion ghosts
    a.trail.forEach((t, i) => {
      ctx.globalAlpha = 0.06 * (i + 1);
      ctx.fillStyle = a.cometT > 0 ? '#ffd27a' : col;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.a);
      if (a.dims.round || a.cometT > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, a.dims.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        roundRect(ctx, -a.dims.w / 2, -a.dims.h / 2, a.dims.w, a.dims.h, a.dims.w * 0.45);
        ctx.fill();
      }
      ctx.restore();
    });
    ctx.globalAlpha = 1;

    if (a.cometT > 0) {
      const g = ctx.createRadialGradient(b.position.x, b.position.y, 2, b.position.x, b.position.y, 34);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.4, '#ffc94a');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, 34, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.form === 'puddle') this.puddle(ctx, a);
    else if (a.form === 'guinea') this.guinea(ctx, a);
    else if (a.form === 'rock') this.boulder(ctx, a);
    else this.humanoid(ctx, w, a);

    // Stretchy arm (Lash)
    if (a.armT > 0 && a.arm) {
      const h = a.hand();
      ctx.strokeStyle = shade(col, -0.1);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      const mx = (h.x + a.arm.x) / 2, my = (h.y + a.arm.y) / 2 + Math.sin(w.time * 30) * 6;
      ctx.quadraticCurveTo(mx, my, a.arm.x, a.arm.y);
      ctx.stroke();
      ctx.fillStyle = a.skin;
      ctx.beginPath();
      ctx.arc(a.arm.x, a.arm.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    const topY = b.bounds.min.y;
    if (a.frozenT > 0) {
      const pad = 6;
      ctx.fillStyle = 'rgba(190,235,255,0.5)';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      roundRect(ctx, b.bounds.min.x - pad, b.bounds.min.y - pad, b.bounds.max.x - b.bounds.min.x + pad * 2, b.bounds.max.y - b.bounds.min.y + pad * 2, 5);
      ctx.fill();
      ctx.stroke();
    }
    if (a.dazeT > 0) {
      ctx.fillStyle = '#fff6a0';
      for (let i = 0; i < 3; i++) {
        const ang = w.time * 5 + (i * Math.PI * 2) / 3;
        star(ctx, b.position.x + Math.cos(ang) * 14, topY - 8 + Math.sin(ang) * 4, 4);
      }
    }
    if (a.isPossessed()) {
      const bob = Math.sin(w.time * 4) * 3;
      ctx.fillStyle = '#7af7ff';
      ctx.beginPath();
      ctx.moveTo(b.position.x - 8, topY - 28 + bob);
      ctx.lineTo(b.position.x + 8, topY - 28 + bob);
      ctx.lineTo(b.position.x, topY - 18 + bob);
      ctx.fill();
      label(ctx, a.def.name, b.position.x, topY - 34 + bob, '#eaffff');
    }
  }

  private humanoid(ctx: CanvasRenderingContext2D, w: World, a: Actor) {
    const b = a.body;
    const { w: bw, h } = a.dims;
    const col = a.def.color;
    const dark = shade(col, -0.38);
    const baby = a.babyT > 0;
    const f = a.facing;
    const v = b.velocity;
    const flying = a.canFly() && !a.grounded && a.tumbleT <= 0;
    const headR = h * (baby ? 0.2 : 0.14);
    const top = -h / 2;
    const headY = top + headR + 1;
    const shoulderY = top + headR * 2 + h * 0.03;
    const hipY = h * 0.12;
    const footY = h / 2 - 1;
    const moving = a.grounded ? clamp(Math.abs(v.x) / 3, 0, 1) : 0.25;
    const sw = Math.sin(a.walk) * moving;
    const lean = flying ? clamp(v.x * 0.045, -0.55, 0.55) : clamp(v.x * 0.01, -0.12, 0.12);

    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle + lean);

    // Role silhouettes (all original shapes).
    if (a.def.role === 'hero') {
      const flap = Math.sin(w.time * 9) * 4 + clamp(Math.abs(v.x) * 2.2, 0, 16);
      ctx.fillStyle = shade(col, -0.2);
      ctx.beginPath();
      ctx.moveTo(-bw * 0.42, shoulderY);
      ctx.lineTo(bw * 0.42, shoulderY);
      ctx.lineTo(-f * (bw * 0.3 + flap), footY - h * 0.08);
      ctx.lineTo(-f * (bw * 0.05 + flap * 0.5), footY - h * 0.02);
      ctx.closePath();
      ctx.fill();
    }

    // Legs
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark;
    ctx.lineWidth = bw * 0.27;
    ctx.beginPath();
    if (flying) {
      ctx.moveTo(-bw * 0.1, hipY);
      ctx.lineTo(-f * bw * 0.28, footY);
      ctx.moveTo(bw * 0.1, hipY);
      ctx.lineTo(-f * bw * 0.12, footY - 2);
    } else {
      const reach = (footY - hipY) * 0.55;
      ctx.moveTo(-bw * 0.14, hipY);
      ctx.lineTo(-bw * 0.14 + sw * reach, footY - Math.max(0, -sw) * 3);
      ctx.moveTo(bw * 0.14, hipY);
      ctx.lineTo(bw * 0.14 - sw * reach, footY - Math.max(0, sw) * 3);
    }
    ctx.stroke();

    // Back arm
    ctx.strokeStyle = shade(col, -0.15);
    ctx.lineWidth = bw * 0.22;
    ctx.beginPath();
    ctx.moveTo(-f * bw * 0.3, shoulderY + 3);
    ctx.lineTo(-f * bw * 0.3 - sw * h * 0.18, shoulderY + h * 0.3);
    ctx.stroke();

    // Torso
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.5, shoulderY);
    ctx.lineTo(bw * 0.5, shoulderY);
    ctx.lineTo(bw * 0.38, hipY + h * 0.05);
    ctx.lineTo(-bw * 0.38, hipY + h * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(-bw * 0.38, hipY, bw * 0.76, h * 0.04);

    if (a.def.role === 'villain') {
      ctx.fillStyle = dark;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * bw * 0.5, shoulderY);
        ctx.lineTo(s * bw * 0.72, shoulderY - h * 0.07);
        ctx.lineTo(s * bw * 0.28, shoulderY);
        ctx.fill();
      }
      ctx.fillStyle = shade(col, 0.35);
      ctx.beginPath();
      ctx.moveTo(-bw * 0.12, shoulderY + 2);
      ctx.lineTo(bw * 0.12, shoulderY + 2);
      ctx.lineTo(0, shoulderY + h * 0.12);
      ctx.fill();
    } else if (a.def.role === 'sidekick') {
      ctx.fillStyle = shade(col, 0.4);
      ctx.fillRect(-bw * 0.45, shoulderY - 1, bw * 0.9, h * 0.05);
      ctx.beginPath();
      ctx.moveTo(-f * bw * 0.3, shoulderY);
      ctx.lineTo(-f * (bw * 0.75 + Math.abs(v.x) * 2), shoulderY + h * 0.06 + Math.sin(w.time * 10) * 2);
      ctx.lineTo(-f * bw * 0.3, shoulderY + h * 0.06);
      ctx.fill();
    } else if (a.def.role === 'faculty') {
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.moveTo(-bw * 0.14, shoulderY);
      ctx.lineTo(bw * 0.14, shoulderY);
      ctx.lineTo(0, shoulderY + h * 0.08);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-bw * 0.05, shoulderY + h * 0.03);
      ctx.lineTo(bw * 0.05, shoulderY + h * 0.03);
      ctx.lineTo(bw * 0.07, shoulderY + h * 0.2);
      ctx.lineTo(0, shoulderY + h * 0.24);
      ctx.lineTo(-bw * 0.07, shoulderY + h * 0.2);
      ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(f * bw * 0.16 - bw * 0.08, shoulderY + h * 0.06, bw * 0.16, h * 0.06);
    }
    if (a.def.role === 'hero') {
      ctx.fillStyle = shade(col, 0.45);
      ctx.beginPath();
      ctx.arc(0, shoulderY + h * 0.12, bw * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head
    ctx.fillStyle = a.skin;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    // Hair (four generic styles)
    ctx.fillStyle = a.hair;
    ctx.beginPath();
    switch (a.hairStyle) {
      case 0: // spikes
        for (let i = -2; i <= 2; i++) {
          ctx.moveTo(i * headR * 0.38 - headR * 0.2, headY - headR * 0.55);
          ctx.lineTo(i * headR * 0.38 - f * headR * 0.2, headY - headR * 1.35);
          ctx.lineTo(i * headR * 0.38 + headR * 0.2, headY - headR * 0.55);
        }
        ctx.rect(-headR, headY - headR * 0.75, headR * 2, headR * 0.3);
        break;
      case 1: // bob
        ctx.arc(0, headY - headR * 0.1, headR * 1.08, Math.PI * 0.95, Math.PI * 2.05);
        ctx.rect(-f * headR * 1.08 - (f > 0 ? 0 : -headR * 0.6) - headR * 0.3, headY - headR * 0.2, headR * 0.6, headR * 1.1);
        break;
      case 2: // bun
        ctx.arc(0, headY - headR * 0.15, headR * 1.02, Math.PI, Math.PI * 2);
        ctx.moveTo(-f * headR * 0.4 + headR * 0.5, headY - headR * 1.2);
        ctx.arc(-f * headR * 0.4, headY - headR * 1.2, headR * 0.5, 0, Math.PI * 2);
        break;
      default: // flat cap
        ctx.rect(-headR * 1.05, headY - headR * 1.05, headR * 2.1, headR * 0.6);
        ctx.rect(f > 0 ? 0 : -headR * 1.6, headY - headR * 0.55, headR * 1.6, headR * 0.16);
    }
    ctx.fill();
    // Eyes
    const blink = (w.time + a.id * 1.7) % 4 < 0.12;
    ctx.fillStyle = '#1b1b24';
    for (const e of [0.1, 0.55]) {
      const ex = f * headR * e, ey = headY - headR * 0.05;
      if (blink) ctx.fillRect(ex - 2, ey, 4, 1.5);
      else {
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(1.5, headR * 0.13), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (baby) {
      ctx.fillStyle = '#ff8fcf';
      ctx.beginPath();
      ctx.arc(f * headR * 0.45, headY + headR * 0.45, headR * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    // Front arm: points at aim when possessed / holding / casting.
    const aimed = a.isPossessed() || a.holding || a.armT > 0;
    ctx.strokeStyle = col;
    ctx.lineWidth = bw * 0.22;
    ctx.beginPath();
    const sx = f * bw * 0.3, sy = shoulderY + 3;
    ctx.moveTo(sx, sy);
    if (aimed && a.armT <= 0) {
      const d = a.aimDir();
      const ang = Math.atan2(d.y, d.x) - b.angle - lean;
      const L = h * 0.33;
      ctx.lineTo(sx + Math.cos(ang) * L, sy + Math.sin(ang) * L);
      ctx.stroke();
      ctx.fillStyle = a.skin;
      ctx.beginPath();
      ctx.arc(sx + Math.cos(ang) * L, sy + Math.sin(ang) * L, bw * 0.13, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.armT <= 0) {
      ctx.lineTo(sx + sw * h * 0.18, sy + h * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  private puddle(ctx: CanvasRenderingContext2D, a: Actor) {
    const b = a.body;
    const { w, h } = a.dims;
    const wob = Math.sin(a.world.time * 8 + a.id) * 2;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.fillStyle = shade(a.def.color, 0.15, 0.9);
    ctx.beginPath();
    ctx.ellipse(0, h * 0.1, w / 2 + wob, h / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.15, -h * 0.05, w * 0.18, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (const e of [0.12, 0.3]) {
      ctx.beginPath();
      ctx.arc(a.facing * w * e, -h * 0.12, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1b1b24';
    for (const e of [0.12, 0.3]) {
      ctx.beginPath();
      ctx.arc(a.facing * w * e + a.facing, -h * 0.12, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private guinea(ctx: CanvasRenderingContext2D, a: Actor) {
    const b = a.body;
    const { w, h } = a.dims;
    const f = a.facing;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = '#d9b48a';
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a.def.color;
    ctx.beginPath();
    ctx.ellipse(-f * w * 0.15, -h * 0.1, w * 0.25, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b58a62';
    ctx.beginPath();
    ctx.arc(f * w * 0.18, -h * 0.42, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1b24';
    ctx.beginPath();
    ctx.arc(f * w * 0.32, -h * 0.12, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2a0b0';
    ctx.beginPath();
    ctx.arc(f * w * 0.48, h * 0.02, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private boulder(ctx: CanvasRenderingContext2D, a: Actor) {
    const b = a.body;
    const r = a.dims.w / 2;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.save();
    ctx.rotate(b.angle);
    ctx.fillStyle = '#8a7f70';
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      const rr = r * (0.92 + 0.08 * Math.sin(i * 2.7));
      i ? ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.2);
    ctx.lineTo(-r * 0.1, r * 0.1);
    ctx.lineTo(r * 0.2, -r * 0.3);
    ctx.moveTo(r * 0.1, r * 0.5);
    ctx.lineTo(r * 0.4, r * 0.25);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#1b1b24';
    for (const e of [0.15, 0.45]) {
      ctx.beginPath();
      ctx.arc(a.facing * r * e, -r * 0.3, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ fx + overlays

  private fx(ctx: CanvasRenderingContext2D, w: World) {
    const fx = w.fx;
    for (const p of fx.parts) {
      const t = p.life / p.max;
      ctx.globalAlpha = clamp(t * 1.4, 0, 1);
      ctx.fillStyle = p.color;
      if (p.kind === 'shard' || p.kind === 'leaf') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === 'leaf') {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'star') {
        star(ctx, p.x, p.y, p.size);
      } else if (p.kind === 'bubble') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const r of fx.rings) {
      const t = 1 - r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(t), r.a0, r.a1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const bm of fx.beams) {
      const t = bm.life / bm.max;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = t * 0.45;
      ctx.strokeStyle = bm.glow;
      ctx.lineWidth = bm.width * 3;
      polyline(ctx, bm.pts);
      ctx.globalAlpha = t;
      ctx.strokeStyle = bm.color;
      ctx.lineWidth = bm.width;
      polyline(ctx, bm.pts);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1, bm.width * 0.35);
      polyline(ctx, bm.pts);
    }
    ctx.globalAlpha = 1;
    for (const f of fx.floaters) {
      ctx.globalAlpha = clamp(f.life / f.max * 2, 0, 1);
      label(ctx, f.text, f.x, f.y, f.color);
    }
    ctx.globalAlpha = 1;
  }

  private xray(ctx: CanvasRenderingContext2D, w: World, cam: Camera, dpr: number) {
    const k = clamp(w.xrayT, 0, 1);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(6,22,60,${0.55 * k})`;
    ctx.fillRect(0, 0, cam.w, cam.h);
    ctx.restore();
    ctx.globalAlpha = k;
    ctx.strokeStyle = '#8fd8ff';
    ctx.lineWidth = 1.5;
    for (const p of w.props) {
      const parts = p.body.parts.length > 1 ? p.body.parts.slice(1) : [p.body];
      for (const part of parts) {
        ctx.beginPath();
        part.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        ctx.stroke();
      }
    }
    for (const a of w.actors) {
      if (a.dead) continue;
      const b = a.body;
      const { h } = a.dims;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      ctx.strokeStyle = '#e8f6ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (a.dims.round) {
        ctx.arc(0, 0, a.dims.w * 0.3, 0, Math.PI * 2);
      } else {
        ctx.arc(0, -h * 0.34, h * 0.11, 0, Math.PI * 2);
        ctx.moveTo(0, -h * 0.22);
        ctx.lineTo(0, h * 0.12);
        for (let i = 0; i < 3; i++) {
          ctx.moveTo(-h * 0.1, -h * 0.15 + i * h * 0.07);
          ctx.lineTo(h * 0.1, -h * 0.15 + i * h * 0.07);
        }
        ctx.moveTo(0, h * 0.12);
        ctx.lineTo(-h * 0.08, h * 0.48);
        ctx.moveTo(0, h * 0.12);
        ctx.lineTo(h * 0.08, h * 0.48);
      }
      ctx.stroke();
      ctx.restore();
      label(ctx, a.def.name, b.position.x, b.bounds.min.y - 10, '#bfe8ff');
    }
    for (const m of w.machines) {
      if (!m.hasCell) continue;
      ctx.strokeStyle = '#7af7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y - m.h * 0.6, 34 + 6 * Math.sin(w.time * 6), 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, 'power cell', m.x, m.y - m.h - 14, '#7af7ff');
    }
    ctx.strokeStyle = 'rgba(255,220,120,0.8)';
    ctx.lineWidth = 2;
    for (const b of w.dynamicBodies()) {
      if (b.speed < 1) continue;
      ctx.beginPath();
      ctx.moveTo(b.position.x, b.position.y);
      ctx.lineTo(b.position.x + b.velocity.x * 6, b.position.y + b.velocity.y * 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private reticle(ctx: CanvasRenderingContext2D, w: World, m: Vec) {
    const me = w.possessed;
    if (!me || me.dead) return;
    const h = me.hand();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([4, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
    ctx.moveTo(m.x - 15, m.y);
    ctx.lineTo(m.x - 5, m.y);
    ctx.moveTo(m.x + 5, m.y);
    ctx.lineTo(m.x + 15, m.y);
    ctx.stroke();
    // Name of whoever is under the cursor.
    for (const a of w.actors) {
      if (a.dead || a === me) continue;
      const bb = a.body.bounds;
      if (m.x > bb.min.x - 6 && m.x < bb.max.x + 6 && m.y > bb.min.y - 6 && m.y < bb.max.y + 6) {
        label(ctx, a.def.name, a.pos.x, bb.min.y - 14, '#fff');
        break;
      }
    }
  }

  private debug(ctx: CanvasRenderingContext2D, w: World) {
    const bodies = Composite.allBodies(w.engine.world);
    ctx.lineWidth = 1.2;
    for (const b of bodies) {
      const t = tagOf(b);
      ctx.strokeStyle = b.isSensor ? '#ff0' : b.isStatic ? '#9aa' : t?.kind === 'actor' ? '#0ff' : t?.kind === 'proj' ? '#f80' : '#f0f';
      if (b.isSensor) ctx.setLineDash([4, 4]);
      const parts = b.parts.length > 1 ? b.parts.slice(1) : [b];
      for (const p of parts) {
        ctx.beginPath();
        p.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (!b.isStatic) {
        ctx.strokeStyle = '#ff5';
        ctx.beginPath();
        ctx.moveTo(b.position.x, b.position.y);
        ctx.lineTo(b.position.x + b.velocity.x * 6, b.position.y + b.velocity.y * 6);
        ctx.stroke();
        ctx.fillStyle = '#ff5';
        ctx.fillRect(b.position.x - 1.5, b.position.y - 1.5, 3, 3);
      }
    }
    ctx.strokeStyle = '#7f7';
    for (const c of Composite.allConstraints(w.engine.world)) {
      const a = c.bodyA ? { x: c.bodyA.position.x + c.pointA.x, y: c.bodyA.position.y + c.pointA.y } : c.pointA;
      const b = c.bodyB ? { x: c.bodyB.position.x + c.pointB.x, y: c.bodyB.position.y + c.pointB.y } : c.pointB;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const a of w.actors) {
      if (a.dead) continue;
      ctx.fillStyle = a.grounded ? '#0f0' : '#f44';
      ctx.fillRect(a.pos.x - 3, a.body.bounds.max.y + 2, 6, 3);
    }
    ctx.strokeStyle = 'rgba(255,60,60,0.7)';
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(-3000, FALL_Y);
    ctx.lineTo(3000, FALL_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'fall volume', 0, FALL_Y - 8, '#ff8080');
  }

  private debugText(ctx: CanvasRenderingContext2D, w: World, fps: number) {
    const g = w.engine.gravity;
    const lines = [
      `fps ${fps.toFixed(0)}`,
      `bodies ${Composite.allBodies(w.engine.world).length}  constraints ${Composite.allConstraints(w.engine.world).length}`,
      `actors ${w.actors.length}  props ${w.props.length}  projectiles ${w.projectiles.length}  particles ${w.fx.parts.length}`,
      `gravity (${g.x.toFixed(2)}, ${g.y.toFixed(2)})  core ${w.core.mode}`,
    ];
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(10, 56, 420, lines.length * 16 + 10);
    ctx.fillStyle = '#d6ffd6';
    lines.forEach((l, i) => ctx.fillText(l, 18, 74 + i * 16));
  }
}

// ------------------------------------------------------------------ small helpers

function toHex(c: string) {
  if (c.startsWith('#')) return c;
  const m = c.match(/\d+(\.\d+)?/g);
  if (!m) return '#ffffff';
  return '#' + m.slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('');
}

function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function polyline(ctx: CanvasRenderingContext2D, pts: Vec[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(10,16,30,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}
