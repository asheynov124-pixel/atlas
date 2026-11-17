import { create } from 'zustand';
import { replaceBook, useBookStore } from './book';
import { repository } from '../storage/dexie';
import { migrate } from '../model/migrate';
import { createSeedBook } from '../model/seed';
import { placeBundled } from '../storage/place-bundled';
import type { Book } from '../model/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const useSaveStatus = create<{ state: SaveState; at: number | null; ready: boolean; error: string | null }>()(() => ({
  state: 'idle',
  at: null,
  ready: false,
  error: null,
}));

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Book | null = null;
let started = false;

async function write(book: Book) {
  useSaveStatus.setState({ state: 'saving' });
  try {
    await repository().saveBook(book);
    useSaveStatus.setState({ state: 'saved', at: Date.now(), error: null });
  } catch (e) {
    useSaveStatus.setState({ state: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Write any pending change now (tab hidden, page closing, before an export). */
export async function flushSave(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const b = pending;
  pending = null;
  if (b) await write(b);
}

/** Load the book (or the seed), place any bundled photos, and start autosaving. */
export async function boot(): Promise<void> {
  let book: Book;
  try {
    const stored = await repository().loadBook();
    book = stored ? migrate(stored) : createSeedBook();
  } catch (e) {
    console.warn('Could not open the saved book; starting from the seed.', e);
    book = createSeedBook();
  }
  const { book: withPhotos, placed } = placeBundled(book);
  replaceBook(withPhotos);
  if (placed) void write(withPhotos);
  startAutosave();
  useSaveStatus.setState({ ready: true });
}

function startAutosave() {
  if (started) return;
  started = true;
  useBookStore.subscribe((s, prev) => {
    if (s.book === prev.book) return;
    pending = s.book;
    useSaveStatus.setState({ state: 'saving' });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushSave(), 250);
  });
  const flush = () => void flushSave();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);
}
