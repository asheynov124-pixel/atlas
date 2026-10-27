/** Seeded fake content, the same on every run (so screenshots stay stable). */
import { pick, prng } from '../lib/prng';
import type { Card } from './types';

const TAGS = ['Coast', 'City', 'Forest', 'Neon', 'Studio', 'Rain', 'Desert', 'Night', 'Snow', 'Market'];
const PLACES = ['Harbor', 'Rooftop', 'Boardwalk', 'Canyon', 'Alley', 'Greenhouse', 'Pier', 'Station', 'Ridge', 'Lagoon', 'Arcade', 'Courtyard'];
const MOODS = ['at Dusk', 'After Rain', 'in Blue', 'Before Dawn', 'Under Neon', 'in Fog', 'at Noon', 'After Hours', 'in Bloom', 'at Low Tide'];
const CREATORS = ['Mara Vale', 'Theo Lind', 'Ines Sola', 'Kai Moreno', 'Ada Brook', 'Ravi Shah', 'Noor Hale', 'Jun Park'];

export function makeCatalog(count = 40, seed = 7): Card[] {
  const r = prng(seed);
  const used = new Set<string>();
  const title = () => {
    let t = `${pick(r, PLACES)} ${pick(r, MOODS)}`;
    while (used.has(t)) t = `${pick(r, PLACES)} ${pick(r, MOODS)}`;
    used.add(t);
    return t;
  };
  return Array.from({ length: count }, (_, i) => {
    const tags = [...new Set([pick(r, TAGS), pick(r, TAGS), pick(r, TAGS)])].slice(0, 1 + Math.floor(r() * 3));
    return {
      id: `c${i + 1}`,
      title: title(),
      creator: pick(r, CREATORS),
      tags,
      quality: r() > 0.5 ? '4K' : 'HD',
      seconds: 20 + Math.floor(r() * 580),
      hue: Math.floor(r() * 360),
      seed: Math.floor(r() * 1e9),
    };
  });
}

export const CATALOG = makeCatalog();
