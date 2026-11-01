import { create } from 'zustand';
import type { Author } from '@/book/types';

export type Mode = 'read' | 'edit';
export type ThemeName = 'day' | 'night';

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
