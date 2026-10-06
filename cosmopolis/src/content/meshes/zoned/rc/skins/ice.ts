/**
 * zoned-rc · Glacier Domes skin — insulated white domes with steel-blue collars, frosted-glass drums and entry
 * tunnels glowing warm inside, stacked lantern towers, icicle spires and aurora-tinted light strips.
 */
import type { Rng } from '../../../../../core/rng';
import { FL, G, Mat, antenna, ellipse, glyphs, mix, roundRect, tree, type V2 } from '../common';
import { DET, Skin, fits, type CrownOpts, type FaceOpts, type HouseOpts, type MassOpts, type Pal, type RC, type RoofOpts, type ShopOpts } from '../skin';

const SNOW = 0xf6faff;
const STEEL = 0x6f9ac0;
const FROST = 0xbfe4ff;
const WARM = 0xffd9a0;
const AURORA = [0x7ae0ff, 0xb0a0ff, 0x7affc8];

export class IceSkin extends Skin {
  readonly id = 'ice' as const;
  readonly ground = 0xeef4fa;
  readonly pave = 0xc6d6e6;
  readonly plaza = 0xd4e0ec;
  readonly green = 0x3f6f62;
  override readonly trunk = 0x5a4a40;

  override palette(p: Pal, vr: Rng): Pal {
    p.trim = vr.pick([STEEL, STEEL, 0x8aaecc, 0x4f7aa0]);
    p.roof = vr.pick([SNOW, 0xe6f2ff, 0xdcecfa]);
    p.accent = vr.pick(AURORA);
    p.accent2 = vr.pick(AURORA);
    p.glass = FROST;
    p.green2 = 0x4f806e;
    p.awning = p.accent;
    return p;
  }

  override outline(_rc: RC, w: number, d: number): V2[] | null {
    return roundRect(w, d, Math.min(w, d) * 0.46, 2);
  }

  override roundOutline(w: number, d: number): V2[] {
    return ellipse(w, d, 14);
  }

  protected override drawTree(rc: RC, x: number, z: number, s: number, y: number): void {
    const { b } = rc;
    if (rc.lo) return;
    tree(b, x, z, s, 'pine', rc.p.green, rc.p.trunk, y, y < 1.2);
    b.cone(0.05 * s, 0.07 * s, { color: SNOW, seg: 6, x, z, y: y + 0.36 * s, ...DET });
  }

  protected override drawLamp(rc: RC, x: number, z: number, h: number): void {
    if (rc.lo) return;
    const { b, p } = rc;
    b.cyl(0.01, 0.014, h, { color: p.trim, seg: 4, x, z, y: G, ...DET });
    b.sphere(0.03, { color: WARM, mat: Mat.Light, wSeg: 5, hSeg: 3, x, z, y: G + h + 0.02, ...DET });
  }

  /** Igloo dome with steel collar and frosted skylight. Returns top. */
  private igloo(rc: RC, x: number, z: number, r: number, h: number, y: number, color = rc.p.roof): number {
    const { b, p } = rc;
    b.cyl(r * 1.04, r * 1.06, 0.05, { color: p.trim, seg: 10, x, z, y, capTop: false });
    b.dome(r, { color, wSeg: 10, hSeg: 3, h, x, z, y: y + 0.05 });
    if (fits(rc, 20)) b.dome(r * 0.3, { color: FROST, mat: Mat.Glass, wSeg: 6, hSeg: 2, h: r * 0.14, x, z, y: y + 0.05 + h * 0.93, ...DET });
    return y + 0.05 + h;
  }

  override house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const pr = o.prestige ?? 0;
    const r = Math.min(o.w, o.d) / 2;
    const twin = o.w > o.d * 1.4;
    let top = 0;
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      let y = G;
      if (o.floors >= 2) {
        // a frosted-glass drum lifts the dome by a storey
        b.cyl(r * 0.98, r, FL - 0.01, { color: 0xe8f4ff, mat: Mat.Glass, seg: 10, y, capTop: false });
        y += FL - 0.01;
      }
      if (twin) {
        const r2 = o.d / 2;
        top = this.igloo(rc, -o.w / 2 + r2, 0, r2, r2 * 0.85, y, o.color ?? p.roof);
        this.igloo(rc, o.w / 2 - r2, 0, r2 * 0.9, r2 * 0.75, y, o.color ?? p.roof);
        b.box(o.w - r2 * 2, r2 * 0.6, r2, { color: p.roof, y });
      } else top = this.igloo(rc, 0, 0, r, r * 0.82, y, o.color ?? p.roof);
      if (o.door !== false) {
        // entry tunnel glowing warm inside
        const tz = (twin ? o.d / 2 : r) - 0.02;
        b.cyl(0.075, 0.075, 0.16, { color: p.roof, seg: 5, arc: Math.PI, ry: Math.PI / 2, rz: Math.PI / 2, z: tz - 0.02, y: G, capTop: true, capBottom: false });
        b.box(0.1, 0.06, 0.01, { color: WARM, mat: Mat.Light, z: tz + 0.142, y: G, ...DET });
      }
      if (pr > 0.35 && o.w > 0.4 && fits(rc, 40)) {
        const rc2 = r * 0.5;
        b.cyl(rc2, rc2, 0.04, { color: p.trim, seg: 7, x: -r - rc2 * 0.4, z: r * 0.3, y: G, capTop: false });
        b.dome(rc2, { color: FROST, mat: Mat.Glass, wSeg: 7, hSeg: 2, x: -r - rc2 * 0.4, z: r * 0.3, y: G + 0.04, flat: true });
      }
      if (pr > 0.55 && fits(rc, 20)) b.cyl(r * 1.08, r * 1.08, 0.012, { color: p.accent, mat: Mat.Glow, seg: 10, y: G + 0.01, capTop: false, paint: false });
    });
    return (o.y ?? 0) + top;
  }

  override pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    if (glass) {
      const { b, p } = rc;
      b.cyl(r * 1.04, r * 1.04, 0.05, { color: p.trim, seg: 8, x, z, y, capTop: false });
      b.dome(r, { color: FROST, mat: Mat.Glass, wSeg: 8, hSeg: 3, h, x, z, y: y + 0.05, flat: true });
      return y + 0.05 + h;
    }
    return this.igloo(rc, x, z, r, h, y);
  }

  override block(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const office = o.use === 'office';
    this.shell(rc, o, office ? Mat.Glass : Mat.WindowSmall, office ? FROST : o.color ?? p.wall);
    // a frosted glass band every three storeys + steel cap
    const band = roundRect(o.w + 0.03, o.d + 0.03, Math.min(o.w, o.d) * 0.47, 1);
    b.extrude(band, 0.04, { color: p.trim, x, z, y: y + o.h - 0.02 });
    for (let f = 2; f * FL < o.h - 0.15; f += 3) {
      if (!fits(rc, 24)) break;
      b.extrude(band, FL * 0.6, { color: 0xe0f2ff, mat: Mat.Glass, x, z, y: y + f * FL + 0.02, ...DET });
    }
  }

  override tower(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    // stacked lantern drums: insulated white / frosted glass, alternating
    const poly = o.round ? this.roundOutline(o.w, o.d) : roundRect(o.w, o.d, Math.min(o.w, o.d) * 0.46, o.lite ? 1 : 2);
    const glass = o.use === 'office' || (o.seg ?? 0) % 2 === 1;
    b.extrude(poly, o.h, { color: glass ? FROST : o.color ?? p.wall, mat: glass ? Mat.Glass : Mat.Window, x, z, y, top: p.roof });
    const r = Math.min(o.w, o.d) / 2 + 0.03;
    const ring = (yy: number, det: boolean) =>
      o.round || Math.abs(o.w - o.d) < 0.08
        ? b.cyl(r, r, 0.05, { color: p.trim, seg: 12, x, z, y: yy, capTop: false, detail: det, paint: true, sx: o.round ? 1 : o.w / o.d })
        : b.box(o.w + 0.03, 0.05, o.d + 0.03, { color: p.trim, x, z, y: yy, detail: det });
    ring(y + o.h - 0.03, false);
    if (o.lite) return;
    const n = Math.min(3, Math.floor(o.h / (FL * 8)));
    for (let i = 1; i <= n; i++) {
      if (!fits(rc, 24)) break;
      ring(y + (o.h * i) / (n + 1), true);
    }
  }

  override roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y;
    const m = Math.min(o.w, o.d);
    if (o.kind === 'pitched' || o.kind === 'flat' || o.kind === 'mech') {
      // insulated dome cap, stretched to the block
      b.dome(m * 0.5, { color: p.roof, wSeg: 8, hSeg: 3, h: m * 0.3, x, z, y, sx: o.w / m, sz: o.d / m });
      if (o.kind !== 'pitched' && fits(rc, 20)) antenna(b, x + o.w * 0.2, y + m * 0.2, z, 0.18, p.accent, STEEL);
      return;
    }
    // winter garden: frosted conservatory
    b.box(o.w * 0.85, 0.03, o.d * 0.85, { color: p.trim, x, z, y });
    b.dome(m * 0.34, { color: FROST, mat: Mat.Glass, wSeg: 8, hSeg: 2, h: m * 0.28, x, z, y: y + 0.03, flat: true });
    this.tree(rc, x + o.w * 0.32, z + o.d * 0.22, 0.6, y + 0.03);
  }

  override crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    const pr = o.prestige;
    const tall = o.tall ?? 1;
    const r = Math.min(o.w, o.d) / 2;
    const kind = (o.kind ?? rc.seed) % 3;
    if (kind === 0) {
      const top = this.igloo(rc, x, z, r * 0.85, r * 0.75, o.y);
      const ah = (0.3 + pr * 0.8) * tall;
      antenna(b, x, top, z, ah, p.accent, STEEL);
      return top + ah;
    }
    if (kind === 1) {
      // icicle spire with an aurora tip
      const sh = (0.8 + pr * 1.6) * tall;
      b.cyl(r * 0.6, r * 0.8, 0.1, { color: p.trim, seg: 8, x, z, y: o.y });
      b.cone(r * 0.55, sh, { color: SNOW, seg: 8, x, z, y: o.y + 0.1, flat: true });
      b.cone(r * 0.12, sh * 0.25, { color: p.accent, mat: Mat.Glow, seg: 6, x, z, y: o.y + 0.1 + sh * 0.76, paint: false });
      b.cyl(r * 0.62, r * 0.62, 0.015, { color: p.accent, mat: Mat.Glow, seg: 10, x, z, y: o.y + 0.085, capTop: false, paint: false });
      return o.y + 0.1 + sh;
    }
    // glass lantern under a floating halo
    const lh = 0.3 + pr * 0.3;
    b.cyl(r * 0.6, r * 0.65, lh, { color: 0xe8f6ff, mat: Mat.Glass, seg: 10, x, z, y: o.y, capTop: false });
    b.dome(r * 0.62, { color: p.roof, wSeg: 10, hSeg: 2, h: r * 0.3, x, z, y: o.y + lh });
    b.cyl(r * 0.95, r * 0.95, 0.03, { color: p.accent2, mat: Mat.Glow, seg: 12, x, z, y: o.y + lh + 0.25, capTop: false, paint: false });
    const ah = (0.3 + pr * 0.5) * tall;
    antenna(b, x, o.y + lh + r * 0.3, z, ah, p.accent, STEEL);
    return o.y + lh + r * 0.3 + ah;
  }

  override balconies(rc: RC, o: FaceOpts): void {
    const { b, p } = rc;
    const every = o.every ?? 1;
    const dep = o.depth ?? 0.07;
    const cols = o.cols ?? 0;
    for (let f = Math.max(1, Math.ceil(o.y0 / FL)); f * FL <= o.y1; f += Math.max(every, cols > 0 ? 1 : 2)) {
      const y = f * FL;
      if (cols > 0) {
        if (!fits(rc, cols * 18)) return;
        const cw = o.w / cols;
        for (let c = 0; c < cols; c++) b.cyl(dep, dep, 0.12, { color: 0xe0f2ff, mat: Mat.Glass, seg: 4, arc: Math.PI, ry: -Math.PI / 2, sz: (cw * 0.35) / dep, x: -o.w / 2 + cw * (c + 0.5), y: y - 0.08, ...DET });
      } else {
        if (!fits(rc, 20)) return;
        b.box(o.w, 0.03, dep, { color: p.trim, z: dep / 2, y, ...DET, paint: true });
        b.box(o.w, 0.05, 0.01, { color: 0xe0f2ff, mat: Mat.Glass, z: dep, y: y + 0.03, ...DET });
      }
    }
  }

  protected override drawShopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    // frosted vestibule under a snow-white rounded canopy
    b.box(o.w - 0.04, o.h * 0.75, 0.04, { color: 0xe8f6ff, mat: Mat.Glass, y: G, z: 0.015, paint: false });
    b.extrude(roundRect(o.w + 0.04, 0.22, 0.1, 1), 0.04, { color: SNOW, y: o.h * 0.78, z: 0.09 });
    b.box(o.w * 0.9, 0.01, 0.01, { color: p.accent, mat: Mat.Glow, y: o.h * 0.78 - 0.01, z: 0.2, ...DET });
    if (o.glyphs) glyphs(b, Math.min(o.w * 0.6, 0.55), 0.06, o.glyphs, rc.seed, { color: o.color ?? p.accent, mat: Mat.Glow, y: o.h * 0.78 + 0.05, z: 0.12, paint: false });
    if (!rc.lo) b.box(0.08, 0.05, 0.05, { color: SNOW, x: -o.w / 2 + 0.06, y: G, z: 0.26, ...DET });
  }

  protected override drawPortico(rc: RC, w: number, h: number): void {
    const { b, p } = rc;
    const r = Math.min(w * 0.5, h * 0.75);
    b.cyl(r, r, 0.24, { color: p.roof, seg: 6, arc: Math.PI, ry: Math.PI / 2, rz: Math.PI / 2, z: 0, y: G, capTop: true });
    b.box(r * 1.2, r * 0.6, 0.01, { color: WARM, mat: Mat.Light, z: 0.242, y: G, ...DET });
  }

  override bridge(rc: RC, x0: number, z0: number, x1: number, z1: number, y: number, h = FL * 2): void {
    const { b, p } = rc;
    const r = Math.min(0.1, h * 0.45);
    b.tube([[x0, y + r, z0], [x1, y + r, z1]], r, { color: 0xe8f6ff, mat: Mat.Glass, seg: 6, paint: false });
    b.tube([[x0, y - 0.01, z0], [x1, y - 0.01, z1]], 0.012, { color: p.accent, mat: Mat.Glow, seg: 4, ...DET });
  }

  override terrace(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b } = rc;
    b.box(w, 0.03, d, { color: SNOW, x, z, y });
    if (fits(rc, 10)) b.box(w * 0.8, 0.05, 0.012, { color: 0xe0f2ff, mat: Mat.Glass, x, z: z + d / 2 - 0.01, y: y + 0.03, ...DET });
  }

  override roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    this.roof(rc, { x, z, y, w, d, kind: 'garden' });
  }

  override sign(rc: RC, o: Parameters<Skin['sign']>[1], x: number, y: number, z: number): void {
    if (o.kind === 'board') {
      const { b, p } = rc;
      b.extrude(roundRect(o.w + 0.05, 0.04, 0.018, 1), o.h + 0.04, { color: SNOW, x, y: y - 0.02, z: z + 0.01 });
      glyphs(b, o.w, o.h * 0.75, o.n ?? 4, rc.seed, { color: o.color ?? mix(p.accent, 0xffffff, 0.1), mat: Mat.Glow, x, y: y + o.h * 0.1, z: z + 0.032, paint: false });
      return;
    }
    super.sign(rc, o, x, y, z);
  }
}

