/*
 * state.js — APP STATE
 *
 * One plain object holds everything the screen shows:
 *
 *   fields     – what is typed in the four boxes right now
 *   name       – what is typed in the "Draft name" box
 *   currentId  – id of the saved draft being edited, or null for a new one
 *   baseline   – { fields, name } as they were when last opened or saved;
 *                comparing against it tells us about unsaved changes
 *   drafts     – the saved drafts
 *   canSave    – false when the browser blocks storage entirely
 *
 * `update` merges a change in and tells every subscriber, which is how
 * the screen re-draws. Nothing else changes the state.
 */
(function (factory) {
  const isNode = typeof module === 'object' && module.exports;
  const draftLib = isNode ? require('./drafts.js') : globalThis.PromptStudio.drafts;
  const api = factory(draftLib);
  if (isNode) module.exports = api;
  else globalThis.PromptStudio.state = api;
})(function (draftLib) {
  'use strict';

  function createStore(initial) {
    let state = { ...initial };
    const listeners = [];
    return {
      get: () => state,
      update(patch) {
        const previous = state;
        state = { ...state, ...patch };
        for (const listener of listeners) listener(state, previous);
      },
      subscribe(listener) {
        listeners.push(listener);
      },
    };
  }

  function currentDraft(state) {
    return state.drafts.find((d) => d.id === state.currentId) || null;
  }

  /** True when the editor holds anything not yet saved. */
  function isDirty(state) {
    return (
      !draftLib.fieldsEqual(state.fields, state.baseline.fields) ||
      draftLib.normalizeName(state.name) !== draftLib.normalizeName(state.baseline.name)
    );
  }

  /** 'blank' | 'unsaved-new' | 'unsaved-changes' | 'saved' */
  function saveStatus(state) {
    const dirty = isDirty(state);
    if (!state.currentId) return dirty ? 'unsaved-new' : 'blank';
    return dirty ? 'unsaved-changes' : 'saved';
  }

  return { createStore, currentDraft, isDirty, saveStatus };
});
