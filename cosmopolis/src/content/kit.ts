/**
 * MeshBuilder — the procedural geometry kit used by every building / prop / vehicle factory.
 *
 * Space: +Y up, +Z forward (the side that faces the road), origin = centre of the footprint on the ground.
 * Units: world units (1 ≈ 20 m). A single tile fits a circle of radius ≈ 0.92 (see FOOTPRINT_RADIUS).
 * Box / cylinder / cone / prism / pyramid / roof primitives take `y` as their BOTTOM; sphere takes `y` as centre;
 * dome / torus take `y` as their base plane.
 *
 * Every vertex carries: position, normal, color (linear), uv (world-unit facade coords), aMat (material channel).
 * The shared building material (render/materials.ts) turns aMat into windows, neon, solar panels, holograms...
 *
 * Triangle budgets (LOD0): small props ≤ 150, zoned buildings ≤ 400, ploppables ≤ 1500, wonders ≤ 6000.
 * At LOD1 (`b.lod === 1`) parts flagged `detail: true` are skipped and curved segment counts are halved.
 */
import { BufferAttribute, BufferGeometry, Color, Euler, Matrix3, Matrix4, ShapeUtils, Vector2, Vector3 } from 'three';

/** Material channels understood by the shared building shader. */
export const Mat = {
  /** plain lit surface */
  Plain: 0,
  /** facade with procedural window grid (lit at night) */
  Window: 1,
  /** always-emissive neon / light strip (uses vertex colour) */
  Glow: 2,
  /** shiny metal */
  Metal: 3,
  /** emissive only at night (lamps, beacons) */
  Light: 4,
  /** glass curtain wall: reflective by day, dense lit floors by night */
  Glass: 5,
  /** solar panel: dark blue with cell grid + sun glint */
  Solar: 6,
  /** foliage: gentle wind sway + soft translucency */
  Foliage: 7,
  /** animated water (fountains, pools) */
  Water: 8,
  /** hologram: flickering scanlines, emissive */
  Holo: 9,
  /** lava / fire / plasma: animated emissive */
  Lava: 10,
  /** animated billboard screen (cycling ad colours) */
  Screen: 11,
  /** small windows (houses, industry): sparser grid */
  WindowSmall: 12,
} as const;
export type MatId = (typeof Mat)[keyof typeof Mat];

const PAINTABLE_DEFAULT = new Set<number>([Mat.Plain, Mat.Window, Mat.Metal, Mat.WindowSmall]);

/** Usable radius (world units) for each footprint size. */
export const FOOTPRINT_RADIUS: Record<1 | 7 | 19, number> = { 1: 0.92, 7: 2.5, 19: 4.3 };

export interface PartOpts {
  /** 0xRRGGBB (sRGB) */
  color: number;
  mat?: MatId;
  /** paintable by the tint tool (default true for Plain / Window / WindowSmall / Metal) */
  paint?: boolean;
  /** skipped at LOD1 */
  detail?: boolean;
  x?: number;
  y?: number;
  z?: number;
  /** euler rotation radians (XYZ) */
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** faceted normals for curved primitives */
  flat?: boolean;
}

export interface BoxOpts extends PartOpts {
  /** colour of the top face (roof); default = color */
  top?: number;
  /** material of the top face; default Plain (or Glow/Solar if you want) */
  topMat?: MatId;
  /** emit the bottom face too (for floating parts) */
  bottom?: boolean;
}

export interface CylOpts extends PartOpts {
  seg?: number;
  /** caps: default both true */
  capTop?: boolean;
  capBottom?: boolean;
  top?: number;
  topMat?: MatId;
  /** partial cylinder (radians) */
  arc?: number;
}

export interface SphereOpts extends PartOpts {
  wSeg?: number;
  hSeg?: number;
  /** 0..π: π = full sphere */
  thetaLength?: number;
}

export interface TorusOpts extends PartOpts {
  seg?: number;
  tube?: number;
  arc?: number;
}

interface Part {
  pos: number[];
  nrm: number[];
  uv: number[];
  idx: number[];
}

const _m = new Matrix4();
const _m2 = new Matrix4();
const _nm = new Matrix3();
const _v = new Vector3();
const _e = new Euler();
const _q = new Vector3();
const _col = new Color();

export class MeshBuilder {
  readonly lod: 0 | 1;
  private P: number[] = [];
  private N: number[] = [];
  private C: number[] = [];
  private U: number[] = [];
  private M: number[] = [];
  private I: number[] = [];
  private stack: Matrix4[] = [new Matrix4()];

  constructor(lod: 0 | 1 = 0) {
    this.lod = lod;
  }

  // ───────────────────────────── transform stack
  /** Push a transform (applies to all following parts until pop). */
  push(t: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; s?: number; sx?: number; sy?: number; sz?: number }): this {
    const top = this.stack[this.stack.length - 1];
    const m = new Matrix4();
    _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    m.makeRotationFromEuler(_e);
    const s = t.s ?? 1;
    m.scale(_q.set((t.sx ?? 1) * s, (t.sy ?? 1) * s, (t.sz ?? 1) * s));
    m.setPosition(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    this.stack.push(top.clone().multiply(m));
    return this;
  }
  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  /** Run fn with a pushed transform. */
  group(t: Parameters<MeshBuilder['push']>[0], fn: () => void): this {
    this.push(t);
    try {
      fn();
    } finally {
      this.pop();
    }
    return this;
  }
  /** Segment count adjusted for LOD. */
  seg(n: number): number {
    return this.lod === 1 ? Math.max(3, Math.round(n / 2)) : n;
  }

  // ───────────────────────────── primitives

  /** Axis-aligned box, bottom at y. */
  box(w: number, h: number, d: number, o: BoxOpts): this {
    if (this.skip(o)) return this;
    const hw = w / 2, hd = d / 2;
    const sideMat = o.mat ?? Mat.Plain;
    const topMat = o.topMat ?? (sideMat === Mat.Window || sideMat === Mat.Glass || sideMat === Mat.WindowSmall ? Mat.Plain : sideMat);
    const topCol = o.top ?? o.color;
    // faces: [normal, corners (ccw from outside), uAxis length, color, mat]
    const quads: [number[], number[][], number, number, number][] = [
      [[0, 0, 1], [[-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd]], w, o.color, sideMat],
      [[0, 0, -1], [[hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd]], w, o.color, sideMat],
      [[1, 0, 0], [[hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd]], d, o.color, sideMat],
      [[-1, 0, 0], [[-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd]], d, o.color, sideMat],
      [[0, 1, 0], [[-hw, h, hd], [hw, h, hd], [hw, h, -hd], [-hw, h, -hd]], w, topCol, topMat],
    ];
    if (o.bottom) quads.push([[0, -1, 0], [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]], w, o.color, Mat.Plain]);
    for (const [n, c, ulen, col, mat] of quads) {
      const part: Part = { pos: [], nrm: [], uv: [], idx: [0, 1, 2, 0, 2, 3] };
      for (let k = 0; k < 4; k++) {
        part.pos.push(c[k][0], c[k][1], c[k][2]);
        part.nrm.push(n[0], n[1], n[2]);
        const isTop = n[1] !== 0;
        const u = isTop ? c[k][0] + hw : k === 0 || k === 3 ? 0 : ulen;
        const v = isTop ? c[k][2] + hd : c[k][1];
        part.uv.push(u, v);
      }
      this.emit(part, o, col, mat);
    }
    return this;
  }

  /** Cylinder / frustum, bottom at y. rTop may be 0 (cone). */
  cyl(rTop: number, rBottom: number, h: number, o: CylOpts): this {
    if (this.skip(o)) return this;
    const seg = this.seg(o.seg ?? 12);
    const arc = o.arc ?? Math.PI * 2;
    const mat = o.mat ?? Mat.Plain;
    const flat = o.flat ?? seg <= 8;
    const side: Part = { pos: [], nrm: [], uv: [], idx: [] };
    const slope = (rBottom - rTop) / h;
    const avgR = (rTop + rBottom) / 2;
    if (flat) {
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * arc, a1 = ((s + 1) / seg) * arc;
        const am = (a0 + a1) / 2;
        const nx = Math.sin(am), nz = Math.cos(am);
        const nl = Math.hypot(1, slope);
        const base = side.pos.length / 3;
        const pts = [
          [Math.sin(a0) * rBottom, 0, Math.cos(a0) * rBottom, 0, 0],
          [Math.sin(a1) * rBottom, 0, Math.cos(a1) * rBottom, (a1 - a0) * avgR, 0],
          [Math.sin(a1) * rTop, h, Math.cos(a1) * rTop, (a1 - a0) * avgR, h],
          [Math.sin(a0) * rTop, h, Math.cos(a0) * rTop, 0, h],
        ];
        for (const p of pts) {
          side.pos.push(p[0], p[1], p[2]);
          side.nrm.push(nx / nl, slope / nl, nz / nl);
          side.uv.push(p[3] + a0 * avgR, p[4]);
        }
        side.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    } else {
      const nl = Math.hypot(1, slope);
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * arc;
        const sx = Math.sin(a), cz = Math.cos(a);
        side.pos.push(sx * rBottom, 0, cz * rBottom, sx * rTop, h, cz * rTop);
        side.nrm.push(sx / nl, slope / nl, cz / nl, sx / nl, slope / nl, cz / nl);
        side.uv.push(a * avgR, 0, a * avgR, h);
        if (s < seg) {
          const b = s * 2;
          side.idx.push(b, b + 2, b + 3, b, b + 3, b + 1);
        }
      }
    }
    this.emit(side, o, o.color, mat);
    const capMat = o.topMat ?? (mat === Mat.Window || mat === Mat.Glass || mat === Mat.WindowSmall ? Mat.Plain : mat);
    if ((o.capTop ?? true) && rTop > 0) this.disc(rTop, h, seg, arc, true, o, o.top ?? o.color, capMat);
    if ((o.capBottom ?? false) && rBottom > 0) this.disc(rBottom, 0, seg, arc, false, o, o.color, capMat);
    return this;
  }

  /** Cone, bottom at y. */
  cone(r: number, h: number, o: CylOpts): this {
    return this.cyl(0, r, h, { capTop: false, ...o });
  }

  /** n-sided prism (faceted), bottom at y. */
  prism(sides: number, r: number, h: number, o: CylOpts): this {
    return this.cyl(r, r, h, { ...o, seg: sides, flat: true });
  }

  /** Square pyramid, bottom at y. */
  pyramid(w: number, h: number, d: number, o: PartOpts): this {
    if (this.skip(o)) return this;
    const hw = w / 2, hd = d / 2;
    const apex = [0, h, 0];
    const base = [[-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd]];
    for (let k = 0; k < 4; k++) {
      const a = base[k], b = base[(k + 1) % 4];
      this.tri(a, b, apex, o, o.color, o.mat ?? Mat.Plain);
    }
    return this;
  }

  /** Gable roof (triangular prism). Ridge runs along X. Bottom at y. */
  gable(w: number, h: number, d: number, o: PartOpts & { overhang?: number }): this {
    if (this.skip(o)) return this;
    const ov = o.overhang ?? 0.04;
    const hw = w / 2 + ov, hd = d / 2 + ov;
    const mat = o.mat ?? Mat.Plain;
    // two slopes
    this.quad([-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0], o, o.color, mat);
    this.quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, h, 0], o, o.color, mat);
    // gable ends
    this.tri([hw, 0, hd], [hw, 0, -hd], [hw, h, 0], o, o.color, mat);
    this.tri([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0], o, o.color, mat);
    return this;
  }

  /** Ramp / wedge: full height at -Z, zero at +Z. Bottom at y. */
  wedge(w: number, h: number, d: number, o: PartOpts): this {
    if (this.skip(o)) return this;
    const hw = w / 2, hd = d / 2;
    const mat = o.mat ?? Mat.Plain;
    this.quad([-hw, 0, hd], [hw, 0, hd], [hw, h, -hd], [-hw, h, -hd], o, o.color, mat);
    this.quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd], o, o.color, mat);
    this.tri([hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], o, o.color, mat);
    this.tri([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, -hd], o, o.color, mat);
    return this;
  }

  /** UV sphere centred at y. thetaLength π/2 = upper hemisphere. */
  sphere(r: number, o: SphereOpts): this {
    if (this.skip(o)) return this;
    const ws = this.seg(o.wSeg ?? 12), hs = this.seg(o.hSeg ?? 8);
    const tl = o.thetaLength ?? Math.PI;
    const p: Part = { pos: [], nrm: [], uv: [], idx: [] };
    for (let y = 0; y <= hs; y++) {
      const th = (y / hs) * tl;
      for (let x = 0; x <= ws; x++) {
        const ph = (x / ws) * Math.PI * 2;
        const nx = Math.sin(th) * Math.sin(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.cos(ph);
        p.pos.push(nx * r, ny * r, nz * r);
        p.nrm.push(nx, ny, nz);
        p.uv.push(ph * r, (1 - y / hs) * r * 2);
      }
    }
    for (let y = 0; y < hs; y++)
      for (let x = 0; x < ws; x++) {
        const a = y * (ws + 1) + x, b = a + ws + 1;
        if (y !== 0) p.idx.push(a, b, a + 1);
        if (y !== hs - 1 || tl < Math.PI) p.idx.push(a + 1, b, b + 1);
      }
    if (o.flat) flatten(p);
    this.emit(p, o, o.color, o.mat ?? Mat.Plain);
    return this;
  }

  /** Hemisphere dome with base at y. `h` scales height (default = r). */
  dome(r: number, o: SphereOpts & { h?: number }): this {
    const h = o.h ?? r;
    return this.sphere(r, { ...o, thetaLength: Math.PI / 2, sy: (o.sy ?? 1) * (h / r) });
  }

  /** Torus lying flat (axis = Y), centred at y. */
  torus(R: number, r: number, o: TorusOpts): this {
    if (this.skip(o)) return this;
    const seg = this.seg(o.seg ?? 24), tube = this.seg(o.tube ?? 8);
    const arc = o.arc ?? Math.PI * 2;
    const p: Part = { pos: [], nrm: [], uv: [], idx: [] };
    for (let j = 0; j <= tube; j++) {
      const v = (j / tube) * Math.PI * 2;
      for (let i = 0; i <= seg; i++) {
        const u = (i / seg) * arc;
        const cx = Math.sin(u) * R, cz = Math.cos(u) * R;
        const nx = Math.sin(u) * Math.cos(v), ny = Math.sin(v), nz = Math.cos(u) * Math.cos(v);
        p.pos.push(cx + nx * r, ny * r, cz + nz * r);
        p.nrm.push(nx, ny, nz);
        p.uv.push(u * R, v * r);
      }
    }
    for (let j = 0; j < tube; j++)
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i, b = a + seg + 1;
        p.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    if (o.flat) flatten(p);
    this.emit(p, o, o.color, o.mat ?? Mat.Plain);
    return this;
  }

  /** Surface of revolution of profile points [radius, y] (bottom → top). */
  lathe(profile: [number, number][], o: CylOpts): this {
    if (this.skip(o)) return this;
    const seg = this.seg(o.seg ?? 16);
    const arc = o.arc ?? Math.PI * 2;
    const p: Part = { pos: [], nrm: [], uv: [], idx: [] };
    const n = profile.length;
    // profile normals (2D, outward)
    const pn: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a = profile[Math.max(0, k - 1)], b = profile[Math.min(n - 1, k + 1)];
      const dr = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dr, dy) || 1;
      pn.push([dy / l, -dr / l]);
    }
    let vacc = 0;
    const vs: number[] = [0];
    for (let k = 1; k < n; k++) vs.push((vacc += Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1])));
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * arc;
      const sx = Math.sin(a), cz = Math.cos(a);
      for (let k = 0; k < n; k++) {
        const [r, y] = profile[k];
        p.pos.push(sx * r, y, cz * r);
        p.nrm.push(sx * pn[k][0], pn[k][1], cz * pn[k][0]);
        p.uv.push(a * Math.max(r, 0.05), y);
      }
    }
    for (let s = 0; s < seg; s++)
      for (let k = 0; k < n - 1; k++) {
        const a = s * n + k, b = (s + 1) * n + k;
        p.idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    if (o.flat) flatten(p);
    this.emit(p, o, o.color, o.mat ?? Mat.Plain);
    return this;
  }

  /** Vertical extrusion of a simple polygon [x, z][] (CCW seen from above), bottom at y. */
  extrude(poly: [number, number][], h: number, o: BoxOpts): this {
    if (this.skip(o)) return this;
    const mat = o.mat ?? Mat.Plain;
    const n = poly.length;
    let cx = 0, cz = 0;
    for (const [px, pz] of poly) {
      cx += px / n;
      cz += pz / n;
    }
    let uacc = 0;
    for (let k = 0; k < n; k++) {
      const a = poly[k], b = poly[(k + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let nx = (b[1] - a[1]) / (len || 1), nz = -(b[0] - a[0]) / (len || 1);
      // make the normal point away from the centroid (works for convex / star-shaped outlines)
      if (((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const part: Part = {
        pos: [a[0], 0, a[1], b[0], 0, b[1], b[0], h, b[1], a[0], h, a[1]],
        nrm: [nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz],
        uv: [uacc, 0, uacc + len, 0, uacc + len, h, uacc, h],
        idx: [0, 2, 1, 0, 3, 2],
      };
      // ensure outward winding: test with normal vs centroid
      this.emitOriented(part, o, o.color, mat, [nx, 0, nz]);
      uacc += len;
    }
    // top cap
    const contour = poly.map(([x, z]) => new Vector2(x, z));
    const faces = ShapeUtils.triangulateShape(contour, []);
    const top: Part = { pos: [], nrm: [], uv: [], idx: [] };
    for (const [x, z] of poly) {
      top.pos.push(x, h, z);
      top.nrm.push(0, 1, 0);
      top.uv.push(x, z);
    }
    for (const f of faces) top.idx.push(f[0], f[1], f[2]);
    this.emitOriented(top, o, o.top ?? o.color, o.topMat ?? (mat === Mat.Window || mat === Mat.Glass || mat === Mat.WindowSmall ? Mat.Plain : mat), [0, 1, 0]);
    return this;
  }

  /** Tube of radius r along a polyline of points [x,y,z]. */
  tube(path: [number, number, number][], r: number, o: CylOpts): this {
    if (this.skip(o)) return this;
    for (let k = 0; k < path.length - 1; k++) {
      const a = new Vector3(...path[k]), b = new Vector3(...path[k + 1]);
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 1e-5) continue;
      dir.normalize();
      // rotation taking +Y to dir
      const q = new Matrix4();
      const up = new Vector3(0, 1, 0);
      const axis = up.clone().cross(dir);
      const ang = Math.acos(Math.max(-1, Math.min(1, up.dot(dir))));
      if (axis.lengthSq() < 1e-8) q.makeRotationX(dir.y > 0 ? 0 : Math.PI);
      else q.makeRotationAxis(axis.normalize(), ang);
      q.setPosition(a);
      this.stack.push(this.stack[this.stack.length - 1].clone().multiply(q));
      this.cyl(r, r, len, { ...o, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, capTop: k === path.length - 2, capBottom: k === 0 });
      this.stack.pop();
    }
    return this;
  }

  /** Horizontal quad facing up at height y. */
  plane(w: number, d: number, o: PartOpts): this {
    if (this.skip(o)) return this;
    const hw = w / 2, hd = d / 2;
    this.quad([-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd], o, o.color, o.mat ?? Mat.Plain);
    return this;
  }

  /** Vertical quad (billboard / sign) facing +Z, bottom at y. Double-sided if `both`. */
  panel(w: number, h: number, o: PartOpts & { both?: boolean }): this {
    if (this.skip(o)) return this;
    const hw = w / 2;
    this.quad([-hw, 0, 0], [hw, 0, 0], [hw, h, 0], [-hw, h, 0], o, o.color, o.mat ?? Mat.Plain);
    if (o.both) this.quad([hw, 0, 0], [-hw, 0, 0], [-hw, h, 0], [hw, h, 0], o, o.color, o.mat ?? Mat.Plain);
    return this;
  }

  /** Add any three.js BufferGeometry (positions/normals; uv optional). */
  geometry(geo: BufferGeometry, o: PartOpts): this {
    if (this.skip(o)) return this;
    const g = geo;
    const pos = g.getAttribute('position');
    let nrm = g.getAttribute('normal');
    if (!nrm) {
      g.computeVertexNormals();
      nrm = g.getAttribute('normal');
    }
    const uv = g.getAttribute('uv');
    const p: Part = { pos: [], nrm: [], uv: [], idx: [] };
    for (let i = 0; i < pos.count; i++) {
      p.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      p.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      if (uv) p.uv.push(uv.getX(i), uv.getY(i));
      else p.uv.push(pos.getX(i) + pos.getZ(i), pos.getY(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) p.idx.push(g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) p.idx.push(i);
    if (o.flat) flatten(p);
    this.emit(p, o, o.color, o.mat ?? Mat.Plain);
    return this;
  }

  /** Low-level: one triangle (CCW from outside). */
  tri(a: number[], b: number[], c: number[], o: PartOpts, color: number, mat: number): this {
    const n = faceNormal(a, b, c);
    const ux = Math.hypot(b[0] - a[0], b[2] - a[2]);
    this.emit({ pos: [...a, ...b, ...c], nrm: [...n, ...n, ...n], uv: [0, a[1], ux, b[1], ux * 0.5, c[1]], idx: [0, 1, 2] }, o, color, mat);
    return this;
  }

  /** Low-level: one quad a,b,c,d (CCW from outside). */
  quad(a: number[], b: number[], c: number[], d: number[], o: PartOpts, color: number, mat: number): this {
    const n = faceNormal(a, b, c);
    const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.emit({ pos: [...a, ...b, ...c, ...d], nrm: [...n, ...n, ...n, ...n], uv: [0, a[1], w, b[1], w, c[1], 0, d[1]], idx: [0, 1, 2, 0, 2, 3] }, o, color, mat);
    return this;
  }

  /** Number of triangles so far. */
  get triangles(): number {
    return this.I.length / 3;
  }

  /** Finalise into a BufferGeometry (attributes: position, normal, color, uv, aMat). */
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.C), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.U), 2));
    g.setAttribute('aMat', new BufferAttribute(new Float32Array(this.M), 1));
    const vcount = this.P.length / 3;
    g.setIndex(vcount > 65535 ? new BufferAttribute(new Uint32Array(this.I), 1) : new BufferAttribute(new Uint16Array(this.I), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  // ───────────────────────────── internals
  private skip(o: PartOpts): boolean {
    return !!o.detail && this.lod === 1;
  }

  private disc(r: number, y: number, seg: number, arc: number, up: boolean, o: PartOpts, color: number, mat: number) {
    const p: Part = { pos: [0, y, 0], nrm: [0, up ? 1 : -1, 0], uv: [0, 0], idx: [] };
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * arc;
      p.pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      p.nrm.push(0, up ? 1 : -1, 0);
      p.uv.push(Math.sin(a) * r, Math.cos(a) * r);
      if (s < seg) {
        if (up) p.idx.push(0, s + 1, s + 2);
        else p.idx.push(0, s + 2, s + 1);
      }
    }
    this.emit(p, o, color, mat);
  }

  private emitOriented(part: Part, o: PartOpts, color: number, mat: number, wantNormal: number[]) {
    // flip triangle winding if geometric normal disagrees with intended normal
    const fixed: number[] = [];
    for (let t = 0; t < part.idx.length; t += 3) {
      const i0 = part.idx[t], i1 = part.idx[t + 1], i2 = part.idx[t + 2];
      const a = part.pos.slice(i0 * 3, i0 * 3 + 3), b = part.pos.slice(i1 * 3, i1 * 3 + 3), c = part.pos.slice(i2 * 3, i2 * 3 + 3);
      const n = faceNormal(a, b, c);
      if (n[0] * wantNormal[0] + n[1] * wantNormal[1] + n[2] * wantNormal[2] < 0) fixed.push(i0, i2, i1);
      else fixed.push(i0, i1, i2);
    }
    part.idx = fixed;
    this.emit(part, o, color, mat);
  }

  private emit(part: Part, o: PartOpts, color: number, mat: number) {
    // primitive local transform
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    _m.makeRotationFromEuler(_e);
    if (o.sx !== undefined || o.sy !== undefined || o.sz !== undefined) _m.scale(_q.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    _m.setPosition(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    _m2.copy(this.stack[this.stack.length - 1]).multiply(_m);
    _nm.getNormalMatrix(_m2);
    const vy = _m2.elements[13]; // world y offset of primitive origin → keeps window rows aligned to floors
    const base = this.P.length / 3;
    _col.setHex(color);
    const paint = (o.paint ?? PAINTABLE_DEFAULT.has(mat)) ? 100 : 0;
    const count = part.pos.length / 3;
    for (let i = 0; i < count; i++) {
      _v.set(part.pos[i * 3], part.pos[i * 3 + 1], part.pos[i * 3 + 2]).applyMatrix4(_m2);
      this.P.push(_v.x, _v.y, _v.z);
      _v.set(part.nrm[i * 3], part.nrm[i * 3 + 1], part.nrm[i * 3 + 2]).applyMatrix3(_nm).normalize();
      this.N.push(_v.x, _v.y, _v.z);
      this.C.push(_col.r, _col.g, _col.b);
      this.U.push(part.uv[i * 2], part.uv[i * 2 + 1] + vy);
      this.M.push(mat + paint);
    }
    for (const k of part.idx) this.I.push(base + k);
  }
}

function faceNormal(a: number[], b: number[], c: number[]): number[] {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/** Convert an indexed part to flat-shaded (duplicate verts per triangle). */
function flatten(p: Part) {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let t = 0; t < p.idx.length; t += 3) {
    const ids = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
    const a = p.pos.slice(ids[0] * 3, ids[0] * 3 + 3), b = p.pos.slice(ids[1] * 3, ids[1] * 3 + 3), c = p.pos.slice(ids[2] * 3, ids[2] * 3 + 3);
    const n = faceNormal(a, b, c);
    for (const id of ids) {
      pos.push(p.pos[id * 3], p.pos[id * 3 + 1], p.pos[id * 3 + 2]);
      nrm.push(n[0], n[1], n[2]);
      uv.push(p.uv[id * 2], p.uv[id * 2 + 1]);
      idx.push(idx.length);
    }
  }
  p.pos = pos;
  p.nrm = nrm;
  p.uv = uv;
  p.idx = idx;
}

/** Decode a packed aMat value: material id (0..99) and paintable flag. */
export function decodeMat(v: number): { mat: number; paint: boolean } {
  return { mat: v % 100, paint: v >= 100 };
}

/** Helpers for picking colours deterministically. */
export function pickColor(list: number[], variant: number, salt = 0): number {
  return list[Math.abs((variant * 7 + salt * 13) % list.length)];
}

/** Multiply an sRGB hex colour by a factor (shade). */
export function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

/** Linear blend of two sRGB hex colours. */
export function mix(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}
