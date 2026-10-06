/**
 * zoned-rc · Solarpunk skin — timber frames, terracotta and cream render, living green roofs, balcony gardens,
 * pergolas heavy with vines, solar sails and little wind turbines. Optimism you can grow tomatoes on.
 */
import type { Rng } from '../../../../../core/rng';
import { FL, G, Mat, bush, glyphs, hip, mix, planter, shade, solarPanel, storeys, tree, type V2 } from '../common';
import { DET, Skin, fits, type CrownOpts, type FaceOpts, type HouseOpts, type MassOpts, type Pal, type RC, type RoofOpts, type ShopOpts } from '../skin';

const TIMBER = 0x8a5a3a;
const TERRACOTTA = [0xc98a5a, 0xd9a070, 0xb8754a];
const CREAM = [0xf2e6c8, 0xe8d8b0, 0xf6ecd4];

export class SolarpunkSkin extends Skin {
  readonly id = 'solarpunk' as const;
  readonly ground = 0x8cc25a;
  readonly pave = 0xd9c39a;
  readonly plaza = 0xcdb48a;
  readonly green = 0x4a9a3a;
  override readonly trunk = 0x7a5a3a;
  override readonly timber = TIMBER;

  override palette(p: Pal, vr: Rng): Pal {
    p.wall = vr.chance(0.5) ? vr.pick(CREAM) : vr.pick(TERRACOTTA);
    p.wall2 = vr.chance(0.5) ? vr.pick(TERRACOTTA) : vr.pick(CREAM);
    p.trim = TIMBER;
    p.trim2 = vr.pick([0x2a6a4a, 0x8a3a2a, 0x2a4a6a]);
    p.roof = vr.pick([0x5aa04a, 0x6ab85a, 0x4f8f3f]);
    p.green2 = 0x7ac25a;
    p.awning = vr.pick([0xffd24a, 0xff9a4a, 0xe8c070]);
    return p;
  }

  override outline(): V2[] | null {
    return null;
  }

  protected override drawTree(rc: RC, x: number, z: number, s: number, y: number): void {
    const k = (Math.abs(Math.round(x * 31 + z * 17)) + rc.seed) % 3;
    tree(rc.b, x, z, s, k === 2 ? 'cone' : 'round', k === 1 ? rc.p.green2 : rc.p.green, rc.p.trunk, y, y < 1.2);
    if (k === 0 && !rc.lo && y < 1.2) bush(rc.b, x + 0.06 * s, z + 0.05 * s, 0.6 * s, 0xe8a040, y + 0.02);
  }

  /** Living roof surface with a timber eave. */
  private greenGable(rc: RC, w: number, h: number, d: number, y: number, kind: 'gable' | 'hip' | 'front'): void {
    const { b, p } = rc;
    if (kind === 'hip') hip(b, w, h, d, { color: p.roof, y, overhang: 0.07 });
    else if (kind === 'front') b.gable(d, h, w, { color: p.roof, y, overhang: 0.07, ry: Math.PI / 2 });
    else b.gable(w, h, d, { color: p.roof, y, overhang: 0.07 });
    b.box(w + 0.1, 0.02, d + 0.1, { color: TIMBER, y: y - 0.01 });
  }

  override house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const h = storeys(o.floors);
    const pr = o.prestige ?? 0;
    const kind = o.roof ?? 'gable';
    const rh = Math.min(o.w, o.d) * 0.4;
    let top = h;
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      b.box(o.w, h - G, o.d, { color: o.color ?? p.wall, mat: Mat.WindowSmall, y: G });
      // timber frame: corner posts + floor beam
      for (const sx of [-1, 1]) b.box(0.03, h - G, 0.03, { color: TIMBER, x: (sx * o.w) / 2, z: o.d / 2, y: G, ...DET, paint: true });
      if (o.floors >= 2) b.box(o.w + 0.03, 0.025, o.d + 0.03, { color: TIMBER, y: FL + 0.01 });
      if (kind === 'flat' || kind === 'shed') {
        b.box(o.w + 0.06, 0.03, o.d + 0.06, { color: TIMBER, y: h });
        b.box(o.w * 0.9, 0.03, o.d * 0.9, { color: p.roof, y: h + 0.03 });
        if (fits(rc, 10)) bush(b, -o.w * 0.25, -o.d * 0.15, 0.8, p.green2, h + 0.06);
        if (o.w > 0.35 && fits(rc, 10)) bush(b, o.w * 0.2, o.d * 0.1, 0.7, p.green, h + 0.06);
        top = h + 0.1;
      } else {
        this.greenGable(rc, o.w, rh, o.d, h, kind);
        top = h + rh;
      }
      if (o.door !== false) {
        b.box(0.09, 0.15, 0.02, { color: p.trim2, y: G, z: o.d / 2 + 0.004, paint: false });
        if (fits(rc, 20)) planter(b, -o.w * 0.28, G + 0.12, o.d / 2 + 0.03, Math.min(0.2, o.w * 0.3), 0.04, TIMBER, 0xe86a8a);
      }
      if (pr > 0.25 && o.w > 0.45 && kind !== 'flat' && fits(rc, 10)) {
        // solar sail over the sunny roof slope
        b.box(o.w * 0.55, 0.012, o.d * 0.36, { color: 0x1a2a4a, mat: Mat.Solar, x: -o.w * 0.12, y: h + rh * 0.5, z: o.d * 0.2, rx: 0.72, ...DET });
      }
      if (pr > 0.5 && o.w > 0.5 && fits(rc, 30)) {
        // vine pergola on the street side
        const pz = o.d / 2 + 0.12;
        b.box(0.02, FL - 0.02, 0.02, { color: TIMBER, x: -o.w * 0.35, z: pz, y: G, ...DET });
        b.box(0.02, FL - 0.02, 0.02, { color: TIMBER, x: o.w * 0.05, z: pz, y: G, ...DET });
        b.box(o.w * 0.5, 0.03, 0.2, { color: 0x5aa04a, x: -o.w * 0.15, z: pz - 0.06, y: FL - 0.02, ...DET });
      }
    });
    return (o.y ?? 0) + top;
  }

  override pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    const { b, p } = rc;
    b.cyl(r * 1.02, r * 1.06, 0.07, { color: TIMBER, seg: 9, x, z, y, capTop: false });
    if (glass) {
      b.dome(r, { color: 0xd8f0d0, mat: Mat.Glass, wSeg: 7, hSeg: 3, h, x, z, y: y + 0.07, flat: true });
      return y + 0.07 + h;
    }
    b.dome(r, { color: p.roof, wSeg: 9, hSeg: 3, h, x, z, y: y + 0.07 });
    b.box(r * 0.6, 0.12, 0.03, { color: p.wall, mat: Mat.WindowSmall, x, z: z + r * 0.9, y: y + 0.05, ...DET });
    if (fits(rc, 10)) bush(b, x - r * 0.2, z - r * 0.1, 0.7, p.green2, y + 0.07 + h * 0.85);
    return y + 0.07 + h;
  }

  override block(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const office = o.use === 'office';
    b.box(o.w, o.h, o.d, { color: office ? 0x8ab0a0 : o.color ?? p.wall, mat: office ? Mat.Glass : Mat.Window, x, z, y, top: p.roof });
    // timber floor beams with balcony planters every other storey
    for (const sx of [-0.5, 0.5]) b.box(0.035, o.h, 0.035, { color: TIMBER, x: x + sx * o.w, z: z + o.d / 2, y, ...DET, paint: true });
    for (let f = 2; f * FL < o.h - 0.05; f += 2) {
      if (!fits(rc, 20)) break;
      b.box(o.w + 0.04, 0.025, o.d + 0.04, { color: TIMBER, x, z, y: y + f * FL - 0.03, ...DET, paint: true });
      b.box(o.w * 0.8, 0.03, 0.04, { color: f % 4 ? p.green : p.green2, x, z: z + o.d / 2 + 0.02, y: y + f * FL - 0.005, ...DET });
    }
  }

  override tower(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    this.shell(rc, o, o.use === 'office' ? Mat.Glass : Mat.Window, o.use === 'office' ? 0x8ab0a0 : o.color ?? p.wall);
    // vertical forest: green terraces every 3 storeys, alternating corner trees
    if (!o.round && fits(rc, 20)) for (const sx of [-0.5, 0.5]) b.box(0.03, o.h, 0.03, { color: TIMBER, x: x + sx * o.w, z: z + o.d / 2 + 0.03, y, ...DET, paint: true });
    if (o.lite) return;
    const step = Math.max(4, Math.ceil(o.h / FL / 4));
    let k = 0;
    for (let f = step; f * FL < o.h - 0.1; f += step, k++) {
      if (!fits(rc, 24)) break;
      const yy = y + f * FL - 0.02;
      if (o.round) b.cyl(Math.min(o.w, o.d) / 2 + 0.05, Math.min(o.w, o.d) / 2 + 0.05, 0.035, { color: p.green, seg: 10, x, z, y: yy, capTop: false, ...DET });
      else b.box(o.w + 0.08, 0.03, o.d + 0.08, { color: k % 2 ? p.green : p.green2, x, z, y: yy, top: k % 2 ? p.green2 : p.green, ...DET });
      if (!rc.lo && !o.round) {
        const sx = k % 2 ? 1 : -1;
        b.box(0.1, 0.07, 0.1, { color: shade(p.green, 1.1), x: x + sx * (o.w / 2), z: z + o.d / 2, y: yy + 0.03, ...DET });
      }
    }
  }

  override roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y;
    if (o.kind === 'pitched') {
      b.group({ x, z }, () => this.greenGable(rc, o.w, Math.min(o.w, o.d) * 0.36, o.d, y, o.d > o.w * 1.2 ? 'front' : 'gable'));
      return;
    }
    this.roofGarden(rc, x, z, y, o.w, o.d);
    if ((o.kind === 'flat' || o.kind === 'mech' || (o.prestige ?? 0) > 0.5) && fits(rc, 20)) {
      // solar sail canopy on timber posts
      const sw = o.w * 0.5, sd = o.d * 0.45;
      b.box(0.02, 0.18, 0.02, { color: TIMBER, x: x + o.w * 0.12, z: z - o.d * 0.08, y, ...DET });
      b.box(sw, 0.012, sd, { color: 0x1a2a4a, mat: Mat.Solar, x: x + o.w * 0.12, z: z - o.d * 0.08, y: y + 0.18, rx: 0.35, ry: 0.2 });
    }
  }

  override roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w * 0.92, 0.04, d * 0.92, { color: p.roof, x, z, y, paint: false });
    if (rc.lo) return;
    if (fits(rc, 20)) planter(b, x - w * 0.3, y + 0.04, z + d * 0.25, w * 0.25, 0.08, TIMBER, 0xe8a040);
    if (fits(rc, 26)) tree(b, x - w * 0.25, z - d * 0.2, 0.7, 'round', p.green2, p.trunk, y + 0.04, false);
    if (fits(rc, 10)) bush(b, x + w * 0.3, z + d * 0.25, 0.8, p.green, y + 0.04, Mat.Plain);
  }

  override crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    const pr = o.prestige;
    const kind = (o.kind ?? rc.seed) % 3;
    const tall = o.tall ?? 1;
    b.box(o.w * 0.92, 0.04, o.d * 0.92, { color: p.roof, x, z, y: o.y, paint: false });
    if (kind === 0) {
      // solar sails on a timber mast
      const mh = (0.6 + pr * 1.2) * tall;
      b.cyl(0.015, 0.03, mh, { color: TIMBER, seg: 4, x, z, y: o.y, capTop: false });
      const s = Math.min(o.w, o.d) * (0.5 + pr * 0.4);
      for (let i = 0; i < (pr > 0.5 ? 3 : 2); i++) {
        const a = (i / 3) * Math.PI * 2 + 0.3;
        const yy = o.y + mh * (0.35 + i * 0.22);
        b.tri([0, 0, 0], [Math.sin(a) * s, -s * 0.4, Math.cos(a) * s], [Math.sin(a + 0.8) * s * 0.8, s * 0.3, Math.cos(a + 0.8) * s * 0.8], { color: 0x1a2a4a, x, z, y: yy }, 0x1a2a4a, Mat.Solar);
        b.tri([0, 0, 0], [Math.sin(a + 0.8) * s * 0.8, s * 0.3, Math.cos(a + 0.8) * s * 0.8], [Math.sin(a) * s, -s * 0.4, Math.cos(a) * s], { color: 0x1a2a4a, x, z, y: yy }, 0x1a2a4a, Mat.Solar);
      }
      return o.y + mh;
    }
    if (kind === 1) {
      // greenhouse lantern
      const gh = 0.25 + pr * 0.2;
      b.box(o.w * 0.6, gh, o.d * 0.6, { color: 0xd8f0d0, mat: Mat.Glass, x, z, y: o.y + 0.04 });
      b.gable(o.w * 0.62, 0.14, o.d * 0.62, { color: 0xe0f4e0, mat: Mat.Glass, x, z, y: o.y + 0.04 + gh });
      this.turbine(rc, x + o.w * 0.3, z - o.d * 0.3, o.y + 0.04, 0.5 + pr * 0.5);
      return o.y + gh + 0.2;
    }
    // a great tree on top
    const s = 1.6 + pr * 1.2;
    tree(b, x, z, s, 'round', p.green2, p.trunk, o.y + 0.04, false);
    this.turbine(rc, x - o.w * 0.3, z + o.d * 0.25, o.y + 0.04, 0.6);
    return o.y + 0.36 * s;
  }

  /** Small three-blade wind turbine (detail). */
  private turbine(rc: RC, x: number, z: number, y: number, s: number): void {
    const { b } = rc;
    if (rc.lo || !fits(rc, 36)) return;
    b.cyl(0.006, 0.012, 0.35 * s, { color: 0xf0ece0, seg: 3, x, z, y, capTop: false, ...DET });
    for (let i = 0; i < 3; i++) b.group({ x, z: z + 0.012, y: y + 0.35 * s, rz: (i / 3) * Math.PI * 2 }, () => b.box(0.012, 0.16 * s, 0.006, { color: 0xf6f2e8, ...DET }));
  }

  override balconies(rc: RC, o: FaceOpts): void {
    const { b, p } = rc;
    const every = o.every ?? 1;
    const dep = o.depth ?? 0.07;
    const cols = o.cols ?? 0;
    for (let f = Math.max(1, Math.ceil(o.y0 / FL)); f * FL <= o.y1; f += Math.max(every, cols > 0 ? 1 : 2)) {
      const y = f * FL;
      if (cols > 0) {
        if (!fits(rc, cols * 20)) return;
        const cw = o.w / cols;
        for (let c = 0; c < cols; c++) planter(b, -o.w / 2 + cw * (c + 0.5), y, dep / 2, cw * 0.62, dep, TIMBER, (c + f) % 2 ? p.green : 0xe86a8a);
      } else {
        if (!fits(rc, 20)) return;
        b.box(o.w, 0.025, dep, { color: TIMBER, z: dep / 2, y, ...DET, paint: true });
        b.box(o.w * 0.96, 0.035, 0.03, { color: f % 2 ? p.green : p.green2, z: dep - 0.015, y: y + 0.025, ...DET });
      }
    }
  }

  override shopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    b.box(o.w - 0.06, o.h * 0.72, 0.03, { color: 0xc8d8c0, mat: Mat.Glass, y: G, z: 0.012, paint: false });
    // timber pergola with vines
    const pz = 0.18;
    b.box(0.025, o.h * 0.85, 0.025, { color: TIMBER, x: -o.w / 2 + 0.04, z: pz, y: G, ...DET });
    b.box(0.025, o.h * 0.85, 0.025, { color: TIMBER, x: o.w / 2 - 0.04, z: pz, y: G, ...DET });
    b.box(o.w, 0.025, 0.24, { color: TIMBER, y: o.h * 0.85, z: 0.1 });
    b.box(o.w * 0.94, 0.035, 0.2, { color: 0x5aa04a, y: o.h * 0.85 + 0.025, z: 0.1, top: p.green2 });
    b.box(o.w * 0.9, 0.012, 0.012, { color: 0xffd890, mat: Mat.Light, y: o.h * 0.85 - 0.012, z: 0.2, paint: false });
    if (!rc.lo && fits(rc, 40)) {
      planter(b, -o.w * 0.3, G, 0.22, 0.14, 0.06, TIMBER, 0xffb03a);
      planter(b, o.w * 0.3, G, 0.22, 0.14, 0.06, TIMBER, 0xe86a8a);
    }
    if (o.glyphs) {
      b.box(Math.min(o.w * 0.6, 0.5) + 0.04, 0.09, 0.02, { color: 0x2a4a3a, y: o.h * 0.88 + 0.06, z: 0.02, paint: false });
      glyphs(b, Math.min(o.w * 0.6, 0.5), 0.06, o.glyphs, rc.seed, { color: o.color ?? p.awning, mat: Mat.Glow, y: o.h * 0.88 + 0.075, z: 0.032, paint: false });
    }
  }

  override portico(rc: RC, w: number, h: number): void {
    const { b, p } = rc;
    b.box(0.025, h - G, 0.025, { color: TIMBER, x: -w / 2, z: 0.2, y: G, ...DET });
    b.box(0.025, h - G, 0.025, { color: TIMBER, x: w / 2, z: 0.2, y: G, ...DET });
    b.box(w + 0.06, 0.025, 0.24, { color: TIMBER, y: h, z: 0.11 });
    b.box(w, 0.04, 0.2, { color: p.green, y: h + 0.025, z: 0.11, top: p.green2 });
  }

  override terrace(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w, 0.035, d, { color: p.roof, x, z, y, paint: false });
    if (rc.lo) return;
    if (fits(rc, 20)) planter(b, x, y + 0.035, z + d / 2 - 0.04, w * 0.9, 0.06, TIMBER, p.green2);
    if (fits(rc, 10)) bush(b, x - w * 0.3, z, 0.8, p.green, y + 0.035, Mat.Plain);
    if (fits(rc, 10)) bush(b, x + w * 0.25, z - d * 0.1, 0.7, 0xe8a040, y + 0.035, Mat.Plain);
  }

  override bridge(rc: RC, x0: number, z0: number, x1: number, z1: number, y: number, h = FL * 2, w = 0.16): void {
    const { b, p } = rc;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    b.box(w, h, len, { color: 0xc8e0c8, mat: Mat.Glass, x: mx, z: mz, y, ry, top: TIMBER });
    if (fits(rc, 10)) b.box(w + 0.04, 0.04, len, { color: p.green, x: mx, z: mz, y: y + h, ry, ...DET });
  }

  protected override drawLamp(rc: RC, x: number, z: number, h: number): void {
    if (rc.lo) return;
    const { b } = rc;
    b.box(0.02, h, 0.02, { color: TIMBER, x, z, y: G, ...DET });
    solarPanel(b, x, G + h - 0.02, z, 0.06, 0.05, 0.5, 0);
    b.box(0.04, 0.03, 0.04, { color: 0xffe0a0, mat: Mat.Light, x, z, y: G + h - 0.06, ...DET });
  }

  override sign(rc: RC, o: Parameters<Skin['sign']>[1], x: number, y: number, z: number): void {
    if (o.kind === 'board') {
      const { b, p } = rc;
      b.box(o.w + 0.05, o.h + 0.04, 0.025, { color: TIMBER, x, y: y - 0.02, z });
      b.box(o.w + 0.02, o.h + 0.01, 0.01, { color: 0x2a4a3a, x, y: y - 0.005, z: z + 0.015, paint: false });
      glyphs(b, o.w * 0.9, o.h * 0.7, o.n ?? 4, rc.seed, { color: o.color ?? mix(p.awning, 0xffffff, 0.2), mat: Mat.Glow, x, y: y + o.h * 0.12, z: z + 0.022, paint: false });
      return;
    }
    super.sign(rc, o, x, y, z);
  }
}
