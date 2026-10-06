/**
 * OWNER: space-post.
 * Sun — the star as seen from the planet, in two parts:
 *   SunDisc     a far-plane billboard (depth-tested, so the planet, moons and skyline occlude it): limb-darkened HDR
 *               disc that blooms, animated corona streamers, and per-kind specials — pulsar beams, a binary companion,
 *               or a black hole with a Doppler-beamed accretion disc, lensed photon ring and a true black shadow.
 *   LensFlares  screen-space glare, starburst, anamorphic streak, 22° halo and aperture ghosts along the sun→centre
 *               axis. Faded by an analytic occlusion test (planet + moons), so flares vanish behind the limb.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { GLSL_HASH, GLSL_SIMPLEX } from './glsl';
import type { StarLook } from './stars';

const DISC_VERT = /* glsl */ `
uniform vec3 uDir;
uniform float uExtent;
varying vec2 vUv;
void main() {
  vec3 d = normalize( uDir );
  vec3 hint = abs( d.y ) > 0.95 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
  vec3 r = normalize( cross( hint, d ) );
  vec3 u = cross( d, r );
  vec3 w = d + ( position.x * r + position.y * u ) * uExtent;
  vec4 c = projectionMatrix * vec4( mat3( viewMatrix ) * w, 1.0 );
  c.z = c.w * 0.99999;
  gl_Position = c;
  vUv = position.xy * uExtent;
}
`;

const DISC_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uDisc;
uniform float uGlow;
uniform float uCorona;
uniform float uTime;
uniform float uMode;
uniform vec2 uComp;
uniform float uBright;
varying vec2 vUv;
${GLSL_HASH}
${GLSL_SIMPLEX}

vec3 star( vec2 q, float size, vec3 col, float glow, float corona, float seed ) {
  float r = length( q ) / size;
  float a = atan( q.y, q.x );
  float aa = fwidth( r ) * 1.5 + 0.01;
  float disc = smoothstep( 1.0 + aa, 1.0 - aa, r );
  float mu = sqrt( max( 0.0, 1.0 - r * r ) );
  float limb = 0.45 + 0.55 * pow( mu, 0.6 );
  float gran = 0.92 + 0.08 * snoise( vec3( q / size * 6.0, uTime * 0.2 + seed ) );
  vec3 c = col * disc * limb * gran * glow;
  float st = snoise( vec3( cos( a ) * 2.2, sin( a ) * 2.2, uTime * 0.035 + seed ) ) * 0.5 + 0.5;
  st += 0.5 * ( snoise( vec3( cos( a ) * 6.0, sin( a ) * 6.0, uTime * 0.05 - r * 0.15 + seed ) ) * 0.5 + 0.5 );
  float rr = max( r - 1.0, 0.0 );
  float streamers = pow( st * 0.67, 3.0 ) * exp( -rr * 0.55 );
  float cor = exp( -rr * 3.0 ) * 0.9 + streamers * 1.4;
  c += mix( col, vec3( 1.0 ), 0.25 ) * cor * corona * ( 1.0 - disc ) * 2.2;
  c += col * exp( -r * 0.45 ) * 0.18;
  return c;
}

void main() {
  vec3 col = vec3( 0.0 );
  float alpha = 0.0;
  if ( uMode < 2.5 ) {
    col = star( vUv, uDisc, uColor, uGlow, uCorona, 0.0 );
    if ( uMode > 0.5 && uMode < 1.5 ) {
      // pulsar: two precessing beams + strobing core
      float ph = uTime * 0.35;
      vec2 ax = vec2( cos( ph ), sin( ph ) );
      vec2 q = vUv / uDisc;
      float along = dot( q, ax );
      float perp = abs( dot( q, vec2( -ax.y, ax.x ) ) );
      float spread = 0.35 + abs( along ) * 0.09;
      float beam = exp( -perp * perp / ( spread * spread ) ) * exp( -abs( along ) * 0.09 ) * smoothstep( 0.8, 2.0, abs( along ) );
      float pulse = 0.55 + 0.45 * pow( 0.5 + 0.5 * sin( uTime * 7.0 ), 6.0 );
      col += uColor2 * beam * 2.4 * pulse;
      col *= 0.8 + 0.4 * pulse;
    } else if ( uMode > 1.5 ) {
      // binary: a smaller, redder companion circling its partner
      col += star( vUv - uComp * uDisc, uDisc * 0.62, uColor2, uGlow * 0.75, uCorona * 0.8, 17.0 );
    }
  } else {
    // black hole: shadow + photon ring + tilted, Doppler-beamed accretion disc, lensed over the top and bottom
    vec2 q = vUv / uDisc;
    float ca = cos( 0.32 ), sa = sin( 0.32 );
    q = mat2( ca, -sa, sa, ca ) * q;
    float r = length( q );
    float aa = fwidth( r ) * 1.5 + 0.01;
    float hole = smoothstep( 1.0 + aa, 1.0 - aa, r );
    float tilt = 0.2;
    vec2 dq = vec2( q.x, q.y / tilt );
    float e = length( dq );
    float ang = atan( dq.y, dq.x );
    float swirl = 0.55 + 0.45 * snoise( vec3( cos( ang - uTime * 0.25 ) * 2.0, sin( ang - uTime * 0.25 ) * 2.0, e * 0.9 ) );
    float band = smoothstep( 1.55, 2.1, e ) * smoothstep( 7.5, 2.4, e );
    float doppler = 1.0 + 0.9 * ( q.x / max( e * tilt + abs( q.x ), 0.001 ) );
    vec3 hot = mix( vec3( 1.0, 0.92, 0.8 ), uColor, smoothstep( 1.8, 5.5, e ) );
    hot = mix( hot, vec3( 0.55, 0.25, 0.8 ), smoothstep( 4.5, 7.5, e ) * 0.6 );
    vec3 diskCol = hot * band * swirl * doppler * 2.6;
    // lensed image of the far side: a bright arc hugging the shadow
    float lensR = 1.0 + 0.55 * ( 0.4 + 0.6 * abs( q.y ) / max( r, 0.001 ) );
    float lens = exp( -pow( ( r - lensR ) / 0.16, 2.0 ) ) * ( 0.7 + 0.3 * swirl );
    float photon = exp( -pow( ( r - 1.04 ) / 0.035, 2.0 ) );
    vec3 back = hot * lens * 2.2 + vec3( 1.0, 0.9, 0.78 ) * photon * 3.0;
    bool front = q.y < 0.0;
    vec3 diskFront = front ? diskCol : vec3( 0.0 );
    vec3 diskBack = front ? vec3( 0.0 ) : diskCol;
    float frontA = clamp( length( diskFront ) * 0.6, 0.0, 1.0 );
    col = ( back + diskBack ) * ( 1.0 - hole ) + diskFront + uColor * exp( -r * 0.5 ) * 0.12 * ( 1.0 - hole );
    alpha = hole * ( 1.0 - frontA );
  }
  gl_FragColor = vec4( col * uBright, alpha * uBright );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class SunDisc {
  readonly mesh: Mesh;
  private material: ShaderMaterial;
  private angle = 0;

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: DISC_VERT,
      fragmentShader: DISC_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      side: DoubleSide,
      uniforms: {
        uDir: { value: new Vector3(1, 0, 0) },
        uExtent: { value: 0.3 },
        uColor: { value: new Color() },
        uColor2: { value: new Color() },
        uDisc: { value: 0.02 },
        uGlow: { value: 20 },
        uCorona: { value: 0.5 },
        uTime: { value: 0 },
        uMode: { value: 0 },
        uComp: { value: new Vector2(3, 0) },
        uBright: { value: 1 },
      },
    });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.mesh.name = 'sun-disc';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  setLook(look: StarLook): void {
    const u = this.material.uniforms;
    u.uColor.value.set(look.color);
    u.uColor2.value.set(look.companion ?? look.color);
    u.uDisc.value = look.disc;
    u.uGlow.value = look.discGlow;
    u.uCorona.value = look.corona;
    const mode = look.special === 'pulsar' ? 1 : look.special === 'binary' ? 2 : look.special === 'blackhole' ? 3 : 0;
    u.uMode.value = mode;
    const reach = mode === 1 ? 34 : mode === 3 ? 10 : mode === 2 ? 14 : 11;
    u.uExtent.value = look.disc * reach;
  }

  /** @param warm 0..1 extra reddening near the horizon */
  update(dt: number, time: number, dir: Vector3, bright: number, warm: number, base: Color): void {
    const u = this.material.uniforms;
    u.uDir.value.copy(dir);
    u.uTime.value = time;
    u.uBright.value = bright;
    this.angle += dt * 0.05;
    u.uComp.value.set(Math.cos(this.angle) * 3.4, Math.sin(this.angle) * 1.1);
    const c = u.uColor.value as Color;
    c.copy(base).lerp(_warm, warm * 0.65);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

const _warm = new Color(1.0, 0.42, 0.16);

// ─────────────────────────────────────────────────────────────────────────────── lens flares

const FLARE_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aEl;     // t along the axis, half-size (NDC y), shape id, intensity
attribute vec3 aTint;
uniform vec2 uSun;
uniform float uAspect;
uniform float uVis;
varying vec2 vUv;
varying float vShape;
varying vec3 vCol;
void main() {
  vec2 c = uSun * ( 1.0 - aEl.x );
  vec2 off = aCorner * aEl.y;
  if ( abs( aEl.z - 4.0 ) < 0.5 ) off *= vec2( 14.0, 0.35 );
  off.x /= uAspect;
  gl_Position = vec4( c + off, 0.0, 1.0 );
  vUv = aCorner;
  vShape = aEl.z;
  vCol = aTint * aEl.w * uVis;
}
`;

const FLARE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uRot;
varying vec2 vUv;
varying float vShape;
varying vec3 vCol;
vec3 spectrum( float x ) { return clamp( vec3( 1.5 - abs( 4.0 * x - 3.0 ), 1.5 - abs( 4.0 * x - 2.0 ), 1.5 - abs( 4.0 * x - 1.0 ) ), 0.0, 1.0 ); }
void main() {
  float r = length( vUv );
  int s = int( vShape + 0.5 );
  float v = 0.0;
  vec3 tint = vec3( 1.0 );
  if ( s == 0 ) {
    v = exp( -r * r * 4.0 ) * 0.55 + exp( -r * 9.0 ) * 0.6;
  } else if ( s == 1 ) {
    v = smoothstep( 1.0, 0.55, r ) * 0.5 + smoothstep( 1.0, 0.92, r ) * smoothstep( 0.8, 0.95, r ) * 0.4;
  } else if ( s == 2 ) {
    v = exp( -pow( ( r - 0.78 ) / 0.07, 2.0 ) ) * 0.8 + smoothstep( 0.9, 0.0, r ) * 0.06;
  } else if ( s == 3 ) {
    vec2 p = abs( vUv );
    float h = max( p.x * 0.866 + p.y * 0.5, p.y );
    v = smoothstep( 0.95, 0.85, h ) * ( 0.35 + 0.35 * smoothstep( 0.6, 0.92, h ) );
  } else if ( s == 4 ) {
    v = exp( -vUv.y * vUv.y * 9.0 ) * exp( -abs( vUv.x ) * 3.2 ) * 0.9;
  } else if ( s == 5 ) {
    float a = atan( vUv.y, vUv.x ) + uRot;
    float rays = pow( abs( sin( a * 6.0 ) ), 40.0 ) + pow( abs( sin( a * 9.0 + 1.3 ) ), 70.0 ) * 0.6 + pow( abs( sin( a * 23.0 + 0.4 ) ), 30.0 ) * 0.25;
    v = rays * exp( -r * 2.4 ) * smoothstep( 0.02, 0.12, r );
  } else {
    float ring = exp( -pow( ( r - 0.82 ) / 0.06, 2.0 ) );
    tint = mix( vec3( 1.0 ), spectrum( clamp( ( r - 0.74 ) / 0.16, 0.0, 1.0 ) ), 0.85 );
    v = ring * 0.6;
  }
  v *= smoothstep( 1.0, 0.8, r ) + ( s == 4 ? 1.0 : 0.0 );
  gl_FragColor = vec4( vCol * uColor * tint * v, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** [t, halfSize, shape, intensity, r, g, b] — shapes: 0 glare 1 disc 2 ring 3 hexagon 4 streak 5 starburst 6 rainbow halo */
const ELEMENTS: number[][] = [
  [0, 0.95, 0, 0.55, 1, 0.92, 0.8],
  [0, 0.42, 5, 1.1, 1, 0.95, 0.85],
  [0, 0.09, 4, 0.55, 0.55, 0.72, 1],
  [0, 0.55, 6, 0.16, 1, 1, 1],
  [-0.22, 0.05, 1, 0.18, 1, 0.75, 0.5],
  [0.32, 0.045, 3, 0.22, 0.55, 0.85, 1],
  [0.55, 0.1, 2, 0.16, 1, 0.55, 0.35],
  [0.78, 0.035, 1, 0.28, 0.6, 1, 0.7],
  [1.0, 0.13, 3, 0.1, 0.45, 0.6, 1],
  [1.22, 0.07, 1, 0.16, 1, 0.82, 0.5],
  [1.45, 0.22, 2, 0.1, 0.7, 0.55, 1],
  [1.75, 0.05, 3, 0.18, 0.9, 0.6, 1],
];

export class LensFlares {
  readonly mesh: Mesh;
  private material: ShaderMaterial;

  constructor() {
    const n = ELEMENTS.length;
    const corner = new Float32Array(n * 8);
    const el = new Float32Array(n * 16);
    const tint = new Float32Array(n * 12);
    const pos = new Float32Array(n * 12);
    const idx: number[] = [];
    const cs = [-1, -1, 1, -1, -1, 1, 1, 1];
    ELEMENTS.forEach((e, i) => {
      for (let k = 0; k < 4; k++) {
        corner[i * 8 + k * 2] = cs[k * 2];
        corner[i * 8 + k * 2 + 1] = cs[k * 2 + 1];
        el.set(e.slice(0, 4), i * 16 + k * 4);
        tint.set(e.slice(4, 7), i * 12 + k * 3);
      }
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aCorner', new BufferAttribute(corner, 2));
    geo.setAttribute('aEl', new BufferAttribute(el, 4));
    geo.setAttribute('aTint', new BufferAttribute(tint, 3));
    geo.setIndex(idx);
    this.material = new ShaderMaterial({
      vertexShader: FLARE_VERT,
      fragmentShader: FLARE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: {
        uSun: { value: new Vector2() },
        uAspect: { value: 1 },
        uVis: { value: 0 },
        uColor: { value: new Color(1, 1, 1) },
        uRot: { value: 0 },
      },
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'lens-flares';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 900;
    this.mesh.visible = false;
  }

  /**
   * @param ndc sun position in normalised device coordinates
   * @param vis 0..1 visibility (occlusion × on-screen fade × glare strength)
   */
  update(ndc: Vector2, aspect: number, vis: number, color: Color, rot: number): void {
    const u = this.material.uniforms;
    this.mesh.visible = vis > 0.004;
    if (!this.mesh.visible) return;
    u.uSun.value.copy(ndc);
    u.uAspect.value = aspect;
    u.uVis.value = vis;
    u.uColor.value.copy(color);
    u.uRot.value = rot;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
