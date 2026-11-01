import { MemoryStorage } from './memory';
import type { BookStorage } from './types';

let impl: BookStorage = new MemoryStorage();

/** The active storage implementation. Swapped to Dexie at app start. */
export function getStorage(): BookStorage {
  return impl;
}

export function setStorage(next: BookStorage) {
  impl = next;
}

export type { BookStorage } from './types';
