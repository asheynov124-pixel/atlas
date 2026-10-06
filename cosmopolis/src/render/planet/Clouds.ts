/**
 * OWNER: terrain.
 * Clouds — a GPU-baked noise cube (simplex fbm with domain warp, 3 frequencies in R/G/B, baked once per planet
 * with a CubeCamera) sampled by a cloud shell that drifts in two counter-rotating layers. Lit by the sun with
 * self-shadowing, sunset-tinted at the terminator, dark on the night side, silver-lined at the rim. Fades out as
 * the camera descends so it never blocks building. The same cube drives cloud shadows on terrain & water.
 */
import {
  BackSide,
  Color,
  CubeCamera,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import { SHADER_COMMON, shared } from '../materials';
import { GLSL_CLOUDS, GLSL_SIMPLEX } from './glsl';
import type { SurfaceUniforms } from './SurfaceUniforms';

const BAKE_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const BAKE_FRAG = /* glsl */ `
uniform float uSeed;
varying vec3 vDir;
${GLSL_SIMPLEX}
float fbm6( vec3 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 6; i++ ) { s += a * snoise( p ); p *= 2.03; a *= 0.5; } return s; }
float fbm4( vec3 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 4; i++ ) { s += a * snoise( p ); p *= 2.07; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize( vDir );
  vec3 o = vec3( uSeed * 0.37, uSeed * 0.11, uSeed * 0.73 );
  vec3 w = d * 1.5 + o;
  vec3 warp = vec3( snoise( w ), snoise( w + 5.2 ), snoise( w + 9.7 ) );
  // layer A: big weather systems, gently stretched along latitude bands
  vec3 da = vec3( d.x, d.y * 1.35, d.z );
  float a = fbm6( da * 2.3 + warp * 0.45 + o );
  // layer B: streaky cirrus-like detail
  vec3 db = vec3( d.x, d.y * 2.2, d.z );
  float b = fbm4( db * 4.6 + warp * 0.25 + o * 1.7 );
  float c = fbm4( d * 11.0 + o * 2.3 );
  gl_FragColor = vec4( a * 0.62 + 0.5, b * 0.62 + 0.5, c * 0.5 + 0.5, 1.0 );
}
`;

const SHELL_VERT = /* glsl */ `
varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHELL_FRAG = /* glsl */ `
${SHADER_COMMON}
${GLSL_CLOUDS}
uniform float uOpacity;
uniform vec3 uTint;
varying vec3 vWPos;
void main() {
  vec3 dir = normalize( vWPos );
  float d = tCloud( dir );
  if ( d < 0.004 ) { gl_FragColor = vec4( 0.0 ); return; }
  float ds = tCloud( normalize( dir + uSunDir * 0.025 ) );
  float sunUp = dot( dir, uSunDir );
  float day = smoothstep( -0.22, 0.28, sunUp );
  float selfShadow = 1.0 - ds * 0.55;
  float lit = ( 0.42 + 0.58 * selfShadow * max( sunUp + 0.25, 0.0 ) / 1.25 ) * day;
  float dusk = exp( -sunUp * sunUp * 22.0 ) * smoothstep( -0.32, 0.06, sunUp );
  vec3 col = uTint * lit + vec3( 1.0, 0.52, 0.28 ) * dusk * 0.65 + vec3( 0.03, 0.04, 0.07 ) * ( 1.0 - day );
  col = mix( col, col * vec3( 0.55, 0.58, 0.66 ), uCloudStorm * d );
  vec3 V = normalize( cameraPosition - vWPos );
  float rim = pow( 1.0 - abs( dot( dir, V ) ), 3.0 );
  col += rim * 0.22 * day * uTint;
  float a = d * uOpacity * ( 0.7 + 0.2 * day );
  gl_FragColor = vec4( col, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const _m4 = new Matrix4();
const _m4b = new Matrix4();

export class Clouds {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly radius: number;
  private rt: WebGLCubeRenderTarget | null = null;
  private opacity = { value: 0 };
  private tint = { value: new Color(0xffffff) };
  /** user / settings visibility */
  enabled = true;
  /** baseline cover from the planet spec (god powers may override `cover`) */
  cover: number;
  private baked = false;
  private drift = 0;

  constructor(private planetRadius: number, cover: number, private seed: number, private u: SurfaceUniforms) {
    this.cover = cover;
    this.radius = planetRadius + Math.max(5.2, planetRadius * 0.085);
    u.uCloudR.value = this.radius;
    u.uCloudCover.value = cover;
    this.material = new ShaderMaterial({
      name: 'clouds',
      uniforms: { ...shared, ...u, uOpacity: this.opacity, uTint: this.tint } as unknown as ShaderMaterial['uniforms'],
      vertexShader: SHELL_VERT,
      fragmentShader: SHELL_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(new SphereGeometry(this.radius, 128, 72), this.material);
    this.mesh.name = 'clouds';
    this.mesh.renderOrder = 4;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Bake the noise cube (once; needs the renderer). */
  bake(renderer: WebGLRenderer): void {
    if (this.baked) return;
    this.baked = true;
    const size = 256;
    const rt = new WebGLCubeRenderTarget(size, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter });
    const scene = new Scene();
    const mat = new ShaderMaterial({
      uniforms: { uSeed: { value: (this.seed % 997) * 0.731 } },
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const geo = new SphereGeometry(1, 64, 32);
    const sphere = new Mesh(geo, mat);
    scene.add(sphere);
    const cam = new CubeCamera(0.1, 10, rt);
    scene.add(cam);
    const prevAuto = renderer.autoClear;
    renderer.autoClear = true;
    try {
      cam.update(renderer, scene);
    } finally {
      renderer.autoClear = prevAuto;
    }
    geo.dispose();
    mat.dispose();
    this.rt = rt;
    this.u.uCloudCube.value = rt.texture;
  }

  get ready(): boolean {
    return !!this.rt;
  }

  /** altitude = camera height above the planet radius */
  update(dt: number, altitude: number, time: number, lowQuality: boolean): void {
    this.drift = time;
    const ra = _m4.makeRotationY(this.drift * 0.0045);
    this.u.uCloudRotA.value.setFromMatrix4(ra);
    const rb = _m4b.makeRotationX(0.32).multiply(_m4.makeRotationY(-this.drift * 0.0075 + 1.3));
    this.u.uCloudRotB.value.setFromMatrix4(rb);
    const cover = this.u.uCloudCover.value;
    const alt0 = this.radius - this.planetRadius;
    const fade = smooth(alt0 + 34, alt0 + 80, altitude);
    const target = this.enabled && this.rt && cover > 0.01 ? fade : 0;
    this.opacity.value += (target - this.opacity.value) * Math.min(1, dt * 4);
    if (target === 0 && this.opacity.value < 0.01) this.opacity.value = 0;
    this.mesh.visible = this.opacity.value > 0.005;
    // ground shadows: softer while zoomed in (clouds themselves are hidden there)
    this.u.uCloudShadow.value = this.rt && this.enabled && !lowQuality ? Math.min(0.5, cover * 0.75) * (0.45 + 0.55 * fade) : 0;
  }

  setTint(color: number): void {
    this.tint.value.setHex(color);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.rt?.dispose();
    this.rt = null;
    this.u.uCloudCube.value = null;
  }
}

function smooth(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

