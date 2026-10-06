/**
 * zoned-rc · Classic skin — "Modern Classic": brick & stucco, gable/hip roofs, chimneys, cornices, water tanks,
 * art-deco setback crowns and striped awnings. The familiar Earth city, exported to the stars.
 */
import type { Rng } from '../../../../../core/rng';
import { FL, G, Mat, acUnit, antenna, hip, mix, ngon, planter, shade, storeys, waterTank, type V2 } from '../common';
import { DET, Skin, fits, type CrownOpts, type FaceOpts, type HouseOpts, type MassOpts, type Pal, type RC, type RoofOpts, type ShopOpts } from '../skin';

const SIDING = [0xf2ead8, 0xe6d2ae, 0xc9dae2, 0xb8705a, 0xf3e3c8, 0xd9c2a2, 0xb5c4a6, 0xe8cfc4, 0xa86450, 0xdcdcd2];
const DOORS = [0x9a2a2a, 0x2a4a7a, 0x2a5a3a, 0x3a2a22, 0x1e1e24];
const BRICK = 0x9a5446;

export class ClassicSkin extends Skin {
  readonly id = 'classic' as const;
  readonly ground = 0x82b45a;
  readonly pave = 0xcdc6b8;
  readonly plaza = 0xb9b1a3;
  readonly green = 0x4f9a3e;

  override palette(p: Pal, vr: Rng): Pal {
    p.wall2 = vr.pick(SIDING);
    p.trim2 = vr.pick(DOORS);
    p.green2 = 0x66a84a;
    p.awning = vr.pick([0xc0392b, 0x2e6da4, 0x2f8a55, 0xd88a2a, 0x7a3a8a]);
    return p;
  }

  override outline(): V2[] | null {
    return null;
  }

  override roundOutline(w: number, d: number): V2[] {
    return ngon(8, Math.min(w, d) / 2 / Math.cos(Math.PI / 8), Math.PI / 8);
  }

  override house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const h = storeys(o.floors);
    const kind = o.roof ?? 'gable';
    const pr = o.prestige ?? 0;
    const wall = o.color ?? p.wall2;
    const rh = Math.min(o.w, o.d) * (kind === 'shed' ? 0.22 : 0.46);
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      b.box(o.w + 0.03, 0.05, o.d + 0.03, { color: shade(wall, 0.62), y: 0 });
      b.box(o.w, h - G, o.d, { color: wall, mat: Mat.WindowSmall, y: G });
      if (kind === 'gable') b.gable(o.w, rh, o.d, { color: p.roof, y: h, overhang: 0.06 });
      else if (kind === 'hip') hip(b, o.w, rh * 0.85, o.d, { color: p.roof, y: h, overhang: 0.06 });
      else if (kind === 'front') b.gable(o.d, rh, o.w, { color: p.roof, y: h, overhang: 0.06, ry: Math.PI / 2 });
      else if (kind === 'shed') b.wedge(o.w + 0.1, rh, o.d + 0.1, { color: p.roof, y: h, ry: Math.PI });
      else b.box(o.w + 0.05, 0.04, o.d + 0.05, { color: p.trim, y: h });
      if (kind !== 'flat' && kind !== 'shed' && o.w > 0.4 && fits(rc, 10))
        b.box(0.075, rh * 0.75 + 0.08, 0.075, { color: BRICK, x: o.w * 0.28, z: -o.d * 0.16, y: h + rh * 0.3, ...DET });
      if (o.door !== false) {
        b.box(0.1, 0.16, 0.02, { color: p.trim2, y: G, z: o.d / 2 + 0.004, paint: false });
        b.box(0.03, 0.03, 0.02, { color: 0xffd890, mat: Mat.Light, y: 0.2, x: 0.08, z: o.d / 2 + 0.01, ...DET });
      }
      if (pr > 0.2 && o.w > 0.5 && fits(rc, 30)) {
        // porch with a little roof and two posts
        b.box(o.w * 0.5, 0.025, 0.15, { color: p.trim, y: FL - 0.005, z: o.d / 2 + 0.075 });
        b.box(0.02, FL - 0.03, 0.02, { color: 0xffffff, x: -o.w * 0.23, z: o.d / 2 + 0.14, y: G, ...DET });
        b.box(0.02, FL - 0.03, 0.02, { color: 0xffffff, x: o.w * 0.23, z: o.d / 2 + 0.14, y: G, ...DET });
      }
      if (pr > 0.55 && o.floors >= 2 && o.w > 0.55 && fits(rc, 10)) {
        // bay window
        b.box(0.22, FL * 1.6, 0.08, { color: p.trim, mat: Mat.WindowSmall, x: -o.w * 0.28, z: o.d / 2 + 0.04, y: G + 0.02, ...DET });
      }
    });
    return (o.y ?? 0) + h + (kind === 'flat' ? 0.04 : rh);
  }

  override pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    const { b, p } = rc;
    if (glass) {
      // white-framed conservatory
      b.cyl(r * 1.02, r * 1.04, 0.07, { color: 0xf4f2ec, seg: 8, x, z, y, capTop: false });
      b.dome(r, { color: 0xf4f4f0, mat: Mat.Glass, wSeg: 8, hSeg: 3, h, x, z, y: y + 0.07, flat: true });
      return y + 0.07 + h;
    }
    // round brick-and-render house under a slate dome
    const dh = Math.max(0.16, h * 0.55);
    b.cyl(r, r * 1.03, dh, { color: p.wall2, mat: Mat.WindowSmall, seg: 9, x, z, y, capTop: false });
    b.dome(r * 1.04, { color: p.roof, wSeg: 9, hSeg: 3, h: h * 0.7, x, z, y: y + dh });
    if (fits(rc, 20)) {
      b.box(0.1, 0.15, 0.04, { color: p.trim2, x, z: z + r * 0.98, y, ...DET });
      b.box(0.06, h * 0.5, 0.06, { color: BRICK, x: x + r * 0.45, z: z - r * 0.2, y: y + dh + h * 0.25, ...DET });
    }
    return y + dh + h * 0.7;
  }

  override block(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const wall = o.color ?? p.wall;
    const office = o.use === 'office';
    b.box(o.w, o.h, o.d, { color: wall, mat: office ? Mat.Glass : Mat.Window, x, z, y, top: p.roof });
    if (o.h > FL * 2.5 && !office) b.box(o.w + 0.025, FL - 0.01, o.d + 0.025, { color: shade(wall, 0.8), mat: Mat.Window, x, z, y });
    b.box(o.w + 0.06, 0.04, o.d + 0.06, { color: p.trim, x, z, y: y + o.h - 0.02 });
    if ((o.prestige ?? 0) > 0.4 && o.h > 1)
      for (let f = 4; f * FL < o.h - 0.3 && fits(rc, 10); f += 4) b.box(o.w + 0.03, 0.025, o.d + 0.03, { color: p.trim, x, z, y: f * FL - 0.012, ...DET });
  }

  override tower(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const glassy = o.use === 'office' || (rc.seed % 3 === 0 && (o.prestige ?? 0) > 0.5);
    const wall = o.color ?? p.wall;
    this.shell(rc, o, glassy ? Mat.Glass : Mat.Window, glassy ? p.glass : wall);
    if (o.round) {
      const poly = this.roundOutline(o.w + 0.05, o.d + 0.05);
      b.extrude(poly, 0.05, { color: p.trim, x, z, y: y + o.h - 0.03 });
      return;
    }
    // art-deco pilasters on the street face + cornice
    if (!glassy && o.h > 1.2 && !o.lite && fits(rc, 20)) {
      for (const sx of [-0.5, 0.5]) b.box(0.05, o.h, 0.04, { color: shade(wall, 1.12), x: x + sx * (o.w - 0.05), z: z + o.d / 2, y, ...DET });
    }
    b.box(o.w + 0.05, 0.05, o.d + 0.05, { color: p.trim, x, z, y: y + o.h - 0.03 });
  }

  override roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    if (o.kind === 'pitched') {
      if (o.d > o.w * 1.2) b.gable(o.d, Math.min(o.w, o.d) * 0.55, o.w, { color: p.roof, x, z, y: o.y + 0.02, overhang: 0.03, ry: Math.PI / 2 });
      else hip(b, o.w, Math.min(o.w, o.d) * 0.3, o.d, { color: p.roof, x, z, y: o.y + 0.02, overhang: 0.03 });
      // dormers
      if (o.w > 0.5 && fits(rc, 20)) {
        b.box(0.14, 0.1, 0.1, { color: p.trim, mat: Mat.WindowSmall, x: x - o.w * 0.2, z: z + o.d * 0.33, y: o.y + 0.03, ...DET });
        b.box(0.14, 0.1, 0.1, { color: p.trim, mat: Mat.WindowSmall, x: x + o.w * 0.2, z: z + o.d * 0.33, y: o.y + 0.03, ...DET });
      }
      return;
    }
    const y = o.y + 0.02;
    if (o.kind === 'garden' || o.kind === 'deck') {
      this.roofGarden(rc, x, z, y, o.w, o.d);
      return;
    }
    b.box(0.2, 0.14, 0.18, { color: shade(p.wall, 0.85), x: x - o.w * 0.25, z: z - o.d * 0.18, y });
    if (rc.seed % 2 === 0 && fits(rc, 34)) waterTank(b, x + o.w * 0.22, y, z - o.d * 0.12, Math.min(1.1, o.w * 1.1));
    else if (fits(rc, 10)) acUnit(b, x + o.w * 0.2, y, z - o.d * 0.1, 1.2);
    if (fits(rc, 10)) acUnit(b, x + o.w * 0.15, y, z + o.d * 0.22);
  }

  override crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    const pr = o.prestige;
    const metal = pr > 0.7 ? this.gold : 0xb8bcc4;
    const kind = (o.kind ?? rc.seed) % 3;
    let y = o.y;
    if (kind === 0) {
      // stepped art-deco crown + needle
      const steps = pr > 0.5 ? 3 : 2;
      for (let i = 0; i < steps; i++) {
        const s = 0.82 - i * 0.18;
        b.box(o.w * s, FL * 1.5, o.d * s, { color: i === steps - 1 ? metal : p.wall, mat: i === steps - 1 ? Mat.Metal : Mat.Window, x, z, y });
        if (fits(rc, 10)) b.box(o.w * s + 0.03, 0.025, o.d * s + 0.03, { color: p.trim, x, z, y: y + FL * 1.5 - 0.01, ...DET });
        y += FL * 1.5;
      }
      const sh = (0.5 + pr * 1.4) * (o.tall ?? 1);
      b.pyramid(o.w * 0.3, sh * 0.35, o.d * 0.3, { color: metal, mat: Mat.Metal, x, z, y });
      b.cyl(0.004, 0.025, sh, { color: metal, mat: Mat.Metal, seg: 4, x, z, y });
      if (pr > 0.6) b.box(o.w * 0.5, 0.02, o.d * 0.5, { color: 0xffe0a0, mat: Mat.Light, x, z, y: y - 0.03 });
      b.box(0.03, 0.03, 0.03, { color: 0xff3030, mat: Mat.Light, x, z, y: y + sh, ...DET });
      return y + sh;
    }
    if (kind === 1) {
      // copper château roof with lantern
      const ch = Math.min(o.w, o.d) * (0.7 + pr * 0.5);
      hip(b, o.w * 0.92, ch, o.d * 0.92, { color: 0x5aa58a, mat: Mat.Metal, x, z, y, overhang: 0.02 });
      b.box(0.12, 0.14, 0.12, { color: 0xfff0c0, mat: Mat.Light, x, z, y: y + ch * 0.8 });
      antenna(b, x, y + ch * 0.8 + 0.14, z, 0.2 + pr * 0.4);
      return y + ch + 0.6;
    }
    // chrysler-ish nested crown with lit chevrons
    for (let i = 0; i < 3; i++) {
      const s = 0.85 - i * 0.22;
      const hh = 0.28 + pr * 0.12;
      b.pyramid(o.w * s, hh * 1.6, o.d * s, { color: metal, mat: Mat.Metal, x, z, y });
      b.box(o.w * s * 0.9, 0.018, 0.012, { color: 0xffe6a0, mat: Mat.Light, x, z: z + (o.d * s) / 2 - 0.01, y: y + 0.03, ...DET });
      y += hh;
    }
    const sh = (0.4 + pr) * (o.tall ?? 1);
    b.cyl(0.004, 0.02, sh, { color: metal, mat: Mat.Metal, seg: 4, x, z, y: y + 0.15 });
    return y + 0.15 + sh;
  }

  override balconies(rc: RC, o: FaceOpts): void {
    const { b, p } = rc;
    const every = o.every ?? 1;
    const dep = o.depth ?? 0.06;
    const cols = o.cols ?? 0;
    for (let f = Math.max(1, Math.ceil(o.y0 / FL)); f * FL <= o.y1; f += every) {
      const y = f * FL + 0.005;
      if (cols > 0) {
        if (!fits(rc, cols * 10)) return;
        const cw = o.w / cols;
        for (let c = 0; c < cols; c++) b.box(cw * 0.62, 0.055, dep, { color: 0x2a2a30, x: -o.w / 2 + cw * (c + 0.5), z: dep / 2, y, ...DET });
      } else {
        if (!fits(rc, 20)) return;
        b.box(o.w, 0.02, dep, { color: p.trim, z: dep / 2, y, ...DET });
        b.box(o.w, 0.05, 0.01, { color: 0x2a2a30, z: dep, y: y + 0.02, ...DET });
      }
    }
  }

  override shopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    const w = o.w;
    const sh = o.h;
    b.box(w - 0.04, sh * 0.7, 0.03, { color: 0xdedad2, mat: Mat.Glass, y: G, z: 0.012, paint: false });
    // pilasters + fascia
    b.box(0.04, sh, 0.05, { color: p.trim, x: -w / 2 + 0.02, y: G, z: 0.02 });
    b.box(0.04, sh, 0.05, { color: p.trim, x: w / 2 - 0.02, y: G, z: 0.02 });
    b.box(w, 0.08, 0.05, { color: shade(p.awning, 0.55), y: sh - 0.04, z: 0.02, paint: false });
    b.box(w - 0.08, 0.014, 0.012, { color: 0xffe2a8, mat: Mat.Light, y: sh * 0.72 - 0.02, z: 0.04, paint: false });
    // striped awning: one canvas slab + painted stripes on its top surface
    const n = o.kind === 'big' ? 5 : 7;
    const aw = w - 0.06;
    const sw = aw / n;
    b.group({ y: sh * 0.72, z: 0.085, rx: 0.42 }, () => {
      b.box(aw, 0.012, 0.17, { color: 0xf4efe6, paint: false });
      if (!rc.lo) for (let i = 0; i < n; i += 2) b.plane(sw, 0.17, { color: p.awning, x: -aw / 2 + sw * (i + 0.5), y: 0.0125, paint: false });
    });
    if (o.glyphs) this.sign(rc, { w: Math.min(w * 0.72, 0.62), h: 0.065, kind: 'board', n: o.glyphs, color: o.color ?? 0xffd27a }, 0, sh - 0.035, 0.045);
  }

  override roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w * 0.86, 0.025, d * 0.86, { color: 0x8a8278, paint: false, x, z, y });
    if (!fits(rc, 52)) return;
    planter(b, x - w * 0.3, y + 0.025, z, 0.1, d * 0.6, 0x7a5a48, p.green);
    planter(b, x + w * 0.3, y + 0.025, z, 0.1, d * 0.6, 0x7a5a48, p.green2);
    b.cone(0.1, 0.06, { color: mix(p.awning, 0xffffff, 0.3), seg: 6, x, z, y: y + 0.12, ...DET });
  }
}
