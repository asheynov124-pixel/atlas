/**
 * OWNER: terrain.
 * Aurora — shimmering curtains circling both magnetic poles. A ribbon of 220 segments per pole whose folds, ray
 * streaks and green→magenta gradient are animated in the shader; visible on the night side only. On by default
 * for arctic & tundra worlds; `intensity` lets god powers (solar flares) light up any world.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial } from 'three';
import { SHADER_COMMON, shared } from '../materials';

const VERT = /* glsl */ `
${SHADER_COMMON}
attribute vec3 aRing; // (phi, v 0..1, hemisphere ±1)
uniform float uR0;
uniform float uR1;
uniform float uColat;
varying float vV;
varying float vPhi;
varying vec3 vWPos;
void main() {
  float phi = aRing.x;
  float v = aRing.y;
  float hemi = aRing.z;
  float t = uTime;
  float fold = 0.055 * sin( phi * 5.0 + t * 0.21 + hemi ) + 0.03 * sin( phi * 13.0 - t * 0.47 ) + 0.012 * sin( phi * 31.0 + t * 1.3 );
  float colat = uColat + fold + v * 0.035 * sin( phi * 3.0 + t * 0.3 );
  vec3 dir = vec3( sin( colat ) * cos( phi ), cos( colat ) * hemi, sin( colat ) * sin( phi ) );
  float r = mix( uR0, uR1, v );
  vec4 wp = modelMatrix * vec4( dir * r, 1.0 );
  vWPos = wp.xyz;
  vV = v;
  vPhi = phi;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${SHADER_COMMON}
uniform float uIntensity;
varying float vV;
varying float vPhi;
varying vec3 vWPos;
void main() {
  float t = uTime;
  float rays = 0.55 + 0.45 * sin( vPhi * 140.0 + t * 1.6 + sin( vPhi * 23.0 - t * 0.7 ) * 3.0 );
  rays *= 0.6 + 0.4 * sin( vPhi * 61.0 - t * 2.3 );
  float wave = 0.6 + 0.4 * sin( vPhi * 7.0 - t * 0.9 );
  float vert = smoothstep( 0.0, 0.12, vV ) * pow( 1.0 - vV, 1.6 );
  vec3 col = mix( vec3( 0.15, 1.0, 0.55 ), vec3( 0.75, 0.3, 1.0 ), smoothstep( 0.25, 0.95, vV ) );
  col = mix( col, vec3( 1.0, 0.35, 0.55 ), smoothstep( 0.0, 0.08, 0.08 - vV ) * 0.6 );
  float night = cNight( vWPos );
  float a = vert * rays * wave * night * uIntensity;
  gl_FragColor = vec4( col * a * 1.6, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Aurora {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private intensity = { value: 0 };
  /** archetype default intensity */
  base: number;
  /** override from setAurora() (null = archetype default) */
  override: number | null = null;

  constructor(radius: number, base: number) {
    this.base = base;
    const SEG = 220;
    const verts = new Float32Array(2 * (SEG + 1) * 2 * 3);
    const idx: number[] = [];
    let v = 0;
    for (const hemi of [1, -1]) {
      const start = v;
      for (let j = 0; j <= SEG; j++) {
        const phi = (j / SEG) * Math.PI * 2;
        for (let r = 0; r < 2; r++) {
          verts[v * 3] = phi;
          verts[v * 3 + 1] = r;
          verts[v * 3 + 2] = hemi;
          v++;
        }
      }
      for (let j = 0; j < SEG; j++) {
        const a = start + j * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('aRing', new BufferAttribute(verts, 3));
    geo.setAttribute('position', new BufferAttribute(new Float32Array(v * 3), 3));
    geo.setIndex(idx);
    this.material = new ShaderMaterial({
      name: 'aurora',
      uniforms: {
        ...shared,
        uIntensity: this.intensity,
        uR0: { value: radius + Math.max(3.5, radius * 0.06) },
        uR1: { value: radius + Math.max(11, radius * 0.19) },
        uColat: { value: 0.36 },
      } as unknown as ShaderMaterial['uniforms'],
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'aurora';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    const target = this.override ?? this.base;
    this.intensity.value += (target - this.intensity.value) * Math.min(1, dt * 1.5);
    if (Math.abs(target - this.intensity.value) < 0.002) this.intensity.value = target;
    this.mesh.visible = this.intensity.value > 0.01;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
