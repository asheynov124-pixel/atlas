/**
 * zoned-io · Office growables (zone O) (OWNER: zoned-io).
 *
 *   corner office · business park · startup lofts · glass office tower · corporate HQ · twin exchange towers ·
 *   media tower · helix tower · megatower
 *
 * The skyline-makers. Low levels are walk-up offices and leafy business parks; from level 3 the glass towers take
 * over, and level 5 brings megatowers with sky gardens, cantilevered helipads, antenna spires and blinking
 * aviation lights. Shafts and crowns come from parts.ts (each style has its own tower outline and crown);
 * summits, helipads, plazas, fountains and car parks come from gear.ts. Storey heights snap to FL so the shared
 * shader's window rows line up across stacked segments.
 */
import { Mat, mix, shade } from '../../../kit';
import { DET, G, NP, beacon, byL, lampPost, lattice, snapFL, storeys } from './common';
import { factory, fits, flip, type IO } from './look';
import { apron, block, crown, hall, lot, opt, ring, roofGear, screen, sign, strip, tower, tree } from './parts';
import { canopy, carPark, flags, fountain, helipad, lobby, plaza, summit, type SummitKind } from './gear';

/** Podium storeys for a tower lot. */
function podium(io: IO, x: number, z: number, w: number, d: number, fl: number, color?: number): number {
  const top = block(io, { x, z, w, d, h: storeys(fl), use: 'office', color: color ?? io.p.wall, bare: true });
  if (io.lk.shell !== 'pod') lobby(io, x, z + d / 2, w * 0.72);
  if (fits(io, 12)) {
    if (io.lk.shell === 'box') io.b.box(w + 0.02, 0.03, d + 0.02, { color: io.p.trim, ...NP, x, z, y: top - 0.015 });
    else ring(io, x, z, w * 1.02, d * 1.02, top - 0.015, 0.03, io.p.trim);
  }
  return snapFL(top + 0.01) + 0.005;
}

/** Variant-stable summit choice: crowns are the common case, helipads and spires add variety. */
function summitKind(io: IO, salt: number): SummitKind {
  const k = (io.seed >> salt) % 5;
  return k <= 2 ? 'crown' : k === 3 ? 'helipad' : 'spire';
}

/** Aviation lights on two opposite roof corners of a w × d top. 20 tris. */
function aviation(io: IO, x: number, y: number, z: number, w: number, d: number): void {
  if (!fits(io, 20)) return;
  beacon(io.b, x - w * 0.42, y + 0.015, z - d * 0.42, 0.026);
  beacon(io.b, x + w * 0.42, y + 0.015, z + d * 0.42, 0.026);
}

/** Street furniture: a couple of trees and a lamp, mirrored by s. */
function streetscape(io: IO, s: number, trees: [number, number][], lamp?: [number, number]): void {
  for (const [x, z] of trees) tree(io, x * s, z, 0.8);
  if (lamp) opt(io, 12, () => lampPost(io.b, lamp[0] * s, lamp[1], 0.22, io.p.lamp));
}

// ═══════════════════════════════════════════════════════════════ corner office

export const cornerOffice = factory((io) => {
  const { L, p } = io;
  const s = flip(io, 31) ? 1 : -1;
  lot(io, 'paved', mix(io.lk.asphalt, io.lk.yard, 0.35));
  const w = byL(L, [0.62, 0.68, 0.74, 0.8, 0.84]), d = byL(L, [0.46, 0.5, 0.52, 0.54, 0.56]);
  const fl = byL(L, [2, 3, 4, 5, 6]);
  const x0 = s * 0.12, z0 = -0.18;
  io.reserve = 120;
  let top = block(io, { x: x0, z: z0, w, d, h: storeys(fl), use: 'office' });
  if (io.lk.shell !== 'pod') lobby(io, x0 + s * w * 0.12, z0 + d / 2, w * 0.5, 0.14);
  canopy(io, x0 - s * w * 0.2, z0 + d / 2, 0.24);
  io.reserve = 70;
  sign(io, x0 - s * w * 0.2, G + 0.185, z0 + d / 2 + 0.105, 0.2, 0.045, 3);
  if (L >= 4) top = block(io, { x: x0 - s * w * 0.14, z: z0 - d * 0.08, y: snapFL(top) + 0.005, w: w * 0.6, d: d * 0.72, h: storeys(L - 2), use: 'office', color: p.wall2 });
  io.reserve = 40;
  roofGear(io, x0 + s * w * 0.15, top, z0, w * 0.5, d * 0.6, L >= 3 ? 2 : 1);
  io.reserve = 0;
  carPark(io, -s * 0.46, 0.34, 0.4, byL(L, [2, 3, 3, 3, 3]));
  apron(io, x0 - s * w * 0.2, z0 + d / 2 + 0.1, 0.16, mix(io.lk.yard, 0xffffff, 0.1));
  streetscape(io, s, [[0.62, 0.3], [-0.66, -0.12]], [0.3, 0.62]);
});

// ═══════════════════════════════════════════════════════════════ business park

export const businessPark = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 32) ? 1 : -1;
  lot(io, 'green');
  const fa = byL(L, [2, 2, 3, 4, 5]), fb = byL(L, [1, 2, 2, 3, 4]);
  const ax = -0.3 * s, az = -0.26, bx = 0.32 * s, bz = -0.06;
  io.reserve = 150;
  const ta = block(io, { x: ax, z: az, w: 0.52, d: 0.38, h: storeys(fa), use: 'office' });
  io.reserve = 100;
  const tb = block(io, { x: bx, z: bz, w: 0.4, d: 0.48, h: storeys(fb), use: 'office', color: p.wall2 });
  // glass link bridge at the first floor
  b.box(0.2, storeys(1) - 0.04, 0.16, { color: mix(p.glass, 0xffffff, 0.2), mat: Mat.Glass, ...NP, x: (ax + bx) / 2 + s * 0.04, z: -0.16, y: G + storeys(1) });
  io.reserve = 60;
  sign(io, bx, G + 0.04, bz + 0.24 + 0.012, 0.26, 0.06, 4);
  // pond and lawn path
  b.cyl(0.5, 0.5, 0.012, { color: shade(lk.ground, 0.8), seg: 8, ...NP, sx: 0.4, sz: 0.24, x: -0.34 * s, z: 0.3, y: G, top: 0x3a7ab8, topMat: Mat.Water });
  apron(io, bx, bz + 0.24, 0.14, mix(lk.yard, 0xffffff, 0.1));
  io.reserve = 0;
  if (L >= 2) roofGear(io, ax, ta, az, 0.42, 0.3, 2);
  if (L >= 3) roofGear(io, bx, tb, bz, 0.3, 0.36, 1);
  carPark(io, 0.38 * s, 0.5, 0.36, 3);
  streetscape(io, s, [[-0.62, -0.02], [0.02, 0.38], [-0.08, 0.6], [0.66, -0.36]], [-0.1, 0.24]);
});

// ═══════════════════════════════════════════════════════════════ startup lofts

export const startupLofts = factory((io) => {
  const { b, L, p, st } = io;
  const s = flip(io, 33) ? 1 : -1;
  lot(io, 'yard');
  const neon = st.accents[(io.seed >> 2) % st.accents.length];
  io.reserve = 170;
  // the converted warehouse
  const hx = -0.16 * s, hz = -0.2;
  const ht = hall(io, { x: hx, z: hz, w: 0.74, d: 0.48, h: byL(L, [0.34, 0.36, 0.38, 0.4, 0.42]), doors: 0, windows: true, color: io.p.ind });
  // street-front neon name in the startup's colour, always on
  sign(io, -0.16 * s, G + 0.16, 0.04 + 0.006, 0.42, 0.08, 5, neon);
  io.reserve = 100;
  // glass box extension climbing the side
  const gx = 0.38 * s, gz = -0.12;
  const gf = byL(L, [2, 2, 3, 4, 5]);
  b.box(0.3, storeys(gf), 0.36, { color: mix(p.glass, 0xffffff, 0.25), mat: Mat.Glass, x: gx, z: gz, y: G, top: p.trim });
  b.box(0.32, 0.025, 0.38, { color: p.trim, ...NP, x: gx, z: gz, y: G + storeys(gf) });
  // L3+: a glass penthouse lands on a flat warehouse roof (or a studio block grows behind a pitched one)
  if (L >= 3) {
    if (ht.flat) b.box(0.34, storeys(L - 2) - 0.02, 0.28, { color: mix(p.glass, 0xffffff, 0.3), mat: Mat.Glass, x: hx - s * 0.08, z: hz - 0.04, y: ht.y, top: p.trim });
    else b.box(0.3, storeys(L), 0.2, { color: p.wall2, mat: Mat.Window, x: hx - s * 0.2, z: -0.56, y: G, top: p.roof });
  }
  io.reserve = 50;
  // rooftop deck: string lights between posts, a parasol
  const dy = G + storeys(gf) + 0.025;
  if (fits(io, 40)) {
    for (const dz of [-0.12, 0.12]) b.box(0.26, 0.006, 0.006, { color: 0xffe0a0, mat: Mat.Light, ...DET, x: gx, z: gz + dz, y: dy + 0.1 });
    b.cyl(0.006, 0.006, 0.1, { color: 0x3a3e46, seg: 3, ...DET, x: gx, z: gz, y: dy });
    b.cone(0.08, 0.04, { color: neon, seg: 6, ...DET, x: gx, z: gz, y: dy + 0.08 });
  }
  io.reserve = 0;
  // food truck & bike rack by the road
  opt(io, 30, () => b.group({ x: 0.1 * s, z: 0.5, y: G + 0.012, ry: Math.PI / 2 }, () => {
    b.box(0.1, 0.09, 0.2, { color: neon, ...DET });
    b.box(0.006, 0.04, 0.12, { color: 0xffe8b0, mat: Mat.Light, ...DET, x: 0.053, y: 0.035 });
  }));
  for (let i = 0; i < 3; i++) opt(io, 10, () => b.box(0.05, 0.035, 0.05, { color: st.accents[(i + io.seed) % st.accents.length], ...DET, x: (-0.3 + i * 0.08) * s, z: 0.42, y: G }));
  if (L >= 2) opt(io, 22, () => carPark(io, -0.4 * s, 0.56, 0.3, 2));
  streetscape(io, s, [[0.62, 0.3]], [-0.62, 0.3]);
});

// ═══════════════════════════════════════════════════════════════ glass office tower

export const glassTower = factory((io) => {
  const { L, p } = io;
  const s = flip(io, 34) ? 1 : -1;
  lot(io, 'paved', mix(io.lk.asphalt, io.lk.yard, 0.5));
  plaza(io, 0, 0.44, 1.1, 0.5);
  const pf = byL(L, [1, 2, 2, 3, 3]);
  const tf = byL(L, [3, 6, 12, 19, 28]);
  const tw = byL(L, [0.5, 0.52, 0.54, 0.56, 0.58]), td = byL(L, [0.42, 0.44, 0.46, 0.48, 0.5]);
  const z0 = -0.18;
  io.reserve = L >= 3 ? 170 : 90;
  const py = podium(io, 0, z0, 0.92, 0.62, pf);
  let top = tower(io, { x: s * 0.06, z: z0 - 0.04, y: py, w: tw, d: td, h: storeys(tf) });
  io.reserve = 40;
  if (L >= 3) top = summit(io, summitKind(io, 3), { x: s * 0.06, z: z0 - 0.04, y: top, w: tw, d: td, prestige: io.pr });
  else roofGear(io, s * 0.06, top, z0 - 0.04, tw * 0.8, td * 0.8, 2);
  io.reserve = 0;
  sign(io, -s * 0.24, py - 0.1, z0 + 0.31 + 0.012, 0.28, 0.06, 4);
  opt(io, 50, () => fountain(io, -0.3 * s, 0.46, 0.1));
  streetscape(io, s, [[0.34, 0.5], [0.62, 0.22], [-0.62, 0.24]], [0.12, 0.62]);
  void p;
});

// ═══════════════════════════════════════════════════════════════ corporate HQ

export const corporateHQ = factory((io) => {
  const { b, L } = io;
  const s = flip(io, 35) ? 1 : -1;
  lot(io, 'paved', mix(io.lk.yard, 0xffffff, 0.08));
  const segs = byL(L, [[3], [5, 2], [7, 4, 2], [10, 7, 4], [14, 10, 6]] as number[][]);
  const z0 = -0.2;
  let w = byL(L, [0.66, 0.66, 0.66, 0.64, 0.64]), d = byL(L, [0.5, 0.5, 0.5, 0.5, 0.5]);
  io.reserve = 150 + segs.length * 14;
  const py = podium(io, 0, z0, 0.98, 0.64, 2, io.p.wall2);
  let y = py;
  for (let i = 0; i < segs.length; i++) {
    y = tower(io, { x: 0, z: z0 - i * 0.03, y, w, d, h: storeys(segs[i]), seg: i, plain: i < segs.length - 1 });
    io.reserve -= 14;
    if (i < segs.length - 1) {
      if (fits(io, 30)) ring(io, 0, z0 - i * 0.03, w * 1.02, d * 1.02, y - 0.01, 0.03, io.p.trim);
      y = snapFL(y + 0.02) + 0.005;
      w *= 0.8;
      d *= 0.82;
    }
  }
  io.reserve = 60;
  // corporate logo high on the top segment
  sign(io, 0, y - 0.24, z0 - (segs.length - 1) * 0.03 + d / 2 + 0.014, w * 0.7, 0.1, 3);
  io.reserve = 20;
  y = L >= 3 ? crown(io, { x: 0, z: z0 - (segs.length - 1) * 0.03, y, w, d, prestige: io.pr }) : y;
  if (L < 3) roofGear(io, 0, y, z0, w * 0.8, d * 0.8, 2);
  io.reserve = 0;
  // ceremonial plaza: fountain, flags
  plaza(io, 0, 0.5, 1.0, 0.36);
  opt(io, 50, () => fountain(io, 0.26 * s, 0.5, 0.11));
  flags(io, -0.28 * s, 0.5, 3, 0.34);
  streetscape(io, s, [[0.62, 0.18], [-0.64, 0.12]], [0.0, 0.66]);
  void b;
});

// ═══════════════════════════════════════════════════════════════ twin exchange towers

export const twinTowers = factory((io) => {
  const { b, L, p } = io;
  const s = flip(io, 36) ? 1 : -1;
  lot(io, 'paved', mix(io.lk.asphalt, io.lk.yard, 0.45));
  const fl = byL(L, [4, 8, 12, 17, 23]);
  const extra = 1 + ((io.seed >> 4) % 3);
  const tw = 0.32, td = 0.36, z0 = -0.2;
  io.reserve = 200;
  const py = podium(io, 0, z0, 1.08, 0.5, 1);
  const xa = -0.27 * s, xb = 0.27 * s;
  const ha = storeys(fl + extra), hb = storeys(fl);
  const ta = tower(io, { x: xa, z: z0, y: py, w: tw, d: td, h: ha, seg: 0 });
  const tb = tower(io, { x: xb, z: z0, y: py, w: tw, d: td, h: hb, seg: 1 });
  io.reserve = 120;
  // sky bridge two-thirds up
  const by = snapFL(py + hb * 0.62) + 0.005;
  b.box(0.24, storeys(1) - 0.02, 0.14, { color: mix(p.glass, 0xffffff, 0.2), mat: Mat.Glass, ...NP, x: 0, z: z0, y: by, bottom: true });
  strip(io, 0, by - 0.012, z0, 0.26, 0.012, 0.16);
  io.reserve = 60;
  // tall twin gets the crown, its sibling a helipad (L4+) or roof plant
  if (L >= 3) crown(io, { x: xa, z: z0, y: ta, w: tw, d: td, prestige: io.pr, tall: 0.8 });
  else roofGear(io, xa, ta, z0, tw * 0.8, td * 0.8, 1);
  io.reserve = 0;
  if (L >= 4 && fits(io, 50)) {
    b.box(tw * 0.9, 0.04, td * 0.9, { color: shade(p.trim, 0.85), ...NP, x: xb, z: z0, y: tb });
    helipad(io, xb, tb + 0.04, z0, Math.min(tw, td) * 0.42);
  } else roofGear(io, xb, tb, z0, tw * 0.8, td * 0.8, 1);
  aviation(io, xb, tb, z0, tw, td);
  plaza(io, 0, 0.42, 1.0, 0.4);
  sign(io, 0, G + 0.05, z0 + 0.25 + 0.012, 0.3, 0.06, 4);
  streetscape(io, s, [[0.36, 0.46], [-0.36, 0.46], [0.66, 0.08]], [0.0, 0.62]);
});

// ═══════════════════════════════════════════════════════════════ media tower

export const mediaTower = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 37) ? 1 : -1;
  lot(io, 'paved', mix(lk.asphalt, 0x000000, 0.1));
  const tf = byL(L, [3, 6, 10, 15, 21]);
  const tw = 0.5, td = 0.44, z0 = -0.18;
  io.reserve = 190;
  const py = podium(io, 0, z0, 0.96, 0.6, 2, shade(io.p.wall, 0.8));
  // wraparound podium screens
  screen(io, -0.2 * s, G + 0.06, z0 + 0.3 + 0.014, 0.42, 0.28);
  io.reserve = 150;
  const top = tower(io, { x: 0.12 * s, z: z0 - 0.05, y: py, w: tw, d: td, h: storeys(tf) });
  io.reserve = 110;
  // a tall screen running up the tower face from L3
  if (L >= 3) screen(io, 0.12 * s + s * (tw / 2 - 0.12), py + 0.2, z0 - 0.05 + td / 2 + 0.016, 0.2, Math.min(1.4, storeys(tf) * 0.45));
  io.reserve = 60;
  // broadcast mast
  const mh = byL(L, [0.5, 0.7, 0.9, 1.1, 1.3]);
  b.box(tw * 0.7, 0.08, td * 0.7, { color: 0x30343c, ...NP, x: 0.12 * s, z: z0 - 0.05, y: top });
  lattice(b, 0.12 * s, z0 - 0.05, top + 0.08, 0.16, 0.04, mh, L >= 4 ? 2 : 1, lk.glowy ? 0xd8dce4 : 0xc0392b, 0.016);
  beacon(b, 0.12 * s, top + 0.08 + mh, z0 - 0.05, 0.03);
  io.reserve = 0;
  if (fits(io, 24)) strip(io, 0.12 * s, top - 0.02, z0 - 0.05, tw + 0.02, 0.014, td + 0.02, p.accent2);
  plaza(io, 0, 0.46, 1.0, 0.36, mix(lk.yard, 0x000000, 0.08));
  carPark(io, 0.34 * s, 0.52, 0.34, 2);
  streetscape(io, s, [[-0.64, 0.2]], [-0.3, 0.62]);
});

// ═══════════════════════════════════════════════════════════════ helix tower

export const helixTower = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 38) ? 1 : -1;
  lot(io, 'paved', mix(lk.yard, 0xffffff, 0.1));
  plaza(io, 0, 0.42, 1.0, 0.42);
  // curved outlines cost more per segment, so they twist in fewer, taller steps
  const round = lk.shell === 'round' || lk.shell === 'pod';
  const per = round ? 3 : 2;
  const n = Math.ceil(byL(L, [10, 14, 18, 24, 30]) / per);
  const twist = (0.05 + ((io.seed >> 3) % 4) * 0.008) * per * s;
  const z0 = -0.12;
  io.reserve = 150;
  const py = podium(io, 0, z0, 0.78, 0.66, 1, io.p.wall2);
  let y = py;
  const col = mix(p.glass, p.trim, 0.2);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const w = 0.56 - t * 0.12, d = 0.34 - t * 0.04;
    const h = storeys(per, 0);
    if (round) b.cyl(0.5, 0.5, h, { color: col, mat: Mat.Glass, seg: 6, flat: true, sx: w, sz: d, x: 0, z: z0, y, ry: i * twist });
    else b.box(w, h, d, { color: col, mat: Mat.Glass, x: 0, z: z0, y, ry: i * twist, top: shade(p.trim, 0.9) });
    y += h;
  }
  io.reserve = 20;
  const tw = 0.42, td = 0.28;
  // light ring at the podium roof where the twist begins
  if (fits(io, 40)) strip(io, 0, py - 0.005, z0, 0.6, 0.014, 0.4);
  b.group({ z: z0, ry: (n - 1) * twist }, () => {
    crown(io, { x: 0, z: 0, y: y + 0.005, w: tw, d: td, prestige: io.pr, tall: 1.2 });
  });
  io.reserve = 0;
  opt(io, 50, () => fountain(io, -0.3 * s, 0.46, 0.1));
  flags(io, 0.3 * s, 0.5, 2, 0.3);
  streetscape(io, s, [[0.62, 0.2], [-0.62, 0.2]], [0.0, 0.64]);
});

// ═══════════════════════════════════════════════════════════════ megatower

export const megatower = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 39) ? 1 : -1;
  lot(io, 'paved', mix(lk.yard, 0xffffff, 0.06));
  plaza(io, 0, 0.46, 1.06, 0.36);
  const segs = byL(L, [[4, 3], [7, 5], [10, 8, 5], [13, 11, 8], [17, 14, 11]] as number[][]);
  const z0 = -0.16;
  let w = 0.66, d = 0.58;
  io.reserve = 230;
  const py = podium(io, 0, z0, 1.02, 0.7, 3, io.p.wall2);
  let y = py;
  let heliDone = false;
  for (let i = 0; i < segs.length; i++) {
    const last = i === segs.length - 1;
    y = tower(io, { x: 0, z: z0, y, w, d, h: storeys(segs[i]), seg: i, plain: !last, taper: 0.06 });
    io.reserve = Math.max(150, io.reserve - 30);
    if (!last) {
      // sky garden on the setback, with a cantilevered helipad on the highest one (L4+)
      const nw = w * 0.78, nd = d * 0.8;
      if (fits(io, 26)) ring(io, 0, z0, w * 1.02, d * 1.02, y - 0.005, 0.03, shade(p.trim, 0.95));
      if (fits(io, 30)) ring(io, 0, z0, (w + nw) / 2, (d + nd) / 2, y + 0.02, 0.035, lk.green, Mat.Foliage);
      if (i === segs.length - 2 && L >= 4 && fits(io, 70)) {
        const hx = s * (w / 2 + 0.02);
        b.box(0.2, 0.03, 0.18, { color: shade(p.trim, 0.8), ...NP, x: hx - s * 0.06, z: z0 + d * 0.15, y: y - 0.02 });
        helipad(io, hx + s * 0.02, y + 0.005, z0 + d * 0.15, 0.1);
        heliDone = true;
      }
      if (fits(io, 30)) aviation(io, 0, y, z0, w, d);
      y = snapFL(y + 0.05) + 0.005;
      w = nw;
      d = nd;
    }
  }
  io.reserve = 0;
  const tip = summit(io, L >= 4 ? 'crown' : summitKind(io, 5), { x: 0, z: z0, y, w, d, prestige: io.pr, tall: 1.25 });
  if (!heliDone && L >= 4 && fits(io, 60)) helipad(io, 0.5 * s, G + 0.02, 0.46, 0.12);
  if (L >= 5 && fits(io, 22)) {
    // the spire's mid-height aviation light and a light ring at the observation deck
    beacon(b, 0, (y + tip) / 2, z0, 0.026);
  }
  opt(io, 50, () => fountain(io, -0.32 * s, 0.48, 0.1));
  flags(io, 0.3 * s, 0.52, 3, 0.34);
  streetscape(io, s, [[0.64, 0.16], [-0.64, 0.16]], [0.0, 0.66]);
});
