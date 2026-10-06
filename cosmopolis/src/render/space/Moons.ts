/**
 * OWNER: space-post.
 * Moons — every MoonSpec of the active planet as a tidally-locked sphere on an inclined orbit (advancing with the
 * visual day speed). Fully procedural shading per moon type: Worley crater fields with rims and central peaks, dark
 * maria, Europa-style ice lineae, Io-style sulphur, lava-cracked basalt (glows at night), cloud-wrapped water worlds,
 * crystal facets, fungal blooms and machine moons with city lights. Lit by the sun with a soft regolith terminator,
 * earthshine from the planet on the night side, and real lunar eclipses (reddened by the planet's atmosphere).
 */
import { Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { MoonSpec, PlanetTypeId } from '../../core/types';
import { hashString } from '../../core/rng';
import { GLSL_CRATERS, GLSL_FBM, GLSL_HASH, GLSL_SIMPLEX } from './glsl';

const TYPE_ID: Record<PlanetTypeId, number> = {
  barren: 0, desert: 1, arctic: 2, tundra: 2, volcanic: 3, toxic: 4, ocean: 5, terran: 6, jungle: 6, crystal: 7, fungal: 8, machine: 9,
};

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vPosW = wp.xyz;
  vNormalW = normalize( mat3( modelMatrix ) * normal );
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uColor;
uniform vec3 uShine;
uniform vec3 uAtmo;
uniform float uPlanetR;
uniform float uRadius;
uniform float uType;
uniform float uSeed;
uniform float uTime;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
${GLSL_HASH}
${GLSL_SIMPLEX}
${GLSL_FBM}
${GLSL_CRATERS}

vec3 perturb( vec3 pos, vec3 n, float h ) {
  vec3 sx = dFdx( pos );
  vec3 sy = dFdy( pos );
  float hx = dFdx( h );
  float hy = dFdy( h );
  vec3 r1 = cross( sy, n );
  vec3 r2 = cross( n, sx );
  float det = dot( sx, r1 );
  vec3 grad = sign( det ) * ( hx * r1 + hy * r2 );
  return normalize( abs( det ) * n - grad );
}

void main() {
  vec3 p = normalize( vObj ) * 2.0 + uSeed;
  int type = int( uType + 0.5 );
  vec3 alb = uColor;
  float h = 0.0;
  vec3 emit = vec3( 0.0 );
  float spec = 0.0;
  float big = fbm( p * 0.9, 4 );
  float detail = fbm( p * 6.0, 4 );
  // craters on (almost) every rocky body
  float craterAmt = ( type == 5 || type == 6 || type == 9 ) ? 0.0 : ( type == 2 || type == 4 ) ? 0.35 : 1.0;
  if ( craterAmt > 0.0 ) {
    float c1 = craterLayer( p * 2.2, 0.55 );
    float c2 = craterLayer( p * 6.5 + 3.1, 0.7 );
    float c3 = craterLayer( p * 17.0 + 7.7, 0.75 );
    h += ( c1 * 0.9 + c2 * 0.45 + c3 * 0.2 ) * craterAmt;
    alb *= 1.0 + c1 * 0.12 * craterAmt - min( c2, 0.0 ) * 0.05;
  }
  h += detail * 0.12;
  if ( type == 0 || type == 1 ) {
    float maria = smoothstep( 0.05, 0.3, big );
    alb *= mix( 1.08, 0.62, maria );
    if ( type == 1 ) alb = mix( alb, alb * vec3( 1.15, 0.75, 0.5 ), smoothstep( -0.2, 0.4, detail ) * 0.4 );
  } else if ( type == 2 ) {
    float l1 = 1.0 - smoothstep( 0.0, 0.035, abs( snoise( p * 2.5 ) ) );
    float l2 = 1.0 - smoothstep( 0.0, 0.025, abs( snoise( p * 5.0 + 4.0 ) ) );
    alb = mix( vec3( 0.86, 0.92, 1.0 ) * uColor * 1.2, vec3( 0.55, 0.32, 0.22 ), max( l1, l2 * 0.7 ) * 0.75 );
    h -= ( l1 + l2 ) * 0.1;
    spec = 0.35;
  } else if ( type == 3 ) {
    alb = vec3( 0.13, 0.11, 0.1 ) * ( 0.8 + 0.4 * detail );
    float crack = 1.0 - smoothstep( 0.0, 0.05, abs( ridged( p * 2.0, 3 ) - 0.5 ) );
    float lava = crack * smoothstep( -0.2, 0.3, big );
    emit = mix( vec3( 1.0, 0.25, 0.03 ), vec3( 1.0, 0.7, 0.2 ), detail * 0.5 + 0.5 ) * lava * 2.2;
  } else if ( type == 4 ) {
    float spots = smoothstep( 0.35, 0.6, fbm( p * 2.4, 4 ) * 0.5 + 0.5 );
    alb = mix( vec3( 0.95, 0.85, 0.35 ), vec3( 0.75, 0.45, 0.12 ), smoothstep( -0.3, 0.4, big ) );
    alb = mix( alb, vec3( 0.12, 0.08, 0.05 ), spots * 0.8 );
    emit = vec3( 1.0, 0.45, 0.1 ) * pow( spots, 8.0 ) * 0.8;
  } else if ( type == 5 || type == 6 ) {
    float land = smoothstep( 0.08, 0.14, big + detail * 0.15 );
    vec3 sea = mix( vec3( 0.04, 0.16, 0.38 ), vec3( 0.08, 0.35, 0.55 ), detail * 0.5 + 0.5 );
    vec3 ground = type == 5 ? vec3( 0.85, 0.78, 0.55 ) : mix( vec3( 0.2, 0.42, 0.16 ), vec3( 0.55, 0.48, 0.3 ), smoothstep( 0.0, 0.5, detail ) );
    alb = mix( sea, ground, type == 5 ? land * 0.35 : land );
    float cl = smoothstep( 0.05, 0.45, fbm( p * 1.8 + vec3( uTime * 0.01, 0.0, 0.0 ), 5 ) );
    alb = mix( alb, vec3( 0.95 ), cl * 0.85 );
    spec = ( 1.0 - land ) * ( 1.0 - cl ) * 0.8;
    h = land * 0.1;
    emit = vec3( 1.0, 0.75, 0.4 ) * land * ( 1.0 - cl ) * step( 0.82, sHash13( floor( p * 60.0 ) ) ) * 0.6 * float( type == 6 );
  } else if ( type == 7 ) {
    vec3 cell = floor( p * 5.0 );
    float facet = sHash13( cell );
    alb = mix( vec3( 0.55, 0.45, 0.85 ), vec3( 0.75, 0.9, 1.0 ), facet ) * ( 0.8 + 0.3 * detail );
    spec = 0.9;
  } else if ( type == 8 ) {
    float blooms = smoothstep( 0.2, 0.55, fbm( p * 3.0, 4 ) );
    alb = mix( vec3( 0.55, 0.32, 0.5 ), vec3( 0.95, 0.6, 0.8 ), blooms );
    emit = vec3( 0.4, 1.0, 0.8 ) * pow( blooms, 6.0 ) * 0.6;
  } else if ( type == 9 ) {
    vec3 g = abs( fract( p * 4.0 ) - 0.5 );
    float seam = 1.0 - smoothstep( 0.0, 0.03, min( min( g.x, g.y ), g.z ) );
    float panel = sHash13( floor( p * 4.0 ) );
    alb = vec3( 0.42, 0.45, 0.5 ) * ( 0.75 + 0.35 * panel );
    alb *= 1.0 - seam * 0.5;
    h -= seam * 0.08;
    spec = 0.6;
    float lights = step( 0.9, sHash13( floor( p * 40.0 ) ) ) * ( 1.0 - seam );
    emit = vec3( 0.4, 0.9, 1.0 ) * lights * 1.4 + vec3( 0.3, 0.8, 1.0 ) * seam * 0.25;
  }
  // ---------------------------------------------------------------- lighting
  vec3 n0 = normalize( vNormalW );
  vec3 n = perturb( vPosW, n0, h * uRadius * 0.05 );
  vec3 V = normalize( cameraPosition - vPosW );
  float ndl = dot( n, uSunDir );
  float ndl0 = dot( n0, uSunDir );
  // soft terminator, rough regolith (flattened Lambert)
  float diff = smoothstep( -0.08, 0.6, ndl ) * 0.85 + max( ndl, 0.0 ) * 0.25;
  diff *= smoothstep( -0.12, 0.08, ndl0 );
  // planet's shadow: lunar eclipse, reddened by the planet's atmosphere
  float tca = dot( -vPosW, uSunDir );
  float d2 = dot( vPosW, vPosW ) - tca * tca;
  float shadow = tca > 0.0 ? smoothstep( uPlanetR * uPlanetR * 0.82, uPlanetR * uPlanetR * 1.2, d2 ) : 1.0;
  vec3 eclipse = uAtmo * ( 1.0 - shadow ) * 0.22 * vec3( 1.0, 0.35, 0.18 );
  vec3 col = alb * uSunCol * ( diff * shadow ) + alb * eclipse * max( ndl0 + 0.3, 0.0 );
  // earthshine from the planet (lit side of the planet facing this moon)
  vec3 toP = normalize( -vPosW );
  float planetLit = clamp( dot( normalize( -vPosW ), -uSunDir ) * 0.5 + 0.5, 0.0, 1.0 );
  col += alb * uShine * max( dot( n, toP ), 0.0 ) * planetLit * 0.16;
  // specular glints (ice, water, crystal, metal)
  vec3 H = normalize( uSunDir + V );
  col += uSunCol * spec * pow( max( dot( n, H ), 0.0 ), 60.0 ) * shadow * step( 0.0, ndl0 ) * 0.6;
  // emissive features glow brightest on the night side
  col += emit * mix( 1.0, 0.35, smoothstep( -0.1, 0.3, ndl0 ) );
  // faint ambient so the night side is never pure black
  col += alb * vec3( 0.012, 0.015, 0.025 );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface MoonRender {
  spec: MoonSpec;
  mesh: Mesh;
  mat: ShaderMaterial;
  angle: number;
}

const _p = new Vector3();

export class Moons {
  private list: MoonRender[] = [];
  private geo: SphereGeometry;
  /** world positions of the moons (for eclipses / flare occlusion), radius in w */
  readonly bodies: { pos: Vector3; radius: number }[] = [];

  constructor(
    private parent: { add(o: Mesh): unknown },
    moons: MoonSpec[],
    private planetRadius: number,
    atmosphere: { color: number; density: number },
    detail: number,
  ) {
    this.geo = new SphereGeometry(1, detail, Math.round(detail * 0.66));
    const atmo = new Color(atmosphere.color).multiplyScalar(Math.min(1.2, atmosphere.density));
    const shine = new Color(atmosphere.color).lerp(new Color(0.8, 0.85, 1), 0.5).multiplyScalar(0.5 + 0.5 * Math.min(1, atmosphere.density));
    for (const spec of moons) {
      const mat = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uSunDir: { value: new Vector3(1, 0, 0) },
          uSunCol: { value: new Color(3, 3, 3) },
          uColor: { value: new Color(spec.color) },
          uShine: { value: shine },
          uAtmo: { value: atmo },
          uPlanetR: { value: planetRadius },
          uRadius: { value: spec.radius * planetRadius },
          uType: { value: TYPE_ID[spec.type] ?? 0 },
          uSeed: { value: (hashString(spec.name) % 1000) * 0.137 },
          uTime: { value: 0 },
        },
      });
      const mesh = new Mesh(this.geo, mat);
      mesh.name = 'moon:' + spec.name;
      mesh.scale.setScalar(spec.radius * planetRadius);
      parent.add(mesh);
      this.list.push({ spec, mesh, mat, angle: spec.phase });
      this.bodies.push({ pos: new Vector3(), radius: spec.radius * planetRadius });
    }
    this.place(0);
  }

  get count(): number {
    return this.list.length;
  }

  setVisible(on: boolean): void {
    for (const m of this.list) m.mesh.visible = on;
  }

  private place(dAngle: number): void {
    const R = this.planetRadius;
    this.list.forEach((m, i) => {
      m.angle += m.spec.speed * dAngle;
      const d = m.spec.distance * R;
      const inc = m.spec.inclination;
      const a = m.angle;
      _p.set(Math.cos(a) * d, Math.sin(a) * Math.sin(inc) * d, Math.sin(a) * Math.cos(inc) * d);
      m.mesh.position.copy(_p);
      // tidally locked: always the same face toward the planet
      m.mesh.lookAt(0, 0, 0);
      this.bodies[i].pos.copy(_p);
    });
  }

  /**
   * @param orbitDt real seconds × visual day speed (moons pause with the clock)
   * @param sunCol sun light colour × intensity (linear)
   */
  update(orbitDt: number, time: number, sunDir: Vector3, sunCol: Color): void {
    if (!this.list.length) return;
    this.place(orbitDt);
    for (const m of this.list) {
      const u = m.mat.uniforms;
      u.uSunDir.value.copy(sunDir);
      u.uSunCol.value.copy(sunCol);
      u.uTime.value = time;
    }
  }

  dispose(): void {
    for (const m of this.list) {
      m.mesh.removeFromParent();
      m.mat.dispose();
    }
    this.list = [];
    this.geo.dispose();
  }
}
