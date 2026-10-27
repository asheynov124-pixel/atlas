/**
 * Mock tag taxonomy.
 *
 * Each tag also nudges the semantic dims of the pose and composition facets,
 * so videos that share tags look alike in the procedural renderer and sit
 * near each other in embedding space. That is what lets the mock "AI" give
 * results that visibly make sense.
 *
 * Composition dims: 0 warmth · 1 coolness · 2 brightness · 3 saturation ·
 *                   4 closeness · 5 centred · 6 grain · 7 motion
 * Pose dims:        0 energy · 1 proximity · 2 tilt · 3 orientation ·
 *                   4 sway freq · 5 sway amp · 6 vertical · 7 spread
 */
import type { Tag, TagCategory } from '../types';

interface TagDef {
  id: string;
  label: string;
  category: TagCategory;
  synonyms?: string[];
  /** Sparse contributions to the composition facet: [dim, value]. */
  comp?: [number, number][];
  /** Sparse contributions to the pose facet. */
  pose?: [number, number][];
}

export const COMP = { warmth: 0, cool: 1, bright: 2, sat: 3, close: 4, centred: 5, grain: 6, motion: 7 } as const;
export const POSE = { energy: 0, proximity: 1, tilt: 2, orient: 3, freq: 4, amp: 5, vertical: 6, spread: 7 } as const;

const C = COMP;
const P = POSE;

export const TAG_DEFS: TagDef[] = [
  // Acts / themes
  { id: 'solo', label: 'Solo', category: 'act', synonyms: ['alone', 'single'], pose: [[P.proximity, -0.8], [P.spread, -0.6]] },
  { id: 'couple', label: 'Couple', category: 'act', synonyms: ['duo', 'pair', 'partners'], pose: [[P.proximity, 0.6]] },
  { id: 'threesome', label: 'Threesome', category: 'act', synonyms: ['trio', 'three'], pose: [[P.proximity, 0.4], [P.spread, 0.5]] },
  { id: 'group', label: 'Group', category: 'act', synonyms: ['party', 'ensemble'], pose: [[P.spread, 0.9], [P.energy, 0.3]] },
  { id: 'kissing', label: 'Kissing', category: 'act', synonyms: ['kiss', 'makeout', 'making out'], pose: [[P.proximity, 0.9], [P.tilt, 0.5], [P.energy, -0.2]] },
  { id: 'massage', label: 'Massage', category: 'act', synonyms: ['oil', 'rubdown', 'spa'], pose: [[P.vertical, -0.7], [P.energy, -0.5], [P.amp, 0.2]] },
  { id: 'striptease', label: 'Striptease', category: 'act', synonyms: ['strip', 'undress'], pose: [[P.energy, 0.3], [P.freq, 0.4], [P.amp, 0.6], [P.vertical, 0.3]] },
  { id: 'dance', label: 'Dance', category: 'act', synonyms: ['dancing', 'lap dance', 'twerk'], pose: [[P.energy, 0.8], [P.freq, 0.8], [P.amp, 0.8], [P.vertical, 0.4]] },
  { id: 'roleplay', label: 'Roleplay', category: 'act', synonyms: ['role play', 'fantasy', 'scenario'], pose: [[P.orient, 0.5], [P.energy, 0.1]] },
  { id: 'cosplay', label: 'Cosplay', category: 'act', synonyms: ['costume', 'dress up'], pose: [[P.orient, 0.4], [P.vertical, 0.3]] },
  { id: 'teasing', label: 'Teasing', category: 'act', synonyms: ['tease', 'flirty', 'flirting'], pose: [[P.amp, 0.4], [P.tilt, 0.3]] },
  { id: 'cuddling', label: 'Cuddling', category: 'act', synonyms: ['cuddle', 'spooning', 'snuggle'], pose: [[P.proximity, 1], [P.vertical, -0.5], [P.energy, -0.6]] },
  { id: 'lingerie', label: 'Lingerie', category: 'act', synonyms: ['underwear', 'stockings', 'lace'], pose: [[P.vertical, 0.2], [P.amp, 0.2]] },

  // Settings
  { id: 'bedroom', label: 'Bedroom', category: 'setting', synonyms: ['bed', 'sheets'], comp: [[C.warmth, 0.5], [C.bright, -0.1], [C.close, 0.2]] },
  { id: 'shower', label: 'Shower', category: 'setting', synonyms: ['bath', 'bathroom', 'wet'], comp: [[C.cool, 0.6], [C.bright, 0.3], [C.sat, -0.2]] },
  { id: 'outdoor', label: 'Outdoor', category: 'setting', synonyms: ['outside', 'nature', 'garden'], comp: [[C.bright, 0.6], [C.warmth, 0.2], [C.sat, 0.3], [C.close, -0.4]] },
  { id: 'beach', label: 'Beach', category: 'setting', synonyms: ['sand', 'seaside', 'ocean'], comp: [[C.bright, 0.7], [C.warmth, 0.5], [C.sat, 0.4], [C.close, -0.5]] },
  { id: 'hotel', label: 'Hotel', category: 'setting', synonyms: ['motel', 'suite', 'room service'], comp: [[C.warmth, 0.3], [C.bright, -0.2], [C.sat, -0.1]] },
  { id: 'kitchen', label: 'Kitchen', category: 'setting', synonyms: ['counter'], comp: [[C.bright, 0.4], [C.warmth, 0.1]] },
  { id: 'office', label: 'Office', category: 'setting', synonyms: ['desk', 'work', 'boss'], comp: [[C.cool, 0.3], [C.bright, 0.3], [C.sat, -0.4]] },
  { id: 'pool', label: 'Pool', category: 'setting', synonyms: ['swimming', 'poolside'], comp: [[C.cool, 0.7], [C.sat, 0.5], [C.bright, 0.5]] },
  { id: 'car', label: 'Car', category: 'setting', synonyms: ['backseat', 'road trip'], comp: [[C.bright, -0.4], [C.close, 0.5], [C.grain, 0.2]] },
  { id: 'studio-set', label: 'Studio set', category: 'setting', synonyms: ['set', 'backdrop'], comp: [[C.centred, 0.5], [C.sat, 0.2]] },
  { id: 'sauna', label: 'Sauna', category: 'setting', synonyms: ['steam', 'hot tub', 'jacuzzi'], comp: [[C.warmth, 0.8], [C.bright, -0.1], [C.grain, 0.2]] },

  // Visual / production style
  { id: 'amateur', label: 'Amateur', category: 'style', synonyms: ['homemade', 'real', 'indie'], comp: [[C.grain, 0.4], [C.centred, -0.3], [C.motion, 0.3]] },
  { id: 'professional', label: 'Professional', category: 'style', synonyms: ['pro', 'studio'], comp: [[C.centred, 0.3], [C.grain, -0.4]] },
  { id: 'cinematic', label: 'Cinematic', category: 'style', synonyms: ['film', 'artsy', 'artistic', 'movie'], comp: [[C.sat, -0.1], [C.grain, 0.1], [C.centred, -0.2], [C.motion, -0.3], [C.bright, -0.2]] },
  { id: 'pov', label: 'POV', category: 'style', synonyms: ['point of view', 'first person'], comp: [[C.close, 0.6], [C.motion, 0.4], [C.centred, 0.4]] },
  { id: 'close-up', label: 'Close-up', category: 'style', synonyms: ['closeup', 'close up', 'intimate framing', 'tight shot'], comp: [[C.close, 0.9]] },
  { id: 'wide-shot', label: 'Wide shot', category: 'style', synonyms: ['wide', 'full body', 'long shot'], comp: [[C.close, -0.8]] },
  { id: 'slow-motion', label: 'Slow motion', category: 'style', synonyms: ['slowmo', 'slow mo', 'slow'], comp: [[C.motion, -0.8]] },
  { id: 'black-and-white', label: 'Black & white', category: 'style', synonyms: ['bw', 'b&w', 'monochrome', 'black and white', 'noir'], comp: [[C.sat, -1]] },
  { id: 'neon', label: 'Neon', category: 'style', synonyms: ['club lights', 'rgb', 'synthwave'], comp: [[C.sat, 0.9], [C.cool, 0.5], [C.bright, -0.5]] },
  { id: 'natural-light', label: 'Natural light', category: 'style', synonyms: ['sunlight', 'daylight', 'golden hour', 'window light'], comp: [[C.bright, 0.5], [C.warmth, 0.3], [C.sat, -0.2]] },
  { id: 'vintage', label: 'Vintage', category: 'style', synonyms: ['retro', 'classic', '70s', '80s', '90s', 'film grain'], comp: [[C.grain, 0.9], [C.warmth, 0.4], [C.sat, -0.4]] },
  { id: 'handheld', label: 'Handheld', category: 'style', synonyms: ['shaky cam', 'selfie', 'phone'], comp: [[C.motion, 0.6], [C.centred, -0.4]] },

  // Mood
  { id: 'romantic', label: 'Romantic', category: 'mood', synonyms: ['passionate', 'loving', 'intimate', 'tender'], comp: [[C.warmth, 0.4], [C.motion, -0.3]], pose: [[P.energy, -0.3], [P.proximity, 0.3]] },
  { id: 'playful', label: 'Playful', category: 'mood', synonyms: ['fun', 'giggly', 'cheeky'], comp: [[C.bright, 0.3], [C.sat, 0.3], [C.motion, 0.3]], pose: [[P.energy, 0.4], [P.freq, 0.3]] },
  { id: 'intense', label: 'Intense', category: 'mood', synonyms: ['wild', 'hot', 'steamy', 'energetic'], comp: [[C.motion, 0.7], [C.sat, 0.3], [C.bright, -0.2]], pose: [[P.energy, 0.8], [P.amp, 0.4]] },
  { id: 'sensual', label: 'Sensual', category: 'mood', synonyms: ['slow burn', 'soft', 'gentle'], comp: [[C.motion, -0.4], [C.warmth, 0.3], [C.bright, -0.2]], pose: [[P.energy, -0.4], [P.amp, 0.3]] },
  { id: 'funny', label: 'Funny', category: 'mood', synonyms: ['comedy', 'parody', 'bloopers'], comp: [[C.bright, 0.5], [C.sat, 0.4]], pose: [[P.energy, 0.3], [P.orient, 0.4]] },
  { id: 'dreamy', label: 'Dreamy', category: 'mood', synonyms: ['ethereal', 'hazy', 'soft focus'], comp: [[C.bright, 0.2], [C.sat, -0.2], [C.motion, -0.5], [C.grain, 0.2]], pose: [[P.energy, -0.3]] },

  // Production
  { id: '4k', label: '4K', category: 'production', synonyms: ['uhd', '2160p', 'ultra hd'] },
  { id: 'hd', label: 'HD', category: 'production', synonyms: ['1080p', '720p', 'high definition'] },
  { id: 'vertical', label: 'Vertical', category: 'production', synonyms: ['portrait', '9:16', 'phone shot'] },
  { id: 'behind-the-scenes', label: 'Behind the scenes', category: 'production', synonyms: ['bts', 'making of', 'outtakes'], comp: [[C.grain, 0.2], [C.centred, -0.3]] },
];

export const TAGS: Tag[] = TAG_DEFS.map(({ id, label, category, synonyms }) => ({ id, label, category, synonyms: synonyms ?? [] }));
export const TAG_BY_ID: Record<string, TagDef> = Object.fromEntries(TAG_DEFS.map((t) => [t.id, t]));

export function tagsByCategory(category: TagCategory): TagDef[] {
  return TAG_DEFS.filter((t) => t.category === category);
}

export const SETTINGS = tagsByCategory('setting').map((t) => t.id);
export const STYLES = tagsByCategory('style').map((t) => t.id);
export const MOODS = tagsByCategory('mood').map((t) => t.id);
export const THEME_ACTS = ['kissing', 'massage', 'striptease', 'dance', 'roleplay', 'cosplay', 'teasing', 'cuddling', 'lingerie'];
