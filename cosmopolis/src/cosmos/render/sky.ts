/**
 * OWNER: cosmos.
 * SkyDome — the infinitely-distant backdrop of every cosmos view: a twinkling starfield (one Points draw call) and an
 * optional baked nebula (equirectangular CanvasTexture rendered once from 3D simplex noise, cached per palette).
 * The dome follows the camera position so it never parallaxes.
 */
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, LinearFilter, Mesh, MeshBasicMaterial, Points, SRGBColorSpace, ShaderMaterial, SphereGeometry, type Camera } from 'three';
import { Noise3, Rng } from '../../core/rng';
import { OUTPUT } from './glsl';

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 color;
uniform float uTime;
uniform float uPR;
uniform float uBright;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.72 + 0.28 * sin(uTime * (0.7 + aPhase * 2.3) + aPhase * 37.0);
  vColor = color * uBright * tw;
  gl_PointSize = aSize * uPR;
}
`;
const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = exp(-r * r * 5.0) + max(0.0, 1.0 - r) * 0.25;
  gl_FragColor = vec4(vColor * a, 1.0);
  ${OUTPUT}
}
`;

/** Blackbody-ish star tints. */
const STAR_TINTS = [0x9bb8ff, 0xc6d6ff, 0xf4f6ff, 0xfff4e0, 0xffe2b0, 0xffc58a, 0xff9e70];

export function starTint(rng: Rng): Color {
  const r = rng.next();
  const i = r < 0.12 ? 0 : r < 0.3 ? 1 : r < 0.55 ? 2 : r < 0.72 ? 3 : r < 0.86 ? 4 : r < 0.95 ? 5 : 6;
  return new Color(STAR_TINTS[i]);
}

export function makeStarfield(seed: number, count: number, radius: number, pixelRatio: number, bright = 1): Points {
  const rng = new Rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // uniform on the sphere, with a faint galactic band
    let y = rng.range(-1, 1);
    if (rng.chance(0.35)) y *= 0.18;
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = Math.sin(a) * r * radius;
    const c = starTint(rng);
    const lum = 0.35 + Math.pow(rng.next(), 3) * 1.4;
    col[i * 3] = c.r * lum;
    col[i * 3 + 1] = c.g * lum;
    col[i * 3 + 2] = c.b * lum;
    const big = rng.next();
    size[i] = big > 0.985 ? rng.range(3.4, 5) : big > 0.9 ? rng.range(2.2, 3.2) : rng.range(1.1, 2.1);
    phase[i] = rng.next();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('aSize', new BufferAttribute(size, 1));
  g.setAttribute('aPhase', new BufferAttribute(phase, 1));
  const m = new ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uTime: { value: 0 }, uPR: { value: pixelRatio }, uBright: { value: bright } },
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });
  const p = new Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -20;
  return p;
}

// ───────────────────────────────────────────── nebula backdrop

const nebulaCache = new Map<string, CanvasTexture>();

/** Bake (or fetch) an equirect nebula texture. colors: [primary, secondary, dust]. */
export function nebulaTexture(seed: number, colors: [number, number, number], intensity = 1, w = 384, h = 192): CanvasTexture | null {
  const key = `${seed}|${colors.join(',')}|${intensity}|${w}`;
  const hit = nebulaCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  const n = new Noise3(seed);
  const c1 = new Color(colors[0]);
  const c2 = new Color(colors[1]);
  const c3 = new Color(colors[2]);
  const d = img.data;
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    const lat = (0.5 - v) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2;
      const x = Math.cos(lon) * cl, y = sl, z = Math.sin(lon) * cl;
      // domain-warped clouds concentrated along a tilted band
      const wx = n.noise(x * 1.3 + 7, y * 1.3, z * 1.3) * 0.55;
      const wy = n.noise(x * 1.3, y * 1.3 + 13, z * 1.3) * 0.55;
      const f = n.fbm(x * 1.8 + wx, y * 1.8 + wy, z * 1.8, 4) * 0.5 + 0.5;
      const g2 = n.fbm(x * 3.2 + 31, y * 3.2 - wx, z * 3.2, 3) * 0.5 + 0.5;
      const band = Math.exp(-Math.pow((y * 0.9 + x * 0.35) * 2.4, 2));
      const dens = Math.max(0, f - 0.42) * 2.2 * (0.35 + band * 0.9);
      const dust = Math.max(0, g2 - 0.55) * 2.0 * band;
      let r = (c1.r * (1 - g2) + c2.r * g2) * dens;
      let g = (c1.g * (1 - g2) + c2.g * g2) * dens;
      let b = (c1.b * (1 - g2) + c2.b * g2) * dens;
      r = r * (1 - dust * 0.8) + c3.r * dust * 0.08;
      g = g * (1 - dust * 0.8) + c3.g * dust * 0.08;
      b = b * (1 - dust * 0.8) + c3.b * dust * 0.08;
      const k = 0.42 * intensity;
      const o = (j * w + i) * 4;
      d[o] = Math.min(255, r * k * 255 + 2);
      d[o + 1] = Math.min(255, g * k * 255 + 3);
      d[o + 2] = Math.min(255, b * k * 255 + 8);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  nebulaCache.set(key, tex);
  return tex;
}

export interface SkyOptions {
  seed: number;
  stars: number;
  radius: number;
  pixelRatio: number;
  nebula?: [number, number, number];
  nebulaIntensity?: number;
  starBrightness?: number;
}

export class SkyDome {
  readonly group = new Group();
  private stars: Points;
  private dome: Mesh | null = null;

  constructor(o: SkyOptions) {
    this.group.name = 'sky';
    this.stars = makeStarfield(o.seed, o.stars, o.radius * 0.9, o.pixelRatio, o.starBrightness ?? 1);
    this.group.add(this.stars);
    if (o.nebula) {
      const tex = nebulaTexture(o.seed ^ 0x77, o.nebula, o.nebulaIntensity ?? 1);
      if (tex) {
        const m = new MeshBasicMaterial({ map: tex, side: BackSide, depthWrite: false, depthTest: false, transparent: false });
        this.dome = new Mesh(new SphereGeometry(o.radius, 32, 16), m);
        this.dome.renderOrder = -30;
        this.dome.frustumCulled = false;
        this.group.add(this.dome);
      }
    }
  }

  update(camera: Camera, time: number): void {
    this.group.position.copy(camera.position);
    (this.stars.material as ShaderMaterial).uniforms.uTime.value = time;
  }

  setPixelRatio(pr: number): void {
    (this.stars.material as ShaderMaterial).uniforms.uPR.value = pr;
  }

  dispose(): void {
    this.stars.geometry.dispose();
    (this.stars.material as ShaderMaterial).dispose();
    if (this.dome) {
      this.dome.geometry.dispose();
      (this.dome.material as MeshBasicMaterial).dispose();
    }
    this.group.removeFromParent();
  }
}
