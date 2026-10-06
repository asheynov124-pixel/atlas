/**
 * zoned-rc · Commercial growables (OWNER: zoned-rc).
 *
 *   Low density    corner shop · café · strip plaza · market hall · shophouses · hover-fuel stop · orbit diner
 *   High density   shopping mall · department store · trade tower · retail plaza · galleria · megastore · market dome
 *
 * Shops face the street (+Z) with lit glazing, awnings/canopies and glowing signage; the style Skin decides
 * what an awning, a sign or a roof looks like. Budget handling mirrors residential.ts (`need()` reserves).
 */
import { FL, G, Mat, byL, hovercar, lerpL, mix, shade, storeys, umbrella } from './common';
import { factory } from './rc';
import { DET, fits, need, type RC } from './skin';

const prest = (L: number): number => (L - 1) / 4;

/** Asphalt parking apron with painted bays and a few hover-cars (decor beyond the apron is optional). */
function parking(rc: RC, x: number, z: number, w: number, d: number, cars: number): void {
  const { b, p } = rc;
  b.plane(w, d, { color: p.asphalt, paint: false, x, z, y: G + 0.003 });
  const bays = Math.max(2, Math.round(w / 0.16));
  if (fits(rc, bays * 2)) for (let i = 1; i < bays; i++) b.plane(0.008, d * 0.6, { color: 0xe8e8e0, x: x - w / 2 + (w * i) / bays, z: z - d * 0.15, y: G + 0.005, ...DET });
  const colors = [0xd04040, 0x3a6ad0, 0xf0f0f0, 0x2a2a30, 0xe0b040, 0x40b080];
  for (let i = 0; i < cars; i++) {
    if (!fits(rc, 20)) break;
    hovercar(rc.b, x - w / 2 + (w * ((i * 2 + 1) % bays + 0.5)) / bays, z - d * 0.15, 0, colors[(rc.seed + i) % colors.length], G + 0.003);
  }
}

/** Tall roadside pylon with a glowing sign board. */
function pylon(rc: RC, x: number, z: number, h: number, n: number, color?: number): void {
  const { b, p } = rc;
  b.box(0.04, h, 0.04, { color: p.metal, mat: Mat.Metal, x, z, y: G });
  rc.sk.sign(rc, { w: 0.22, h: 0.12, kind: 'board', n, color }, x, G + h, z + 0.025);
  // the far side lights up too, so the pylon reads from both directions of traffic
  if (fits(rc, 24)) b.group({ x, z, ry: Math.PI }, () => rc.sk.sign(rc, { w: 0.22, h: 0.12, kind: 'board', n, color }, 0, G + h, 0.025));
}

/** Flag poles along the front (prestige). */
function flags(rc: RC, xs: number[], z: number, y: number): void {
  const { b, p } = rc;
  for (let i = 0; i < xs.length; i++) {
    if (!fits(rc, 10)) return;
    b.cyl(0.006, 0.006, 0.3, { color: 0xdedede, seg: 3, x: xs[i], z, y, capTop: false, ...DET });
    b.panel(0.1, 0.06, { color: [p.accent, p.accent2, p.accent3][i % 3], x: xs[i] + 0.05, z, y: y + 0.22, both: true, ...DET });
  }
}

/**
 * Night accent lighting for a commercial block: a lit roof edge along the street face (warm white by
 * default — neutral trim by day, a glowing outline after dark) and a pair of bollard lights on the lot.
 */
export function shopLights(rc: RC, x: number, z: number, w: number, top: number, color = litColor(rc)): void {
  const { b } = rc;
  if (fits(rc, 10)) b.box(w + 0.02, 0.018, 0.018, { color, mat: Mat.Light, x, z, y: top - 0.012, paint: false });
  if (!rc.lo && fits(rc, 20))
    for (const s of [-1, 1]) b.box(0.03, 0.06, 0.03, { color: 0xfff0d0, mat: Mat.Light, x: s * 0.5, z: 0.66, y: G, ...DET });
}

/** Accent light colour per style: warm white for the classic families, the style accent for the futurists. */
export function litColor(rc: RC): number {
  return rc.sid === 'neo' || rc.sid === 'cyber' || rc.sid === 'crystal' || rc.sid === 'organic' || rc.sid === 'ice' ? rc.p.accent : 0xffe2a8;
}

/** Market stall: counter + striped awning. */
function stall(rc: RC, x: number, z: number, color: number): void {
  const { b } = rc;
  if (!fits(rc, 26)) return;
  b.box(0.18, 0.07, 0.1, { color: 0x8a6a4a, x, z, y: G, ...DET });
  b.wedge(0.22, 0.05, 0.16, { color, x, z, y: G + 0.15, ry: Math.PI, ...DET });
  b.box(0.012, 0.15, 0.012, { color: 0xdddddd, x: x - 0.1, z: z + 0.06, y: G, ...DET });
}

// ═══════════════════════════════════════════════════════════════ LOW DENSITY

export const cornerShop = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const w = vr.range(0.88, 1.0), d = vr.range(0.66, 0.74);
  const glyphN = vr.int(4, 6);
  const fl = byL(L, [1, 2, 3, 3, 4]);
  const h = storeys(fl);
  const z = -0.06;
  sk.lot(rc, 'pave');
  need(rc, [['shop', L >= 2 ? 2 : 1], ['roof', 1], ['sign', L >= 3 ? 1 : 0]]);
  sk.block(rc, { z, w, d, h, use: 'shop', prestige: prest(L) });
  need(rc, [['shop', L >= 2 ? 1 : 0], ['roof', 1], ['sign', L >= 3 ? 1 : 0]]);
  b.group({ z: z + d / 2 }, () => sk.shopfront(rc, { w: sk.frontWidth(w, d) - 0.04, h: FL * 1.05, glyphs: glyphN }));
  need(rc, [['roof', 1], ['sign', L >= 3 ? 1 : 0]]);
  if (L >= 2) b.group({ x: w / 2, z, ry: Math.PI / 2 }, () => sk.shopfront(rc, { w: sk.frontWidth(d, w) - 0.06, h: FL * 1.05, glyphs: 3 }));
  need(rc, [['sign', L >= 3 ? 1 : 0]]);
  sk.roof(rc, { z, y: G + h, w, d, kind: L >= 4 ? 'garden' : fl >= 2 ? 'pitched' : 'flat', prestige: prest(L) });
  need(rc);
  if (L >= 3) sk.sign(rc, { w: 0.06, h: Math.min(h - FL * 1.3, FL * 2.2), kind: 'blade', color: rc.p.accent2 }, w / 2 - 0.02, FL * 1.2, z + d / 2);
  if (fl >= 2) b.group({ z: z + d / 2 }, () => sk.balconies(rc, { w: Math.min(w * 0.8, sk.frontWidth(w, d)), y0: FL * 1.5, y1: h - FL * 0.5, every: 1, cols: 3 }));
  shopLights(rc, 0, z + d / 2 + 0.01, sk.frontWidth(w, d), G + h);
  sk.tree(rc, -0.5, 0.58, 0.75);
  sk.lamp(rc, 0.48, 0.62, 0.24);
});

export const cafe = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const w = vr.range(0.68, 0.8), d = vr.range(0.48, 0.56);
  const umb = vr.pick([p.awning, p.accent, 0xf4efe6, p.accent2]);
  const fl = L >= 2 ? 2 : 1;
  const h = storeys(fl);
  const z = -0.26;
  sk.lot(rc, 'pave');
  need(rc, [['shop', 1], ['roof', 1]]);
  sk.block(rc, { z, w, d, h, use: 'shop', color: p.wall2, prestige: prest(L) });
  need(rc, [['roof', 1]]);
  b.group({ z: z + d / 2 }, () => sk.shopfront(rc, { w: sk.frontWidth(w, d) - 0.04, h: FL * 1.05, kind: 'cafe', glyphs: 4 }));
  need(rc);
  sk.roof(rc, { z, y: G + h, w, d, kind: L >= 3 ? 'deck' : fl === 2 ? 'pitched' : 'flat', prestige: prest(L) });
  // terrace: umbrellas + tables
  const spots: [number, number][] = [[-0.34, 0.28], [0.06, 0.34], [0.42, 0.24], [-0.14, 0.58], [0.26, 0.6]];
  const n = byL(L, [2, 3, 4, 5, 5]);
  for (let i = 0; i < n; i++) if (fits(rc, 18)) umbrella(b, spots[i][0], spots[i][1], i % 2 ? umb : mix(umb, 0xffffff, 0.45), 0.95);
  if (L >= 3 && fits(rc, 36)) {
    umbrella(b, -w * 0.25, z, umb, 0.8, G + h + 0.02);
    umbrella(b, w * 0.22, z + 0.05, mix(umb, 0xffffff, 0.45), 0.8, G + h + 0.02);
  }
  shopLights(rc, 0, z + d / 2 + 0.01, sk.frontWidth(w, d), G + h);
  sk.shrub(rc, -0.6, 0.0, 1.1);
  sk.lamp(rc, 0.58, 0.48, 0.24);
});

export const stripPlaza = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const fl = L >= 3 ? 2 : 1;
  const h = storeys(fl);
  const w = 1.3, d = 0.42, z = -0.36;
  const cols = [p.accent, p.accent2, p.accent3];
  const pyl = vr.chance(0.5) ? 1 : -1;
  sk.lot(rc, 'pave');
  need(rc, [['shop', 3], ['roof', 1], ['sign', 1]], 20);
  sk.block(rc, { z, w, d, h, use: 'shop', prestige: prest(L) });
  for (let i = 0; i < 3; i++) {
    need(rc, [['shop', 2 - i], ['roof', 1], ['sign', 1]], 20);
    b.group({ x: (i - 1) * (sk.frontWidth(w, d) / 3), z: z + d / 2 }, () => sk.shopfront(rc, { w: sk.frontWidth(w, d) / 3 - 0.03, h: FL * 1.05, glyphs: 3 + ((rc.seed + i) % 3), color: cols[i] }));
  }
  need(rc, [['sign', 1]], 20);
  sk.roof(rc, { z, y: G + h, w, d, kind: 'mech', prestige: prest(L) });
  need(rc);
  pylon(rc, pyl * 0.6, 0.42, lerpL(L, 0.36, 0.52), 4);
  parking(rc, -pyl * 0.08, 0.3, 0.96, 0.5, byL(L, [2, 3, 3, 4, 4]));
  shopLights(rc, 0, z + d / 2 + 0.01, sk.frontWidth(w, d), G + h);
});

export const marketHall = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const w = vr.range(1.04, 1.16), d = vr.range(0.7, 0.8);
  const fl = byL(L, [2, 2, 2, 3, 3]);
  const h = storeys(fl);
  const z = -0.18;
  sk.lot(rc, 'plaza');
  need(rc, [['roof', 1], ['portico', 1], ['sign', 1]]);
  sk.block(rc, { z, w, d, h, use: 'shop', prestige: prest(L) });
  need(rc, [['portico', 1], ['sign', 1]]);
  sk.roof(rc, { z, y: G + h, w, d, kind: 'pitched', prestige: prest(L) });
  need(rc, [['sign', 1]]);
  b.group({ z: z + d / 2 }, () => sk.portico(rc, w * 0.5, FL * 1.3));
  need(rc);
  sk.sign(rc, { w: w * 0.5, h: 0.08, kind: 'board', n: 6 }, 0, FL * 1.45, z + d / 2 + 0.02);
  const sc = [p.accent, 0xf4efe6, p.accent2, p.awning, p.accent3];
  const n = byL(L, [2, 3, 3, 4, 5]);
  const sx = [-0.48, 0.48, -0.2, 0.2, 0];
  const sz = [0.42, 0.42, 0.62, 0.62, 0.7];
  for (let i = 0; i < n; i++) stall(rc, sx[i], sz[i], sc[i]);
  shopLights(rc, 0, z + d / 2 + 0.01, sk.frontWidth(w, d), G + h);
  sk.tree(rc, -0.62, 0.0, 0.8);
  sk.tree(rc, 0.62, 0.0, 0.8);
});

export const shophouses = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const d = vr.range(0.64, 0.72);
  const tallLeft = vr.chance(0.5);
  const base = byL(L, [2, 3, 3, 4, 5]);
  const uw = 0.52;
  const z = -0.08;
  sk.lot(rc, 'pave');
  for (let i = 0; i < 2; i++) {
    const x = (i - 0.5) * uw;
    const fl = base + ((i === 0) === tallLeft && L >= 3 ? 1 : 0);
    const h = storeys(fl);
    need(rc, [['block', 1 - i], ['shop', 2 - i], ['roof', 2 - i], ['sign', 2 - i]]);
    sk.block(rc, { x, z, w: uw - 0.008, d, h, use: 'shop', color: i ? p.wall2 : p.wall, prestige: prest(L) });
    need(rc, [['block', 1 - i], ['shop', 1 - i], ['roof', 2 - i], ['sign', 2 - i]]);
    b.group({ x, z: z + d / 2 }, () => sk.shopfront(rc, { w: sk.frontWidth(uw, d) - 0.06, h: FL * 1.05, glyphs: 3 + i, color: i ? p.accent2 : p.accent }));
    need(rc, [['block', 1 - i], ['shop', 1 - i], ['roof', 1 - i], ['sign', 2 - i]]);
    sk.roof(rc, { x, z, y: G + h, w: uw - 0.008, d, kind: L >= 5 && i === 1 ? 'deck' : 'pitched', prestige: prest(L) });
    need(rc, [['block', 1 - i], ['shop', 1 - i], ['roof', 1 - i], ['sign', 1 - i]]);
    sk.sign(rc, { w: 0.05, h: Math.min(h - FL * 1.4, FL * 2.5), kind: 'blade', color: i ? p.accent : p.accent3 }, x + (i ? 1 : -1) * (uw / 2 - 0.05), FL * 1.25, z + d / 2);
  }
  need(rc);
  for (let i = 0; i < 2; i++) b.group({ x: (i - 0.5) * uw, z: z + d / 2 }, () => sk.balconies(rc, { w: Math.min(uw * 0.8, sk.frontWidth(uw, d)), y0: FL * 1.5, y1: storeys(base) - FL * 0.6, every: 1, cols: 2 }));
  sk.lamp(rc, 0, 0.62, 0.24);
});

export const fuelStop = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const f = vr.chance(0.5) ? 1 : -1;
  const car = vr.pick([0xd04040, 0x3a6ad0, 0xe0b040, 0x40b080]);
  sk.lot(rc, 'pave');
  b.plane(1.1, 0.62, { color: p.asphalt, paint: false, z: 0.22, y: G + 0.003 });
  // kiosk
  const kw = 0.62, kd = 0.34, kz = -0.42;
  need(rc, [['shop', 1], ['roof', 1], ['sign', 1]], 60);
  sk.block(rc, { x: -f * 0.12, z: kz, w: kw, d: kd, h: storeys(1), use: 'shop', prestige: prest(L) });
  need(rc, [['roof', 1], ['sign', 1]], 60);
  b.group({ x: -f * 0.12, z: kz + kd / 2 }, () => sk.shopfront(rc, { w: sk.frontWidth(kw, kd) - 0.04, h: FL * 1.05, glyphs: 3 }));
  need(rc, [['sign', 1]], 60);
  sk.roof(rc, { x: -f * 0.12, z: kz, y: G + storeys(1), w: kw, d: kd, kind: 'flat', prestige: prest(L) });
  need(rc, [['sign', 1]]);
  // canopy over the pumps
  const cy = 0.34;
  b.box(0.92, 0.035, 0.5, { color: p.trim, x: 0, z: 0.2, y: cy, top: shade(p.trim, 1.1) });
  b.box(0.92, 0.014, 0.012, { color: p.accent, mat: Mat.Glow, z: 0.45, y: cy + 0.01, paint: false });
  for (const sx of [-0.34, 0.34]) b.box(0.03, cy - G, 0.03, { color: p.metal, mat: Mat.Metal, x: sx, z: 0.2, y: G });
  for (const sx of [-0.18, 0.18]) {
    b.box(0.06, 0.11, 0.05, { color: 0xe8e8e8, x: sx, z: 0.2, y: G });
    b.box(0.045, 0.04, 0.005, { color: p.accent2, mat: Mat.Glow, x: sx, z: 0.226, y: G + 0.06, paint: false });
  }
  need(rc);
  pylon(rc, f * 0.62, 0.4, lerpL(L, 0.42, 0.62), 3, 0xffd24a);
  if (fits(rc, 20)) hovercar(b, -0.18, 0.2, 0, car, G + 0.003);
  if (L >= 2 && fits(rc, 20)) hovercar(b, 0.18, 0.24, Math.PI, mix(car, 0x3a6ad0, 0.6), G + 0.003);
  if (L >= 3) sk.tree(rc, f * 0.6, -0.36, 0.8);
});

export const diner = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const neon = vr.pick([0xff4a8a, 0x3fe0ff, 0xffd24a, 0x7aff9a]);
  const w = 0.9, d = 0.42, z = -0.2;
  sk.lot(rc, 'pave');
  const h = storeys(1, 0.06);
  need(rc, [['shop', 1], ['sign', 1]], 30);
  sk.block(rc, { z, w, d, h, use: 'shop', color: mix(p.wall, 0xd8dde4, 0.5), prestige: prest(L) });
  need(rc, [['sign', 1]], 30);
  b.group({ z: z + d / 2 }, () => sk.shopfront(rc, { w: sk.frontWidth(w, d) - 0.06, h: FL, glyphs: 0 }));
  // chrome band + neon stripe wrapping the diner
  b.box(w + 0.02, 0.03, d + 0.02, { color: 0xd8dde4, mat: Mat.Metal, z, y: G + h - 0.035, paint: false });
  b.box(w + 0.025, 0.012, d + 0.025, { color: neon, mat: Mat.Glow, z, y: G + 0.06, paint: false });
  need(rc);
  sk.sign(rc, { w: 0.6, h: 0.16, kind: 'roof', n: 5, color: neon }, 0, G + h, z);
  parking(rc, 0, 0.36, 1.0, 0.36, byL(L, [1, 2, 3, 3, 3]));
  sk.lamp(rc, -0.6, 0.0, 0.26);
});

// ═══════════════════════════════════════════════════════════════ HIGH DENSITY

export const mall = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const w = vr.range(1.28, 1.36), d = vr.range(0.9, 0.98);
  const fl = byL(L, [2, 2, 3, 3, 4]);
  const h = storeys(fl);
  sk.lot(rc, 'plaza');
  need(rc, [['shop', 1], ['roof', 1], ['sign', 1], ['pod', L >= 4 ? 1 : 0]], 20);
  sk.block(rc, { z: -0.04, w, d, h, use: 'shop', color: p.wall2, prestige: prest(L) });
  need(rc, [['roof', 1], ['sign', 1], ['pod', L >= 4 ? 1 : 0]], 20);
  b.group({ z: -0.04 + d / 2 }, () => sk.shopfront(rc, { w: Math.min(w * 0.62, sk.frontWidth(w, d)), h: FL * 1.2, kind: 'big', glyphs: 0 }));
  // glazed entrance atrium
  b.box(0.42, h * 0.8, 0.12, { color: mix(p.glass, 0xffffff, 0.3), mat: Mat.Glass, z: -0.04 + d / 2 + 0.05, y: G, top: p.trim });
  need(rc, [['sign', 1], ['pod', L >= 4 ? 1 : 0]]);
  sk.roof(rc, { z: -0.04, y: G + h, w, d, kind: 'mech', prestige: prest(L) });
  need(rc, [['pod', L >= 4 ? 1 : 0]]);
  sk.sign(rc, { w: w * 0.5, h: 0.11, kind: 'board', n: 6 }, 0, G + h - 0.16, -0.04 + d / 2 + 0.11);
  need(rc);
  if (L >= 4) sk.pod(rc, w * 0.2, -0.1, 0.28, 0.24, true, G + h);
  shopLights(rc, 0, -0.04 + d / 2 + 0.01, sk.frontWidth(w, d), G + h);
  flags(rc, [-0.5, 0.42], 0.5, G);
});

export const deptStore = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const w = vr.range(1.1, 1.18), d = vr.range(0.86, 0.94);
  const fl = byL(L, [3, 4, 5, 6, 7]);
  const h = storeys(fl);
  const z = -0.06;
  sk.lot(rc, 'plaza');
  need(rc, [['shop', 1], ['roof', 1], ['sign', 2]]);
  sk.block(rc, { z, w, d, h, use: 'shop', prestige: prest(L) });
  need(rc, [['roof', 1], ['sign', 2]]);
  b.group({ z: z + d / 2 }, () => sk.shopfront(rc, { w: sk.frontWidth(w, d) - 0.06, h: FL * 1.2, kind: 'big', glyphs: 7 }));
  need(rc, [['sign', 2]]);
  sk.roof(rc, { z, y: G + h, w, d, kind: L >= 4 ? 'deck' : 'flat', prestige: prest(L) });
  need(rc, [['sign', 1]]);
  sk.sign(rc, { w: 0.08, h: Math.min(h - FL * 1.6, FL * 4), kind: 'blade', color: p.accent }, -w / 2 + 0.05, FL * 1.4, z + d / 2);
  need(rc);
  sk.sign(rc, { w: w * 0.6, h: 0.14, kind: 'roof', n: 6 }, 0, G + h, z + d * 0.2);
  shopLights(rc, 0, z + d / 2 + 0.01, sk.frontWidth(w, d), G + h);
  flags(rc, [-0.3, 0.3], z + d / 2 + 0.02, G + h);
  sk.tree(rc, 0.6, 0.6, 0.75);
});

export const tradeTower = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const tw = vr.range(0.74, 0.84), td = vr.range(0.64, 0.72);
  const fl = byL(L, [10, 14, 20, 26, 32]);
  const ph = storeys(2, 0);
  sk.lot(rc, 'plaza');
  need(rc, [['shop', 1], ['tower', 1], ['crown', 1], ['sign', 1]], 30);
  sk.block(rc, { z: -0.04, w: 1.28, d: 0.94, h: ph, use: 'shop', prestige: prest(L) });
  need(rc, [['tower', 1], ['crown', 1], ['sign', 1]], 30);
  b.group({ z: 0.43 }, () => sk.shopfront(rc, { w: Math.min(1.04, sk.frontWidth(1.28, 0.94) - 0.04), h: FL * 1.15, kind: 'big', glyphs: 6 }));
  const th = storeys(fl, 0);
  need(rc, [['crown', 1], ['sign', 1]], 30);
  sk.tower(rc, { z: -0.1, y: G + ph, w: tw, d: td, h: th, use: 'office', prestige: prest(L) });
  // billboards on the flanks
  const bh = Math.min(th * 0.22, 0.6);
  for (const s of [-1, 1]) {
    if (!fits(rc, 24)) break;
    b.group({ x: (s * tw) / 2 + s * 0.02, z: -0.1, ry: (s * Math.PI) / 2 }, () => {
      // steel mounting frame reaching back into the facade (round towers curve away from a flat screen)
      b.box(td * 0.62, bh * 0.86, 0.2, { color: 0x2a2d36, mat: Mat.Metal, y: G + ph + th * 0.45 + bh * 0.07, z: -0.1, paint: false });
      sk.sign(rc, { w: td * 0.8, h: bh, kind: 'screen' }, 0, G + ph + th * 0.45, 0);
    });
  }
  need(rc, [['sign', 1]]);
  sk.crown(rc, { z: -0.1, y: G + ph + th, w: tw, d: td, prestige: prest(L), kind: rc.seed });
  need(rc);
  sk.sign(rc, { w: tw * 0.9, h: 0.12, kind: 'board', n: 5 }, 0, G + ph + th - 0.2, -0.1 + td / 2 + 0.01);
  shopLights(rc, 0, 0.44, sk.frontWidth(1.28, 0.94), G + ph);
});

export const retailPlaza = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const tw = vr.range(0.62, 0.72), td = vr.range(0.54, 0.62);
  const pf = byL(L, [2, 2, 3, 3, 3]);
  const fl = byL(L, [6, 9, 12, 16, 20]);
  const ph = storeys(pf, 0);
  sk.lot(rc, 'plaza');
  need(rc, [['shop', 2], ['tower', 1], ['roof', 1], ['sign', 1]]);
  sk.block(rc, { z: -0.04, w: 1.28, d: 0.94, h: ph, use: 'shop', prestige: prest(L) });
  need(rc, [['shop', 1], ['tower', 1], ['roof', 1], ['sign', 1]]);
  b.group({ z: 0.43 }, () => sk.shopfront(rc, { w: Math.min(1.06, sk.frontWidth(1.28, 0.94) - 0.04), h: FL * 1.1, glyphs: 6 }));
  need(rc, [['tower', 1], ['roof', 1], ['sign', 1]]);
  b.group({ x: 0.64, z: -0.04, ry: Math.PI / 2 }, () => sk.shopfront(rc, { w: Math.min(0.6, sk.frontWidth(0.94, 1.28) - 0.04), h: FL * 1.1, glyphs: 4, color: p.accent2 }));
  const th = storeys(fl, 0);
  need(rc, [['roof', 1], ['sign', 1]]);
  sk.tower(rc, { x: -0.22, z: -0.14, y: G + ph, w: tw, d: td, h: th, use: 'office', prestige: prest(L) });
  need(rc, [['sign', 1]]);
  sk.roof(rc, { x: -0.22, z: -0.14, y: G + ph + th, w: tw, d: td, kind: 'mech', prestige: prest(L) });
  need(rc);
  sk.sign(rc, { w: tw * 0.9, h: 0.16, kind: 'roof', n: 5 }, -0.22, G + ph + th, -0.14);
  shopLights(rc, 0, 0.44, sk.frontWidth(1.28, 0.94), G + ph);
  sk.terrace(rc, 0.38, 0.14, G + ph, 0.44, 0.46);
  sk.tree(rc, 0.38, 0.18, 0.7, G + ph);
});

export const galleria = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const fl = byL(L, [2, 3, 3, 4, 5]);
  const h = storeys(fl);
  const d = vr.range(0.84, 0.9);
  sk.lot(rc, 'plaza');
  need(rc, [['block', 1], ['shop', 2], ['roof', 2], ['portico', 1]], 30);
  sk.block(rc, { x: -0.42, w: 0.42, d, h, use: 'shop', prestige: prest(L) });
  need(rc, [['shop', 2], ['roof', 2], ['portico', 1]], 30);
  sk.block(rc, { x: 0.42, w: 0.42, d, h, use: 'shop', color: p.wall2, prestige: prest(L) });
  need(rc, [['shop', 1], ['roof', 2], ['portico', 1]], 30);
  b.group({ x: -0.42, z: d / 2 }, () => sk.shopfront(rc, { w: Math.min(0.38, sk.frontWidth(0.42, d) - 0.02), h: FL * 1.05, glyphs: 3 }));
  need(rc, [['roof', 2], ['portico', 1]], 30);
  b.group({ x: 0.42, z: d / 2 }, () => sk.shopfront(rc, { w: Math.min(0.38, sk.frontWidth(0.42, d) - 0.02), h: FL * 1.05, glyphs: 4, color: p.accent2 }));
  need(rc, [['roof', 1], ['portico', 1]], 30);
  sk.roof(rc, { x: -0.42, y: G + h, w: 0.42, d, kind: 'flat', prestige: prest(L) });
  need(rc, [['portico', 1]], 30);
  sk.roof(rc, { x: 0.42, y: G + h, w: 0.42, d, kind: 'flat', prestige: prest(L) });
  // the glass barrel vault between the wings
  const vr2 = 0.21;
  b.cyl(vr2, vr2, d, { color: mix(p.glass, 0xffffff, 0.35), mat: Mat.Glass, seg: 6, arc: Math.PI, rz: Math.PI / 2, ry: Math.PI / 2, z: -d / 2, y: G + h - 0.08, capTop: true, paint: false });
  b.box(0.42, h - 0.08, 0.02, { color: mix(p.glass, 0xffffff, 0.2), mat: Mat.Glass, z: d / 2 - 0.02, y: G, paint: false });
  need(rc);
  b.group({ z: d / 2 }, () => sk.portico(rc, 0.36, FL * 1.4));
  if (fits(rc, sk.cost.sign)) sk.sign(rc, { w: 0.34, h: 0.08, kind: 'board', n: 5 }, 0, G + h - 0.04, d / 2 + 0.03);
  shopLights(rc, -0.42, d / 2 + 0.01, sk.frontWidth(0.42, d), G + h);
  shopLights(rc, 0.42, d / 2 + 0.01, sk.frontWidth(0.42, d), G + h);
  flags(rc, [-0.2, 0.2], d / 2 + 0.12, G);
});

export const megastore = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const w = vr.range(1.26, 1.36), d = vr.range(0.62, 0.7);
  const fl = byL(L, [2, 2, 2, 3, 3]);
  const h = storeys(fl);
  const z = -0.26;
  sk.lot(rc, 'pave');
  need(rc, [['shop', 1], ['roof', 1], ['sign', 1]], 30);
  sk.block(rc, { z, w, d, h, use: 'shop', color: p.wall2, prestige: prest(L) });
  need(rc, [['roof', 1], ['sign', 1]], 30);
  b.group({ z: z + d / 2 }, () => sk.shopfront(rc, { w: Math.min(0.6, sk.frontWidth(w, d)), h: FL * 1.1, kind: 'big', glyphs: 0 }));
  need(rc, [['sign', 1]], 30);
  sk.roof(rc, { z, y: G + h, w, d, kind: 'mech', prestige: prest(L) });
  need(rc, [], 30);
  sk.sign(rc, { w: w * 0.62, h: 0.14, kind: 'board', n: 7, color: vr.pick([0xffd24a, 0xff5a5a, 0x4ab0ff]) }, 0, G + h - 0.2, z + d / 2 + 0.03);
  b.box(w + 0.02, 0.05, 0.03, { color: p.accent, x: 0, z: z + d / 2 + 0.01, y: G + h - 0.06, paint: false });
  need(rc);
  parking(rc, 0, 0.36, 1.2, 0.5, byL(L, [3, 4, 5, 5, 5]));
  shopLights(rc, 0, z + d / 2 + 0.01, sk.frontWidth(w, d), G + h);
});

export const marketDome = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const r = lerpL(L, 0.62, 0.74) + vr.range(-0.02, 0.02);
  sk.lot(rc, 'plaza');
  need(rc, [['portico', 1], ['sign', 1], ['pod', L >= 4 ? 1 : 0]]);
  const top = sk.pod(rc, 0, -0.04, r, r * 0.78, true);
  need(rc, [['sign', 1], ['pod', L >= 4 ? 1 : 0]]);
  b.group({ z: -0.04 + r * 0.92 }, () => sk.portico(rc, 0.4, FL * 1.4));
  need(rc, [['pod', L >= 4 ? 1 : 0]]);
  sk.sign(rc, { w: 0.4, h: 0.08, kind: 'board', n: 6 }, 0, FL * 1.5, -0.04 + r * 0.96 + 0.06);
  need(rc);
  if (L >= 4) sk.pod(rc, 0, -0.04, r * 0.32, r * 0.3, false, top - 0.06);
  for (const s of [-1, 1]) sk.tree(rc, s * 0.64, 0.46, 0.8);
  if (L >= 3) for (let i = 0; i < 2; i++) stall(rc, (i - 0.5) * 0.9, 0.64, i ? p.accent : p.accent2);
});
