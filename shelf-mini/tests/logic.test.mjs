// Unit tests for the parts with no DOM: filtering, URL state and storage.
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, ITEM_IDS } from '../js/data.js';
import { normalize, filterItems, isFiltered, suggestWiderSearch, NO_FILTERS } from '../js/filter.js';
import { viewFromSearch, urlForView, createStore } from '../js/state.js';
import { createFavoriteStorage } from '../js/storage.js';

const ids = (items) => items.map((item) => item.id);
const none = new Set();
const filters = (patch) => ({ ...NO_FILTERS, ...patch });

// ---- Data -------------------------------------------------------------------

test('there are 12 items with unique ids, a known category and a description', () => {
  assert.equal(ITEMS.length, 12);
  assert.equal(ITEM_IDS.size, 12);
  for (const item of ITEMS) {
    assert.ok(['film', 'book', 'music', 'game'].includes(item.category), item.id);
    assert.ok(item.title && item.description, item.id);
  }
});

// ---- Filtering ----------------------------------------------------------------

test('normalize folds case, accents, ampersands and punctuation', () => {
  assert.equal(normalize('  Salt & Iron '), 'salt and iron');
  assert.equal(normalize('TOMÁS—Reyes'), 'tomas reyes');
  assert.equal(normalize('...'), '');
});

test('search matches titles, ignoring case and word order', () => {
  assert.deepEqual(ids(filterItems(ITEMS, filters({ query: 'night' }), none)), ['night-ferry', 'nightjar', 'night-swim']);
  assert.deepEqual(ids(filterItems(ITEMS, filters({ query: 'SWIM night' }), none)), ['night-swim']);
  assert.deepEqual(ids(filterItems(ITEMS, filters({ query: 'salt and iron' }), none)), ['salt-and-iron']);
  assert.deepEqual(ids(filterItems(ITEMS, filters({ query: 'salt & iron' }), none)), ['salt-and-iron']);
});

test('search looks at titles only, not credits or descriptions', () => {
  assert.deepEqual(filterItems(ITEMS, filters({ query: 'Morrow' }), none), []);
});

test('a blank query does not filter', () => {
  assert.equal(filterItems(ITEMS, filters({ query: '   ' }), none).length, 12);
  assert.equal(isFiltered(filters({ query: '   ' })), false);
});

test('search, category and favorites combine', () => {
  assert.deepEqual(ids(filterItems(ITEMS, filters({ query: 'night', category: 'music' }), none)), ['night-swim']);
  assert.equal(filterItems(ITEMS, filters({ category: 'game' }), none).length, 3);
  const favorites = new Set(['nightjar', 'tilewright']);
  assert.deepEqual(ids(filterItems(ITEMS, filters({ favoritesOnly: true }), favorites)), ['nightjar', 'tilewright']);
  assert.deepEqual(ids(filterItems(ITEMS, filters({ favoritesOnly: true, query: 'night' }), favorites)), ['nightjar']);
  assert.deepEqual(filterItems(ITEMS, filters({ favoritesOnly: true, category: 'film' }), favorites), []);
});

test('a dead end suggests the widest search that still keeps the query', () => {
  assert.deepEqual(suggestWiderSearch(ITEMS, filters({ query: 'night', category: 'game' }), none), {
    patch: { category: 'all', favoritesOnly: false },
    count: 3,
    kind: 'all-titles',
  });
  assert.equal(suggestWiderSearch(ITEMS, filters({ query: 'zzz', category: 'game' }), none), null);
  assert.equal(suggestWiderSearch(ITEMS, filters({ query: 'zzz' }), none), null);
  const favorites = new Set(['nightjar']);
  assert.deepEqual(suggestWiderSearch(ITEMS, filters({ favoritesOnly: true, category: 'game' }), favorites), {
    patch: { category: 'all' },
    count: 1,
    kind: 'all-favorites',
  });
});

// ---- URL state ------------------------------------------------------------------

test('the URL round-trips the view and leaves out defaults', () => {
  const view = { query: 'night', category: 'music', favoritesOnly: true, itemId: 'night-swim' };
  const url = urlForView(view, '/shelf/');
  assert.equal(url, '/shelf/?q=night&category=music&favorites=1&item=night-swim');
  assert.deepEqual(viewFromSearch(url.slice(url.indexOf('?'))), view);
  assert.equal(urlForView({ ...NO_FILTERS, itemId: null }, '/shelf/'), '/shelf/');
});

test('unknown or hostile URL values fall back to safe defaults', () => {
  const view = viewFromSearch(`?category=poetry&item=<script>&favorites=yes&q=${'x'.repeat(500)}`);
  assert.equal(view.category, 'all');
  assert.equal(view.itemId, null);
  assert.equal(view.favoritesOnly, false);
  assert.equal(view.query.length, 80);
});

test('the store notifies listeners with the new and previous state', () => {
  const store = createStore({ a: 1, b: 1 });
  const calls = [];
  store.subscribe((state, previous) => calls.push([state.a, previous.a, state.b]));
  store.set({ a: 2 });
  assert.deepEqual(calls, [[2, 1, 1]]);
});

// ---- Storage ----------------------------------------------------------------------

class MemoryStorage {
  map = new Map();
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

class FullStorage extends MemoryStorage {
  setItem() {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  }
}

class ForgetfulStorage extends MemoryStorage {
  setItem() {} // accepts writes but keeps nothing
}

const make = (storage) => createFavoriteStorage({ validIds: ITEM_IDS, getStorage: () => storage });

test('favorites save and load back', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(make(storage).load(), { ids: [], canSave: true, lostSaved: false });
  assert.equal(make(storage).save(['night-swim', 'nightjar']), true);
  assert.deepEqual(make(storage).load(), { ids: ['night-swim', 'nightjar'], canSave: true, lostSaved: false });
});

test('a damaged saved value is reported, not thrown', () => {
  const storage = new MemoryStorage();
  storage.setItem('shelf-mini:favorites', '{not json');
  assert.deepEqual(make(storage).load(), { ids: [], canSave: true, lostSaved: true });
  storage.setItem('shelf-mini:favorites', JSON.stringify(['night-swim'])); // wrong shape
  assert.equal(make(storage).load().lostSaved, true);
});

test('unknown and duplicate ids are dropped on load', () => {
  const storage = new MemoryStorage();
  storage.setItem('shelf-mini:favorites', JSON.stringify({ format: 1, ids: ['night-swim', 'gone', 'night-swim', 7] }));
  assert.deepEqual(make(storage).load().ids, ['night-swim']);
});

test('no access to storage at all: nothing throws, nothing claims to save', () => {
  const blocked = createFavoriteStorage({
    validIds: ITEM_IDS,
    getStorage: () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
  assert.deepEqual(blocked.load(), { ids: [], canSave: false, lostSaved: false });
  assert.equal(blocked.save(['night-swim']), false);
  assert.equal(blocked.read().status, 'unavailable');
});

test('a full storage keeps what it had and reports failed saves', () => {
  const storage = new FullStorage();
  storage.map.set('shelf-mini:favorites', JSON.stringify({ format: 1, ids: ['nightjar'] }));
  assert.deepEqual(make(storage).load(), { ids: ['nightjar'], canSave: false, lostSaved: false });
  assert.equal(make(storage).save(['nightjar', 'night-swim']), false);
});

test('a save only counts if it reads back', () => {
  assert.equal(make(new ForgetfulStorage()).save(['night-swim']), false);
  assert.equal(make(new ForgetfulStorage()).load().canSave, false);
});
