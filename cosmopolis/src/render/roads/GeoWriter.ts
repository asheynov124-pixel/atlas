/**
 * OWNER: roads-props.
 * GeoWriter — a fast, reusable typed-array mesh writer producing geometry compatible with the shared building
 * material (attributes: position · normal · color (linear) · uv · aMat · aState). Used to bake road chunks.
 *
 * All primitives take world-space points (Vector3) and a "reference" direction that tells which side is the front;
 * the winding is flipped automatically when needed, so callers never fight triangle orientation.
 * Colours are passed as linear RGB triples (see `lin()`), pre-converted once from sRGB hex.
 * One writer is reused for every chunk build (it only grows); `build()` copies the used range into a new geometry.
 */
import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';

export type Lin = [number, number, number];

const _c = new Color();
/** sRGB hex → linear RGB triple (matches the kit's vertex colours). */
export function lin(hex: number): Lin {
  _c.setHex(hex);
  return [_c.r, _c.g, _c.b];
}

const _e1 = new Vector3();
const _e2 = new Vector3();
const _n = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _cc = new Vector3();
const _dd = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _ax = new Vector3();
const _dp = new Vector3();
const _dn = new Vector3();

export class GeoWriter {
  private pos = new Float32Array(3 * 4096);
  private nrm = new Float32Array(3 * 4096);
  private col = new Float32Array(3 * 4096);
  private uv = new Float32Array(2 * 4096);
  private mat = new Float32Array(4096);
  private st = new Float32Array(4096);
  private idx = new Uint32Array(8192);
  nv = 0;
  ni = 0;
  /** aState written for following vertices (InstState: burning, frozen…) */
  state = 0;

  reset(): void {
    this.nv = 0;
    this.ni = 0;
    this.state = 0;
  }

  get triangles(): number {
    return this.ni / 3;
  }

  private ensure(v: number, i: number): void {
    if (this.nv + v > this.mat.length) {
      let cap = this.mat.length;
      while (this.nv + v > cap) cap *= 2;
      const grow = <T extends Float32Array>(a: T, k: number): T => {
        const b = new Float32Array(cap * k) as T;
        b.set(a.subarray(0, this.nv * k));
        return b;
      };
      this.pos = grow(this.pos, 3);
      this.nrm = grow(this.nrm, 3);
      this.col = grow(this.col, 3);
      this.uv = grow(this.uv, 2);
      this.mat = grow(this.mat, 1);
      this.st = grow(this.st, 1);
    }
    if (this.ni + i > this.idx.length) {
      let cap = this.idx.length;
      while (this.ni + i > cap) cap *= 2;
      const b = new Uint32Array(cap);
      b.set(this.idx.subarray(0, this.ni));
      this.idx = b;
    }
  }

  /** Raw vertex. */
  vert(p: Vector3, n: Vector3, c: Lin, mat: number, u = 0, v = 0): number {
    const i = this.nv++;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.nrm[i * 3] = n.x;
    this.nrm[i * 3 + 1] = n.y;
    this.nrm[i * 3 + 2] = n.z;
    this.col[i * 3] = c[0];
    this.col[i * 3 + 1] = c[1];
    this.col[i * 3 + 2] = c[2];
    this.uv[i * 2] = u;
    this.uv[i * 2 + 1] = v;
    this.mat[i] = mat;
    this.st[i] = this.state;
    return i;
  }

  /** Flat quad a,b,c,d (in order around the perimeter) facing `ref` (approximate normal). */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, ref: Vector3, col: Lin, mat: number): void {
    this.ensure(4, 6);
    _e1.subVectors(c, a);
    _e2.subVectors(d, b);
    _n.crossVectors(_e1, _e2);
    const l = _n.length();
    if (l < 1e-12) return;
    _n.multiplyScalar(1 / l);
    let flip = false;
    if (_n.dot(ref) < 0) {
      _n.negate();
      flip = true;
    }
    const i0 = this.vert(a, _n, col, mat, 0, 0);
    const i1 = this.vert(b, _n, col, mat, 1, 0);
    const i2 = this.vert(c, _n, col, mat, 1, 1);
    const i3 = this.vert(d, _n, col, mat, 0, 1);
    const I = this.idx;
    let k = this.ni;
    if (!flip) {
      I[k++] = i0; I[k++] = i1; I[k++] = i2;
      I[k++] = i0; I[k++] = i2; I[k++] = i3;
    } else {
      I[k++] = i0; I[k++] = i2; I[k++] = i1;
      I[k++] = i0; I[k++] = i3; I[k++] = i2;
    }
    this.ni = k;
  }

  /** Flat triangle facing `ref`. */
  tri(a: Vector3, b: Vector3, c: Vector3, ref: Vector3, col: Lin, mat: number): void {
    this.ensure(3, 3);
    _e1.subVectors(b, a);
    _e2.subVectors(c, a);
    _n.crossVectors(_e1, _e2);
    const l = _n.length();
    if (l < 1e-14) return;
    _n.multiplyScalar(1 / l);
    let flip = false;
    if (_n.dot(ref) < 0) {
      _n.negate();
      flip = true;
    }
    const i0 = this.vert(a, _n, col, mat);
    const i1 = this.vert(b, _n, col, mat);
    const i2 = this.vert(c, _n, col, mat);
    const I = this.idx;
    let k = this.ni;
    I[k++] = i0;
    if (!flip) {
      I[k++] = i1; I[k++] = i2;
    } else {
      I[k++] = i2; I[k++] = i1;
    }
    this.ni = k;
  }

  /**
   * Horizontal disc / regular polygon centred at `c` in the plane (e1, e2), normal `up`, radius r.
   * Optional centre colour (radial gradient, e.g. light pools); `phase` rotates the polygon.
   */
  disc(c: Vector3, up: Vector3, e1: Vector3, e2: Vector3, r: number, seg: number, col: Lin, mat: number, centreCol?: Lin, phase = 0): void {
    this.ensure(seg + 1, seg * 3);
    const ic = this.vert(c, up, centreCol ?? col, mat);
    const first = this.nv;
    for (let s = 0; s < seg; s++) {
      const a = phase + (s / seg) * Math.PI * 2;
      _dp.copy(c).addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r);
      this.vert(_dp, up, col, mat);
    }
    // orientation: (e1 × e2) vs up
    _dn.crossVectors(e1, e2);
    const ccw = _dn.dot(up) >= 0;
    const I = this.idx;
    let k = this.ni;
    for (let s = 0; s < seg; s++) {
      const a = first + s, b = first + ((s + 1) % seg);
      I[k++] = ic;
      if (ccw) {
        I[k++] = a; I[k++] = b;
      } else {
        I[k++] = b; I[k++] = a;
      }
    }
    this.ni = k;
  }

  /**
   * Upright prism (cylinder) standing on `base` along `up`, radius r0 at the bottom and r1 at the top, height h.
   * `cap` draws the top. Sides are smooth-shaded when seg > 6.
   */
  prism(base: Vector3, up: Vector3, e1: Vector3, e2: Vector3, r0: number, r1: number, h: number, seg: number, col: Lin, mat: number, cap = true, capCol?: Lin, capMat?: number): void {
    this.ensure(seg * 4 + seg + 1, seg * 6 + seg * 3);
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      _a.copy(base).addScaledVector(e1, c0 * r0).addScaledVector(e2, s0 * r0);
      _b.copy(base).addScaledVector(e1, c1 * r0).addScaledVector(e2, s1 * r0);
      _cc.copy(base).addScaledVector(up, h).addScaledVector(e1, c1 * r1).addScaledVector(e2, s1 * r1);
      _dd.copy(base).addScaledVector(up, h).addScaledVector(e1, c0 * r1).addScaledVector(e2, s0 * r1);
      const am = (a0 + a1) / 2;
      _q.copy(e1).multiplyScalar(Math.cos(am)).addScaledVector(e2, Math.sin(am));
      this.quad(_a, _b, _cc, _dd, _q, col, mat);
    }
    if (cap && r1 > 0) {
      _p.copy(base).addScaledVector(up, h);
      this.disc(_p, up, e1, e2, r1, seg, capCol ?? col, capMat ?? mat);
    }
  }

  /**
   * Oriented box from point a to point b (its centre line, at the bottom face), width w across `side`, height h
   * along `up`. Faces: top, both sides, both ends (optional), bottom (optional).
   */
  beam(a: Vector3, b: Vector3, up: Vector3, side: Vector3, w: number, h: number, col: Lin, mat: number, o: { ends?: boolean; bottom?: boolean; top?: Lin; topMat?: number; sides?: boolean } = {}): void {
    const hw = w / 2;
    // corners: bottom/top × left/right × a/b
    const corner = (p: Vector3, sx: number, sy: number, out: Vector3) => out.copy(p).addScaledVector(side, sx * hw).addScaledVector(up, sy * h);
    const p0 = _x, p1 = _y, p2 = _z, p3 = _p;
    // top
    corner(a, -1, 1, p0); corner(a, 1, 1, p1); corner(b, 1, 1, p2); corner(b, -1, 1, p3);
    this.quad(p0, p1, p2, p3, up, o.top ?? col, o.topMat ?? mat);
    if (o.sides !== false) {
      // right side
      corner(a, 1, 0, p0); corner(b, 1, 0, p1); corner(b, 1, 1, p2); corner(a, 1, 1, p3);
      this.quad(p0, p1, p2, p3, side, col, mat);
      // left side
      _q.copy(side).negate();
      corner(a, -1, 0, p0); corner(a, -1, 1, p1); corner(b, -1, 1, p2); corner(b, -1, 0, p3);
      this.quad(p0, p1, p2, p3, _q, col, mat);
    }
    if (o.bottom) {
      _q.copy(up).negate();
      corner(a, -1, 0, p0); corner(b, -1, 0, p1); corner(b, 1, 0, p2); corner(a, 1, 0, p3);
      this.quad(p0, p1, p2, p3, _q, col, mat);
    }
    if (o.ends) {
      _q.subVectors(a, b);
      corner(a, -1, 0, p0); corner(a, 1, 0, p1); corner(a, 1, 1, p2); corner(a, -1, 1, p3);
      this.quad(p0, p1, p2, p3, _q, col, mat);
      _q.subVectors(b, a);
      corner(b, -1, 0, p0); corner(b, 1, 0, p1); corner(b, 1, 1, p2); corner(b, -1, 1, p3);
      this.quad(p0, p1, p2, p3, _q, col, mat);
    }
  }

  /**
   * Axis-aligned (in the given frame) box centred horizontally at c, standing on c along `up`.
   * sx across `right`, sz along `fwd`, height h. `bottom` emits the underside (floating parts).
   */
  box(c: Vector3, up: Vector3, right: Vector3, fwd: Vector3, sx: number, h: number, sz: number, col: Lin, mat: number, o: { top?: Lin; topMat?: number; bottom?: boolean } = {}): void {
    _a.copy(c).addScaledVector(fwd, -sz / 2);
    _b.copy(c).addScaledVector(fwd, sz / 2);
    this.beam(_a, _b, up, right, sx, h, col, mat, { ends: true, bottom: o.bottom, top: o.top, topMat: o.topMat });
  }

  /**
   * Tube (n-gon prism) along a→b with radius r; the cross-section frame is (side, up). Optional end caps.
   */
  tube(a: Vector3, b: Vector3, up: Vector3, side: Vector3, r: number, seg: number, col: Lin, mat: number, capA = false, capB = false): void {
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
      _x.copy(a).addScaledVector(side, c0).addScaledVector(up, s0);
      _y.copy(a).addScaledVector(side, c1).addScaledVector(up, s1);
      _z.copy(b).addScaledVector(side, c1).addScaledVector(up, s1);
      _p.copy(b).addScaledVector(side, c0).addScaledVector(up, s0);
      const am = (a0 + a1) / 2;
      _q.copy(side).multiplyScalar(Math.cos(am)).addScaledVector(up, Math.sin(am));
      this.quad(_x, _y, _z, _p, _q, col, mat);
    }
    if (capA || capB) {
      _ax.subVectors(b, a).normalize();
      if (capB) this.disc(b, _ax, side, up, r, seg, col, mat);
      if (capA) this.disc(a, _ax.negate(), side, up, r, seg, col, mat);
    }
  }

  /** Copy the written range into a standalone BufferGeometry (bounding sphere computed). Null when empty. */
  build(): BufferGeometry | null {
    if (this.ni === 0) return null;
    const g = new BufferGeometry();
    const nv = this.nv;
    g.setAttribute('position', new BufferAttribute(this.pos.slice(0, nv * 3), 3));
    g.setAttribute('normal', new BufferAttribute(this.nrm.slice(0, nv * 3), 3));
    g.setAttribute('color', new BufferAttribute(this.col.slice(0, nv * 3), 3));
    g.setAttribute('uv', new BufferAttribute(this.uv.slice(0, nv * 2), 2));
    g.setAttribute('aMat', new BufferAttribute(this.mat.slice(0, nv), 1));
    g.setAttribute('aState', new BufferAttribute(this.st.slice(0, nv), 1));
    const idx = this.idx.subarray(0, this.ni);
    g.setIndex(nv > 65535 ? new BufferAttribute(new Uint32Array(idx), 1) : new BufferAttribute(new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    return g;
  }
}
