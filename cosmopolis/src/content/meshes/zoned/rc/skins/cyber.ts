/**
 * zoned-rc · Cyberpunk skin — dark stacked containers and megablocks, neon bands in five clashing colours,
 * blade signs, animated screens, holographic ads, antenna forests and AC units clinging to every wall.
 * Looks moody by day; at night it is the brightest thing on the planet.
 */
import type { Rng } from '../../../../../core/rng';
import { FL, G, Mat, acUnit, antenna, bladeSign, glyphs, mix, shade, tree, waterTank, type V2 } from '../common';
import { DET, Skin, fits, type CrownOpts, type FaceOpts, type HouseOpts, type MassOpts, type Pal, type RC, type RoofOpts, type ShopOpts } from '../skin';

const NEON = [0xff2fd0, 0x2ff8ff, 0xfff02f, 0xff4a2f, 0x9a4aff, 0x4aff7a];
const METAL = 0x4a4f5e;

export class CyberSkin extends Skin {
  readonly id = 'cyber' as const;
  readonly ground = 0x3f5258;
  readonly pave = 0x56596a;
  readonly plaza = 0x4a4d5c;
  override readonly asphalt = 0x2c2f38;
  readonly green = 0x2f7a5a;

  override palette(p: Pal, vr: Rng): Pal {
    const a = vr.int(0, NEON.length - 1);
    p.accent = NEON[a];
    p.accent2 = NEON[(a + 1 + vr.int(0, 3)) % NEON.length];
    p.accent3 = NEON[(a + 3) % NEON.length];
    p.trim = vr.pick([0x5a5f6e, 0x14161c, 0x3a3f4e]);
    p.roof = 0x2a2d36;
    // weathered container & concrete colours so the blocks read by day; neon does the rest at night
    p.wall = vr.pick([0x3a5f7a, 0x7a3a4a, 0x4a4f5e, 0x6a5a3a, 0x2f6f6a, 0x5a4a7a, 0x3a3f4e]);
    p.wall2 = vr.pick([0x8a4a2a, 0x2a4a6a, 0x5a5f6e, 0x4a6a3a, 0x6a2a3a]);
    p.glass = 0x2a3a5a;
    p.green2 = 0x3a9a6a;
    p.awning = p.accent;
    return p;
  }

  override outline(): V2[] | null {
    return null;
  }

  protected override drawTree(rc: RC, x: number, z: number, s: number, y: number): void {
    tree(rc.b, x, z, s * 1.1, 'neon', rc.rng.chance(0.5) ? rc.p.accent : rc.p.accent2, 0x2a2e38, y, false);
  }

  protected override drawLamp(rc: RC, x: number, z: number, h: number): void {
    if (rc.lo) return;
    const { b, p } = rc;
    b.box(0.016, h, 0.016, { color: 0x22252e, x, z, y: G, ...DET });
    b.box(0.012, h * 0.7, 0.02, { color: p.accent, mat: Mat.Glow, x: x + 0.012, z, y: G + h * 0.25, ...DET });
  }

  /** Neon edge strip along the top front edge of a box at local height y. */
  private strip(rc: RC, w: number, y: number, z: number, color: number, x = 0): void {
    rc.b.box(w, 0.02, 0.016, { color, mat: Mat.Glow, x, y, z, paint: false });
  }

  override house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const pr = o.prestige ?? 0;
    const c1 = o.color ?? p.wall;
    const ch = FL + 0.04;
    let top = 0;
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      // ground container
      b.box(o.w, ch - G, o.d, { color: c1, mat: Mat.WindowSmall, y: G, top: shade(c1, 0.8) });
      for (const sx of [-0.25, 0.25]) b.box(0.02, ch - G, 0.012, { color: METAL, mat: Mat.Metal, x: sx * o.w, z: o.d / 2 + 0.006, y: G, ...DET });
      this.strip(rc, o.w, ch - 0.01, o.d / 2 + 0.007, p.accent);
      top = ch;
      if (o.floors >= 2) {
        // second container turned 90° and cantilevered
        const shift = (rc.seed % 2 ? 1 : -1) * o.w * 0.1;
        const w2 = Math.min(o.d * 1.1, o.w), d2 = o.w * 0.75;
        b.box(w2, ch, d2, { color: shade(c1, 1.25), mat: Mat.WindowSmall, x: shift, z: -o.d * 0.05, y: top, top: shade(c1, 0.9) });
        this.strip(rc, w2, top + ch - 0.01, -o.d * 0.05 + d2 / 2 + 0.007, p.accent2, shift);
        top += ch;
      }
      if ((o.floors >= 3 || pr > 0.75) && fits(rc, 20)) {
        b.box(o.w * 0.5, ch, o.d * 0.6, { color: shade(c1, 0.9), mat: Mat.WindowSmall, x: -o.w * 0.2, z: o.d * 0.1, y: top });
        this.strip(rc, o.w * 0.5, top + ch - 0.01, o.d * 0.4 + 0.007, p.accent3, -o.w * 0.2);
        top += ch;
      }
      // roof clutter
      if (fits(rc, 10)) acUnit(b, o.w * 0.25, top, -o.d * 0.2);
      if (o.w > 0.35 && fits(rc, 20)) antenna(b, -o.w * 0.3, top, -o.d * 0.25, 0.18 + pr * 0.2, p.accent);
      if (pr > 0.3 && o.w > 0.4 && fits(rc, 18)) b.dome(0.05, { color: 0xb8bcc4, mat: Mat.Metal, wSeg: 6, hSeg: 2, x: o.w * 0.05, z: o.d * 0.2, y: top + 0.02, rx: -0.7, ...DET });
      if (o.door !== false) {
        b.box(0.09, 0.15, 0.015, { color: 0x101218, y: G, z: o.d / 2 + 0.004, paint: false });
        b.box(0.11, 0.012, 0.016, { color: p.accent2, mat: Mat.Glow, y: G + 0.15, z: o.d / 2 + 0.006, paint: false });
      }
      if (pr > 0.4 && o.w > 0.45) b.panel(o.w * 0.4, 0.12, { color: p.accent3, mat: Mat.Holo, x: o.w * 0.15, y: top + 0.04, z: o.d * 0.3, both: true, ...DET });
    });
    return (o.y ?? 0) + top;
  }

  override pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    const { b, p } = rc;
    b.cyl(r, r, 0.06, { color: METAL, mat: Mat.Metal, seg: 10, x, z, y });
    b.cyl(r * 1.02, r * 1.02, 0.014, { color: p.accent, mat: Mat.Glow, seg: 10, x, z, y: y + 0.045, capTop: false, paint: false });
    b.dome(r, { color: glass ? p.glass : p.wall, mat: glass ? Mat.Glass : Mat.Plain, wSeg: 10, hSeg: 3, h, x, z, y: y + 0.06, flat: true });
    b.box(0.03, 0.03, 0.03, { color: 0xff3040, mat: Mat.Light, x, z, y: y + 0.06 + h, ...DET });
    return y + 0.06 + h;
  }

  override block(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const office = o.use === 'office';
    b.box(o.w, o.h, o.d, { color: office ? p.glass : o.color ?? p.wall, mat: office ? Mat.Glass : Mat.Window, x, z, y, top: p.roof });
    // neon bands across the street face
    let k = 0;
    for (let f = 3; f * FL < o.h - 0.1; f += 3, k++) this.strip(rc, o.w, y + f * FL - 0.02, z + o.d / 2 + 0.008, k % 2 ? p.accent2 : p.accent, x);
    this.strip(rc, o.w + 0.01, y + o.h - 0.01, z + o.d / 2 + 0.008, p.accent3, x);
    if (o.h > FL * 2.5) {
      const sx = rc.seed % 2 ? 1 : -1;
      bladeSign(b, x + sx * (o.w / 2 - 0.04), y + FL * 1.2, z + o.d / 2, Math.min(o.h - FL * 1.6, FL * 4), p.accent, rc.seed % 3 === 0 ? Mat.Screen : Mat.Glow, 0.06);
    }
    if (!rc.lo) for (let f = 1; f * FL < o.h - 0.2 && fits(rc, 10); f += 2) acUnit(b, x + ((f * 37) % 7 - 3) * (o.w / 8), y + f * FL + 0.02, z + o.d / 2 + 0.04, 0.7, 0x8a8e98);
  }

  override tower(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const seg = o.seg ?? 0;
    const glassy = o.use === 'office' || seg % 2 === 1;
    this.shell(rc, o, glassy ? Mat.Glass : Mat.Window, glassy ? p.glass : o.color ?? p.wall);
    if (o.round) {
      const r = Math.min(o.w, o.d) / 2;
      for (let f = 6; f * FL < o.h && fits(rc, 24); f += 6) b.cyl(r + 0.012, r + 0.012, 0.016, { color: f % 12 ? p.accent : p.accent2, mat: Mat.Glow, seg: 12, x, z, y: y + f * FL - 0.02, capTop: false, paint: false });
      return;
    }
    // neon corner lines
    for (const sx of [-0.5, 0.5]) b.box(0.016, o.h, 0.016, { color: sx < 0 ? p.accent : p.accent2, mat: Mat.Glow, x: x + sx * o.w, z: z + o.d / 2, y, paint: false });
    // giant screen on the street face
    if (o.h > 1.6 && seg % 2 === 0 && o.w > 0.5 && !o.lite && fits(rc, 12)) {
      const sh = Math.min(o.h * 0.4, 1.4), sw = o.w * 0.62;
      b.box(sw + 0.04, sh + 0.04, 0.03, { color: 0x15171c, mat: Mat.Metal, x, z: z + o.d / 2 + 0.005, y: y + o.h * 0.35 - 0.02, paint: false });
      b.panel(sw, sh, { color: 0xffffff, mat: Mat.Screen, x, z: z + o.d / 2 + 0.022, y: y + o.h * 0.35, paint: false });
    }
    for (let f = 8; f * FL < o.h - 0.2 && fits(rc, 10); f += 8) this.strip(rc, o.w, y + f * FL, z + o.d / 2 + 0.008, p.accent3, x);
  }

  override roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y;
    b.box(o.w * 0.4, 0.12, o.d * 0.35, { color: METAL, x: x - o.w * 0.2, z: z - o.d * 0.2, y, top: 0x2a2e38 });
    if (o.kind === 'garden' || o.kind === 'deck') {
      b.box(o.w * 0.5, 0.02, o.d * 0.4, { color: 0x2a6a5a, x: x + o.w * 0.15, z: z + o.d * 0.15, y, paint: false });
      this.tree(rc, x + o.w * 0.2, z + o.d * 0.15, 0.8, y + 0.02);
    } else if (fits(rc, 34)) waterTank(b, x + o.w * 0.22, y, z - o.d * 0.12, 0.9, 0x5a5f6e);
    if (fits(rc, 20)) antenna(b, x - o.w * 0.3, y + 0.12, z - o.d * 0.25, 0.25 + (o.prestige ?? 0) * 0.3, p.accent);
    if (o.w > 0.5 && !rc.lo && fits(rc, 14)) {
      b.box(0.02, 0.1, 0.02, { color: METAL, x: x + o.w * 0.1, z: z + o.d * 0.35, y, ...DET });
      b.panel(o.w * 0.45, 0.16, { color: p.accent2, mat: Mat.Holo, x: x + o.w * 0.1, z: z + o.d * 0.35, y: y + 0.1, both: true, ...DET });
    }
    if (o.kind === 'pitched' && fits(rc, 10)) acUnit(b, x + o.w * 0.2, y, z + o.d * 0.15, 1.2);
  }

  override crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    const pr = o.prestige;
    const tall = o.tall ?? 1;
    const kind = (o.kind ?? rc.seed) % 3;
    b.box(o.w * 0.8, 0.18, o.d * 0.8, { color: 0x22252e, x, z, y: o.y });
    this.strip(rc, o.w * 0.8, o.y + 0.17, z + o.d * 0.4 + 0.007, p.accent, x);
    const y = o.y + 0.18;
    if (kind === 0) {
      // antenna forest with red beacons
      const hs = [0.9, 0.55, 0.4].map((h) => h * (0.6 + pr) * tall);
      antenna(b, x, y, z, hs[0], 0xff2030, 0x6a6f7a);
      antenna(b, x + o.w * 0.25, y, z - o.d * 0.2, hs[1], 0xff2030, 0x6a6f7a);
      antenna(b, x - o.w * 0.25, y, z + o.d * 0.15, hs[2], p.accent, 0x6a6f7a);
      if (fits(rc, 18)) b.dome(0.08, { color: 0xb8bcc4, mat: Mat.Metal, wSeg: 6, hSeg: 2, x: x - o.w * 0.2, z: z - o.d * 0.2, y: y + 0.02, rx: -0.6, ...DET });
      return y + hs[0];
    }
    if (kind === 1) {
      // holographic sphere on a mast
      const mh = (0.4 + pr * 0.6) * tall;
      b.cyl(0.02, 0.04, mh, { color: METAL, mat: Mat.Metal, seg: 4, x, z, y, capTop: false });
      const r = Math.min(o.w, o.d) * 0.32;
      b.sphere(r, { color: p.accent2, mat: Mat.Holo, wSeg: 8, hSeg: 5, x, z, y: y + mh + r });
      b.cyl(r * 1.35, r * 1.35, 0.025, { color: p.accent, mat: Mat.Glow, seg: 12, x, z, y: y + mh + r, rx: 0.3, capTop: false, paint: false });
      return y + mh + r * 2;
    }
    // rooftop mega-screen
    const sw = o.w * 0.9, sh = (0.35 + pr * 0.35) * tall;
    b.box(0.03, 0.12, 0.03, { color: METAL, x: x - sw * 0.35, z, y, ...DET });
    b.box(0.03, 0.12, 0.03, { color: METAL, x: x + sw * 0.35, z, y, ...DET });
    b.box(sw + 0.04, sh + 0.04, 0.04, { color: 0x15171c, mat: Mat.Metal, x, z, y: y + 0.1, paint: false });
    b.panel(sw, sh, { color: 0xffffff, mat: Mat.Screen, x, z: z + 0.022, y: y + 0.12, paint: false });
    b.panel(sw, sh, { color: 0xffffff, mat: Mat.Screen, x, z: z - 0.022, y: y + 0.12, ry: Math.PI, paint: false });
    antenna(b, x + sw * 0.4, y + 0.14 + sh, z, 0.25, 0xff2030);
    return y + 0.14 + sh + 0.25;
  }

  override balconies(rc: RC, o: FaceOpts): void {
    const { b, p } = rc;
    const every = o.every ?? 1;
    const dep = o.depth ?? 0.07;
    const cols = o.cols ?? 0;
    let k = 0;
    for (let f = Math.max(1, Math.ceil(o.y0 / FL)); f * FL <= o.y1; f += Math.max(every, cols > 0 ? 1 : 2), k++) {
      const y = f * FL;
      if (cols > 0) {
        if (!fits(rc, cols * 10)) return;
        const cw = o.w / cols;
        for (let c = 0; c < cols; c++) b.box(cw * 0.6, 0.07, dep, { color: 0x3a3f4a, mat: Mat.Metal, x: -o.w / 2 + cw * (c + 0.5), z: dep / 2, y, ...DET });
      } else {
        if (!fits(rc, 20)) return;
        b.box(o.w, 0.04, dep, { color: 0x3a3f4a, mat: Mat.Metal, z: dep / 2, y, ...DET });
        if (k % 2 === 0) b.box(o.w, 0.008, 0.008, { color: k % 4 ? p.accent2 : p.accent, mat: Mat.Glow, z: dep, y: y - 0.004, ...DET });
      }
    }
  }

  override shopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    b.box(o.w - 0.04, o.h * 0.5, 0.03, { color: 0x3a4a6a, mat: Mat.Glass, y: G, z: 0.012, paint: false });
    // half-open roller shutter
    b.box(o.w - 0.04, o.h * 0.28, 0.035, { color: 0x6a6f7a, mat: Mat.Metal, y: G + o.h * 0.5, z: 0.014, paint: false });
    b.box(o.w + 0.02, 0.03, 0.12, { color: 0x22252e, y: o.h * 0.8, z: 0.06 });
    this.strip(rc, o.w + 0.02, o.h * 0.8 - 0.01, 0.12, p.accent);
    if (o.glyphs) {
      b.box(Math.min(o.w * 0.7, 0.62) + 0.03, 0.09, 0.02, { color: 0x101218, y: o.h * 0.83, z: 0.03, paint: false });
      glyphs(b, Math.min(o.w * 0.7, 0.62), 0.065, o.glyphs, rc.seed, { color: o.color ?? p.accent2, mat: Mat.Glow, y: o.h * 0.83 + 0.012, z: 0.042, paint: false });
    }
    bladeSign(b, o.w / 2 - 0.03, o.h * 0.9, 0, FL * 1.4, p.accent3, rc.seed % 2 ? Mat.Glow : Mat.Screen, 0.05);
    if (!rc.lo && o.w > 0.5) b.panel(0.12, 0.08, { color: 0xffffff, mat: Mat.Screen, x: -o.w / 2 + 0.1, y: G + 0.05, z: 0.032, ...DET });
  }

  override portico(rc: RC, w: number, h: number): void {
    const { b, p } = rc;
    b.box(w + 0.06, 0.03, 0.22, { color: 0x22252e, y: h, z: 0.11 });
    this.strip(rc, w + 0.06, h - 0.012, 0.22, p.accent);
    b.panel(0.08, h * 0.7, { color: 0xffffff, mat: Mat.Screen, x: -w / 2 - 0.02, y: G + 0.02, z: 0.02, ...DET });
  }

  override bridge(rc: RC, x0: number, z0: number, x1: number, z1: number, y: number, h = FL * 2, w = 0.16): void {
    const { b, p } = rc;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    b.box(w, h, len, { color: 0x2a3a5a, mat: Mat.Glass, x: mx, z: mz, y, ry, top: 0x22252e });
    b.group({ x: mx, z: mz, ry }, () => {
      b.box(0.012, 0.012, len, { color: p.accent, mat: Mat.Glow, x: w / 2, y, paint: false });
      b.box(0.012, 0.012, len, { color: p.accent2, mat: Mat.Glow, x: -w / 2, y: y + h, paint: false });
    });
  }

  override terrace(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w, 0.025, d, { color: 0x30333c, x, z, y });
    this.strip(rc, w, y + 0.02, z + d / 2, p.accent2, x);
    if (!rc.lo && fits(rc, 10)) acUnit(b, x - w * 0.25, y + 0.025, z);
  }

  override roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    this.roof(rc, { x, z, y, w, d, kind: 'garden' });
  }

  override sign(rc: RC, o: Parameters<Skin['sign']>[1], x: number, y: number, z: number): void {
    if (o.kind === 'board') {
      const { b, p } = rc;
      b.box(o.w + 0.03, o.h + 0.03, 0.02, { color: 0x101218, x, y: y - 0.015, z, paint: false });
      glyphs(b, o.w, o.h * 0.8, o.n ?? 4, rc.seed, { color: o.color ?? p.accent, mat: Mat.Glow, x, y: y + o.h * 0.1, z: z + 0.012, paint: false });
      b.box(o.w + 0.05, 0.008, 0.008, { color: mix(p.accent2, 0xffffff, 0.2), mat: Mat.Glow, x, y: y - 0.02, z: z + 0.012, paint: false });
      return;
    }
    super.sign(rc, o, x, y, z);
  }
}

export const CYBER_NEON = NEON;
