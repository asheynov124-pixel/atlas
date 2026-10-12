import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Opening } from '../lib/types';
import type { Shape } from '../data/pieces';
import { piece } from '../data/pieces';
import { hexToHsl, hslToHex, mix, darken } from '../lib/color';

export interface StagePlaced { id: string; pieceId: string; x: number; z: number; rot: number; w?: number; d?: number; h?: number }

export interface StageSpec {
  length: number; width: number; height: number;
  wallHex: string; floorId: string; floorHex: string; finish: string; frame: string;
  metalHex: string; clothHex: string; ceilingHex: string; trimHex: string;
  warmth: number; hour: number;
  openings: Opening[];
  placed: StagePlaced[];
  highlight?: string;
}

const FT = 1; // one unit = one foot

// ---------- procedural textures ----------
const texCache = new Map<string, THREE.Texture>();

function canvasTex(key: string, size: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const k = `${key}|${repeat.join(',')}`;
  const hit = texCache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(k, t);
  return t;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function woodTex(hex: string, repeat: [number, number], herringbone = false) {
  return canvasTex(`wood-${hex}-${herringbone}`, 512, (ctx) => {
    const rnd = seeded(7);
    ctx.fillStyle = hex; ctx.fillRect(0, 0, 512, 512);
    const [h, s, l] = hexToHsl(hex);
    const planks = herringbone ? 16 : 6;
    const pw = 512 / planks;
    for (let i = 0; i < planks; i++) {
      const tone = hslToHex(h + (rnd() - 0.5) * 6, s, l + (rnd() - 0.5) * 9);
      ctx.fillStyle = tone;
      if (herringbone) {
        ctx.save(); ctx.translate(256, 256); ctx.rotate(Math.PI / 4); ctx.fillRect(-400 + i * 50, -400, 48, 800); ctx.restore();
      } else {
        ctx.fillRect(i * pw, 0, pw - 1.5, 512);
        const breaks = 2 + Math.floor(rnd() * 2);
        for (let b = 0; b < breaks; b++) { ctx.fillStyle = darken(tone, 12); ctx.fillRect(i * pw, rnd() * 512, pw - 1.5, 1.5); }
      }
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + rnd() * 0.05})`; ctx.lineWidth = 1;
      for (let g = 0; g < 10; g++) { ctx.beginPath(); const x = i * pw + rnd() * pw; ctx.moveTo(x, 0); ctx.bezierCurveTo(x + rnd() * 10 - 5, 170, x + rnd() * 10 - 5, 340, x + rnd() * 6 - 3, 512); ctx.stroke(); }
    }
  }, repeat);
}

function stoneTex(hex: string, repeat: [number, number], grid = 2, checker = false) {
  return canvasTex(`stone-${hex}-${grid}-${checker}`, 512, (ctx) => {
    const rnd = seeded(3);
    ctx.fillStyle = darken(hex, 10); ctx.fillRect(0, 0, 512, 512);
    const n = grid, cw = 512 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const [h, s, l] = hexToHsl(hex);
      const dark = checker && (i + j) % 2 === 1;
      ctx.fillStyle = dark ? '#3a3632' : hslToHex(h, s, l + (rnd() - 0.5) * 6);
      ctx.fillRect(i * cw + 2, j * cw + 2, cw - 4, cw - 4);
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`;
      for (let v = 0; v < 6; v++) ctx.fillRect(i * cw + rnd() * cw, j * cw + rnd() * cw, rnd() * 30, 1);
    }
  }, repeat);
}

function plasterTex(hex: string, finish: string, repeat: [number, number]) {
  return canvasTex(`plaster-${hex}-${finish}`, 512, (ctx) => {
    ctx.fillStyle = hex; ctx.fillRect(0, 0, 512, 512);
    if (finish === 'smooth' || finish === 'eggshell') return;
    const rnd = seeded(11);
    const amp = finish === 'venetian' ? 0.07 : finish === 'roman-clay' ? 0.05 : finish === 'tadelakt' ? 0.045 : 0.04;
    for (let i = 0; i < 260; i++) {
      const r = 40 + rnd() * 140;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      const light = rnd() > 0.5;
      g.addColorStop(0, light ? `rgba(255,255,255,${amp * (0.4 + rnd() * 0.6)})` : `rgba(0,0,0,${amp * (0.4 + rnd() * 0.6)})`);
      g.addColorStop(1, light ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)');
      // draw the blob and its wrapped copies so the tile has no seam
      const cx = rnd() * 512, cy = rnd() * 512;
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        ctx.save(); ctx.translate(cx + ox, cy + oy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    if (finish === 'vgroove') {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 3;
      for (let x = 0; x < 512; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    }
  }, repeat);
}

function clothTex(hex: string, repeat: [number, number]) {
  return canvasTex(`cloth-${hex}`, 256, (ctx) => {
    ctx.fillStyle = hex; ctx.fillRect(0, 0, 256, 256);
    const rnd = seeded(5);
    for (let i = 0; i < 4000; i++) { ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'; ctx.fillRect(rnd() * 256, rnd() * 256, 2, 1); }
  }, repeat);
}

// ---------- materials ----------
const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

function floorMaterial(spec: StageSpec) {
  const rep: [number, number] = [spec.length / 3, spec.width / 3];
  switch (spec.floorId) {
    case 'oak': case 'walnut': return mat('#ffffff', { map: woodTex(spec.floorHex, rep), roughness: 0.6 });
    case 'oak-herringbone': return mat('#ffffff', { map: woodTex(spec.floorHex, [spec.length / 4, spec.width / 4], true), roughness: 0.6 });
    case 'limestone': return mat('#ffffff', { map: stoneTex(spec.floorHex, [spec.length / 4, spec.width / 4], 2), roughness: 0.7 });
    case 'terracotta': return mat('#ffffff', { map: stoneTex(spec.floorHex, [spec.length, spec.width], 1), roughness: 0.9 });
    case 'checker': return mat('#ffffff', { map: stoneTex(spec.floorHex, [spec.length / 2, spec.width / 2], 2, true), roughness: 0.5 });
    case 'wool-carpet': return mat('#ffffff', { map: clothTex(spec.floorHex, [spec.length * 2, spec.width * 2]), roughness: 1 });
    default: return mat(spec.floorHex, { roughness: 0.75 });
  }
}

// ---------- furniture ----------
type Ctx = { spec: StageSpec; metal: THREE.Material; cloth: THREE.Material; wood: THREE.Material; darkWood: THREE.Material; shade: THREE.Material; stone: THREE.Material; lights: THREE.Light[] };

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x, y + h / 2, z);
  g.castShadow = true; g.receiveShadow = true;
  return g;
}
function cyl(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rTop = r) {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, 24), m);
  g.position.set(x, y + h / 2, z); g.castShadow = true; g.receiveShadow = true;
  return g;
}

function buildPiece(shape: Shape, w: number, d: number, h: number, c: Ctx): THREE.Group {
  const g = new THREE.Group();
  const { metal, cloth, wood, darkWood, shade, stone } = c;
  switch (shape) {
    case 'sofa': {
      g.add(box(w, h * 0.45, d, cloth, 0, 0.3));
      g.add(box(w, h * 0.55, d * 0.25, cloth, 0, 0.3, -d / 2 + d * 0.125));
      g.add(box(w * 0.08, h * 0.75, d, cloth, -w / 2 + w * 0.04, 0.3));
      g.add(box(w * 0.08, h * 0.75, d, cloth, w / 2 - w * 0.04, 0.3));
      const seats = w > 7 ? 3 : 2;
      for (let i = 0; i < seats; i++) g.add(box((w * 0.84) / seats - 0.05, 0.35, d * 0.7, cloth, -w * 0.42 + ((i + 0.5) * (w * 0.84)) / seats, h * 0.45 + 0.3, d * 0.1));
      g.add(box(w * 0.9, 0.3, d * 0.9, wood, 0, 0));
      break;
    }
    case 'chair': {
      g.add(box(w, 0.4, d, cloth, 0, 1.1));
      g.add(box(w, h - 1.1, d * 0.2, cloth, 0, 1.1, -d / 2 + d * 0.1));
      g.add(box(w * 0.12, 1.1, d, cloth, -w / 2 + w * 0.06, 0.9));
      g.add(box(w * 0.12, 1.1, d, cloth, w / 2 - w * 0.06, 0.9));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => g.add(cyl(0.06, 0.9, wood, (sx * w) / 2.3, 0, (sz * d) / 2.3)));
      break;
    }
    case 'bench': case 'stool': {
      g.add(box(w, 0.15, d, shape === 'stool' ? cloth : wood, 0, h - 0.15));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => g.add(cyl(0.06, h - 0.15, wood, (sx * w) / 2.4, 0, (sz * d) / 2.4)));
      break;
    }
    case 'table': case 'desk': {
      g.add(box(w, 0.12, d, wood, 0, h - 0.12));
      if (w > 4 && d > 4 && Math.abs(w - d) < 0.5) g.add(cyl(0.25, h - 0.12, wood));
      else [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => g.add(box(0.15, h - 0.12, 0.15, wood, (sx * (w - 0.3)) / 2, 0, (sz * (d - 0.3)) / 2)));
      if (shape === 'desk') g.add(box(w * 0.3, 0.3, d * 0.8, wood, w * 0.3, h - 0.42));
      break;
    }
    case 'bed': {
      g.add(box(w, 0.9, d * 0.95, wood, 0, 0, d * 0.025));
      g.add(box(w - 0.2, 0.9, d * 0.9, cloth, 0, 0.9, d * 0.04));
      g.add(box(w + 0.3, h, 0.3, cloth, 0, 0, -d / 2 + 0.15));
      g.add(box(w * 0.42, 0.35, 0.9, shade, -w * 0.25, 1.8, -d / 2 + 0.9));
      g.add(box(w * 0.42, 0.35, 0.9, shade, w * 0.25, 1.8, -d / 2 + 0.9));
      g.add(box(w - 0.4, 0.25, d * 0.45, cloth, 0, 1.8, d * 0.2));
      break;
    }
    case 'lamp-floor': {
      g.add(cyl(0.5, 0.08, metal));
      g.add(cyl(0.03, h - 1.2, metal, 0, 0.08));
      const sh = cyl(0.65, 1.1, shade, 0, h - 1.1, 0, 0.6);
      g.add(sh);
      const l = new THREE.PointLight('#ffd9a8', 0, 14, 1.6); l.position.set(0, h - 0.6, 0); l.castShadow = false; g.add(l); c.lights.push(l);
      break;
    }
    case 'lamp-table': {
      g.add(cyl(0.3, h * 0.55, stone, 0, 0, 0, 0.22));
      g.add(cyl(0.55, h * 0.45, shade, 0, h * 0.55, 0, 0.5));
      const l = new THREE.PointLight('#ffd9a8', 0, 9, 1.6); l.position.set(0, h * 0.75, 0); g.add(l); c.lights.push(l);
      break;
    }
    case 'pendant': {
      // hung from ceiling; group origin at ceiling
      const drop = w > 2 ? 2.8 : 2.4;
      g.add(cyl(0.015, drop, metal, 0, -drop));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal);
      dome.position.y = -drop; dome.rotation.x = Math.PI; dome.castShadow = true; g.add(dome);
      const l = new THREE.PointLight('#ffe0b8', 0, 16, 1.4); l.position.set(0, -drop - 0.3, 0); g.add(l); c.lights.push(l);
      break;
    }
    case 'rug': {
      const m = mat('#ffffff', { map: clothTex(c.spec.clothHex === '#f3efe6' ? '#e2d6c0' : mix(c.spec.clothHex, '#e4d8c4', 0.5), [w, d]), roughness: 1 });
      const r = box(w, 0.04, d, m); r.castShadow = false; g.add(r);
      g.add(box(w * 0.9, 0.045, 0.12, mat(c.spec.floorId === 'walnut' ? '#3b2a20' : '#b56b4e'), 0, 0, d * 0.3));
      g.add(box(w * 0.9, 0.045, 0.12, mat(c.spec.floorId === 'walnut' ? '#3b2a20' : '#b56b4e'), 0, 0, -d * 0.3));
      break;
    }
    case 'art': case 'mirror': {
      const frameM = c.spec.frame === 'gallery' ? metal : c.spec.frame === 'craftsman' ? darkWood : wood;
      const thick = c.spec.frame === 'gallery' ? 0.04 : c.spec.frame === 'floater' ? 0.1 : 0.14;
      g.add(box(w, h, 0.12, frameM, 0, 0, 0));
      const face = shape === 'mirror' ? mat('#d8dde0', { metalness: 0.9, roughness: 0.05 }) : mat(mix(c.spec.wallHex, '#8a6a45', 0.35), { roughness: 0.9 });
      g.add(box(w - thick * 2, h - thick * 2, 0.02, face, 0, thick, 0.07));
      break;
    }
    case 'curtains': {
      const m = mat('#ffffff', { map: clothTex(c.spec.clothHex, [3, 6]), roughness: 1, side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) { const p = box(w / 6 - 0.02, h, 0.2 + (i % 2) * 0.06, m, -w / 2 + (i + 0.5) * (w / 6), 0, 0); g.add(p); }
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, w + 0.6, 12), metal);
      rod.rotation.z = Math.PI / 2; rod.position.set(0, h + 0.15, 0); g.add(rod);
      break;
    }
    case 'plant': {
      g.add(cyl(w / 2, h * 0.3, mat('#b8714f', { roughness: 0.9 }), 0, 0, 0, w / 2.3));
      g.add(cyl(0.04, h * 0.5, darkWood, 0, h * 0.3));
      const leaf = mat('#5c6854', { roughness: 0.9 });
      for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(w * 0.32, 10, 8), leaf); s.position.set(Math.sin(i * 2.1) * w * 0.3, h * 0.55 + Math.cos(i * 1.3) * h * 0.2 + w * 0.2, Math.cos(i * 2.1) * w * 0.3); s.castShadow = true; g.add(s); }
      break;
    }
    case 'shelves': {
      for (let i = 0; i < 2; i++) g.add(box(w, 0.15, d, wood, 0, i * 1.4));
      g.add(cyl(0.2, 0.45, stone, -w * 0.3, 0.15)); g.add(box(0.6, 0.25, 0.6, shade, w * 0.2, 0.15));
      break;
    }
    case 'bookcase': {
      g.add(box(w, h, d, wood));
      const inner = mat('#2a211c');
      for (let i = 0; i < 5; i++) { g.add(box(w - 0.2, (h - 0.4) / 5 - 0.1, d - 0.15, inner, 0, 0.2 + i * ((h - 0.4) / 5), 0.05)); for (let b = 0; b < 5; b++) g.add(box(0.12, 0.6 + (b % 3) * 0.1, d * 0.6, mat(['#8a6a45', '#5c6854', '#c4785a', '#3a3632', '#e4d8c4'][(i + b) % 5]), -w * 0.35 + b * w * 0.16, 0.25 + i * ((h - 0.4) / 5), 0.1)); }
      break;
    }
    case 'sideboard': case 'dresser': case 'vanity': case 'island': case 'range': {
      const m = shape === 'range' ? mat('#efe6d2', { roughness: 0.4, metalness: 0.1 }) : wood;
      g.add(box(w, h - 0.3, d, m, 0, 0.3));
      g.add(box(w * 0.92, 0.3, d * 0.9, darkWood, 0, 0));
      if (shape === 'island' || shape === 'vanity') g.add(box(w + 0.15, 0.12, d + 0.15, stone, 0, h - 0.3));
      if (shape === 'vanity') { const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.25, 24), mat('#f4f1ea', { roughness: 0.2 })); basin.position.set(w > 5 ? -w * 0.25 : 0, h - 0.18, 0); g.add(basin); g.add(cyl(0.03, 0.8, metal, w > 5 ? -w * 0.25 : 0, h - 0.18, -d * 0.35)); }
      if (shape === 'range') { g.add(box(w, 0.08, d, mat('#1c1916', { metalness: 0.5, roughness: 0.4 }), 0, h - 0.3)); for (let i = 0; i < 4; i++) g.add(cyl(0.22, 0.06, metal, -w * 0.3 + (i % 2) * w * 0.6, h - 0.22, -d * 0.2 + Math.floor(i / 2) * d * 0.4)); }
      const pulls = Math.max(2, Math.floor(w / 1.5));
      for (let i = 0; i < pulls; i++) g.add(box(0.35, 0.05, 0.08, metal, -w / 2 + (i + 0.5) * (w / pulls), h * 0.55, d / 2 + 0.02));
      break;
    }
    case 'tub': {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(d / 2, w - d, 6, 16), mat('#f4f1ea', { roughness: 0.25 }));
      t.rotation.z = Math.PI / 2; t.position.y = h / 2; t.scale.set(1, h / d, 1); t.castShadow = true; g.add(t);
      const water = new THREE.Mesh(new THREE.CapsuleGeometry(d / 2 - 0.15, w - d - 0.3, 6, 16), mat('#f4f1ea', { roughness: 0.25 })); water.rotation.z = Math.PI / 2; water.position.y = h - 0.05; water.scale.set(1, 0.05, 1); g.add(water);
      g.add(cyl(0.03, 2.4, metal, w / 2 - 0.4, 0, -d / 2 - 0.2));
      break;
    }
    case 'sconce': {
      g.add(box(0.25, 0.25, 0.1, metal, 0, 0, 0));
      g.add(cyl(0.3, 0.5, shade, 0, 0.1, 0.25, 0.22));
      const l = new THREE.PointLight('#ffd9a8', 0, 7, 1.6); l.position.set(0, 0.5, 0.4); g.add(l); c.lights.push(l);
      break;
    }
    default:
      g.add(box(w, h, d, shape === 'box' && h > 5 ? wood : stone));
  }
  return g;
}

// ---------- the scene ----------
export class RoomScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  room = new THREE.Group();
  raf = 0;
  spec?: StageSpec;
  sun = new THREE.DirectionalLight('#fff', 1);
  ambient = new THREE.HemisphereLight('#fff', '#888', 0.6);
  lamps: THREE.Light[] = [];
  disposed = false;

  constructor(public el: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; this.controls.minDistance = 2; this.controls.maxDistance = 60;
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5; this.sun.shadow.camera.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target, this.ambient, this.room);
    this.resize();
    this.loop();
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  resetView() {
    if (!this.spec) return;
    const { length: L, width: W, height: H } = this.spec;
    this.controls.target.set(L / 2, H * 0.38, W / 2);
    const back = Math.max(L, W);
    this.camera.position.set(L + back * 0.55, H * 0.85, W + back * 0.75);
    this.controls.update();
  }

  setSpec(spec: StageSpec, keepCamera = true) {
    const first = !this.spec;
    const sameDims = this.spec && this.spec.length === spec.length && this.spec.width === spec.width && this.spec.height === spec.height;
    this.spec = spec;
    this.build();
    this.light();
    if (first || !sameDims || !keepCamera) this.resetView();
  }

  private clear() {
    this.room.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => { if (!(x as THREE.MeshStandardMaterial).map) x.dispose(); }); });
    this.room.clear();
    this.lamps = [];
  }

  private build() {
    const s = this.spec!; this.clear();
    const { length: L, width: W, height: H } = s;
    const wallMat = mat('#ffffff', { map: plasterTex(s.wallHex, s.finish, [L / 4, H / 4]), roughness: s.finish === 'venetian' ? 0.35 : 0.95, side: THREE.FrontSide });
    const ceilMat = mat(s.ceilingHex, { roughness: 1 });
    const trimMat = mat(s.trimHex, { roughness: 0.5 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), floorMaterial(s));
    floor.rotation.x = -Math.PI / 2; floor.position.set(L / 2, 0, W / 2); floor.receiveShadow = true; this.room.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L, W), ceilMat);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(L / 2, H, W / 2); ceil.receiveShadow = true; this.room.add(ceil);

    // Walls with openings cut as shapes. Wall index: 0 north (z=0), 1 east (x=L), 2 south (z=W), 3 west (x=0).
    const walls: { idx: 0 | 1 | 2 | 3; len: number; pos: THREE.Vector3; rotY: number }[] = [
      { idx: 0, len: L, pos: new THREE.Vector3(L / 2, 0, 0), rotY: 0 },
      { idx: 1, len: W, pos: new THREE.Vector3(L, 0, W / 2), rotY: -Math.PI / 2 },
      { idx: 2, len: L, pos: new THREE.Vector3(L / 2, 0, W), rotY: Math.PI },
      { idx: 3, len: W, pos: new THREE.Vector3(0, 0, W / 2), rotY: Math.PI / 2 },
    ];
    const baseH = s.frame === 'craftsman' ? 0.58 : s.frame === 'none' ? 0.3 : 0.45;
    const casingW = s.frame === 'craftsman' ? 0.4 : s.frame === 'ogee' ? 0.33 : s.frame === 'none' ? 0 : 0.25;
    for (const w of walls) {
      const shape = new THREE.Shape();
      shape.moveTo(-w.len / 2, 0); shape.lineTo(w.len / 2, 0); shape.lineTo(w.len / 2, H); shape.lineTo(-w.len / 2, H); shape.closePath();
      const ops = s.openings.filter((o) => o.wall === w.idx);
      for (const o of ops) {
        const x0 = -w.len / 2 + o.offset, x1 = Math.min(w.len / 2, x0 + o.width);
        const y0 = o.kind === 'window' ? (o.sill ?? 2.5) : 0, y1 = Math.min(H - 0.1, y0 + o.height);
        const hole = new THREE.Path(); hole.moveTo(x0, y0); hole.lineTo(x1, y0); hole.lineTo(x1, y1); hole.lineTo(x0, y1); hole.closePath();
        shape.holes.push(hole);
      }
      const geo = new THREE.ShapeGeometry(shape);
      // uv repeat scaled by wall length
      const uv = geo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w.len / 2) / 4, uv.getY(i) / 4);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.copy(w.pos); mesh.rotation.y = w.rotY; mesh.receiveShadow = true; mesh.castShadow = true;
      this.room.add(mesh);
      // baseboard
      const group = new THREE.Group(); group.position.copy(w.pos); group.rotation.y = w.rotY;
      let cursor = -w.len / 2;
      const doorsSorted = ops.filter((o) => o.kind !== 'window').sort((a, b) => a.offset - b.offset);
      for (const d of doorsSorted) { const x0 = -w.len / 2 + d.offset; if (x0 > cursor) group.add(box(x0 - cursor, baseH, 0.06, trimMat, (cursor + x0) / 2, 0, 0.03)); cursor = x0 + d.width; }
      if (cursor < w.len / 2) group.add(box(w.len / 2 - cursor, baseH, 0.06, trimMat, (cursor + w.len / 2) / 2, 0, 0.03));
      // casing + glazing
      for (const o of ops) {
        const x0 = -w.len / 2 + o.offset, cx = x0 + o.width / 2;
        const y0 = o.kind === 'window' ? (o.sill ?? 2.5) : 0, y1 = y0 + o.height;
        if (casingW > 0) {
          group.add(box(casingW, o.height + (o.kind === 'window' ? casingW : 0), 0.08, trimMat, x0 - casingW / 2, y0 - (o.kind === 'window' ? casingW / 2 : 0), 0.04));
          group.add(box(casingW, o.height + (o.kind === 'window' ? casingW : 0), 0.08, trimMat, x0 + o.width + casingW / 2, y0 - (o.kind === 'window' ? casingW / 2 : 0), 0.04));
          group.add(box(o.width + casingW * 2, casingW, 0.08, trimMat, cx, y1, 0.04));
          if (o.kind === 'window') group.add(box(o.width + casingW * 2.6, casingW * 0.6, 0.18, trimMat, cx, y0 - casingW * 0.6, 0.09));
        }
        if (o.kind === 'window') {
          const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), new THREE.MeshStandardMaterial({ color: this.skyHex(), emissive: this.skyHex(), emissiveIntensity: this.skyIntensity(), roughness: 0.1, transparent: true, opacity: 0.85 }));
          glass.position.set(cx, y0 + o.height / 2, -0.05); group.add(glass);
          const mull = mat(s.metalHex === '#2c2926' ? '#2c2926' : s.trimHex);
          group.add(box(0.06, o.height, 0.06, mull, cx, y0, -0.02));
          group.add(box(o.width, 0.06, 0.06, mull, cx, y0 + o.height / 2, -0.02));
        } else if (o.kind === 'door') {
          const door = box(o.width - 0.05, o.height - 0.03, 0.12, mat(s.frame === 'none' ? s.wallHex : mix(s.trimHex, '#3a3632', s.wallHex === '#3a3632' ? 0 : 0.0), { roughness: 0.5 }), x0 + 0.02, 0, -0.3);
          const swing = Math.PI * 0.62;
          door.rotation.y = -swing; door.position.set(x0 + 0.06 + Math.cos(swing) * (o.width / 2), (o.height - 0.03) / 2, -0.2 - Math.sin(swing) * (o.width / 2)); group.add(door);
          group.add(cyl(0.06, 0.08, this.metalMat(), x0 + 0.06 + Math.cos(swing) * (o.width - 0.35), 3, -0.2 - Math.sin(swing) * (o.width - 0.35)));
        }
      }
      this.room.add(group);
    }

    // furniture
    const metal = this.metalMat();
    const ctx: Ctx = {
      spec: s, metal,
      cloth: mat('#ffffff', { map: clothTex(s.clothHex, [2, 2]), roughness: 1 }),
      wood: mat('#ffffff', { map: woodTex(s.floorId === 'walnut' ? '#5a3d2c' : '#c9a673', [1, 1]), roughness: 0.55 }),
      darkWood: mat('#4a3426', { roughness: 0.6 }),
      shade: mat('#f1e9d8', { roughness: 1, emissive: '#f1e9d8', emissiveIntensity: 0 }),
      stone: mat('#e9e4dc', { roughness: 0.35 }),
      lights: this.lamps,
    };
    for (const p of s.placed) {
      const def = piece(p.pieceId); if (!def) continue;
      const w = (p.w ?? def.w) / 12, d = (p.d ?? def.d) / 12, h = (p.h ?? def.h) / 12;
      const g = buildPiece(def.shape, w, d, h, ctx);
      g.position.set(p.x, def.ceiling ? H : def.shape === 'art' || def.shape === 'mirror' ? 4.9 - h / 2 + (h > 3 ? 0.6 : 0) : def.shape === 'sconce' ? 5.4 : def.shape === 'shelves' ? 4.5 : 0, p.z);
      g.rotation.y = -THREE.MathUtils.degToRad(p.rot);
      if (p.id === s.highlight) { const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(w, d) * 0.6, Math.max(w, d) * 0.6 + 0.08, 48), new THREE.MeshBasicMaterial({ color: '#e0b07a', side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring); }
      this.room.add(g);
    }
  }

  private metalMat() {
    const s = this.spec!;
    return mat(s.metalHex, { metalness: 0.85, roughness: s.metalHex === '#d9dadb' ? 0.15 : 0.38 });
  }

  private daylight() {
    const s = this.spec!;
    const hr = s.hour;
    const day = hr >= 6 && hr <= 19;
    const t = day ? Math.sin(((hr - 6) / 13) * Math.PI) : 0; // 0 at dawn/dusk, 1 at noon
    return { day, t, evening: hr >= 17 || hr < 7 };
  }

  private skyHex() {
    const { t, day } = this.daylight();
    if (!day) return '#1a2030';
    const warm = this.spec!.warmth / 100;
    return mix(mix('#dbe6f2', '#fff0d0', warm), '#ffffff', t * 0.6);
  }
  private skyIntensity() { const { t, day } = this.daylight(); return day ? 0.5 + t * 1.2 : 0.15; }

  private light() {
    const s = this.spec!;
    const { t, day } = this.daylight();
    const warm = s.warmth / 100;
    const sunColor = mix(mix('#cfe0ff', '#ffd9a0', warm), '#ffffff', t * 0.5);
    this.sun.color.set(sunColor);
    this.sun.intensity = day ? 0.6 + t * 2.4 : 0.05;
    const az = ((s.hour - 6) / 13) * Math.PI;
    this.sun.position.set(s.length / 2 + Math.cos(az) * 30, 10 + Math.sin(az) * 25, -20);
    this.sun.target.position.set(s.length / 2, 0, s.width / 2);
    this.ambient.color.set(mix('#c8d4e4', '#f4e2c8', warm));
    this.ambient.groundColor.set(s.floorHex);
    this.ambient.intensity = day ? 0.35 + t * 0.55 : 0.12;
    const lampOn = !day || t < 0.45 || warm > 0.7;
    const lampColor = warm > 0.8 ? '#ffc98a' : warm > 0.5 ? '#ffd9a8' : '#fff0dc';
    for (const l of this.lamps) { l.intensity = lampOn ? 12 + warm * 10 : 0; (l as THREE.PointLight).color.set(lampColor); }
    this.room.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.emissive && m.color.getHexString() === 'f1e9d8') m.emissiveIntensity = lampOn ? 0.9 : 0; });
    this.scene.background = new THREE.Color(mix('#0f0e0c', '#1c1916', 0.5));
    this.renderer.toneMappingExposure = day ? 0.95 : 0.85;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  screenshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/jpeg', 0.85); }
}
