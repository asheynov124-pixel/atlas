import { migrateBook } from '@/book/migrate';
import { buildSeedBook } from '@/book/seed';
import type { Book } from '@/book/types';
import { DexieStorage, hasIndexedDb } from '@/storage/dexie';
import { getStorage, setStorage } from '@/storage';
import { applyPhotoManifest } from '@/content/applyManifest';
import { useBookStore } from './bookStore';
import { useUiStore } from './uiStore';

let started = false;

/** Choose a storage, load the saved book (or the seed), and start autosave. */
export async function bootstrap() {
  if (started) return;
  started = true;
  if (hasIndexedDb()) {
    try {
      setStorage(new DexieStorage());
    } catch (e) {
      console.warn('IndexedDB unavailable, keeping the book in memory', e);
    }
  }
  const storage = getStorage();
  let book: Book | null = null;
  try {
    const saved = await storage.loadBook();
    if (saved) book = migrateBook(saved);
  } catch (e) {
    console.warn('Could not read the saved book, starting from the seed', e);
  }
  if (!book) {
    book = buildSeedBook();
  }
  book = applyPhotoManifest(book);
  useBookStore.setState({ book, loaded: true });
  useBookStore.temporal.getState().clear();
  await storage.saveBook(book);
  useUiStore.getState().setSaveState('saved');
  startAutosave();
}

let timer: number | undefined;
let pending: Book | null = null;

async function flush() {
  if (!pending) return;
  const book = pending;
  pending = null;
  const ui = useUiStore.getState();
  ui.setSaveState('saving');
  try {
    await getStorage().saveBook(book);
    ui.setSaveState('saved');
  } catch (e) {
    console.error('Autosave failed', e);
    ui.setSaveState('error');
  }
}

function startAutosave() {
  useBookStore.subscribe((state, prev) => {
    if (state.book === prev.book || !state.loaded) return;
    pending = state.book;
    useUiStore.getState().setSaveState('dirty');
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 400);
  });
  const onHide = () => {
    window.clearTimeout(timer);
    void flush();
  };
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
}

/** Wait for any pending autosave (tests, export). */
export async function flushSaves() {
  window.clearTimeout(timer);
  await flush();
}
