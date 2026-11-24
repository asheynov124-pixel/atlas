/*
 * storage.js — PERSISTENCE
 *
 * The only file that talks to localStorage. It never throws: every
 * method reports what happened, so the rest of the app can tell the
 * person the truth instead of crashing or pretending a save worked.
 *
 * The storage object is passed in (`getStorage`) so tests can hand it
 * a fake one that misbehaves on purpose.
 */
(function (factory) {
  const isNode = typeof module === 'object' && module.exports;
  const draftLib = isNode ? require('./drafts.js') : globalThis.PromptStudio.drafts;
  const api = factory(draftLib);
  if (isNode) module.exports = api;
  else globalThis.PromptStudio.storage = api;
})(function (draftLib) {
  'use strict';

  const DEFAULT_KEY = 'promptStudio.drafts.v1';

  function createDraftStore({ getStorage, key = DEFAULT_KEY }) {
    const backupKey = key + '.backup';
    const probeKey = key + '.probe';

    // Simply touching window.localStorage can throw (blocked cookies,
    // some private modes), so even getting hold of it is guarded.
    function storageOrNull() {
      try {
        const storage = getStorage();
        return storage && typeof storage.getItem === 'function' ? storage : null;
      } catch (error) {
        return null;
      }
    }

    // Keep an unreadable copy instead of letting the next save erase it.
    function backup(storage, raw) {
      try {
        if (storage.getItem(backupKey) !== raw) storage.setItem(backupKey, raw);
        return true;
      } catch (error) {
        return false;
      }
    }

    /** Read drafts without writing anything. */
    function read() {
      const storage = storageOrNull();
      if (!storage) return { readable: false, status: 'unavailable', drafts: [], skipped: 0, raw: null };
      let raw;
      try {
        raw = storage.getItem(key);
      } catch (error) {
        return { readable: false, status: 'unavailable', drafts: [], skipped: 0, raw: null };
      }
      return { readable: true, raw, ...draftLib.parseStore(raw) };
    }

    /**
     * Read drafts at start-up, back up damaged data, and check
     * whether writing works at all.
     */
    function load() {
      const result = read();
      if (!result.readable) return { ...result, writable: false, backedUp: false };
      const storage = storageOrNull();
      let backedUp = false;
      if (result.status === 'corrupt' || result.status === 'partial') backedUp = backup(storage, result.raw);
      let writable = true;
      try {
        storage.setItem(probeKey, '1');
        storage.removeItem(probeKey);
      } catch (error) {
        writable = false;
      }
      return { ...result, writable, backedUp };
    }

    /** Save the whole list. Success is only reported after reading it back. */
    function write(list) {
      const storage = storageOrNull();
      if (!storage) return { ok: false, reason: 'unavailable' };
      const serialized = draftLib.serializeStore(list);
      try {
        storage.setItem(key, serialized);
      } catch (error) {
        const quota = error && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014);
        return { ok: false, reason: quota ? 'quota' : 'blocked' };
      }
      try {
        if (storage.getItem(key) !== serialized) return { ok: false, reason: 'verify' };
      } catch (error) {
        return { ok: false, reason: 'verify' };
      }
      return { ok: true };
    }

    /**
     * Apply one change (`operation`) to the freshest saved list and save it.
     *
     * Re-reading first matters when Prompt Studio is open in two tabs:
     * without it, tab B would save its stale list and silently wipe a
     * draft that tab A had just saved.
     *
     * `fallback` is the list already on screen, used if the saved data
     * can't be read right now.
     *
     * Returns the operation's result, or { ok: false, code: 'write_failed', reason }.
     */
    function commit(operation, fallback) {
      const fresh = read();
      let base = fallback || [];
      if (fresh.readable && fresh.status !== 'corrupt') base = fresh.drafts;
      if (fresh.readable && (fresh.status === 'corrupt' || fresh.status === 'partial')) {
        backup(storageOrNull(), fresh.raw);
      }
      const result = operation(base);
      if (!result.ok) return result;
      const saved = write(result.drafts);
      if (!saved.ok) return { ok: false, code: 'write_failed', reason: saved.reason };
      return result;
    }

    return { key, backupKey, read, load, write, commit };
  }

  return { DEFAULT_KEY, createDraftStore };
});
