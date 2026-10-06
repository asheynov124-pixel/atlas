/**
 * OWNER: space-post.
 * SkyPlanets — the other worlds of the star system as tiny lit discs riding the sky near the sun's path (inner
 * worlds never stray far from the sun and show crescents; outer worlds can sit anywhere, some with banding or a ring).
 * Camera-centred at the far plane in the rotating sky group; one draw call.
 */
import { BufferAttribute, BufferGeometry, Color, CustomBlending, DoubleSide, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3 } from 'three';
import { Rng } from '../../core/rng';
import { GLSL_HASH, GLSL_SKY_VERTEX } from './glsl';

export interface SkyPlanetInfo {
  /** sRGB hex surface colours */
  colorA: number;
  colorB: number;
  /** angular radius (radians) */
  size: number;
  /** true when its orbit is inside ours (shows phases, stays near the sun) */
  inner: boolean;
  banded: boolean;
  ringed: boolean;
}

const VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec3 aDir;
attribute vec4 aLook;   // size, banded, ringed, seed
attribute vec3 aColA;
attribute vec3 aColB;
uniform vec3 uSunLocal;
varying vec2 vUv;
varying vec4 vLook;
varying vec3 vColA;
varying vec3 vColB;
varying vec3 vLight;
${GLSL_SKY_VERTEX}
void main() {
  vec3 d = normalize( aDir );
  vec3 hint = abs( d.y ) > 0.95 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
  vec3 r = normalize( cross( hint, d ) );
  vec3 u = cross( d, r );
  float ext = aLook.z > 0.5 ? 2.4 : 1.15;
  vec3 local = d + ( aCorner.x * r + aCorner.y * u ) * aLook.x * ext;
  gl_Position = skyClip( mat3( modelMatrix ) * local );
  vUv = aCorner * ext;
  vLook = aLook;
  vColA = aColA;
  vColB = aColB;
  // light direction in the disc's frame (x right, y up, z toward the viewer)
  vec3 s = normalize( uSunLocal );
  vLight = normalize( vec3( dot( s, r ), dot( s, u ), -dot( s, d ) ) );
}
`;

const FRAG = /* glsl */ `
uniform float uIntensity;
varying vec2 vUv;
varying vec4 vLook;
varying vec3 vColA;
varying vec3 vColB;
varying vec3 vLight;
${GLSL_HASH}
void main() {
  float r2 = dot( vUv, vUv );
  vec3 col = vec3( 0.0 );
  float alpha = 0.0;
  if ( r2 < 1.0 ) {
    vec3 n = vec3( vUv, sqrt( 1.0 - r2 ) );
    float lit = smoothstep( -0.05, 0.25, dot( n, vLight ) );
    float band = vLook.y > 0.5 ? 0.5 + 0.5 * sin( vUv.y * 14.0 + sin( vUv.x * 3.0 + vLook.w * 6.0 ) * 0.8 ) : sHash12( floor( vUv * 3.0 ) + vLook.w );
    vec3 alb = mix( vColA, vColB, band );
    col = alb * lit * 1.6 + alb * 0.015;
    col += vColB * pow( 1.0 - n.z, 3.0 ) * lit * 0.6;
    alpha = smoothstep( 1.0, 0.92, r2 );
  }
  if ( vLook.z > 0.5 ) {
    // ring: tilted ellipse in front of / behind the disc
    vec2 q = vec2( vUv.x, vUv.y * 4.2 );
    float rr = length( q );
    float ring = smoothstep( 1.35, 1.45, rr ) * smoothstep( 2.25, 1.9, rr );
    bool behind = vUv.y > 0.0 && r2 < 1.0;
    float ra = behind ? 0.0 : ring * 0.75;
    col = col * ( 1.0 - ra ) + vColA * 0.9 * ra;
    alpha = max( alpha, ra );
  }
  gl_FragColor = vec4( col * uIntensity, alpha * min( uIntensity, 1.0 ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class SkyPlanets {
  readonly mesh: Mesh;
  private material: ShaderMaterial;

  /**
   * @param sunPath sky-space direction of the sun's path "ecliptic" tilt (y component of the sun dir)
   */
  constructor(planets: SkyPlanetInfo[], seed: number, eclipticY: number) {
    const rng = new Rng((seed ^ 0x9a7e7) >>> 0);
    const n = planets.length;
    const corner = new Float32Array(n * 8);
    const dir = new Float32Array(n * 12);
    const look = new Float32Array(n * 16);
    const colA = new Float32Array(n * 12);
    const colB = new Float32Array(n * 12);
    const idx: number[] = [];
    const cs = [-1, -1, 1, -1, -1, 1, 1, 1];
    const d = new Vector3();
    const ca = new Color();
    const cb = new Color();
    planets.forEach((p, i) => {
      // elongation from the sun: inner worlds hug it, outer worlds roam
      const elong = p.inner ? rng.range(0.25, 0.75) * (rng.chance(0.5) ? 1 : -1) : rng.range(0.5, Math.PI * 2 - 0.5);
      const lat = rng.range(-0.06, 0.06);
      d.set(Math.cos(elong), eclipticY + lat, Math.sin(elong)).normalize();
      ca.set(p.colorA);
      cb.set(p.colorB);
      for (let k = 0; k < 4; k++) {
        corner[i * 8 + k * 2] = cs[k * 2];
        corner[i * 8 + k * 2 + 1] = cs[k * 2 + 1];
        dir.set([d.x, d.y, d.z], i * 12 + k * 3);
        look.set([p.size, p.banded ? 1 : 0, p.ringed ? 1 : 0, rng.next()], i * 16 + k * 4);
        colA.set([ca.r, ca.g, ca.b], i * 12 + k * 3);
        colB.set([cb.r, cb.g, cb.b], i * 12 + k * 3);
      }
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 12), 3));
    geo.setAttribute('aCorner', new BufferAttribute(corner, 2));
    geo.setAttribute('aDir', new BufferAttribute(dir, 3));
    geo.setAttribute('aLook', new BufferAttribute(look, 4));
    geo.setAttribute('aColA', new BufferAttribute(colA, 3));
    geo.setAttribute('aColB', new BufferAttribute(colB, 3));
    geo.setIndex(idx);
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      side: DoubleSide,
      uniforms: { uSunLocal: { value: new Vector3(1, 0, 0) }, uIntensity: { value: 1 } },
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'sky-planets';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -12;
  }

  /** @param sunLocal sun direction in the sky group's local frame */
  update(sunLocal: Vector3, intensity: number): void {
    this.material.uniforms.uSunLocal.value.copy(sunLocal);
    this.material.uniforms.uIntensity.value = intensity;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
