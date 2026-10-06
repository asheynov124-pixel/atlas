/**
 * Save / load (FOUNDATION). IndexedDB with gzip (CompressionStream) when available; localStorage fallback.
 * A save file = { v, meta, empire } where empire.planets holds every colony's PlanetSave.
 */
import type { EmpireState } from '../game/Empire';

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

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idb<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
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
    const payload = await gzip(text);
    await idb(db, STORE, 'readwrite', (s) => s.put(payload, file.meta.slot));
    await idb(db, META, 'readwrite', (s) => s.put(file.meta, file.meta.slot));
    return;
  }
  try {
    localStorage.setItem(LS_PREFIX + file.meta.slot, text);
    localStorage.setItem(LS_PREFIX + 'meta.' + file.meta.slot, JSON.stringify(file.meta));
  } catch (e) {
    throw new Error('Storage full or unavailable: ' + (e as Error).message);
  }
}

export async function readSave(slot: string): Promise<SaveFile | null> {
  const db = await openDb();
  if (db) {
    const data = await idb<Blob | string | undefined>(db, STORE, 'readonly', (s) => s.get(slot));
    if (data === undefined) return null;
    return JSON.parse(await gunzip(data)) as SaveFile;
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + slot);
    return raw ? (JSON.parse(raw) as SaveFile) : null;
  } catch {
    return null;
  }
}

export async function listSaves(): Promise<SaveMeta[]> {
  const db = await openDb();
  let metas: SaveMeta[] = [];
  if (db) metas = await idb<SaveMeta[]>(db, META, 'readonly', (s) => s.getAll());
  else {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith(LS_PREFIX + 'meta.')) metas.push(JSON.parse(localStorage.getItem(k)!));
      }
    } catch {
      /* ignore */
    }
  }
  return metas.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(slot: string): Promise<void> {
  const db = await openDb();
  if (db) {
    await idb(db, STORE, 'readwrite', (s) => s.delete(slot));
    await idb(db, META, 'readwrite', (s) => s.delete(slot));
    return;
  }
  try {
    localStorage.removeItem(LS_PREFIX + slot);
    localStorage.removeItem(LS_PREFIX + 'meta.' + slot);
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

export async function importSave(file: Blob): Promise<SaveFile> {
  let text: string;
  try {
    text = await gunzip(file);
  } catch {
    text = await file.text();
  }
  const parsed = JSON.parse(text) as SaveFile;
  if (!parsed?.empire || !parsed.meta) throw new Error('Not a Cosmopolis save');
  parsed.meta.slot = 'import-' + Date.now();
  await writeSave(parsed);
  return parsed;
}
