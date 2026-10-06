/**
 * OWNER: space-post.
 * Shared GLSL snippets for the sky, sun, moons and rings: hashes, 3D simplex noise, fbm / ridged fbm, a cheap
 * 3D Worley (crater) field and the "sky-depth" vertex trick (draw directions at the far plane, camera-centred).
 */

/** Fast integer-free hashes (Dave Hoskins). */
export const GLSL_HASH = /* glsl */ `
float sHash11( float p ) { p = fract( p * .1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }
float sHash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * .1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float sHash13( vec3 p3 ) { p3 = fract( p3 * .1031 ); p3 += dot( p3, p3.zyx + 31.32 ); return fract( ( p3.x + p3.y ) * p3.z ); }
vec3 sHash33( vec3 p3 ) { p3 = fract( p3 * vec3( .1031, .1030, .0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yxx ) * p3.zyx ); }
`;

/** 3D simplex noise (Ashima / Gustavson, MIT) → [-1, 1]. */
export const GLSL_SIMPLEX = /* glsl */ `
vec3 sMod289( vec3 x ) { return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0; }
vec4 sMod289( vec4 x ) { return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0; }
vec4 sPermute( vec4 x ) { return sMod289( ( ( x * 34.0 ) + 10.0 ) * x ); }
vec4 sTaylorInvSqrt( vec4 r ) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise( vec3 v ) {
  const vec2 C = vec2( 1.0 / 6.0, 1.0 / 3.0 );
  const vec4 D = vec4( 0.0, 0.5, 1.0, 2.0 );
  vec3 i = floor( v + dot( v, C.yyy ) );
  vec3 x0 = v - i + dot( i, C.xxx );
  vec3 g = step( x0.yzx, x0.xyz );
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = sMod289( i );
  vec4 p = sPermute( sPermute( sPermute( i.z + vec4( 0.0, i1.z, i2.z, 1.0 ) ) + i.y + vec4( 0.0, i1.y, i2.y, 1.0 ) ) + i.x + vec4( 0.0, i1.x, i2.x, 1.0 ) );
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor( p * ns.z * ns.z );
  vec4 x_ = floor( j * ns.z );
  vec4 y_ = floor( j - 7.0 * x_ );
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs( x ) - abs( y );
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor( b0 ) * 2.0 + 1.0;
  vec4 s1 = floor( b1 ) * 2.0 + 1.0;
  vec4 sh = -step( h, vec4( 0.0 ) );
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3( a0.xy, h.x );
  vec3 p1 = vec3( a0.zw, h.y );
  vec3 p2 = vec3( a1.xy, h.z );
  vec3 p3 = vec3( a1.zw, h.w );
  vec4 norm = sTaylorInvSqrt( vec4( dot( p0, p0 ), dot( p1, p1 ), dot( p2, p2 ), dot( p3, p3 ) ) );
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max( 0.5 - vec4( dot( x0, x0 ), dot( x1, x1 ), dot( x2, x2 ), dot( x3, x3 ) ), 0.0 );
  m = m * m;
  return 105.0 * dot( m * m, vec4( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 ), dot( p3, x3 ) ) );
}
`;

/** fbm (≈ [-1, 1]) and ridged fbm ([0, 1]) with a run-time octave count (≤ 8). Needs GLSL_SIMPLEX. */
export const GLSL_FBM = /* glsl */ `
float fbm( vec3 p, int oct ) {
  float s = 0.0, a = 0.5, n = 0.0;
  for ( int i = 0; i < 8; i++ ) {
    if ( i >= oct ) break;
    s += a * snoise( p );
    n += a;
    p = p * 2.03 + vec3( 1.7, -2.3, 3.1 );
    a *= 0.5;
  }
  return s / n;
}
float ridged( vec3 p, int oct ) {
  float s = 0.0, a = 0.5, n = 0.0, prev = 1.0;
  for ( int i = 0; i < 8; i++ ) {
    if ( i >= oct ) break;
    float r = 1.0 - abs( snoise( p ) );
    r *= r;
    s += a * r * prev;
    prev = r;
    n += a;
    p = p * 2.07 + vec3( -3.1, 1.3, 2.9 );
    a *= 0.5;
  }
  return s / n;
}
`;

/**
 * Crater field: 3D Worley cells, each with a random crater (bowl + raised rim + central peak), summed so overlaps stay
 * smooth. Returns a height offset (≈ -1.2 … 0.6) — needs GLSL_HASH.
 */
export const GLSL_CRATERS = /* glsl */ `
float craterLayer( vec3 p, float density ) {
  vec3 c = floor( p );
  vec3 f = fract( p );
  float h = 0.0;
  for ( int z = -1; z <= 1; z++ )
  for ( int y = -1; y <= 1; y++ )
  for ( int x = -1; x <= 1; x++ ) {
    vec3 o = vec3( float( x ), float( y ), float( z ) );
    vec3 rnd = sHash33( c + o );
    if ( rnd.z > density ) continue;
    vec3 fp = o + 0.2 + rnd * 0.6;
    float d = length( f - fp );
    float rr = 0.18 + 0.3 * fract( rnd.x * 7.13 + rnd.y );
    float t = d / rr;
    if ( t < 1.6 ) {
      float bowl = t < 1.0 ? ( t * t - 1.0 ) : 0.0;
      float rim = exp( -( t - 1.0 ) * ( t - 1.0 ) * 18.0 ) * 0.38;
      float peak = exp( -t * t * 60.0 ) * 0.35 * step( 0.6, rnd.y );
      // craters overlap additively (smooth everywhere, so screen-space derivatives never spike)
      h += bowl * 0.9 + rim + peak;
    }
  }
  return clamp( h, -1.2, 0.6 );
}
`;

/**
 * Vertex body for camera-centred "sky" geometry: \`dir\` (world direction) is projected at the far plane, so the object
 * is never clipped and is occluded by everything else (depth test LEQUAL at depth ≈ 1).
 */
export const GLSL_SKY_VERTEX = /* glsl */ `
vec4 skyClip( vec3 dirWorld ) {
  vec4 c = projectionMatrix * vec4( mat3( viewMatrix ) * dirWorld, 1.0 );
  c.z = c.w * 0.999995;
  return c;
}
`;
