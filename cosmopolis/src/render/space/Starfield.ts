/**
 * OWNER: space-post.
 * Starfield — tens of thousands of point stars at the far plane: black-body colour temperatures (red dwarfs to blue
 * giants, saturated a touch for readability), a power-law brightness distribution, crowding along the galactic band,
 * diffraction spikes on the brightest few, scintillation (strong when seen through an atmosphere, faint in orbit)
 * and atmospheric extinction near the horizon. One draw call.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../../core/rng';
import { GLSL_SKY_VERTEX } from './glsl';
import type { SkyLayout } from './SkyDome';
import { kelvinColor } from './stars';

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aBright;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uTwinkle;
uniform float uIntensity;
uniform vec3 uUp;
uniform float uExtinction;
varying vec3 vColor;
varying float vSpike;
${GLSL_SKY_VERTEX}
void main() {
  vec3 dir = mat3( modelMatrix ) * position;
  gl_Position = skyClip( dir );
  float tw = 1.0 + uTwinkle * ( sin( uTime * ( 2.3 + aSeed * 6.0 ) + aSeed * 41.0 ) * 0.6 + sin( uTime * ( 5.1 + aSeed * 3.0 ) + aSeed * 17.0 ) * 0.4 );
  float horizon = mix( 1.0, smoothstep( -0.03, 0.35, dot( normalize( dir ), uUp ) ), uExtinction );
  float b = aBright;
  gl_PointSize = max( 1.0, mix( 1.15, 6.5, pow( b, 1.35 ) ) * uScale );
  vColor = aColor * ( 0.16 + b * b * 3.2 ) * tw * horizon * uIntensity;
  vSpike = smoothstep( 0.72, 0.95, b );
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vSpike;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot( c, c );
  if ( r2 > 1.0 ) discard;
  float core = exp( -r2 * 7.0 ) + exp( -r2 * 2.2 ) * 0.18;
  float spike = vSpike * ( exp( -abs( c.x ) * 22.0 - c.y * c.y * 1.6 ) + exp( -abs( c.y ) * 22.0 - c.x * c.x * 1.6 ) ) * 0.55;
  gl_FragColor = vec4( vColor * ( core + spike ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Starfield {
  readonly points: Points;
  private material: ShaderMaterial;
  /** brightness multiplier (owner dims for daylight / sun glare) */
  intensity = 1;
  /** 0..1 scintillation */
  twinkle = 0.1;
  /** 0..1 horizon extinction (camera inside an atmosphere) */
  extinction = 0;
  readonly up = new Vector3(0, 1, 0);

  constructor(layout: SkyLayout, seed: number, count: number) {
    const rng = new Rng((seed ^ 0x57a25) >>> 0);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const bright = new Float32Array(count);
    const seeds = new Float32Array(count);
    const n = layout.galN;
    const t1 = new Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize();
    const t2 = new Vector3().crossVectors(n, t1);
    const d = new Vector3();
    const c = new Color();
    const white = new Color(1, 1, 1);
    for (let i = 0; i < count; i++) {
      if (rng.chance(0.42)) {
        // crowd into the galactic band (gaussian latitude, denser toward the centre)
        const a = rng.range(0, Math.PI * 2);
        let g = 0;
        for (let k = 0; k < 4; k++) g += rng.next();
        const lat = (g - 2) * 0.16;
        d.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).multiplyScalar(Math.cos(lat)).addScaledVector(n, Math.sin(lat));
        if (d.dot(layout.galC) < -0.2 && rng.chance(0.35)) d.negate().reflect(n);
      } else {
        const z = rng.range(-1, 1);
        const a = rng.range(0, Math.PI * 2);
        const r = Math.sqrt(1 - z * z);
        d.set(r * Math.cos(a), z, r * Math.sin(a));
      }
      d.normalize();
      pos[i * 3] = d.x;
      pos[i * 3 + 1] = d.y;
      pos[i * 3 + 2] = d.z;
      // brightness: power law — most stars faint, a handful brilliant
      const u = rng.next();
      let b = 0.04 + 0.62 * Math.pow(u, 7);
      if (rng.chance(0.004)) b = rng.range(0.78, 1);
      else if (rng.chance(0.03)) b = rng.range(0.45, 0.75);
      bright[i] = b;
      // colour temperature
      const k = rng.weighted([0, 1, 2, 3], [0.22, 0.3, 0.3, 0.18]);
      const kelvin = k === 0 ? rng.range(2600, 3900) : k === 1 ? rng.range(3900, 5600) : k === 2 ? rng.range(5600, 8000) : rng.range(8000, 26000);
      kelvinColor(kelvin, c);
      // exaggerate the hue a little (real stars are subtle; games are not)
      c.lerp(white, -0.45);
      c.r = Math.max(0.05, c.r);
      c.g = Math.max(0.05, c.g);
      c.b = Math.max(0.05, c.b);
      const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
      c.multiplyScalar(1 / Math.max(0.2, lum));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      seeds[i] = rng.next();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new BufferAttribute(col, 3));
    geo.setAttribute('aBright', new BufferAttribute(bright, 1));
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uTwinkle: { value: 0.1 },
        uIntensity: { value: 1 },
        uUp: { value: this.up },
        uExtinction: { value: 0 },
      },
    });
    this.points = new Points(geo, this.material);
    this.points.name = 'starfield';
    this.points.frustumCulled = false;
    this.points.renderOrder = -20;
  }

  update(time: number, pixelRatio: number): void {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uScale.value = pixelRatio;
    u.uTwinkle.value = this.twinkle;
    u.uIntensity.value = this.intensity;
    u.uExtinction.value = this.extinction;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
