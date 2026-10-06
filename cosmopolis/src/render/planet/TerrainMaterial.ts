/**
 * OWNER: terrain.
 * Terrain material — a MeshStandardMaterial patched with the stylised planet-surface shader:
 *   • sRGB vertex colours + AO, cliff walls with layered rock strata, turf lips and foot occlusion
 *   • biome effects: flowing lava crust (emissive), crystal iridescence & sparkles, toxic glowing pools,
 *     machine-world hex plates with glowing seams, bioluminescent fungi, snow/ice glints, dune ripples, wet swamps
 *   • snow line on peaks, wet shorelines with a lapping wash line, animated caustics under shallow water
 *   • tile flags: burning embers, flooded, scorched, frozen, grey goo, irradiated, blessed, locked
 *   • zone lots (subtle / strong with region outlines), build grid, district borders, lens overlay (desaturates the
 *     world so data pops), pulsing highlight channels with outlines
 *   • soft moonlight on the night side, cloud shadows and aerial haze from orbit
 * All per-tile state comes from data textures (see TileData.ts): texelFetch(tex, (id & 255, id >> 8)).
 */
import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { SHADER_COMMON, shared } from '../materials';
import { GLSL_CLOUDS, GLSL_HAZE, GLSL_NOISE } from './glsl';
import type { SurfaceUniforms } from './SurfaceUniforms';

const VERT_PARS = /* glsl */ `
attribute vec4 aCol;
attribute float aTile;
attribute vec2 aLocal;
attribute vec4 aInfo;
varying vec4 vCol;
flat varying float vTile;
varying vec2 vLocal;
flat varying vec4 vInfo;
varying vec3 vWPos;
`;

const VERT_MAIN = /* glsl */ `
vCol = aCol;
vTile = aTile;
vLocal = aLocal;
vInfo = aInfo;
vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;

const FRAG_PARS = /* glsl */ `
${SHADER_COMMON}
${GLSL_NOISE}
${GLSL_CLOUDS}
${GLSL_HAZE}
uniform highp sampler2D uTileTex;
uniform highp sampler2D uMaskTex;
uniform highp sampler2D uOverlayTex;
uniform highp sampler2D uHighTex;
uniform highp sampler2D uDistPal;
uniform float uRadius;
uniform float uWaterR;
uniform float uHasOcean;
uniform float uSnowLine;
uniform float uGrid;
uniform float uZoneVis;
uniform float uZoneStrong;
uniform float uOverlay;
uniform float uDistrict;
uniform float uSeed;
uniform float uGlow;
uniform float uCloudShadow;
uniform float uCloudR;
uniform float uSurfTime;
uniform vec3 uRock;
uniform vec3 uStrata;
uniform vec3 uSnowCol;
uniform vec3 uLavaCol;
uniform vec3 uMoonCol;
uniform vec3 uZoneCol[ 12 ];
varying vec4 vCol;
flat varying float vTile;
varying vec2 vLocal;
flat varying vec4 vInfo;
varying vec3 vWPos;
`;

/** Runs right after <color_fragment>: decides albedo, emissive, roughness & metalness. */
const FRAG_SURFACE = /* glsl */ `
vec3 tEmit = vec3( 0.0 );
float tRough = -1.0;
float tMetal = -1.0;
vec3 tUp = normalize( vWPos );
float tH = length( vWPos ) - uRadius;
float tNightF = cNight( vWPos );
int tBiome = int( vInfo.x + 0.5 );
int tPart = int( vInfo.y + 0.5 );
float tDeg = vInfo.z;
int tExtra = int( vInfo.w + 0.5 );
ivec2 tuv = tUV( vTile );
vec4 tTile = texelFetch( uTileTex, tuv, 0 );
vec4 tMask = texelFetch( uMaskTex, tuv, 0 );
int tFlags = int( tTile.r * 255.0 + 0.5 );
int tZone = int( tTile.g * 255.0 + 0.5 );
int tBits = int( tTile.b * 255.0 + 0.5 );
int tDMask = int( tTile.a * 255.0 + 0.5 );
int tZMask = int( tMask.r * 255.0 + 0.5 );
int tHMask = int( tMask.g * 255.0 + 0.5 );
int tDist = int( tMask.b * 255.0 + 0.5 );
int tWMask = int( tMask.a * 255.0 + 0.5 );
bool tWall = tPart == 1;
float tSeaH = uWaterR - uRadius;
bool tUnder = uHasOcean > 0.5 && tH < tSeaH - 0.01;
vec3 tAlb = tSrgb( vCol.rgb );
float tNz = tNoise( vWPos * 2.3 );
// hex-local geometry: distance to the nearest edge (0 at the edge, 1 at the centre) and that edge's bit
float tEd = 1.0;
int tEdgeBit = 0;
float tAng = 0.0;
if ( !tWall ) {
  tAng = atan( vLocal.y, vLocal.x );
  if ( tAng < 0.0 ) tAng += 6.2831853;
  float seg = 6.2831853 / tDeg;
  float k = floor( tAng / seg );
  float mid = ( k + 0.5 ) * seg;
  tEd = clamp( 1.0 - dot( vLocal, vec2( cos( mid ), sin( mid ) ) ) / cos( seg * 0.5 ), 0.0, 1.0 );
  tEdgeBit = 1 << int( min( k, 5.0 ) );
}
float tFw = max( fwidth( tEd ), 1e-4 );

if ( tWall ) {
  // ── cliff walls: layered strata, turf lip at the top, occlusion at the foot
  float wv = vLocal.x;
  float wh = vLocal.y * 8.0;
  float fromTop = ( 1.0 - wv ) * wh;
  float fromBot = wv * wh;
  float bandH = 0.15;
  float bandI = floor( tH / bandH );
  float bh = cHash12( vec2( bandI, uSeed ) );
  vec3 rock = uRock * mix( 0.74, 1.12, bh );
  rock = mix( rock, uStrata, step( 0.66, bh ) * 0.6 );
  rock = mix( rock, tAlb, 0.16 );
  float fb = fract( tH / bandH );
  rock *= 0.84 + 0.16 * smoothstep( 0.0, 0.16, fb );
  rock *= 0.9 + 0.18 * tNoise( vWPos * 4.5 );
  if ( tBiome == 10 ) rock = mix( rock, vec3( 0.55, 0.76, 0.93 ), 0.6 );
  else if ( tBiome == 9 ) rock = mix( rock, vec3( 0.8, 0.86, 0.92 ), 0.25 );
  else if ( tBiome == 17 ) rock = mix( rock, tAlb * 1.15, 0.5 );
  else if ( tBiome == 23 ) {
    float pl = step( 0.9, fract( tH * 3.125 ) );
    rock = mix( rock * 1.05, rock * 0.55, pl );
    tEmit += vec3( 0.12, 0.85, 1.0 ) * pl * ( 0.05 + 0.8 * tNightF ) * uGlow;
    tMetal = 0.7;
  }
  float lip = 1.0 - smoothstep( 0.03, 0.065 + 0.05 * tNoise( vWPos * 9.0 ), fromTop );
  tAlb = mix( rock, tAlb, lip );
  tAlb *= mix( 0.55, 1.0, smoothstep( 0.0, 0.42, fromBot ) );
  if ( tExtra == 1 ) tEmit += uLavaCol * pow( 1.0 - smoothstep( 0.0, 0.7, fromBot ), 2.0 ) * 1.8 * uGlow;
  if ( tExtra == 2 && tH < tSeaH ) tAlb *= 0.78;
  if ( tRough < 0.0 ) tRough = 0.94;
} else {
  // ── tile tops: biome surface effects
  if ( tBiome == 14 ) {
    vec3 lp = vWPos;
    float n1 = tNoise( lp * 1.05 + vec3( 0.0, uSurfTime * 0.1, uSurfTime * 0.04 ) );
    float n2 = tNoise( lp * 3.1 - vec3( uSurfTime * 0.07 ) );
    float lf = n1 * 0.64 + n2 * 0.36;
    float crust = smoothstep( 0.43, 0.56, lf );
    float seam = 1.0 - smoothstep( 0.0, 0.035 + tFw * 0.5, abs( lf - 0.495 ) );
    vec3 melt = mix( vec3( 0.8, 0.07, 0.005 ), vec3( 1.0, 0.33, 0.02 ), smoothstep( 0.2, 0.45, lf ) * ( 1.0 - crust ) );
    tAlb = mix( melt * 0.35, vec3( 0.075, 0.055, 0.05 ) * ( 0.8 + 0.4 * n2 ), crust );
    float pulse = 0.82 + 0.18 * sin( uSurfTime * 1.6 + n1 * 9.0 );
    tEmit += ( melt * ( 1.0 - crust ) * 1.05 + vec3( 1.0, 0.62, 0.22 ) * seam * 0.95 * ( 1.0 - crust * 0.6 ) ) * pulse * uGlow;
    tRough = mix( 0.45, 0.92, crust );
  } else if ( tBiome == 17 ) {
    // cut-gem tiles: six facets per hex with their own brightness, glowing facet edges, round glints
    vec3 V = normalize( cameraPosition - vWPos );
    float fres = 1.0 - abs( dot( tUp, V ) );
    float seg = 6.2831853 / tDeg;
    float facet = floor( tAng / seg + 0.5 );
    float fb = cHash12( vec2( vTile + 0.5, facet ) );
    tAlb *= 0.84 + 0.3 * fb;
    vec3 iri = 0.62 + 0.38 * cos( 6.2831 * ( fres * 1.1 + fb * 0.35 + vec3( 0.0, 0.33, 0.67 ) ) );
    tAlb = mix( tAlb, tAlb * iri * 1.3, 0.28 );
    float ca = abs( fract( tAng / seg ) - 0.5 ) * seg * length( vLocal );
    float edge = ( 1.0 - smoothstep( 0.0, 0.02 + tFw, ca ) ) * step( 0.12, 1.0 - tEd );
    tAlb = mix( tAlb, tAlb * 1.25 + 0.05, edge * 0.6 );
    vec3 gp = vWPos * 6.0;
    float hs = tHash13( floor( gp ) );
    float pt = 1.0 - smoothstep( 0.0, 0.16, length( fract( gp ) - 0.5 ) );
    float tw = step( 0.94, hs ) * pt * pow( 0.5 + 0.5 * sin( uSurfTime * ( 2.0 + hs * 4.0 ) + hs * 40.0 ), 4.0 );
    tEmit += vec3( 1.0, 0.94, 1.0 ) * tw * 3.5 + tAlb * ( 0.1 + 0.35 * edge ) * tNightF * uGlow;
    tRough = 0.2;
    tMetal = 0.12;
  } else if ( tBiome == 18 ) {
    // sludge pools: dark glossy acid with glowing rims and popping bubbles
    float n = tNoise( vWPos * 2.6 + vec3( uSurfTime * 0.03 ) ) * 0.7 + tNz * 0.3;
    float pool = smoothstep( 0.6, 0.63, n );
    float rim = pool * ( 1.0 - smoothstep( 0.63, 0.69, n ) );
    float near = 1.0 - smoothstep( 50.0, 140.0, length( cameraPosition - vWPos ) );
    tAlb = mix( tAlb * ( 0.85 + 0.3 * tNz ), vec3( 0.12, 0.17, 0.03 ), pool * ( 0.4 + 0.6 * near ) );
    vec3 bc = floor( vWPos * 9.0 + vec3( 0.0, floor( uSurfTime * 1.7 ), 0.0 ) );
    float bub = step( 0.93, tHash13( bc ) ) * ( 1.0 - smoothstep( 0.1, 0.3, length( fract( vWPos * 9.0 ) - 0.5 ) ) ) * ( pool - rim );
    tEmit += vec3( 0.55, 1.0, 0.1 ) * ( rim * 0.7 + pool * 0.08 + bub * 1.4 ) * ( 0.25 + 0.95 * tNightF ) * uGlow;
    tRough = mix( 0.85, 0.1, pool );
  } else if ( tBiome == 23 ) {
    float ring = 1.0 - smoothstep( 0.0, 0.025 + tFw, abs( tEd - 0.24 ) );
    float seg = 6.2831853 / tDeg;
    float ca = abs( fract( tAng / seg + 0.5 ) - 0.5 ) * seg * length( vLocal );
    float rad = ( 1.0 - smoothstep( 0.0, 0.022 + tFw, ca ) ) * step( tEd, 0.24 );
    float seam = max( ring, rad );
    float plate = cHash12( vec2( vTile, 3.0 ) );
    tAlb = tAlb * ( 0.88 + 0.24 * plate ) * ( 1.0 - seam * 0.5 );
    float blink = step( 0.55, cHash12( vec2( vTile, floor( uSurfTime * 0.6 + plate * 7.0 ) ) ) );
    tEmit += vec3( 0.12, 0.85, 1.0 ) * seam * ( 0.06 + 1.1 * tNightF ) * ( 0.55 + 0.45 * blink ) * uGlow;
    float rr = length( vLocal );
    // plate variety: vent grilles, round hatches, status lights
    if ( plate > 0.86 && tEd > 0.3 ) {
      vec2 lr = vec2( vLocal.x * 0.8 - vLocal.y * 0.6, vLocal.x * 0.6 + vLocal.y * 0.8 );
      float gr = step( 0.55, fract( lr.x * 9.0 ) ) * step( abs( lr.y ), 0.3 ) * step( abs( lr.x ), 0.4 );
      tAlb *= 1.0 - gr * 0.55;
      tEmit += vec3( 1.0, 0.45, 0.15 ) * gr * tNightF * 0.35 * uGlow;
    } else if ( plate > 0.72 ) {
      float hatch = 1.0 - smoothstep( 0.0, 0.02 + tFw, abs( rr - 0.32 ) );
      tAlb = mix( tAlb, tAlb * 0.6, hatch );
      tAlb = mix( tAlb, vec3( 0.75, 0.62, 0.15 ), ( 1.0 - smoothstep( 0.28, 0.3, rr ) ) * step( 0.79, plate ) * 0.35 );
    }
    float dotL = 1.0 - smoothstep( 0.05, 0.08, rr );
    tEmit += mix( vec3( 1.0, 0.5, 0.2 ), vec3( 0.3, 1.0, 0.5 ), step( 0.5, fract( plate * 13.0 ) ) ) * dotL * step( 0.6, plate ) * ( 0.25 + 1.2 * tNightF ) * uGlow;
    tMetal = 0.55;
    tRough = 0.5;
  } else if ( tBiome == 19 ) {
    vec3 cell = floor( vWPos * 4.0 );
    float hs = tHash13( cell );
    vec3 fc = fract( vWPos * 4.0 ) - 0.5;
    float spot = ( 1.0 - smoothstep( 0.1, 0.3, length( fc ) ) ) * step( 0.8, hs );
    vec3 glow = mix( vec3( 1.0, 0.32, 0.85 ), vec3( 0.3, 0.95, 1.0 ), step( 0.9, hs ) );
    tAlb = mix( tAlb * ( 0.9 + 0.2 * tNz ), glow * 0.6, spot * 0.5 );
    tEmit += glow * spot * ( 0.12 + 1.5 * tNightF ) * ( 0.8 + 0.2 * sin( uSurfTime * 1.5 + hs * 30.0 ) ) * uGlow;
  } else if ( tBiome == 9 || tBiome == 10 ) {
    vec3 sgp = vWPos * 12.0;
    float sp = step( 0.97, tHash13( floor( sgp ) ) ) * ( 1.0 - smoothstep( 0.0, 0.14, length( fract( sgp ) - 0.5 ) ) );
    tEmit += vec3( 0.9, 0.95, 1.0 ) * sp * 0.7 * ( 1.0 - tNightF );
    tAlb *= 0.95 + 0.07 * tNz;
    tRough = tBiome == 10 ? 0.3 : 0.78;
  } else if ( tBiome == 7 || tBiome == 2 || tBiome == 20 ) {
    float rip = sin( dot( vWPos, vec3( 2.1, 1.3, 1.7 ) ) * 3.0 + tNz * 4.0 );
    tAlb *= 0.955 + 0.045 * rip + 0.05 * ( tHash13( floor( vWPos * 30.0 ) ) - 0.5 );
  } else if ( tBiome == 21 ) {
    float wet = smoothstep( 0.45, 0.8, tNoise( vWPos * 1.6 ) * 0.75 + tNz * 0.25 );
    tAlb = mix( tAlb * ( 0.95 + 0.1 * tNz ), tAlb * 0.72 + vec3( 0.01, 0.035, 0.035 ), wet );
    tRough = mix( 0.85, 0.24, wet );
  } else if ( tBiome == 15 || tBiome == 16 ) {
    // regolith: pock-marked with micro-craters (dark floors, bright rims)
    vec3 cp = vWPos * 2.4;
    vec3 ci = floor( cp );
    float ch = tHash13( ci );
    float cr = length( fract( cp ) - 0.5 );
    float rad = 0.12 + 0.22 * fract( ch * 7.31 );
    float isC = step( 0.55, ch );
    float floorD = isC * ( 1.0 - smoothstep( rad - 0.04, rad, cr ) );
    float rimB = isC * ( 1.0 - smoothstep( 0.0, 0.05, abs( cr - rad - 0.025 ) ) );
    tAlb *= ( 0.93 + 0.14 * tNz ) * ( 1.0 - floorD * 0.22 + rimB * 0.18 ) * ( 0.96 + 0.08 * tHash13( floor( vWPos * 20.0 ) ) );
    tRough = 0.95;
  } else if ( tBiome == 13 || tBiome == 22 ) {
    tAlb *= 0.9 + 0.2 * tNz;
    vec3 egp = vWPos * 9.0;
    float ember = step( 0.988, tHash13( floor( egp ) ) ) * ( 1.0 - smoothstep( 0.05, 0.2, length( fract( egp ) - 0.5 ) ) );
    tEmit += uLavaCol * ember * ( 0.4 + 0.6 * sin( uSurfTime * 3.0 + tNz * 20.0 ) ) * tNightF * uGlow;
  } else if ( tBiome != 24 ) {
    float fine = length( cameraPosition - vWPos ) < 45.0 ? tNoise( vWPos * 9.0 ) : 0.5;
    tAlb *= ( 0.91 + 0.18 * tNz ) * ( 0.97 + 0.06 * fine );
  }
  // snow line on peaks
  if ( tBiome != 14 && !tUnder && uSnowLine < 20.0 ) {
    // snow line rises toward the equator (≈ 6 terraces higher than at the poles)
    float snowLine = uSnowLine + ( 1.0 - abs( tUp.y ) ) * 2.0;
    float snowA = smoothstep( snowLine, snowLine + 0.45, tH + ( tNz - 0.5 ) * 0.55 );
    tAlb = mix( tAlb, uSnowCol, snowA );
  }
  if ( uHasOcean > 0.5 ) {
    // wet sand + lapping wash line along edges that touch the sea
    if ( ( tWMask & tEdgeBit ) != 0 && !tUnder ) {
      float wash = 1.0 - smoothstep( 0.0, 0.3, tEd );
      tAlb *= mix( 1.0, 0.72, wash );
      if ( tRough < 0.0 ) tRough = 0.9;
      tRough = mix( tRough, 0.22, wash );
      float lap = 0.5 + 0.5 * sin( uSurfTime * 1.3 + cHash12( vec2( vTile, 9.0 ) ) * 6.0 );
      float line = 1.0 - smoothstep( 0.0, 0.03 + tFw, abs( tEd - 0.06 - lap * 0.12 ) );
      tAlb = mix( tAlb, vec3( 0.95, 0.98, 1.0 ), line * 0.55 * ( 1.0 - tNightF * 0.6 ) );
    }
#ifndef LOW_Q
    if ( tUnder ) {
      float depth = tSeaH - tH;
      vec3 q = vWPos * 1.7;
      float c1 = sin( q.x + uSurfTime * 0.9 ) + sin( q.y * 1.3 - uSurfTime * 0.7 ) + sin( q.z * 1.1 + uSurfTime * 0.8 );
      float c2 = sin( q.x * 1.9 - uSurfTime * 0.6 + c1 ) + sin( q.z * 2.1 + uSurfTime * 0.5 - c1 );
      float caus = pow( 0.5 + 0.5 * sin( c1 * 1.7 + c2 ), 7.0 );
      tEmit += vec3( 0.55, 0.85, 1.0 ) * caus * max( 0.0, dot( tUp, uSunDir ) ) * 0.32 * ( 1.0 - smoothstep( 0.0, 1.4, depth ) );
    }
#endif
  }
}

// ── tile flags (god powers & disasters)
if ( tFlags != 0 ) {
  if ( ( tFlags & 4 ) != 0 ) {
    float ash = tNoise( vWPos * 3.0 );
    tAlb = mix( tAlb, vec3( 0.05, 0.045, 0.04 ) + ash * 0.06, 0.84 );
    vec3 sgp2 = vWPos * 10.0;
    tEmit += vec3( 1.0, 0.3, 0.05 ) * step( 0.975, tHash13( floor( sgp2 ) ) ) * ( 1.0 - smoothstep( 0.05, 0.22, length( fract( sgp2 ) - 0.5 ) ) ) * ( 0.5 + 0.5 * sin( uSurfTime * 5.0 + ash * 20.0 ) ) * 1.2;
    tRough = 1.0;
  }
  if ( ( tFlags & 1 ) != 0 ) {
    tAlb *= 0.32;
    float e = tNoise( vWPos * 2.6 + vec3( 0.0, -uSurfTime * 1.3, uSurfTime * 0.4 ) );
    float fl = smoothstep( 0.48, 0.85, e ) * ( 0.6 + 0.4 * sin( uSurfTime * 13.0 + e * 30.0 ) );
    tEmit += vec3( 1.0, 0.36, 0.06 ) * ( fl * 2.8 + 0.22 );
  }
  if ( ( tFlags & 2 ) != 0 ) {
    float rip = 0.5 + 0.5 * sin( dot( vWPos, vec3( 3.0, 2.0, 2.5 ) ) * 2.0 - uSurfTime * 2.0 );
    tAlb = mix( tAlb, vec3( 0.09, 0.24, 0.35 ), 0.62 );
    tRough = 0.05 + 0.06 * rip;
    tMetal = 0.08;
  }
  if ( ( tFlags & 8 ) != 0 ) {
    tAlb = mix( tAlb, vec3( 0.86, 0.93, 1.0 ), 0.8 );
    tRough = 0.2;
    vec3 fgp = vWPos * 10.0;
    tEmit += vec3( 0.6, 0.82, 1.0 ) * step( 0.975, tHash13( floor( fgp ) ) ) * ( 1.0 - smoothstep( 0.0, 0.15, length( fract( fgp ) - 0.5 ) ) ) * 1.2;
    tAlb *= 0.94 + 0.1 * tNoise( vWPos * 3.0 );
  }
  if ( ( tFlags & 16 ) != 0 ) {
    float gn = 0.5 + 0.5 * sin( dot( vWPos, vec3( 7.0, 5.0, 6.0 ) ) + uSurfTime * 3.0 ) * sin( dot( vWPos, vec3( -4.0, 6.0, 3.0 ) ) - uSurfTime * 2.0 );
    tAlb = vec3( 0.36 + 0.26 * gn ) * vec3( 0.95, 0.96, 1.05 );
    tMetal = 0.95;
    tRough = 0.28;
    tEmit += vec3( 0.45, 0.32, 0.9 ) * pow( gn, 8.0 ) * 0.7;
  }
  if ( ( tFlags & 32 ) != 0 ) {
    float p = 0.5 + 0.5 * sin( uSurfTime * 3.0 + tH * 4.0 );
    tAlb = mix( tAlb, vec3( 0.55, 0.75, 0.15 ), 0.35 );
    tEmit += vec3( 0.35, 1.0, 0.2 ) * ( 0.22 + 0.35 * p ) * ( 0.6 + 0.4 * tNoise( vWPos * 3.0 ) );
  }
  if ( ( tFlags & 64 ) != 0 ) {
    float sh = 0.5 + 0.5 * sin( uSurfTime * 2.0 + dot( vWPos, vec3( 1.0 ) ) * 1.5 );
    tAlb = mix( tAlb, vec3( 1.0, 0.86, 0.48 ), 0.32 );
    vec3 bgp = vWPos * 12.0;
    tEmit += vec3( 1.0, 0.8, 0.35 ) * ( 0.28 + 0.32 * sh ) + vec3( 1.0, 0.95, 0.7 ) * step( 0.96, tHash13( floor( bgp + floor( uSurfTime * 3.0 ) ) ) ) * ( 1.0 - smoothstep( 0.05, 0.2, length( fract( bgp ) - 0.5 ) ) ) * 1.8;
  }
  if ( ( tFlags & 128 ) != 0 && uGrid > 0.01 && !tWall ) {
    float st = step( 0.5, fract( dot( vWPos, vec3( 1.0 ) ) * 2.2 ) );
    tAlb = mix( tAlb, vec3( 0.75, 0.18, 0.2 ), st * 0.28 * uGrid );
  }
}

if ( !tWall && !tUnder ) {
  // ── zone lots (only on empty, road-free tiles)
  if ( tZone > 0 && ( tBits & 3 ) == 0 && uZoneVis > 0.001 ) {
    vec3 zc = uZoneCol[ tZone ];
    float lot = smoothstep( 0.05, 0.05 + tFw * 1.5 + 0.02, tEd );
    float border = lot * ( 1.0 - smoothstep( 0.1, 0.1 + tFw * 1.5 + 0.03, tEd ) );
    float fillA = mix( 0.2, 0.38, uZoneStrong );
    float borderA = mix( 0.5, 0.9, uZoneStrong );
    float za = ( lot * fillA + border * borderA ) * uZoneVis;
    tAlb = mix( tAlb, zc, za );
    tEmit += zc * ( lot * 0.04 + border * 0.22 ) * uZoneVis * ( 0.35 + tNightF * mix( 0.35, 1.2, uZoneStrong ) );
    if ( ( tZMask & tEdgeBit ) != 0 ) {
      float ol = ( 1.0 - smoothstep( 0.0, 0.045 + tFw, tEd ) ) * uZoneStrong * uZoneVis;
      tAlb = mix( tAlb, zc * 1.15, ol );
      tEmit += zc * ol * 0.5;
    }
  }
  // ── build grid
  if ( uGrid > 0.001 ) {
    float gl = 1.0 - smoothstep( 0.0, 0.03 + tFw * 1.2, tEd );
    float lum = dot( tAlb, vec3( 0.3, 0.59, 0.11 ) );
    vec3 gc = lum > 0.55 ? vec3( 0.12, 0.16, 0.22 ) : vec3( 1.0 );
    tAlb = mix( tAlb, gc, gl * 0.42 * uGrid );
    tEmit += vec3( 0.5, 0.8, 1.0 ) * gl * 0.08 * uGrid * tNightF;
  }
  // ── district borders + faint fill
  if ( tDist > 0 && uDistrict > 0.001 ) {
    vec3 dc = tSrgb( texelFetch( uDistPal, ivec2( tDist, 0 ), 0 ).rgb );
    tAlb = mix( tAlb, dc, 0.08 * uDistrict );
    if ( ( tDMask & tEdgeBit ) != 0 ) {
      float dl = ( 1.0 - smoothstep( 0.0, 0.06 + tFw, tEd ) ) * uDistrict;
      float dash = 0.75 + 0.25 * step( 0.5, fract( tAng * 2.0 ) );
      tAlb = mix( tAlb, dc, dl * dash );
      tEmit += dc * dl * 0.45;
    }
  }
}

// ── lens overlay: desaturate the world, paint the data
if ( uOverlay > 0.001 ) {
  vec4 ov = texelFetch( uOverlayTex, tuv, 0 );
  float lum = dot( tAlb, vec3( 0.3, 0.59, 0.11 ) );
  tAlb = mix( tAlb, vec3( lum * 0.85 + 0.04 ), uOverlay * 0.7 );
  float oa = ov.a * uOverlay * ( tWall ? 0.55 : smoothstep( 0.0, 0.035 + tFw, tEd ) * 0.92 + 0.08 );
  vec3 oc = tSrgb( ov.rgb );
  tAlb = mix( tAlb, oc, oa );
  tEmit += oc * oa * ( 0.1 + 0.45 * tNightF );
}

// ── highlight channels (tool previews, selection, god targets)
{
  vec4 hl = texelFetch( uHighTex, tuv, 0 );
  if ( hl.a > 0.002 ) {
    vec3 hc = tSrgb( hl.rgb );
    float pulse = 0.78 + 0.22 * sin( uSurfTime * 4.5 );
    float fillA = hl.a * pulse * ( tWall ? 0.6 : 1.0 );
    tAlb = mix( tAlb, hc, fillA * 0.5 );
    tEmit += hc * fillA * 0.38;
    if ( !tWall ) {
      float inner = 1.0 - smoothstep( 0.0, 0.02 + tFw, abs( tEd - 0.05 ) );
      tEmit += hc * inner * 0.35 * hl.a;
      if ( ( tHMask & tEdgeBit ) != 0 ) {
        float ol = 1.0 - smoothstep( 0.0, 0.05 + tFw, tEd );
        tAlb = mix( tAlb, hc, ol * 0.8 );
        tEmit += hc * ol * ( 0.9 + 0.3 * pulse );
      }
    }
  }
}

// soft moonlight so the night side never goes pitch black
tEmit += tAlb * uMoonCol * tNightF;
// city-light spill: built-up ground glows warm at night — cities sparkle on the night side seen from orbit
if ( ( tBits & 3 ) != 0 && tNightF > 0.01 ) {
  float urban = ( ( tBits & 1 ) != 0 ? 1.0 : 0.0 ) + ( ( tBits & 2 ) != 0 ? 0.55 : 0.0 );
  float camD = length( cameraPosition - vWPos );
  float spill = urban * tNightF * uNightLights * mix( 0.05, 0.45, smoothstep( 35.0, 160.0, camD ) );
  float flick = 0.85 + 0.15 * cHash12( vec2( vTile, floor( uSurfTime * 0.25 ) ) );
  tEmit += vec3( 1.0, 0.72, 0.42 ) * spill * flick * ( tWall ? 0.4 : smoothstep( 0.0, 0.35, tEd ) * 0.7 + 0.3 );
}
diffuseColor.rgb = tAlb * ( tWall ? 1.0 : vCol.a );
`;

const FRAG_MATERIAL = /* glsl */ `
if ( tRough >= 0.0 ) roughnessFactor = tRough;
if ( tMetal >= 0.0 ) metalnessFactor = tMetal;
`;

const FRAG_CLOUD_SHADOW = /* glsl */ `
{
  // planet-aware skylight: radial up (not world +Y), tinted by the atmosphere, plus warm ground bounce.
  vec3 nW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  float skyUp = dot( tUp, uSunDir );
  float skyDay = smoothstep( -0.25, 0.35, skyUp );
  float hemi = 0.5 + 0.5 * dot( nW, tUp );
  vec3 skyCol = mix( vec3( 0.55, 0.62, 0.75 ), uAtmoColor, 0.55 ) * ( 0.18 + 0.32 * min( uAtmoDensity, 1.0 ) );
  vec3 bounce = vec3( 0.32, 0.27, 0.22 ) * 0.22;
  vec3 skyIrr = mix( bounce, skyCol, hemi ) * ( 0.06 + 0.94 * skyDay );
  reflectedLight.indirectDiffuse += skyIrr * BRDF_Lambert( material.diffuseColor ) * 3.14159;
}
if ( uCloudShadow > 0.001 ) {
  vec3 csd = normalize( vWPos + uSunDir * max( 0.0, uCloudR - length( vWPos ) ) );
  float csh = 1.0 - uCloudShadow * tCloud( csd );
  reflectedLight.directDiffuse *= csh;
  reflectedLight.directSpecular *= csh;
}
`;

export function createTerrainMaterial(u: SurfaceUniforms): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0 });
  mat.name = 'terrain';
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, shared, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_SURFACE)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG_MATERIAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += tEmit;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_CLOUD_SHADOW)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n if ( uAtmoDensity > 0.005 ) gl_FragColor.rgb = tHaze( gl_FragColor.rgb, vWPos, tUp );');
  };
  mat.customProgramCacheKey = () => 'cosmo-terrain-v1';
  return mat;
}
