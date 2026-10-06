/**
 * OWNER: terrain.
 * Atmosphere — a back-face shell that ray-marches a thin single-scattering approximation through the air between
 * the camera and the planet / space. Works from both outside (rim glow, bright day-side limb, sunset band at the
 * terminator, forward-scattering halo toward the sun) and inside (sky gradient above the horizon — there is no
 * fog wall because terrain occludes the shell). Additive; density & colour from spec.atmosphere.
 */
import { AdditiveBlending, BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { SHADER_COMMON, shared } from '../materials';

const VERT = /* glsl */ `
varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${SHADER_COMMON}
uniform vec3 uColor;
uniform vec3 uSunset;
uniform float uDensity;
uniform float uRp;
uniform float uRa;
uniform float uIntensity;
varying vec3 vWPos;
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize( vWPos - ro );
  float b = dot( ro, rd );
  float c = dot( ro, ro ) - uRa * uRa;
  float disc = b * b - c;
  if ( disc <= 0.0 ) { gl_FragColor = vec4( 0.0 ); return; }
  float sq = sqrt( disc );
  float t0 = max( -b - sq, 0.0 );
  float t1 = -b + sq;
  float cp = dot( ro, ro ) - uRp * uRp;
  float dp = b * b - cp;
  if ( dp > 0.0 ) {
    float tp = -b - sqrt( dp );
    if ( tp > 0.0 ) t1 = min( t1, tp );
  }
  float len = max( t1 - t0, 0.0 );
  float H = ( uRa - uRp ) * 0.3;
  float ds = len / 6.0;
  vec3 sum = vec3( 0.0 );
  for ( int i = 0; i < 6; i++ ) {
    vec3 p = ro + rd * ( t0 + ds * ( float( i ) + 0.5 ) );
    float r = length( p );
    float dens = exp( -max( r - uRp, 0.0 ) / H );
    float sunUp = dot( p / r, uSunDir );
    float light = smoothstep( -0.22, 0.32, sunUp );
    float dusk = exp( -sunUp * sunUp * 16.0 ) * smoothstep( -0.38, 0.02, sunUp );
    sum += ( uColor * light + uSunset * dusk * 0.28 ) * dens * ds;
  }
  float mu = dot( rd, uSunDir );
  float phase = 0.75 + 0.55 * pow( max( mu, 0.0 ), 10.0 ) + 0.2 * mu * mu;
  vec3 col = 1.0 - exp( -sum * uDensity * 0.06 * phase );
  gl_FragColor = vec4( col * uIntensity, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Atmosphere {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private uniforms: Record<string, { value: unknown }>;

  constructor(radius: number, color: number, density: number) {
    const thickness = Math.max(7, radius * 0.13);
    const ra = radius + thickness;
    this.uniforms = {
      uColor: { value: new Color(color) },
      uSunset: { value: new Color(0xff9440) },
      uDensity: { value: density },
      uRp: { value: radius - 0.2 },
      uRa: { value: ra },
      uIntensity: { value: density > 0.01 ? 1 : 0 },
    };
    this.material = new ShaderMaterial({
      name: 'atmosphere',
      uniforms: { ...shared, ...this.uniforms } as unknown as ShaderMaterial['uniforms'],
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(new SphereGeometry(ra, 96, 64), this.material);
    this.mesh.name = 'atmosphere';
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = density > 0.01;
  }

  /** Live tweaks (god powers / photo mode). */
  setColor(color: number): void {
    (this.uniforms.uColor.value as Color).setHex(color);
  }
  setDensity(d: number): void {
    this.uniforms.uDensity.value = d;
    this.uniforms.uIntensity.value = d > 0.01 ? 1 : 0;
    this.mesh.visible = d > 0.01;
  }
  get density(): number {
    return this.uniforms.uDensity.value as number;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
