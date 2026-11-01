import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import type { Book } from '@/book/types';
import { buildSeedBook } from '@/book/seed';

export interface BookState {
  book: Book;
  /** True once storage has been consulted (seed or saved copy). */
  loaded: boolean;
  setBook: (book: Book, opts?: { loaded?: boolean }) => void;
  /** Mutate the book in place (Immer draft). Every edit goes through here. */
  update: (fn: (book: Book) => void) => void;
}

/**
 * The document store. Wrapped in zundo so every `update` is one undo step.
 * UI state (mode, current spread, drawers) lives in uiStore and is never
 * part of history.
 */
export const useBookStore = create<BookState>()(
  temporal(
    immer((set) => ({
      book: buildSeedBook(),
      loaded: false,
      setBook: (book, opts) =>
        set((s) => {
          s.book = book as BookState['book'];
          if (opts?.loaded !== undefined) s.loaded = opts.loaded;
        }),
      update: (fn) =>
        set((s) => {
          fn(s.book as Book);
          s.book.updatedAt = new Date().toISOString();
        }),
    })),
    {
      limit: 200,
      partialize: (s) => ({ book: s.book }) as unknown as BookState,
      equality: (a, b) => a.book === b.book,
    },
  ),
);

export const useTemporal = () => useBookStore.temporal;
