/**
 * zoned-io · style-dispatched architecture (OWNER: zoned-io).
 *
 * The building types call these with plain massing ("a 1.0 × 0.6 hall, 0.4 tall", "a 40-storey glass shaft",
 * "a smokestack here") and the active Look (look.ts) decides what that means in its style: a classic glazed
 * sawtooth shed becomes a neo white volume under a floating roof slab, a Martian adobe with skylight domes, an
 * ice barrel vault, a crystal prism hall or an organic pod. Same for blocks, towers, crowns, stacks, tanks,
 * domes, trees, signs and roof gear.
 *
 * Every helper draws in building space (+Y up, +Z street) and documents its rough triangle cost; optional
 * flourishes check `fits()` so a type can never blow the 400-triangle growable budget.
 */
import { Mat, mix, shade, type MatId } from '../../../kit';
import {
  DET, FL, G, LOT, NP, airHandler, antenna, band, beacon, chamferRect, fan, hexPoly, roundRect, roundTree, sawtooth, vaultX, vaultZ, type V2,
} from './common';
import { fits, type IO } from './look';

// ─────────────────────────────────────────────────────────── ground

export type LotKind = 'yard' | 'paved' | 'green' | 'soil';

/** Hexagonal lot plate with a shallow kerb (16 tris). */
export function lot(io: IO, kind: LotKind, color?: number): void {
  const { lk } = io;
  const base = color ?? (kind === 'yard' ? lk.yard : kind === 'paved' ? lk.asphalt : kind === 'green' ? lk.ground : lk.soil);
  const c = shade(base, 0.96 + (io.seed % 5) * 0.02);
  io.b.extrude(hexPoly(LOT), G, { color: c, paint: false, top: c });
}

/** Path / apron plane from the building front to the road edge. */
export function apron(io: IO, x: number, z0: number, w: number, color?: number): void {
  const len = LOT * 0.86 - z0;
  if (len <= 0.02) return;
  io.b.plane(w, len, { color: color ?? io.lk.asphalt, ...NP, x, z: z0 + len / 2, y: G + 0.002 });
}

// ─────────────────────────────────────────────────────────── facade bits

/**
 * Clerestory window ribbon wrapped round a w × d box whose roof is at yTop (aligned to a window row of the
 * shared shader so a whole row of lights shows). 10 tris.
 */
export function ribbon(io: IO, x: number, z: number, w: number, d: number, yTop: number, mat: MatId = Mat.WindowSmall, color?: number): void {
  const k = Math.floor((yTop - 0.17) / FL);
  const y0 = FL * k + 0.035;
  if (k < 0 || y0 < G + 0.05) return;
  io.b.box(w + 0.008, 0.13, d + 0.008, { color: color ?? shade(io.p.ind, 0.92), mat, x, z, y: y0 });
}

/** Roll-up / loading doors on the street face (+Z) of a box whose front is at zFront. 2 tris each. */
export function doors(io: IO, x: number, zFront: number, w: number, n: number, h = 0.14, color = 0x3a3e46): void {
  if (n <= 0) return;
  const dw = Math.min(0.13, (w * 0.8) / n - 0.03);
  for (let i = 0; i < n; i++) {
    const dx = x - (w * 0.8) / 2 + ((w * 0.8) * (i + 0.5)) / n;
    io.b.panel(dw, h, { color, ...NP, x: dx, y: G, z: zFront + 0.003 });
  }
}

/** Accent strip: always-on Glow in neon-ish looks, night-only Light otherwise. */
export function strip(io: IO, x: number, y: number, z: number, w: number, h: number, d: number, color?: number): void {
  const c = color ?? (io.lk.glowy ? io.p.glow : io.p.lamp);
  io.b.box(w, h, d, { color: c, mat: io.lk.glowy ? Mat.Glow : Mat.Light, ...NP, x, y, z });
}

/**
 * Logo sign: a dark backing board with `n` glowing glyph blocks facing +Z (bottom at y). Cyber signs are
 * holograms, classic & solarpunk letters only light up at night. Cost: 10 + 2n.
 */
export function sign(io: IO, x: number, y: number, z: number, w: number, h: number, n: number, color?: number): void {
  const { b, lk } = io;
  b.box(w + 0.03, h + 0.03, 0.02, { color: 0x1c1e24, ...NP, x, y: y - 0.015, z: z - 0.012 });
  const mat: MatId = io.sid === 'cyber' ? Mat.Holo : lk.glowy ? Mat.Glow : Mat.Light;
  const c = color ?? (lk.glowy ? io.p.glow : io.sid === 'classic' ? 0xfff2d0 : io.p.accent);
  if (b.lod === 1) {
    b.panel(w * 0.9, h * 0.7, { color: c, mat, ...NP, x, y: y + h * 0.15, z: z + 0.001 });
    return;
  }
  let tot = 0;
  const ws: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = 0.6 + ((io.seed >> (i % 16)) & 3) * 0.25;
    ws.push(r);
    tot += r;
  }
  const gap = 0.2;
  const unit = w / (tot + gap * (n - 1));
  let gx = x - w / 2;
  for (let i = 0; i < n; i++) {
    const gw = ws[i] * unit;
    const gh = h * (i === 0 ? 1 : 0.76);
    b.panel(gw, gh, { color: c, mat, ...NP, x: gx + gw / 2, y: y + (h - gh) / 2, z: z + 0.001 });
    gx += gw + gap * unit;
  }
}

/** Big animated billboard screen on a frame (cyberpunk / media). 12 tris. */
export function screen(io: IO, x: number, y: number, z: number, w: number, h: number, ry = 0): void {
  io.b.group({ x, y, z, ry }, () => {
    io.b.box(w + 0.03, h + 0.03, 0.02, { color: 0x15161b, ...NP, y: -0.015, z: -0.012 });
    io.b.panel(w, h, { color: 0xffffff, mat: Mat.Screen, ...NP, z: 0.001 });
  });
}

// ─────────────────────────────────────────────────────────── halls

export interface HallOpts {
  x?: number;
  z?: number;
  w: number;
  d: number;
  /** wall height */
  h: number;
  color?: number;
  roof?: number;
  /** loading / roll-up doors on the +Z face */
  doors?: number;
  /** add a clerestory window ribbon (default when h ≥ 0.3) */
  windows?: boolean;
  /** farm building: the sawtooth looks use a pitched gable roof instead */
  pitched?: boolean;
}

/** Result of a hall: roof height for gear, and whether the roof is flat enough for rooftop equipment. */
export interface HallTop {
  y: number;
  flat: boolean;
}

/**
 * Industrial shed in the style's grammar. Cost ≈ 40–100 tris depending on the look.
 */
export function hall(io: IO, o: HallOpts): HallTop {
  const { b, lk, p } = io;
  const x = o.x ?? 0, z = o.z ?? 0, w = o.w, d = o.d, h = o.h;
  const wall = o.color ?? p.ind;
  const roof = o.roof ?? p.roof;
  const top = G + h;
  const win = o.windows ?? h >= 0.3;
  const front = z + d / 2;
  switch (lk.hall) {
    case 'saw': {
      b.box(w, h, d, { color: wall, x, z, y: G });
      if (win) ribbon(io, x, z, w, d, top);
      const solar = io.sid === 'solarpunk';
      if (o.pitched) {
        const rh = Math.min(0.24, d * 0.5);
        b.gable(w, rh, d, { color: roof, x, z, y: top, overhang: 0.03 });
        if (solar && fits(io, 12)) b.box(w * 0.7, 0.012, d * 0.4, { color: 0x1a2a4a, mat: Mat.Solar, ...NP, x, z: z + d * 0.25, y: top + rh * 0.42, rx: Math.atan2(rh, d / 2 + 0.03) });
        doors(io, x, front, w, o.doors ?? 0, Math.min(0.15, h - 0.02), 0x5a3a2a);
        return { y: top + rh, flat: false };
      }
      const n = Math.max(2, Math.min(5, Math.round(d / 0.2)));
      const th = Math.min(0.14, (d / n) * 0.75);
      sawtooth(b, w, d, th, n, { color: solar ? 0x1a2a4a : roof, slopeMat: solar ? Mat.Solar : Mat.Plain, glass: mix(p.glass, 0xffffff, 0.15), x, z, y: top, paint: !solar });
      if (solar) band(b, w, d, 0.03, { color: p.trim, x, z, y: top - 0.03, out: 0.008 });
      doors(io, x, front, w, o.doors ?? 0);
      return { y: top, flat: false };
    }
    case 'slab': {
      b.extrude(roundRect(w, d, Math.min(w, d) * 0.22, 2, x, z), h, { color: wall });
      b.panel(w * 0.7, 0.09, { color: p.glass, mat: Mat.Glass, ...NP, x, z: front + 0.004, y: top - 0.15 });
      b.box(w + 0.1, 0.035, d + 0.08, { color: shade(wall, 1.03), x, z, y: top + 0.02, bottom: true });
      if (fits(io, 12)) strip(io, x, top + 0.024, z + d / 2 + 0.041, w + 0.1, 0.012, 0.012);
      doors(io, x, front, w, o.doors ?? 0, 0.13, 0x50607a);
      return { y: top + 0.055, flat: true };
    }
    case 'flat': {
      b.box(w, h, d, { color: wall, x, z, y: G });
      if (win) ribbon(io, x, z, w, d, top - 0.04, Mat.WindowSmall, shade(wall, 0.85));
      band(b, w, d, 0.04, { color: p.trim, x, z, y: top - 0.01, out: 0.01 });
      strip(io, x, top - 0.07, z, w + 0.016, 0.014, d + 0.016);
      doors(io, x, front, w, o.doors ?? 0, 0.14, 0x1a1c22);
      return { y: top + 0.03, flat: true };
    }
    case 'adobe': {
      b.extrude(roundRect(w, d, Math.min(0.09, Math.min(w, d) * 0.25), 1, x, z), h, { color: wall, mat: win ? Mat.WindowSmall : Mat.Plain, top: shade(wall, 1.08) });
      const r = Math.min(w, d) * 0.22;
      b.dome(r, { color: roof === wall ? 0xf2e6d0 : mix(roof, 0xf2e6d0, 0.5), wSeg: 8, hSeg: 2, x: x - w * 0.18, z, y: top });
      if (w > 0.6 && fits(io, 30)) b.dome(r * 0.75, { color: mix(p.glass, 0xffffff, 0.3), mat: Mat.Glass, ...NP, wSeg: 8, hSeg: 2, x: x + w * 0.25, z, y: top });
      doors(io, x, front, w, o.doors ?? 0, 0.13, 0x5a3a2a);
      return { y: top, flat: true };
    }
    case 'vault': {
      const wh = Math.max(0.12, h * 0.55);
      b.box(w, wh, d, { color: wall, x, z, y: G });
      const along = w >= d;
      const rise = Math.min(along ? d : w, 0.7) * 0.5;
      if (along) vaultX(b, w, d, rise, { color: roof, x, z, y: G + wh, seg: 6 });
      else vaultZ(b, w, d, rise, { color: roof, x, z, y: G + wh, seg: 6 });
      strip(io, x, G + 0.03, z, w + 0.014, 0.014, d + 0.014);
      doors(io, x, front, w, o.doors ?? 0, Math.min(0.13, wh - 0.01), 0x4a6a8a);
      return { y: G + wh + rise, flat: false };
    }
    case 'prism': {
      b.box(w, h, d, { color: wall, x, z, y: G });
      const rh = Math.min(0.32, d * 0.55);
      b.gable(w, rh, d, { color: mix(p.glass, p.accent, 0.2), mat: Mat.Glass, ...NP, x, z, y: top, overhang: 0.02 });
      b.box(w + 0.03, 0.014, 0.014, { color: p.glow, mat: Mat.Glow, ...NP, x, z, y: top + rh - 0.004 });
      if (fits(io, 24)) for (const s of [-1, 1]) b.box(0.014, h, 0.014, { color: p.glow, mat: Mat.Glow, ...NP, x: x + s * (w / 2 + 0.002), z: front + 0.002, y: G });
      doors(io, x, front, w, o.doors ?? 0, 0.13, 0x3a2a5a);
      return { y: top + rh, flat: false };
    }
    case 'pod': {
      const ph = h + 0.12;
      b.cyl(0.5, 0.5, 0.05, { color: p.trim, seg: 8, sx: w * 1.06, sz: d * 1.06, x, z, y: G, capTop: false });
      b.dome(0.5, { color: wall, wSeg: 8, hSeg: 3, sx: w, sz: d, h: ph, x, z, y: G + 0.04 });
      if (fits(io, 20)) b.cyl(0.5, 0.5, 0.014, { color: p.glow, mat: Mat.Glow, ...NP, seg: 8, sx: w * 0.93, sz: d * 0.93, capTop: false, x, z, y: G + 0.04 + ph * 0.42 });
      doors(io, x, front + 0.01, w * 0.6, o.doors ?? 0, 0.11, 0x4a2a3a);
      return { y: G + 0.04 + ph, flat: false };
    }
  }
}

// ─────────────────────────────────────────────────────────── blocks (multi-storey)

export type BlockUse = 'office' | 'lab' | 'ind';

export interface BlockOpts {
  x?: number;
  z?: number;
  y?: number;
  w: number;
  d: number;
  h: number;
  use: BlockUse;
  color?: number;
  /** skip the style cap (when something else sits on top) */
  bare?: boolean;
}

/** Multi-storey block with windows in the style's outline. Returns the roof height. Cost ≈ 20–70 tris. */
export function block(io: IO, o: BlockOpts): number {
  const { b, lk, p } = io;
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G, w = o.w, d = o.d, h = o.h;
  const mat: MatId = o.use === 'ind' ? Mat.WindowSmall : Mat.Window;
  const col = o.color ?? (o.use === 'ind' ? p.ind : p.wall);
  const top = y + h;
  switch (lk.shell) {
    case 'box': {
      b.box(w, h, d, { color: col, mat, x, z, y });
      if (o.bare) return top;
      if (io.sid === 'classic') band(b, w, d, 0.03, { color: p.trim, x, z, y: top - 0.015, out: 0.014 });
      else if (io.sid === 'solarpunk') {
        b.box(w * 0.86, 0.035, d * 0.8, { color: lk.green, mat: Mat.Foliage, ...NP, x, z, y: top, top: lk.green2 });
        if (fits(io, 20)) for (const s of [-1, 1]) b.box(0.03, h, 0.03, { color: p.trim, ...NP, x: x + s * (w / 2 - 0.04), z: z + d / 2 + 0.012, y });
      } else {
        band(b, w, d, 0.03, { color: p.trim, x, z, y: top - 0.01, out: 0.008 });
        if (fits(io, 20)) for (const s of [-1, 1]) strip(io, x + s * (w / 2 + 0.004), y, z + d / 2 + 0.004, 0.014, h, 0.014);
      }
      return top + 0.02;
    }
    case 'round': {
      b.push({ y });
      b.extrude(roundRect(w, d, Math.min(w, d) * 0.3, 2, x, z), h, { color: col, mat, top: shade(col, 1.05) });
      b.pop();
      if (o.bare) return top;
      if (io.sid === 'neo') {
        b.box(w + 0.06, 0.03, d + 0.06, { color: shade(col, 1.04), x, z, y: top, bottom: true });
        if (fits(io, 12)) strip(io, x, top + 0.008, z + d / 2 + 0.032, w + 0.05, 0.012, 0.01);
        return top + 0.03;
      }
      if (fits(io, 26)) b.dome(Math.min(w, d) * 0.32, { color: io.sid === 'ice' ? mix(lk.houseGlass, 0xffffff, 0.3) : 0xf2e6d0, mat: io.sid === 'ice' ? Mat.Glass : Mat.Plain, ...NP, wSeg: 8, hSeg: 2, x, z, y: top });
      return top;
    }
    case 'facet': {
      b.push({ y });
      b.extrude(chamferRect(w, d, Math.min(w, d) * 0.28, x, z), h, { color: col, mat: Mat.Glass });
      b.pop();
      if (o.bare) return top;
      if (fits(io, 14)) {
        b.box(0.016, h, 0.016, { color: p.glow, mat: Mat.Glow, ...NP, x: x - w / 2 + Math.min(w, d) * 0.14, z: z + d / 2 - Math.min(w, d) * 0.14 + 0.006, y, ry: Math.PI / 4 });
        b.pyramid(Math.min(w, d) * 0.4, Math.min(w, d) * 0.35, Math.min(w, d) * 0.4, { color: mix(p.wall, p.glow, 0.4), ...NP, x, z, y: top });
      }
      return top;
    }
    case 'pod': {
      const prof: [number, number][] = [[0.42, 0], [0.5, h * 0.28], [0.47, h * 0.78], [0.3, h + 0.04], [0.001, h + 0.08]];
      b.lathe(prof, { color: col, mat, seg: 8, sx: w, sz: d, x, z, y });
      if (o.bare) return top;
      if (fits(io, 18)) b.cyl(0.5, 0.5, 0.012, { color: p.glow, mat: Mat.Glow, ...NP, seg: 8, sx: w * 1.0, sz: d * 1.0, capTop: false, x, z, y: y + h * 0.28 - 0.006 });
      return top + 0.06;
    }
  }
}

// ─────────────────────────────────────────────────────────── towers (curtain wall)

export interface TowerOpts {
  x?: number;
  z?: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** 0..1 top narrower than bottom (facet/pod looks) */
  taper?: number;
  /** segment index (alternating details) */
  seg?: number;
  color?: number;
}

/** One glass shaft of an office tower. Returns its roof height. Cost ≈ 12–60 tris. */
export function tower(io: IO, o: TowerOpts): number {
  const { b, lk, p } = io;
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y, w = o.w, d = o.d, h = o.h;
  const col = o.color ?? mix(p.glass, p.trim, 0.22);
  const top = y + h;
  switch (lk.shell) {
    case 'box': {
      b.box(w, h, d, { color: col, mat: Mat.Glass, x, z, y });
      if (io.sid === 'classic') band(b, w, d, 0.04, { color: p.trim, x, z, y: top - 0.02, out: 0.012 });
      else if (io.sid === 'solarpunk') band(b, w, d, 0.04, { color: lk.green, mat: Mat.Foliage, x, z, y: top - 0.02, out: 0.02, paint: false });
      else if (fits(io, 30)) {
        band(b, w, d, 0.02, { color: p.trim, x, z, y: top - 0.01, out: 0.006 });
        for (const s of [-1, 1]) strip(io, x + s * (w / 2 + 0.003), y, z + d / 2 + 0.003, 0.012, h, 0.012, (o.seg ?? 0) % 2 ? io.p.accent2 : undefined);
      }
      return top;
    }
    case 'round': {
      if (io.sid === 'mars') {
        b.push({ y });
        b.extrude(roundRect(w, d, Math.min(w, d) * 0.35, 2, x, z), h, { color: col, mat: Mat.Glass });
        b.pop();
        band(b, w * 0.98, d * 0.98, 0.04, { color: p.wall, x, z, y: top - 0.02, out: 0.012 });
      } else {
        b.cyl(0.5, 0.5, h, { color: col, mat: Mat.Glass, seg: 10, sx: w, sz: d, x, z, y });
        b.cyl(0.5, 0.5, 0.035, { color: io.sid === 'ice' ? 0xf2f8ff : 0xf4f6fa, seg: 10, sx: w * 1.07, sz: d * 1.07, x, z, y: top - 0.015 });
        if (lk.glowy && fits(io, 20)) b.cyl(0.5, 0.5, 0.012, { color: p.glow, mat: Mat.Glow, ...NP, seg: 10, sx: w * 1.075, sz: d * 1.075, capTop: false, x, z, y: top - 0.03 });
      }
      return top + 0.02;
    }
    case 'facet': {
      const r = Math.min(w, d) * 0.58;
      const t = o.taper ?? 0.12;
      b.cyl(r * (1 - t), r, h, { color: col, mat: Mat.Glass, seg: 6, flat: true, x, z, y, ry: Math.PI / 6 });
      if (fits(io, 12)) b.cyl(r * (1 - t) * 1.04, r * (1 - t) * 1.04, 0.016, { color: p.glow, mat: Mat.Glow, ...NP, seg: 6, capTop: false, x, z, y: top - 0.016, ry: Math.PI / 6 });
      return top;
    }
    case 'pod': {
      const t = o.taper ?? 0;
      const prof: [number, number][] = [[0.44, 0], [0.5, h * 0.35], [0.47 * (1 - t), h * 0.85], [0.4 * (1 - t), h]];
      b.lathe(prof, { color: col, mat: Mat.Glass, seg: 8, sx: w, sz: d, x, z, y });
      b.cyl(0.4 * (1 - t), 0.4 * (1 - t), 0.03, { color: p.trim, seg: 8, sx: w * 1.04, sz: d * 1.04, x, z, y: top - 0.01 });
      return top + 0.02;
    }
  }
}

/**
 * A band that follows the style's tower outline (box / ellipse / hexagon) — planted ledges, light rings, floor
 * plates. capTop draws its top (a ledge you can see from above). Cost 12–30 tris.
 */
export function ring(io: IO, x: number, z: number, w: number, d: number, y: number, h: number, color: number, mat: MatId = Mat.Plain, capTop = true): void {
  const { b, lk } = io;
  if (lk.shell === 'box') b.box(w, h, d, { color, mat, ...NP, x, z, y });
  else if (lk.shell === 'facet') b.cyl(Math.min(w, d) * 0.58, Math.min(w, d) * 0.58, h, { color, mat, ...NP, seg: 6, flat: true, capTop, x, z, y, ry: Math.PI / 6 });
  else b.cyl(0.5, 0.5, h, { color, mat, ...NP, seg: 8, sx: w, sz: d, capTop, x, z, y });
}

// ─────────────────────────────────────────────────────────── crowns

export interface CrownOpts {
  x?: number;
  z?: number;
  y: number;
  w: number;
  d: number;
  /** 0..1 */
  prestige: number;
  /** spire height multiplier */
  tall?: number;
}

/** Tower top in the style's language, with aviation beacons. Returns the tip height. Cost ≈ 20–90 tris. */
export function crown(io: IO, o: CrownOpts): number {
  const { b, lk, p } = io;
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y, w = o.w, d = o.d;
  const tall = o.tall ?? 1;
  const m = Math.min(w, d);
  switch (lk.crown) {
    case 'deco': {
      b.box(w * 0.78, 0.16, d * 0.78, { color: p.trim, mat: Mat.Window, x, z, y });
      b.box(w * 0.54, 0.16, d * 0.54, { color: p.trim, x, z, y: y + 0.16 });
      b.pyramid(w * 0.42, 0.3, d * 0.42, { color: shade(p.trim, 0.92), x, z, y: y + 0.32 });
      band(b, w * 0.78, d * 0.78, 0.02, { color: 0xffe0a0, mat: Mat.Light, ...NP, x, z, y: y + 0.15, out: 0.006 });
      const sh = 0.5 * tall * (0.6 + o.prestige * 0.6);
      b.cyl(0.006, 0.03, sh, { color: 0xd8d8d0, mat: Mat.Metal, ...NP, seg: 4, x, z, y: y + 0.55, capTop: false });
      beacon(b, x, y + 0.55 + sh, z);
      return y + 0.55 + sh;
    }
    case 'halo': {
      b.cyl(0.5, 0.5, 0.12, { color: 0xf4f6fa, seg: 10, sx: w * 0.8, sz: d * 0.8, x, z, y });
      b.torus(m * 0.48, 0.022, { color: p.glow, mat: Mat.Glow, ...NP, seg: 12, tube: 3, x, z, y: y + 0.32 });
      for (const s of [-1, 1]) b.box(0.016, 0.24, 0.016, { color: 0xf4f6fa, ...NP, x: x + s * m * 0.48, z, y: y + 0.1 });
      const sh = 0.7 * tall * (0.5 + o.prestige * 0.7);
      b.cyl(0.004, 0.022, sh, { color: 0xf4f6fa, mat: Mat.Metal, ...NP, seg: 4, x, z, y: y + 0.12, capTop: false });
      beacon(b, x, y + 0.12 + sh, z, 0.03);
      return y + 0.12 + sh;
    }
    case 'garden': {
      b.box(w * 0.92, 0.06, d * 0.92, { color: 0x8a5a3a, ...NP, x, z, y });
      b.box(w * 0.86, 0.03, d * 0.86, { color: lk.green, mat: Mat.Foliage, ...NP, x, z, y: y + 0.06, top: lk.green2 });
      tree(io, x - w * 0.22, z + d * 0.18, 1.2, y + 0.09);
      tree(io, x + w * 0.24, z - d * 0.16, 1.0, y + 0.09);
      const mh = 0.55 * tall * (0.6 + o.prestige * 0.5);
      b.cyl(0.008, 0.016, mh, { color: 0xe8e0d0, ...NP, seg: 4, x: x + w * 0.2, z: z + d * 0.22, y: y + 0.06, capTop: false });
      if (fits(io, 40)) b.group({ x: x + w * 0.2, z: z + d * 0.22 + 0.02, y: y + 0.06 + mh }, () => {
        for (let k = 0; k < 3; k++) b.box(0.025, 0.2, 0.006, { color: 0xf6f0e0, ...NP, rz: (k * Math.PI * 2) / 3, y: 0 });
      });
      beacon(b, x + w * 0.2, y + 0.06 + mh, z + d * 0.22, 0.025);
      return y + 0.06 + mh;
    }
    case 'antenna': {
      b.box(w * 0.7, 0.14, d * 0.7, { color: 0x22252e, x, z, y });
      strip(io, x, y + 0.14, z, w * 0.72, 0.016, d * 0.72);
      if (fits(io, 18)) b.cyl(m * 0.38, m * 0.38, 0.1, { color: p.accent2, mat: Mat.Holo, ...NP, seg: 8, capTop: false, x, z, y: y + 0.2 });
      const sh = 0.9 * tall * (0.5 + o.prestige * 0.6);
      antenna(b, x - w * 0.12, y + 0.14, z, sh, 0xff2fd0, 0x5a5f6e, false);
      antenna(b, x + w * 0.16, y + 0.14, z - d * 0.1, sh * 0.6, 0xff3030, 0x5a5f6e, false);
      if (fits(io, 16)) antenna(b, x + w * 0.05, y + 0.14, z + d * 0.18, sh * 0.4, 0x2ff8ff, 0x5a5f6e);
      return y + 0.14 + sh;
    }
    case 'dome': {
      b.cyl(0.5, 0.5, 0.06, { color: p.wall, seg: 10, sx: w * 0.86, sz: d * 0.86, x, z, y });
      b.dome(m * 0.4, { color: 0xf2e6d0, wSeg: 10, hSeg: 3, x, z, y: y + 0.06 });
      if (fits(io, 18)) b.cyl(m * 0.42, m * 0.42, 0.016, { color: p.lamp, mat: Mat.Light, ...NP, seg: 10, capTop: false, x, z, y: y + 0.06 });
      const sh = 0.5 * tall * (0.5 + o.prestige * 0.6);
      b.cyl(0.005, 0.016, sh, { color: 0xf2e6d0, mat: Mat.Metal, ...NP, seg: 4, x, z, y: y + 0.06 + m * 0.4, capTop: false });
      beacon(b, x, y + 0.06 + m * 0.4 + sh, z, 0.028);
      return y + 0.06 + m * 0.4 + sh;
    }
    case 'frost': {
      b.cyl(0.5, 0.5, 0.05, { color: 0xf2f8ff, seg: 10, sx: w * 0.9, sz: d * 0.9, x, z, y });
      b.dome(m * 0.42, { color: mix(lk.houseGlass, 0xffffff, 0.25), mat: Mat.Glass, ...NP, wSeg: 10, hSeg: 3, x, z, y: y + 0.05, h: m * 0.5 });
      b.cyl(m * 0.43, m * 0.43, 0.014, { color: p.glow, mat: Mat.Glow, ...NP, seg: 10, capTop: false, x, z, y: y + 0.05 });
      const sh = 0.6 * tall * (0.5 + o.prestige * 0.6);
      b.cyl(0.004, 0.018, sh, { color: 0xf2f8ff, mat: Mat.Metal, ...NP, seg: 4, x, z, y: y + 0.05 + m * 0.48, capTop: false });
      beacon(b, x, y + 0.05 + m * 0.48 + sh, z, 0.028);
      return y + 0.05 + m * 0.48 + sh;
    }
    case 'shard': {
      const sh = (0.7 + o.prestige * 0.8) * tall;
      b.cyl(0, m * 0.4, sh, { color: mix(p.wall, p.glow, 0.35), mat: Mat.Glass, ...NP, seg: 4, flat: true, x, z, y, ry: Math.PI / 4 });
      b.cyl(0, m * 0.2, sh * 0.5, { color: p.glow, mat: Mat.Glow, ...NP, seg: 4, flat: true, x: x + m * 0.32, z: z + m * 0.1, y, rz: -0.2 });
      if (fits(io, 10)) b.cyl(0, m * 0.16, sh * 0.38, { color: mix(p.glow, 0xffffff, 0.3), mat: Mat.Glow, ...NP, seg: 4, flat: true, x: x - m * 0.3, z: z - m * 0.12, y, rz: 0.25 });
      beacon(b, x, y + sh, z, 0.026, 0xff60ff);
      return y + sh;
    }
    case 'bloom': {
      b.lathe([[m * 0.42, 0], [m * 0.48, 0.14], [m * 0.3, 0.32], [0.001, 0.4]], { color: p.wall, seg: 8, x, z, y });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        b.group({ x: x + Math.sin(a) * m * 0.36, z: z + Math.cos(a) * m * 0.36, y: y + 0.1, ry: a }, () =>
          b.box(0.07, 0.34 * tall, 0.02, { color: p.trim, ...NP, rx: 0.38 }),
        );
      }
      const sh = 0.45 * tall * (0.6 + o.prestige * 0.6);
      b.cyl(0.006, 0.02, sh, { color: p.trim, ...NP, seg: 4, x, z, y: y + 0.36, capTop: false });
      b.sphere(0.05, { color: p.glow, mat: Mat.Glow, ...NP, wSeg: 6, hSeg: 3, x, z, y: y + 0.36 + sh });
      return y + 0.4 + sh;
    }
  }
}

// ─────────────────────────────────────────────────────────── stacks & tanks

/** Smokestack / exhaust stack in the style. Cost ≈ 25–45 tris. */
export function stack(io: IO, x: number, z: number, r: number, h: number, y = G): void {
  const { b, lk, p } = io;
  switch (lk.stack) {
    case 'stripe': {
      const n = h > 1.3 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const r0 = r * (1 - t0 * 0.25), r1 = r * (1 - t1 * 0.25);
        b.cyl(r1, r0, h / n, { color: i % 2 ? 0xf2f0ea : 0xc0392b, seg: 5, ...NP, x, z, y: y + h * t0, capTop: i === n - 1, top: 0x1a1a1a });
      }
      if (fits(io, 10)) beacon(b, x + r * 0.7, y + h, z, 0.026);
      return;
    }
    case 'slim': {
      b.cyl(r * 0.6, r * 0.9, h, { color: 0xf4f6fa, seg: 6, x, z, y, top: 0x30343c });
      b.cyl(r * 0.66, r * 0.66, 0.03, { color: p.glow, mat: Mat.Glow, ...NP, seg: 6, capTop: false, x, z, y: y + h * 0.84 });
      return;
    }
    case 'brick': {
      b.cyl(r * 0.8, r, h, { color: 0xb8653a, seg: 6, x, z, y, top: 0x2a2020 });
      b.cyl(r * 1.15, r * 1.15, 0.05, { color: lk.green, mat: Mat.Foliage, ...NP, seg: 6, x, z, y: y + h * 0.82, top: lk.green2 });
      return;
    }
    case 'neon': {
      b.cyl(r * 0.85, r, h, { color: 0x30343f, mat: Mat.Metal, seg: 6, ...NP, x, z, y, topMat: Mat.Lava, top: 0xff5020 });
      b.cyl(r * 0.92, r * 0.92, 0.025, { color: p.glow, mat: Mat.Glow, ...NP, seg: 6, capTop: false, x, z, y: y + h * 0.45 });
      b.cyl(r * 0.88, r * 0.88, 0.025, { color: p.accent2, mat: Mat.Glow, ...NP, seg: 6, capTop: false, x, z, y: y + h * 0.8 });
      return;
    }
    case 'adobe': {
      b.cyl(r * 0.7, r * 1.15, h, { color: shade(p.ind, 0.95), seg: 6, x, z, y, top: 0x3a2a20 });
      b.cyl(r * 0.8, r * 0.8, 0.05, { color: 0xf2e6d0, seg: 6, ...NP, x, z, y: y + h - 0.02, capTop: false });
      if (fits(io, 10)) beacon(b, x, y + h + 0.01, z + r * 0.7, 0.022);
      return;
    }
    case 'frost': {
      b.cyl(r * 0.8, r, h, { color: 0xf2f8ff, seg: 6, x, z, y, top: 0x40506a });
      b.cyl(r * 0.86, r * 0.86, 0.025, { color: p.glow, mat: Mat.Glow, ...NP, seg: 6, capTop: false, x, z, y: y + h * 0.7 });
      if (fits(io, 10)) beacon(b, x, y + h, z, 0.022);
      return;
    }
    case 'shard': {
      b.cyl(r * 0.35, r, h, { color: p.wall, seg: 4, flat: true, x, z, y, ry: Math.PI / 4, top: p.glow, topMat: Mat.Glow });
      b.cyl(0, r * 0.42, h * 0.25, { color: p.glow, mat: Mat.Glow, ...NP, seg: 4, flat: true, x, z, y: y + h, ry: Math.PI / 4 });
      return;
    }
    case 'tendril': {
      const lean = (io.seed % 2 ? 1 : -1) * r * 1.4;
      b.tube([[x, y, z], [x + lean * 0.3, y + h * 0.55, z], [x + lean, y + h, z + r * 0.5]], r * 0.75, { color: p.trim, seg: 4 });
      b.sphere(r * 1.05, { color: p.glow, mat: Mat.Glow, ...NP, wSeg: 5, hSeg: 3, x: x + lean, z: z + r * 0.5, y: y + h + r * 0.6 });
      return;
    }
  }
}

/** Storage tank in the style (radius r, wall height h). Cost ≈ 35–65 tris. */
export function tank(io: IO, x: number, z: number, r: number, h: number, color?: number, y = G): void {
  const { b, lk, p } = io;
  const c = color ?? (io.sid === 'cyber' ? 0x3a3f4e : io.sid === 'classic' ? 0xe6e2da : p.wall);
  switch (lk.tank) {
    case 'cone':
      b.cyl(r, r, h, { color: c, seg: 8, x, z, y, capTop: false });
      b.cone(r * 1.02, r * 0.35, { color: shade(c, 0.9), seg: 8, x, z, y: y + h });
      b.cyl(r * 1.01, r * 1.01, h * 0.16, { color: p.accent, seg: 8, ...NP, capTop: false, x, z, y: y + h * 0.62 });
      return;
    case 'domed':
      b.cyl(r, r, h, { color: c, seg: 8, x, z, y, capTop: false });
      b.dome(r, { color: c, wSeg: 8, hSeg: 2, x, z, y: y + h, h: r * 0.6 });
      if (fits(io, 20)) b.cyl(r * 1.01, r * 1.01, 0.014, { color: p.glow, mat: Mat.Glow, ...NP, seg: 8, capTop: false, x, z, y: y + h * 0.3 });
      return;
    case 'stave':
      b.cyl(r, r, h, { color: 0xb08050, seg: 8, x, z, y, top: lk.green, topMat: Mat.Foliage });
      b.cyl(r * 1.02, r * 1.02, 0.02, { color: 0x4a3a2a, seg: 8, ...NP, capTop: false, x, z, y: y + h * 0.62 });
      return;
    case 'ringed':
      b.cyl(r, r, h, { color: c, mat: Mat.Metal, seg: 8, x, z, y, top: 0x22252e });
      b.cyl(r * 1.02, r * 1.02, 0.02, { color: p.glow, mat: Mat.Glow, ...NP, seg: 8, capTop: false, x, z, y: y + h * 0.7 });
      return;
    case 'adobe':
      b.cyl(r, r * 1.06, h, { color: c, seg: 8, x, z, y, capTop: false });
      b.dome(r, { color: 0xf2e6d0, wSeg: 8, hSeg: 2, x, z, y: y + h, h: r * 0.7 });
      return;
    case 'sphere': {
      const R = Math.min(r * 1.15, (h + r) * 0.5);
      b.cyl(R * 0.35, R * 0.5, h * 0.4, { color: lk.steel, mat: Mat.Metal, seg: 4, ...NP, x, z, y, capTop: false });
      b.sphere(R, { color: c, wSeg: 8, hSeg: 4, x, z, y: y + h * 0.4 + R * 0.85 });
      return;
    }
    case 'prism':
      b.prism(6, r, h, { color: c, mat: Mat.Plain, x, z, y, top: shade(c, 1.1) });
      b.cyl(r * 1.02, r * 1.02, 0.018, { color: p.glow, mat: Mat.Glow, ...NP, seg: 6, flat: true, capTop: false, x, z, y: y + h * 0.75 });
      b.cyl(0, r * 0.7, r * 0.6, { color: mix(c, p.glow, 0.4), seg: 6, flat: true, ...NP, x, z, y: y + h });
      return;
    case 'bulb':
      b.lathe([[r * 0.7, 0], [r * 1.05, h * 0.45], [r * 0.7, h * 1.02], [0.001, h * 1.15]], { color: c, seg: 7, x, z, y });
      if (fits(io, 14)) b.cyl(r * 1.0, r * 1.0, 0.014, { color: p.glow, mat: Mat.Glow, ...NP, seg: 7, capTop: false, x, z, y: y + h * 0.45 });
      return;
  }
}

// ─────────────────────────────────────────────────────────── domes, trees, roof gear

/** Greenhouse / habitat dome with a base ring. glass=false → opaque shell in the roof colour. ~56 tris (seg 8). */
export function dome(io: IO, x: number, z: number, r: number, h: number, glass = true, seg = 8): void {
  const { b, lk, p } = io;
  b.cyl(r * 1.02, r * 1.04, 0.035, { color: p.trim, seg, ...NP, x, z, y: G, capTop: false });
  const facet = io.sid === 'crystal' || io.sid === 'cyber';
  const col = glass ? lk.houseGlass : io.sid === 'mars' ? 0xf2e6d0 : p.roof;
  b.dome(r, { color: col, mat: glass ? Mat.Glass : Mat.Plain, ...NP, wSeg: facet ? 6 : seg, hSeg: facet ? 2 : 3, flat: facet, x, z, y: G + 0.03, h });
}

/** Style tree. Cost ≈ 16–46 tris (skipped when the budget is spent). */
export function tree(io: IO, x: number, z: number, s = 1, y = G): void {
  const { b, lk } = io;
  if (io.lo || !fits(io, 46)) return;
  const fm: MatId = y < 1.2 ? Mat.Foliage : Mat.Plain;
  switch (lk.tree) {
    case 'round':
      roundTree(b, x, z, s, (io.seed + Math.round(x * 31)) % 3 ? lk.green : lk.green2, lk.trunk, y);
      return;
    case 'neat':
      b.cyl(0.012 * s, 0.016 * s, 0.1 * s, { color: lk.trunk, seg: 3, ...DET, x, z, y, capTop: false });
      b.sphere(0.085 * s, { color: lk.green, mat: fm, ...DET, wSeg: 6, hSeg: 3, x, z, y: y + 0.19 * s, sy: 1.4 });
      return;
    case 'lush':
      b.cyl(0.018 * s, 0.026 * s, 0.14 * s, { color: lk.trunk, seg: 3, ...DET, x, z, y, capTop: false });
      b.sphere(0.13 * s, { color: lk.green, mat: fm, ...DET, wSeg: 5, hSeg: 3, flat: true, x, z, y: y + 0.2 * s, sy: 0.85 });
      b.sphere(0.08 * s, { color: lk.green2, mat: fm, ...DET, wSeg: 5, hSeg: 3, flat: true, x: x + 0.06 * s, z: z + 0.03 * s, y: y + 0.3 * s });
      return;
    case 'neon':
      b.cyl(0.01 * s, 0.016 * s, 0.26 * s, { color: 0x2a2e38, seg: 3, ...DET, x, z, y, capTop: false });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.group({ x, z, y: y + 0.25 * s, ry: a }, () => b.box(0.03 * s, 0.01 * s, 0.15 * s, { color: k ? io.p.glow : io.p.accent2, mat: Mat.Glow, ...DET, z: 0.065 * s, rx: 0.45 }));
      }
      return;
    case 'cactus':
      b.cyl(0.03 * s, 0.036 * s, 0.22 * s, { color: lk.green, seg: 5, ...DET, x, z, y });
      b.cyl(0.02 * s, 0.02 * s, 0.08 * s, { color: lk.green, seg: 4, ...DET, x: x + 0.055 * s, z, y: y + 0.08 * s });
      return;
    case 'pine':
      b.cyl(0.014 * s, 0.02 * s, 0.07 * s, { color: lk.trunk, seg: 3, ...DET, x, z, y, capTop: false });
      b.cone(0.1 * s, 0.24 * s, { color: lk.green, mat: fm, ...DET, seg: 6, x, z, y: y + 0.05 * s });
      b.cone(0.06 * s, 0.14 * s, { color: 0xf2f8ff, ...DET, seg: 6, x, z, y: y + 0.18 * s });
      return;
    case 'crystal':
      b.cone(0.04 * s, 0.28 * s, { color: io.p.glow, mat: Mat.Glow, ...DET, seg: 4, x, z, y, flat: true });
      b.cone(0.03 * s, 0.17 * s, { color: mix(io.p.glow, 0xffffff, 0.35), mat: Mat.Glow, ...DET, seg: 4, x: x + 0.05 * s, z: z + 0.02 * s, y, rz: -0.35, flat: true });
      return;
    case 'bulb':
      b.cyl(0.01 * s, 0.018 * s, 0.18 * s, { color: lk.trunk, seg: 3, ...DET, x, z, y, capTop: false, rz: 0.12 });
      b.sphere(0.065 * s, { color: (io.seed + Math.round(z * 17)) % 2 ? io.p.glow : lk.green2, mat: Mat.Glow, ...DET, wSeg: 5, hSeg: 3, x: x - 0.02 * s, z, y: y + 0.22 * s, sy: 1.2 });
      return;
  }
}

/**
 * Roof equipment for a flat roof (w × d at height y): AC & fans, solar arrays, planters, antennas or skylights
 * depending on the look. Optional (budget-checked). n ≈ how many pieces.
 */
export function roofGear(io: IO, x: number, y: number, z: number, w: number, d: number, n = 2): void {
  const { b, lk, p } = io;
  if (io.lo) return;
  const spots: V2[] = [[-0.28, -0.22], [0.26, 0.18], [0.24, -0.26], [-0.22, 0.24]];
  for (let i = 0; i < Math.min(n, spots.length); i++) {
    const sx = x + spots[i][0] * w, sz = z + spots[i][1] * d;
    if (lk.solar && io.sid === 'solarpunk') {
      if (!fits(io, 12)) return;
      b.box(w * 0.36, 0.012, d * 0.3, { color: 0x1a2a4a, mat: Mat.Solar, ...DET, x: sx, y: y + 0.03, z: sz, rx: -0.3 });
    } else if (lk.green01 > 0.5 && i % 2 === 1) {
      if (!fits(io, 10)) return;
      b.box(w * 0.3, 0.035, d * 0.26, { color: lk.green, mat: Mat.Foliage, ...DET, x: sx, y, z: sz, top: lk.green2 });
    } else if (i % 2 === 0) {
      if (!fits(io, 22)) return;
      airHandler(b, sx, y, sz, Math.min(0.16, w * 0.3), Math.min(0.12, d * 0.3), io.sid === 'cyber' ? 0x4a505e : lk.metal);
      fan(b, sx, y + 0.06, sz, 0.035, lk.metal, 4);
    } else {
      if (!fits(io, 18)) return;
      fan(b, sx, y, sz, Math.min(0.06, w * 0.12), io.sid === 'cyber' ? 0x3a3f4e : lk.metal, 6);
    }
  }
  if (io.sid === 'cyber' && fits(io, 14)) antenna(b, x + w * 0.35, y, z - d * 0.3, 0.25, 0xff2fd0, 0x5a5f6e);
  if (io.sid === 'mars' && fits(io, 16)) b.dome(Math.min(w, d) * 0.12, { color: mix(p.glass, 0xffffff, 0.3), mat: Mat.Glass, ...DET, wSeg: 6, hSeg: 2, x: x - w * 0.3, z: z + d * 0.3, y });
}

/** Draw an optional part only when `n` triangles still fit the budget (props, clutter, vehicles). */
export function opt(io: IO, n: number, fn: () => void): void {
  if (fits(io, n)) fn();
}

export { band, FL, G };
