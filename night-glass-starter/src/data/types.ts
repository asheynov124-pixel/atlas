/** One card in a feed. Swap the fields for your app's content; keep `id`. */
export interface Card {
  id: string;
  title: string;
  creator: string;
  tags: string[];
  quality: 'HD' | '4K';
  seconds: number;
  /** Drives the procedural stand-in art (src/ui/Art.tsx). Drop it once you have real media. */
  hue: number;
  seed: number;
}

/** A feed is a named, ordered list of cards: For You, Saved, or one you started with Explore. */
export interface FeedSpec {
  id: string;
  label: string;
  tag?: string;
}
