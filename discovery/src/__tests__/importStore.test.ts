// @vitest-environment jsdom
// Imports as first-class clips: data layer, paths, filters, learning, deletion, persistence.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore, activeData } from '../state/store';
import { dataSource, mockSource, cachedSummary, loadDetail } from '../data/api';
import { ensureBuffer, judge, save, startPath } from '../state/feed';
import { getModel, lookupVideo } from '../state/selectors';
import { flushStorage } from '../state/storage';
import { useTaxonomy } from '../state/taxonomy';
import { DEFAULT_MOCK_CONFIG } from '../data/mock/mockSource';
import { emptyDrops, finalize } from '../import/extract';
import { itemFromCandidate } from '../import/model';
import { mergeByScore } from '../import/localSource';
import { classifyUrl } from '../import/urls';
import { useImportDraft, computeDraft } from '../import/draft';
import type { ImportBatch, ImportItem } from '../import/types';
import { TAGS } from '../data/mock/taxonomy';

const settle = async (n = 120) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 10));
};

function makeBatch(urls: string[], opts: { tags?: string[]; name?: string } = {}): { batch: ImportBatch; items: ImportItem[] } {
  const batch: ImportBatch = {
    id: `batch-${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name ?? 'Test import',
    createdAt: Date.now(),
    tags: opts.tags ?? [],
    itemIds: [],
    source: 'paste',
    stats: { found: urls.length, imported: urls.length, duplicates: 0, failed: 0, dropped: 0 },
  };
  const f = finalize(urls.map((url) => ({ url, mediaType: classifyUrl(url), origin: 'direct' as const, originalUrl: 'https://gallery.example.com/set/', score: 10 })), emptyDrops());
  const items = f.candidates.map((c, i) => itemFromCandidate(c, batch, { taxonomy: TAGS, now: Date.now() + i }));
  return { batch, items };
}

const URLS = ['https://img.example.com/a/pier-01.jpg', 'https://img.example.com/a/pier-02.jpg', 'https://img.example.com/a/pier-03.jpg', 'https://vid.example.com/a/waves.mp4'];

beforeEach(async () => {
  await useTaxonomy.getState().load();
  mockSource.configure({ latencyMs: 0, jitterMs: 0, errorRate: 0 });
  useStore.getState().wipeEverything();
  useStore.setState({ incognito: false });
  useImportDraft.getState().clear();
});

afterAll(() => mockSource.configure(DEFAULT_MOCK_CONFIG));

describe('committing an import', () => {
  it('stores items, auto-creates the board and the persistent Imported path', () => {
    const { batch, items } = makeBatch(URLS, { tags: ['beach'] });
    const boardId = useStore.getState().commitImport(batch, items, { name: 'Pier', emoji: '⇪' });
    const d = activeData(useStore.getState());
    expect(d.imports.batches[0].itemIds).toHaveLength(4);
    expect(d.boards.find((b) => b.id === boardId)?.videoIds).toEqual(items.map((i) => i.id));
    const p = d.paths.find((x) => x.id === 'imported');
    expect(p?.pinned).toBe(true);
    expect(lookupVideo(items[0].id)).toMatchObject({ source: 'import', tags: ['beach'], title: 'Pier 01' });
  });

  it('never duplicates an item already in the library', () => {
    const a = makeBatch(URLS.slice(0, 2));
    useStore.getState().commitImport(a.batch, a.items);
    const b = makeBatch(URLS.slice(1, 3));
    useStore.getState().commitImport(b.batch, b.items);
    const d = activeData(useStore.getState());
    expect(Object.keys(d.imports.items)).toHaveLength(3);
    expect(d.imports.batches[0].itemIds).toEqual([b.items[1].id]);
  });

  it('the draft flags library items and commits only what is included', async () => {
    const a = makeBatch(URLS.slice(0, 1));
    useStore.getState().commitImport(a.batch, a.items);
    const draft = useImportDraft.getState();
    draft.setText(URLS.join('\n'));
    await settle(30);
    const view = computeDraft(useImportDraft.getState());
    expect(view.rows.find((r) => r.url === URLS[0])?.flags).toContain('in-library');
    draft.setOverride([URLS[3]], { include: false });
    draft.setBoard({ name: 'From the draft' });
    const r = useImportDraft.getState().commit();
    expect(r?.count).toBe(2);
    const d = activeData(useStore.getState());
    expect(d.imports.batches[0].name).toBe('From the draft');
    expect(d.boards.some((b) => b.name === 'From the draft')).toBe(true);
    expect(useImportDraft.getState().doneBatchId).toBe(d.imports.batches[0].id);
  });
});

describe('imports in the data layer', () => {
  it('summaries and details read live from the batch (edits show at once)', async () => {
    const { batch, items } = makeBatch(URLS);
    useStore.getState().commitImport(batch, items);
    const id = items[0].id;
    expect((await loadDetail(id)).playback[0]).toEqual({ kind: 'image', url: URLS[0] });
    expect((await loadDetail(items[3].id)).playback[0]).toEqual({ kind: 'source', url: URLS[3] });
    useStore.getState().updateImports({ [id]: { title: 'Renamed' } });
    expect(cachedSummary(id)?.title).toBe('Renamed');
    expect((await loadDetail(id)).title).toBe('Renamed');
  });

  it('the Imported path fills from imports; a batch path keeps import order', async () => {
    const { batch, items } = makeBatch(URLS);
    useStore.getState().commitImport(batch, items);
    const p = startPath({ kind: 'imported', batchId: batch.id, label: batch.name });
    await ensureBuffer(p.id);
    expect(activeData(useStore.getState()).paths.find((x) => x.id === p.id)?.queue).toEqual(items.map((i) => i.id));
    await ensureBuffer('imported');
    expect(new Set(activeData(useStore.getState()).paths.find((x) => x.id === 'imported')?.queue)).toEqual(new Set(items.map((i) => i.id)));
  });

  it('imports join search and For You, and respect the source filter', async () => {
    const { batch, items } = makeBatch(URLS, { tags: ['beach'] });
    useStore.getState().commitImport(batch, items);
    const ds = dataSource();
    const byWord = await ds.search({ text: 'pier' });
    expect(byWord.items.some((x) => x.video.id === items[0].id)).toBe(true);
    const byTag = await ds.search({ tagIds: ['beach'] });
    expect(byTag.items.some((x) => x.video.source === 'import')).toBe(true);
    const catalogOnly = await ds.search({ tagIds: ['beach'] }, { source: 'catalog' });
    expect(catalogOnly.items.some((x) => x.video.source === 'import')).toBe(false);
    const importsOnly = await ds.search({ tagIds: ['beach'] }, { source: 'imports' });
    expect(importsOnly.items.every((x) => x.video.source === 'import')).toBe(true);
    const explore = await ds.explore({ limit: 24 });
    expect(explore.items.some((x) => x.video.source === 'import')).toBe(true);
    expect(explore.items.length).toBeGreaterThan(24);
  });

  it('related on an import returns its own set first', async () => {
    const { batch, items } = makeBatch(URLS);
    useStore.getState().commitImport(batch, items);
    const r = await dataSource().getSimilar({ kind: 'video', id: items[0].id });
    expect(r.items.slice(0, 3).map((x) => x.video.id).sort()).toEqual(items.slice(1).map((i) => i.id).sort());
  });

  it('merging never reorders the source’s own results', () => {
    const v = (id: string) => ({ id }) as never;
    const base = [0.9, 0.95, 0.5, 0.7].map((score, i) => ({ video: v(`b${i}`), score, reasons: [] }));
    const out = mergeByScore(base, [{ video: v('x'), score: 0.8, reasons: [] }]);
    expect(out.map((o) => (o.video as { id: string }).id)).toEqual(['b0', 'b1', 'x', 'b2', 'b3']);
  });
});

describe('imports and learning', () => {
  it('likes and saves on imports teach the model (tags, site, embedding store)', async () => {
    const { batch, items } = makeBatch(URLS, { tags: ['beach'] });
    useStore.getState().commitImport(batch, items);
    startPath({ kind: 'imported', batchId: batch.id, label: batch.name });
    await settle(10);
    judge(items[0].id, 'like', { advance: false });
    save(items[1].id, { advance: false, quiet: true });
    const m = getModel();
    expect(m.tagW.beach).toBeGreaterThan(0);
    expect(m.studioW['site:gallery.example.com']).toBeGreaterThan(0);
    expect(m.positives.map((p) => p.videoId)).toEqual(expect.arrayContaining([items[0].id, items[1].id]));
  });
});

describe('deleting imports', () => {
  it('removes them from saves, boards, signals, history, and queues — and the empty auto-board', async () => {
    const { batch, items } = makeBatch(URLS);
    const boardId = useStore.getState().commitImport(batch, items, { name: 'Gone soon', emoji: '⇪' });
    const p = startPath({ kind: 'imported', batchId: batch.id, label: batch.name });
    await ensureBuffer(p.id);
    judge(items[0].id, 'like', { advance: false });
    save(items[1].id, { advance: false, quiet: true });
    useStore.getState().deleteImportBatch(batch.id);
    const d = activeData(useStore.getState());
    expect(Object.keys(d.imports.items)).toHaveLength(0);
    expect(d.imports.batches).toHaveLength(0);
    expect(d.saves).toHaveLength(0);
    expect(d.signals.filter((s) => s.videoId.startsWith('imp-'))).toHaveLength(0);
    expect(d.boards.some((b) => b.id === boardId)).toBe(false);
    expect(d.paths.some((x) => x.id === p.id)).toBe(false);
    expect(d.paths.every((x) => x.queue.every((id) => !id.startsWith('imp-')))).toBe(true);
  });
});

describe('persistence and incognito', () => {
  it('imports survive a reload; an incognito import is discarded when incognito ends', async () => {
    const { batch, items } = makeBatch(URLS.slice(0, 2), { name: 'kept' });
    useStore.getState().commitImport(batch, items);
    await flushStorage();
    expect(localStorage.getItem('ph-discovery') ?? '').toContain(items[0].url);
    useStore.getState().setIncognito(true);
    const secret = makeBatch(['https://img.example.com/secret.jpg'], { name: 'secret' });
    useStore.getState().commitImport(secret.batch, secret.items);
    await flushStorage();
    expect(localStorage.getItem('ph-discovery') ?? '').not.toContain('secret.jpg');
    useStore.getState().setIncognito(false);
    await settle(20);
    const names = activeData(useStore.getState()).imports.batches.map((b) => b.name);
    expect(names).toEqual(['kept']);
  });

  it('a full data export/import round-trips imports', () => {
    const { batch, items } = makeBatch(URLS);
    useStore.getState().commitImport(batch, items);
    const json = JSON.stringify({ app: 'ph-discovery', ...useStore.getState(), data: useStore.getState().data });
    useStore.getState().wipeEverything();
    useStore.getState().importData(json);
    expect(Object.keys(activeData(useStore.getState()).imports.items)).toHaveLength(4);
  });
});
