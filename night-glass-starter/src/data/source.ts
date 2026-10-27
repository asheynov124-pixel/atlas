/**
 * The one place content comes from. Screens only talk to `source`, so a real API can
 * replace the mock without touching them. This mock is synchronous; if yours isn't,
 * load results into a store first and keep these signatures for the screens.
 */
import { CATALOG } from './mock';
import type { Card, FeedSpec } from './types';

export interface DataSource {
  /** The cards in a feed, in order. `saved` is the Library's saved ids, newest first. */
  feed(spec: FeedSpec, saved: string[]): Card[];
  search(query: string, tags: string[]): Card[];
  get(id: string): Card | undefined;
  tags(): string[];
}

const byId = new Map(CATALOG.map((c) => [c.id, c]));

export const source: DataSource = {
  feed(spec, saved) {
    if (spec.id === 'saved') return saved.map((id) => byId.get(id)).filter((c): c is Card => !!c);
    if (spec.tag) return CATALOG.filter((c) => c.tags.includes(spec.tag!));
    return CATALOG;
  },
  search(query, tags) {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(
      (c) =>
        (!tags.length || tags.every((t) => c.tags.includes(t))) &&
        (!q || c.title.toLowerCase().includes(q) || c.creator.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q))),
    );
  },
  get: (id) => byId.get(id),
  tags: () => [...new Set(CATALOG.flatMap((c) => c.tags))].sort(),
};
