/**
 * OWNER: space-post.
 * Colour-grade presets for PostFX (`params.grade`). Each preset is a small set of display-space grading knobs
 * (lift / gamma / gain, split toning, S-curve, fade, monochrome, hue shift) plus multipliers on the user's sliders.
 * GRADE_PRESETS is the menu list photo mode shows (id, label, icon, blurb).
 */

export interface GradeLook {
  /** additive lift (shadows) per channel, −0.1..0.1 */
  lift: [number, number, number];
  /** gamma per channel (mid-tones), 0.7..1.3 */
  gamma: [number, number, number];
  /** gain (highlights) per channel, 0.8..1.2 */
  gain: [number, number, number];
  /** shadow / highlight tints (additive, display space) for split toning */
  shadowTint: [number, number, number];
  highTint: [number, number, number];
  /** 0..1 S-curve strength (negative = flatter) */
  curve: number;
  /** 0..0.15 raised blacks (faded film) */
  fade: number;
  /** 0..1 monochrome amount, tinted by monoTint */
  mono: number;
  monoTint: [number, number, number];
  /** hue rotation (radians) */
  hue: number;
  /** multipliers / offsets applied on top of the user's PostParams */
  contrast: number;
  saturation: number;
  exposure: number;
  bloom: number;
  vignette: number;
  temperature: number;
}

export interface GradePresetInfo {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const N: GradeLook = {
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  shadowTint: [0, 0, 0],
  highTint: [0, 0, 0],
  curve: 0,
  fade: 0,
  mono: 0,
  monoTint: [1, 1, 1],
  hue: 0,
  contrast: 1,
  saturation: 1,
  exposure: 1,
  bloom: 1,
  vignette: 0,
  temperature: 0,
};

const look = (o: Partial<GradeLook>): GradeLook => ({ ...N, ...o });

export const GRADES: Record<string, GradeLook> = {
  none: N,
  cinematic: look({
    shadowTint: [-0.035, 0.012, 0.055],
    highTint: [0.06, 0.018, -0.04],
    lift: [-0.012, -0.006, 0.0],
    curve: 0.28,
    contrast: 1.1,
    saturation: 1.06,
    vignette: 0.18,
  }),
  retro: look({
    fade: 0.07,
    gain: [1.04, 1.0, 0.88],
    gamma: [1.02, 1.04, 0.96],
    shadowTint: [-0.01, 0.03, 0.01],
    highTint: [0.05, 0.03, -0.03],
    curve: 0.18,
    contrast: 0.94,
    saturation: 0.82,
    temperature: 0.22,
    vignette: 0.22,
  }),
  noir: look({ mono: 1, monoTint: [1.0, 0.97, 0.92], curve: 0.5, contrast: 1.3, fade: 0.015, vignette: 0.38, bloom: 1.2 }),
  vapor: look({
    shadowTint: [0.07, -0.02, 0.11],
    highTint: [-0.03, 0.06, 0.07],
    gain: [1.05, 0.94, 1.08],
    hue: 0.07,
    saturation: 1.35,
    contrast: 1.04,
    bloom: 1.45,
    vignette: 0.12,
  }),
  dream: look({
    fade: 0.08,
    lift: [0.03, 0.012, 0.05],
    gain: [1.03, 1.0, 1.05],
    shadowTint: [0.02, 0.0, 0.035],
    highTint: [0.03, 0.02, 0.02],
    curve: -0.15,
    contrast: 0.86,
    saturation: 0.9,
    exposure: 1.06,
    bloom: 1.9,
  }),
  arctic: look({
    temperature: -0.6,
    gain: [0.95, 1.0, 1.07],
    highTint: [-0.02, 0.01, 0.04],
    shadowTint: [-0.01, 0.0, 0.03],
    saturation: 0.74,
    contrast: 1.05,
    exposure: 1.05,
  }),
  golden: look({
    temperature: 0.55,
    gain: [1.08, 1.0, 0.86],
    highTint: [0.06, 0.03, -0.03],
    shadowTint: [0.01, -0.005, -0.02],
    saturation: 1.1,
    contrast: 1.04,
    bloom: 1.25,
    vignette: 0.12,
  }),
  neon: look({
    shadowTint: [0.05, -0.03, 0.09],
    highTint: [-0.04, 0.05, 0.06],
    curve: 0.35,
    contrast: 1.15,
    saturation: 1.45,
    bloom: 1.7,
    exposure: 0.92,
    vignette: 0.25,
  }),
  sepia: look({ mono: 1, monoTint: [1.12, 0.94, 0.7], fade: 0.05, curve: 0.15, contrast: 0.96, vignette: 0.3 }),
  alien: look({
    shadowTint: [0.0, 0.04, 0.02],
    highTint: [0.02, 0.05, -0.03],
    gain: [0.92, 1.08, 0.9],
    hue: -0.12,
    saturation: 1.15,
    curve: 0.2,
    contrast: 1.06,
  }),
  bleach: look({ saturation: 0.45, curve: 0.45, contrast: 1.22, gain: [1.02, 1.02, 1.0], fade: 0.01, vignette: 0.2 }),
  technicolor: look({ saturation: 1.6, curve: 0.22, contrast: 1.08, gain: [1.04, 1.0, 1.02], hue: 0.02 }),
};

export const GRADE_PRESETS: GradePresetInfo[] = [
  { id: 'none', label: 'Natural', icon: '🌍', description: 'As the architects intended.' },
  { id: 'cinematic', label: 'Cinematic', icon: '🎬', description: 'Teal shadows, orange highlights. Every frame a trailer.' },
  { id: 'golden', label: 'Golden', icon: '🌅', description: 'Permanent golden hour. Real-estate agents weep with joy.' },
  { id: 'arctic', label: 'Arctic', icon: '🧊', description: 'Cool, clean and crisp. Bring a scarf.' },
  { id: 'dream', label: 'Dream', icon: '☁️', description: 'Soft glow and pastel haze, like a memory of a city.' },
  { id: 'vapor', label: 'Vapor', icon: '🌴', description: 'Pink and cyan, straight out of a 1980s mall in space.' },
  { id: 'neon', label: 'Neon', icon: '🌃', description: 'Cyberpunk contrast. Best served at night with rain.' },
  { id: 'retro', label: 'Retro', icon: '📼', description: 'Faded film stock from a holiday that never happened.' },
  { id: 'noir', label: 'Noir', icon: '🕵️', description: 'Black and white. The city has secrets.' },
  { id: 'sepia', label: 'Sepia', icon: '📜', description: 'The founding of your colony, as remembered by history books.' },
  { id: 'bleach', label: 'Bleach', icon: '🧪', description: 'Bleach-bypass grit for gritty megacities.' },
  { id: 'technicolor', label: 'Technicolor', icon: '🌈', description: 'Every colour turned up to eleven.' },
  { id: 'alien', label: 'Alien', icon: '👽', description: 'How the locals see it. Probably.' },
];

export function gradeLook(id: string): GradeLook {
  return GRADES[id] ?? N;
}
