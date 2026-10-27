import { describe, expect, it } from 'vitest';
import { generateCatalog } from '../data/mock/catalog';
import { MockDataSource } from '../data/mock/mockSource';
import { checkQuery, PROHIBITED_TERMS } from '../data/safety';
import { parseLink, looksLikeUrl } from '../data/links';
import { EMBEDDING_DIM } from '../data/types';
import { normalizeText } from '../lib/text';

const ds = new MockDataSource(undefined, { latencyMs: 0, jitterMs: 0 });
const cat = ds.catalog;

describe('mock catalog', () => {
  it('is deterministic for a seed', () => {
    const a = generateCatalog(42, 200);
    const b = generateCatalog(42, 200);
    expect(a.videos.map((v) => v.id)).toEqual(b.videos.map((v) => v.id));
    expect(a.videos[17].embedding).toEqual(b.videos[17].embedding);
  });

  it('has referential integrity', () => {
    expect(cat.videos.length).toBeGreaterThanOrEqual(900);
    for (const v of cat.videos) {
      expect(v.embedding).toHaveLength(EMBEDDING_DIM);
      for (const p of v.performerIds) expect(cat.performerById.has(p)).toBe(true);
      expect(cat.studioById.has(v.studioId)).toBe(true);
      for (const t of v.tags) expect(cat.tagById.has(t)).toBe(true);
      if (v.seriesId) expect(cat.seriesById.get(v.seriesId)!.episodes).toContain(v.id);
    }
  });

  it('never uses prohibited terms in any catalog text', () => {
    const texts = [
      ...cat.videos.map((v) => v.title),
      ...cat.performers.map((p) => p.name),
      ...cat.studios.map((s) => s.name),
      ...cat.series.map((s) => s.title),
      ...cat.tags.flatMap((t) => [t.label, ...t.synonyms]),
    ].map((t) => ` ${normalizeText(t).replace(/-/g, ' ')} `);
    for (const term of PROHIBITED_TERMS) {
      const re = new RegExp(`\\s${term.replace(/\s+/g, '\\s+')}\\s`);
      const hit = texts.find((t) => re.test(t));
      expect(hit, `catalog contains "${term}"`).toBeUndefined();
    }
  });
});

describe('safety gate', () => {
  it('refuses minor-implying and non-consent queries', () => {
    expect(checkQuery('teen massage').ok).toBe(false);
    expect(checkQuery('17 year old').ok).toBe(false);
    expect(checkQuery('Hidden-Cam hotel').ok).toBe(false);
    expect(checkQuery('school girl cosplay').ok).toBe(false);
  });
  it('allows ordinary adult queries', () => {
    expect(checkQuery('romantic massage in their 30s').ok).toBe(true);
    expect(checkQuery('neon dance 4k').ok).toBe(true);
    expect(checkQuery('over 20 min').ok).toBe(true);
  });
  it('returns an empty, noticed result from search', async () => {
    const r = await ds.search({ text: 'teen' });
    expect(r.items).toHaveLength(0);
    expect(r.notice?.kind).toBe('safety');
  });
});

describe('links', () => {
  it('extracts viewkeys and path ids', () => {
    expect(parseLink('https://www.example.com/view_video.php?viewkey=ph5f3a2b1c')?.id).toBe('ph5f3a2b1c');
    expect(parseLink('example.com/video/abc123')?.matchedBy).toBe('path-id');
    expect(parseLink('https://example.com/some/page')?.matchedBy).toBe('hash');
    expect(looksLikeUrl('just words here')).toBe(false);
  });
  it('resolves catalog links exactly and others deterministically', async () => {
    const v = cat.videos[3];
    expect((await ds.resolveUrl(v.originalUrl))!.video.id).toBe(v.id);
    const a = await ds.resolveUrl('https://somewhere.example/view?viewkey=zzzz9999');
    const b = await ds.resolveUrl('https://somewhere.example/view?viewkey=zzzz9999');
    expect(a!.video.id).toBe(b!.video.id);
    const detail = await ds.getVideo(a!.video.id);
    expect(detail.originalUrl).toContain('somewhere.example');
  });
});

describe('MockDataSource', () => {
  it('keyword search requires every token', async () => {
    const p = cat.performers[0];
    const r = await ds.search({ text: p.name, mode: 'keyword' }, undefined, { limit: 100 });
    expect(r.items.length).toBeGreaterThan(0);
    for (const it of r.items) expect(it.video.performerIds).toContain(p.id);
    expect(r.performers.map((x) => x.id)).toContain(p.id);
  });

  it('paginates without overlap', async () => {
    const a = await ds.explore({ limit: 25 });
    const b = await ds.explore({ limit: 25, cursor: a.nextCursor });
    const ids = new Set(a.items.map((i) => i.video.id));
    for (const i of b.items) expect(ids.has(i.video.id)).toBe(false);
  });

  it('visual similarity by face favours the same performer', async () => {
    const seed = cat.videos.find((v) => v.performerIds.length === 1)!;
    const r = await ds.getSimilar({ kind: 'video', id: seed.id, facets: { face: 1 } }, { limit: 10 });
    const same = r.items.filter((i) => i.video.performerIds.includes(seed.performerIds[0])).length;
    expect(same).toBeGreaterThanOrEqual(6);
  });

  it('builds a playback fallback chain ending in the original', async () => {
    const d = await ds.getVideo(cat.videos[0].id);
    expect(d.playback.map((p) => p.kind)).toEqual(['embed', 'source', 'original']);
    expect(d.playback[2].url).toBe(d.originalUrl);
  });

  it('simulates errors when configured', async () => {
    const flaky = new MockDataSource(undefined, { latencyMs: 0, jitterMs: 0, errorRate: 1 });
    await expect(flaky.getVideo(flaky.catalog.videos[0].id)).rejects.toThrow(/Simulated/);
  });
});
