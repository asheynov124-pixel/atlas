import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import type { Draft } from 'immer';
import { createSeedBook } from '../model/seed';
import { layoutBook, type Layout } from '../model/pages';
import type { Book, Chapter, Slot, Spread } from '../model/types';

interface BookState {
  book: Book;
}

/**
 * The book store. Only `book` is tracked for undo; one named action is one undo step.
 * Text commits on blur and canvas moves commit on drop, so a gesture is never split into
 * keystrokes or pixels.
 */
export const useBookStore = create<BookState>()(
  temporal(
    immer(() => ({ book: createSeedBook() })),
    {
      limit: 200,
      partialize: (s) => ({ book: s.book }),
      equality: (a, b) => a.book === b.book,
    },
  ),
);

export const getBook = () => useBookStore.getState().book;

/** Apply a change to the book as one undoable step. */
export function mutate(recipe: (book: Draft<Book>) => void): void {
  useBookStore.setState((s) => {
    recipe(s.book);
    s.book.updatedAt = new Date().toISOString();
  });
}

/** Replace the whole book. Loading is not undoable; restoring an edition is. */
export function replaceBook(book: Book, { undoable = false } = {}): void {
  const t = useBookStore.temporal.getState();
  if (!undoable) t.pause();
  useBookStore.setState((s) => {
    s.book = book as Draft<Book>;
  });
  if (!undoable) {
    t.resume();
    t.clear();
  }
}

export const undo = () => useBookStore.temporal.getState().undo();
export const redo = () => useBookStore.temporal.getState().redo();

// ── Selectors ────────────────────────────────────────────────────────────────

const layouts = new WeakMap<Book, Layout>();

export function layoutOf(book: Book): Layout {
  let l = layouts.get(book);
  if (!l) {
    l = layoutBook(book);
    layouts.set(book, l);
  }
  return l;
}

export function useBook(): Book {
  return useBookStore((s) => s.book);
}

export function useLayout(): Layout {
  return layoutOf(useBookStore((s) => s.book));
}

// ── Finders (work on drafts and plain books alike) ───────────────────────────

export function findSpread(book: Book | Draft<Book>, id: string): { chapter: Chapter; spread: Spread; index: number } | null {
  for (const chapter of book.chapters) {
    const index = chapter.spreads.findIndex((s) => s.id === id);
    if (index >= 0) return { chapter: chapter as Chapter, spread: chapter.spreads[index] as Spread, index };
  }
  return null;
}

export function findChapter(book: Book | Draft<Book>, id: string): Chapter | null {
  return (book.chapters.find((c) => c.id === id) as Chapter | undefined) ?? null;
}

// ── Small, common actions ────────────────────────────────────────────────────

export function setSlot(spreadId: string, key: string, slot: Slot): void {
  mutate((b) => {
    const f = findSpread(b, spreadId);
    if (f) f.spread.slots[key] = slot;
  });
}

export function updateSlot<K extends Slot['kind']>(
  spreadId: string,
  key: string,
  kind: K,
  recipe: (slot: Draft<Extract<Slot, { kind: K }>>) => void,
): void {
  mutate((b) => {
    const f = findSpread(b, spreadId);
    const slot = f?.spread.slots[key];
    if (slot && slot.kind === kind) recipe(slot as Draft<Extract<Slot, { kind: K }>>);
  });
}

export function setSlotText(spreadId: string, key: string, html: string): void {
  mutate((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    const slot = f.spread.slots[key];
    if (slot && slot.kind === 'text') slot.html = html;
    else f.spread.slots[key] = { kind: 'text', html };
  });
}

export function setChapterField(chapterId: string, field: 'title' | 'kicker' | 'epigraph' | 'tone' | 'slug', value: string): void {
  mutate((b) => {
    const c = findChapter(b, chapterId);
    if (c) c[field] = value;
  });
}

export function setBookField(field: 'title' | 'subtitle' | 'address' | 'dedication', value: string): void {
  mutate((b) => {
    b[field] = value;
  });
}
