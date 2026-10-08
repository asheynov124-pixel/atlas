/**
 * Shared uniforms + the shared building material (FOUNDATION, CONTRACT).
 *
 * `shared` uniforms are updated once per frame by PlanetView and may be merged into any custom shader
 * (terrain, water, props...) so everything agrees on time / sun direction / night factor.
 *
 * The building material reads the kit's `aMat` attribute (see content/kit.ts `Mat`):
 *   aMat = matId + (paintable ? 100 : 0). Instance colour (tint) only applies to paintable surfaces.
 * Night is computed per fragment from the planet-centre → fragment direction vs. the sun direction,
 * so the dark side of the planet lights up automatically.
 */
import { Color, MeshStandardMaterial, Vector3, type Material, type WebGLProgramParametersWithUniforms } from 'three';

export const shared = {
  uTime: { value: 0 },
  /** unit vector from planet centre toward the sun (world space) */
  uSunDir: { value: new Vector3(0.8, 0.35, 0.5).normalize() },
  uPlanetCenter: { value: new Vector3(0, 0, 0) },
  /** global multiplier for night-time emissive (windows, lamps) */
  uNightLights: { value: 1 },
  /** default warm window colour; styles may tint per building via vertex colours on Glow parts */
  uWindowColor: { value: new Color(0xffd29a) },
  /** 0..1 global "everything is on fire / apocalypse" tint used by god powers */
  uApocalypse: { value: 0 },
  /** camera world position */
  uCameraPos: { value: new Vector3() },
  /** strength of the procedural sky reflection (cheap planet-aware IBL for metals and glass; 0 disables) */
  uEnvIntensity: { value: 0.85 },
};

export const SHADER_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uPlanetCenter;
uniform float uNightLights;
uniform vec3 uWindowColor;
uniform float uApocalypse;
uniform vec3 uCameraPos;
uniform float uEnvIntensity;
float cHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cNight(vec3 wpos) { vec3 up = normalize(wpos - uPlanetCenter); return smoothstep(0.10, -0.20, dot(up, uSunDir)); }
`;

/** Per-instance visual states (InstancePool.setState). CONTRACT. */
export const InstState = {
  Normal: 0,
  /** lights off, desaturated (abandoned) */
  Dark: 1,
  /** flickering orange glow, charred */
  Burning: 2,
  /** icy blue-white */
  Frozen: 3,
  /** grey goo metallic */
  Goo: 4,
  /** golden divine glow */
  Blessed: 5,
  /** sickly green glow */
  Irradiated: 6,
  /** pulsing cyan selection highlight */
  Highlight: 7,
  /** translucent-looking blueprint (under construction) */
  Blueprint: 8,
  /** blackout: lights, windows and signs off (no power), otherwise normal */
  NoPower: 9,
} as const;

const VERT_PARS = /* glsl */ `
attribute float aMat;
attribute float aState;
varying float vState;
varying float vMat;
varying float vPaint;
varying vec2 vFac;
varying vec3 vWPos;
varying vec3 vSeed;
${SHADER_COMMON}
`;

const VERT_COLOR = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
  vColor = vec4( 1.0 );
#endif
#if defined( USE_COLOR )
  vColor.rgb *= color;
#endif
vPaint = step( 99.5, aMat );
vMat = aMat - vPaint * 100.0;
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, vPaint );
#endif
vFac = uv;
vState = aState;
`;

const VERT_BEGIN = /* glsl */ `
vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  vec3 cInstPos = instanceMatrix[3].xyz;
#else
  vec3 cInstPos = vec3( modelMatrix[3].xyz );
#endif
vSeed = fract( cInstPos * vec3( 0.1371, 0.2113, 0.0917 ) ) * 10.0;
if ( abs( vMat - 7.0 ) < 0.5 ) {
  float sway = sin( uTime * 1.6 + vSeed.x * 6.0 + position.x * 2.0 ) * 0.035 * max( position.y, 0.0 );
  transformed.x += sway;
  transformed.z += sway * 0.6;
}
#ifdef USE_INSTANCING
  vWPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
#else
  vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#endif
`;

const FRAG_PARS = /* glsl */ `
varying float vState;
varying float vMat;
varying float vPaint;
varying vec2 vFac;
varying vec3 vWPos;
varying vec3 vSeed;
${SHADER_COMMON}
`;

const FRAG_MAIN = /* glsl */ `
int cMat = int( vMat + 0.5 );
float cNightF = cNight( vWPos );
vec3 cEmit = vec3( 0.0 );
if ( cMat == 1 || cMat == 5 || cMat == 12 ) {
  vec2 cell = cMat == 12 ? vec2( 0.26, 0.2 ) : ( cMat == 5 ? vec2( 0.11, 0.2 ) : vec2( 0.17, 0.2 ) );
  vec2 wsz = cMat == 12 ? vec2( 0.42, 0.45 ) : ( cMat == 5 ? vec2( 0.9, 0.72 ) : vec2( 0.58, 0.55 ) );
  vec2 g = vFac / cell;
  vec2 id = floor( g );
  vec2 f = fract( g );
  vec2 fw = max( fwidth( g ), vec2( 1e-4 ) );
  vec2 wmin = ( 1.0 - wsz ) * 0.5;
  vec2 aa = smoothstep( wmin - fw, wmin + fw, f ) * ( 1.0 - smoothstep( 1.0 - wmin - fw, 1.0 - wmin + fw, f ) );
  float win = aa.x * aa.y;
  float tiny = smoothstep( 0.3, 0.85, max( fw.x, fw.y ) );
  win = mix( win, wsz.x * wsz.y, tiny );
  float rnd = cHash12( id + vSeed.xy * 13.7 + vSeed.z );
  float slow = floor( uTime * 0.05 + rnd * 20.0 );
  float rnd2 = cHash12( id * 1.37 + slow );
  float litChance = mix( 0.18, 0.74, cNightF );
  float lit = mix( step( 1.0 - litChance, rnd2 ), litChance, tiny );
  vec3 glassCol = cMat == 5 ? mix( diffuseColor.rgb, vec3( 0.09, 0.13, 0.2 ), 0.55 ) : vec3( 0.07, 0.1, 0.15 );
  diffuseColor.rgb = mix( diffuseColor.rgb, glassCol, win * ( cMat == 5 ? 1.0 : 0.9 ) );
  roughnessFactor = mix( roughnessFactor, 0.12, win );
  metalnessFactor = mix( metalnessFactor, 0.55, win * 0.6 );
  vec3 wc = uWindowColor * mix( 0.8, 1.2, cHash12( id * 1.7 + 3.0 ) );
  cEmit += wc * win * lit * ( 0.04 + cNightF * 1.7 ) * uNightLights * ( abs( vState - 1.0 ) < 0.5 || abs( vState - 2.0 ) < 0.5 ? 0.0 : 1.0 );
} else if ( cMat == 2 ) {
  cEmit += diffuseColor.rgb * ( 1.4 + cNightF * 0.8 );
} else if ( cMat == 3 ) {
  roughnessFactor = 0.26;
  metalnessFactor = 0.9;
} else if ( cMat == 4 ) {
  cEmit += diffuseColor.rgb * cNightF * 2.4 * uNightLights;
} else if ( cMat == 6 ) {
  vec2 g = vFac / vec2( 0.11 );
  vec2 f = fract( g );
  float fwm = max( fwidth( g ).x, fwidth( g ).y );
  float line = max( step( 0.9, f.x ), step( 0.9, f.y ) ) * ( 1.0 - smoothstep( 0.3, 0.8, fwm ) );
  diffuseColor.rgb = mix( vec3( 0.04, 0.08, 0.2 ), vec3( 0.55, 0.6, 0.7 ), line );
  roughnessFactor = 0.18;
  metalnessFactor = 0.75;
} else if ( cMat == 7 ) {
  roughnessFactor = 0.92;
  cEmit += diffuseColor.rgb * 0.035;
} else if ( cMat == 8 ) {
  float w = sin( vFac.x * 7.0 + uTime * 2.1 ) * sin( vFac.y * 6.0 - uTime * 1.7 );
  diffuseColor.rgb = mix( vec3( 0.08, 0.32, 0.58 ), vec3( 0.45, 0.8, 0.98 ), 0.5 + 0.5 * w );
  roughnessFactor = 0.06;
  metalnessFactor = 0.25;
  cEmit += vec3( 0.04, 0.14, 0.26 ) * cNightF;
} else if ( cMat == 9 ) {
  float scan = 0.55 + 0.45 * sin( vFac.y * 42.0 - uTime * 6.0 );
  float flick = 0.82 + 0.18 * sin( uTime * 23.0 + vSeed.x * 10.0 );
  cEmit += diffuseColor.rgb * 1.7 * scan * flick;
  diffuseColor.rgb *= 0.25;
} else if ( cMat == 10 ) {
  float n = sin( vFac.x * 3.1 + uTime * 0.9 ) * sin( vFac.y * 4.3 - uTime * 0.7 );
  vec3 hot = mix( vec3( 1.0, 0.22, 0.02 ), vec3( 1.0, 0.78, 0.2 ), 0.5 + 0.5 * n );
  cEmit += hot * 2.0;
  diffuseColor.rgb = hot * 0.35;
} else if ( cMat == 11 ) {
  float t = floor( uTime * 0.22 + vSeed.x * 5.0 );
  vec3 c1 = 0.55 + 0.45 * cos( 6.2831 * ( vec3( 0.0, 0.33, 0.67 ) + cHash12( vec2( t, vSeed.y ) ) ) );
  float bars = step( 0.5, fract( vFac.y * 2.5 + uTime * 0.4 ) );
  cEmit += mix( c1, c1.bgr, bars * 0.35 ) * 1.4;
  diffuseColor.rgb *= 0.15;
}
diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.0, 0.55, 0.4 ), uApocalypse * 0.6 );
int cState = int( vState + 0.5 );
if ( cState == 1 ) {
  float l = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( l ) * 0.55, 0.75 );
  cEmit *= 0.0;
} else if ( cState == 2 ) {
  float fl = 0.6 + 0.4 * sin( uTime * 13.0 + vWPos.y * 9.0 + vSeed.x * 7.0 ) * sin( uTime * 7.3 + vWPos.x * 5.0 );
  diffuseColor.rgb *= vec3( 0.25, 0.18, 0.15 );
  cEmit = vec3( 1.0, 0.35, 0.05 ) * ( 0.6 + fl * 1.4 ) * smoothstep( -0.2, 1.5, fract( vFac.y * 0.7 + vSeed.y ) + 0.4 );
} else if ( cState == 3 ) {
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.82, 0.92, 1.0 ), 0.7 );
  roughnessFactor = 0.25;
  cEmit += vec3( 0.05, 0.1, 0.16 );
} else if ( cState == 4 ) {
  float l = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  diffuseColor.rgb = vec3( 0.45 + 0.25 * sin( vWPos.x * 20.0 + uTime * 3.0 ) * sin( vWPos.z * 20.0 ) ) * ( 0.6 + l * 0.4 );
  metalnessFactor = 0.95;
  roughnessFactor = 0.3;
  cEmit = vec3( 0.0 );
} else if ( cState == 5 ) {
  cEmit += vec3( 1.0, 0.82, 0.35 ) * ( 0.5 + 0.3 * sin( uTime * 2.0 + vWPos.y * 3.0 ) );
} else if ( cState == 6 ) {
  cEmit += vec3( 0.35, 1.0, 0.25 ) * ( 0.35 + 0.25 * sin( uTime * 5.0 + vSeed.z ) );
} else if ( cState == 7 ) {
  cEmit += vec3( 0.25, 0.9, 1.0 ) * ( 0.35 + 0.25 * sin( uTime * 6.0 ) );
} else if ( cState == 8 ) {
  float grid = max( step( 0.92, fract( vFac.x * 4.0 ) ), step( 0.92, fract( vFac.y * 4.0 ) ) );
  diffuseColor.rgb = mix( vec3( 0.2, 0.45, 0.8 ), vec3( 0.7, 0.9, 1.0 ), grid );
  cEmit = vec3( 0.1, 0.35, 0.7 ) * ( 0.6 + grid );
} else if ( cState == 9 ) {
  cEmit *= 0.05;
}
`;

/**
 * Procedural planet-aware sky reflection — a cheap stand-in for an environment map so metals and glass read
 * instead of rendering near-black (the planet scene has no envMap). The reflected view ray is compared with the
 * LOCAL up (planet centre → fragment): sky gradient above the horizon, warm ground below, scaled by daylight with a
 * faint moonlit floor at night. Skipped when a real envMap is bound (thumbnails, Studio).
 */
const FRAG_ENV = /* glsl */ `
#ifndef USE_ENVMAP
if ( uEnvIntensity > 0.0 ) {
  vec3 cUpW = normalize( vWPos - uPlanetCenter );
  vec3 cNW = inverseTransformDirection( geometryNormal, viewMatrix );
  vec3 cRW = reflect( normalize( vWPos - cameraPosition ), cNW );
  float cRu = dot( cRW, cUpW );
  float cSunUp = dot( cUpW, uSunDir );
  float cDay = smoothstep( -0.12, 0.18, cSunUp );
  vec3 cZenith = mix( vec3( 0.012, 0.018, 0.04 ), vec3( 0.34, 0.52, 0.86 ), cDay );
  vec3 cHorizon = mix( vec3( 0.03, 0.035, 0.06 ), vec3( 0.78, 0.84, 0.92 ), cDay );
  cHorizon = mix( cHorizon, vec3( 0.95, 0.62, 0.38 ), cDay * ( 1.0 - smoothstep( 0.05, 0.3, cSunUp ) ) * 0.6 );
  vec3 cGround = mix( vec3( 0.012, 0.012, 0.016 ), vec3( 0.2, 0.19, 0.16 ), cDay );
  vec3 cSky = mix( cHorizon, cZenith, smoothstep( 0.0, 0.65, cRu ) );
  vec3 cEnvCol = mix( cGround, cSky, smoothstep( -0.18, 0.06, cRu ) );
  // a soft sun lobe in the reflection (the direct light handles the sharp highlight)
  cEnvCol += vec3( 1.0, 0.9, 0.75 ) * pow( max( dot( cRW, uSunDir ), 0.0 ), 24.0 ) * cDay * 0.6;
  radiance += cEnvCol * uEnvIntensity;
  irradiance += mix( cGround, cZenith, 0.5 + 0.5 * dot( cNW, cUpW ) ) * uEnvIntensity * 0.35 * metalnessFactor;
}
#endif
`;

/** Patch any MeshStandardMaterial so it understands kit attributes. Idempotent. */
export function patchBuildingMaterial<T extends MeshStandardMaterial>(mat: T, key = 'cosmo-building'): T {
  mat.vertexColors = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG_MAIN)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += cEmit;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + FRAG_ENV);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

let buildingMat: MeshStandardMaterial | null = null;
/** The single shared opaque building material (buildings, ploppables, props built with the kit). */
export function getBuildingMaterial(): MeshStandardMaterial {
  if (!buildingMat) {
    buildingMat = patchBuildingMaterial(new MeshStandardMaterial({ roughness: 0.78, metalness: 0.04 }));
    buildingMat.name = 'building';
  }
  return buildingMat;
}

/** Translucent variant for tool previews / ghosts. */
export function createGhostMaterial(color = 0x66ddff, opacity = 0.55): MeshStandardMaterial {
  const m = patchBuildingMaterial(
    new MeshStandardMaterial({ roughness: 0.5, metalness: 0.1, transparent: true, opacity, depthWrite: false, emissive: new Color(color), emissiveIntensity: 0.55 }),
    'cosmo-ghost',
  );
  m.name = 'ghost';
  return m;
}

/** Utility: dispose a material tree safely. */
export function disposeMaterial(m: Material | Material[]): void {
  if (Array.isArray(m)) m.forEach((x) => x.dispose());
  else m.dispose();
}
