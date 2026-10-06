/**
 * OWNER: roads-props.
 * Tree & plant species for nature features, avenue medians and decor items — stylised low-poly, flat-shaded
 * crowns on the Foliage channel (they sway in the wind and glow faintly at night through their translucency).
 *
 *   drawTree(b, species, rng, { x, z, s, ry })   draw one tree at (x, 0, z), scale s, yaw ry
 *   TREE_SPECIES                                 every species id with display info
 *
 * Every species is ≤ ~60 triangles at LOD0 (crowns drop to simpler blobs and trunks/accents vanish at LOD1).
 * Foliage parts are `paint: true` so instance tints (forest variety, the decor tint tool) recolour leaves only.
 * Local space follows the kit: +Y up, origin on the ground. Heights ≈ 0.35–0.75 world units (7–15 m).
 */
import { Mat, mix, shade, type MeshBuilder } from '../../kit';
import type { Rng } from '../../../core/rng';

export type TreeSpecies =
  | 'oak'
  | 'pine'
  | 'birch'
  | 'palm'
  | 'baobab'
  | 'acacia'
  | 'cactus'
  | 'jungle'
  | 'willow'
  | 'snowpine'
  | 'larch'
  | 'deadtree'
  | 'mushroom'
  | 'crystal'
  | 'bulb'
  | 'pylon'
  | 'lichen'
  | 'cherry'
  | 'autumn'
  | 'street'
  | 'fern'
  | 'kelp'
  | 'coral'
  | 'shrub';

export const TREE_SPECIES: TreeSpecies[] = [
  'oak', 'pine', 'birch', 'palm', 'baobab', 'acacia', 'cactus', 'jungle', 'willow', 'snowpine', 'larch', 'deadtree',
  'mushroom', 'crystal', 'bulb', 'pylon', 'lichen', 'cherry', 'autumn', 'street', 'fern', 'kelp', 'coral', 'shrub',
];

const TRUNK = [0x6b4a32, 0x7a5638, 0x5e412c];
const OAK = [0x4f8f3a, 0x5a9e42, 0x447f34, 0x66a84a];
const PINE = [0x2f6b3c, 0x2a5f36, 0x37744a];
const BIRCH = [0x8cc35a, 0x9fd067, 0xa9d46a];
const PALM = [0x4f9a3a, 0x5fae44, 0x48903a];
const CHERRY = [0xf2a6c4, 0xf7bfd5, 0xe892b8];
const AUTUMN = [0xe0782a, 0xd9542a, 0xf0a530, 0xc9442a];
const ACACIA = [0x7a9a3a, 0x8aa648, 0x6e8e36];
const JUNGLE = [0x2f8a3a, 0x3a9a42, 0x267a30];
const WILLOW = [0x7aa64a, 0x8db85a, 0x6f9a44];
const LARCH = [0x9ab84a, 0xbab04a, 0x8aa844];
const CAPS = [0x9a5ad0, 0x3fb8c0, 0xe0703a, 0xd04a8a, 0x6a7ae0];
const GILLS = [0x7affd8, 0xff9af0, 0xfff07a, 0x9ac8ff];
const CRYSTALS = [0x9a7aff, 0x4ad0ff, 0xff6ad8, 0x6affd0];
const BULBS = [0xc8ff4a, 0x7aff9a, 0xffe04a, 0x4affd0];
const SNOW = 0xf4f8ff;

type Opts = { x?: number; z?: number; s?: number; ry?: number };

const pick = (r: Rng, a: number[]) => a[Math.floor(r.next() * a.length)];
const F = Mat.Foliage;

/** Low-poly crown blob (flat-shaded sphere). */
function blob(b: MeshBuilder, r: number, y: number, color: number, o: { x?: number; z?: number; sy?: number; sx?: number; sz?: number; ry?: number } = {}): void {
  b.sphere(r, { color, mat: F, paint: true, flat: true, wSeg: b.lod ? 4 : 5, hSeg: b.lod ? 2 : 3, y, x: o.x, z: o.z, sx: o.sx, sy: o.sy ?? 0.92, sz: o.sz, ry: o.ry });
}

function trunk(b: MeshBuilder, r0: number, r1: number, h: number, color: number, seg = 5, o: { x?: number; z?: number; rx?: number; rz?: number } = {}): void {
  b.cyl(r1, r0, h, { color, seg: b.lod ? 3 : seg, capTop: false, flat: true, ...o });
}

const DRAW: Record<TreeSpecies, (b: MeshBuilder, r: Rng) => void> = {
  oak(b, r) {
    const h = r.range(0.16, 0.22);
    trunk(b, 0.032, 0.022, h + 0.05, pick(r, TRUNK));
    const c = pick(r, OAK);
    blob(b, r.range(0.17, 0.2), h + 0.14, c, { sx: 1.05 });
    if (!b.lod) {
      blob(b, r.range(0.11, 0.13), h + 0.1, shade(c, 0.88), { x: r.range(0.08, 0.12), z: r.range(-0.05, 0.05) });
      blob(b, r.range(0.1, 0.12), h + 0.24, shade(c, 1.1), { x: r.range(-0.08, -0.03), z: r.range(-0.06, 0.06) });
    }
  },
  cherry(b, r) {
    const h = r.range(0.15, 0.19);
    trunk(b, 0.03, 0.02, h + 0.06, 0x5a3a2e);
    const c = pick(r, CHERRY);
    blob(b, 0.17, h + 0.13, c, { sx: 1.15, sy: 0.8 });
    if (!b.lod) {
      blob(b, 0.11, h + 0.1, shade(c, 1.06), { x: 0.12 });
      blob(b, 0.1, h + 0.19, mix(c, 0xffffff, 0.25), { x: -0.08, z: 0.06 });
    }
  },
  autumn(b, r) {
    const h = r.range(0.16, 0.21);
    trunk(b, 0.03, 0.02, h + 0.06, 0x5e412c);
    const c = pick(r, AUTUMN);
    blob(b, 0.18, h + 0.14, c);
    if (!b.lod) {
      blob(b, 0.11, h + 0.1, pick(r, AUTUMN), { x: 0.11, z: 0.03 });
      blob(b, 0.1, h + 0.23, shade(c, 1.12), { x: -0.06, z: -0.05 });
    }
  },
  street(b, r) {
    // formal city tree: straight trunk, tidy lollipop crown
    trunk(b, 0.022, 0.016, 0.24, 0x5e4630, 4);
    const c = pick(r, OAK);
    b.sphere(0.13, { color: c, mat: F, paint: true, flat: true, wSeg: b.lod ? 4 : 6, hSeg: b.lod ? 2 : 4, y: 0.33, sy: 1.08 });
  },
  pine(b, r) {
    const h = r.range(0.55, 0.72);
    trunk(b, 0.024, 0.018, 0.16, pick(r, TRUNK), 4);
    const c = pick(r, PINE);
    const tiers = b.lod ? 2 : 3;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers;
      const rad = 0.19 * (1 - f * 0.55) * r.range(0.92, 1.08);
      b.cone(rad, h * 0.42, { color: shade(c, 1 + i * 0.08), mat: F, paint: true, seg: 6, y: 0.1 + f * h * 0.6, flat: true, ry: i * 0.5 });
    }
  },
  snowpine(b, r) {
    const h = r.range(0.5, 0.66);
    trunk(b, 0.024, 0.018, 0.14, 0x4e3524, 4);
    const c = pick(r, PINE);
    const tiers = b.lod ? 2 : 3;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers;
      const rad = 0.18 * (1 - f * 0.55);
      const y = 0.09 + f * h * 0.6;
      b.cone(rad, h * 0.42, { color: shade(c, 0.9 + i * 0.06), mat: F, paint: true, seg: 6, y, flat: true, ry: i * 0.5 });
      // snow mantle on the upper half of each tier
      b.cone(rad * 0.62, h * 0.42 * 0.6, { color: SNOW, seg: 6, y: y + h * 0.42 * 0.4 + 0.004, flat: true, ry: i * 0.5, detail: i > 0 });
    }
  },
  larch(b, r) {
    const h = r.range(0.5, 0.64);
    trunk(b, 0.02, 0.014, 0.14, 0x5a4030, 4);
    const c = pick(r, LARCH);
    b.cone(0.13, h * 0.7, { color: c, mat: F, paint: true, seg: 5, y: 0.1, flat: true });
    b.cone(0.09, h * 0.45, { color: shade(c, 1.12), mat: F, paint: true, seg: 5, y: 0.1 + h * 0.42, flat: true, ry: 0.6, detail: true });
  },
  birch(b, r) {
    const h = r.range(0.3, 0.38);
    trunk(b, 0.018, 0.012, h + 0.08, 0xe8e4dc, 4);
    if (!b.lod) for (let i = 0; i < 3; i++) b.box(0.03, 0.012, 0.03, { color: 0x3a3a3a, y: 0.06 + i * 0.09, ry: i, detail: true });
    const c = pick(r, BIRCH);
    blob(b, 0.11, h + 0.06, c, { sy: 1.5 });
    if (!b.lod) blob(b, 0.08, h + 0.15, shade(c, 1.1), { x: 0.05, sy: 1.4 });
  },
  palm(b, r) {
    const lean = r.range(0.04, 0.1);
    const seg = b.lod ? 2 : 3;
    let x = 0, y = 0;
    for (let i = 0; i < seg; i++) {
      const h = 0.5 / seg;
      b.cyl(0.018 - i * 0.003, 0.024 - i * 0.003, h + 0.01, { color: i % 2 ? 0x9a7a52 : 0x8a6a46, seg: 4, x, y, rz: -lean * (i + 1) * 0.9, capTop: false, flat: true });
      x += Math.sin(lean * (i + 1) * 0.9) * h;
      y += Math.cos(lean * (i + 1) * 0.9) * h;
    }
    const c = pick(r, PALM);
    const n = b.lod ? 4 : 6;
    b.group({ x, y }, () => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
        b.group({ ry: a }, () => {
          // drooping frond: a long thin pyramid tilted down
          b.pyramid(0.07, 0.26, 0.022, { color: i % 2 ? c : shade(c, 0.88), mat: F, paint: true, rx: Math.PI / 2 + 0.55, z: 0.0 });
        });
      }
      if (!b.lod) b.sphere(0.03, { color: 0x6a4a2a, wSeg: 4, hSeg: 2, y: -0.02, flat: true, detail: true });
    });
  },
  baobab(b, r) {
    const h = r.range(0.3, 0.36);
    b.lathe([[0.075, 0], [0.085, 0.06], [0.06, h * 0.6], [0.05, h]], { color: 0x9a8270, seg: b.lod ? 4 : 6, flat: true });
    const c = mix(pick(r, ACACIA), 0x5a8a3a, 0.4);
    const n = b.lod ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      b.group({ ry: a, y: h - 0.02 }, () => {
        if (!b.lod) b.cyl(0.012, 0.02, 0.12, { color: 0x8a7260, seg: 3, rz: 0.7, capTop: false, flat: true, detail: true });
        b.sphere(0.09, { color: c, mat: F, paint: true, flat: true, wSeg: 4, hSeg: 2, y: 0.1, x: 0.09, sy: 0.6 });
      });
    }
  },
  acacia(b, r) {
    trunk(b, 0.02, 0.014, 0.26, 0x6a4a32, 4, { rz: 0.12 });
    if (!b.lod) trunk(b, 0.014, 0.01, 0.14, 0x6a4a32, 3, { rz: -0.5, x: 0.02 });
    const c = pick(r, ACACIA);
    b.cyl(0.24, 0.2, 0.05, { color: c, mat: F, paint: true, seg: 7, y: 0.27, x: 0.03, flat: true, top: shade(c, 1.12) });
    if (!b.lod) b.cyl(0.14, 0.12, 0.04, { color: shade(c, 1.08), mat: F, paint: true, seg: 6, y: 0.31, x: -0.04, z: 0.04, flat: true, detail: true });
  },
  cactus(b, r) {
    const c = r.chance(0.5) ? 0x4f8a4a : 0x5f9a52;
    const h = r.range(0.3, 0.42);
    b.cyl(0.035, 0.04, h, { color: c, seg: b.lod ? 4 : 6, flat: true, paint: true, mat: F });
    if (!b.lod) b.dome(0.035, { color: c, wSeg: 6, hSeg: 2, y: h, flat: true, paint: true, mat: F });
    const arms = r.int(1, 2);
    for (let i = 0; i < arms; i++) {
      const sgn = i === 0 ? 1 : -1;
      const y = h * r.range(0.35, 0.55);
      b.box(0.08, 0.04, 0.045, { color: c, x: sgn * 0.05, y, paint: true, mat: F });
      b.cyl(0.024, 0.026, 0.12, { color: shade(c, 1.06), seg: 5, x: sgn * 0.085, y: y, flat: true, paint: true, mat: F });
    }
    if (!b.lod && r.chance(0.6)) b.box(0.03, 0.02, 0.03, { color: 0xff6fa0, y: h + 0.02, detail: true });
  },
  jungle(b, r) {
    const h = r.range(0.38, 0.5);
    trunk(b, 0.03, 0.02, h, 0x5a4232);
    const c = pick(r, JUNGLE);
    blob(b, 0.21, h + 0.06, c, { sy: 0.55, sx: 1.1 });
    if (!b.lod) {
      blob(b, 0.13, h + 0.12, shade(c, 1.12), { x: 0.06, z: -0.05, sy: 0.6 });
      blob(b, 0.12, h - 0.12, shade(c, 0.9), { x: -0.12, sy: 0.55 });
      b.cyl(0.006, 0.006, h * 0.7, { color: 0x3f7f2a, seg: 3, x: 0.1, y: h * 0.3, capTop: false, detail: true });
    }
  },
  willow(b, r) {
    trunk(b, 0.03, 0.022, 0.2, 0x5e4630);
    const c = pick(r, WILLOW);
    // drooping dome: profile flares out and falls back down like curtains
    b.lathe(
      [[0.05, 0.08], [0.2, 0.12], [0.22, 0.24], [0.17, 0.34], [0.06, 0.4], [0.001, 0.41]],
      { color: c, mat: F, paint: true, seg: b.lod ? 5 : 7, flat: true },
    );
  },
  deadtree(b, r) {
    const c = 0x2c2624;
    trunk(b, 0.026, 0.014, 0.36, c, 4);
    const n = b.lod ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.range(0, 1);
      b.group({ ry: a, y: 0.16 + i * 0.06 }, () => b.cyl(0.004, 0.012, 0.16, { color: c, seg: 3, rz: 0.75, capTop: false, flat: true }));
    }
    // smouldering embers at the roots
    b.box(0.05, 0.016, 0.05, { color: 0xff6a20, mat: Mat.Lava, ry: r.range(0, 1), detail: true });
  },
  mushroom(b, r) {
    const h = r.range(0.28, 0.46);
    const stem = 0xeee2d0;
    b.cyl(0.028, 0.04, h, { color: stem, seg: b.lod ? 4 : 6, flat: true });
    const cap = pick(r, CAPS);
    const cr = r.range(0.15, 0.22);
    b.dome(cr, { color: cap, mat: F, paint: true, wSeg: b.lod ? 5 : 7, hSeg: 2, y: h - 0.01, h: cr * 0.55, flat: true });
    // glowing gills under the cap
    b.cyl(cr * 0.96, cr * 0.4, 0.02, { color: pick(r, GILLS), mat: Mat.Glow, seg: b.lod ? 5 : 7, y: h - 0.03, capTop: false, flat: true, detail: true });
    if (!b.lod) for (let i = 0; i < 3; i++) b.box(0.03, 0.012, 0.03, { color: 0xfff6e8, y: h + cr * 0.38, x: Math.cos(i * 2.1) * cr * 0.45, z: Math.sin(i * 2.1) * cr * 0.45, detail: true });
  },
  crystal(b, r) {
    // a crystal "tree": a faceted trunk that splits into glowing shards
    const c = pick(r, CRYSTALS);
    const h = r.range(0.36, 0.5);
    b.prism(6, 0.05, h * 0.62, { color: mix(c, 0xffffff, 0.3), paint: true, capTop: false });
    b.cone(0.05, h * 0.3, { color: mix(c, 0xffffff, 0.35), mat: Mat.Glow, seg: 6, y: h * 0.62, flat: true });
    const n = b.lod ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      b.group({ ry: a, y: h * (0.3 + (i % 2) * 0.16) }, () => {
        b.group({ rz: 0.62, x: 0.025 }, () => {
          b.prism(5, 0.028, 0.18, { color: mix(c, 0xffffff, 0.4), paint: true, capTop: false });
          b.cone(0.028, 0.08, { color: mix(c, 0xffffff, 0.45), mat: Mat.Glow, seg: 5, y: 0.18, flat: true });
        });
      });
    }
  },
  bulb(b, r) {
    const n = b.lod ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.range(0, 1);
      const h = r.range(0.22, 0.4);
      const lean = r.range(0.12, 0.3);
      b.group({ ry: a }, () => {
        b.cyl(0.008, 0.016, h, { color: 0x6a8a3a, seg: 4, rz: lean, capTop: false, flat: true });
        b.sphere(r.range(0.045, 0.065), { color: pick(r, BULBS), mat: Mat.Glow, wSeg: 4, hSeg: 3, flat: true, x: -Math.sin(lean) * h, y: Math.cos(lean) * h + 0.02 });
      });
    }
    if (!b.lod) for (let i = 0; i < 3; i++) b.group({ ry: i * 2.1 }, () => b.pyramid(0.06, 0.12, 0.02, { color: 0x5a7a2e, mat: F, paint: true, rx: 1.1, detail: true }));
  },
  pylon(b, r) {
    const h = r.range(0.5, 0.7);
    const c = 0x8a929c;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.group({ x: sx * 0.05, z: sz * 0.05 }, () => b.box(0.014, h * 0.85, 0.014, { color: c, mat: Mat.Plain, rx: -sz * 0.06, rz: sx * 0.06 }));
    if (!b.lod) for (let i = 1; i < 3; i++) b.box(0.1 - i * 0.016, 0.01, 0.1 - i * 0.016, { color: shade(c, 0.85), mat: Mat.Plain, y: (h * 0.85 * i) / 3, detail: true });
    b.cyl(0.006, 0.01, h * 0.25, { color: c, mat: Mat.Plain, seg: 3, y: h * 0.82, capTop: false });
    b.box(0.022, 0.022, 0.022, { color: 0xff4040, mat: Mat.Light, y: h * 1.05 });
    if (!b.lod) b.box(0.12, 0.012, 0.012, { color: 0x4ae0ff, mat: Mat.Glow, y: h * 0.62, ry: r.range(0, 3), detail: true });
  },
  lichen(b, r) {
    const h = r.range(0.22, 0.36);
    b.cone(0.06, h, { color: 0x7a7570, seg: 5, flat: true });
    b.cone(0.035, h * 0.6, { color: 0x6a6560, seg: 4, x: 0.05, z: 0.03, flat: true, detail: true });
    const g = r.chance(0.5) ? 0x5affc8 : 0x9aff6a;
    b.box(0.05, 0.02, 0.05, { color: g, mat: Mat.Glow, y: h * 0.3, ry: 0.4 });
    if (!b.lod) b.box(0.03, 0.015, 0.03, { color: g, mat: Mat.Glow, y: h * 0.6, x: 0.01, ry: 1.2, detail: true });
  },
  fern(b, r) {
    const c = pick(r, JUNGLE);
    const n = b.lod ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
      b.group({ ry: a }, () => b.pyramid(0.07, 0.24, 0.016, { color: i % 2 ? c : shade(c, 1.15), mat: F, paint: true, rx: Math.PI / 2 - 0.75 }));
    }
    if (!b.lod) b.sphere(0.03, { color: 0x6a8a3a, wSeg: 4, hSeg: 2, y: 0.02, flat: true, detail: true });
  },
  kelp(b, r) {
    const n = b.lod ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const h = r.range(0.35, 0.6);
      const c = r.chance(0.5) ? 0x5a7a2a : 0x7a6a2a;
      b.box(0.018, h, 0.006, { color: c, mat: F, paint: true, x: r.range(-0.06, 0.06), z: r.range(-0.06, 0.06), ry: r.range(0, 3) });
      if (!b.lod) b.box(0.05, 0.03, 0.005, { color: shade(c, 1.15), mat: F, paint: true, x: r.range(-0.04, 0.04), y: h * r.range(0.4, 0.8), ry: r.range(0, 3), detail: true });
    }
  },
  coral(b, r) {
    const cols = [0xff7a8a, 0xffa04a, 0xc87aff, 0xffe06a];
    const c = pick(r, cols);
    b.cyl(0.02, 0.03, 0.1, { color: c, seg: 4, capTop: false, flat: true });
    const n = b.lod ? 2 : 4;
    for (let i = 0; i < n; i++) b.group({ ry: (i / n) * Math.PI * 2, y: 0.06 }, () => b.cyl(0.008, 0.016, 0.12, { color: shade(c, 1.1), seg: 3, rz: 0.6, capTop: false, flat: true }));
    if (!b.lod) b.sphere(0.04, { color: mix(c, 0xffffff, 0.2), wSeg: 4, hSeg: 2, x: 0.08, y: 0.02, flat: true, detail: true });
  },
  shrub(b, r) {
    const c = pick(r, OAK);
    blob(b, 0.09, 0.05, c, { sy: 0.7, sx: 1.2 });
    if (!b.lod) blob(b, 0.06, 0.05, shade(c, 1.12), { x: 0.07, sy: 0.75 });
  },
};

/** Draw one tree / plant of `species` at (x, 0, z), uniform scale s, yaw ry. */
export function drawTree(b: MeshBuilder, species: TreeSpecies, rng: Rng, o: Opts = {}): void {
  const fn = DRAW[species] ?? DRAW.oak;
  b.group({ x: o.x ?? 0, z: o.z ?? 0, s: o.s ?? 1, ry: o.ry ?? 0 }, () => fn(b, rng));
}
