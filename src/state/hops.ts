/**
 * Watermark / bound clock. Namespaced per corpus.
 * Only Continuity (watermark) writes this; other hop kinds read clock as 0.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jsonStorage, storeKey } from './storage';
import { manifest } from '../manifest';

export interface HopsState {
  /** Current watermark. For watermark hop this is a book/chapter number. */
  clock: number;
  setClock: (n: number) => void;
  /** Move the watermark to at least `n` (used by "Step past and move watermark"). */
  advanceTo: (n: number) => void;
}

const min = manifest.hopClock?.min ?? 0;
const max = manifest.hopClock?.max ?? 24;
const fallback = manifest.hopClock?.default ?? 0;

export const useHops = create<HopsState>()(
  persist(
    (set, get) => ({
      clock: fallback,
      setClock: (n) => set({ clock: Math.min(max, Math.max(min, Math.round(n))) }),
      advanceTo: (n) => {
        const next = Math.min(max, Math.max(min, Math.round(n)));
        if (next > get().clock) set({ clock: next });
      },
    }),
    { name: storeKey('hops'), storage: jsonStorage(), version: 1 },
  ),
);
