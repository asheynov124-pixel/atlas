/**
 * zoned-rc · Leisure & Tourism growables (OWNER: zoned-rc).
 *
 *   grand hotel · casino · nightclub · holo-arcade · theatre · sky resort · starlight cinema
 *
 * These are the city's night jewellery: marquees, animated screens (Mat.Screen), holograms (Mat.Holo),
 * searchlight beams and neon outlines — all glowing after dark through the shared building material.
 */
import { FL, G, Mat, byL, mix, pool, shade, storeys, umbrella } from './common';
import { factory } from './rc';
import { DET, fits, need, type RC } from './skin';

const prest = (L: number): number => (L - 1) / 4;
const GOLD = 0xe8c060;

/** Laser / searchlight beam: a thin glowing line raking the sky from a small lamp housing. */
function beam(rc: RC, x: number, z: number, y: number, len: number, rz: number, rx: number, color: number): void {
  if (!fits(rc, 20)) return;
  rc.b.box(0.05, 0.04, 0.05, { color: 0x2a2d36, mat: Mat.Metal, x, z, y, ...DET });
  rc.b.cyl(0.004, 0.012, len, { color, mat: Mat.Glow, seg: 3, x, z, y: y + 0.03, rz, rx, capTop: false, paint: false });
}

/** Pixel-art hologram (a friendly space invader) floating above a roof. */
function invader(rc: RC, x: number, z: number, y: number, s: number, color: number): void {
  const rows = ['0010100', '0111110', '1101011', '1111111', '0100010'];
  const px = 0.05 * s;
  let n = 0;
  for (const r of rows) for (const c of r) if (c === '1') n++;
  if (!fits(rc, n * 4)) return;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== '1') continue;
      rc.b.panel(px * 0.92, px * 0.92, { color, mat: Mat.Holo, x: x + (i - 3) * px, z, y: y + (rows.length - j) * px, both: true, paint: false });
    }
  });
}

/** Neon outline strips around a block's street face. */
function neonFrame(rc: RC, w: number, h: number, z: number, c1: number, c2: number, x = 0): void {
  const { b } = rc;
  b.box(w + 0.02, 0.016, 0.016, { color: c1, mat: Mat.Glow, x, z, y: G + h - 0.02, paint: false });
  b.box(0.016, h - 0.04, 0.016, { color: c2, mat: Mat.Glow, x: x - w / 2 - 0.005, z, y: G + 0.02, paint: false });
  b.box(0.016, h - 0.04, 0.016, { color: c2, mat: Mat.Glow, x: x + w / 2 + 0.005, z, y: G + 0.02, paint: false });
}

export const hotel = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const signCol = vr.pick([0xffd27a, 0xff6a8a, 0x7ae0ff, 0xffffff]);
  const tallBlock = L <= 2;
  sk.lot(rc, 'plaza');
  if (tallBlock) {
    const w = 1.08, d = 0.8, z = -0.08;
    const h = storeys(byL(L, [4, 7, 7, 7, 7]));
    need(rc, [['roof', 1], ['portico', 1], ['sign', 1]]);
    sk.block(rc, { z, w, d, h, use: 'hotel', prestige: prest(L) });
    need(rc, [['portico', 1], ['sign', 1]]);
    sk.roof(rc, { z, y: G + h, w, d, kind: 'flat', prestige: prest(L) });
    need(rc, [['sign', 1]]);
    b.group({ z: z + d / 2 }, () => sk.portico(rc, 0.44, FL * 1.2));
    need(rc);
    sk.sign(rc, { w: 0.62, h: 0.18, kind: 'roof', n: 5, color: signCol }, 0, G + h + 0.02, z + d * 0.3);
    b.group({ z: z + d / 2 }, () => sk.balconies(rc, { w: w * 0.84, y0: FL * 2, y1: h - FL, every: 1, cols: 4 }));
  } else {
    const ph = storeys(2, 0);
    const fl = byL(L, [7, 7, 10, 16, 22]);
    const tw = 0.82, td = 0.62, tz = -0.18;
    need(rc, [['tower', 1], ['crown', L >= 5 ? 1 : 0], ['roof', L >= 5 ? 0 : 1], ['portico', 1], ['sign', 1]], 12);
    sk.block(rc, { w: 1.38, d: 1.02, h: ph, use: 'hotel', prestige: prest(L) });
    const th = storeys(fl, 0);
    need(rc, [['crown', L >= 5 ? 1 : 0], ['roof', L >= 5 ? 0 : 1], ['portico', 1], ['sign', 1]], 12);
    sk.tower(rc, { z: tz, y: G + ph, w: tw, d: td, h: th, use: 'hotel', prestige: prest(L) });
    need(rc, [['portico', 1], ['sign', 1]], 12);
    if (L >= 5) sk.crown(rc, { z: tz, y: G + ph + th, w: tw, d: td, prestige: 1, kind: rc.seed });
    else sk.roof(rc, { z: tz, y: G + ph + th, w: tw, d: td, kind: 'mech', prestige: prest(L) });
    need(rc, [['sign', 1]], 12);
    b.group({ z: 0.51 }, () => sk.portico(rc, 0.52, FL * 1.3));
    need(rc, [], 12);
    sk.sign(rc, { w: tw * 0.9, h: 0.13, kind: 'board', n: 5, color: signCol }, 0, G + ph + th - 0.22, tz + td / 2 + 0.01);
    need(rc);
    if (fits(rc, 12)) pool(b, 0.2, 0.3, 0.6, 0.2, p.pave, G + ph, true);
    for (const s of [-1, 1]) if (fits(rc, 18)) umbrella(b, s * 0.56, 0.3, s > 0 ? p.accent : mix(p.accent, 0xffffff, 0.5), 0.8, G + ph);
  }
  sk.tree(rc, -0.62, 0.42, 0.8);
  sk.tree(rc, 0.62, 0.42, 0.8);
});

export const casino = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const big = vr.pick([0xff3fa0, 0xffd24a, 0x3fe0ff]);
  const ph = storeys(L >= 4 ? 3 : 2, 0);
  const tower = L >= 4;
  sk.lot(rc, 'plaza');
  need(rc, [['sign', 3], ['portico', 1], ['tower', tower ? 1 : 0]], 60);
  sk.block(rc, { w: 1.42, d: 1.06, h: ph, use: 'fun', color: shade(p.wall, 0.9), prestige: 1 });
  need(rc, [['sign', 2], ['portico', 1], ['tower', tower ? 1 : 0]], 60);
  sk.sign(rc, { w: 1.0, h: Math.min(0.26, ph * 0.5), kind: 'screen' }, 0, G + ph * 0.42, 0.535);
  need(rc, [['sign', 1], ['portico', 1], ['tower', tower ? 1 : 0]], 60);
  sk.sign(rc, { w: 1.2, h: 0.08, kind: 'marquee', color: big }, 0, G + ph * 0.32, 0.53);
  need(rc, [['sign', 1], ['tower', tower ? 1 : 0]], 60);
  b.group({ z: 0.53 }, () => sk.portico(rc, 0.5, FL * 1.1));
  // golden dome & light ring on the roof
  b.dome(0.36, { color: GOLD, mat: Mat.Metal, wSeg: 10, hSeg: 3, h: 0.3, x: tower ? 0.36 : 0, z: 0.08, y: G + ph, paint: false });
  b.cyl(0.37, 0.37, 0.025, { color: 0xffe0a0, mat: Mat.Light, seg: 10, x: tower ? 0.36 : 0, z: 0.08, y: G + ph, capTop: false, paint: false });
  need(rc, [['sign', 1]]);
  if (tower) {
    const th = storeys(byL(L, [8, 8, 8, 12, 16]), 0);
    sk.tower(rc, { x: -0.36, z: -0.18, y: G + ph, w: 0.6, d: 0.56, h: th, use: 'hotel', prestige: 1 });
    need(rc);
    sk.sign(rc, { w: 0.56, h: 0.16, kind: 'roof', n: 6, color: big }, -0.36, G + ph + th, -0.18);
  } else {
    need(rc);
    sk.sign(rc, { w: 0.9, h: 0.18, kind: 'roof', n: 6, color: big }, 0, G + ph, -0.32);
  }
  beam(rc, -0.62, 0.42, G, 1.6 + prest(L), 0.25, -0.15, big);
  beam(rc, 0.62, 0.42, G, 1.6 + prest(L), -0.25, -0.15, mix(big, 0xffffff, 0.4));
  sk.tree(rc, -0.62, 0.0, 0.8);
  sk.tree(rc, 0.62, 0.0, 0.8);
});

export const nightclub = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const c1 = vr.pick([0xff2fd0, 0x2ff8ff, 0x9a4aff, 0xfff02f]);
  const c2 = vr.pick([0x2ff8ff, 0xff4a2f, 0x4aff7a, 0xff2fd0]);
  const w = vr.range(0.96, 1.06), d = vr.range(0.72, 0.8);
  const h = storeys(byL(L, [2, 2, 3, 3, 4]));
  const z = -0.08;
  sk.lot(rc, 'plaza');
  need(rc, [['roof', 1], ['sign', 2], ['pod', L >= 3 ? 1 : 0]], 50);
  sk.block(rc, { z, w, d, h, use: 'fun', color: mix(p.wall, 0x1a1c24, 0.65), prestige: prest(L) });
  neonFrame(rc, w, h, z + d / 2 + 0.01, c1, c2);
  for (let f = 1; f * FL < h - 0.1; f++) b.box(w * 0.9, 0.012, 0.012, { color: f % 2 ? c1 : c2, mat: Mat.Glow, z: z + d / 2 + 0.008, y: G + f * FL, paint: false });
  need(rc, [['sign', 2], ['pod', L >= 3 ? 1 : 0]], 30);
  sk.roof(rc, { z, y: G + h, w, d, kind: 'mech', prestige: prest(L) });
  need(rc, [['sign', 1], ['pod', L >= 3 ? 1 : 0]], 30);
  sk.sign(rc, { w: w * 0.6, h: 0.06, kind: 'marquee', color: c1 }, 0, FL * 0.95, z + d / 2);
  need(rc, [['pod', L >= 3 ? 1 : 0]], 30);
  sk.sign(rc, { w: w * 0.55, h: 0.16, kind: 'holo', color: c2 }, 0, G + h + 0.02, z + d * 0.3);
  need(rc, [], 30);
  if (L >= 3) sk.pod(rc, -w * 0.25, z - d * 0.15, 0.2, 0.18, true, G + h);
  need(rc);
  beam(rc, w * 0.4, z - d * 0.3, G + h, 1.4 + prest(L) * 1.2, -0.3, 0.2, c1);
  beam(rc, -w * 0.1, z - d * 0.35, G + h, 1.5 + prest(L) * 1.2, 0.25, 0.3, c2);
  // velvet rope queue
  if (fits(rc, 30)) for (let i = 0; i < 3; i++) b.box(0.015, 0.05, 0.015, { color: GOLD, x: 0.2 + i * 0.12, z: 0.42, y: G, ...DET });
  if (fits(rc, 10)) b.box(0.26, 0.008, 0.008, { color: 0xc02040, x: 0.32, z: 0.42, y: G + 0.04, ...DET });
  sk.lamp(rc, -0.55, 0.5, 0.24);
});

export const arcade = factory((rc) => {
  const { b, sk, vr, L } = rc;
  const holo = vr.pick([0x4aff7a, 0x2ff8ff, 0xff2fd0, 0xfff02f]);
  const w = vr.range(0.92, 1.0), d = vr.range(0.7, 0.78);
  const h = storeys(byL(L, [2, 2, 3, 3, 4]));
  const z = -0.1;
  sk.lot(rc, 'plaza');
  need(rc, [['shop', 1], ['roof', 1], ['sign', 3]], 40);
  sk.block(rc, { z, w, d, h, use: 'fun', prestige: prest(L) });
  need(rc, [['roof', 1], ['sign', 3]], 40);
  b.group({ z: z + d / 2 }, () => sk.shopfront(rc, { w: w - 0.04, h: FL * 1.05, kind: 'fun', glyphs: 6, color: holo }));
  need(rc, [['sign', 3]], 40);
  sk.roof(rc, { z, y: G + h, w, d, kind: 'mech', prestige: prest(L) });
  // wall of screens above the entrance
  const sh = Math.min(h - FL * 1.4, FL * 1.6);
  const cols = L >= 3 ? 3 : 2;
  for (let i = 0; i < cols; i++) {
    need(rc, [['sign', cols - 1 - i]], 40);
    sk.sign(rc, { w: (w * 0.84) / cols - 0.04, h: sh, kind: 'screen' }, -w * 0.42 + ((i + 0.5) * w * 0.84) / cols, FL * 1.3, z + d / 2 + 0.01);
  }
  need(rc);
  invader(rc, w * 0.1, z, G + h + 0.12, 1 + prest(L) * 0.8, holo);
  neonFrame(rc, w, h, z + d / 2 + 0.012, holo, mix(holo, 0xffffff, 0.3));
  sk.lamp(rc, 0.58, 0.5, 0.24);
});

export const theatre = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const mq = vr.pick([0xffd27a, 0xff6a6a, 0xffffff]);
  const fl = byL(L, [2, 3, 3, 4, 4]);
  const h = storeys(fl);
  const z = -0.02;
  sk.lot(rc, 'plaza');
  need(rc, [['block', 1], ['roof', 2], ['portico', 1], ['sign', 3]]);
  sk.block(rc, { z, w: 1.0, d: 0.64, h, use: 'fun', prestige: prest(L) });
  // fly tower
  const fh = storeys(fl + 2);
  need(rc, [['roof', 2], ['portico', 1], ['sign', 3]]);
  sk.block(rc, { z: -0.5, w: 0.64, d: 0.36, h: fh, use: 'fun', color: p.wall2, prestige: prest(L) });
  need(rc, [['roof', 1], ['portico', 1], ['sign', 3]]);
  sk.roof(rc, { z, y: G + h, w: 1.0, d: 0.64, kind: L >= 5 ? 'pitched' : 'flat', prestige: prest(L) });
  need(rc, [['portico', 1], ['sign', 3]]);
  sk.roof(rc, { z: -0.5, y: G + fh, w: 0.64, d: 0.36, kind: 'pitched', prestige: prest(L) });
  need(rc, [['sign', 3]]);
  b.group({ z: z + 0.32 }, () => sk.portico(rc, 0.7, FL * 1.6));
  need(rc, [['sign', 2]]);
  sk.sign(rc, { w: 0.62, h: 0.08, kind: 'marquee', color: mq }, 0, FL * 1.85, z + 0.42);
  for (const s of [-1, 1]) {
    need(rc, [['sign', s < 0 ? 1 : 0]]);
    sk.sign(rc, { w: 0.12, h: 0.18, kind: 'screen' }, s * 0.42, FL * 0.45, z + 0.33);
  }
  need(rc);
  sk.tree(rc, -0.62, 0.42, 0.8);
  sk.tree(rc, 0.62, 0.42, 0.8);
  if (L >= 4) for (const s of [-1, 1]) sk.lamp(rc, s * 0.48, 0.6, 0.26);
});

export const resort = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const r = vr.range(0.8, 0.88);
  const fl = byL(L, [10, 14, 18, 22, 28]);
  const h = storeys(fl, 0);
  sk.lot(rc, 'garden');
  pool(b, -0.24, 0.42, 0.5, 0.22, p.pave, G + 0.002);
  need(rc, [['portico', 1], ['sign', 1]], 40);
  sk.tower(rc, { round: true, z: -0.12, w: r, d: r, h, use: 'hotel', prestige: prest(L) });
  sk.plates(rc, 0, -0.12, r, r, FL * 3, h - FL, 3, p.trim, 0.06, true);
  // rooftop infinity pool & cabanas
  need(rc, [['portico', 1], ['sign', 1]], 0);
  const ry = G + h;
  b.cyl(r * 0.5, r * 0.5, 0.04, { color: p.pave, seg: 10, z: -0.12, y: ry, paint: false });
  b.cyl(r * 0.36, r * 0.36, 0.001, { color: 0x3a9ad0, mat: Mat.Water, seg: 10, x: -0.06, z: -0.12, y: ry + 0.041, paint: false });
  need(rc, [['sign', 1]]);
  b.group({ z: -0.12 + r / 2 }, () => sk.portico(rc, 0.4, FL * 1.3));
  need(rc);
  sk.sign(rc, { w: r * 0.6, h: 0.1, kind: 'board', n: 6 }, 0, ry - 0.16, -0.12 + r / 2 + 0.01);
  if (fits(rc, 18)) umbrella(b, r * 0.22, -0.12 + r * 0.18, p.accent, 0.7, ry + 0.04);
  sk.tree(rc, 0.56, 0.36, 1.0);
  sk.tree(rc, -0.62, 0.0, 0.9);
  sk.tree(rc, r * 0.25, -0.12 - r * 0.2, 0.6, ry + 0.04);
});

export const cinema = factory((rc) => {
  const { b, sk, vr, L, p } = rc;
  const mq = vr.pick([0xffd27a, 0xff4a6a, 0x7ae0ff]);
  const w = vr.range(0.92, 1.0), d = vr.range(0.72, 0.8);
  const h = storeys(byL(L, [2, 3, 3, 3, 4]));
  const z = -0.08;
  sk.lot(rc, 'plaza');
  need(rc, [['roof', 1], ['sign', 4]]);
  sk.block(rc, { z, w, d, h, use: 'fun', prestige: prest(L) });
  need(rc, [['sign', 4]]);
  sk.roof(rc, { z, y: G + h, w, d, kind: 'mech', prestige: prest(L) });
  need(rc, [['sign', 3]]);
  sk.sign(rc, { w: w * 0.8, h: 0.1, kind: 'marquee', color: mq }, 0, FL * 1.0, z + d / 2);
  need(rc, [['sign', 2]]);
  sk.sign(rc, { w: 0.08, h: Math.max(FL * 1.2, h - FL * 1.4), kind: 'blade', color: mq }, w / 2 - 0.06, FL * 1.3, z + d / 2);
  for (const s of [-1, 1]) {
    need(rc, [['sign', s < 0 ? 1 : 0]]);
    sk.sign(rc, { w: 0.14, h: 0.2, kind: 'screen' }, s * w * 0.28, FL * 1.35, z + d / 2 + 0.01);
  }
  need(rc);
  if (fits(rc, 20)) b.box(0.4, 0.15, 0.02, { color: mix(p.glass, 0xffffff, 0.2), mat: Mat.Glass, z: z + d / 2 + 0.005, y: G, paint: false });
  sk.tree(rc, -0.58, 0.5, 0.75);
  sk.lamp(rc, 0.56, 0.56, 0.24);
});
