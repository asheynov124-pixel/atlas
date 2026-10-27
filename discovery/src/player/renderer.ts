/**
 * Procedural clip renderer.
 *
 * Stands in for real video in the mock: every visual property is derived
 * from the clip's embedding (and its performers' face/body vectors), so what
 * you see *is* what similarity search compares. Abstract, luminous forms —
 * no imagery — but legible enough to circle "the face" vs. "the lighting".
 */
import { type FacetWeights, type Performer, type VideoSummary } from '../data/types';
import { facetSlice } from '../lib/vec';
import { mulberry32 } from '../lib/prng';
import { COMP, POSE } from '../data/mock/taxonomy';

interface Figure {
  x: number;
  y: number;
  scale: number;
  w: number;
  h: number;
  hue: number;
  hairHue: number;
  hairLight: number;
  phase: number;
  reclined: boolean;
}

export interface VisualParams {
  id: string;
  bgHue: number;
  bgHue2: number;
  bgSat: number;
  bgLight: number;
  angle: number;
  blobs: { hue: number; r: number; ox: number; oy: number; fx: number; fy: number; phase: number; a: number }[];
  figures: Figure[];
  zoom: number;
  speed: number;
  swayAmp: number;
  swayFreq: number;
  tilt: number;
  grain: number;
  mono: boolean;
  neon: boolean;
  vintage: boolean;
  clip: number;
  /** CSS filter to apply on the canvas element. */
  cssFilter: string;
}

const cache = new Map<string, VisualParams>();

export function visualParams(v: VideoSummary, performers?: (Performer | undefined)[]): VisualParams {
  const hit = cache.get(v.id);
  if (hit) return hit;
  const rng = mulberry32(v.thumbnail.kind === 'procedural' ? v.thumbnail.seed : v.id.length * 7919);
  const face = facetSlice(v.embedding, 'face');
  const body = facetSlice(v.embedding, 'body');
  const pose = facetSlice(v.embedding, 'pose');
  const comp = facetSlice(v.embedding, 'composition');

  const warm = comp[COMP.warmth];
  const cool = comp[COMP.cool];
  const bgHue = warm >= cool ? 18 + 22 * (1 - Math.min(1, warm)) : 205 + 35 * Math.min(1, cool);
  const sat = comp[COMP.sat];
  const mono = v.tags.includes('black-and-white') || sat < -0.85;
  const neon = v.tags.includes('neon');
  const vintage = v.tags.includes('vintage') || comp[COMP.grain] > 0.75;

  const n = Math.max(1, Math.min(4, v.performerIds.length));
  const close = comp[COMP.close];
  const centred = comp[COMP.centred];
  const proximity = pose[POSE.proximity];
  const spread = pose[POSE.spread];
  const reclined = pose[POSE.vertical] < -0.35;
  const cx = centred > -0.15 ? 0.5 : rng() < 0.5 ? 0.38 : 0.62;
  const gap = Math.max(0.1, 0.24 + 0.08 * spread - 0.09 * proximity);

  const figures: Figure[] = [];
  for (let i = 0; i < n; i++) {
    const p = performers?.[i];
    const f = p ? p.face : face;
    const b = p ? p.body : body;
    const hue = ((Math.atan2(f[1], f[0]) * 180) / Math.PI + 360) % 360;
    const offset = (i - (n - 1) / 2) * gap;
    figures.push({
      x: cx + offset,
      y: reclined ? 0.68 : 0.6 - 0.05 * pose[POSE.vertical],
      scale: (1 + 0.42 * close) * (1 + 0.2 * b[0]) * (n > 2 ? 0.82 : 1),
      w: 1 + 0.38 * b[1],
      h: 1 + 0.22 * b[2],
      hue,
      hairHue: f[3] > 0.6 ? 14 : f[3] < -0.4 ? 290 : 34,
      hairLight: 38 + 26 * f[2],
      phase: rng() * Math.PI * 2,
      reclined,
    });
  }

  const blobs = Array.from({ length: 4 }, (_, i) => ({
    hue: i % 2 ? figures[0].hue : bgHue + (rng() - 0.5) * 40,
    r: 0.35 + rng() * 0.35,
    ox: rng(),
    oy: rng(),
    fx: 0.05 + rng() * 0.12,
    fy: 0.04 + rng() * 0.1,
    phase: rng() * Math.PI * 2,
    a: 0.18 + rng() * 0.18,
  }));

  const energy = pose[POSE.energy];
  const params: VisualParams = {
    id: v.id,
    bgHue,
    bgHue2: (bgHue + 30 + 25 * cool) % 360,
    bgSat: Math.max(8, Math.min(92, 46 + 34 * sat)),
    bgLight: Math.max(5, Math.min(36, 17 + 13 * comp[COMP.bright])),
    angle: rng() * Math.PI,
    blobs,
    figures,
    zoom: 1 + Math.max(0, close) * 0.15,
    speed: Math.max(0.25, 0.65 + 0.3 * comp[COMP.motion] + 0.25 * energy),
    swayAmp: 0.05 + 0.09 * Math.max(0, pose[POSE.amp] + 0.5),
    swayFreq: 0.35 + 0.35 * Math.max(0, pose[POSE.freq] + 0.6),
    tilt: 0.18 * pose[POSE.tilt],
    grain: Math.max(0, Math.min(1, 0.15 + 0.5 * comp[COMP.grain])),
    mono,
    neon,
    vintage,
    clip: v.clipDuration,
    cssFilter: mono ? 'grayscale(1) contrast(1.12)' : vintage ? 'sepia(0.38) saturate(0.85)' : 'none',
  };
  if (cache.size > 600) cache.delete(cache.keys().next().value!);
  cache.set(v.id, params);
  return params;
}

let noise: HTMLCanvasElement | null = null;
function noiseCanvas(): HTMLCanvasElement {
  if (noise) return noise;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(96, 96);
  const rng = mulberry32(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = Math.floor(rng() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noise = c;
  return c;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Figure geometry at time t. x values are fractions of width, y of height;
 * torsoW/headR are fractions of width, torsoH a fraction of height.
 */
function figureGeometry(p: VisualParams, t: number, aspect: number) {
  const time = t * p.speed;
  return p.figures.map((f, i) => {
    const sway = p.tilt + Math.sin(time * p.swayFreq * Math.PI * 2 + f.phase) * p.swayAmp;
    const bob = Math.sin(time * p.swayFreq * Math.PI * 4 + f.phase) * 0.008 * (1 + p.swayAmp * 5);
    const s = f.scale * p.zoom;
    const torsoH = 0.24 * s * f.h;
    const torsoW = 0.105 * s * f.w;
    const headR = 0.07 * s;
    const lean = (i - (p.figures.length - 1) / 2) * -0.05;
    const angle = (f.reclined ? Math.PI / 2.3 : 0) + sway + lean;
    const baseX = f.x + Math.sin(time * 0.21 + f.phase) * 0.01;
    const baseY = f.y + bob;
    // Head sits above the torso along the figure's axis (distance in px / W and px / H).
    const distW = torsoH * aspect * 0.6 + headR * 1.1;
    const distH = torsoH * 0.6 + (headR * 1.1) / aspect;
    const headX = baseX + Math.sin(angle) * distW;
    const headY = baseY - Math.cos(angle) * distH;
    return { f, angle, baseX, baseY, torsoW, torsoH, headR, headX, headY };
  });
}

export function drawFrame(ctx: CanvasRenderingContext2D, p: VisualParams, t: number, W: number, H: number) {
  const aspect = H / W;
  const time = t * p.speed;
  const loopT = (t % p.clip) / p.clip;
  ctx.save();
  // Slow push-in over the clip.
  const push = 1 + 0.05 * loopT;
  ctx.translate(W / 2, H / 2);
  ctx.scale(push, push);
  ctx.translate(-W / 2, -H / 2);

  const gx = Math.cos(p.angle) * W;
  const gy = Math.sin(p.angle) * H;
  const bg = ctx.createLinearGradient(W / 2 - gx / 2, H / 2 - gy / 2, W / 2 + gx / 2, H / 2 + gy / 2);
  bg.addColorStop(0, `hsl(${p.bgHue} ${p.bgSat}% ${p.bgLight}%)`);
  bg.addColorStop(1, `hsl(${p.bgHue2} ${p.bgSat * 0.8}% ${Math.max(3, p.bgLight - 9)}%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(-W * 0.05, -H * 0.05, W * 1.1, H * 1.1);

  ctx.globalCompositeOperation = 'lighter';
  for (const b of p.blobs) {
    const x = (b.ox + Math.sin(time * b.fx * Math.PI * 2 + b.phase) * 0.18) * W;
    const y = (b.oy + Math.cos(time * b.fy * Math.PI * 2 + b.phase) * 0.14) * H;
    const r = b.r * Math.max(W, H) * 0.55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${b.hue} ${p.bgSat + 10}% 55% / ${b.a})`);
    g.addColorStop(1, `hsla(${b.hue} ${p.bgSat}% 40% / 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  if (p.neon) {
    ctx.lineWidth = Math.max(1.5, W * 0.006);
    for (let i = 0; i < 3; i++) {
      const hue = (p.figures[0].hue + i * 70 + time * 20) % 360;
      ctx.strokeStyle = `hsla(${hue} 100% 62% / 0.55)`;
      ctx.beginPath();
      const y = H * (0.18 + i * 0.3) + Math.sin(time * 0.7 + i) * H * 0.03;
      ctx.moveTo(-W * 0.1, y);
      ctx.bezierCurveTo(W * 0.3, y - H * 0.08, W * 0.7, y + H * 0.08, W * 1.1, y);
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  for (const g of figureGeometry(p, t, aspect)) {
    const { f } = g;
    // Torso.
    ctx.save();
    ctx.translate(g.baseX * W, g.baseY * H);
    ctx.rotate(g.angle);
    const tw = g.torsoW * W;
    const th = g.torsoH * H;
    const tg = ctx.createRadialGradient(0, -th * 0.1, tw * 0.1, 0, 0, th * 0.75);
    tg.addColorStop(0, `hsla(${f.hue} 80% 74% / 0.95)`);
    tg.addColorStop(0.55, `hsla(${f.hue} 70% 52% / 0.75)`);
    tg.addColorStop(1, `hsla(${f.hue} 70% 40% / 0)`);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(0, 0, tw, th * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Head with a halo and a hair cap.
    const hx = g.headX * W;
    const hy = g.headY * H;
    const hr = g.headR * W;
    const halo = ctx.createRadialGradient(hx, hy, hr * 0.4, hx, hy, hr * 2.6);
    halo.addColorStop(0, `hsla(${f.hue} 90% 70% / 0.45)`);
    halo.addColorStop(1, `hsla(${f.hue} 90% 60% / 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(hx, hy, hr * 2.6, 0, Math.PI * 2);
    ctx.fill();
    const head = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.3, hr * 0.1, hx, hy, hr);
    head.addColorStop(0, `hsla(${f.hue} 60% 86% / 1)`);
    head.addColorStop(1, `hsla(${f.hue} 60% 62% / 0.95)`);
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsla(${f.hairHue} 55% ${f.hairLight}% / 0.92)`;
    ctx.beginPath();
    ctx.arc(hx, hy, hr * 1.06, Math.PI * 1.02 + g.angle, Math.PI * 1.98 + g.angle);
    ctx.closePath();
    ctx.fill();
  }

  // Vignette.
  const vg = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (p.grain > 0.05) {
    ctx.save();
    ctx.globalAlpha = p.grain * 0.12;
    ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(noiseCanvas(), 'repeat');
    if (pat) {
      const ox = Math.floor((time * 977) % 96);
      ctx.translate(-ox, -ox);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W + 96, H + 96);
    }
    ctx.restore();
  }
  if (p.vintage) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  }
}

function overlap(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

/**
 * What did the user circle? Returns facet weights for a normalised region
 * plus a human label for the reasoning trace.
 */
export function hitTest(p: VisualParams, t: number, region: Box, aspect: number): { weights: FacetWeights; label: string } {
  const geo = figureGeometry(p, t, aspect);
  const area = Math.max(1e-4, region.w * region.h);
  let face = 0;
  let body = 0;
  let pose = 0;
  for (const g of geo) {
    const hr = g.headR;
    const head: Box = { x: g.headX - hr, y: g.headY - hr / aspect, w: hr * 2, h: (hr * 2) / aspect };
    const torso: Box = g.f.reclined
      ? { x: g.baseX - g.torsoH * 0.62 * aspect, y: g.baseY - g.torsoW / aspect, w: g.torsoH * 1.24 * aspect, h: (g.torsoW * 2) / aspect }
      : { x: g.baseX - g.torsoW, y: g.baseY - g.torsoH * 0.62, w: g.torsoW * 2, h: g.torsoH * 1.24 };
    const limbs: Box = { x: torso.x - torso.w * 0.6, y: torso.y - 0.03, w: torso.w * 2.2, h: torso.h + 0.1 };
    const fh = overlap(region, head);
    const tb = overlap(region, torso);
    face += fh;
    body += tb;
    pose += Math.max(0, overlap(region, limbs) - tb - fh);
  }
  // Space between figures reads as "how they're arranged".
  if (geo.length > 1) {
    const xs = geo.map((g) => g.baseX);
    const between: Box = { x: Math.min(...xs), y: 0.35, w: Math.max(...xs) - Math.min(...xs), h: 0.45 };
    pose += overlap(region, between) * 0.6;
  }
  const comp = Math.max(0, area - face - body - pose);
  const whole = area > 0.55 ? 1.6 : 1;
  const raw = { face: (face / area) * 1.7, body: (body / area) * 1.25, pose: (pose / area) * 1.1, composition: (comp / area) * 0.55 * whole };
  const sum = raw.face + raw.body + raw.pose + raw.composition || 1;
  const weights: FacetWeights = {
    face: raw.face / sum,
    body: raw.body / sum,
    pose: raw.pose / sum,
    composition: raw.composition / sum,
  };
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const v = cy < 0.36 ? 'upper' : cy > 0.66 ? 'lower' : 'middle';
  const h = cx < 0.36 ? 'left' : cx > 0.64 ? 'right' : 'centre';
  const top = (Object.entries(weights) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0];
  const part = area > 0.55 ? 'most of the frame' : top === 'face' ? 'a face' : top === 'body' ? 'a body' : top === 'pose' ? 'how they’re posed' : 'the background and light';
  return { weights, label: `the ${v} ${h} — ${part}` };
}

const thumbs = new Map<string, string>();
let thumbCanvas: HTMLCanvasElement | null = null;

/** Still frame as a data URL, cached. */
export function thumbnailURL(v: VideoSummary, performers: (Performer | undefined)[] | undefined, width = 180): string {
  const key = `${v.id}:${width}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const height = Math.round((width * 16) / 9);
  if (!thumbCanvas) thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = width;
  thumbCanvas.height = height;
  const ctx = thumbCanvas.getContext('2d');
  if (!ctx) return '';
  const p = visualParams(v, performers);
  drawFrame(ctx, p, p.clip * 0.35, width, height);
  let url = '';
  if (p.cssFilter !== 'none') {
    // Bake the CSS filter into the still so grids match the player.
    const tmp = document.createElement('canvas');
    tmp.width = width;
    tmp.height = height;
    const tctx = tmp.getContext('2d')!;
    if ('filter' in tctx) {
      tctx.filter = p.cssFilter;
      tctx.drawImage(thumbCanvas, 0, 0);
      url = tmp.toDataURL('image/jpeg', 0.72);
    }
  }
  if (!url) url = thumbCanvas.toDataURL('image/jpeg', 0.72);
  if (thumbs.size > 500) thumbs.delete(thumbs.keys().next().value!);
  thumbs.set(key, url);
  return url;
}

