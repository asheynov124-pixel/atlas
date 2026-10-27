/**
 * IndexedDB-backed zustand persistence.
 *
 * - Writes are debounced *and* serialised lazily: zustand hands us the state
 *   object and we only JSON.stringify once per flush, not on every change
 *   (a swipe produces several store updates).
 * - Pending writes flush when the page is hidden, so nothing is lost when iOS
 *   suspends the PWA.
 * - Persistence can be paused (incognito): nothing reaches disk until resumed.
 * - Writes can be held (another tab is the live one): changes wait in memory and
 *   are written once this tab is live again, or discarded if it never is.
 */
import { get, set, del } from 'idb-keyval';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

const pending = new Map<string, StorageValue<unknown>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let paused = false;
let held = false;

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function localSet(name: string, raw: string) {
  try {
    localStorage.setItem(name, raw);
  } catch {
    /* quota or private mode: state stays in memory */
  }
}

/** Write everything pending. The pending set is captured synchronously. */
export async function flushStorage() {
  if (held) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const entries = [...pending];
  pending.clear();
  await Promise.all(
    entries.map(async ([name, value]) => {
      const raw = JSON.stringify(value);
      if (!hasIDB()) return localSet(name, raw);
      try {
        await set(name, raw);
      } catch {
        localSet(name, raw);
      }
    }),
  );
}

/** Pausing first flushes what was already pending, then drops writes until resumed. */
export function setPersistencePaused(on: boolean) {
  if (on) void flushStorage();
  paused = on;
}

export function isPersistencePaused() {
  return paused;
}

/**
 * Hold writes while another tab is the live one, so a stale tab can't overwrite it.
 * `discard` drops what this tab queued meanwhile; releasing the hold writes the rest.
 */
export function holdWrites(on: boolean, opts: { discard?: boolean } = {}) {
  held = on;
  if (opts.discard) pending.clear();
  if (on && timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!on && pending.size && !timer) timer = setTimeout(() => void flushStorage(), 450);
}

if (typeof window !== 'undefined') {
  const onHide = () => void flushStorage();
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
}

export function idbPersistStorage<S>(): PersistStorage<S> {
  return {
    async getItem(name) {
      let raw: string | null | undefined;
      if (hasIDB()) {
        try {
          raw = (await get(name)) as string | undefined;
        } catch {
          raw = localStorage.getItem(name);
        }
      } else {
        try {
          raw = localStorage.getItem(name);
        } catch {
          raw = null;
        }
      }
      return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
    },
    setItem(name, value) {
      if (paused) return;
      pending.set(name, value as StorageValue<unknown>);
      if (!timer && !held) timer = setTimeout(() => void flushStorage(), 450);
    },
    async removeItem(name) {
      pending.delete(name);
      try {
        if (hasIDB()) await del(name);
        else localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}
