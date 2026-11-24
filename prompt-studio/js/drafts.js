/*
 * drafts.js — DRAFT RULES
 *
 * Everything about what a draft is and what you may do to a list of
 * drafts: naming rules, create / update / delete, and reading saved
 * data safely. Like prompt.js, this file is pure: lists go in, new
 * lists come out, nothing touches the page or localStorage.
 *
 * A draft looks like:
 *   { id, name, fields: { goal, audience, constraints, output },
 *     createdAt, updatedAt }   // times are milliseconds since 1970
 */
(function (factory) {
  const isNode = typeof module === 'object' && module.exports;
  const promptLib = isNode ? require('./prompt.js') : globalThis.PromptStudio.prompt;
  const api = factory(promptLib);
  if (isNode) module.exports = api;
  else globalThis.PromptStudio.drafts = api;
})(function (promptLib) {
  'use strict';

  const FIELD_KEYS = promptLib.FIELD_KEYS;
  const STORE_VERSION = 1;
  const NAME_MAX = 80;
  const FIELD_MAX = 20000;

  // ---------------------------------------------------------------- fields

  function emptyFields() {
    const fields = {};
    for (const key of FIELD_KEYS) fields[key] = '';
    return fields;
  }

  /** Keep only the four known fields, as strings. Anything else is dropped. */
  function sanitizeFields(input) {
    const fields = emptyFields();
    if (input && typeof input === 'object') {
      for (const key of FIELD_KEYS) {
        if (typeof input[key] === 'string') fields[key] = input[key].slice(0, FIELD_MAX);
      }
    }
    return fields;
  }

  function fieldsEqual(a, b) {
    return FIELD_KEYS.every((key) => ((a && a[key]) || '') === ((b && b[key]) || ''));
  }

  function hasAnyText(fields) {
    return FIELD_KEYS.some((key) => promptLib.cleanText(fields && fields[key]) !== '');
  }

  // ---------------------------------------------------------------- names

  /** "  Launch   email " -> "Launch email" */
  function normalizeName(raw) {
    return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  }

  function sameName(a, b) {
    return normalizeName(a).toLocaleLowerCase() === normalizeName(b).toLocaleLowerCase();
  }

  /**
   * Check a draft name against the rules and the existing list.
   * `excludeId` is the draft being renamed, so it does not clash with itself.
   *
   * Returns { ok: true, name } or { ok: false, code, name, conflict? }
   * where code is 'empty', 'too_long' or 'duplicate'.
   */
  function validateName(raw, list, excludeId) {
    const name = normalizeName(raw);
    if (!name) return { ok: false, code: 'empty', name };
    if (name.length > NAME_MAX) return { ok: false, code: 'too_long', name };
    const conflict = (list || []).find((d) => d.id !== excludeId && sameName(d.name, name));
    if (conflict) return { ok: false, code: 'duplicate', name, conflict };
    return { ok: true, name };
  }

  // ---------------------------------------------------------------- list operations
  // Each returns { ok: true, drafts, draft } or { ok: false, code, ... }.
  // The input list is never modified.

  function makeId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function createDraft(list, { name, fields, now = Date.now(), id = makeId() }) {
    const check = validateName(name, list, null);
    if (!check.ok) return check;
    const draft = { id, name: check.name, fields: sanitizeFields(fields), createdAt: now, updatedAt: now };
    return { ok: true, drafts: [draft, ...list], draft };
  }

  function updateDraft(list, id, { name, fields, now = Date.now() }) {
    const index = list.findIndex((d) => d.id === id);
    if (index === -1) return { ok: false, code: 'missing' };
    const check = validateName(name, list, id);
    if (!check.ok) return check;
    const draft = { ...list[index], name: check.name, fields: sanitizeFields(fields), updatedAt: now };
    const drafts = list.slice();
    drafts[index] = draft;
    return { ok: true, drafts, draft };
  }

  /** Deleting something that is already gone still counts as success. */
  function deleteDraft(list, id) {
    const draft = list.find((d) => d.id === id) || null;
    return { ok: true, drafts: list.filter((d) => d.id !== id), draft };
  }

  function sortByRecent(list) {
    return list.slice().sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------- saved data

  /** Turn one stored entry back into a draft, or null if it is damaged. */
  function reviveDraft(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 100) return null;
    const name = normalizeName(entry.name);
    if (typeof entry.name !== 'string' || !name || name.length > NAME_MAX) return null;
    const rawFields = entry.fields;
    if (!rawFields || typeof rawFields !== 'object') return null;
    // A field that exists but is not text means the entry is damaged;
    // refuse it rather than silently blanking what the person wrote.
    for (const key of FIELD_KEYS) {
      if (rawFields[key] !== undefined && typeof rawFields[key] !== 'string') return null;
    }
    const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : 0;
    const updatedAt = Number.isFinite(entry.updatedAt) ? entry.updatedAt : createdAt;
    return { id: entry.id, name, fields: sanitizeFields(rawFields), createdAt, updatedAt };
  }

  /**
   * Read the saved string from localStorage.
   *
   * status:
   *   'empty'   – nothing saved yet
   *   'ok'      – everything read cleanly
   *   'partial' – some entries were damaged and skipped (count in `skipped`)
   *   'corrupt' – the data could not be read at all
   */
  function parseStore(raw) {
    if (raw == null || raw === '') return { status: 'empty', drafts: [], skipped: 0 };
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      return { status: 'corrupt', drafts: [], skipped: 0 };
    }
    if (!data || typeof data !== 'object' || data.version !== STORE_VERSION || !Array.isArray(data.drafts)) {
      return { status: 'corrupt', drafts: [], skipped: 0 };
    }
    const drafts = [];
    const seenIds = new Set();
    let skipped = 0;
    for (const entry of data.drafts) {
      const draft = reviveDraft(entry);
      if (!draft || seenIds.has(draft.id)) {
        skipped += 1;
        continue;
      }
      seenIds.add(draft.id);
      drafts.push(draft);
    }
    return { status: skipped ? 'partial' : 'ok', drafts, skipped };
  }

  function serializeStore(list) {
    return JSON.stringify({ version: STORE_VERSION, drafts: list });
  }

  return {
    NAME_MAX,
    emptyFields,
    sanitizeFields,
    fieldsEqual,
    hasAnyText,
    normalizeName,
    sameName,
    validateName,
    createDraft,
    updateDraft,
    deleteDraft,
    sortByRecent,
    parseStore,
    serializeStore,
  };
});
