// @vitest-environment jsdom
// Regression tests for the Personal Import code review's findings.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, activeData } from '../state/store';
import { dataSource, mockSource, cachedSummary } from '../data/api';
import { ensureBuffer, startPath } from '../state/feed';
import { useTaxonomy } from '../state/taxonomy';
import { DEFAULT_MOCK_CONFIG } from '../data/mock/mockSource';
import { bestFromSrcset, emptyDrops, extractFromHtml, finalize, parseInput, type RawCandidate } from '../import/extract';
import { itemFromCandidate } from '../import/model';
import { WithImports } from '../import/localSource';
import { classifyUrl, looksLikeJunk } from '../import/urls';
import { useImportDraft } from '../import/draft';
import { exportBatchJSON } from '../import/exportBatch';
import type { ImportBatch, ImportItem } from '../import/types';
import type { DataSource, SearchResults } from '../data/types';
import { TAGS } from '../data/mock/taxonomy';

const settle = async (n = 60) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5));
};

function batchOf(urls: string[], opts: { tags?: string[]; originalUrl?: string; groupId?: string } = {}): { batch: ImportBatch; items: ImportItem[] } {
  const batch: ImportBatch = {
    id: `batch-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Review batch',
    createdAt: Date.now(),
    tags: opts.tags ?? [],
    itemIds: [],
    source: 'paste',
    stats: { found: urls.length, imported: urls.length, duplicates: 0, failed: 0, dropped: 0 },
  };
  const raws: RawCandidate[] = urls.map((url) => ({ url, mediaType: classifyUrl(url), origin: 'direct', originalUrl: opts.originalUrl ?? url, score: 10, groupId: opts.groupId }));
  const items = finalize(raws, emptyDrops()).candidates.map((c, i) => itemFromCandidate(c, batch, { taxonomy: TAGS, now: Date.now() + i }));
  return { batch, items };
}

const many = (n: number, host = 'img.example.com', dir = 'set') => Array.from({ length: n }, (_, i) => `https://${host}/${dir}/photo-${String(i).padStart(3, '0')}.jpg`);

async function drain(fetchPage: (cursor?: string) => Promise<SearchResults>): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 60; i++) {
    const r = await fetchPage(cursor);
    ids.push(...r.items.map((x) => x.video.id));
    cursor = r.nextCursor;
    if (!cursor) break;
  }
  return ids;
}

beforeEach(async () => {
  await useTaxonomy.getState().load();
  mockSource.configure({ latencyMs: 0, jitterMs: 0, errorRate: 0 });
  useStore.getState().wipeEverything();
  useStore.setState({ incognito: false });
  useImportDraft.getState().clear();
});

afterAll(() => mockSource.configure(DEFAULT_MOCK_CONFIG));

describe('#1 imports never answer face/body similarity', () => {
  it('face- or body-only seeds and lookalike masks return no imports; pose/look seeds may', async () => {
    const { batch, items } = batchOf(many(30), { tags: ['beach'] });
    useStore.getState().commitImport(batch, items);
    const ds = dataSource();
    const cat = mockSource.catalog.videos[0];
    const isImp = (r: SearchResults) => r.items.some((x) => x.video.source === 'import');
    expect(isImp(await ds.getSimilar({ kind: 'video', id: cat.id, facets: { face: 1 } }, { limit: 60 }))).toBe(false);
    expect(isImp(await ds.getSimilar({ kind: 'video', id: cat.id, facets: { body: 1 } }, { limit: 60 }))).toBe(false);
    expect(isImp(await ds.getSimilar({ kind: 'embedding', vector: cat.embedding, mask: cat.embedding.map(() => 1) }, { limit: 60 }))).toBe(false);
    const look = await ds.getSimilar({ kind: 'video', id: cat.id, facets: { composition: 1 } }, { limit: 60 });
    expect(look.items.filter((x) => x.video.source === 'import').every((x) => x.reasons[0].label === 'Similar pose or look')).toBe(true);
  });
});

describe('#2 the safety gate has no side doors', () => {
  it('a malformed escape no longer hides a refused term in the URL', () => {
    const f = finalize([{ url: 'https://cdn.x.com/p.jpg?q=little+girl&z=%', mediaType: 'image', origin: 'direct', originalUrl: 'https://cdn.x.com/p.jpg?q=little+girl&z=%', score: 10 }], emptyDrops());
    expect(f.candidates).toHaveLength(0);
    expect(f.summary.dropped.refused).toBe(1);
  });

  it('typed titles, tags, notes, and names are gated too', async () => {
    const { batch, items } = batchOf(many(2));
    useStore.getState().commitImport(batch, items);
    const id = items[0].id;
    expect(useStore.getState().updateImports({ [id]: { title: 'hidden cam' } })).toBe(1);
    expect(activeData(useStore.getState()).imports.items[id].title).toBe(items[0].title);
    expect(useStore.getState().updateImports({ [id]: { notes: 'barely legal' } })).toBe(1);
    expect(useStore.getState().renameImportBatch(batch.id, 'teen set')).toBe(false);
    // Store-level commit drops unsafe items even if a caller skips the draft.
    const bad = batchOf(['https://img.example.com/ok-1.jpg']);
    bad.items[0] = { ...bad.items[0], tags: ['upskirt'] };
    useStore.getState().commitImport(bad.batch, bad.items);
    expect(activeData(useStore.getState()).imports.items[bad.items[0].id]).toBeUndefined();
    // The draft refuses an unsafe import name.
    const d = useImportDraft.getState();
    d.setText('https://img.example.com/fine.jpg');
    await settle(40);
    d.setBoard({ name: 'schoolgirl collection' });
    expect(useImportDraft.getState().commit()).toEqual({ ok: false, reason: 'unsafe-name' });
  });
});

describe('#3/#4 imports page all the way through', () => {
  it('search and "everything from this site" return every matching import', async () => {
    const { batch, items } = batchOf(many(30), { tags: ['beach'] });
    useStore.getState().commitImport(batch, items);
    const ds = dataSource();
    const all = await drain((cursor) => ds.search({ tagIds: ['beach'] }, undefined, { cursor, limit: 20 }));
    expect(new Set(all.filter((id) => id.startsWith('imp-'))).size).toBe(30);
    const site = await drain((cursor) => ds.search({ studioIds: [`site:${items[0].host}`] }, undefined, { cursor, limit: 20 }));
    expect(new Set(site).size).toBe(30);
  });

  it('"more from this set" on a tagged import reaches every sibling', async () => {
    const { batch, items } = batchOf(many(40), { tags: ['beach'], originalUrl: 'https://img.example.com/set/', groupId: 'g1' });
    useStore.getState().commitImport(batch, items);
    const ids = await drain((cursor) => dataSource().getSimilar({ kind: 'video', id: items[0].id }, { cursor, limit: 30 }));
    expect(new Set(ids.filter((id) => id.startsWith('imp-'))).size).toBe(39);
  });
});

describe('#5 a batch opens at the tapped item even past the first page', () => {
  it('starts at item 51 of 60', async () => {
    const { batch, items } = batchOf(many(60));
    useStore.getState().commitImport(batch, items);
    const p = startPath({ kind: 'imported', batchId: batch.id, label: batch.name }, { startWith: [items[50].id] });
    await settle(80);
    const path = activeData(useStore.getState()).paths.find((x) => x.id === p.id)!;
    expect(path.queue[path.index]).toBe(items[50].id);
    expect(path.startAt).toBeUndefined();
  });
});

describe('#6 deleting imports doesn’t make Imported paths skip items', () => {
  it('after deleting 10 of 100 mid-load, all 90 remaining still arrive', async () => {
    const { batch, items } = batchOf(many(100));
    useStore.getState().commitImport(batch, items);
    const p = startPath({ kind: 'imported', batchId: batch.id, label: batch.name });
    await ensureBuffer(p.id);
    useStore.getState().deleteImports(items.slice(0, 10).map((i) => i.id));
    for (let i = 0; i < 10; i++) {
      const cur = activeData(useStore.getState()).paths.find((x) => x.id === p.id)!;
      if (cur.exhausted) break;
      useStore.getState().updatePath(p.id, { index: cur.queue.length });
      await ensureBuffer(p.id);
    }
    const q = activeData(useStore.getState()).paths.find((x) => x.id === p.id)!.queue;
    expect(new Set(q)).toEqual(new Set(items.slice(10).map((i) => i.id)));
  });
});

describe('#7 scans don’t cancel each other or leak into a new draft', () => {
  it('two scans both finish; a scan in flight during clear() writes nothing', async () => {
    const html = '<html><body><main class="gallery"><img src="https://cdn.x.com/a.jpg" width="900" height="900"></main></body></html>';
    const fetchMock = vi.fn((url: string) => new Promise<Response>((res) => setTimeout(() => res(new Response(html, { headers: { 'content-type': 'text/html' } })), url.includes('slow') ? 60 : 5)));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const d = useImportDraft.getState();
      const a = d.scan(['https://slow.example.com/a']);
      const b = useImportDraft.getState().scan(['https://fast.example.com/b']);
      await Promise.all([a, b]);
      const scans = useImportDraft.getState().scans;
      expect(scans['https://slow.example.com/a']?.status).toBe('ok');
      expect(scans['https://fast.example.com/b']?.status).toBe('ok');
      expect(useImportDraft.getState().scanning).toBeNull();
      const late = useImportDraft.getState().scan(['https://slow.example.com/late']);
      useImportDraft.getState().clear();
      await late;
      expect(useImportDraft.getState().scans).toEqual({});
      expect(useImportDraft.getState().scanSources).toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('#8–#10, #18, #19, #21 parser edge cases', () => {
  it('srcset keeps commas inside URLs (Cloudinary/Wix transforms)', () => {
    const b = bestFromSrcset('https://res.example.com/upload/w_400,h_300,c_fill/sample.jpg 400w, https://res.example.com/upload/w_800,h_600,c_fill/sample.jpg 800w', 'https://page.example.com/g/');
    expect(b?.url).toBe('https://res.example.com/upload/w_800,h_600,c_fill/sample.jpg');
    expect(bestFromSrcset('https://x.example.com/a,b.jpg', 'https://page.example.com/')?.url).toBe('https://x.example.com/a,b.jpg');
  });

  it('the unsized original beats a URL-sized copy', () => {
    const ex = extractFromHtml('<html><head><meta property="og:image" content="https://wp.example.com/uploads/beach.jpg"></head><body><main><img src="https://wp.example.com/uploads/beach-300x200.jpg"></main></body></html>', 'https://wp.example.com/post/');
    const f = finalize(ex.candidates, ex.dropped);
    expect(f.candidates.map((c) => c.url)).toEqual(['https://wp.example.com/uploads/beach.jpg']);
    expect(f.candidates[0].thumbnailUrl).toBe('https://wp.example.com/uploads/beach-300x200.jpg');
  });

  it('ordinary words in photo names aren’t junk; UI files are', () => {
    for (const ok of ['crystal-clear-water.jpg', 'share-the-love.jpg', 'blank-canvas-sunset.jpg', 'social-club-night.jpg', 'bg-01.jpg', 'next-to-the-sea.jpg']) expect(looksLikeJunk(`https://x.com/${ok}`)).toBe(false);
    for (const junk of ['icon-32.png', 'share_btn.svg', 'arrow-left-white.png', 'logo.png', 'favicon.ico', 'spinner.gif']) expect(looksLikeJunk(`https://x.com/${junk}`)).toBe(true);
  });

  it('a page with no address keeps no thumbnails pointing nowhere, and counts what it dropped', () => {
    const p = parseInput('<html><body><main><a href="https://cdn.example.com/full.jpg"><img src="thumbs/1.jpg"></a><img src="rel/2.jpg"></main></body></html>');
    expect(p.candidates.map((c) => c.url)).toEqual(['https://cdn.example.com/full.jpg']);
    expect(p.candidates[0].thumbnailUrl).toBeUndefined();
    expect(p.dropped.invalid).toBeGreaterThanOrEqual(1);
  });

  it('huge pastes are capped at 2,000 with the rest counted', () => {
    const p = parseInput(many(2300).join('\n'));
    expect(p.candidates).toHaveLength(2000);
    expect(p.dropped.overflow).toBe(300);
  });

  it('bare URLs on a line with Markdown links still import; notes survive a re-import', () => {
    expect(parseInput('[one](https://x.example.com/1.jpg) and https://x.example.com/2.jpg').candidates.map((c) => c.url)).toEqual(['https://x.example.com/1.jpg', 'https://x.example.com/2.jpg']);
    const { batch, items } = batchOf(['https://x.example.com/n.jpg']);
    const json = exportBatchJSON(batch, [{ ...items[0], notes: 'the good light' }]);
    const back = finalize(parseInput(json).candidates, emptyDrops()).candidates[0];
    expect(itemFromCandidate(back, batch).notes).toBe('the good light');
  });
});

describe('#11 restored data is validated', () => {
  it('drops bad URLs, non-string tags, duplicate and orphan items; fills batch fields', () => {
    const good = 'imp-good1';
    const json = JSON.stringify({
      app: 'ph-discovery',
      profiles: [{ id: 'main', name: 'Main', emoji: '🌙', color: '#a78bfa', createdAt: 1 }],
      activeProfileId: 'main',
      data: {
        main: {
          imports: {
            items: {
              [good]: { url: 'https://img.example.com/a.jpg', title: 'A', tags: ['ok', 7, null], mediaType: 'image', originalUrl: 'javascript:alert(1)' },
              'imp-evil': { url: 'javascript:alert(1)', title: 'x' },
              'imp-orphan': { url: 'https://img.example.com/o.jpg', title: 'O' },
            },
            batches: [
              { id: 'b1', itemIds: [good, good, 'imp-evil'] },
              { id: 'b2', name: 'dupe', itemIds: [good] },
            ],
          },
        },
      },
    });
    useStore.getState().importData(json);
    const im = activeData(useStore.getState()).imports;
    expect(Object.keys(im.items)).toEqual([good]);
    expect(im.items[good]).toMatchObject({ tags: ['ok'], originalUrl: 'https://img.example.com/a.jpg', batchId: 'b1' });
    expect(im.batches).toHaveLength(1);
    expect(im.batches[0]).toMatchObject({ id: 'b1', itemIds: [good], source: 'paste', stats: { failed: 0 } });
    expect(typeof im.batches[0].name).toBe('string');
  });
});

describe('#12, #15–#17 store behaviour', () => {
  it('“Swipe all imports” reopens the pinned Imported path instead of rebuilding it', async () => {
    const { batch, items } = batchOf(many(5));
    useStore.getState().commitImport(batch, items);
    await ensureBuffer('imported');
    const before = activeData(useStore.getState()).paths.find((p) => p.id === 'imported')!;
    const p = startPath({ kind: 'imported', label: 'Imported' });
    expect(p.id).toBe('imported');
    const after = activeData(useStore.getState()).paths.find((x) => x.id === 'imported')!;
    expect(after.pinned).toBe(true);
    expect(after.queue).toEqual(before.queue);
  });

  it('an emptied title keeps the old one', () => {
    const { batch, items } = batchOf(many(1));
    useStore.getState().commitImport(batch, items);
    expect(useStore.getState().updateImports({ [items[0].id]: { title: '   ' } })).toBe(0);
    expect(activeData(useStore.getState()).imports.items[items[0].id].title).toBe(items[0].title);
  });

  it('the draft is dropped on profile switch; lookups never fall back to another profile', async () => {
    useImportDraft.getState().setText('https://img.example.com/draft.jpg');
    await settle(40);
    const { batch, items } = batchOf(many(2));
    useStore.getState().commitImport(batch, items);
    const main = useStore.getState().activeProfileId;
    useStore.getState().createProfile({ name: 'Copy', emoji: '🌊', color: '#38bdf8', copyFrom: main });
    expect(useImportDraft.getState().text).toBe('');
    useStore.getState().deleteImports([items[0].id]);
    expect(cachedSummary(items[0].id)).toBeUndefined(); // the original profile's copy doesn't stand in
    useStore.getState().switchProfile(main);
    expect(cachedSummary(items[0].id)).toBeDefined();
  });

  it('deleting an item drops paths seeded on it, and an emptied auto-board', () => {
    const { batch, items } = batchOf(many(1));
    const boardId = useStore.getState().commitImport(batch, items, { name: 'Auto', emoji: '⇪' });
    const p = startPath({ kind: 'related', videoId: items[0].id }, { startWith: [items[0].id] });
    useStore.getState().deleteImports([items[0].id]);
    const d = activeData(useStore.getState());
    expect(d.paths.some((x) => x.id === p.id)).toBe(false);
    expect(d.boards.some((b) => b.id === boardId)).toBe(false);
  });
});

describe('#22 explore rotation works with opaque cursors', () => {
  it('different live-source cursors bring different imports along', async () => {
    const { batch, items } = batchOf(many(24));
    useStore.getState().commitImport(batch, items);
    const empty = (cursor: string): SearchResults => ({ items: [], total: 0, tookMs: 0, performers: [], studios: [], tags: [], nextCursor: cursor });
    const fake = { ...mockSource, name: 'fake', explore: async () => empty('next') } as unknown as DataSource;
    const ds = new WithImports(fake);
    const a = (await ds.explore({ cursor: 'eyJwYWdlIjoxfQ', limit: 12 })).items.map((x) => x.video.id);
    const b = (await ds.explore({ cursor: 'eyJwYWdlIjoyfQ', limit: 12 })).items.map((x) => x.video.id);
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toEqual(b);
  });
});
