/**
 * Save / load (FOUNDATION). IndexedDB with gzip (CompressionStream) when available; localStorage fallback, then
 * session memory (sandboxed iframes / private browsing) so saving never fails or throws.
 * A save file = { v, meta, empire } where empire.planets holds every colony's PlanetSave.
 */
import type { EmpireState } from '../game/Empire';
import { b64ToBytes, bytesToB64 } from './b64';

export interface SaveMeta {
  slot: string;
  name: string;
  mode: 'career' | 'sandbox';
  planetName: string;
  population: number;
  day: number;
  savedAt: number;
  /** small JPEG data URL thumbnail (optional) */
  thumb?: string;
  /** name of the active city (optional; older saves lack it) */
  cityName?: string;
  /** career tier 0..8 (optional) */
  tier?: number;
}

export interface SaveFile {
  v: 1;
  meta: SaveMeta;
  empire: EmpireState;
}

const DB = 'cosmopolis';
const STORE = 'saves';
const META = 'meta';
const LS_PREFIX = 'cosmopolis.save.';

/**
 * Storage backends, best first: IndexedDB (gzip) → localStorage → session memory. Sandboxed iframes, private modes
 * and blocked site data make the first two throw (even on property access), so every call is guarded and the game
 * keeps saving into memory for the session instead of failing.
 */
const mem = new Map<string, { text: string; meta: SaveMeta }>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const idbf = globalThis.indexedDB;
      if (!idbf) return resolve(null);
      const req = idbf.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idb<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/** localStorage, or null when it is missing or throws on access (sandboxed frames). */
function ls(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.getItem('__cosmo_probe__');
    return s;
  } catch {
    return null;
  }
}

async function gzip(text: string): Promise<Blob | string> {
  try {
    if (typeof CompressionStream === 'undefined') return text;
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch {
    return text;
  }
}

async function gunzip(data: Blob | string): Promise<string> {
  if (typeof data === 'string') return data;
  const stream = data.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export async function writeSave(file: SaveFile): Promise<void> {
  const text = JSON.stringify(file);
  const db = await openDb();
  if (db) {
    try {
      const payload = await gzip(text);
      await idb(db, STORE, 'readwrite', (s) => s.put(payload, file.meta.slot));
      await idb(db, META, 'readwrite', (s) => s.put(file.meta, file.meta.slot));
      return;
    } catch (e) {
      console.warn('[save] IndexedDB write failed — falling back', e);
    }
  }
  const store = ls();
  if (store) {
    try {
      store.setItem(LS_PREFIX + file.meta.slot, text);
      store.setItem(LS_PREFIX + 'meta.' + file.meta.slot, JSON.stringify(file.meta));
      return;
    } catch (e) {
      console.warn('[save] localStorage write failed — keeping the save in memory', e);
    }
  }
  // no persistent storage (sandboxed frame / private mode / quota): keep it for this session
  mem.set(file.meta.slot, { text, meta: file.meta });
}

export async function readSave(slot: string): Promise<SaveFile | null> {
  const m = mem.get(slot);
  if (m) return JSON.parse(m.text) as SaveFile;
  const db = await openDb();
  if (db) {
    try {
      const data = await idb<Blob | string | undefined>(db, STORE, 'readonly', (s) => s.get(slot));
      if (data !== undefined) return JSON.parse(await gunzip(data)) as SaveFile;
    } catch (e) {
      console.warn('[save] IndexedDB read failed', e);
    }
  }
  try {
    const raw = ls()?.getItem(LS_PREFIX + slot);
    return raw ? (JSON.parse(raw) as SaveFile) : null;
  } catch {
    return null;
  }
}

export async function listSaves(): Promise<SaveMeta[]> {
  const bySlot = new Map<string, SaveMeta>();
  const db = await openDb();
  if (db) {
    try {
      for (const m of await idb<SaveMeta[]>(db, META, 'readonly', (s) => s.getAll())) bySlot.set(m.slot, m);
    } catch (e) {
      console.warn('[save] IndexedDB list failed', e);
    }
  }
  const store = ls();
  if (store) {
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k || !k.startsWith(LS_PREFIX + 'meta.')) continue;
        const m = JSON.parse(store.getItem(k) ?? 'null') as SaveMeta | null;
        if (m && !bySlot.has(m.slot)) bySlot.set(m.slot, m);
      }
    } catch {
      /* ignore */
    }
  }
  for (const { meta } of mem.values()) bySlot.set(meta.slot, meta);
  return [...bySlot.values()].sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(slot: string): Promise<void> {
  mem.delete(slot);
  const db = await openDb();
  if (db) {
    try {
      await idb(db, STORE, 'readwrite', (s) => s.delete(slot));
      await idb(db, META, 'readwrite', (s) => s.delete(slot));
    } catch (e) {
      console.warn('[save] IndexedDB delete failed', e);
    }
  }
  try {
    const store = ls();
    store?.removeItem(LS_PREFIX + slot);
    store?.removeItem(LS_PREFIX + 'meta.' + slot);
  } catch {
    /* ignore */
  }
}

/** Serialize a save for sharing / backup (.cosmo file, gzip JSON). */
export async function exportSave(slot: string): Promise<Blob | null> {
  const f = await readSave(slot);
  if (!f) return null;
  const z = await gzip(JSON.stringify(f));
  return typeof z === 'string' ? new Blob([z], { type: 'application/json' }) : z;
}

/**
 * JSON envelope around the .cosmo bytes, for places that only accept a few file types (the claude.ai artifact
 * viewer saves .json but not .cosmo): { "format": "cosmopolis-save", "v": 1, "data": "<base64 of the .cosmo bytes>" }.
 */
export const SAVE_WRAPPER_FORMAT = 'cosmopolis-save';

export async function wrapSaveJson(cosmo: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await cosmo.arrayBuffer());
  return new Blob([JSON.stringify({ format: SAVE_WRAPPER_FORMAT, v: 1, data: bytesToB64(bytes) })], { type: 'application/json' });
}

/** The .cosmo bytes inside a wrapper's text, or null when the text is not a wrapper. */
export function unwrapSaveJson(text: string): Uint8Array | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  const w = o as { format?: unknown; data?: unknown } | null;
  if (!w || w.format !== SAVE_WRAPPER_FORMAT || typeof w.data !== 'string') return null;
  return b64ToBytes(w.data);
}

/** Decode any accepted export (.cosmo gzip JSON, plain JSON, or the JSON wrapper) into a save file. */
export async function decodeSaveFile(file: Blob, depth = 0): Promise<SaveFile> {
  let text: string;
  try {
    text = await gunzip(file);
  } catch {
    text = await file.text();
  }
  const inner = depth === 0 ? unwrapSaveJson(text) : null;
  if (inner) return decodeSaveFile(new Blob([inner as BlobPart]), depth + 1);
  const parsed = JSON.parse(text) as SaveFile;
  if (!parsed?.empire || !parsed.meta) throw new Error('Not a Cosmopolis save');
  return parsed;
}

export async function importSave(file: Blob): Promise<SaveFile> {
  const parsed = await decodeSaveFile(file);
  parsed.meta.slot = 'import-' + Date.now();
  await writeSave(parsed);
  return parsed;
}
