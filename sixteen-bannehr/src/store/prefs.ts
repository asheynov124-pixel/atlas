import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Author } from '../model/types';

export type ThemeChoice = 'auto' | 'day' | 'night';

interface Prefs {
  /** Who is editing on this device. Asked once. */
  who: Author | null;
  theme: ThemeChoice;
  showNotes: boolean;
  showResolved: boolean;
  setWho: (who: Author) => void;
  setTheme: (theme: ThemeChoice) => void;
  toggleNotes: () => void;
  toggleResolved: () => void;
}

// Device preferences, not book data: they never travel in an export.
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      who: null,
      theme: 'auto',
      showNotes: true,
      showResolved: false,
      setWho: (who) => set({ who }),
      setTheme: (theme) => set({ theme }),
      toggleNotes: () => set((s) => ({ showNotes: !s.showNotes })),
      toggleResolved: () => set((s) => ({ showResolved: !s.showResolved })),
    }),
    {
      name: 'sixteen-bannehr:prefs',
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
    },
  ),
);

/** Read or Edit. Always opens in Read: the book should greet her as a book. */
export const useMode = create<{ editing: boolean; setEditing: (v: boolean) => void }>()((set) => ({
  editing: false,
  setEditing: (editing) => set({ editing }),
}));

/** The tool in hand in Edit mode: placing a note, or nothing. */
export const useEditTool = create<{ tool: 'none' | 'note'; focusNote: string | null; set: (tool: 'none' | 'note') => void; setFocusNote: (id: string | null) => void }>()(
  (set) => ({
    tool: 'none',
    focusNote: null,
    set: (tool) => set({ tool }),
    setFocusNote: (focusNote) => set({ focusNote }),
  }),
);
