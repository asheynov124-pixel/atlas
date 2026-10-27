/** Session UI state: tab, open sheets, toasts, and where you are in each feed. Not persisted. */
import { create } from 'zustand';
import type { Verb } from '../app/verbs';

export type Tab = 'feed' | 'search' | 'library' | 'you';
export type SheetSpec = { kind: 'actions'; cardId: string } | { kind: 'gestures' } | { kind: 'feeds' };

export interface Toast {
  id: number;
  text: string;
  tone?: Verb | 'info' | 'error';
  action?: { label: string; run: () => void };
  ttl: number;
}

interface UIState {
  tab: Tab;
  sheets: SheetSpec[];
  toasts: Toast[];
  feedId: string;
  positions: Record<string, number>;
  overlayHidden: boolean;
  setTab: (tab: Tab) => void;
  openSheet: (s: SheetSpec) => void;
  closeSheet: () => void;
  toast: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => void;
  dropToast: (id: number) => void;
  setFeed: (id: string) => void;
  setPosition: (feedId: string, i: number) => void;
  setOverlayHidden: (on: boolean) => void;
}

let seq = 1;

export const useUI = create<UIState>((set) => ({
  tab: 'feed',
  sheets: [],
  toasts: [],
  feedId: 'for-you',
  positions: {},
  overlayHidden: false,
  setTab: (tab) => set({ tab, sheets: [] }),
  openSheet: (s) => set((st) => ({ sheets: [...st.sheets.filter((x) => x.kind !== s.kind), s] })),
  closeSheet: () => set((st) => ({ sheets: st.sheets.slice(0, -1) })),
  // At most three on screen; 2.2s, or 4.2s when there's something to tap.
  toast: (t) => set((st) => ({ toasts: [...st.toasts.slice(-2), { ttl: t.action ? 4200 : 2200, ...t, id: seq++ }] })),
  dropToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  setFeed: (feedId) => set({ feedId }),
  setPosition: (feedId, i) => set((st) => ({ positions: { ...st.positions, [feedId]: i } })),
  setOverlayHidden: (overlayHidden) => set({ overlayHidden }),
}));
