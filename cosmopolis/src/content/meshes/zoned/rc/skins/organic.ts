/**
 * zoned-rc · Bio-Organic skin — grown, not built: egg-shaped pods under mushroom-shell caps, ribbed membranes,
 * bulging lathe towers wrapped in bioluminescent tendrils, blossom crowns and glowing bulb gardens.
 */
import type { Rng } from '../../../../../core/rng';
import { FL, G, Mat, ellipse, glyphs, mix, ngon, polyTop, shade, tree, type V2 } from '../common';
import { DET, Skin, fits, type CrownOpts, type FaceOpts, type HouseOpts, type MassOpts, type Pal, type RC, type RoofOpts, type ShopOpts, type SignOpts } from '../skin';

const BIO = [0x7affd0, 0xff7ad0, 0xd0ff7a, 0x7ad0ff];
const BONE = 0xf0e0d0;
const DOOR = 0x2a1e26;

type P2 = [number, number];

/** Egg profile (3 segments): wide belly low, tapering crown. */
function podProfile(r: number, h: number): P2[] {
  return [[r * 0.82, 0], [r, h * 0.36], [r * 0.72, h * 0.82], [0.001, h]];
}

export class OrganicSkin extends Skin {
  readonly id = 'organic' as const;
  readonly ground = 0x93ad66;
  readonly pave = 0xdac6b4;
  readonly plaza = 0xcdb8a6;
  readonly green = 0x6a9a5a;
  override readonly trunk = 0x6a4a5a;
  protected override readonly treeCost = 30;

  override palette(p: Pal, vr: Rng): Pal {
    p.accent = vr.pick(BIO);
    p.accent2 = vr.pick(BIO);
    p.trim = vr.pick([BONE, 0x5a3a4a, 0xe6d0c0]);
    p.roof = vr.pick([0x8a5a7a, 0x6a8a5a, 0xa06a8a, 0x7a6a9a]);
    p.green2 = 0x8aba6a;
    p.glass = mix(p.roof, 0xffffff, 0.35);
    p.awning = p.roof;
    return p;
  }

  protected override drawFence(rc: RC, x: number, z: number, w: number): void {
    const { b, p } = rc;
    b.box(w, 0.05, 0.04, { color: 0x7aa060, x, z, y: G, top: 0x8ab070, ...DET });
    b.sphere(0.022, { color: p.accent2, mat: Mat.Glow, wSeg: 4, hSeg: 2, x: x + w * 0.3, z, y: G + 0.06, ...DET });
  }

  override outline(_rc: RC, w: number, d: number): V2[] | null {
    return ellipse(w, d, 10);
  }

  override roundOutline(w: number, d: number): V2[] {
    return ellipse(w, d, 10);
  }

  protected override drawTree(rc: RC, x: number, z: number, s: number, y: number): void {
    tree(rc.b, x, z, s * 1.15, 'bulb', rc.rng.chance(0.5) ? rc.p.accent : rc.p.accent2, rc.p.trunk, y, false);
  }

  protected override drawShrub(rc: RC, x: number, z: number, s: number, y: number): void {
    if (rc.lo) return;
    rc.b.sphere(0.06 * s, { color: rc.p.accent2, mat: Mat.Glow, wSeg: 5, hSeg: 2, x, z, y: y + 0.03 * s, sy: 0.7, ...DET });
  }

  protected override drawLamp(rc: RC, x: number, z: number, h: number): void {
    if (rc.lo) return;
    const { b, p } = rc;
    b.cyl(0.006, 0.014, h, { color: p.trunk, seg: 3, x, z, y: G, rz: 0.12, capTop: false, ...DET });
    b.sphere(0.03, { color: p.accent, mat: Mat.Glow, wSeg: 4, hSeg: 2, x: x - h * 0.12, z, y: G + h, ...DET });
  }

  /** A glowing tendril curling up a surface (≈ 30 triangles, optional). */
  private tendril(rc: RC, x0: number, z0: number, r: number, h: number, a0: number, color: number, y = G): void {
    const { b } = rc;
    if (rc.lo || !fits(rc, 32)) return;
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const a = a0 + t * 1.4;
      const rr = r * (1.04 - t * 0.35);
      pts.push([x0 + Math.sin(a) * rr, y + t * h, z0 + Math.cos(a) * rr]);
    }
    b.tube(pts, 0.014, { color, mat: Mat.Glow, seg: 3, ...DET });
    const e = pts[3];
    b.sphere(0.028, { color, mat: Mat.Glow, wSeg: 4, hSeg: 2, x: e[0], y: e[1], z: e[2], ...DET });
  }

  /** Egg pod with mushroom-shell cap and a membrane window band per storey; returns its top. */
  private eggPod(rc: RC, x: number, z: number, r: number, h: number, y: number, wall: number, cap = true, floors = 1): number {
    const { b, p } = rc;
    const prof = podProfile(r, h);
    b.lathe(prof, { color: wall, seg: 7, x, z, y });
    // window bands hug the shell (cylinders sized to the profile at their height)
    const radiusAt = (yy: number): number => {
      for (let i = 1; i < prof.length; i++) {
        if (yy <= prof[i][1]) {
          const t = (yy - prof[i - 1][1]) / Math.max(1e-6, prof[i][1] - prof[i - 1][1]);
          return prof[i - 1][0] + (prof[i][0] - prof[i - 1][0]) * t;
        }
      }
      return prof[prof.length - 1][0];
    };
    for (let f = 0; f < floors; f++) {
      const y0 = f * FL + 0.07;
      if (y0 + 0.1 > h * 0.64) break;
      const r0 = radiusAt(y0) + 0.008, r1 = radiusAt(y0 + 0.1) + 0.008;
      b.cyl(r1, r0, 0.1, { color: mix(wall, 0xffffff, 0.15), mat: Mat.WindowSmall, seg: 7, x, z, y: y + y0, capTop: false });
    }
    if (!cap) return y + h;
    b.lathe([[r * 1.1, h * 0.58], [r * 0.6, h * 0.92], [0.001, h * 1.06]], { color: p.roof, seg: 7, x, z, y });
    return y + h * 1.06;
  }

  override house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const pr = o.prestige ?? 0;
    const r = Math.min(o.w, o.d) / 2;
    const h = o.floors * FL + r * 0.75;
    const stretch = Math.min(1.5, Math.max(1, o.w / o.d));
    let top = 0;
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      b.group({ sx: stretch }, () => {
        top = this.eggPod(rc, 0, 0, r, h, G, o.color ?? p.wall, true, o.floors);
      });
      if (o.door !== false) {
        b.sphere(0.07, { color: DOOR, wSeg: 6, hSeg: 2, z: r * 0.84, y: G + 0.06, sy: 1.6, sz: 0.45 });
        b.sphere(0.022, { color: p.accent, mat: Mat.Glow, wSeg: 4, hSeg: 2, z: r * 0.92, y: G + 0.2, ...DET });
      }
      this.tendril(rc, 0, 0, r * stretch * 0.95, h * 0.95, 1.9, p.accent);
      if ((o.floors >= 2 || pr > 0.45) && o.w > 0.35 && fits(rc, 82)) {
        const r2 = r * 0.55;
        this.eggPod(rc, r * stretch * 0.95, -r * 0.3, r2, r2 * 2.1, G, shade(o.color ?? p.wall, 1.06));
      }
      if (pr > 0.7 && o.w > 0.45) this.tendril(rc, 0, 0, r * stretch * 0.95, h * 0.8, -1.2, p.accent2);
    });
    return (o.y ?? 0) + top;
  }

  override pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    const { b, p } = rc;
    if (glass) {
      b.lathe(podProfile(r, h * 1.1), { color: p.glass, mat: Mat.Glass, seg: 8, x, z, y });
      return y + h * 1.1;
    }
    const t = this.eggPod(rc, x, z, r, h * 1.15, y, p.wall);
    b.sphere(0.05, { color: DOOR, wSeg: 5, hSeg: 2, x, z: z + r * 0.85, y: y + 0.05, sy: 1.5, sz: 0.45, ...DET });
    return t;
  }

  override block(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const office = o.use === 'office';
    this.shell(rc, o, office ? Mat.Glass : Mat.Window, office ? p.glass : o.color ?? p.wall);
    // bone ribs on the street face, a glowing lip on top
    b.box(o.w * 0.6, 0.014, 0.014, { color: p.accent, mat: Mat.Glow, x, z: z + o.d / 2 + 0.004, y: y + o.h - 0.04, paint: false });
    const n = Math.max(2, Math.round(o.w / 0.3));
    if (!rc.lo && fits(rc, n * 10)) {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const zz = z + (o.d / 2) * Math.sqrt(Math.max(0, 1 - (2 * t) ** 2)) + 0.005;
        b.box(0.03, o.h, 0.025, { color: p.trim, x: x + t * o.w, z: zz, y, rz: t * 0.12, ...DET, paint: true });
      }
    }
  }

  override tower(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const r = o.w / 2;
    const seg = o.seg ?? 0;
    const bulge = seg % 2 ? 1.07 : 1.1;
    const prof: P2[] = [[r, 0], [r * bulge, o.h * 0.3], [r * 0.94, o.h * 0.72], [r * 0.86, o.h]];
    const glassy = o.use === 'office';
    const sg = o.lite ? 6 : 9;
    b.group({ x, z, y, sz: o.d / o.w }, () => {
      b.lathe(prof, { color: glassy ? p.glass : o.color ?? p.wall, mat: glassy ? Mat.Glass : Mat.Window, seg: sg });
      polyTop(b, ngon(sg, r * 0.86), { color: p.roof, y: o.h });
    });
    // spiral tendril of light
    if (!rc.lo && !o.lite && fits(rc, 44)) {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 5; i++) {
        const f = i / 5;
        const a = f * 1.2 * Math.PI * 2 + seg;
        const rr = r * 1.08 * (1 - f * 0.12);
        pts.push([x + Math.sin(a) * rr, y + f * o.h * 0.96, z + Math.cos(a) * rr * (o.d / o.w)]);
      }
      b.tube(pts, 0.016, { color: seg % 2 ? p.accent2 : p.accent, mat: Mat.Glow, seg: 3, ...DET });
    }
  }

  override roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y;
    const m = Math.min(o.w, o.d);
    if (o.kind === 'garden' || o.kind === 'deck') {
      polyTop(b, ellipse(o.w * 0.9, o.d * 0.9, 8), { color: 0x6a9a5a, x, z, y: y + 0.01, paint: false });
      this.tree(rc, x - o.w * 0.2, z, 0.9, y + 0.01);
      this.shrub(rc, x + o.w * 0.25, z + o.d * 0.1, 1.2, y + 0.01);
      return;
    }
    b.dome(m * 0.5, { color: p.roof, wSeg: 8, hSeg: 2, h: m * (o.kind === 'pitched' ? 0.42 : 0.26), x, z, y, sx: (o.w / m) * 1.02, sz: (o.d / m) * 1.02 });
    if (!rc.lo && fits(rc, 16)) {
      b.sphere(0.035, { color: p.accent, mat: Mat.Glow, wSeg: 4, hSeg: 2, x: x + o.w * 0.2, z: z + o.d * 0.1, y: y + m * 0.2, ...DET });
      b.sphere(0.025, { color: p.accent2, mat: Mat.Glow, wSeg: 4, hSeg: 2, x: x - o.w * 0.15, z: z - o.d * 0.2, y: y + m * 0.18, ...DET });
    }
  }

  override crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    const pr = o.prestige;
    const tall = o.tall ?? 1;
    const r = Math.min(o.w, o.d) / 2;
    const kind = (o.kind ?? rc.seed) % 3;
    if (kind === 0) {
      // bulb with antennae
      const br = r * 0.75;
      b.sphere(br, { color: p.roof, wSeg: 7, hSeg: 3, x, z, y: o.y + br * 0.8, sy: 1.1 });
      const top = o.y + br * 1.9;
      const ah = (0.35 + pr * 0.7) * tall;
      for (let i = 0; i < 2; i++) {
        const a = i * Math.PI + 0.6;
        const hh = ah * (1 - i * 0.25);
        const tx = x + Math.sin(a) * br * 0.5, tz = z + Math.cos(a) * br * 0.5;
        b.tube([[x + Math.sin(a) * br * 0.3, top - 0.1, z + Math.cos(a) * br * 0.3], [x + Math.sin(a) * br * 0.7, top + hh * 0.6, z + Math.cos(a) * br * 0.7], [tx, top + hh, tz]], 0.014, { color: p.trim, seg: 3, paint: true });
        b.sphere(0.04, { color: i ? p.accent2 : p.accent, mat: Mat.Glow, wSeg: 4, hSeg: 2, x: tx, z: tz, y: top + hh });
      }
      return top + ah;
    }
    if (kind === 1) {
      // blossom: petals opening around a glowing pistil
      const pl = Math.min(0.62, r * (1.1 + pr * 0.6) * Math.sqrt(tall));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.group({ x, z, y: o.y, ry: a }, () => b.box(r * 0.55, 0.025, pl, { color: i % 2 ? p.roof : shade(p.roof, 1.15), z: pl * 0.42, rx: -0.75, y: pl * 0.32 }));
      }
      const ph = 0.25 + pr * 0.5;
      b.cyl(0.02, 0.035, ph, { color: p.trim, seg: 4, x, z, y: o.y, capTop: false });
      b.sphere(r * 0.22, { color: p.accent, mat: Mat.Glow, wSeg: 6, hSeg: 3, x, z, y: o.y + ph });
      return o.y + Math.max(ph + r * 0.22, pl * 0.9);
    }
    // curling horn
    const hh = (0.9 + pr * 1.4) * Math.min(tall, 1.6);
    b.cone(r * 0.55, hh * 0.6, { color: p.trim, seg: 8, x, z, y: o.y });
    b.cone(r * 0.25, hh * 0.5, { color: p.trim, seg: 6, x: x + r * 0.12, z, y: o.y + hh * 0.5, rz: -0.2 });
    b.sphere(0.04, { color: p.accent, mat: Mat.Glow, wSeg: 4, hSeg: 2, x: x + r * 0.12 + Math.sin(0.2) * hh * 0.5, z, y: o.y + hh * 0.5 + Math.cos(0.2) * hh * 0.5 });
    return o.y + hh;
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
        if (!fits(rc, cols * 15)) return;
        const cw = o.w / cols;
        for (let c = 0; c < cols; c++) b.dome(Math.min(cw * 0.3, 0.09), { color: (c + k) % 2 ? p.roof : p.trim, wSeg: 5, hSeg: 2, rx: Math.PI / 2, x: -o.w / 2 + cw * (c + 0.5), y: y + 0.04, sz: 0.8, ...DET, paint: true });
      } else {
        if (!fits(rc, 20)) return;
        b.box(o.w, 0.03, dep, { color: p.trim, z: dep / 2, y, ...DET, paint: true });
        if (k % 2 === 0) b.box(o.w * 0.9, 0.008, 0.008, { color: p.accent, mat: Mat.Glow, z: dep, y: y + 0.03, ...DET });
      }
    }
  }

  protected override drawShopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    b.box(o.w - 0.06, o.h * 0.74, 0.03, { color: p.glass, mat: Mat.Glass, y: G, z: 0.012, paint: false });
    // shell canopy
    b.dome(0.18, { color: p.roof, wSeg: 7, hSeg: 2, h: 0.06, sx: (o.w * 0.55) / 0.18, sz: 1.1, z: 0.06, y: o.h * 0.78 });
    b.box(o.w * 0.8, 0.01, 0.01, { color: p.accent, mat: Mat.Glow, y: o.h * 0.78, z: 0.25, ...DET });
    if (o.glyphs) glyphs(b, Math.min(o.w * 0.6, 0.55), 0.06, o.glyphs, rc.seed, { color: o.color ?? p.accent, mat: Mat.Glow, y: o.h * 0.78 + 0.08, z: 0.04, paint: false });
  }

  protected override drawPortico(rc: RC, w: number, h: number): void {
    const { b, p } = rc;
    const hw = w / 2;
    b.tube([[-hw, G, 0.2], [-hw * 0.9, h * 0.75, 0.2], [0, h * 1.15, 0.2], [hw * 0.9, h * 0.75, 0.2], [hw, G, 0.2]], 0.022, { color: p.trim, seg: 3, paint: true });
    b.sphere(0.03, { color: p.accent, mat: Mat.Glow, wSeg: 4, hSeg: 2, y: h * 1.1, z: 0.2, ...DET });
  }

  override bridge(rc: RC, x0: number, z0: number, x1: number, z1: number, y: number, h = FL * 2): void {
    const { b, p } = rc;
    const r = Math.min(0.1, h * 0.45);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    b.tube([[x0, y + r, z0], [mx, y + r * 0.6, mz], [x1, y + r, z1]], r, { color: p.glass, mat: Mat.Glass, seg: 6, paint: false });
    if (fits(rc, 14)) b.tube([[x0, y - 0.01, z0], [mx, y - 0.04, mz], [x1, y - 0.01, z1]], 0.014, { color: p.accent, mat: Mat.Glow, seg: 3, ...DET });
  }

  override terrace(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b } = rc;
    polyTop(b, ellipse(w, d, 8), { color: 0x7aa060, x, z, y: y + 0.01, paint: false });
    this.shrub(rc, x - w * 0.25, z, 1.1, y + 0.01);
    this.shrub(rc, x + w * 0.2, z + d * 0.1, 0.9, y + 0.01);
  }

  override roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    this.roof(rc, { x, z, y, w, d, kind: 'garden' });
  }

  override sign(rc: RC, o: SignOpts, x: number, y: number, z: number): void {
    if (o.kind === 'board') {
      const { b, p } = rc;
      b.extrude(ellipse(o.w + 0.08, 0.05, 8), o.h + 0.04, { color: p.trim, x, y: y - 0.02, z: z + 0.01, paint: true });
      glyphs(b, o.w, o.h * 0.75, o.n ?? 4, rc.seed, { color: o.color ?? p.accent, mat: Mat.Glow, x, y: y + o.h * 0.1, z: z + 0.04, paint: false });
      return;
    }
    super.sign(rc, o, x, y, z);
  }
}
