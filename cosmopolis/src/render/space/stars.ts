/**
 * OWNER: space-post.
 * Star kinds → how the sun looks and lights the world (disc colour/size, corona, light colour & intensity,
 * ambient tint), plus a black-body colour helper used for the starfield.
 */
import { Color, SRGBColorSpace } from 'three';
import type { StarKind } from '../../core/types';

export interface StarLook {
  kind: StarKind;
  name: string;
  /** disc / corona colour (sRGB hex) */
  color: number;
  /** DirectionalLight colour (sRGB hex) */
  light: number;
  /** DirectionalLight intensity at full daylight */
  intensity: number;
  /** angular radius of the disc in radians */
  disc: number;
  /** HDR brightness of the disc (drives bloom) */
  discGlow: number;
  /** corona streamer strength 0..1 */
  corona: number;
  /** wide glare / flare strength 0..1 */
  glare: number;
  /** night-side ambient tint (sRGB hex) */
  ambient: number;
  /** multiplier on the nebula / star brightness (bright blue stars wash the sky out a little) */
  sky: number;
  /** special renders */
  special?: 'pulsar' | 'binary' | 'blackhole';
  /** binary companion colour */
  companion?: number;
  flavor: string;
}

export const STAR_LOOKS: Record<StarKind, StarLook> = {
  yellow: {
    kind: 'yellow', name: 'Yellow dwarf', color: 0xfff0d6, light: 0xfff1de, intensity: 3.2, disc: 0.019, discGlow: 26,
    corona: 0.55, glare: 0.75, ambient: 0x2c3d6e, sky: 1,
    flavor: 'Middle-aged, dependable, burns hydrogen like it has a pension plan.',
  },
  orange: {
    kind: 'orange', name: 'Orange dwarf', color: 0xffc58c, light: 0xffd2a6, intensity: 3.0, disc: 0.022, discGlow: 22,
    corona: 0.5, glare: 0.7, ambient: 0x3a3360, sky: 1.05,
    flavor: 'Warm, patient and good for another 30 billion years. Excellent for long-term mortgages.',
  },
  red: {
    kind: 'red', name: 'Red dwarf', color: 0xff8d5e, light: 0xffa77a, intensity: 2.5, disc: 0.05, discGlow: 14,
    corona: 0.7, glare: 0.6, ambient: 0x41294f, sky: 1.15,
    flavor: 'Small, ruddy and huge in your sky, because you live so close. Every hour is golden hour.',
  },
  white: {
    kind: 'white', name: 'White star', color: 0xf4f6ff, light: 0xf6f8ff, intensity: 3.5, disc: 0.016, discGlow: 32,
    corona: 0.45, glare: 0.8, ambient: 0x2a3a70, sky: 0.95,
    flavor: 'Crisp, clinical light. Architects love it; sunbathers less so.',
  },
  blue: {
    kind: 'blue', name: 'Blue giant', color: 0xb4ccff, light: 0xc8daff, intensity: 3.9, disc: 0.024, discGlow: 40,
    corona: 0.65, glare: 0.95, ambient: 0x23376f, sky: 0.85,
    flavor: 'Lives fast, dies young, leaves a spectacular supernova. Wear sunscreen. All of it.',
  },
  neutron: {
    kind: 'neutron', name: 'Pulsar', color: 0xc6dcff, light: 0xd2e2ff, intensity: 2.7, disc: 0.008, discGlow: 60,
    corona: 0.2, glare: 0.85, ambient: 0x203462, sky: 1, special: 'pulsar',
    flavor: 'A city-sized star spinning faster than a blender. Keeps excellent time.',
  },
  binary: {
    kind: 'binary', name: 'Binary pair', color: 0xfff0d6, light: 0xffe4c4, intensity: 3.4, disc: 0.018, discGlow: 26,
    corona: 0.55, glare: 0.8, ambient: 0x33355f, sky: 1, special: 'binary', companion: 0xff9a66,
    flavor: 'Two suns, two shadows, twice the sunsets. Sundials here are a nightmare.',
  },
  blackhole: {
    kind: 'blackhole', name: 'Black hole', color: 0xffb070, light: 0xffc79c, intensity: 1.9, disc: 0.034, discGlow: 18,
    corona: 0, glare: 0.26, ambient: 0x2c2350, sky: 0.9, special: 'blackhole',
    flavor: 'The accretion disc lights your streets. Please do not feed the singularity.',
  },
};

/** Approximate sRGB colour of a black body at `kelvin` (Tanner Helland fit), returned as linear RGB in `out`. */
export function kelvinColor(kelvin: number, out = new Color()): Color {
  const t = kelvin / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.min(1, Math.max(0, v / 255));
  return out.setRGB(c(r), c(g), c(b), SRGBColorSpace);
}
