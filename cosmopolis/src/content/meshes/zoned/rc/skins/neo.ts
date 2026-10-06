/**
 * zoned-rc · Neo-Futurist skin — gleaming white curves, cantilevered slabs, glass tubes, sky-bridges and cyan
 * light lines. Everything is rounded; nothing has a corner you could stub a toe on.
 */
import type { Rng } from '../../../../../core/rng';
import { FL, G, Mat, antenna, chamferRect, ellipse, glyphs, mix, roundRect, type V2 } from '../common';
import { DET, Skin, fits, type CrownOpts, type FaceOpts, type HouseOpts, type MassOpts, type Pal, type RC, type RoofOpts, type ShopOpts, type SignOpts } from '../skin';

const WHITE = 0xf4f7fb;
const CYAN = 0x3fe0ff;

export class NeoSkin extends Skin {
  readonly id = 'neo' as const;
  readonly ground = 0x8fd07a;
  readonly pave = 0xe9edf3;
  readonly plaza = 0xdde4ee;
  readonly green = 0x58c26a;
  override readonly trunk = 0xe8edf3;
  protected override readonly treeCost = 50;

  override palette(p: Pal, vr: Rng): Pal {
    p.trim = WHITE;
    p.trim2 = vr.pick([0x9fb0c8, 0x6f84a0, 0xc8d2e0]);
    p.green2 = 0x7ad88a;
    p.accent = vr.pick([CYAN, CYAN, 0x7a9cff, 0x9fffe0]);
    p.roof = 0xe2e8f0;
    p.glass = vr.pick([0x7ab8e0, 0x8ac8f0, 0x6aa0e0]);
    p.awning = WHITE;
    return p;
  }

  override outline(_rc: RC, w: number, d: number): V2[] | null {
    return roundRect(w, d, Math.min(w, d) * 0.3, 2);
  }

  override roundOutline(w: number, d: number): V2[] {
    return ellipse(w, d, 12);
  }

  protected override drawTree(rc: RC, x: number, z: number, s: number, y: number): void {
    const { b, p } = rc;
    if (rc.lo) return;
    b.cyl(0.07 * s, 0.06 * s, 0.06 * s, { color: WHITE, seg: 6, x, z, y, ...DET });
    b.sphere(0.11 * s, { color: rc.rng.chance(0.5) ? p.green : p.green2, mat: y < 1.2 ? Mat.Foliage : Mat.Plain, wSeg: 6, hSeg: 3, x, z, y: y + 0.17 * s, ...DET });
  }

  protected override drawLamp(rc: RC, x: number, z: number, h: number): void {
    const { b } = rc;
    if (rc.lo) return;
    b.cyl(0.008, 0.012, h, { color: WHITE, seg: 3, x, z, y: G, capTop: false, ...DET });
    b.box(0.07, 0.012, 0.02, { color: CYAN, mat: Mat.Glow, x: x + 0.025, z, y: G + h, ...DET });
  }

  override house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const pr = o.prestige ?? 0;
    const two = o.floors >= 2;
    const h1 = FL + 0.03;
    const r = Math.min(o.w, o.d) * 0.28;
    let top = 0;
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      // glazed ground floor, inset
      b.extrude(roundRect(o.w * 0.9, o.d * 0.86, r, 1), h1 - G, { color: 0xeef6ff, mat: Mat.Glass, y: G, top: WHITE });
      top = h1;
      let shift = 0;
      if (two) {
        // cantilevered white upper volume
        shift = (rc.seed % 2 ? 1 : -1) * o.w * 0.08;
        b.extrude(roundRect(o.w, o.d * 0.92, r, 1), FL + 0.02, { color: o.color ?? WHITE, mat: Mat.Window, x: shift, y: h1, top: WHITE });
        top = h1 + FL + 0.02;
      }
      // floating roof slab with a cyan light line under its front edge
      b.extrude(roundRect(o.w + 0.08, o.d + 0.06, r + 0.04, 1), 0.035, { color: WHITE, x: shift, y: top });
      b.box(o.w * 0.8, 0.01, 0.012, { color: p.accent, mat: Mat.Glow, x: shift, y: top - 0.01, z: o.d / 2 + 0.01, paint: false });
      top += 0.035;
      if (pr > 0.5 && fits(rc, 30)) {
        b.dome(Math.min(o.w, o.d) * 0.18, { color: p.glass, mat: Mat.Glass, wSeg: 6, hSeg: 2, x: shift - o.w * 0.18, y: top, ...DET });
        b.box(o.w * 0.4, 0.04, 0.01, { color: 0xcfeaff, mat: Mat.Glass, x: shift + o.w * 0.12, z: o.d / 2, y: top, ...DET });
      }
    });
    return (o.y ?? 0) + top;
  }

  override pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    const { b, p } = rc;
    b.cyl(r * 1.04, r * 1.04, 0.04, { color: WHITE, seg: 10, x, z, y, capTop: false });
    b.cyl(r * 1.05, r * 1.05, 0.012, { color: p.accent, mat: Mat.Glow, seg: 10, x, z, y: y + 0.028, capTop: false, paint: false });
    b.dome(r, { color: glass ? 0xe8f4ff : WHITE, mat: glass ? Mat.Glass : Mat.Plain, wSeg: 8, hSeg: 3, h, x, z, y: y + 0.04 });
    if (!glass) b.box(r * 0.5, 0.1, 0.02, { color: 0xcfeaff, mat: Mat.Glass, x, z: z + r * 0.92, y: y + 0.05, ...DET });
    return y + 0.04 + h;
  }

  override block(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const office = o.use === 'office';
    this.shell(rc, o, office ? Mat.Glass : Mat.Window, office ? p.glass : o.color ?? p.wall);
    // full-height glazed slot on the street face + cyan cap line
    if (o.h > FL * 2.5 && !office && fits(rc, 10)) b.box(Math.min(0.22, o.w * 0.25), o.h - 0.04, 0.03, { color: 0xe6f4ff, mat: Mat.Glass, x: x + o.w * 0.18, z: z + o.d / 2 - 0.005, y, ...DET });
    b.box(o.w * 0.7, 0.012, 0.014, { color: p.accent, mat: Mat.Glow, x, z: z + o.d / 2 + 0.002, y: y + o.h - 0.05, paint: false });
  }

  override tower(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const m = Math.min(o.w, o.d);
    const poly = o.round ? this.roundOutline(o.w, o.d) : roundRect(o.w, o.d, m * 0.42, o.lite ? 1 : 2);
    const glassy = o.use === 'office' || (o.seg ?? 0) % 2 === 1 || rc.seed % 3 === 0;
    b.extrude(poly, o.h, { color: glassy ? mix(p.glass, 0xffffff, 0.15) : o.color ?? WHITE, mat: glassy ? Mat.Glass : Mat.Window, x, z, y, top: WHITE });
    // cyan crown line, white floor rings, white spine
    b.box(o.w * 0.6, 0.012, 0.014, { color: p.accent, mat: Mat.Glow, x, z: z + o.d / 2 + 0.002, y: y + o.h - 0.04, paint: false });
    if (o.lite) return;
    const ring = o.round ? null : chamferRect(o.w + 0.06, o.d + 0.06, m * 0.36);
    const n = Math.min(3, Math.floor(o.h / (FL * 7)));
    for (let i = 1; i <= n; i++) {
      if (!fits(rc, 24)) break;
      const yy = y + (o.h * i) / (n + 1);
      if (ring) b.extrude(ring, 0.03, { color: WHITE, x, z, y: yy, ...DET, paint: true });
      else b.cyl(m / 2 + 0.03, m / 2 + 0.03, 0.03, { color: WHITE, seg: 12, x, z, y: yy, capTop: false, ...DET, paint: true });
    }
    if (!o.round && o.h > 1.5 && fits(rc, 10)) b.box(0.08, o.h, o.d * 0.5, { color: WHITE, mat: Mat.Window, x: x + (rc.seed % 2 ? 1 : -1) * (o.w / 2), z, y, ...DET, paint: true });
  }

  override roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y;
    const m = Math.min(o.w, o.d);
    if (o.kind === 'pitched') {
      // gentle white barrel roof
      b.dome(m * 0.5, { color: WHITE, wSeg: 8, hSeg: 2, h: m * 0.22, x, z, y, sx: o.w / m, sz: o.d / m });
      return;
    }
    b.extrude(roundRect(o.w * 0.94, o.d * 0.94, m * 0.28, 1), 0.03, { color: WHITE, x, z, y });
    if (o.kind === 'garden' || o.kind === 'deck') {
      b.box(o.w * 0.7, 0.012, o.d * 0.7, { color: p.green, x, z, y: y + 0.03, paint: false });
      this.tree(rc, x - o.w * 0.24, z - o.d * 0.18, 0.8, y + 0.03);
      if (o.w > 0.6 && fits(rc, 18)) b.cyl(o.w * 0.14, o.w * 0.14, 0.03, { color: 0x3a9ad0, mat: Mat.Water, seg: 8, x: x + o.w * 0.16, z: z + o.d * 0.1, y: y + 0.03, ...DET });
      return;
    }
    if (fits(rc, 30)) {
      b.dome(m * 0.18, { color: p.glass, mat: Mat.Glass, wSeg: 6, hSeg: 2, x: x - o.w * 0.15, z, y: y + 0.03, ...DET });
      b.box(o.w * 0.25, 0.1, o.d * 0.25, { color: WHITE, x: x + o.w * 0.2, z: z - o.d * 0.15, y: y + 0.03, ...DET });
    }
  }

  override crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    const pr = o.prestige;
    const r = Math.min(o.w, o.d) * 0.5;
    const kind = (o.kind ?? rc.seed) % 3;
    const tall = o.tall ?? 1;
    if (kind === 0) {
      // tapered white cap, needle and a floating halo
      const ch = 0.35 + pr * 0.35;
      b.cyl(r * 0.35, r * 0.95, ch, { color: WHITE, seg: 10, x, z, y: o.y });
      const nh = (0.6 + pr * 1.6) * tall;
      b.cyl(0.006, 0.03, nh, { color: WHITE, mat: Mat.Metal, seg: 4, x, z, y: o.y + ch, capTop: false });
      if (pr > 0.3) b.cyl(r * 0.75, r * 0.75, 0.03, { color: p.accent, mat: Mat.Glow, seg: 12, x, z, y: o.y + ch + nh * 0.25, capTop: false, paint: false });
      b.box(0.03, 0.03, 0.03, { color: 0xff3040, mat: Mat.Light, x, z, y: o.y + ch + nh, ...DET });
      return o.y + ch + nh;
    }
    if (kind === 1) {
      // observatory dome on a white drum
      b.cyl(r * 0.8, r * 0.85, 0.12, { color: WHITE, seg: 10, x, z, y: o.y, capTop: false });
      b.cyl(r * 0.86, r * 0.86, 0.015, { color: p.accent, mat: Mat.Glow, seg: 10, x, z, y: o.y + 0.1, capTop: false, paint: false });
      b.dome(r * 0.8, { color: mix(p.glass, 0xffffff, 0.2), mat: Mat.Glass, wSeg: 8, hSeg: 3, x, z, y: o.y + 0.12 });
      const nh = (0.3 + pr * 0.8) * tall;
      antenna(b, x, o.y + 0.12 + r * 0.8, z, nh);
      return o.y + 0.12 + r * 0.8 + nh;
    }
    // tilted white blade with a light edge
    const bh = (0.7 + pr * 1.3) * tall;
    b.box(o.w * 0.7, bh, 0.06, { color: WHITE, x, z, y: o.y, rx: -0.12 });
    b.box(0.015, bh * 0.96, 0.02, { color: p.accent, mat: Mat.Glow, x: x + o.w * 0.35, z: z + 0.03, y: o.y, rx: -0.12, paint: false });
    return o.y + bh;
  }

  override balconies(rc: RC, o: FaceOpts): void {
    const { b } = rc;
    const every = o.every ?? 1;
    const dep = o.depth ?? 0.07;
    const cols = o.cols ?? 0;
    for (let f = Math.max(1, Math.ceil(o.y0 / FL)); f * FL <= o.y1; f += Math.max(every, cols > 0 ? 1 : 2)) {
      const y = f * FL;
      if (cols > 0) {
        if (!fits(rc, cols * 14)) return;
        const cw = o.w / cols;
        for (let c = 0; c < cols; c++)
          b.cyl(dep, dep, 0.05, { color: WHITE, seg: 4, arc: Math.PI, ry: -Math.PI / 2, sz: (cw * 0.4) / dep, x: -o.w / 2 + cw * (c + 0.5), y, ...DET, paint: true });
      } else {
        if (!fits(rc, 20)) return;
        b.box(o.w, 0.03, dep, { color: WHITE, z: dep / 2, y, ...DET, paint: true });
        b.box(o.w, 0.04, 0.008, { color: 0xd8f0ff, mat: Mat.Glass, z: dep, y: y + 0.03, ...DET });
      }
    }
  }

  protected override drawShopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    b.box(o.w - 0.04, o.h * 0.78, 0.03, { color: 0xeef6ff, mat: Mat.Glass, y: G, z: 0.012, paint: false });
    // swooping white canopy
    b.extrude(roundRect(o.w + 0.06, 0.24, 0.1, 1), 0.025, { color: WHITE, y: o.h * 0.8, z: 0.1 });
    b.box(o.w * 0.92, 0.008, 0.01, { color: p.accent, mat: Mat.Glow, y: o.h * 0.8 - 0.008, z: 0.215, ...DET });
    if (o.glyphs) glyphs(b, Math.min(o.w * 0.6, 0.55), 0.06, o.glyphs, rc.seed, { color: o.color ?? p.accent, mat: Mat.Glow, y: o.h * 0.8 + 0.03, z: 0.12, paint: false });
  }

  protected override drawPortico(rc: RC, w: number, h: number): void {
    const { b, p } = rc;
    b.box(w + 0.1, 0.025, 0.26, { color: WHITE, y: h, z: 0.12 });
    b.box(0.02, h - G, 0.02, { color: WHITE, x: 0, z: 0.22, y: G, ...DET });
    b.box(w * 0.85, 0.008, 0.01, { color: p.accent, mat: Mat.Glow, y: h - 0.008, z: 0.25, paint: false });
  }

  override bridge(rc: RC, x0: number, z0: number, x1: number, z1: number, y: number, h = FL * 2): void {
    const { b, p } = rc;
    const r = Math.min(0.1, h * 0.45);
    b.tube([[x0, y + r, z0], [x1, y + r, z1]], r, { color: 0xe8f6ff, mat: Mat.Glass, seg: 6, paint: false });
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const ry = Math.atan2(x1 - x0, z1 - z0);
    b.box(0.012, 0.012, Math.hypot(x1 - x0, z1 - z0), { color: p.accent, mat: Mat.Glow, x: mx, z: mz, y: y - 0.01, ry, paint: false });
  }

  override terrace(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w, 0.025, d, { color: WHITE, x, z, y });
    if (fits(rc, 10)) b.box(w * 0.85, 0.035, 0.05, { color: p.green, x, z: z + d / 2 - 0.04, y: y + 0.025, ...DET });
  }

  override roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    this.roof(rc, { x, z, y, w, d, kind: 'garden' });
  }

  override sign(rc: RC, o: SignOpts, x: number, y: number, z: number): void {
    if (o.kind === 'board') {
      const { b, p } = rc;
      b.box(o.w + 0.04, o.h + 0.03, 0.03, { color: WHITE, x, y: y - 0.015, z: z + 0.01 });
      glyphs(b, o.w, o.h * 0.75, o.n ?? 4, rc.seed, { color: o.color ?? p.accent, mat: Mat.Glow, x, y: y + o.h * 0.1, z: z + 0.027, paint: false });
      return;
    }
    super.sign(rc, o, x, y, z);
  }
}
