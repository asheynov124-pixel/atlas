/**
 * OWNER: space-post.
 * Custom post effects (postprocessing `Effect`s, merged into PostFX's effect passes):
 *   GradeEffect  exposure → white balance → ACES filmic tone mapping (same fit as three.js) → display-space grade:
 *                lift/gamma/gain, contrast + S-curve, saturation, hue rotation, split toning, fade, monochrome,
 *                vignette. One fragment stage for the whole look.
 *   GrainEffect  animated, luminance-weighted film grain (applied after anti-aliasing so SMAA never smears it).
 *   CosmoBloom   mipmap-blur bloom that can run its luminance + blur chain at half resolution (Medium tier).
 */
import { Uniform, Vector3 } from 'three';
import { BlendFunction, BloomEffect, Effect } from 'postprocessing';
import type { GradeLook } from './grades';

const GRADE_FRAG = /* glsl */ `
uniform float uExposure;
uniform vec3 uWhite;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uContrast;
uniform float uCurve;
uniform float uSaturation;
uniform float uHue;
uniform float uFade;
uniform float uMono;
uniform vec3 uMonoTint;
uniform float uVignette;

vec3 cosmoRRTAndODTFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}
vec3 cosmoACES( vec3 color ) {
  const mat3 inM = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
  const mat3 outM = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
  color = inM * ( color / 0.6 );
  color = cosmoRRTAndODTFit( color );
  return clamp( outM * color, 0.0, 1.0 );
}
vec3 cosmoHue( vec3 c, float a ) {
  const vec3 k = vec3( 0.57735 );
  float ca = cos( a );
  return c * ca + cross( k, c ) * sin( a ) + k * dot( k, c ) * ( 1.0 - ca );
}

void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec3 c = max( inputColor.rgb, 0.0 ) * uWhite * uExposure;
  c = cosmoACES( c );
  vec3 g = pow( c, vec3( 1.0 / 2.2 ) );
  g = uGain * ( g + uLift * ( 1.0 - g ) );
  g = pow( max( g, 0.0 ), 1.0 / uGamma );
  g = ( g - 0.5 ) * uContrast + 0.5;
  vec3 gc = clamp( g, 0.0, 1.0 );
  g = mix( g, gc * gc * ( 3.0 - 2.0 * gc ), uCurve );
  float l = dot( g, vec3( 0.2126, 0.7152, 0.0722 ) );
  g = mix( vec3( l ), g, uSaturation );
  if ( abs( uHue ) > 0.0005 ) g = cosmoHue( g, uHue );
  float lt = smoothstep( 0.0, 1.0, clamp( l, 0.0, 1.0 ) );
  g += uShadowTint * ( 1.0 - lt ) + uHighTint * lt;
  g = mix( g, vec3( l ) * uMonoTint, uMono );
  g = uFade + g * ( 1.0 - uFade );
  vec2 d = ( uv - 0.5 ) * vec2( aspect, 1.0 );
  float vig = smoothstep( 1.25, 0.25, length( d ) * 1.35 );
  g *= mix( 1.0, vig, uVignette );
  outputColor = vec4( pow( clamp( g, 0.0, 1.0 ), vec3( 2.2 ) ), inputColor.a );
}
`;

/** Numeric grade state (lerped between presets by PostFX). */
export interface GradeState {
  exposure: number;
  white: Vector3;
  lift: Vector3;
  gamma: Vector3;
  gain: Vector3;
  shadowTint: Vector3;
  highTint: Vector3;
  contrast: number;
  curve: number;
  saturation: number;
  hue: number;
  fade: number;
  mono: number;
  monoTint: Vector3;
  vignette: number;
}

export function createGradeState(): GradeState {
  return {
    exposure: 1,
    white: new Vector3(1, 1, 1),
    lift: new Vector3(),
    gamma: new Vector3(1, 1, 1),
    gain: new Vector3(1, 1, 1),
    shadowTint: new Vector3(),
    highTint: new Vector3(),
    contrast: 1,
    curve: 0,
    saturation: 1,
    hue: 0,
    fade: 0,
    mono: 0,
    monoTint: new Vector3(1, 1, 1),
    vignette: 0,
  };
}

const _t = new Vector3();

/** Lerp `s` toward the target described by a preset + user sliders. k = 0..1 blend factor this frame. */
export function blendGrade(
  s: GradeState,
  look: GradeLook,
  user: { exposure: number; contrast: number; saturation: number; vignette: number; temperature: number },
  k: number,
): void {
  const lerp = (a: number, b: number) => a + (b - a) * k;
  const v3 = (out: Vector3, x: [number, number, number]) => out.lerp(_t.set(x[0], x[1], x[2]), k);
  s.exposure = lerp(s.exposure, user.exposure * look.exposure);
  // white balance: warm = more red, less blue; luminance-normalised
  const t = Math.max(-1.5, Math.min(1.5, user.temperature + look.temperature));
  const wr = 1 + 0.16 * t;
  const wg = 1 + 0.015 * t;
  const wb = 1 - 0.22 * t;
  const wl = 0.2126 * wr + 0.7152 * wg + 0.0722 * wb;
  s.white.lerp(_t.set(wr / wl, wg / wl, wb / wl), k);
  v3(s.lift, look.lift);
  v3(s.gamma, look.gamma);
  v3(s.gain, look.gain);
  v3(s.shadowTint, look.shadowTint);
  v3(s.highTint, look.highTint);
  v3(s.monoTint, look.monoTint);
  s.contrast = lerp(s.contrast, user.contrast * look.contrast);
  s.curve = lerp(s.curve, look.curve);
  s.saturation = lerp(s.saturation, user.saturation * look.saturation);
  s.hue = lerp(s.hue, look.hue);
  s.fade = lerp(s.fade, look.fade);
  s.mono = lerp(s.mono, look.mono);
  s.vignette = lerp(s.vignette, Math.min(1, user.vignette + look.vignette));
}

export class GradeEffect extends Effect {
  constructor() {
    super('CosmoGrade', GRADE_FRAG, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['uExposure', new Uniform(1)],
        ['uWhite', new Uniform(new Vector3(1, 1, 1))],
        ['uLift', new Uniform(new Vector3())],
        ['uGamma', new Uniform(new Vector3(1, 1, 1))],
        ['uGain', new Uniform(new Vector3(1, 1, 1))],
        ['uShadowTint', new Uniform(new Vector3())],
        ['uHighTint', new Uniform(new Vector3())],
        ['uContrast', new Uniform(1)],
        ['uCurve', new Uniform(0)],
        ['uSaturation', new Uniform(1)],
        ['uHue', new Uniform(0)],
        ['uFade', new Uniform(0)],
        ['uMono', new Uniform(0)],
        ['uMonoTint', new Uniform(new Vector3(1, 1, 1))],
        ['uVignette', new Uniform(0)],
      ]),
    });
  }

  apply(s: GradeState, exposureMul: number): void {
    const u = this.uniforms;
    u.get('uExposure')!.value = s.exposure * exposureMul;
    (u.get('uWhite')!.value as Vector3).copy(s.white);
    (u.get('uLift')!.value as Vector3).copy(s.lift);
    (u.get('uGamma')!.value as Vector3).copy(s.gamma);
    (u.get('uGain')!.value as Vector3).copy(s.gain);
    (u.get('uShadowTint')!.value as Vector3).copy(s.shadowTint);
    (u.get('uHighTint')!.value as Vector3).copy(s.highTint);
    (u.get('uMonoTint')!.value as Vector3).copy(s.monoTint);
    u.get('uContrast')!.value = s.contrast;
    u.get('uCurve')!.value = s.curve;
    u.get('uSaturation')!.value = s.saturation;
    u.get('uHue')!.value = s.hue;
    u.get('uFade')!.value = s.fade;
    u.get('uMono')!.value = s.mono;
    u.get('uVignette')!.value = s.vignette;
  }
}

const GRAIN_FRAG = /* glsl */ `
uniform float uAmount;
uniform float uSeed;
float cosmoGrainHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * .1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec2 px = floor( uv * resolution );
  float n = cosmoGrainHash( px + uSeed * 113.7 ) + cosmoGrainHash( px * 1.37 - uSeed * 71.3 ) - 1.0;
  vec3 p = pow( max( inputColor.rgb, 0.0 ), vec3( 1.0 / 2.2 ) );
  float l = dot( p, vec3( 0.2126, 0.7152, 0.0722 ) );
  float w = 0.35 + 2.6 * l * ( 1.0 - l );
  p += n * uAmount * 0.11 * w;
  outputColor = vec4( pow( max( p, 0.0 ), vec3( 2.2 ) ), inputColor.a );
}
`;

export class GrainEffect extends Effect {
  constructor() {
    super('CosmoGrain', GRAIN_FRAG, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['uAmount', new Uniform(0)],
        ['uSeed', new Uniform(0)],
      ]),
    });
  }

  set(amount: number, seed: number): void {
    this.uniforms.get('uAmount')!.value = amount;
    this.uniforms.get('uSeed')!.value = seed;
  }
}

/** Mipmap-blur bloom; with `half` the luminance & blur chain runs at half resolution (Medium tier). */
export class CosmoBloom extends BloomEffect {
  half = false;

  override setSize(width: number, height: number): void {
    super.setSize(width, height);
    if (this.half) {
      const w = Math.max(1, Math.round(width / 2));
      const h = Math.max(1, Math.round(height / 2));
      this.luminancePass.setSize(w, h);
      this.mipmapBlurPass.setSize(w, h);
    }
  }
}
