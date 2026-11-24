// Tests for draft rules and safe storage. Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const drafts = require('../js/drafts.js');
const { createDraftStore } = require('../js/storage.js');

const fields = (goal) => ({ goal, audience: '', constraints: '', output: '' });

// ---------------------------------------------------------------- names

test('an empty or blank draft name is rejected', () => {
  assert.equal(drafts.validateName('', []).code, 'empty');
  assert.equal(drafts.validateName('    ', []).code, 'empty');
  assert.equal(drafts.validateName(undefined, []).code, 'empty');
});

test('names are tidied and duplicates are caught regardless of case or spacing', () => {
  const list = [{ id: 'a', name: 'Launch email' }];
  assert.equal(drafts.validateName('  Launch   email ', []).name, 'Launch email');
  const clash = drafts.validateName('launch EMAIL', list, null);
  assert.equal(clash.code, 'duplicate');
  assert.equal(clash.conflict.id, 'a');
  // A draft keeping its own name is not a clash.
  assert.equal(drafts.validateName('Launch email', list, 'a').ok, true);
});

test('over-long names are rejected', () => {
  assert.equal(drafts.validateName('x'.repeat(drafts.NAME_MAX + 1), []).code, 'too_long');
});

// ---------------------------------------------------------------- create / update / delete

test('create never overwrites a draft with the same name', () => {
  const first = drafts.createDraft([], { name: 'Notes', fields: fields('One'), id: '1', now: 1 });
  const second = drafts.createDraft(first.drafts, { name: 'notes', fields: fields('Two'), id: '2', now: 2 });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'duplicate');
  assert.equal(first.drafts.length, 1);
});

test('update changes only the targeted draft and keeps its id and creation time', () => {
  let list = drafts.createDraft([], { name: 'A', fields: fields('one'), id: 'a', now: 1 }).drafts;
  list = drafts.createDraft(list, { name: 'B', fields: fields('two'), id: 'b', now: 2 }).drafts;
  const result = drafts.updateDraft(list, 'a', { name: 'A2', fields: fields('one, edited'), now: 5 });
  assert.equal(result.ok, true);
  const a = result.drafts.find((d) => d.id === 'a');
  const b = result.drafts.find((d) => d.id === 'b');
  assert.deepEqual([a.name, a.fields.goal, a.createdAt, a.updatedAt], ['A2', 'one, edited', 1, 5]);
  assert.deepEqual([b.name, b.fields.goal], ['B', 'two']);
});

test('update cannot rename onto another draft', () => {
  let list = drafts.createDraft([], { name: 'A', fields: fields('x'), id: 'a' }).drafts;
  list = drafts.createDraft(list, { name: 'B', fields: fields('y'), id: 'b' }).drafts;
  assert.equal(drafts.updateDraft(list, 'a', { name: 'b', fields: fields('x') }).code, 'duplicate');
});

test('update of a draft that no longer exists reports it', () => {
  assert.equal(drafts.updateDraft([], 'gone', { name: 'X', fields: fields('x') }).code, 'missing');
});

test('delete removes only that draft', () => {
  let list = drafts.createDraft([], { name: 'A', fields: fields('x'), id: 'a' }).drafts;
  list = drafts.createDraft(list, { name: 'B', fields: fields('y'), id: 'b' }).drafts;
  const result = drafts.deleteDraft(list, 'a');
  assert.deepEqual(result.drafts.map((d) => d.id), ['b']);
});

// ---------------------------------------------------------------- reading saved data

test('malformed saved data is reported, not thrown', () => {
  assert.equal(drafts.parseStore('{not json').status, 'corrupt');
  assert.equal(drafts.parseStore('[]').status, 'corrupt');
  assert.equal(drafts.parseStore('{"version":1,"drafts":"nope"}').status, 'corrupt');
  assert.equal(drafts.parseStore(null).status, 'empty');
});

test('damaged entries are skipped and good ones kept', () => {
  const raw = JSON.stringify({
    version: 1,
    drafts: [
      { id: 'ok', name: 'Fine', fields: fields('hello'), createdAt: 1, updatedAt: 2 },
      { id: 'bad-field', name: 'Broken', fields: { goal: 99 } },
      { name: 'No id', fields: fields('x') },
      null,
      { id: 'ok', name: 'Duplicate id', fields: fields('x') },
    ],
  });
  const result = drafts.parseStore(raw);
  assert.equal(result.status, 'partial');
  assert.equal(result.skipped, 4);
  assert.deepEqual(result.drafts.map((d) => d.id), ['ok']);
});

// ---------------------------------------------------------------- storage adapter

function fakeStorage({ failWrites = false } = {}) {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) {
        const error = new Error('full');
        error.name = 'QuotaExceededError';
        throw error;
      }
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
}

test('storage that cannot be reached is reported as unavailable', () => {
  const store = createDraftStore({
    getStorage: () => {
      throw new Error('SecurityError');
    },
  });
  const loaded = store.load();
  assert.equal(loaded.readable, false);
  assert.equal(store.write([]).ok, false);
});

test('a failed write reports failure and leaves saved data unchanged', () => {
  const storage = fakeStorage();
  const store = createDraftStore({ getStorage: () => storage });
  const first = store.commit((list) => drafts.createDraft(list, { name: 'Kept', fields: fields('x') }), []);
  assert.equal(first.ok, true);
  const before = storage.getItem(store.key);

  const failing = fakeStorage({ failWrites: true });
  failing.data.set(store.key, before);
  const brokenStore = createDraftStore({ getStorage: () => failing });
  const result = brokenStore.commit((list) => drafts.createDraft(list, { name: 'Lost', fields: fields('y') }), []);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'write_failed');
  assert.equal(result.reason, 'quota');
  assert.equal(failing.getItem(store.key), before);
});

test('corrupt saved data is backed up before anything can overwrite it', () => {
  const storage = fakeStorage();
  const store = createDraftStore({ getStorage: () => storage });
  storage.setItem(store.key, '{oops');
  const loaded = store.load();
  assert.equal(loaded.status, 'corrupt');
  assert.equal(loaded.backedUp, true);
  assert.equal(storage.getItem(store.backupKey), '{oops');
});

test('commit re-reads storage, so a second tab cannot wipe the first tab’s draft', () => {
  const storage = fakeStorage();
  const tabA = createDraftStore({ getStorage: () => storage });
  const tabB = createDraftStore({ getStorage: () => storage });
  const staleListInTabB = tabB.load().drafts; // empty
  tabA.commit((list) => drafts.createDraft(list, { name: 'From A', fields: fields('a') }), []);
  tabB.commit((list) => drafts.createDraft(list, { name: 'From B', fields: fields('b') }), staleListInTabB);
  const names = tabA.read().drafts.map((d) => d.name).sort();
  assert.deepEqual(names, ['From A', 'From B']);
});
