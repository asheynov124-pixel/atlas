import type { Card } from '../data/types';
import { duration } from '../lib/format';
import { Art } from './Art';

/** A 9:16 tile for grids: media with a duration badge, a two-line title, one line of meta. */
export function Tile({ card, meta, onOpen }: { card: Card; meta: string; onOpen: () => void }) {
  return (
    <button type="button" className="tile" onClick={onOpen}>
      <span className="tile__media">
        <Art card={card} />
        <span className="tile__badge">{duration(card.seconds)}</span>
      </span>
      <span className="tile__title">{card.title}</span>
      <span className="tile__meta">{meta}</span>
    </button>
  );
}
