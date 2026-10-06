/**
 * OWNER: space-post.
 * SkyDome — the deep-space backdrop: a procedural nebula / galactic band / distant galaxies cube map, baked once on the
 * GPU (one cube face per frame, so loading never hitches) and drawn as a camera-centred box at the far plane.
 *
 *   const sky = new SkyDome(renderer, theme, size)   theme = { seed, colors? } (see skyLayout)
 *   group.add(sky.mesh); sky.update() every frame (finishes the bake, fades in); sky.intensity = 0..n
 *   sky.layout                                       shared random layout (galactic plane for the starfield)
 *
 * Baked cubes are cached (LRU of 2, ref-counted) so hopping between planets of one star system is free.
 * Usable by any View (cosmos may put one behind its system / galaxy scenes).
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  CubeCamera,
  LinearFilter,
  Mesh,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  Vector4,
  WebGLCubeRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer,
  Scene,
} from 'three';
import { Rng } from '../../core/rng';
import { GLSL_FBM, GLSL_HASH, GLSL_SIMPLEX, GLSL_SKY_VERTEX } from './glsl';

export interface SkyTheme {
  /** stable seed — one per star system so every planet of a system shares its sky */
  seed: number;
  /** two dominant nebula colours (sRGB hex), e.g. the galaxy's colours from the universe catalogue */
  colors?: [number, number];
}

/** Curated nebula palettes (sRGB): emission A, emission B, filament highlight C. */
const PALETTES: [number, number, number][] = [
  [0xff4f9a, 0x3fc8ff, 0x8a6cff], // Orion — magenta & cyan
  [0xff7a3d, 0x9b3bff, 0xffd17a], // Ember — orange & violet
  [0x4fb8ff, 0x7d5cff, 0x9bffea], // Glacier — ice blue & indigo
  [0x3dffb0, 0x2f7dff, 0xfff07a], // Verdant — jade & cobalt
  [0xff6fa8, 0xffb36b, 0x8a5cff], // Rose — pink & peach
  [0x2f6bff, 0xff3d6e, 0x55ffd5], // Abyss — deep blue & crimson
];

export interface SkyLayout {
  /** galactic plane normal (sky space) */
  galN: Vector3;
  /** galactic centre direction (in the plane) */
  galC: Vector3;
  colA: Color;
  colB: Color;
  colC: Color;
  nebulae: Vector4[];
  galaxies: Vector4[];
  galaxyParams: Vector4[];
  galaxyColors: Color[];
  seedOffset: Vector3;
}

function randomDir(rng: Rng, out = new Vector3()): Vector3 {
  const z = rng.range(-1, 1);
  const a = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}

/** Deterministic sky layout for a theme (also used by the starfield to crowd stars into the galactic band). */
export function skyLayout(theme: SkyTheme): SkyLayout {
  const rng = new Rng((theme.seed ^ 0x5eed5) >>> 0);
  const galN = randomDir(rng).normalize();
  // keep the band from lying flat along the ecliptic-ish horizon: bias it to a dramatic diagonal
  galN.y *= 0.6;
  galN.normalize();
  const tmp = randomDir(rng);
  const galC = tmp.addScaledVector(galN, -tmp.dot(galN)).normalize();
  const pal = rng.pick(PALETTES);
  const colA = new Color(theme.colors?.[0] ?? pal[0]);
  const colB = new Color(theme.colors?.[1] ?? pal[1]);
  const colC = new Color(pal[2]);
  if (theme.colors) colC.copy(colA).lerp(colB, 0.5).lerp(new Color(1, 1, 1), 0.35);
  const nebulae: Vector4[] = [];
  for (let i = 0; i < 3; i++) {
    // first nebula sits on the galactic plane near the centre (emission nebulae trace the arms)
    const d = i === 0 ? galC.clone().addScaledVector(galN, rng.range(-0.15, 0.15)).applyAxisAngle(galN, rng.range(-0.9, 0.9)).normalize() : randomDir(rng);
    const radius = i === 0 ? rng.range(0.55, 0.8) : rng.range(0.35, 0.65);
    nebulae.push(new Vector4(d.x, d.y, d.z, Math.cos(radius)));
  }
  const galaxies: Vector4[] = [];
  const galaxyParams: Vector4[] = [];
  const galaxyColors: Color[] = [];
  let guard = 0;
  while (galaxies.length < 5 && guard++ < 60) {
    const d = randomDir(rng);
    if (Math.abs(d.dot(galN)) < 0.35) continue; // dust in the band hides background galaxies
    const size = galaxies.length === 0 ? rng.range(0.05, 0.07) : rng.range(0.016, 0.04);
    galaxies.push(new Vector4(d.x, d.y, d.z, size));
    galaxyParams.push(
      new Vector4(
        rng.range(0.22, 1), // cos(inclination): 1 = face-on
        rng.range(0, Math.PI * 2), // rotation
        rng.chance(0.25) ? 1 : 0, // elliptical?
        rng.int(2, 3), // arms
      ),
    );
    galaxyColors.push(new Color().setHSL(rng.chance(0.6) ? rng.range(0.55, 0.68) : rng.range(0.02, 0.12), 0.55, 0.62));
  }
  return { galN, galC, colA, colB, colC, nebulae, galaxies, galaxyParams, galaxyColors, seedOffset: new Vector3(rng.range(-50, 50), rng.range(-50, 50), rng.range(-50, 50)) };
}

/** Linear scale stored in the 8-bit (gamma-encoded) cube: stored = pow(c / STORE, 1/2.2). */
const STORE = 0.6;

const BAKE_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uGalN;
uniform vec3 uGalC;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec3 uSeedOff;
uniform vec4 uNeb[ 3 ];
uniform vec4 uGx[ 5 ];
uniform vec4 uGxP[ 5 ];
uniform vec3 uGxCol[ 5 ];
${GLSL_HASH}
${GLSL_SIMPLEX}
${GLSL_FBM}

vec3 galaxy( vec3 d, vec4 g, vec4 gp, vec3 gcol ) {
  float c = dot( d, g.xyz );
  if ( c < 0.0 ) return vec3( 0.0 );
  vec3 t1 = normalize( cross( g.xyz, abs( g.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
  vec3 t2 = cross( g.xyz, t1 );
  vec2 uv = vec2( dot( d, t1 ), dot( d, t2 ) ) / g.w;
  if ( dot( uv, uv ) > 4.0 ) return vec3( 0.0 );
  float cr = cos( gp.y ), sr = sin( gp.y );
  uv = mat2( cr, -sr, sr, cr ) * uv;
  uv.y /= max( gp.x, 0.18 );
  float r = length( uv );
  float a = atan( uv.y, uv.x );
  float core = exp( -r * r * 55.0 );
  vec3 col;
  if ( gp.z > 0.5 ) {
    float body = exp( -r * r * 3.2 );
    col = mix( gcol, vec3( 1.0, 0.86, 0.7 ), 0.6 ) * body * 0.22 + vec3( 1.0, 0.9, 0.78 ) * core * 0.7;
  } else {
    float arms = 0.5 + 0.5 * cos( gp.w * ( a - log( r + 0.03 ) * 2.4 ) );
    float clump = 0.6 + 0.4 * snoise( vec3( uv * 9.0, g.x * 40.0 ) );
    arms = pow( arms, 2.5 ) * clump;
    float disc = exp( -r * 3.2 ) * smoothstep( 1.25, 0.25, r );
    float dustLane = 1.0 - 0.55 * smoothstep( 0.2, 0.0, abs( uv.y ) * ( 1.0 - gp.x ) * 3.0 ) * step( gp.x, 0.6 );
    col = gcol * disc * ( 0.18 + 0.9 * arms ) * 0.28 * dustLane + vec3( 1.0, 0.88, 0.72 ) * core * 0.9;
  }
  return col;
}

vec3 sky( vec3 d ) {
  vec3 col = vec3( 0.0026, 0.0032, 0.0072 );
  vec3 p = d + uSeedOff;
  // ── galactic band (Milky-Way style): warped gaussian band, warm bulge, star clouds and dark dust lanes
  float lat = dot( d, uGalN );
  vec3 w = vec3( snoise( p * 1.9 ), snoise( p * 1.9 + 7.3 ), snoise( p * 1.9 + 13.1 ) );
  float latW = lat + 0.05 * w.x + 0.025 * snoise( p * 5.5 );
  float toC = dot( d, uGalC ) * 0.5 + 0.5;
  float width = mix( 0.1, 0.2, pow( toC, 3.0 ) );
  float band = exp( -latW * latW / ( width * width ) );
  float bulge = pow( toC, 10.0 ) * exp( -lat * lat / 0.04 );
  float glowBand = exp( -latW * latW / ( width * width * 6.0 ) );
  if ( band > 0.004 || bulge > 0.004 ) {
    float haze = fbm( p * 8.0 + w, 5 ) * 0.5 + 0.5;
    float grains = fbm( p * 34.0, 3 ) * 0.5 + 0.5;
    float dust = ridged( p * 4.6 + w * 0.7, 5 );
    float lane = smoothstep( 0.42, 0.8, dust ) * exp( -latW * latW / ( width * width * 0.3 ) );
    vec3 bandCol = mix( vec3( 0.52, 0.6, 0.9 ), vec3( 1.0, 0.8, 0.58 ), smoothstep( 0.55, 1.0, toC ) );
    float bandI = band * ( 0.25 + 0.75 * haze * haze ) * ( 0.55 + 0.6 * grains * grains ) + bulge * 1.3;
    col += bandCol * bandI * 0.13 * ( 1.0 - lane * 0.92 );
    col += mix( uColA, uColB, 0.5 ) * band * haze * 0.012;
    col += vec3( 0.06, 0.025, 0.012 ) * lane * band * 0.1;
  }
  col += mix( vec3( 0.35, 0.4, 0.6 ), vec3( 0.8, 0.6, 0.45 ), toC ) * glowBand * 0.012;
  // ── emission nebulae: domain-warped fbm clouds, bright filaments, dark globules
  for ( int i = 0; i < 3; i++ ) {
    float c = dot( d, uNeb[ i ].xyz );
    float m = smoothstep( uNeb[ i ].w, 1.0, c );
    if ( m <= 0.0 ) continue;
    vec3 q = d * 2.6 + uSeedOff * ( 0.37 * float( i + 1 ) );
    vec3 wq = vec3( fbm( q, 4 ), fbm( q + 5.2, 4 ), fbm( q + 9.7, 4 ) );
    float n = fbm( q * 1.7 + wq * 1.9, 6 ) * 0.5 + 0.5;
    float fil = 1.0 - abs( snoise( q * 3.4 + wq * 2.2 ) );
    fil = pow( fil, 7.0 );
    float body = smoothstep( 0.3, 0.9, n + m * 0.3 - 0.15 ) * m;
    vec3 ncol = mix( uColA, uColB, smoothstep( -0.35, 0.35, wq.x + float( i ) * 0.3 - 0.3 ) );
    vec3 neb = ncol * body * body * 0.3 + uColC * fil * m * n * 0.16;
    neb += mix( ncol, vec3( 1.0 ), 0.5 ) * pow( body, 6.0 ) * 0.25;
    float glob = smoothstep( 0.58, 0.82, fbm( q * 3.6 - wq * 1.3, 4 ) * 0.5 + 0.5 ) * m;
    col = ( col + neb ) * ( 1.0 - glob * 0.8 );
  }
  // ── faint intergalactic wisps everywhere so no part of the sky is dead flat
  float wisp = fbm( p * 1.25 + w * 0.6, 5 ) * 0.5 + 0.5;
  col += mix( uColB, uColA, wisp ) * pow( wisp, 4.0 ) * 0.035;
  // ── unresolved star dust
  float sd = sHash13( floor( d * 900.0 ) );
  col += vec3( 0.7, 0.75, 0.9 ) * step( 0.9965, sd ) * ( 0.03 + band * 0.08 );
  // ── distant galaxies
  for ( int i = 0; i < 5; i++ ) col += galaxy( d, uGx[ i ], uGxP[ i ], uGxCol[ i ] );
  return col;
}

void main() {
  vec3 d = normalize( vDir );
  vec3 c = sky( d );
  vec3 g = pow( clamp( c / ${STORE.toFixed(3)}, 0.0, 1.0 ), vec3( 1.0 / 2.2 ) );
  g += ( sHash12( gl_FragCoord.xy + d.xy * 97.0 ) - 0.5 ) / 255.0;
  gl_FragColor = vec4( g, 1.0 );
}
`;

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
${GLSL_SKY_VERTEX}
void main() {
  vDir = mat3( modelMatrix ) * position;
  gl_Position = skyClip( vDir );
}
`;

const DOME_FRAG = /* glsl */ `
uniform samplerCube uSky;
uniform float uIntensity;
uniform vec3 uTint;
varying vec3 vDir;
void main() {
  vec3 c = textureCube( uSky, normalize( vDir ) ).rgb;
  c = pow( c, vec3( 2.2 ) ) * ${STORE.toFixed(3)};
  gl_FragColor = vec4( c * uIntensity * uTint, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface CacheEntry {
  key: string;
  rt: WebGLCubeRenderTarget;
  faces: number;
  refs: number;
  scene: Scene | null;
  cam: CubeCamera | null;
  mat: ShaderMaterial | null;
  geo: BoxGeometry | null;
}

const cache: CacheEntry[] = [];
const CACHE_MAX = 2;

function releaseBakeResources(e: CacheEntry): void {
  e.mat?.dispose();
  e.geo?.dispose();
  e.scene = null;
  e.cam = null;
  e.mat = null;
  e.geo = null;
}

function trimCache(): void {
  while (cache.length > CACHE_MAX) {
    const idx = cache.findIndex((e) => e.refs <= 0);
    if (idx < 0) return;
    const [e] = cache.splice(idx, 1);
    releaseBakeResources(e);
    e.rt.dispose();
  }
}

function acquire(theme: SkyTheme, size: number, layout: SkyLayout): CacheEntry {
  const key = `${theme.seed}|${theme.colors?.join(',') ?? ''}|${size}`;
  let e = cache.find((c) => c.key === key);
  if (e) {
    e.refs++;
    cache.splice(cache.indexOf(e), 1);
    cache.push(e);
    return e;
  }
  const rt = new WebGLCubeRenderTarget(size, { format: RGBAFormat, type: UnsignedByteType, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
  rt.texture.name = 'cosmo-sky';
  const mat = new ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uGalN: { value: layout.galN },
      uGalC: { value: layout.galC },
      uColA: { value: layout.colA },
      uColB: { value: layout.colB },
      uColC: { value: layout.colC },
      uSeedOff: { value: layout.seedOffset },
      uNeb: { value: layout.nebulae },
      uGx: { value: layout.galaxies },
      uGxP: { value: layout.galaxyParams },
      uGxCol: { value: layout.galaxyColors },
    },
  });
  const geo = new BoxGeometry(2, 2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geo, mat));
  const cam = new CubeCamera(0.1, 10, rt);
  scene.add(cam);
  e = { key, rt, faces: 0, refs: 1, scene, cam, mat, geo };
  cache.push(e);
  trimCache();
  return e;
}

export class SkyDome {
  readonly mesh: Mesh;
  readonly layout: SkyLayout;
  /** overall brightness multiplier (daylight / glare dimming is applied by the owner) */
  intensity = 1;
  readonly tint = new Color(1, 1, 1);
  private entry: CacheEntry;
  private fade = 0;
  private material: ShaderMaterial;
  private disposed = false;

  constructor(
    private renderer: WebGLRenderer,
    theme: SkyTheme,
    size = 1024,
  ) {
    this.layout = skyLayout(theme);
    this.entry = acquire(theme, size, this.layout);
    if (this.entry.faces >= 6) this.fade = 1;
    this.material = new ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: BackSide,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        uSky: { value: this.entry.rt.texture },
        uIntensity: { value: 0 },
        uTint: { value: this.tint },
      },
    });
    this.mesh = new Mesh(new BoxGeometry(1, 1, 1), this.material);
    this.mesh.name = 'sky-dome';
    this.mesh.frustumCulled = false;
    // drawn after all opaque geometry, so early-z rejects every covered pixel
    this.mesh.renderOrder = 1000;
  }

  /** true once the cube is fully baked */
  get ready(): boolean {
    return this.entry.faces >= 6;
  }

  /** Bake one more face if needed (spreads the GPU cost over frames) and update uniforms. */
  update(dt: number): void {
    if (this.disposed) return;
    const e = this.entry;
    if (e.faces < 6) this.bakeFace(e);
    if (e.faces >= 6) this.fade = Math.min(1, this.fade + dt * 0.8);
    this.material.uniforms.uIntensity.value = this.intensity * this.fade * this.fade;
  }

  /** Bake every remaining face right now (e.g. before a photo capture). */
  finish(): void {
    while (this.entry.faces < 6) this.bakeFace(this.entry);
    this.fade = 1;
  }

  private bakeFace(e: CacheEntry): void {
    const r = this.renderer;
    const cam = e.cam;
    if (!cam || !e.scene) return;
    const prevTarget = r.getRenderTarget();
    const prevFace = r.getActiveCubeFace();
    const prevMip = r.getActiveMipmapLevel();
    const prevAuto = r.autoClear;
    const prevXr = r.xr.enabled;
    try {
      if (cam.coordinateSystem !== r.coordinateSystem) {
        cam.coordinateSystem = r.coordinateSystem;
        cam.updateCoordinateSystem();
      }
      cam.updateMatrixWorld(true);
      r.xr.enabled = false;
      r.autoClear = true;
      r.setRenderTarget(e.rt, e.faces);
      r.render(e.scene, cam.children[e.faces] as PerspectiveCamera);
    } catch (err) {
      console.error('[sky] bake failed', err);
      e.faces = 6;
    } finally {
      r.setRenderTarget(prevTarget, prevFace, prevMip);
      r.autoClear = prevAuto;
      r.xr.enabled = prevXr;
    }
    e.faces++;
    if (e.faces >= 6) releaseBakeResources(e);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.entry.refs--;
    trimCache();
  }
}
