/**
 * zoned-rc · Residential growables (OWNER: zoned-rc).
 *
 *   Low density   cottage · family home · bungalow · duplex · dome home · villa · grand estate
 *   Medium        townhouses · terrace row · walk-up flats · courtyard apartments · mid-rise · stepped terraces
 *   High          slab · point tower · rotunda · twin towers · sky-garden tower · podium tower · spire · icon
 *
 * Each factory describes massing as a function of level (1..5) and variant; the style Skin supplies the
 * architecture. Layout choices come from rc.vr (variant-stable) BEFORE any level-dependent branching, so a
 * building keeps its identity while it grows. Level 1 = humble, level 5 = prestige.
 * Budget: `need()` reserves triangles for mandatory parts still to come, so optional trims/decor drawn
 * earlier never push the total over the 400-triangle growable budget.
 */
import { FL, G, Mat, byL, hovercar, lerpL, ngon, polyTop, pool, shade, storeys } from './common';
import { factory } from './rc';
import { DET, fits, need, type RC } from './skin';

const prest = (L: number): number => (L - 1) / 4;
const side = (rc: RC): number => (rc.vr.chance(0.5) ? 1 : -1);

/** Garden boundary framing a front garden, either side of the path (style fence; optional decor). */
function frontHedges(rc: RC, z: number, gap: number, span = 0.78): void {
  if (!fits(rc, 24)) return;
  const w = (span - gap) / 2;
  rc.sk.fence(rc, -gap / 2 - w / 2, z, w);
  rc.sk.fence(rc, gap / 2 + w / 2, z, w);
}

// ═══════════════════════════════════════════════════════════════ LOW DENSITY

export const cottage = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const f = side(rc);
  const w = vr.range(0.56, 0.7), d = vr.range(0.44, 0.52);
  const roof = vr.pick(['gable', 'gable', 'hip', 'front'] as const);
  const tz = vr.range(0.22, 0.42);
  sk.lot(rc, 'lawn', 0.12);
  need(rc, L >= 2 ? [['house', 0.6]] : []);
  sk.house(rc, { x: L >= 2 ? -f * 0.08 : 0, z: -0.14, w: w + (L >= 4 ? 0.1 : 0), d: d + (L >= 5 ? 0.06 : 0), floors: L >= 3 ? 2 : 1, roof, prestige: prest(L) });
  need(rc);
  if (L >= 2 && fits(rc, sk.cost.house * 0.6)) sk.house(rc, { x: f * (w / 2 + 0.1), z: -0.28, w: 0.24, d: 0.26, floors: 1, roof: 'shed', door: false });
  sk.tree(rc, -f * 0.52, tz, 0.9 + L * 0.06);
  if (L >= 4 && fits(rc, 12)) pool(b, f * 0.42, 0.12, 0.2, 0.26, rc.p.pave, G, true);
  if (L >= 2) sk.tree(rc, f * 0.56, 0.44, 0.82);
  if (L >= 3) frontHedges(rc, 0.7, 0.16);
  sk.lamp(rc, 0.12, 0.66);
});

export const familyHome = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const f = side(rc);
  const w = vr.range(0.62, 0.74), d = vr.range(0.48, 0.56);
  const roof = vr.pick(['gable', 'hip', 'hip', 'front'] as const);
  const car = vr.pick([0xd04040, 0x3a6ad0, 0xf0f0f0, 0x2a2a30, 0xe0b040]);
  sk.lot(rc, 'lawn');
  b.plane(0.26, 0.42, { color: p.pave, paint: false, x: f * 0.47, z: 0.5, y: G + 0.002 });
  b.plane(0.1, 0.36, { color: p.pave, x: -f * 0.12, z: 0.52, y: G + 0.002, ...DET });
  need(rc, [['house', 0.7]]);
  sk.house(rc, { x: -f * 0.12, z: -0.14, w, d, floors: L >= 2 ? 2 : 1, roof, prestige: prest(L) });
  need(rc);
  sk.house(rc, { x: f * 0.47, z: -0.08, w: 0.3, d: 0.4, floors: 1, roof: 'flat', door: false });
  if (L >= 2 && fits(rc, 20)) hovercar(b, f * 0.47, 0.42, 0, car);
  sk.tree(rc, -f * 0.55, 0.42, 0.95);
  if (L >= 4 && fits(rc, 12)) pool(b, -f * 0.12, -0.58, 0.42, 0.14, p.pave, G, true);
  if (L >= 3) sk.tree(rc, -f * 0.12, 0.58, 0.7);
  if (L >= 3) sk.shrub(rc, f * 0.22, 0.3, 1.1);
  sk.lamp(rc, -f * 0.02, 0.66);
});

export const bungalow = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const f = side(rc);
  const w = vr.range(0.9, 1.04), d = vr.range(0.4, 0.48);
  const roof = vr.pick(['hip', 'hip', 'gable'] as const);
  const car = vr.pick([0x40a0d0, 0xd06040, 0xe8e8e8, 0x6a40a0]);
  sk.lot(rc, 'lawn', 0.11);
  // carport
  const cx = f * 0.45, cz = 0.32;
  b.box(0.32, 0.02, 0.3, { color: p.trim, x: cx, z: cz, y: FL - 0.01 });
  for (const [dx, dz] of [[-0.14, -0.13], [0.14, 0.13]]) b.box(0.018, FL - 0.03, 0.018, { color: p.trim, x: cx + dx, z: cz + dz, y: G, ...DET });
  sk.house(rc, { z: -0.16, w, d, floors: L >= 4 ? 2 : 1, roof, prestige: prest(L) });
  if (fits(rc, 20)) hovercar(b, cx, cz, 0, car);
  sk.tree(rc, -f * 0.5, 0.4, 1);
  if (L >= 3 && fits(rc, 12)) pool(b, 0, -0.6, 0.5, 0.14, p.pave, G, true);
  if (L >= 2) frontHedges(rc, 0.68, 0.14, 0.6);
  if (L >= 2) sk.shrub(rc, -f * 0.2, 0.18, 1.2);
  if (L >= 3) sk.tree(rc, f * 0.62, -0.25, 0.85);
  sk.lamp(rc, -f * 0.08, 0.62);
});

export const duplex = factory((rc) => {
  const { sk, vr, L, p } = rc;
  const roof = vr.pick(['front', 'front', 'gable', 'hip'] as const);
  const d = vr.range(0.5, 0.58);
  sk.lot(rc, 'lawn');
  rc.b.plane(0.08, 0.4, { color: p.pave, x: -0.23, z: 0.5, y: G + 0.002, ...DET });
  rc.b.plane(0.08, 0.4, { color: p.pave, x: 0.23, z: 0.5, y: G + 0.002, ...DET });
  const fl = L >= 2 ? 2 : 1;
  need(rc, [['house', 1]]);
  sk.house(rc, { x: -0.23, z: -0.12, w: 0.44, d, floors: fl, roof, color: p.wall, prestige: prest(L) * 0.6 });
  need(rc);
  sk.house(rc, { x: 0.23, z: -0.12, w: 0.44, d, floors: fl, roof, color: p.wall2, prestige: prest(L) * 0.6 });
  rc.b.group({ z: 0.42, ry: Math.PI / 2 }, () => sk.fence(rc, 0, 0, 0.5));
  sk.tree(rc, -0.56, 0.36, 0.85);
  if (L >= 2) sk.tree(rc, 0.56, 0.36, 0.8);
  if (L >= 3) sk.shrub(rc, -0.1, 0.62, 1);
  if (L >= 3) sk.shrub(rc, 0.36, 0.62, 1);
  sk.lamp(rc, 0, 0.66);
});

export const domeHome = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const f = side(rc);
  const r0 = lerpL(L, 0.3, 0.36) + vr.range(-0.02, 0.02);
  sk.lot(rc, 'garden', 0.1);
  const top = sk.pod(rc, 0, -0.14, r0, r0 * 0.9);
  const tube = (x0: number, z0: number, x1: number, z1: number) => {
    if (fits(rc, 18)) b.tube([[x0, G + 0.08, z0], [x1, G + 0.08, z1]], 0.05, { color: p.glass, mat: Mat.Glass, seg: 5, paint: false });
  };
  if (L >= 2 && fits(rc, sk.cost.pod)) {
    sk.pod(rc, f * 0.52, -0.3, 0.19, 0.17);
    tube(f * (r0 - 0.04), -0.2, f * 0.36, -0.28);
  }
  if (L >= 3 && fits(rc, sk.cost.pod)) {
    sk.pod(rc, -f * 0.5, 0.12, 0.2, 0.2, true);
    tube(-f * (r0 - 0.04), -0.08, -f * 0.33, 0.08);
  }
  if (L >= 4 && fits(rc, sk.cost.pod)) sk.pod(rc, 0, -0.14, r0 * 0.5, r0 * 0.5, false, top - 0.04);
  sk.tree(rc, f * 0.52, 0.36, 0.85);
  if (L >= 2) sk.shrub(rc, f * 0.2, 0.42, 1);
  sk.lamp(rc, 0.1, 0.62);
});

export const villa = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const f = side(rc);
  const roof = vr.pick(['flat', 'hip', 'hip', 'flat'] as const);
  const lux = prest(L);
  sk.lot(rc, 'garden');
  // terrace deck & pool
  b.plane(0.9, 0.42, { color: p.pave, paint: false, x: -f * 0.05, z: 0.32, y: G + 0.002 });
  pool(b, -f * 0.14, 0.34, lerpL(L, 0.32, 0.56), 0.2, shade(p.pave, 1.05), G + 0.002);
  need(rc, [['house', 0.8]]);
  sk.house(rc, { x: -f * 0.12, z: -0.24, w: 0.76, d: 0.48, floors: L >= 3 ? 2 : 1, roof, prestige: lux });
  need(rc);
  sk.house(rc, { x: f * 0.42, z: 0.0, w: 0.3, d: 0.5, floors: 1, roof: 'flat', door: false, prestige: lux * 0.5 });
  sk.tree(rc, f * 0.5, 0.48, 1.05);
  sk.tree(rc, -f * 0.62, 0.0, 0.95);
  if (L >= 4 && fits(rc, 20)) for (let i = 0; i < 2; i++) b.box(0.07, 0.025, 0.13, { color: 0xf4f0e8, x: -f * (-0.24 + i * 0.12), z: 0.52, y: G, ...DET });
  if (L >= 4) sk.tree(rc, -f * 0.56, 0.42, 0.85);
  if (L >= 5) sk.lamp(rc, f * 0.2, 0.6, 0.24);
  sk.fence(rc, 0, -0.66, 0.9);
});

export const estate = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const roof = vr.pick(['hip', 'hip', 'flat'] as const);
  const lux = Math.max(0.6, prest(L));
  sk.lot(rc, 'garden');
  // drive, forecourt & fountain
  b.plane(0.16, 0.36, { color: p.pave, paint: false, z: 0.6, y: G + 0.002 });
  b.cyl(0.24, 0.24, 0.006, { color: p.pave, paint: false, seg: 10, z: 0.34, y: G, capTop: true });
  b.cyl(0.1, 0.11, 0.05, { color: shade(p.pave, 0.9), paint: false, seg: 8, z: 0.34, y: G, capTop: false });
  polyTop(b, ngon(8, 0.1, 0, 0, 0.34), { color: 0x3a9ad0, mat: Mat.Water, paint: false, y: G + 0.046 });
  const fl = L >= 5 ? 3 : 2;
  need(rc, [['house', 1.6], ['portico', 1]]);
  sk.house(rc, { z: -0.26, w: 0.6, d: 0.46, floors: fl, roof, prestige: lux });
  need(rc, [['house', 0.8], ['portico', 1]]);
  sk.house(rc, { x: -0.47, z: -0.2, w: 0.3, d: 0.4, floors: fl - 1, roof, door: false, prestige: 0 });
  need(rc, [['portico', 1]]);
  sk.house(rc, { x: 0.47, z: -0.2, w: 0.3, d: 0.4, floors: fl - 1, roof, door: false, prestige: 0 });
  need(rc);
  b.group({ z: -0.26 + 0.23 }, () => sk.portico(rc, 0.34, FL * Math.min(2, fl)));
  if (fits(rc, 10)) b.cyl(0.012, 0.018, 0.1, { color: 0xe8e4dc, seg: 4, z: 0.34, y: G + 0.05, ...DET });
  for (const s of [-1, 1]) {
    sk.tree(rc, s * 0.36, 0.42, 0.9);
    sk.fence(rc, s * 0.5, 0.22, 0.22);
  }
  for (const s of [-1, 1]) sk.lamp(rc, s * 0.13, 0.62, 0.22);
  if (L >= 5) sk.tree(rc, 0.62, 0.0, 0.8);
});

// ═══════════════════════════════════════════════════════════════ MEDIUM DENSITY

export const townhouses = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const d = vr.range(0.56, 0.64);
  const tall = vr.int(0, 2);
  const cols = [p.wall, p.wall2, shade(p.wall, 0.92)];
  sk.lot(rc, 'pave');
  const base = byL(L, [2, 3, 3, 4, 4]);
  const uw = 0.4;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * uw;
    const h = storeys(base + (i === tall && L >= 2 ? 1 : 0));
    b.box(0.08, 0.15, 0.02, { color: p.trim2, paint: false, x, z: -0.12 + d / 2 + 0.006, y: G + 0.05 });
    need(rc, [['block', 2 - i], ['roof', 3 - i]], 10 * (2 - i));
    sk.block(rc, { x, z: -0.12, w: uw - 0.006, d, h, use: 'res', color: cols[i], prestige: prest(L) });
    need(rc, [['block', 2 - i], ['roof', 2 - i]], 10 * (2 - i));
    sk.roof(rc, { x, z: -0.12, y: G + h, w: uw - 0.006, d, kind: L >= 4 && i === 1 ? 'deck' : 'pitched', prestige: prest(L) });
    if (fits(rc, 10)) b.box(0.12, 0.05, 0.08, { color: shade(p.pave, 0.85), x, z: -0.12 + d / 2 + 0.04, y: G, ...DET });
  }
  need(rc);
  if (L >= 2) sk.tree(rc, -0.42, 0.52, 0.8);
  if (L >= 3) sk.tree(rc, 0.42, 0.52, 0.8);
  sk.lamp(rc, 0, 0.62);
});

export const terraceRow = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const d = vr.range(0.46, 0.52);
  const n = 4, uw = 0.34;
  const fl = byL(L, [2, 2, 3, 3, 3]);
  const h = storeys(fl);
  sk.lot(rc, 'lawn');
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * uw;
    b.box(0.08, 0.15, 0.02, { color: p.trim2, paint: false, x: x - 0.06, z: -0.2 + d / 2 + 0.006, y: G });
    need(rc, [['block', n - 1 - i], ['roof', 1]], 10 * (n - 1 - i));
    sk.block(rc, { x, z: -0.2, w: uw - 0.004, d, h, use: 'res', color: i % 2 ? p.wall : p.wall2, prestige: prest(L) });
  }
  need(rc);
  sk.roof(rc, { z: -0.2, y: G + h, w: n * uw, d, kind: 'pitched', prestige: prest(L) });
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * uw;
    if (fits(rc, 10)) b.box(0.03, 0.03, 0.02, { color: 0xffd890, mat: Mat.Light, x: x + 0.02, z: -0.2 + d / 2 + 0.01, y: FL, ...DET });
    if (i > 0) b.group({ x: x - uw / 2, z: 0.38, ry: Math.PI / 2 }, () => sk.fence(rc, 0, 0, 0.42));
    if (L >= 2) sk.shrub(rc, x + 0.06, 0.3, 0.9);
  }
  sk.fence(rc, 0, 0.62, 1.1);
  if (L >= 3) sk.tree(rc, -0.6, 0.2, 0.8);
});

export const walkup = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const w = vr.range(0.98, 1.12), d = vr.range(0.7, 0.8);
  const fl = byL(L, [3, 4, 5, 5, 6]);
  const h = storeys(fl);
  const z = -0.06;
  sk.lot(rc, 'pave');
  need(rc, [['roof', 1], ['portico', 1]]);
  sk.block(rc, { z, w, d, h, use: 'res', prestige: prest(L) });
  need(rc, [['portico', 1]]);
  sk.roof(rc, { z, y: G + h, w, d, kind: L <= 2 ? 'pitched' : L >= 5 ? 'garden' : 'flat', prestige: prest(L) });
  need(rc);
  b.group({ z: z + d / 2 }, () => {
    sk.portico(rc, 0.3, FL);
    sk.balconies(rc, { w: Math.min(w * 0.9, sk.frontWidth(w, d)), y0: FL, y1: h - FL * 0.9, every: 1, cols: 3 });
  });
  sk.tree(rc, -0.42, 0.6, 0.8);
  if (L >= 2) sk.tree(rc, 0.42, 0.6, 0.8);
});

export const courtyard = factory((rc) => {
  const { b, sk, L, p } = rc;
  const fl = byL(L, [3, 3, 4, 5, 6]);
  const h = storeys(fl);
  const hw = storeys(Math.max(2, fl - 1));
  sk.lot(rc, 'garden');
  // back block + two wings around a green court
  need(rc, [['block', 2], ['roof', 3]]);
  sk.block(rc, { z: -0.42, w: 1.08, d: 0.34, h, use: 'res', prestige: prest(L) });
  need(rc, [['block', 1], ['roof', 3]]);
  sk.block(rc, { x: -0.4, z: 0.0, w: 0.3, d: 0.54, h: hw, use: 'res', color: p.wall2, prestige: prest(L) });
  need(rc, [['roof', 3]]);
  sk.block(rc, { x: 0.4, z: 0.0, w: 0.3, d: 0.54, h: hw, use: 'res', color: p.wall2, prestige: prest(L) });
  const rk = L >= 4 ? 'garden' : L <= 2 ? 'pitched' : 'flat';
  need(rc, [['roof', 2]]);
  sk.roof(rc, { z: -0.42, y: G + h, w: 1.08, d: 0.34, kind: rk, prestige: prest(L) });
  need(rc, [['roof', 1]]);
  sk.roof(rc, { x: -0.4, z: 0.0, y: G + hw, w: 0.3, d: 0.54, kind: L <= 2 ? 'pitched' : 'flat', prestige: prest(L) });
  need(rc);
  sk.roof(rc, { x: 0.4, z: 0.0, y: G + hw, w: 0.3, d: 0.54, kind: L <= 2 ? 'pitched' : 'flat', prestige: prest(L) });
  // the court
  if (fits(rc, 24)) {
    b.cyl(0.09, 0.1, 0.04, { color: shade(p.pave, 0.9), paint: false, seg: 8, z: 0.02, y: G, capTop: false });
    polyTop(b, ngon(8, 0.088, 0, 0, 0.02), { color: 0x3a9ad0, mat: Mat.Water, paint: false, y: G + 0.036 });
  }
  sk.tree(rc, -0.12, 0.3, 0.9);
  b.group({ z: -0.25 }, () => sk.balconies(rc, { w: Math.min(0.46, sk.frontWidth(1.08, 0.34)), y0: FL, y1: h - FL, every: 1, cols: 2 }));
  sk.tree(rc, 0.14, -0.14, 0.75);
  if (L >= 3) sk.shrub(rc, 0.12, 0.34, 1);
  sk.fence(rc, 0, 0.66, 0.5);
});

export const midrise = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const w = vr.range(1.02, 1.14), d = vr.range(0.78, 0.88);
  const fl = byL(L, [5, 6, 7, 9, 10]);
  const h = storeys(fl);
  const z = -0.08;
  sk.lot(rc, 'pave');
  const pent = L >= 3;
  need(rc, pent ? [['block', 1], ['roof', 1], ['portico', 1], ['terrace', 1]] : [['roof', 1], ['portico', 1]]);
  sk.block(rc, { z, w, d, h, use: 'res', prestige: prest(L) });
  if (pent) {
    const ph = storeys(1);
    need(rc, [['roof', 1], ['portico', 1], ['terrace', 1]]);
    sk.block(rc, { x: -w * 0.12, z: z - d * 0.12, y: G + h, w: w * 0.56, d: d * 0.6, h: ph, use: 'res', prestige: prest(L) });
    need(rc, [['portico', 1], ['terrace', 1]]);
    sk.roof(rc, { x: -w * 0.12, z: z - d * 0.12, y: G + h + ph, w: w * 0.56, d: d * 0.6, kind: 'flat', prestige: prest(L) });
    need(rc, [['portico', 1]]);
    sk.terrace(rc, w * 0.3, z + d * 0.18, G + h, w * 0.32, d * 0.5);
  } else {
    need(rc, [['portico', 1]]);
    sk.roof(rc, { z, y: G + h, w, d, kind: 'flat', prestige: prest(L) });
  }
  need(rc);
  b.group({ z: z + d / 2 }, () => {
    sk.portico(rc, 0.4, FL);
    sk.balconies(rc, { w: Math.min(w * 0.86, sk.frontWidth(w, d)), y0: FL * 1.5, y1: h - FL, every: 1, cols: 0, depth: 0.07 });
  });
  sk.tree(rc, -0.45, 0.62, 0.8);
  sk.tree(rc, 0.45, 0.62, 0.8);
});

export const steppedTerraces = factory((rc) => {
  const { sk, vr, L } = rc;
  const w = vr.range(1.04, 1.12);
  const fls = byL(L, [[1, 2, 3], [1, 2, 3], [2, 3, 4], [2, 4, 6], [3, 5, 7]] as const);
  sk.lot(rc, 'garden');
  const zs = [0.26, -0.06, -0.38];
  for (let i = 0; i < 3; i++) {
    const h = storeys(fls[i]);
    const ww = w - i * 0.04;
    need(rc, [['block', 2 - i], ['roof', 1], ['terrace', 2 - i + (i < 2 ? 1 : 0)]]);
    sk.block(rc, { z: zs[i], w: ww, d: 0.32, h, use: 'res', prestige: prest(L) });
    need(rc, [['block', 2 - i], ['roof', 1], ['terrace', 2 - i]]);
    if (i < 2) sk.terrace(rc, 0, zs[i], G + h, ww, 0.32);
    else {
      need(rc);
      sk.roof(rc, { z: zs[i], y: G + h, w: ww, d: 0.32, kind: L >= 4 ? 'garden' : 'flat', prestige: prest(L) });
    }
  }
  sk.tree(rc, -0.62, 0.3, 0.75);
  if (L >= 3) sk.tree(rc, 0.62, 0.3, 0.75);
});

// ═══════════════════════════════════════════════════════════════ HIGH DENSITY

export const slab = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const w = vr.range(1.26, 1.36), d = vr.range(0.48, 0.54);
  const fl = byL(L, [10, 13, 16, 18, 20]);
  const h = storeys(fl);
  const z = -0.12;
  sk.lot(rc, 'plaza');
  need(rc, [['roof', 1], ['portico', 1]]);
  sk.tower(rc, { z, w, d, h, use: 'res', prestige: prest(L) });
  need(rc, [['portico', 1]]);
  sk.roof(rc, { z, y: G + h, w, d, kind: L >= 4 ? 'garden' : 'mech', prestige: prest(L) });
  need(rc);
  b.group({ z: z + d / 2 }, () => {
    sk.portico(rc, 0.44, FL * 1.2);
    sk.balconies(rc, { w: Math.min(w * 0.92, sk.frontWidth(w, d)), y0: FL * 2, y1: h - FL, every: 2, cols: 0, depth: 0.06 });
  });
  sk.tree(rc, -0.5, 0.5, 0.8);
  sk.tree(rc, 0.5, 0.5, 0.8);
});

export const pointTower = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const w = vr.range(0.9, 1.0), d = vr.range(0.84, 0.94);
  const kind = vr.int(0, 2);
  const fl = byL(L, [12, 18, 24, 32, 40]);
  const segs = L >= 5 ? [0.55, 0.3, 0.15] : L >= 3 ? [0.68, 0.32] : [1];
  const scale = [1, 0.84, 0.7];
  sk.lot(rc, 'plaza');
  let y = G;
  let cw = w, cd = d;
  const z = -0.06;
  for (let i = 0; i < segs.length; i++) {
    cw = w * scale[i];
    cd = d * scale[i];
    const h = storeys(Math.max(2, Math.round(fl * segs[i])), 0);
    const left = segs.length - 1 - i;
    need(rc, [['tower', left], ['terrace', left], ['crown', 1], ['portico', 1]]);
    sk.tower(rc, { z, y, w: cw, d: cd, h, use: 'res', seg: i, prestige: prest(L) });
    y += h;
    need(rc, [['tower', left], ['terrace', Math.max(0, left - 1)], ['crown', 1], ['portico', 1]]);
    if (i < segs.length - 1) sk.terrace(rc, 0, z + cd * 0.42, y, cw, cd * 0.16);
  }
  need(rc, [['portico', 1]]);
  sk.crown(rc, { z, y, w: cw, d: cd, prestige: prest(L), kind });
  need(rc);
  b.group({ z: z + d / 2 }, () => sk.portico(rc, 0.42, FL * 1.4));
  sk.tree(rc, -0.52, 0.52, 0.8);
  sk.tree(rc, 0.52, 0.52, 0.8);
});

export const rotunda = factory((rc) => {
  const { sk, vr, L } = rc;
  const r = vr.range(0.84, 0.92);
  const fl = byL(L, [10, 15, 20, 26, 32]);
  const h = storeys(fl, 0);
  sk.lot(rc, 'plaza');
  need(rc, [['crown', 1]]);
  sk.tower(rc, { round: true, w: r, d: r, h, use: 'res', prestige: prest(L) });
  sk.plates(rc, 0, 0, r, r, FL * 2, h - FL, 2, rc.p.trim, 0.05, true);
  need(rc);
  sk.crown(rc, { y: G + h, w: r * 0.72, d: r * 0.72, prestige: prest(L), kind: rc.seed + 1 });
  sk.tree(rc, -0.55, 0.5, 0.8);
  sk.tree(rc, 0.55, 0.5, 0.8);
  sk.tree(rc, 0.0, 0.66, 0.7);
});

export const twinTowers = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const fa = byL(L, [14, 20, 24, 30, 36]);
  const fb = fa - vr.int(2, 6);
  const w = 0.54, d = vr.range(0.6, 0.68);
  sk.lot(rc, 'plaza');
  const ph = storeys(2, 0);
  need(rc, [['tower', 2], ['bridge', 1], ['crown', 1], ['roof', 1], ['portico', 1]]);
  sk.block(rc, { z: 0, w: 1.36, d: d + 0.14, h: ph, use: 'shop', prestige: prest(L) });
  const ha = storeys(fa - 2, 0), hb = storeys(fb - 2, 0);
  need(rc, [['tower', 1], ['bridge', 1], ['crown', 1], ['roof', 1], ['portico', 1]]);
  sk.tower(rc, { x: -0.38, y: G + ph, w, d, h: ha, use: 'res', seg: 0, prestige: prest(L) });
  need(rc, [['bridge', 1], ['crown', 1], ['roof', 1], ['portico', 1]]);
  sk.tower(rc, { x: 0.38, y: G + ph, w, d, h: hb, use: 'res', seg: 1, prestige: prest(L) });
  need(rc, [['crown', 1], ['roof', 1], ['portico', 1]]);
  sk.bridge(rc, -0.38 + w / 2, 0, 0.38 - w / 2, 0, G + ph + hb * 0.6, FL * 2, 0.2);
  need(rc, [['roof', 1], ['portico', 1]]);
  sk.crown(rc, { x: -0.38, y: G + ph + ha, w, d, prestige: prest(L), kind: rc.seed });
  need(rc, [['portico', 1]]);
  sk.roof(rc, { x: 0.38, y: G + ph + hb, w, d, kind: L >= 4 ? 'garden' : 'mech', prestige: prest(L) });
  need(rc);
  b.group({ z: (d + 0.14) / 2 }, () => sk.portico(rc, 0.4, FL * 1.2));
  if (L >= 5 && fits(rc, sk.cost.bridge)) sk.bridge(rc, -0.38 + w / 2, 0, 0.38 - w / 2, 0, G + ph + hb * 0.88, FL * 1.5, 0.16);
  sk.tree(rc, 0, 0.62, 0.8);
});

export const skyGarden = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const w = vr.range(0.92, 1.0), d = vr.range(0.8, 0.88);
  const segsF = byL(L, [[8], [10, 6], [10, 9], [10, 10, 8], [11, 11, 10]] as const);
  sk.lot(rc, 'plaza');
  let y = G;
  const n = segsF.length;
  for (let i = 0; i < n; i++) {
    const h = storeys(segsF[i], 0);
    const s = 1 - i * 0.06;
    need(rc, [['tower', n - 1 - i], ['roof', 1]], 20 * (n - 1 - i) + (i < n - 1 ? 20 : 0));
    sk.tower(rc, { y, w: w * s, d: d * s, h, use: 'res', seg: i, prestige: prest(L) });
    y += h;
    if (i < n - 1) {
      // open sky-garden storey: slab, slim core, trees
      const gh = FL * 2;
      b.box(w * s + 0.04, 0.03, d * s + 0.04, { color: p.pave, paint: false, y });
      b.box(w * 0.3, gh, d * 0.3, { color: p.trim, y });
      sk.tree(rc, -w * 0.3, d * 0.25, 1.0, y + 0.03);
      sk.tree(rc, w * 0.28, -d * 0.24, 1.0, y + 0.03);
      sk.tree(rc, w * 0.3, d * 0.28, 0.8, y + 0.03);
      y += gh;
    }
  }
  need(rc);
  const s = 1 - (n - 1) * 0.06;
  sk.roof(rc, { y, w: w * s, d: d * s, kind: 'garden', prestige: prest(L) });
  sk.tree(rc, -0.5, 0.56, 0.8);
  sk.tree(rc, 0.5, 0.56, 0.8);
});

export const podiumTower = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const tw = vr.range(0.66, 0.76), td = vr.range(0.56, 0.64);
  const fl = byL(L, [8, 12, 18, 24, 30]);
  const ph = storeys(3, 0);
  const z = -0.1;
  sk.lot(rc, 'plaza');
  need(rc, [['shop', 1], ['tower', 1], ['crown', 1]]);
  sk.block(rc, { z: -0.04, w: 1.3, d: 0.94, h: ph, use: 'shop', prestige: prest(L) });
  need(rc, [['tower', 1], ['crown', 1]]);
  b.group({ z: 0.43 }, () => sk.shopfront(rc, { w: 1.04, h: FL * 1.1, glyphs: 5 }));
  const th = storeys(fl, 0);
  need(rc, [['crown', 1]]);
  sk.tower(rc, { z: z - 0.08, y: G + ph, w: tw, d: td, h: th, use: 'res', prestige: prest(L) });
  need(rc);
  sk.crown(rc, { z: z - 0.08, y: G + ph + th, w: tw, d: td, prestige: prest(L), kind: rc.seed + 2 });
  // podium deck
  if (L >= 3 && fits(rc, 12)) pool(b, 0, 0.34, 0.6, 0.18, p.pave, G + ph, true);
  sk.tree(rc, -0.56, 0.34, 0.7, G + ph);
  sk.tree(rc, 0.56, 0.34, 0.7, G + ph);
});

export const spire = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const w = vr.range(0.94, 1.02), d = vr.range(0.86, 0.94);
  const fl = byL(L, [22, 26, 30, 38, 46]);
  const fr = [0.4, 0.28, 0.2, 0.12];
  const sc = [1, 0.86, 0.72, 0.58];
  sk.lot(rc, 'plaza');
  let y = G;
  for (let i = 0; i < 4; i++) {
    const h = storeys(Math.max(2, Math.round(fl * fr[i])), 0);
    need(rc, [['tower', 3 - i], ['crown', 1], ['portico', 1]]);
    sk.tower(rc, { y, w: w * sc[i], d: d * sc[i], h, use: 'res', seg: i, prestige: prest(L) });
    y += h;
  }
  need(rc, [['portico', 1]]);
  sk.crown(rc, { y, w: w * 0.58, d: d * 0.58, prestige: Math.max(0.75, prest(L)), tall: 1.5, kind: rc.seed });
  need(rc);
  b.group({ z: d / 2 }, () => sk.portico(rc, 0.5, FL * 1.6));
  sk.tree(rc, -0.56, 0.5, 0.8);
  sk.tree(rc, 0.56, 0.5, 0.8);
});

/** Level-5 icons: three signature forms (twist · needle · stack) chosen by variant. */
export const icon = factory((rc) => {
  const { b, sk, L, p } = rc;
  const form = rc.v % 3;
  const fl = byL(L, [34, 38, 42, 46, 52]);
  sk.lot(rc, 'plaza');
  if (form === 0) {
    // twisting tower: rotated slabs
    const n = 6;
    const per = Math.round(fl / n);
    let y = G;
    for (let i = 0; i < n; i++) {
      const h = storeys(per, 0);
      const s = 1 - i * 0.04;
      need(rc, [['tower', n - 1 - i], ['crown', 1], ['portico', 1]]);
      b.group({ ry: i * 0.2 }, () => sk.tower(rc, { y, w: 1.0 * s, d: 0.66 * s, h, use: 'res', seg: i, prestige: 1, lite: true }));
      y += h;
    }
    need(rc, [['portico', 1]]);
    b.group({ ry: n * 0.2 }, () => sk.crown(rc, { y, w: 0.7, d: 0.46, prestige: 1, tall: 1.2, kind: rc.seed }));
  } else if (form === 1) {
    // needle: tapering shaft + halo + very tall spire
    const segs = [0.45, 0.3, 0.25];
    let y = G;
    let s = 1;
    for (let i = 0; i < segs.length; i++) {
      const h = storeys(Math.round(fl * segs[i]), 0);
      s = 1 - i * 0.2;
      need(rc, [['tower', segs.length - 1 - i], ['crown', 1], ['portico', 1]], 24);
      sk.tower(rc, { y, w: 0.94 * s, d: 0.94 * s, h, round: true, use: 'res', seg: i, prestige: 1 });
      y += h;
    }
    need(rc, [['portico', 1]]);
    b.cyl(0.66 * s, 0.66 * s, 0.05, { color: p.accent, mat: Mat.Glow, seg: 12, y: y - 0.9, capTop: false, paint: false });
    sk.crown(rc, { y, w: 0.94 * s, d: 0.94 * s, prestige: 1, tall: 1.7, kind: rc.seed + 1 });
  } else {
    // stacked boxes (jenga) with planted overhangs
    const n = 5;
    const per = Math.round(fl / n);
    let y = G;
    for (let i = 0; i < n; i++) {
      const h = storeys(per, 0);
      const ox = (i % 2 === 0 ? 1 : -1) * 0.12;
      const oz = (i % 3 === 0 ? 1 : -1) * 0.08;
      need(rc, [['tower', n - 1 - i], ['terrace', n - 1 - i + (i > 0 ? 1 : 0)], ['crown', 1], ['portico', 1]]);
      sk.tower(rc, { x: ox, z: oz, y, w: 0.82, d: 0.62, h, use: 'res', seg: i, prestige: 1, lite: true });
      need(rc, [['tower', n - 1 - i], ['terrace', n - 1 - i], ['crown', 1], ['portico', 1]]);
      if (i > 0) sk.terrace(rc, ox, oz, y, 0.3, 0.3);
      y += h;
    }
    need(rc, [['portico', 1]]);
    sk.crown(rc, { y, w: 0.7, d: 0.5, prestige: 1, tall: 1.0, kind: rc.seed + 2 });
  }
  need(rc);
  b.group({ z: 0.42 }, () => sk.portico(rc, 0.56, FL * 2));
  sk.tree(rc, -0.58, 0.46, 0.85);
  sk.tree(rc, 0.58, 0.46, 0.85);
});
