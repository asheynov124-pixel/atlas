import { create } from 'zustand';
import type { Author } from '@/book/types';

export type Mode = 'read' | 'edit';
export type ThemeName = 'day' | 'night';
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
export type Panel = null | 'chapters' | 'theme' | 'editions' | 'author' | 'compare';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
};

interface UiState {
  mode: Mode;
  theme: ThemeName;
  author: Author | null;
  /** Current spread index, mirrored from the route. */
  spreadIndex: number;
  /** Phone only: chrome shows after a tap on the page. */
  chromeVisible: boolean;
  toggleChrome: () => void;
  setChromeVisible: (v: boolean) => void;
  saveState: SaveState;
  setSaveState: (s: SaveState) => void;
  panel: Panel;
  setPanel: (p: Panel) => void;
  /** Why the author prompt opened: to start editing, or just to sign a heart or note. */
  authorIntent: 'edit' | 'sign';
  openAuthorPrompt: (intent: 'edit' | 'sign') => void;
  showResolved: boolean;
  setShowResolved: (v: boolean) => void;
  /** Phone: the spread whose edit tools are live. */
  compareIds: string[];
  compareOpen: boolean;
  setCompareOpen: (v: boolean) => void;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  setMode: (m: Mode) => void;
  setTheme: (t: ThemeName) => void;
  setAuthor: (a: Author | null) => void;
  setSpreadIndex: (i: number) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  mode: 'read',
  theme: read<ThemeName>('sb.theme', 'day'),
  author: read<Author | null>('sb.author', null),
  spreadIndex: 0,
  chromeVisible: false,
  toggleChrome: () => set((s) => ({ chromeVisible: !s.chromeVisible })),
  setChromeVisible: (chromeVisible) => set({ chromeVisible }),
  saveState: 'saved',
  setSaveState: (saveState) => set({ saveState }),
  panel: null,
  setPanel: (panel) => set({ panel }),
  authorIntent: 'sign',
  openAuthorPrompt: (authorIntent) => set({ panel: 'author', authorIntent }),
  showResolved: false,
  setShowResolved: (showResolved) => set({ showResolved }),
  compareIds: [],
  compareOpen: false,
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  toggleCompare: (id) =>
    set((s) => ({ compareIds: s.compareIds.includes(id) ? s.compareIds.filter((x) => x !== id) : s.compareIds.length >= 3 ? s.compareIds : [...s.compareIds, id] })),
  clearCompare: () => set({ compareIds: [] }),
  setMode: (mode) => set({ mode }),
  setTheme: (theme) => {
    write('sb.theme', theme);
    set({ theme });
  },
  setAuthor: (author) => {
    write('sb.author', author);
    set({ author });
  },
  setSpreadIndex: (spreadIndex) => set({ spreadIndex }),
}));
