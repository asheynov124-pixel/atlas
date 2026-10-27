/** Taxonomy (tags, performers, studios, series) loaded once from the data source. */
import { create } from 'zustand';
import type { Performer, Series, Studio, Tag, Taxonomy } from '../data/types';
import { dataSource } from '../data/api';
import type { PathNames } from '../engine/paths';
import { cachedSummary } from '../data/api';
import { useStore } from './store';

interface TaxState {
  tx: Taxonomy | null;
  error: string | null;
  tag: Map<string, Tag>;
  performer: Map<string, Performer>;
  studio: Map<string, Studio>;
  series: Map<string, Series>;
  load: () => Promise<void>;
}

export const useTaxonomy = create<TaxState>((set, get) => ({
  tx: null,
  error: null,
  tag: new Map(),
  performer: new Map(),
  studio: new Map(),
  series: new Map(),
  load: async () => {
    if (get().tx) return;
    try {
      const tx = await dataSource().taxonomy();
      set({
        tx,
        error: null,
        tag: new Map(tx.tags.map((t) => [t.id, t])),
        performer: new Map(tx.performers.map((p) => [p.id, p])),
        studio: new Map(tx.studios.map((s) => [s.id, s])),
        series: new Map(tx.series.map((s) => [s.id, s])),
      });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));

export function names(): PathNames {
  const t = useTaxonomy.getState();
  return {
    tag: (id) => t.tag.get(id)?.label ?? id,
    performer: (id) => t.performer.get(id)?.name ?? 'Unknown performer',
    studio: (id) => t.studio.get(id)?.name ?? 'Unknown studio',
    series: (id) => t.series.get(id)?.title ?? 'Series',
    video: (id) => {
      const v = useStore.getState().content[id] ?? cachedSummary(id);
      if (!v) return 'this clip';
      return v.title.length > 26 ? `${v.title.slice(0, 24)}…` : v.title;
    },
  };
}

export const performerLookup = (id: string) => useTaxonomy.getState().performer.get(id);
