/**
 * Procedural stand-in media: soft glowing shapes from the card's seed, so the starter
 * looks right before you have real images. Replace with <img> or <video>; keep
 * `data-media` on it, which tells the design lint that this is content, not chrome.
 */
import type { CSSProperties } from 'react';
import { prng } from '../lib/prng';
import type { Card } from '../data/types';

export function Art({ card }: { card: Card }) {
  const r = prng(card.seed);
  const h = card.hue;
  const blobs = Array.from({ length: 3 }, (_, i) => ({ x: 18 + r() * 64, y: 22 + r() * 52, size: 38 + r() * 56, hue: (h + i * 42 + r() * 30) % 360 }));
  const ground: CSSProperties = { background: `linear-gradient(160deg, hsl(${h} 45% 24%), hsl(${(h + 50) % 360} 55% 7%))` };
  return (
    <div className="art" data-media aria-hidden="true" style={ground}>
      {blobs.map((b, i) => (
        <span
          key={i}
          className="art__blob"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: `${b.size}%`,
            aspectRatio: '1',
            translate: '-50% -50%',
            opacity: 0.85,
            background: `radial-gradient(circle at 35% 30%, hsl(${b.hue} 80% 74%), hsl(${b.hue} 70% 46%) 45%, transparent 70%)`,
          }}
        />
      ))}
      <span className="art__grain" />
    </div>
  );
}
