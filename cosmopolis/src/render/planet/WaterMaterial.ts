/**
 * OWNER: terrain.
 * Water material — hex-aware ocean surface. The geometry lives on the unit sphere and is scaled to the live sea
 * radius (uWaterR) in the vertex shader, so flood / drain god powers animate smoothly without rebuilds.
 *   depth colour (seabed height per vertex): turquoise shallows → deep ocean, see-through shallows
 *   analytic wave normals (projected plane waves, faded with distance to avoid shimmer from orbit)
 *   fresnel sky reflection, HDR sun glint (feeds bloom), soft moon glint at night, night-side darkening
 *   shoreline foam that laps rhythmically, cloud shadows, aerial haze, lens overlay & highlight channels
 *   optional glow (toxic seas, machine-world coolant)
 */
import { ShaderMaterial } from 'three';
import { SHADER_COMMON, shared } from '../materials';
import { GLSL_CLOUDS, GLSL_HAZE, GLSL_NOISE } from './glsl';
import type { SurfaceUniforms } from './SurfaceUniforms';

const VERT = /* glsl */ `
attribute float aBed;
attribute float aTile;
attribute vec2 aLocal;
attribute float aDeg;
uniform float uWaterR;
varying vec3 vWPos;
varying float vBed;
flat varying float vTile;
varying vec2 vLocal;
flat varying float vDeg;
void main() {
  vec3 p = normalize( position ) * uWaterR;
  vec4 wp = modelMatrix * vec4( p, 1.0 );
  vWPos = wp.xyz;
  vBed = aBed;
  vTile = aTile;
  vLocal = aLocal;
  vDeg = aDeg;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${SHADER_COMMON}
${GLSL_NOISE}
${GLSL_CLOUDS}
${GLSL_HAZE}
uniform highp sampler2D uOverlayTex;
uniform highp sampler2D uHighTex;
uniform highp sampler2D uMaskTex;
uniform float uRadius;
uniform float uWaterR;
uniform float uOverlay;
uniform float uCloudShadow;
uniform float uCloudR;
uniform float uWaterGlow;
uniform float uWaterClarity;
uniform float uSurfTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoamCol;
varying vec3 vWPos;
varying float vBed;
flat varying float vTile;
varying vec2 vLocal;
flat varying float vDeg;

void main() {
  vec3 up = normalize( vWPos );
  vec3 toCam = cameraPosition - vWPos;
  float dist = length( toCam );
  vec3 V = toCam / dist;
  float depth = max( uWaterR - uRadius - vBed, 0.0 );
  float far = smoothstep( 25.0, 160.0, dist );
  float t = uSurfTime;
  // ── waves: sum of plane waves in world space, gradient projected on the tangent plane
  vec3 p = vWPos;
  vec3 grad = vec3( 0.0 );
  float amp = 1.0 - far * 0.92;
  vec3 d1 = vec3( 0.83, 0.12, 0.54 ), d2 = vec3( -0.31, 0.62, 0.72 ), d3 = vec3( 0.47, -0.79, 0.39 ), d4 = vec3( -0.72, -0.25, -0.65 );
  grad += d1 * ( 0.07 * cos( dot( p, d1 ) * 1.7 + t * 1.15 ) );
  grad += d2 * ( 0.06 * cos( dot( p, d2 ) * 2.3 - t * 1.4 ) );
  grad += d3 * ( 0.05 * cos( dot( p, d3 ) * 3.9 + t * 1.9 ) );
  grad += d4 * ( 0.04 * cos( dot( p, d4 ) * 6.1 - t * 2.5 ) );
#ifndef LOW_Q
  float rn = tNoise( p * 4.0 + vec3( t * 0.5, -t * 0.4, t * 0.3 ) );
  grad += ( vec3( rn, tNoise( p * 4.0 + 7.0 - t * 0.45 ), tNoise( p * 4.0 - 3.0 + t * 0.35 ) ) - 0.5 ) * 0.16 * ( 1.0 - far ) * ( 1.0 - far );
#endif
  grad *= amp;
  grad -= up * dot( grad, up );
  vec3 N = normalize( up - grad );

  float sunUp = dot( up, uSunDir );
  float day = smoothstep( -0.18, 0.25, sunUp );
  float nightF = 1.0 - day;
  float NdL = max( dot( N, uSunDir ), 0.0 );

  // ── body colour by depth
  float dk = 1.0 - exp( -depth * 1.25 );
  vec3 body = mix( uShallow, uDeep, dk );
  vec3 col = body * ( 0.1 + 0.95 * NdL * day ) * ( 0.25 + 0.75 * day ) + body * 0.025;

  // cloud shadows
  float csh = 1.0;
  if ( uCloudShadow > 0.001 ) {
    vec3 csd = normalize( vWPos + uSunDir * max( 0.0, uCloudR - length( vWPos ) ) );
    csh = 1.0 - uCloudShadow * tCloud( csd );
    col *= mix( 1.0, csh, day );
  }

  // ── sky reflection (fresnel)
  float fres = 0.02 + 0.98 * pow( 1.0 - max( dot( N, V ), 0.0 ), 5.0 );
  vec3 sky = mix( vec3( 0.006, 0.01, 0.022 ), mix( uAtmoColor, vec3( 0.75, 0.85, 1.0 ), 0.25 ) * 0.7, day );
  col = mix( col, sky, fres * 0.6 );

  // ── sun glint (HDR → bloom) and a soft moon glint at night
  vec3 Hs = normalize( uSunDir + V );
  float shin = mix( 900.0, 90.0, far );
  float spec = pow( max( dot( N, Hs ), 0.0 ), shin ) * day * csh;
  col += vec3( 1.0, 0.94, 0.82 ) * spec * mix( 7.0, 1.6, far );
  vec3 moonDir = normalize( -uSunDir + up * 0.7 );
  col += vec3( 0.45, 0.55, 0.8 ) * pow( max( dot( N, normalize( moonDir + V ) ), 0.0 ), 260.0 ) * nightF * 0.7;

  // ── shoreline foam: rhythmic lapping lines where the sea gets shallow
  float shore = 1.0 - smoothstep( 0.0, 0.24, depth );
  float ph = cHash12( vec2( vTile, 1.0 ) ) * 6.2831;
  float wave = 0.5 + 0.5 * sin( depth * 34.0 - t * 2.3 + ph );
  float fn = tNoise( vWPos * 3.4 + vec3( t * 0.25 ) );
  float foam = shore * smoothstep( 0.6, 0.98, wave * 0.75 + fn * 0.45 ) * 0.8;
  foam = max( foam, ( 1.0 - smoothstep( 0.0, 0.035, depth ) ) * ( 0.55 + 0.45 * fn ) );
  foam *= 1.0 - far * 0.75;
  col = mix( col, uFoamCol * ( 0.08 + 0.8 * day * mix( 1.0, csh, 0.6 ) ), foam * 0.8 );

  // ── glowing seas (toxic, coolant)
  col += uShallow * uWaterGlow * ( 0.12 + 0.8 * nightF ) * ( 0.55 + 0.45 * fn ) * ( 1.0 - dk * 0.5 );

  // ── lens overlay & highlights on water tiles
  ivec2 tuv = tUV( vTile );
  if ( uOverlay > 0.001 ) {
    vec4 ov = texelFetch( uOverlayTex, tuv, 0 );
    vec3 oc = tSrgb( ov.rgb );
    float lum = dot( col, vec3( 0.3, 0.59, 0.11 ) );
    col = mix( col, vec3( lum ), uOverlay * 0.6 );
    col = mix( col, oc * ( 0.35 + 0.65 * day ) + oc * 0.15, ov.a * uOverlay * 0.75 );
  }
  float edge = 1.0;
  {
    float a = atan( vLocal.y, vLocal.x );
    if ( a < 0.0 ) a += 6.2831853;
    float seg = 6.2831853 / vDeg;
    float k = floor( a / seg );
    float mid = ( k + 0.5 ) * seg;
    edge = clamp( 1.0 - dot( vLocal, vec2( cos( mid ), sin( mid ) ) ) / cos( seg * 0.5 ), 0.0, 1.0 );
    vec4 hl = texelFetch( uHighTex, tuv, 0 );
    if ( hl.a > 0.002 ) {
      vec3 hc = tSrgb( hl.rgb );
      float pulse = 0.78 + 0.22 * sin( t * 4.5 );
      int hm = int( texelFetch( uMaskTex, tuv, 0 ).g * 255.0 + 0.5 );
      float fw = max( fwidth( edge ), 1e-4 );
      float ol = ( hm & ( 1 << int( min( k, 5.0 ) ) ) ) != 0 ? 1.0 - smoothstep( 0.0, 0.05 + fw, edge ) : 0.0;
      col = mix( col, hc, hl.a * pulse * 0.45 );
      col += hc * ( hl.a * pulse * 0.3 + ol * 1.1 );
    }
  }

  // ── alpha: see-through shallows, opaque deep water
  float alpha = mix( 0.55, 0.96, smoothstep( 0.0, 1.1, depth ) );
  alpha = mix( 1.0, alpha, uWaterClarity );
  alpha = max( alpha, foam * 0.9 );
  alpha = mix( alpha, 1.0, fres * 0.45 );
  col = tHaze( col, vWPos, up );
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createWaterMaterial(u: SurfaceUniforms): ShaderMaterial {
  const mat = new ShaderMaterial({
    name: 'water',
    uniforms: { ...shared, ...u } as unknown as ShaderMaterial['uniforms'],
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: true,
  });
  return mat;
}
