/** Transient UI state. Never persisted. */
import { create } from 'zustand';
import type { FacetWeights } from '../data/types';

export type Tab = 'feed' | 'search' | 'library' | 'you';

export type Sheet =
  | { kind: 'details'; videoId: string }
  | { kind: 'menu'; videoId: string }
  | { kind: 'save'; videoId: string }
  | { kind: 'paths' }
  | { kind: 'filters'; scope: 'global' | 'path' }
  | { kind: 'profiles' }
  | { kind: 'more-like'; videoId: string; title?: string }
  | { kind: 'aspect-result'; videoId: string }
  | { kind: 'visual-search' }
  | { kind: 'board'; boardId: string }
  | { kind: 'collection'; title: string; videoIds: string[]; refId?: string }
  | { kind: 'edit-save'; videoId: string };

export interface Toast {
  id: number;
  text: string;
  tone?: 'like' | 'dislike' | 'save' | 'capture' | 'info' | 'error';
  action?: { label: string; run: () => void };
  ttl: number;
}

export interface CaptureState {
  videoId: string;
  /** Clip time when capture began. */
  time: number;
}

export interface AspectDraft {
  videoId: string;
  hit: FacetWeights;
  regionLabel?: string;
  text: string;
  quickFacet?: keyof FacetWeights;
}

interface UIState {
  tab: Tab;
  sheets: Sheet[];
  toasts: Toast[];
  capture: CaptureState | null;
  aspectDraft: AspectDraft | null;
  /** Per-path loading state for queue extension. */
  pathStatus: Record<string, { loading: boolean; error?: string }>;
  locked: boolean;
  overlayHidden: boolean;
  searchText: string;
  setTab: (t: Tab) => void;
  openSheet: (s: Sheet) => void;
  closeSheet: () => void;
  closeAllSheets: () => void;
  toast: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => void;
  dropToast: (id: number) => void;
  setCapture: (c: CaptureState | null) => void;
  setAspectDraft: (d: AspectDraft | null) => void;
  setPathStatus: (id: string, st: { loading: boolean; error?: string }) => void;
  setLocked: (l: boolean) => void;
  setOverlayHidden: (h: boolean) => void;
  setSearchText: (t: string) => void;
}

const tabFromHash = (): Tab => {
  const h = typeof location !== 'undefined' ? location.hash.replace('#/', '') : '';
  return (['feed', 'search', 'library', 'you'] as Tab[]).includes(h as Tab) ? (h as Tab) : 'feed';
};

let toastSeq = 1;

export const useUI = create<UIState>((set) => ({
  tab: tabFromHash(),
  sheets: [],
  toasts: [],
  capture: null,
  aspectDraft: null,
  pathStatus: {},
  locked: false,
  overlayHidden: false,
  searchText: '',
  setTab: (tab) => {
    if (typeof history !== 'undefined' && import.meta.env.VITE_EMBED !== '1') history.replaceState(history.state, '', `#/${tab}`);
    set({ tab, sheets: [] });
  },
  openSheet: (s) => set((st) => ({ sheets: [...st.sheets.filter((x) => x.kind !== s.kind), s] })),
  closeSheet: () => set((st) => ({ sheets: st.sheets.slice(0, -1) })),
  closeAllSheets: () => set({ sheets: [] }),
  toast: (t) => {
    const id = toastSeq++;
    set((st) => ({ toasts: [...st.toasts.slice(-2), { ttl: t.action ? 4200 : 2200, ...t, id }] }));
  },
  dropToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  setCapture: (capture) => set({ capture }),
  setAspectDraft: (aspectDraft) => set({ aspectDraft }),
  setPathStatus: (id, st) => set((s) => ({ pathStatus: { ...s.pathStatus, [id]: st } })),
  setLocked: (locked) => set({ locked }),
  setOverlayHidden: (overlayHidden) => set({ overlayHidden }),
  setSearchText: (searchText) => set({ searchText }),
}));
