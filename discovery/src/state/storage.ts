/**
 * IndexedDB-backed zustand storage with debounced writes. Swipes produce a
 * burst of small state changes; we coalesce them and flush when the page is
 * hidden so nothing is lost when iOS suspends the PWA.
 */
import { get, set, del } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const entries = [...pending];
  pending.clear();
  await Promise.all(entries.map(([k, v]) => set(k, v)));
}

if (typeof window !== 'undefined') {
  const onHide = () => void flush();
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
}

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

export const idbStorage: StateStorage = {
  async getItem(name) {
    if (!hasIDB()) return localStorage.getItem(name);
    try {
      return ((await get(name)) as string | undefined) ?? null;
    } catch {
      return localStorage.getItem(name);
    }
  },
  setItem(name, value) {
    if (!hasIDB()) {
      try {
        localStorage.setItem(name, value);
      } catch {
        /* quota or private mode: state stays in memory */
      }
      return;
    }
    pending.set(name, value);
    if (!timer) timer = setTimeout(() => void flush(), 450);
  },
  async removeItem(name) {
    pending.delete(name);
    try {
      await del(name);
    } catch {
      localStorage.removeItem(name);
    }
  },
};

export const flushStorage = flush;
