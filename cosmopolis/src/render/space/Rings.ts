/**
 * OWNER: space-post.
 * PlanetRings — the planet's ring system from spec.rings: a tilted annulus whose radial structure comes from a
 * generated band texture (faint inner C-ring, dense B-ring, a Cassini-style division, ringlets and thin gaps,
 * crisp outer edge), with colour variation, optical-depth-correct translucency at grazing angles, lit/unlit face
 * response, forward-scattering glow when backlit, the planet's shadow falling across the rings, planetshine, and a
 * fine particle grain that fades out with distance (no shimmer).
 */
import {
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RGBAFormat,
  RepeatWrapping,
  RingGeometry,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  ClampToEdgeWrapping,
} from 'three';
import type { RingSpec } from '../../core/types';
import { Rng } from '../../core/rng';
import { GLSL_HASH } from './glsl';

const VERT = /* glsl */ `
varying vec3 vPosW;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uBands;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uNormal;
uniform vec3 uShine;
uniform float uInner;
uniform float uOuter;
uniform float uPlanetR;
uniform float uOpacity;
varying vec3 vPosW;
varying vec3 vLocal;
${GLSL_HASH}
void main() {
  float r = length( vLocal.xy ) / uPlanetR;
  float u = ( r - uInner ) / ( uOuter - uInner );
  if ( u < 0.0 || u > 1.0 ) discard;
  vec4 b = texture2D( uBands, vec2( u, 0.5 ) );
  float dens = b.r;
  // particle grain, faded out where it would alias
  float fw = fwidth( u * 4000.0 );
  float grain = sHash12( vec2( floor( u * 4000.0 ), floor( atan( vLocal.y, vLocal.x ) * 600.0 ) ) );
  dens *= mix( 1.0, 0.75 + 0.5 * grain, 1.0 - smoothstep( 0.3, 1.2, fw ) );
  vec3 alb = mix( uColA, uColB, b.g ) * ( 0.75 + 0.5 * b.b );
  vec3 V = normalize( cameraPosition - vPosW );
  float ndl = dot( uNormal, uSunDir );
  float ndv = dot( uNormal, V );
  // optical depth grows at grazing angles
  float tau = dens * uOpacity * 2.2;
  float alpha = 1.0 - exp( -tau / max( abs( ndv ), 0.06 ) );
  bool litSide = ndl * ndv > 0.0;
  float lit = abs( ndl );
  float mu = dot( -V, uSunDir );
  float fwd = pow( max( mu, 0.0 ), 6.0 );
  vec3 col;
  if ( litSide ) col = alb * ( 0.18 + lit * 0.95 );
  else col = alb * ( 0.05 + lit * 0.55 * ( 1.0 - dens * 0.6 ) + fwd * 1.6 * ( 1.0 - dens * 0.5 ) );
  col += alb * fwd * 0.4;
  // planet shadow (soft penumbra)
  float tca = dot( -vPosW, uSunDir );
  float d2 = dot( vPosW, vPosW ) - tca * tca;
  float R2 = uPlanetR * uPlanetR;
  float sh = tca > 0.0 ? smoothstep( R2 * 0.9, R2 * 1.04, d2 ) : 1.0;
  col *= uSunCol * sh;
  // planetshine on the shadowed / night portion
  col += alb * uShine * ( 1.0 - sh * 0.7 ) * 0.05;
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Generate the radial structure (R density, G colour mix, B brightness). */
function bandTexture(seed: number, size = 1024): DataTexture {
  const rng = new Rng((seed ^ 0x219a5) >>> 0);
  const dens = new Float32Array(size);
  // smooth base profile from a few random waves
  const waves = Array.from({ length: 7 }, () => ({ f: rng.range(2, 40), p: rng.range(0, 6.28), a: rng.range(0.05, 0.22) }));
  // major division + a couple of gaps
  const cassini = rng.range(0.55, 0.72);
  const cassiniW = rng.range(0.025, 0.05);
  const gaps = Array.from({ length: rng.int(2, 5) }, () => ({ at: rng.range(0.08, 0.98), w: rng.range(0.002, 0.008) }));
  // band zones: inner faint, middle dense, outer medium
  const innerEdge = rng.range(0.12, 0.3);
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);
    let d = 0.55;
    for (const w of waves) d += Math.sin(x * w.f + w.p) * w.a;
    // fine ringlets
    d += Math.sin(x * 420 + rng.next() * 0.2) * 0.04 + (rng.next() - 0.5) * 0.08;
    // C-ring: faint inner zone
    d *= x < innerEdge ? 0.25 + 0.35 * (x / innerEdge) : x < cassini ? 1.15 : 0.85;
    // divisions
    d *= 1 - Math.exp(-Math.pow((x - cassini) / cassiniW, 2)) * 0.95;
    for (const g of gaps) d *= 1 - Math.exp(-Math.pow((x - g.at) / g.w, 2)) * 0.9;
    // soft inner edge, crisp outer edge
    d *= Math.min(1, x / 0.04) * Math.min(1, (1 - x) / 0.012);
    dens[i] = Math.max(0, Math.min(1, d));
  }
  const data = new Uint8Array(size * 4);
  const cw = Array.from({ length: 4 }, () => ({ f: rng.range(3, 25), p: rng.range(0, 6.28) }));
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);
    let c = 0.5;
    for (const w of cw) c += Math.sin(x * w.f + w.p) * 0.18;
    data[i * 4] = Math.round(dens[i] * 255);
    data[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, c)) * 255);
    data[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, 0.5 + (dens[i] - 0.5) * 0.6 + (rng.next() - 0.5) * 0.15)) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, size, 1, RGBAFormat, UnsignedByteType);
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export class PlanetRings {
  readonly mesh: Mesh;
  private material: ShaderMaterial;
  private tex: DataTexture;
  /** world-space ring plane normal */
  readonly normal = new Vector3();

  constructor(spec: RingSpec, planetRadius: number, seed: number, atmosphereColor: number) {
    const R = planetRadius;
    this.tex = bandTexture(seed);
    const colA = new Color(spec.color);
    const colB = colA.clone().offsetHSL(0.03, -0.05, 0.12);
    colA.offsetHSL(-0.02, 0.05, -0.08);
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uBands: { value: this.tex },
        uColA: { value: colA },
        uColB: { value: colB },
        uSunDir: { value: new Vector3(1, 0, 0) },
        uSunCol: { value: new Color(1, 1, 1) },
        uNormal: { value: this.normal },
        uShine: { value: new Color(atmosphereColor).lerp(new Color(1, 1, 1), 0.5) },
        uInner: { value: spec.inner },
        uOuter: { value: spec.outer },
        uPlanetR: { value: R },
        uOpacity: { value: Math.max(0.05, Math.min(1, spec.opacity)) },
      },
    });
    const geo = new RingGeometry(spec.inner * R, spec.outer * R, 256, 3);
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'planet-rings';
    this.mesh.rotation.set(-Math.PI / 2 + spec.tilt, 0, spec.tilt * 0.35);
    this.mesh.updateMatrixWorld();
    this.normal.set(0, 0, 1).transformDirection(this.mesh.matrixWorld).normalize();
    this.mesh.renderOrder = 8;
  }

  update(sunDir: Vector3, sunCol: Color): void {
    const u = this.material.uniforms;
    u.uSunDir.value.copy(sunDir);
    u.uSunCol.value.copy(sunCol);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}
