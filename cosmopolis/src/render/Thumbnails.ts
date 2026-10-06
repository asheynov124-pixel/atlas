/**
 * OWNER: ui-core.
 * Thumbnails — 3D item portraits for the build menu, rendered with the game's own WebGLRenderer into an offscreen
 * multisampled render target: the item's real geometry (content/catalog getGeometry) with the shared building
 * material, a small studio scene (key + rim + sky light, soft room reflections), framed by its bounding box from a
 * 3/4 elevated angle, then composited over a 2D glass pedestal and cached as a PNG data URL.
 *
 *   thumbnailSignal(defId, { size: 'sm' | 'lg', style }) → ReadonlySignal<string | null>   (null until ready)
 *   hasThumbnailMesh(defId) → boolean       (zones / roads / tools have no mesh → use an icon instead)
 *   prewarmThumbnails(defIds)                queue portraits in the background (lowest priority)
 *   clearThumbnails(prefix?)                 drop cached portraits (e.g. after a custom building changed)
 *
 * Budget: at most one render per animation frame (≈ 2–4 ms on iPhone), pixels read back asynchronously through a
 * PBO when available. Every piece of renderer state touched (render target, clear colour/alpha, shared shader
 * uniforms) is saved and restored, so the main render never notices.
 */
import { signal, type ReadonlySignal, type Signal } from '@preact/signals';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getGeometry, getItem } from '../content/catalog';
import { FOOTPRINT_RADIUS } from '../content/kit';
import { bus } from '../core/events';
import type { StyleId } from '../core/types';
import { game } from '../game/instance';
import { getBuildingMaterial, shared } from './materials';

export interface ThumbOptions {
  /** 'sm' 160 px (cards) · 'lg' 320 px (detail sheet) */
  size?: 'sm' | 'lg';
  style?: StyleId;
  variant?: number;
  level?: number;
}

interface Job {
  key: string;
  defId: string;
  px: number;
  style: StyleId;
  variant: number;
  level: number;
  /** request time bucket (newest bucket first) */
  bucket: number;
  /** order within a bucket (oldest first → cards render top to bottom) */
  seq: number;
}
let seqCounter = 0;

const SIZES = { sm: 160, lg: 320 } as const;
const cache = new Map<string, Signal<string | null>>();
const queue: Job[] = [];
const failed = new Set<string>();

// ───────────────────────────────────────────── colour LUT: linear 8-bit → display sRGB with a gentle filmic toe
const LUT = new Uint8ClampedArray(256);
for (let i = 0; i < 256; i++) {
  let x = (i / 255) * 1.08;
  x = x / (1 + 0.06 * x); // soft shoulder
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  LUT[i] = Math.round(Math.min(1, s) * 255);
}

class ThumbStudio {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(22, 1, 0.05, 2000);
  readonly mesh: Mesh;
  private targets = new Map<number, WebGLRenderTarget>();
  private env: Texture | null = null;
  private envTried = false;
  private compiled = false;
  private objCanvas = document.createElement('canvas');
  private prevClear = new Color();
  private prevCenter = new Vector3();
  private sunDir = new Vector3();

  constructor() {
    const hemi = new HemisphereLight(0xdce9ff, 0x2a2440, 1.35);
    const key = new DirectionalLight(0xfff0dc, 2.7);
    key.position.set(-4, 7, 5);
    const rim = new DirectionalLight(0x8fe4ff, 2.2);
    rim.position.set(5, 3.5, -6);
    const fill = new DirectionalLight(0xb9a6ff, 0.6);
    fill.position.set(6, 1, 4);
    this.scene.add(hemi, key, rim, fill);
    this.mesh = new Mesh(new BufferGeometry(), getBuildingMaterial());
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  private target(px: number): WebGLRenderTarget {
    let t = this.targets.get(px);
    if (!t) {
      t = new WebGLRenderTarget(px, px, { samples: 4, depthBuffer: true });
      this.targets.set(px, t);
    }
    return t;
  }

  /** Soft room reflections for metal & glass — only on High/Ultra (PMREM costs a one-off shader compile). */
  private ensureEnv(r: WebGLRenderer): void {
    if (this.envTried) return;
    this.envTried = true;
    if ((game?.engine?.tier ?? 1) < 2) return;
    try {
      const pm = new PMREMGenerator(r);
      const room = new RoomEnvironment();
      this.env = pm.fromScene(room, 0.04).texture;
      room.dispose();
      pm.dispose();
      this.scene.environment = this.env;
      this.scene.environmentIntensity = 0.55;
    } catch (e) {
      console.warn('[thumbs] no environment map', e);
    }
  }

  /** Render one job; resolves to a data URL (or null when the item has no mesh). */
  async render(job: Job): Promise<string | null> {
    const r = game?.engine?.renderer;
    if (!r) return null;
    const src = getGeometry(job.defId, { variant: job.variant, level: job.level, style: job.style, lod: 0 });
    if (!src) return null;
    const def = getItem(job.defId);
    this.ensureEnv(r);

    // geometry: shallow clone + a zeroed per-vertex aState (non-instanced draw of the instanced-aware material)
    const g = new BufferGeometry();
    for (const name of Object.keys(src.attributes)) if (name !== 'aState') g.setAttribute(name, src.attributes[name]);
    if (src.index) g.setIndex(src.index);
    const count = src.getAttribute('position').count;
    g.setAttribute('aState', new BufferAttribute(new Float32Array(count), 1));
    if (!src.boundingBox) src.computeBoundingBox();
    const bb = src.boundingBox!;
    this.mesh.geometry = g;

    // framing: fit bbox corners + pedestal ring from a 3/4 elevated view
    const foot = FOOTPRINT_RADIUS[def?.footprint ?? 1] ?? 0.92;
    const ext = Math.hypot(Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)), Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)));
    const ringR = Math.max(ext * 1.06, foot * 0.72);
    const pts: Vector3[] = [];
    for (let i = 0; i < 8; i++) pts.push(new Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * ringR, 0, Math.sin(a) * ringR));
    }
    const az = 0.68, el = 0.46;
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    const target = new Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2 * 0.9, (bb.min.z + bb.max.z) / 2);
    const cam = this.camera;
    const tanY = Math.tan((cam.fov * Math.PI) / 360);
    const fit = 0.84;
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
    const up = new Vector3().crossVectors(dir, right).normalize();
    let dist = 1;
    for (let pass = 0; pass < 2; pass++) {
      dist = 0.5;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        const v = p.clone().sub(target);
        const vx = v.dot(right), vy = v.dot(up), vz = v.dot(dir);
        dist = Math.max(dist, vz + Math.abs(vx) / (tanY * fit), vz + Math.abs(vy) / (tanY * fit));
      }
      // centre the projected bounds
      for (const p of pts) {
        const v = p.clone().sub(target);
        const depth = dist - v.dot(dir);
        const sx = v.dot(right) / depth, sy = v.dot(up) / depth;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      target.addScaledVector(right, cx * dist).addScaledVector(up, cy * dist);
    }
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.near = Math.max(0.01, dist * 0.02);
    cam.far = dist * 6 + 50;
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // pedestal geometry in screen space (ellipse through the projected ring)
    const px = job.px;
    let eMinX = Infinity, eMaxX = -Infinity, eMinY = Infinity, eMaxY = -Infinity;
    const tmp = new Vector3();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      tmp.set(Math.cos(a) * ringR, 0, Math.sin(a) * ringR).project(cam);
      const sx = (tmp.x * 0.5 + 0.5) * px, sy = (1 - (tmp.y * 0.5 + 0.5)) * px;
      eMinX = Math.min(eMinX, sx);
      eMaxX = Math.max(eMaxX, sx);
      eMinY = Math.min(eMinY, sy);
      eMaxY = Math.max(eMaxY, sy);
    }

    // first use: compile the studio's program variant off the main thread where supported
    if (!this.compiled) {
      this.compiled = true;
      try {
        const compileAsync = (r as unknown as { compileAsync?: (s: Scene, c: PerspectiveCamera) => Promise<unknown> }).compileAsync;
        const parallel = r.extensions.has('KHR_parallel_shader_compile');
        if (parallel && typeof compileAsync === 'function') await compileAsync.call(r, this.scene, cam);
      } catch {
        /* compile on first render instead */
      }
    }

    // render with saved / restored state
    const rt = this.target(px);
    const prevTarget = r.getRenderTarget();
    r.getClearColor(this.prevClear);
    const prevAlpha = r.getClearAlpha();
    const prevAutoClear = r.autoClear;
    this.prevCenter.copy(shared.uPlanetCenter.value);
    const prevApoc = shared.uApocalypse.value;
    const prevNight = shared.uNightLights.value;
    this.sunDir.copy(shared.uSunDir.value);
    let pixels: Uint8Array = new Uint8Array(px * px * 4);
    let pending: Promise<Uint8Array> | null = null;
    try {
      // daylight: put the "planet centre" far below the model along the sun direction
      shared.uPlanetCenter.value.copy(this.sunDir).multiplyScalar(-1e4);
      shared.uApocalypse.value = 0;
      shared.uNightLights.value = 1;
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.autoClear = true;
      r.clear(true, true, false);
      r.render(this.scene, cam);
      const asyncRead = (r as unknown as { readRenderTargetPixelsAsync?: WebGLRenderer['readRenderTargetPixelsAsync'] }).readRenderTargetPixelsAsync;
      if (typeof asyncRead === 'function') pending = asyncRead.call(r, rt, 0, 0, px, px, pixels) as Promise<Uint8Array>;
      else r.readRenderTargetPixels(rt, 0, 0, px, px, pixels);
    } finally {
      shared.uPlanetCenter.value.copy(this.prevCenter);
      shared.uApocalypse.value = prevApoc;
      shared.uNightLights.value = prevNight;
      r.setRenderTarget(prevTarget);
      r.setClearColor(this.prevClear, prevAlpha);
      r.autoClear = prevAutoClear;
      this.mesh.geometry = EMPTY;
      // release only our own attribute: detach the shared ones first so their GPU buffers survive
      for (const name of Object.keys(g.attributes)) if (name !== 'aState') g.deleteAttribute(name);
      g.setIndex(null);
      g.dispose();
    }
    if (pending) {
      // GPU fences normally signal within a frame; if this one lags (software GL, busy GPU) read synchronously
      const timedOut = Symbol('timeout');
      const res = await Promise.race([pending, new Promise<typeof timedOut>((r) => setTimeout(() => r(timedOut), 250))]);
      if (res === timedOut) {
        pending.catch(() => {});
        const prev = r.getRenderTarget();
        try {
          r.readRenderTargetPixels(rt, 0, 0, px, px, pixels);
        } finally {
          r.setRenderTarget(prev);
        }
      } else pixels = res;
    }
    return this.compose(pixels, px, { cx: (eMinX + eMaxX) / 2, cy: (eMinY + eMaxY) / 2, rx: (eMaxX - eMinX) / 2, ry: (eMaxY - eMinY) / 2 });
  }

  /** Flip, un-premultiply, tone-map; draw over a glass pedestal; encode (async PNG blob → object URL). */
  private compose(pixels: Uint8Array, px: number, e: { cx: number; cy: number; rx: number; ry: number }): Promise<string> {
    const oc = this.objCanvas;
    oc.width = px;
    oc.height = px;
    const octx = oc.getContext('2d')!;
    const img = octx.createImageData(px, px);
    const d = img.data;
    for (let y = 0; y < px; y++) {
      const srcRow = (px - 1 - y) * px * 4;
      const dstRow = y * px * 4;
      for (let x = 0; x < px * 4; x += 4) {
        const a = pixels[srcRow + x + 3];
        if (a === 0) continue;
        const k = a < 255 ? 255 / a : 1;
        d[dstRow + x] = LUT[Math.min(255, Math.round(pixels[srcRow + x] * k))];
        d[dstRow + x + 1] = LUT[Math.min(255, Math.round(pixels[srcRow + x + 1] * k))];
        d[dstRow + x + 2] = LUT[Math.min(255, Math.round(pixels[srcRow + x + 2] * k))];
        d[dstRow + x + 3] = a;
      }
    }
    octx.putImageData(img, 0, 0);

    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, px, px);
    const { cx, cy } = e;
    const rx = Math.max(4, e.rx), ry = Math.max(2, e.ry);
    const thick = Math.max(2, px * 0.022);
    // glow under the pedestal
    ctx.save();
    ctx.translate(cx, cy + thick);
    ctx.scale(1, ry / rx);
    const glow = ctx.createRadialGradient(0, 0, rx * 0.6, 0, 0, rx * 1.35);
    glow.addColorStop(0, 'rgba(94, 220, 255, 0.28)');
    glow.addColorStop(1, 'rgba(94, 220, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // pedestal side
    ctx.fillStyle = 'rgba(8, 12, 26, 0.95)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + thick, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - rx, cy, rx * 2, thick);
    // pedestal top
    const top = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
    top.addColorStop(0, 'rgba(48, 62, 104, 0.96)');
    top.addColorStop(1, 'rgba(18, 24, 46, 0.96)');
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // rim light
    const rim = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
    rim.addColorStop(0, 'rgba(120, 225, 255, 0.85)');
    rim.addColorStop(0.5, 'rgba(160, 140, 255, 0.5)');
    rim.addColorStop(1, 'rgba(120, 225, 255, 0.85)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, px * 0.009);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // contact shadow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.8);
    sh.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    sh.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // the model
    ctx.drawImage(oc, 0, 0);
    return new Promise((resolve) => {
      try {
        c.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png');
      } catch {
        try {
          resolve(c.toDataURL('image/png'));
        } catch {
          resolve('');
        }
      }
    });
  }

  dispose(): void {
    for (const t of this.targets.values()) t.dispose();
    this.targets.clear();
    this.env?.dispose();
  }
}

const EMPTY = new BufferGeometry();
let studio: ThumbStudio | null = null;
let running = false;
let busy = false;

/** Newest request batch first (what the user is looking at now), in request order within the batch. */
function nextJob(): Job | undefined {
  if (!queue.length) return undefined;
  let best = 0;
  for (let i = 1; i < queue.length; i++) {
    const a = queue[i], b = queue[best];
    if (a.bucket > b.bucket || (a.bucket === b.bucket && a.seq < b.seq)) best = i;
  }
  return queue.splice(best, 1)[0];
}

function pump(): void {
  if (busy) return;
  const job = nextJob();
  if (!job) {
    running = false;
    return;
  }
  const sig = cache.get(job.key);
  if (!sig || sig.value) {
    requestAnimationFrame(pump);
    return;
  }
  busy = true;
  if (!studio) studio = new ThumbStudio();
  studio
    .render(job)
    .then((url) => {
      if (url) sig.value = url;
      else failed.add(job.key);
    })
    .catch((e) => {
      failed.add(job.key);
      console.warn('[thumbs] render failed for', job.defId, e);
    })
    .finally(() => {
      busy = false;
      requestAnimationFrame(pump);
    });
}

function kick(): void {
  if (running) return;
  running = true;
  requestAnimationFrame(pump);
}

/** True when the item has a 3D mesh (otherwise show its icon). */
export function hasThumbnailMesh(defId: string): boolean {
  const d = getItem(defId);
  return !!d?.mesh;
}

/** Reactive thumbnail URL for an item; queues a render on first request. */
export function thumbnailSignal(defId: string, o: ThumbOptions = {}): ReadonlySignal<string | null> {
  const px = SIZES[o.size ?? 'sm'];
  let style: StyleId = o.style ?? 'classic';
  try {
    if (!o.style && game?.planet) style = game.planet.city.style ?? 'classic';
  } catch {
    /* default style */
  }
  const def = getItem(defId);
  const styleKey = def?.styleable ? style : '-';
  const key = `${defId}|${styleKey}|${o.variant ?? 0}|${o.level ?? 3}|${px}`;
  let sig = cache.get(key);
  if (!sig) {
    sig = signal<string | null>(null);
    cache.set(key, sig);
  }
  if (!sig.value && def?.mesh && !failed.has(key)) {
    const bucket = Math.floor(performance.now() / 120);
    const i = queue.findIndex((j) => j.key === key);
    if (i >= 0) {
      if (queue[i].bucket !== bucket) {
        queue[i].bucket = bucket;
        queue[i].seq = seqCounter++;
      }
    } else queue.push({ key, defId, px, style, variant: o.variant ?? 0, level: o.level ?? 3, bucket, seq: seqCounter++ });
    if (queue.length > 400) queue.splice(0, queue.length - 400);
    kick();
  }
  return sig;
}

/** Queue portraits in the background (oldest priority) so menus open with pictures ready. */
export function prewarmThumbnails(defIds: string[], o: ThumbOptions = {}): void {
  for (const id of defIds) {
    if (!getItem(id)?.mesh) continue;
    const before = queue.length;
    thumbnailSignal(id, o);
    // demote: background work yields to anything the player requests
    if (queue.length > before) queue[queue.length - 1].bucket = -1;
  }
}

/** Forget cached portraits whose key starts with `prefix` (all when omitted). */
export function clearThumbnails(prefix = ''): void {
  for (const k of [...cache.keys()]) {
    if (!k.startsWith(prefix)) continue;
    const s = cache.get(k)!;
    if (s.value && s.value.startsWith('blob:')) URL.revokeObjectURL(s.value);
    s.value = null;
    cache.delete(k);
    failed.delete(k);
  }
}

// custom (Architect Studio) items change shape when edited
bus.on('catalog:changed', () => {
  for (const k of [...cache.keys()]) {
    const id = k.split('|')[0];
    if (getItem(id)?.category === 'custom' || !getItem(id)) clearThumbnails(id + '|');
  }
});
