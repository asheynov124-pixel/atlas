/**
 * OWNER: roads-props.
 * Night glow layer for roads: soft warm light pools on the asphalt under every lamp and small camera-facing halos
 * around lamp heads / rail beacons. Additive, depth-tested, no depth writes; completely invisible by day (the
 * fragment uses the shared `cNight(wpos)` so the dark side of the planet lights up on its own).
 *
 *   GlowWriter.pool(centre, e1, e2, radius, colour)   ground pool (a quad in the plane e1/e2)
 *   GlowWriter.halo(centre, size, colour)              billboard halo (expanded in view space by the shader)
 *   createGlowMaterial()                               one shared ShaderMaterial (merges `shared` uniforms)
 *
 * One glow mesh per road chunk → +1 draw call per visible chunk that has lamps.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';
import { SHADER_COMMON, shared } from '../materials';

const _c = new Color();
const _p = new Vector3();

export class GlowWriter {
  private pos = new Float32Array(3 * 2048);
  private uv = new Float32Array(2 * 2048);
  private col = new Float32Array(3 * 2048);
  private bill = new Float32Array(2048);
  private idx = new Uint32Array(3072);
  nv = 0;
  ni = 0;

  reset(): void {
    this.nv = 0;
    this.ni = 0;
  }

  private ensure(v: number): void {
    if (this.nv + v <= this.bill.length) return;
    let cap = this.bill.length;
    while (this.nv + v > cap) cap *= 2;
    const g = (a: Float32Array, k: number) => {
      const b = new Float32Array(cap * k);
      b.set(a.subarray(0, this.nv * k));
      return b;
    };
    this.pos = g(this.pos, 3);
    this.uv = g(this.uv, 2);
    this.col = g(this.col, 3);
    this.bill = g(this.bill, 1);
    const ib = new Uint32Array(Math.ceil((cap * 6) / 4));
    ib.set(this.idx.subarray(0, this.ni));
    this.idx = ib;
  }

  private quad(cx: Vector3, e1: Vector3 | null, e2: Vector3 | null, r: number, hex: number, bill: number): void {
    this.ensure(4);
    _c.setHex(hex);
    const base = this.nv;
    const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
    for (let k = 0; k < 4; k++) {
      const u = corners[k * 2], v = corners[k * 2 + 1];
      if (e1 && e2) _p.copy(cx).addScaledVector(e1, u * r).addScaledVector(e2, v * r);
      else _p.copy(cx);
      const i = this.nv++;
      this.pos[i * 3] = _p.x;
      this.pos[i * 3 + 1] = _p.y;
      this.pos[i * 3 + 2] = _p.z;
      this.uv[i * 2] = u;
      this.uv[i * 2 + 1] = v;
      this.col[i * 3] = _c.r;
      this.col[i * 3 + 1] = _c.g;
      this.col[i * 3 + 2] = _c.b;
      this.bill[i] = bill;
    }
    const I = this.idx;
    I[this.ni++] = base;
    I[this.ni++] = base + 1;
    I[this.ni++] = base + 2;
    I[this.ni++] = base;
    I[this.ni++] = base + 2;
    I[this.ni++] = base + 3;
  }

  /** Light pool lying in the plane spanned by e1/e2 (both unit, tangent), radius r. */
  pool(c: Vector3, e1: Vector3, e2: Vector3, r: number, hex: number): void {
    this.quad(c, e1, e2, r, hex, 0);
  }

  /** Camera-facing halo of world size `size` around c. */
  halo(c: Vector3, size: number, hex: number): void {
    this.quad(c, null, null, size, hex, size);
  }

  build(): BufferGeometry | null {
    if (!this.ni) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos.slice(0, this.nv * 3), 3));
    g.setAttribute('uv', new BufferAttribute(this.uv.slice(0, this.nv * 2), 2));
    g.setAttribute('aGlowCol', new BufferAttribute(this.col.slice(0, this.nv * 3), 3));
    g.setAttribute('aBill', new BufferAttribute(this.bill.slice(0, this.nv), 1));
    const idx = this.idx.subarray(0, this.ni);
    g.setIndex(this.nv > 65535 ? new BufferAttribute(new Uint32Array(idx), 1) : new BufferAttribute(new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    // halos extend beyond their centres
    if (g.boundingSphere) g.boundingSphere.radius += 0.5;
    return g;
  }
}

let glowMat: ShaderMaterial | null = null;

/** Shared additive night-glow material (created once, reused by every road chunk). */
export function getGlowMaterial(): ShaderMaterial {
  if (glowMat) return glowMat;
  glowMat = new ShaderMaterial({
    name: 'road-glow',
    uniforms: { ...shared, uGlowGain: { value: 1 } },
    vertexShader: /* glsl */ `
      ${SHADER_COMMON}
      attribute float aBill;
      attribute vec3 aGlowCol;
      varying vec2 vUv;
      varying vec3 vCol;
      varying vec3 vWPos;
      varying float vFade;
      void main() {
        vUv = uv;
        vCol = aGlowCol;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        // halos: expand in view space; fade them out when seen from far away (orbit sparkle stays subtle)
        float dist = -mv.z;
        vFade = aBill > 0.0 ? clamp(1.6 - dist * 0.012, 0.25, 1.0) : 1.0;
        mv.xy += uv * aBill;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHADER_COMMON}
      uniform float uGlowGain;
      varying vec2 vUv;
      varying vec3 vCol;
      varying vec3 vWPos;
      varying float vFade;
      void main() {
        float d = length(vUv);
        float a = 1.0 - smoothstep(0.0, 1.0, d);
        a = a * a;
        float n = cNight(vWPos) * uNightLights * uGlowGain;
        if (n * a < 0.002) discard;
        gl_FragColor = vec4(vCol * a * n * vFade, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  return glowMat;
}
