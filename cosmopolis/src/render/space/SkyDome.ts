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

const _hsl = { h: 0, s: 0, l: 0 };

/** Catalogue colours are pastel UI tints; nebula gas needs rich, saturated emission colours of the same hue. */
function vivid(hex: number, sat: number, light: number): Color {
  const c = new Color(hex);
  c.getHSL(_hsl);
  return c.setHSL(_hsl.h, Math.max(_hsl.s, sat), light);
}

/** Circular hue distance (0..0.5). */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
}

/** Accent hues real emission nebulae show: H-alpha rose, OIII teal, sulphur amber, reflection violet. */
const ACCENTS = [0.94, 0.48, 0.08, 0.76];

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
  const colA = vivid(theme.colors?.[0] ?? pal[0], 0.8, 0.62);
  const colB = vivid(theme.colors?.[1] ?? pal[1], 0.78, 0.6);
  const colC = new Color(pal[2]);
  if (theme.colors) {
    // pick the accent hue farthest from both catalogue colours so the gas never turns muddy
    colA.getHSL(_hsl);
    const hA = _hsl.h;
    colB.getHSL(_hsl);
    const hB = _hsl.h;
    let best = ACCENTS[0];
    for (const h of ACCENTS) if (Math.min(hueGap(h, hA), hueGap(h, hB)) > Math.min(hueGap(best, hA), hueGap(best, hB))) best = h;
    colC.setHSL(best, 0.85, 0.6);
  }
  const nebulae: Vector4[] = [];
  for (let i = 0; i < 3; i++) {
    // first nebula sits on the galactic plane near the centre (emission nebulae trace the arms)
    const d = i === 0 ? galC.clone().addScaledVector(galN, rng.range(-0.15, 0.15)).applyAxisAngle(galN, rng.range(-0.9, 0.9)).normalize() : randomDir(rng);
    const radius = i === 0 ? rng.range(0.42, 0.6) : rng.range(0.24, 0.42);
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
    float haze = fbm( p * 7.0 + w, 5 ) * 0.5 + 0.5;
    float grains = fbm( p * 30.0, 3 ) * 0.5 + 0.5;
    // a soft central rift (like the Milky Way's Great Rift) broken into clouds, plus scattered dark clouds
    float rift = exp( -pow( ( latW + 0.03 * w.y ) / ( width * 0.38 ), 2.0 ) ) * smoothstep( 0.38, 0.62, fbm( p * 2.4 + w, 4 ) * 0.5 + 0.5 );
    float clouds = smoothstep( 0.56, 0.74, fbm( p * 4.2 + w * 0.8, 4 ) * 0.5 + 0.5 ) * band;
    float lane = max( rift, clouds * 0.8 );
    vec3 bandCol = mix( vec3( 0.55, 0.62, 0.92 ), vec3( 1.0, 0.82, 0.6 ), smoothstep( 0.55, 1.0, toC ) );
    float bandI = band * ( 0.25 + 0.75 * haze * haze ) * ( 0.6 + 0.55 * grains * grains ) + bulge * 0.7;
    col += bandCol * bandI * 0.11 * ( 1.0 - lane * 0.88 );
    col += mix( uColA, uColB, haze ) * band * haze * 0.01;
    col += vec3( 0.05, 0.022, 0.012 ) * lane * band * 0.08;
  }
  col += mix( vec3( 0.35, 0.4, 0.6 ), vec3( 0.8, 0.6, 0.45 ), toC ) * glowBand * 0.012;
  // ── emission nebulae: soft glowing gas with a cool OIII heart and a warm H-alpha shell, rose accent patches,
  //    white-gold star-forming cores, a few bright ionisation fronts and broad dark dust clouds in silhouette.
  //    Irregular outlines (noise-displaced radius) and a gentle low-frequency warp keep them organic, not marbled.
  for ( int i = 0; i < 3; i++ ) {
    float c = dot( d, uNeb[ i ].xyz );
    if ( c < uNeb[ i ].w - 0.25 ) continue;
    float fi = float( i );
    vec3 q = d * 1.8 + uSeedOff * ( 0.37 * ( fi + 1.0 ) );
    float rr = acos( clamp( c, -1.0, 1.0 ) ) / acos( uNeb[ i ].w );
    rr += fbm( q * 1.2 + 11.0, 3 ) * 0.45;
    float m = 1.0 - smoothstep( 0.1, 1.0, rr );
    if ( m <= 0.0 ) continue;
    float lead = 1.0 - fi * 0.18;
    vec3 wq = vec3( fbm( q * 0.6, 3 ), fbm( q * 0.6 + 5.2, 3 ), fbm( q * 0.6 + 9.7, 3 ) );
    vec3 qw = q + wq * 0.6;
    float dens = ( fbm( qw * 1.5, 5 ) * 0.5 + 0.5 ) * 0.75 + ( fbm( qw * 3.3 + 2.0, 4 ) * 0.5 + 0.5 ) * 0.25;
    float gas = smoothstep( 0.4, 0.82, dens + ( m - 0.6 ) * 0.45 ) * smoothstep( 0.0, 0.5, m );
    // colour: broad patches of the two emission colours, leaning cool toward the heart (saturation restored
    // through the blend so complementary pairs never go grey), rose accent patches
    float zone = smoothstep( 0.36, 0.64, fbm( qw * 0.75 + 3.3, 3 ) * 0.5 + 0.5 + ( rr - 0.45 ) * 0.35 );
    vec3 ec = mix( uColB, uColA, zone );
    float el = dot( ec, vec3( 0.2126, 0.7152, 0.0722 ) );
    ec = max( mix( vec3( el ), ec, 1.0 + 3.0 * zone * ( 1.0 - zone ) ), 0.0 );
    float acc = smoothstep( 0.58, 0.82, fbm( qw * 1.1 - 6.1, 3 ) * 0.5 + 0.5 );
    ec = mix( ec, uColC, acc * 0.7 );
    // ionisation fronts, hot cores
    float fil = smoothstep( 0.72, 0.96, ridged( qw * 1.7 + 4.0, 3 ) ) * gas;
    float core = pow( gas, 2.6 );
    // dust clouds and a few dark globules
    float dust = smoothstep( 0.55, 0.74, fbm( qw * 1.4 - 2.0, 4 ) * 0.5 + 0.5 ) * smoothstep( 0.0, 0.45, m );
    dust = max( dust, smoothstep( 0.67, 0.78, fbm( qw * 3.2 + 8.0, 3 ) * 0.5 + 0.5 ) * m * 0.9 );
    vec3 glow = ec * ( gas * 0.13 + fil * 0.07 + m * 0.008 ) + mix( ec, vec3( 1.0, 0.94, 0.86 ), 0.6 ) * core * 0.16;
    col = col * ( 1.0 - dust * 0.75 * m ) + glow * lead * ( 1.0 - dust * 0.85 );
  }
  // ── faint intergalactic wisps everywhere so no part of the sky is dead flat
  float wisp = fbm( p * 1.1 + w * 0.4, 5 ) * 0.5 + 0.5;
  col += mix( uColB, uColA, wisp ) * pow( wisp, 5.0 ) * 0.02;
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
  // sample in sky space (the cube turns with the sky group), project in world space
  vDir = position;
  gl_Position = skyClip( mat3( modelMatrix ) * position );
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
