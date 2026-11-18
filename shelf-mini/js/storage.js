// Persistence: favorites in localStorage, written defensively.
//
// Browsers can refuse storage in several ways: the localStorage property itself
// throws (storage disabled, some private modes), setItem throws (quota full), or
// the saved value is damaged. None of these may break the app, and the app must
// never claim a change was saved when it was not. So every call reports what
// actually happened, and a save counts only once the value reads back intact.

const DEFAULT_KEY = 'shelf-mini:favorites';
const FORMAT = 1;

const browserStorage = () => window.localStorage;

/** Parses a saved value. Returns a list of ids, or null if the value is damaged. */
function parse(raw, validIds) {
  try {
    const data = JSON.parse(raw);
    if (!data || data.format !== FORMAT || !Array.isArray(data.ids)) return null;
    const ids = data.ids.filter((id) => typeof id === 'string' && (!validIds || validIds.has(id)));
    return [...new Set(ids)];
  } catch {
    return null;
  }
}

export function createFavoriteStorage({ validIds, key = DEFAULT_KEY, getStorage = browserStorage } = {}) {
  function storageOrNull() {
    try {
      return getStorage() ?? null;
    } catch {
      return null;
    }
  }

  /** status: 'ok' | 'empty' | 'unreadable' (damaged value) | 'unavailable' (no access) */
  function read() {
    const store = storageOrNull();
    if (!store) return { status: 'unavailable', ids: [] };
    let raw;
    try {
      raw = store.getItem(key);
    } catch {
      return { status: 'unavailable', ids: [] };
    }
    if (raw === null) return { status: 'empty', ids: [] };
    const ids = parse(raw, validIds);
    return ids ? { status: 'ok', ids } : { status: 'unreadable', ids: [] };
  }

  /** True only if a test value can be written and read back. */
  function canWrite() {
    const store = storageOrNull();
    if (!store) return false;
    const probeKey = `${key}:probe`;
    try {
      store.setItem(probeKey, '1');
      const ok = store.getItem(probeKey) === '1';
      store.removeItem(probeKey);
      return ok;
    } catch {
      return false;
    }
  }

  /** Start-up read: what was saved, and whether new changes can be kept. */
  function load() {
    const { status, ids } = read();
    return {
      ids,
      canSave: status !== 'unavailable' && canWrite(),
      lostSaved: status === 'unreadable',
    };
  }

  /** Writes the full list. Returns true only if it is verifiably stored. */
  function save(ids) {
    const store = storageOrNull();
    if (!store) return false;
    const value = JSON.stringify({ format: FORMAT, ids });
    try {
      store.setItem(key, value);
      return store.getItem(key) === value;
    } catch {
      return false;
    }
  }

  /** For the window "storage" event: did another tab change our value? */
  function isOwnChange(eventKey) {
    return eventKey === null || eventKey === key;
  }

  return { load, read, save, isOwnChange };
}
