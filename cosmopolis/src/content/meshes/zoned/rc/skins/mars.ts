/**
 * zoned-rc · Martian Adobe skin — sun-baked ochre drums under cream pressure domes, barrel vaults, arched
 * airlocks and loggias, tapering Shibam-style mud towers, greenhouse bubbles and fabric shade sails.
 */
import type { Rng } from '../../../../../core/rng';
import { FL, G, Mat, antenna, arch, glyphs, ngon, roundRect, shade, solarPanel, storeys, tree, type V2 } from '../common';
import { DET, Skin, fits, type CrownOpts, type FaceOpts, type HouseOpts, type MassOpts, type Pal, type RC, type RoofOpts, type ShopOpts } from '../skin';

const CREAM = 0xf2e6d0;
const ARCH = 0x3a2a24;
const FABRIC = [0x4ad0ff, 0xffd04a, 0xf6eee0, 0xe06a3a];

export class MarsSkin extends Skin {
  readonly id = 'mars' as const;
  readonly ground = 0xcf9a6a;
  readonly pave = 0xe8c08e;
  readonly plaza = 0xdcae80;
  readonly green = 0x7a9a4a;
  override readonly trunk = 0x8a5a3a;

  override palette(p: Pal, vr: Rng): Pal {
    p.roof = vr.pick([CREAM, CREAM, 0xe6d8bc, 0xd9c8a8]);
    p.trim = vr.pick([0x8a4a2a, CREAM, 0xa05a32]);
    p.trim2 = 0x6a3a22;
    p.awning = vr.pick(FABRIC);
    p.green2 = 0x8aaa52;
    p.glass = 0x8ab0c8;
    return p;
  }

  protected override drawFence(rc: RC, x: number, z: number, w: number): void {
    rc.b.box(w, 0.06, 0.04, { color: shade(rc.p.wall, 1.08), x, z, y: G, top: rc.p.roof, ...DET, paint: true });
  }

  override outline(_rc: RC, w: number, d: number): V2[] | null {
    return roundRect(w, d, Math.min(w, d) * 0.16, 2);
  }

  override roundOutline(w: number, d: number): V2[] {
    return ngon(10, Math.min(w, d) / 2);
  }

  protected override drawTree(rc: RC, x: number, z: number, s: number, y: number): void {
    const k = (rc.seed + Math.round(x * 13)) % 3;
    if (k === 0 && !rc.lo) {
      // greenhouse bubble
      rc.b.dome(0.11 * s, { color: 0xd8f0e0, mat: Mat.Glass, wSeg: 6, hSeg: 2, x, z, y, flat: true, ...DET });
      return;
    }
    tree(rc.b, x, z, s, k === 1 ? 'cactus' : 'round', k === 1 ? 0x6a9a4a : rc.p.green, rc.p.trunk, y);
  }

  /** Drum + pressure dome. Returns the top. */
  private domeHouse(rc: RC, x: number, z: number, r: number, h: number, wall: number, y = G): number {
    const { b, p } = rc;
    b.cyl(r, r * 1.05, h - y, { color: wall, mat: Mat.WindowSmall, seg: 9, x, z, y, capTop: false });
    b.cyl(r * 1.06, r * 1.06, 0.03, { color: p.trim, seg: 9, x, z, y: h - 0.01, capTop: false });
    b.dome(r * 1.02, { color: p.roof, wSeg: 9, hSeg: 3, h: r * 0.72, x, z, y: h + 0.02 });
    return h + 0.02 + r * 0.72;
  }

  override house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const pr = o.prestige ?? 0;
    const h = storeys(o.floors) - 0.02;
    const wall = o.color ?? p.wall;
    const vault = o.w > o.d * 1.35 || o.roof === 'shed';
    let top = 0;
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      let front = o.d / 2;
      if (vault) {
        b.extrude(roundRect(o.w, o.d, o.d * 0.2, 1), h - G, { color: wall, mat: Mat.WindowSmall, y: G });
        b.cyl(o.d / 2, o.d / 2, o.w, { color: p.roof, seg: 6, arc: Math.PI, rz: Math.PI / 2, x: o.w / 2, y: h, capTop: true, capBottom: true });
        top = h + o.d / 2;
      } else {
        const r = Math.min(o.w, o.d) / 2;
        front = r;
        top = this.domeHouse(rc, 0, 0, r, h, wall);
      }
      if (o.door !== false) {
        arch(b, 0.12, 0.17, 0.03, { color: ARCH, z: front - 0.012, y: G, seg: 3 });
        b.box(0.03, 0.03, 0.02, { color: 0xffc890, mat: Mat.Light, y: 0.21, z: front + 0.01, ...DET });
      }
      if (pr > 0.3 && !vault && o.w > 0.4 && fits(rc, 64)) {
        // side annex dome
        const r2 = Math.min(o.w, o.d) * 0.26;
        this.domeHouse(rc, o.w * 0.48, -o.d * 0.18, r2, storeys(1) - 0.02, shade(wall, 1.06));
      }
      if (pr > 0.6 && o.w > 0.45 && fits(rc, 36)) {
        const r3 = Math.min(o.w, o.d) * 0.24;
        b.cyl(r3, r3, 0.05, { color: p.trim, seg: 7, x: -o.w * 0.5, z: o.d * 0.08, y: G, capTop: false });
        b.dome(r3, { color: 0xd8f0e0, mat: Mat.Glass, wSeg: 7, hSeg: 2, x: -o.w * 0.5, z: o.d * 0.08, y: G + 0.05, flat: true });
      }
      if (pr > 0.2 && o.w > 0.4 && fits(rc, 20)) solarPanel(b, -o.w * 0.3, G, -o.d * 0.55, 0.18, 0.12, 0.5, Math.PI);
    });
    return (o.y ?? 0) + top;
  }

  override pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    const { b, p } = rc;
    b.cyl(r * 1.03, r * 1.06, 0.08, { color: shade(p.wall, 0.95), seg: 9, x, z, y, capTop: false });
    b.dome(r, { color: glass ? 0xd8f0e0 : p.roof, mat: glass ? Mat.Glass : Mat.Plain, wSeg: 9, hSeg: 3, h, x, z, y: y + 0.08, flat: glass });
    if (!glass) arch(b, 0.1, 0.12, 0.02, { color: ARCH, x, z: z + r * 0.96, y, seg: 3 });
    return y + 0.08 + h;
  }

  override block(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const office = o.use === 'office';
    this.shell(rc, o, office ? Mat.Glass : Mat.WindowSmall, office ? p.glass : o.color ?? p.wall);
    // parapet lip
    b.extrude(roundRect(o.w + 0.04, o.d + 0.04, Math.min(o.w, o.d) * 0.18, 1), 0.04, { color: p.trim, x, z, y: y + o.h - 0.02 });
    // arched loggia on the ground floor
    const n = Math.max(1, Math.min(3, Math.floor(o.w / 0.26)));
    if (o.w > 0.3 && !rc.lo && fits(rc, n * 16)) {
      for (let i = 0; i < n; i++) arch(b, 0.13, 0.17, 0.015, { color: ARCH, x: x + (i - (n - 1) / 2) * (o.w / n), z: z + o.d / 2 - 0.005, y: y, seg: 3, ...DET });
    }
  }

  override tower(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const office = o.use === 'office';
    const col = office ? p.glass : o.color ?? p.wall;
    const mat = office ? Mat.Glass : Mat.WindowSmall;
    const taper = 0.9;
    if (o.round) {
      const r = Math.min(o.w, o.d) / 2;
      b.cyl(r * taper, r, o.h, { color: col, mat, seg: 10, x, z, y, top: p.roof });
      for (let f = 6; f * FL < o.h - 0.2 && fits(rc, 20); f += 6) {
        const rr = r * (1 - (1 - taper) * ((f * FL) / o.h)) + 0.04;
        b.cyl(rr, rr, 0.03, { color: p.trim, seg: 10, x, z, y: y + f * FL - 0.015, ...DET, paint: true });
      }
      return;
    }
    // Shibam-style tapering square shaft
    const r = (o.w / 2) * Math.SQRT2;
    b.group({ x, z, sz: o.d / o.w }, () => {
      b.cyl(r * taper, r, o.h, { color: col, mat, seg: 4, ry: Math.PI / 4, y, top: p.roof, flat: true });
      for (let f = 6; f * FL < o.h - 0.2 && fits(rc, 8); f += 6) {
        const rr = r * (1 - (1 - taper) * ((f * FL) / o.h)) + 0.05;
        b.cyl(rr, rr, 0.03, { color: p.trim, seg: 4, ry: Math.PI / 4, y: y + f * FL - 0.015, flat: true, ...DET, paint: true });
      }
    });
    if (o.h > 1.2 && !rc.lo && fits(rc, 32)) for (let i = 0; i < 2; i++) arch(b, 0.14, 0.18, 0.012, { color: ARCH, x: x + (i - 0.5) * o.w * 0.4, z: z + o.d / 2 - 0.004, y, seg: 3, ...DET });
  }

  override roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y;
    if (o.kind === 'pitched') {
      // barrel vault along the longer axis
      if (o.w >= o.d) b.cyl(o.d / 2 - 0.01, o.d / 2 - 0.01, o.w - 0.02, { color: p.roof, seg: 8, arc: Math.PI, rz: Math.PI / 2, x: x + o.w / 2 - 0.01, z, y, capTop: true, capBottom: true });
      else b.cyl(o.w / 2 - 0.01, o.w / 2 - 0.01, o.d - 0.02, { color: p.roof, seg: 8, arc: Math.PI, rz: Math.PI / 2, ry: Math.PI / 2, z: z - o.d / 2 + 0.01, x, y, capTop: true, capBottom: true });
      return;
    }
    if (o.kind === 'garden' || o.kind === 'deck') {
      const r = Math.min(o.w, o.d) * 0.3;
      b.cyl(r * 1.05, r * 1.05, 0.04, { color: p.trim, seg: 8, x, z, y, capTop: false });
      b.dome(r, { color: 0xd8f0e0, mat: Mat.Glass, wSeg: 8, hSeg: 2, x, z, y: y + 0.04, flat: true });
      tree(b, x + o.w * 0.32, z + o.d * 0.25, 0.6, 'cactus', 0x6a9a4a, 0, y, false);
      return;
    }
    const r = Math.min(o.w, o.d) * 0.17;
    b.dome(r, { color: p.roof, wSeg: 8, hSeg: 2, x: x - o.w * 0.2, z: z - o.d * 0.1, y });
    if (o.w > 0.5 && fits(rc, 24)) b.dome(r * 0.75, { color: p.roof, wSeg: 8, hSeg: 2, x: x + o.w * 0.22, z: z + o.d * 0.12, y, ...DET });
    if (fits(rc, 12)) b.cyl(0.03, 0.03, 0.12, { color: p.trim, seg: 4, x: x + o.w * 0.25, z: z - o.d * 0.25, y, ...DET });
    if (o.kind === 'mech' && fits(rc, 20)) solarPanel(b, x, y, z + o.d * 0.25, o.w * 0.3, o.d * 0.2, 0.5);
  }

  override crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    const pr = o.prestige;
    const tall = o.tall ?? 1;
    const r = Math.min(o.w, o.d) / 2;
    const kind = (o.kind ?? rc.seed) % 3;
    if (kind === 0) {
      // pressurised observation dome
      b.cyl(r * 0.85, r * 0.9, 0.12, { color: p.trim, seg: 8, x, z, y: o.y, capTop: false });
      b.dome(r * 0.82, { color: 0xc8e4f0, mat: Mat.Glass, wSeg: 8, hSeg: 3, x, z, y: o.y + 0.12 });
      const ah = (0.3 + pr * 0.7) * tall;
      antenna(b, x, o.y + 0.12 + r * 0.82, z, ah, 0xff4a2a);
      return o.y + 0.12 + r * 0.82 + ah;
    }
    if (kind === 1) {
      // stepped ziggurat top with a small dome
      let y = o.y;
      for (let i = 0; i < 3; i++) {
        const s = 0.85 - i * 0.2;
        b.box(o.w * s, FL, o.d * s, { color: i % 2 ? p.wall : shade(p.wall, 1.08), mat: Mat.WindowSmall, x, z, y, top: p.roof });
        y += FL;
      }
      b.dome(r * 0.3, { color: p.roof, wSeg: 8, hSeg: 2, x, z, y });
      const sh = (0.3 + pr * 0.8) * tall;
      b.cyl(0.004, 0.02, sh, { color: 0xd9b070, mat: Mat.Metal, seg: 4, x, z, y: y + r * 0.3 });
      return y + r * 0.3 + sh;
    }
    // minaret with an onion dome and light rings
    const mh = (0.5 + pr * 0.9) * tall;
    b.cyl(r * 0.28, r * 0.34, mh, { color: p.wall, mat: Mat.WindowSmall, seg: 6, x, z, y: o.y, capTop: false });
    b.cyl(r * 0.45, r * 0.45, 0.03, { color: p.trim, seg: 6, x, z, y: o.y + mh * 0.6 });
    b.cyl(r * 0.46, r * 0.46, 0.012, { color: 0xffc890, mat: Mat.Light, seg: 6, x, z, y: o.y + mh * 0.6 - 0.012, capTop: false, ...DET });
    const rr = r * 0.34;
    b.lathe([[rr * 0.8, 0], [rr * 1.3, rr * 0.5], [rr, rr * 1.2], [0.01, rr * 2]], { color: p.roof, seg: 6, x, z, y: o.y + mh });
    return o.y + mh + rr * 2;
  }

  override balconies(rc: RC, o: FaceOpts): void {
    const { b, p } = rc;
    const every = o.every ?? 1;
    const dep = o.depth ?? 0.07;
    const cols = o.cols ?? 0;
    for (let f = Math.max(1, Math.ceil(o.y0 / FL)); f * FL <= o.y1; f += Math.max(every, cols > 0 ? 1 : 2)) {
      const y = f * FL;
      if (cols > 0) {
        if (!fits(rc, cols * 16)) return;
        const cw = o.w / cols;
        for (let c = 0; c < cols; c++) {
          const cx = -o.w / 2 + cw * (c + 0.5);
          b.box(cw * 0.6, 0.05, dep, { color: p.trim, x: cx, z: dep / 2, y, ...DET, paint: true });
          b.wedge(cw * 0.6, 0.05, dep, { color: (f + c) % 2 ? p.awning : 0xf6eee0, x: cx, z: dep / 2, y: y + 0.15, detail: true, paint: false });
        }
      } else if (fits(rc, 10)) b.box(o.w, 0.04, dep, { color: p.trim, z: dep / 2, y, ...DET, paint: true });
    }
  }

  protected override drawShopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    const n = Math.max(1, Math.min(3, Math.floor(o.w / 0.3)));
    const aw = o.w / n;
    // arcade: cream piers with glazed arches and fabric shades
    b.box(o.w, o.h * 0.9, 0.04, { color: shade(p.wall, 1.08), y: G, z: 0.015 });
    for (let i = 0; i < n; i++) {
      const cx = -o.w / 2 + aw * (i + 0.5);
      arch(b, aw * 0.7, o.h * 0.72, 0.012, { color: 0x5a7a9a, mat: Mat.Glass, x: cx, z: 0.035, y: G, seg: 3, paint: false });
      b.wedge(aw * 0.78, 0.05, 0.14, { color: i % 2 ? p.awning : 0xf6eee0, x: cx, y: o.h * 0.74, z: 0.11, paint: false, detail: true });
    }
    b.box(o.w * 0.92, 0.012, 0.012, { color: 0xffc890, mat: Mat.Light, y: o.h * 0.72, z: 0.06, paint: false });
    if (o.glyphs) glyphs(b, Math.min(o.w * 0.6, 0.55), 0.06, o.glyphs, rc.seed, { color: o.color ?? 0x4ad0ff, mat: Mat.Glow, y: o.h * 0.9 - 0.02, z: 0.04, paint: false });
  }

  protected override drawPortico(rc: RC, w: number, h: number): void {
    const { b, p } = rc;
    b.box(0.07, h, 0.07, { color: p.trim, x: -w / 2, z: 0.12, y: G });
    b.box(0.07, h, 0.07, { color: p.trim, x: w / 2, z: 0.12, y: G });
    b.group({ y: h - w * 0.25, z: 0.085 }, () => arch(b, w + 0.07, w * 0.5 + 0.06, 0.07, { color: p.trim, seg: 4 }));
    b.box(0.04, 0.04, 0.03, { color: 0xffc890, mat: Mat.Light, z: 0.16, y: h - 0.05, ...DET });
  }

  override bridge(rc: RC, x0: number, z0: number, x1: number, z1: number, y: number, h = FL * 2): void {
    const { b, p } = rc;
    const r = Math.min(0.1, h * 0.45);
    b.tube([[x0, y + r, z0], [x1, y + r, z1]], r, { color: 0xc8e4f0, mat: Mat.Glass, seg: 6, paint: false });
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const ry = Math.atan2(x1 - x0, z1 - z0);
    if (fits(rc, 36)) b.group({ x: mx, z: mz, y: y + r, ry, rx: Math.PI / 2 }, () => b.torus(r + 0.01, 0.015, { color: p.trim, seg: 6, tube: 3, ...DET, paint: true }));
  }

  override terrace(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w, 0.03, d, { color: p.pave, x, z, y, paint: false });
    if (rc.lo) return;
    if (!fits(rc, 26)) return;
    b.wedge(w * 0.6, 0.06, d * 0.6, { color: p.awning, x, z, y: y + 0.16, ...DET });
    for (const s of [-1, 1]) b.box(0.015, 0.16, 0.015, { color: p.trim, x: x + s * w * 0.28, z: z + d * 0.25, y, ...DET });
  }

  override roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    this.roof(rc, { x, z, y, w, d, kind: 'garden' });
  }

  protected override drawLamp(rc: RC, x: number, z: number, h: number): void {
    if (rc.lo) return;
    const { b, p } = rc;
    b.box(0.03, h, 0.03, { color: p.trim, x, z, y: G, ...DET });
    b.cone(0.04, 0.05, { color: 0xffc890, mat: Mat.Light, seg: 4, x, z, y: G + h, ...DET });
  }
}
