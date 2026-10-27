/**
 * What the app remembers: judgments, saves, history, settings, and the feeds you
 * started. Persisted to localStorage on this device (in memory if storage is blocked).
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { FeedSpec } from '../data/types';

export interface Settings {
  haptics: boolean;
  /** Up and down move between cards, TikTok-style, instead of save and explore. */
  classic: boolean;
}

interface Stamp {
  id: string;
  at: number;
}

interface AppState {
  onboarded: boolean;
  settings: Settings;
  judgments: Record<string, 'like' | 'pass'>;
  saves: Stamp[];
  history: Stamp[];
  feeds: FeedSpec[];
  finishOnboarding: () => void;
  showWelcome: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  /** Record a like or pass. Returns the undo. */
  judge: (id: string, verb: 'like' | 'pass') => () => void;
  /** Save or unsave. Returns the undo. */
  setSaved: (id: string, on: boolean) => () => void;
  seen: (id: string) => void;
  addFeed: (spec: FeedSpec) => void;
  reset: () => void;
}

const memory = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      memory.set(k, v);
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      memory.delete(k);
    }
  },
};

const fresh = () => ({
  onboarded: false,
  settings: { haptics: true, classic: false } as Settings,
  judgments: {} as Record<string, 'like' | 'pass'>,
  saves: [] as Stamp[],
  history: [] as Stamp[],
  feeds: [] as FeedSpec[],
});

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...fresh(),
      finishOnboarding: () => set({ onboarded: true }),
      showWelcome: () => set({ onboarded: false }),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      judge: (id, verb) => {
        const before = get().judgments[id];
        set((s) => ({ judgments: { ...s.judgments, [id]: verb } }));
        return () =>
          set((s) => {
            const judgments = { ...s.judgments };
            if (before) judgments[id] = before;
            else delete judgments[id];
            return { judgments };
          });
      },
      setSaved: (id, on) => {
        const was = get().saves.find((x) => x.id === id);
        set((s) => ({ saves: on ? [{ id, at: Date.now() }, ...s.saves.filter((x) => x.id !== id)] : s.saves.filter((x) => x.id !== id) }));
        return () => set((s) => ({ saves: was ? [was, ...s.saves.filter((x) => x.id !== id)].sort((a, b) => b.at - a.at) : s.saves.filter((x) => x.id !== id) }));
      },
      seen: (id) => set((s) => (s.history[0]?.id === id ? {} : { history: [{ id, at: Date.now() }, ...s.history.filter((x) => x.id !== id)].slice(0, 200) })),
      addFeed: (spec) => set((s) => (s.feeds.some((f) => f.id === spec.id) ? {} : { feeds: [...s.feeds, spec] })),
      reset: () => set({ ...fresh(), onboarded: true }),
    }),
    { name: 'night-glass-starter', version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);

export const isSaved = (s: AppState, id: string) => s.saves.some((x) => x.id === id);
