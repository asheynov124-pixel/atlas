/**
 * zoned-rc · Prismatic skin — faceted hexagonal & octagonal prisms of tinted glass, cut-gem roofs, glowing
 * seams and cores that shine from within, twisting stacked towers, floating crystals and shard gardens.
 */
import type { Rng } from '../../../../../core/rng';
import type { MeshBuilder, PartOpts } from '../../../../kit';
import { FL, G, Mat, chamferRect, glyphs, mix, ngon, tree, type V2 } from '../common';
import { DET, Skin, fits, type CrownOpts, type FaceOpts, type HouseOpts, type MassOpts, type Pal, type RC, type RoofOpts, type ShopOpts } from '../skin';

const GLOWS = [0xff9aff, 0x9affff, 0xffffff, 0xc89aff, 0xffd0f0];

/** Elongated hexagon (pointy ends on ±X). */
function hexLong(w: number, d: number): V2[] {
  return [[-w / 2, 0], [-w / 4, d / 2], [w / 4, d / 2], [w / 2, 0], [w / 4, -d / 2], [-w / 4, -d / 2]];
}

/** Cut-gem roof: one triangle per outline edge up to a central apex (flat shaded, outward facing). */
function facetRoof(b: MeshBuilder, poly: V2[], h: number, o: PartOpts): void {
  if (o.detail && b.lod === 1) return;
  const n = poly.length;
  let cx = 0, cz = 0;
  for (const [x, z] of poly) {
    cx += x / n;
    cz += z / n;
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i], c = poly[(i + 1) % n];
    const A = [a[0], 0, a[1]], C = [c[0], 0, c[1]], P = [cx, h, cz];
    // orientation: normal must point up/outwards
    const ux = C[0] - A[0], uz = C[2] - A[2], vx = P[0] - A[0], vz = P[2] - A[2];
    const ny = uz * vx - ux * vz;
    if (ny >= 0) b.tri(A, C, P, o, o.color, o.mat ?? Mat.Plain);
    else b.tri(C, A, P, o, o.color, o.mat ?? Mat.Plain);
  }
}

export class CrystalSkin extends Skin {
  readonly id = 'crystal' as const;
  readonly ground = 0xb7acd8;
  readonly pave = 0xdcd4f2;
  readonly plaza = 0xcdc3ea;
  readonly green = 0x6ab8a0;

  override palette(p: Pal, vr: Rng): Pal {
    p.accent = vr.pick(GLOWS);
    p.accent2 = vr.pick(GLOWS);
    p.glass = vr.pick([0xb8a8ff, 0xa8c8ff, 0xd0a8f0]);
    p.trim = vr.pick([0xffffff, 0x5a4a9a, 0x8a7ad0]);
    p.green2 = 0x8ad0c0;
    p.awning = p.accent;
    return p;
  }

  override outline(_rc: RC, w: number, d: number): V2[] | null {
    return chamferRect(w, d, Math.min(w, d) * 0.28);
  }

  override roundOutline(w: number, d: number): V2[] {
    return ngon(6, Math.min(w, d) / 2 / Math.cos(Math.PI / 6), Math.PI / 6);
  }

  protected override drawTree(rc: RC, x: number, z: number, s: number, y: number): void {
    tree(rc.b, x, z, s * 1.1, 'crystal', rc.rng.chance(0.5) ? rc.p.accent : mix(rc.p.glass, 0xffffff, 0.3), 0, y, false);
  }

  protected override drawLamp(rc: RC, x: number, z: number, h: number): void {
    if (rc.lo) return;
    const { b, p } = rc;
    b.box(0.014, h, 0.014, { color: 0xe8e0ff, x, z, y: G, ...DET });
    b.cone(0.025, 0.07, { color: p.accent, mat: Mat.Glow, seg: 4, x, z, y: G + h, flat: true, ...DET });
  }

  override house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const pr = o.prestige ?? 0;
    const h1 = FL + 0.03;
    const poly = hexLong(o.w, o.d);
    let top = 0;
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      b.extrude(poly, h1 - G, { color: o.color ?? p.wall, mat: Mat.Glass, y: G, top: p.roof });
      let y = h1;
      let roofPoly = hexLong(o.w + 0.06, o.d + 0.05);
      if (o.floors >= 2) {
        const up = ngon(6, Math.min(o.w, o.d) * 0.48, 0);
        b.extrude(up, FL + 0.01, { color: mix(o.color ?? p.wall, 0xffffff, 0.2), mat: Mat.Glass, y, top: p.roof });
        b.extrude(ngon(6, Math.min(o.w, o.d) * 0.5, 0), 0.012, { color: p.accent, mat: Mat.Glow, y: y - 0.006, paint: false });
        y += FL + 0.01;
        roofPoly = ngon(6, Math.min(o.w, o.d) * 0.53, 0);
      }
      const rh = Math.min(o.w, o.d) * (0.5 + pr * 0.2);
      facetRoof(b, roofPoly, rh, { color: p.roof, y });
      // the glowing core pierces the apex
      b.cone(0.045, 0.22 + pr * 0.2, { color: p.accent, mat: Mat.Glow, seg: 4, y: y + rh * 0.6, flat: true, paint: false });
      top = y + rh * 0.6 + 0.22 + pr * 0.2;
      if (o.door !== false) {
        b.box(0.08, 0.15, 0.02, { color: 0x2a2440, y: G, z: o.d / 2 + 0.004, paint: false });
        b.box(0.1, 0.01, 0.022, { color: p.accent, mat: Mat.Glow, y: G + 0.15, z: o.d / 2 + 0.004, paint: false });
      }
      if (pr > 0.5 && fits(rc, 16)) b.extrude(hexLong(o.w + 0.1, o.d + 0.1), 0.012, { color: p.accent2, mat: Mat.Glow, y: G, ...DET });
    });
    return (o.y ?? 0) + top;
  }

  override pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    const { b, p } = rc;
    b.extrude(ngon(6, r * 1.06, 0, x, z), 0.05, { color: p.trim, y });
    b.dome(r, { color: glass ? 0xe8e0ff : p.glass, mat: Mat.Glass, wSeg: 6, hSeg: 2, h, x, z, y: y + 0.05, flat: true });
    b.cone(0.04, 0.16, { color: p.accent, mat: Mat.Glow, seg: 4, x, z, y: y + 0.05 + h * 0.85, flat: true, paint: false });
    return y + 0.05 + h;
  }

  override block(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const col = o.use === 'office' ? p.glass : o.color ?? p.wall;
    this.shell(rc, o, Mat.Glass, col);
    const c = Math.min(o.w, o.d) * 0.28;
    // glowing seams on the street-facing chamfers + crown band
    for (const sx of [-1, 1]) b.box(0.016, o.h, 0.016, { color: p.accent, mat: Mat.Glow, x: x + sx * (o.w / 2 - c / 2), z: z + o.d / 2 - c / 2, y, ry: sx * Math.PI / 4, paint: false, detail: o.h < 0.5 });
    b.extrude(chamferRect(o.w + 0.03, o.d + 0.03, c + 0.01), 0.014, { color: p.accent2, mat: Mat.Glow, x, z, y: y + o.h - 0.03, paint: false });
  }

  override tower(rc: RC, o: MassOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? G;
    const seg = o.seg ?? 0;
    const poly = o.round ? this.roundOutline(o.w, o.d) : chamferRect(o.w, o.d, Math.min(o.w, o.d) * 0.3);
    const col = o.use === 'office' ? p.glass : seg % 2 ? mix(p.glass, 0xffffff, 0.25) : o.color ?? p.wall;
    b.group({ x, z, ry: seg * 0.26 }, () => {
      b.extrude(poly, o.h, { color: col, mat: Mat.Glass, y, top: p.roof });
      // glowing joint at the base of every segment — the light inside the crystal
      const j = o.round ? this.roundOutline(o.w + 0.03, o.d + 0.03) : chamferRect(o.w + 0.03, o.d + 0.03, Math.min(o.w, o.d) * 0.31);
      b.extrude(j, 0.04, { color: seg % 2 ? p.accent2 : p.accent, mat: Mat.Glow, y: y - 0.01, paint: false });
      if (o.h > 2.5 && !o.lite && fits(rc, 22)) b.extrude(j, 0.02, { color: p.accent, mat: Mat.Glow, y: y + o.h * 0.5, ...DET });
    });
  }

  override roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0, y = o.y;
    const m = Math.min(o.w, o.d);
    if (o.kind === 'garden' || o.kind === 'deck') {
      b.extrude(chamferRect(o.w * 0.9, o.d * 0.9, m * 0.25), 0.02, { color: p.pave, x, z, y, paint: false });
      this.tree(rc, x - o.w * 0.2, z, 0.9, y + 0.02);
      this.tree(rc, x + o.w * 0.25, z - o.d * 0.15, 0.7, y + 0.02);
      return;
    }
    const rh = m * (o.kind === 'pitched' ? 0.45 : 0.25);
    b.group({ x, z }, () => {
      facetRoof(b, chamferRect(o.w + 0.02, o.d + 0.02, m * 0.3), rh, { color: p.roof, y });
      b.cone(0.04, 0.18, { color: p.accent, mat: Mat.Glow, seg: 4, y: y + rh * 0.6, flat: true, ...DET });
    });
  }

  override crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    const pr = o.prestige;
    const tall = o.tall ?? 1;
    const r = Math.min(o.w, o.d) / 2;
    const kind = (o.kind ?? rc.seed) % 3;
    if (kind === 0) {
      // faceted spire + floating gem
      const sh = (0.9 + pr * 1.6) * tall;
      b.cone(r * 0.85, sh, { color: mix(p.glass, 0xffffff, 0.2), mat: Mat.Glass, seg: 6, x, z, y: o.y, flat: true });
      b.cone(r * 0.4, sh * 0.6, { color: p.accent, mat: Mat.Glow, seg: 6, x, z, y: o.y + sh * 0.3, flat: true, paint: false });
      const gy = o.y + sh + 0.12;
      b.cone(0.07, 0.1, { color: p.accent2, mat: Mat.Glow, seg: 4, x, z, y: gy, flat: true, paint: false });
      b.cone(0.07, 0.1, { color: p.accent2, mat: Mat.Glow, seg: 4, x, z, y: gy, rx: Math.PI, flat: true, paint: false });
      return gy + 0.1;
    }
    if (kind === 1) {
      // cluster of shards
      const hs = [1, 0.7, 0.55].map((k) => k * (0.6 + pr * 1.1) * tall);
      b.cone(r * 0.45, hs[0], { color: p.accent, mat: Mat.Glow, seg: 5, x, z, y: o.y, flat: true, paint: false });
      b.cone(r * 0.35, hs[1], { color: mix(p.glass, 0xffffff, 0.3), mat: Mat.Glass, seg: 5, x: x + r * 0.35, z: z - r * 0.15, y: o.y, rz: -0.25, flat: true });
      b.cone(r * 0.3, hs[2], { color: p.accent2, mat: Mat.Glow, seg: 5, x: x - r * 0.35, z: z + r * 0.2, y: o.y, rz: 0.3, rx: 0.15, flat: true, paint: false });
      return o.y + hs[0];
    }
    // halo + floating octahedron
    b.extrude(ngon(6, r * 0.8, 0, x, z), 0.08, { color: p.trim, y: o.y });
    const gy = o.y + (0.5 + pr * 0.6) * tall;
    const gs = r * 0.5;
    b.cone(gs, gs * 1.3, { color: p.accent, mat: Mat.Glow, seg: 4, x, z, y: gy, flat: true, paint: false });
    b.cone(gs, gs * 1.3, { color: p.accent, mat: Mat.Glow, seg: 4, x, z, y: gy, rx: Math.PI, flat: true, paint: false });
    b.cyl(r * 0.95, r * 0.95, 0.03, { color: p.accent2, mat: Mat.Glow, seg: 10, x, z, y: gy, rx: 0.4, capTop: false, paint: false });
    return gy + gs * 1.3;
  }

  override balconies(rc: RC, o: FaceOpts): void {
    const { b, p } = rc;
    const every = Math.max(o.every ?? 1, 2);
    const dep = o.depth ?? 0.06;
    for (let f = Math.max(1, Math.ceil(o.y0 / FL)); f * FL <= o.y1; f += every) {
      if (!fits(rc, 20)) return;
      b.box(o.w, 0.02, dep, { color: mix(p.glass, 0xffffff, 0.4), z: dep / 2, y: f * FL, ...DET, paint: true });
      b.box(o.w, 0.01, 0.01, { color: (f / every) % 2 ? p.accent : p.accent2, mat: Mat.Glow, z: dep, y: f * FL + 0.02, ...DET });
    }
  }

  protected override drawShopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    // raked crystal display wall
    b.wedge(o.w - 0.04, o.h * 0.75, 0.16, { color: mix(p.glass, 0xffffff, 0.35), mat: Mat.Glass, y: G, z: 0.08, ry: Math.PI, paint: false });
    b.box(o.w, 0.02, 0.2, { color: p.trim, y: o.h * 0.78, z: 0.1 });
    b.box(o.w, 0.012, 0.012, { color: p.accent, mat: Mat.Glow, y: o.h * 0.78 - 0.012, z: 0.2, paint: false });
    if (o.glyphs) glyphs(b, Math.min(o.w * 0.6, 0.55), 0.06, o.glyphs, rc.seed, { color: o.color ?? p.accent, mat: Mat.Glow, y: o.h * 0.78 + 0.03, z: 0.1, paint: false });
  }

  protected override drawPortico(rc: RC, w: number, h: number): void {
    const { b, p } = rc;
    for (const s of [-1, 1]) b.cyl(0.03, 0.05, h + 0.05, { color: mix(p.glass, 0xffffff, 0.3), mat: Mat.Glass, seg: 4, x: (s * w) / 2, z: 0.18, y: G, flat: true });
    b.box(w + 0.08, 0.025, 0.06, { color: p.accent, mat: Mat.Glow, y: h, z: 0.18, paint: false });
  }

  override bridge(rc: RC, x0: number, z0: number, x1: number, z1: number, y: number, h = FL * 2, w = 0.16): void {
    const { b, p } = rc;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    b.box(w, h, len, { color: mix(p.glass, 0xffffff, 0.3), mat: Mat.Glass, x: mx, z: mz, y, ry, top: p.trim });
    b.box(w * 0.6, 0.015, len, { color: p.accent, mat: Mat.Glow, x: mx, z: mz, y: y - 0.015, ry, paint: false });
  }

  override terrace(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w, 0.025, d, { color: p.pave, x, z, y, paint: false });
    this.tree(rc, x + w * 0.3, z, 0.6, y + 0.025);
  }

  override roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    this.roof(rc, { x, z, y, w, d, kind: 'garden' });
  }
}

