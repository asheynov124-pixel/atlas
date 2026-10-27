// @vitest-environment jsdom
// Personal Import: parser, heuristics, titles, undo/redo, export shape.
import { describe, expect, it } from 'vitest';
import { extractFromHtml, finalize, parseInput, emptyDrops, bestFromSrcset, type RawCandidate } from '../import/extract';
import { scanPage } from '../import/scan';
import { applyTitleOp, historyCommit, historyInit, historyRedo, historyUndo, toTitleCase, type TitleSubject } from '../import/titles';
import { exportBatchJSON, exportBatchObject, exportBatchUrls, exportFilename } from '../import/exportBatch';
import { defaultBatchName, importEmbedding, importId, importSummary, itemFromCandidate, matchTagIds, suggestImportTags } from '../import/model';
import { classifyUrl, normalizeUrl, variantKey } from '../import/urls';
import { cosine } from '../lib/vec';
import { TAGS } from '../data/mock/taxonomy';
import type { ImportItem } from '../import/types';

const PAGE = 'https://gallery.example.com/sets/pier-sunset/';

const GALLERY_HTML = `<!doctype html><html><head>
  <title>Pier at sunset — a set</title>
  <meta property="og:title" content="Pier at sunset">
  <meta property="og:image" content="https://cdn.example.com/sets/pier/cover.jpg">
  <meta property="og:image:width" content="1600"><meta property="og:image:height" content="1067">
  <meta property="og:image:secure_url" content="https://cdn.example.com/sets/pier/cover.jpg">
  <meta name="twitter:player:stream" content="https://cdn.example.com/sets/pier/clip.mp4">
  <link rel="next" href="/sets/pier-sunset/page/2/">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"ImageObject","contentUrl":"https://cdn.example.com/sets/pier/ld-01.jpg","name":"Boardwalk lights","width":"2000","height":"1333"},
    {"@type":"VideoObject","contentUrl":"https://cdn.example.com/sets/pier/ld-clip.webm","thumbnailUrl":"https://cdn.example.com/sets/pier/ld-clip.jpg","name":"Waves"}
  ]}</script>
  <script>window.__GALLERY__ = {"photos":[{"src":"https:\\/\\/cdn.example.com\\/sets\\/pier\\/json-01.webp"},{"src":"https:\\u002F\\u002Fcdn.example.com\\u002Fsets\\u002Fpier\\u002Fjson-02.webp"}]};</script>
</head><body>
  <header><img src="/static/logo.png" alt="Gallery logo" width="120" height="40"><img src="/static/hero.jpg" width="1200" height="400"></header>
  <main class="gallery-grid">
    <a href="https://cdn.example.com/sets/pier/full/001.jpg"><img src="https://cdn.example.com/sets/pier/thumbs/001.jpg" alt="Golden hour"></a>
    <a href="https://cdn.example.com/sets/pier/full/002.jpg"><img src="https://cdn.example.com/sets/pier/thumbs/002.jpg" alt="Gulls"></a>
    <a href="https://cdn.example.com/sets/pier/full/003.jpg"><img src="https://cdn.example.com/sets/pier/thumbs/003.jpg"></a>
    <figure><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/sets/pier/lazy-01.jpg" width="900" height="1200"><figcaption>Lamp posts</figcaption></figure>
    <img data-lazy-src="https://cdn.example.com/sets/pier/lazy-02.jpg">
    <img data-original="https://cdn.example.com/sets/pier/lazy-03.jpg">
    <img src="https://cdn.example.com/sets/pier/small.jpg" srcset="https://cdn.example.com/sets/pier/s-480.jpg 480w, https://cdn.example.com/sets/pier/s-1600.jpg 1600w, https://cdn.example.com/sets/pier/s-960.jpg 960w" alt="Railings">
    <img data-srcset="https://cdn.example.com/sets/pier/ds-1x.jpg 1x, https://cdn.example.com/sets/pier/ds-2x.jpg 2x">
    <div class="photo-tile" style="background-image: url('https://cdn.example.com/sets/pier/bg-01.jpg')"></div>
    <div data-gallery='[{"full":"https://cdn.example.com/sets/pier/attr-01.jpg"}]'></div>
    <video poster="https://cdn.example.com/sets/pier/v-poster.jpg"><source src="https://cdn.example.com/sets/pier/v-01.mp4" type="video/mp4"></video>
    <a href="https://cdn.example.com/sets/pier/download.mov">Download the original clip</a>
    <a href="/photo/12345/">Photo detail page</a>
    <a class="pagination-next" href="/sets/pier-sunset/page/2/">Next ›</a>
    <img src="https://cdn.example.com/sets/pier/pixel.gif" width="1" height="1">
    <img src="https://cdn.example.com/sets/pier/icon-share.svg" width="16" height="16">
  </main>
  <aside class="ad-slot"><img src="https://ads.trafficjunky.net/creative/123.jpg" width="300" height="250"></aside>
  <img src="https://stats.g.doubleclick.net/p.gif">
  <footer style="background:url(/static/footer-bg.jpg)"></footer>
</body></html>`;

const urls = (c: { url: string }[]) => c.map((x) => x.url);

describe('extractFromHtml — aggressive gallery patterns', () => {
  const ex = extractFromHtml(GALLERY_HTML, PAGE);
  const found = urls(ex.candidates);
  const get = (u: string) => ex.candidates.find((c) => c.url === u);

  it('reads og/twitter meta, including the video stream', () => {
    expect(found).toContain('https://cdn.example.com/sets/pier/cover.jpg');
    expect(get('https://cdn.example.com/sets/pier/cover.jpg')).toMatchObject({ width: 1600, height: 1067, origin: 'meta' });
    expect(get('https://cdn.example.com/sets/pier/clip.mp4')?.mediaType).toBe('video');
  });

  it('follows thumbnail links to full-size files and records the thumb', () => {
    const full = get('https://cdn.example.com/sets/pier/full/001.jpg');
    expect(full).toMatchObject({ origin: 'link', title: 'Golden hour', thumbnailUrl: 'https://cdn.example.com/sets/pier/thumbs/001.jpg' });
    expect(found).not.toContain('https://cdn.example.com/sets/pier/thumbs/001.jpg');
  });

  it('marks a strip of 3+ sibling tiles as one gallery set', () => {
    const ids = ['001', '002', '003'].map((n) => get(`https://cdn.example.com/sets/pier/full/${n}.jpg`)?.groupId);
    expect(ids[0]).toBeTruthy();
    expect(new Set(ids).size).toBe(1);
  });

  it('prefers lazy attributes over placeholder src, and resolves relative URLs', () => {
    expect(get('https://gallery.example.com/sets/pier/lazy-01.jpg')).toMatchObject({ origin: 'lazy', title: 'Lamp posts' });
    expect(found).toContain('https://cdn.example.com/sets/pier/lazy-02.jpg');
    expect(found).toContain('https://cdn.example.com/sets/pier/lazy-03.jpg');
    expect(found.some((u) => u.startsWith('data:'))).toBe(false);
  });

  it('takes the widest srcset entry (and the densest x descriptor)', () => {
    expect(get('https://cdn.example.com/sets/pier/s-1600.jpg')).toMatchObject({ origin: 'srcset', width: 1600, thumbnailUrl: 'https://cdn.example.com/sets/pier/small.jpg' });
    expect(found).toContain('https://cdn.example.com/sets/pier/ds-2x.jpg');
    expect(bestFromSrcset('a.jpg 1x, b.jpg 3x, c.jpg 2x', PAGE)?.url).toBe('https://gallery.example.com/sets/pier-sunset/b.jpg');
  });

  it('reads JSON-LD ImageObject/VideoObject inside @graph', () => {
    expect(get('https://cdn.example.com/sets/pier/ld-01.jpg')).toMatchObject({ origin: 'jsonld', title: 'Boardwalk lights', width: 2000 });
    expect(get('https://cdn.example.com/sets/pier/ld-clip.webm')).toMatchObject({ mediaType: 'video', thumbnailUrl: 'https://cdn.example.com/sets/pier/ld-clip.jpg' });
  });

  it('unescapes inline JSON gallery data and data-gallery attributes', () => {
    expect(found).toContain('https://cdn.example.com/sets/pier/json-01.webp');
    expect(found).toContain('https://cdn.example.com/sets/pier/json-02.webp');
    expect(found).toContain('https://cdn.example.com/sets/pier/attr-01.jpg');
  });

  it('takes background images from content containers only', () => {
    expect(get('https://cdn.example.com/sets/pier/bg-01.jpg')?.origin).toBe('style');
    expect(found).not.toContain('https://gallery.example.com/static/footer-bg.jpg');
  });

  it('finds <video><source> with its poster and direct links to media files', () => {
    expect(get('https://cdn.example.com/sets/pier/v-01.mp4')).toMatchObject({ mediaType: 'video', thumbnailUrl: 'https://cdn.example.com/sets/pier/v-poster.jpg' });
    expect(get('https://cdn.example.com/sets/pier/download.mov')?.mediaType).toBe('video');
  });

  it('drops logos, tracking pixels, tiny SVGs, and ad networks', () => {
    expect(found).not.toContain('https://gallery.example.com/static/logo.png');
    expect(found).not.toContain('https://cdn.example.com/sets/pier/pixel.gif');
    expect(found).not.toContain('https://cdn.example.com/sets/pier/icon-share.svg');
    expect(found.some((u) => u.includes('trafficjunky') || u.includes('doubleclick'))).toBe(false);
    expect(ex.dropped.junk).toBeGreaterThanOrEqual(3);
    expect(ex.dropped.ads).toBeGreaterThanOrEqual(2);
  });

  it('demotes page chrome below gallery content', () => {
    const hero = get('https://gallery.example.com/static/hero.jpg');
    const tile = get('https://cdn.example.com/sets/pier/full/002.jpg');
    expect(hero && tile && hero.score < tile.score).toBe(true);
  });

  it('finds next-page and gallery sub-page links without treating them as media', () => {
    const next = ex.candidates.filter((c) => c.role === 'next');
    expect(next.map((n) => n.url)).toEqual(['https://gallery.example.com/sets/pier-sunset/page/2/']);
    expect(get('https://gallery.example.com/photo/12345/')?.role).toBe('subpage');
  });

  it('page title feeds fallback titles', () => {
    expect(ex.pageTitle).toBe('Pier at sunset');
  });
});

describe('parseInput — mixed lists and files', () => {
  it('reads URLs out of messy pasted text with titles, Markdown, and trailing punctuation', () => {
    const text = [
      'Sunset over the pier | https://img.example.org/a/pier.jpg',
      'two at once: https://img.example.org/b.png, https://vid.example.org/c.webm.',
      '[Night swim](https://img.example.org/night-swim.webp)',
      '(see https://blog.example.net/post/42)',
      'www.example.org/d.gif',
      'not a url, ftp://nope.example.com/x.jpg',
    ].join('\n');
    const p = parseInput(text);
    expect(p.kind).toBe('text');
    expect(urls(p.candidates)).toEqual([
      'https://img.example.org/a/pier.jpg',
      'https://img.example.org/b.png',
      'https://vid.example.org/c.webm',
      'https://img.example.org/night-swim.webp',
      'https://blog.example.net/post/42',
      'https://www.example.org/d.gif',
    ]);
    expect(p.candidates[0].title).toBe('Sunset over the pier');
    expect(p.candidates[3].title).toBe('Night swim');
    expect(p.candidates.map((c) => c.mediaType)).toEqual(['image', 'image', 'video', 'image', 'page', 'image']);
  });

  it('reads CSV with a header (title, tags, type) and without one', () => {
    const csv = 'Title,URL,Tags,Type\n"Beach, day one",https://img.example.org/beach1.jpg,"beach; summer",photo\nClip,https://cdn.example.org/stream?id=7,,video\n';
    const p = parseInput(csv, { filename: 'list.csv' });
    expect(p.kind).toBe('csv');
    expect(p.candidates).toHaveLength(2);
    expect(p.candidates[0]).toMatchObject({ title: 'Beach, day one', tags: ['beach', 'summer'], mediaType: 'image' });
    expect(p.candidates[1].mediaType).toBe('video');
    const bare = parseInput('pier,https://img.example.org/p.jpg\nhttps://img.example.org/q.jpg', { filename: 'x.csv' });
    expect(bare.candidates.map((c) => c.title)).toEqual(['pier', undefined]);
  });

  it('walks arbitrary JSON for URL-ish fields and titles', () => {
    const json = JSON.stringify({ gallery: { items: [{ src: 'https://img.example.org/1.jpg', caption: 'One', tags: ['dock'] }, { image: 'https://img.example.org/2.jpg' }] }, cover: 'https://img.example.org/cover.jpg' });
    const p = parseInput(json);
    expect(p.kind).toBe('json');
    expect(urls(p.candidates).sort()).toEqual(['https://img.example.org/1.jpg', 'https://img.example.org/2.jpg', 'https://img.example.org/cover.jpg']);
    expect(p.candidates.find((c) => c.url.endsWith('1.jpg'))).toMatchObject({ title: 'One', tags: ['dock'] });
  });

  it('parses a saved .html page against its "saved from" URL', () => {
    const html = `<!-- saved from url=(0036)https://photos.example.com/album/7/ -->\n<html><body><main class="album"><img src="pics/one.jpg" width="1200" height="800" alt="One"></main></body></html>`;
    const p = parseInput(html, { filename: 'album.html' });
    expect(p.kind).toBe('html');
    expect(p.candidates[0]).toMatchObject({ url: 'https://photos.example.com/album/7/pics/one.jpg', originalUrl: 'https://photos.example.com/album/7/' });
  });
});

describe('finalize — dedupe, variants, safety, defaults', () => {
  const raw = (url: string, extra: Partial<RawCandidate> = {}): RawCandidate => ({ url, mediaType: classifyUrl(url), origin: 'direct', originalUrl: url, score: 10, ...extra });

  it('normalises and dedupes (tracking params, fragments, case), collapsing size variants', () => {
    const a = normalizeUrl('HTTPS://IMG.Example.org/wp-content/uploads/2024/05/pier.jpg?utm_source=x#top')!;
    expect(a).toBe('https://img.example.org/wp-content/uploads/2024/05/pier.jpg');
    const list = [
      raw(a),
      raw('https://img.example.org/wp-content/uploads/2024/05/pier.jpg'),
      raw('https://img.example.org/wp-content/uploads/2024/05/pier-150x150.jpg', { origin: 'img', score: 2, width: 150, height: 150 }),
      raw('https://img.example.org/wp-content/uploads/2024/05/pier-1024x683.jpg', { origin: 'img', score: 2, width: 1024, height: 683 }),
    ];
    const f = finalize(list, emptyDrops());
    expect(f.candidates).toHaveLength(1);
    expect(f.candidates[0].url).toBe(a); // the pasted original wins over sized copies
    expect(f.summary.duplicates).toBe(3);
    expect(variantKey('https://x.org/a/thumbs/b-300x200.jpg?w=300')).toBe(variantKey('https://x.org/a/b.jpg'));
  });

  it('flags items already in the library and excludes them', () => {
    const f = finalize([raw('https://img.example.org/a.jpg'), raw('https://img.example.org/b.jpg')], emptyDrops(), { existing: new Set(['https://img.example.org/a.jpg']) });
    expect(f.candidates[0]).toMatchObject({ include: false, flags: ['in-library'] });
    expect(f.candidates[1].include).toBe(true);
    expect(f.summary.inLibrary).toBe(1);
  });

  it('refuses minor-implying and non-consent items through the safety gate', () => {
    const f = finalize([raw('https://img.example.org/teen-set/1.jpg'), raw('https://img.example.org/ok.jpg', { title: 'hidden cam' }), raw('https://img.example.org/fine.jpg')], emptyDrops());
    expect(urls(f.candidates)).toEqual(['https://img.example.org/fine.jpg']);
    expect(f.summary.dropped.refused).toBe(2);
  });

  it('keeps a page as an open-original clip unless its scan produced media', () => {
    const page = 'https://blog.example.net/post/42';
    const unscanned = finalize([raw(page)], emptyDrops()).candidates[0];
    expect(unscanned).toMatchObject({ include: true, flags: ['unscanned'] });
    const failed = finalize([raw(page)], emptyDrops(), { scanned: new Map([[page, { ok: false, found: 0, error: { kind: 'cors', message: 'CORS' } }]]) }).candidates[0];
    expect(failed).toMatchObject({ include: true, flags: ['scan-failed'], error: { kind: 'cors' } });
    const ok = finalize([raw(page)], emptyDrops(), { scanned: new Map([[page, { ok: true, found: 5 }]]) }).candidates[0];
    expect(ok.include).toBe(false);
  });

  it('proposes titles: given > file name > "host – #n"', () => {
    const f = finalize(
      [raw('https://img.example.org/a.jpg', { title: 'Given' }), raw('https://img.example.org/sunset-on-the-pier_02.jpg'), raw('https://img.example.org/8f3a9c0d1e2b4a5f6c7d.jpg'), raw('https://img.example.org/0001.jpg')],
      emptyDrops(),
    );
    expect(f.candidates.map((c) => c.title)).toEqual(['Given', 'Sunset on the pier 02', 'img.example.org – #1', 'img.example.org – #2']);
  });

  it('end to end: the gallery page becomes a reviewable, deduplicated batch', () => {
    const ex = extractFromHtml(GALLERY_HTML, PAGE);
    const f = finalize(ex.candidates, ex.dropped, { pageTitles: new Map([[PAGE, ex.pageTitle!]]) });
    const clips = f.candidates.filter((c) => !c.role);
    expect(new Set(urls(clips)).size).toBe(clips.length);
    expect(f.summary.images).toBeGreaterThanOrEqual(14);
    expect(f.summary.videos).toBeGreaterThanOrEqual(4);
    expect(f.candidates.filter((c) => c.role).every((c) => !c.include)).toBe(true);
    expect(clips.find((c) => c.url.endsWith('full/003.jpg'))?.title).toMatch(/^Pier at sunset – #\d+$/);
  });
});

describe('scanPage — explicit, CORS-respecting fetch', () => {
  const res = (body: string, type: string, status = 200) => new Response(body, { status, headers: { 'content-type': type } });
  it('reports CORS refusals honestly', async () => {
    const r = await scanPage('https://x.example.com/', { fetchImpl: async () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(r).toMatchObject({ ok: false, error: { kind: 'cors' } });
  });
  it('parses HTML, reclassifies direct media, and surfaces HTTP errors', async () => {
    const html = await scanPage(PAGE, { fetchImpl: async () => res(GALLERY_HTML, 'text/html; charset=utf-8') });
    expect(html.ok && 'extraction' in html && html.extraction.candidates.length).toBeGreaterThan(10);
    const img = await scanPage('https://x.example.com/view?id=1', { fetchImpl: async () => res('', 'image/jpeg') });
    expect(img).toMatchObject({ ok: true, media: 'image' });
    const nf = await scanPage('https://x.example.com/', { fetchImpl: async () => res('', 'text/html', 404) });
    expect(nf).toMatchObject({ ok: false, error: { kind: 'http' } });
  });
  it('never sends credentials', async () => {
    let init: RequestInit | undefined;
    await scanPage('https://x.example.com/', { fetchImpl: async (_u, i) => ((init = i), res('<html></html>', 'text/html')) });
    expect(init).toMatchObject({ mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });
});

describe('bulk title patterns', () => {
  const subjects: TitleSubject[] = [
    { id: 'a', title: 'golden hour on the pier', url: 'https://img.example.org/golden-hour_01.jpg' },
    { id: 'b', title: 'gulls', url: 'https://img.example.org/gulls.jpg' },
    { id: 'c', title: 'IMG 2041', url: 'https://cdn.other.net/x/IMG_2041.jpg', originalUrl: 'https://www.other.net/set/1' },
  ];
  const t0 = Object.fromEntries(subjects.map((s) => [s.id, s.title]));

  it('applies prefix/suffix to the selection only', () => {
    const out = applyTitleOp(subjects, t0, { kind: 'prefix', text: 'Pier – ' }, new Set(['a', 'b']));
    expect(out).toEqual({ a: 'Pier – golden hour on the pier', b: 'Pier – gulls', c: 'IMG 2041' });
    expect(applyTitleOp(subjects, t0, { kind: 'suffix', text: ' (2024)' }).c).toBe('IMG 2041 (2024)');
  });

  it('find/replace: literal (special chars and $ are literal), regex with groups, readable errors', () => {
    const t = { ...t0, a: 'a.b $1 a.b' };
    expect(applyTitleOp(subjects, t, { kind: 'replace', find: 'a.b', replace: '$x' }, new Set(['a'])).a).toBe('$x $1 $x');
    expect(applyTitleOp(subjects, t0, { kind: 'replace', find: '^IMG (\\d+)$', replace: 'Photo #$1', regex: true }).c).toBe('Photo #2041');
    expect(applyTitleOp(subjects, t0, { kind: 'replace', find: 'GULLS', replace: 'Terns' }).b).toBe('Terns');
    expect(applyTitleOp(subjects, t0, { kind: 'replace', find: 'GULLS', replace: 'Terns', caseSensitive: true }).b).toBe('gulls');
    expect(() => applyTitleOp(subjects, t0, { kind: 'replace', find: '(', replace: '', regex: true })).toThrow(/isn’t valid/);
  });

  it('capitalize, title-case (small words, acronyms, hyphens), file name, hostname – #', () => {
    expect(applyTitleOp(subjects, t0, { kind: 'capitalize' }).a).toBe('Golden hour on the pier');
    expect(toTitleCase('golden hour on the pier in 4K HD')).toBe('Golden Hour on the Pier in 4K HD');
    expect(toTitleCase('the end-of-summer set of the')).toBe('The End-of-Summer Set of The');
    expect(applyTitleOp(subjects, t0, { kind: 'filename' })).toMatchObject({ a: 'Golden hour 01', b: 'Gulls', c: 'IMG 2041' });
    expect(applyTitleOp(subjects, t0, { kind: 'hostNumber' })).toEqual({ a: 'img.example.org – 1', b: 'img.example.org – 2', c: 'other.net – 1' });
  });
});

describe('title undo/redo history', () => {
  it('undoes and redoes steps; a new edit clears redo', () => {
    let h = historyInit({ a: 'one' });
    h = historyCommit(h, { a: 'two' });
    h = historyCommit(h, { a: 'three' });
    h = historyUndo(h);
    expect(h.present.a).toBe('two');
    h = historyRedo(h);
    expect(h.present.a).toBe('three');
    h = historyUndo(historyUndo(h));
    expect(h.present.a).toBe('one');
    h = historyCommit(h, { a: 'fork' });
    expect(historyRedo(h).present.a).toBe('fork');
  });

  it('coalesces a burst of typing in one field into a single undo step', () => {
    let h = historyInit({ a: '' });
    h = historyCommit(h, { a: 'b' }, { key: 'a', now: 1000 });
    h = historyCommit(h, { a: 'be' }, { key: 'a', now: 1300 });
    h = historyCommit(h, { a: 'bea' }, { key: 'a', now: 1600 });
    h = historyCommit(h, { a: 'beach' }, { key: 'a', now: 4000 }); // pause → new step
    expect(historyUndo(h).present.a).toBe('bea');
    expect(historyUndo(historyUndo(h)).present.a).toBe('');
    expect(historyCommit(h, { a: 'beach' }).past.length).toBe(h.past.length); // no-op edits don't add steps
  });
});

describe('batch export', () => {
  const batch = { id: 'batch-1', name: 'Pier at sunset', createdAt: Date.UTC(2026, 9, 27, 12), tags: ['pier'] };
  const items: ImportItem[] = [
    { id: 'imp-1', batchId: 'batch-1', url: 'https://img.example.org/1.jpg', mediaType: 'image', title: 'One', tags: ['pier', 'gold'], tagIds: [], originalUrl: PAGE, thumbnailUrl: 'https://img.example.org/t1.jpg', host: 'example.org', groupKey: PAGE, notes: 'kept', addedAt: batch.createdAt },
    { id: 'imp-2', batchId: 'batch-1', url: 'https://blog.example.net/post/42', mediaType: 'page', title: 'A post', tags: ['pier'], tagIds: [], originalUrl: 'https://blog.example.net/post/42', host: 'blog.example.net', groupKey: 'batch-1', notes: '', addedAt: batch.createdAt },
  ];

  it('has a stable, documented JSON shape', () => {
    const obj = exportBatchObject(batch, items, Date.UTC(2026, 9, 28));
    expect(Object.keys(obj)).toEqual(['app', 'version', 'exportedAt', 'batch', 'items']);
    expect(obj).toMatchObject({ app: 'ph-discovery-import', version: 1, batch: { id: 'batch-1', name: 'Pier at sunset', tags: ['pier'], count: 2, created: '2026-10-27T12:00:00.000Z' } });
    expect(obj.items[0]).toEqual({ url: 'https://img.example.org/1.jpg', title: 'One', tags: ['pier', 'gold'], mediaType: 'image', originalUrl: PAGE, thumbnailUrl: 'https://img.example.org/t1.jpg', notes: 'kept', added: '2026-10-27T12:00:00.000Z' });
    expect(Object.keys(obj.items[1])).toEqual(['url', 'title', 'tags', 'mediaType', 'originalUrl', 'added']);
  });

  it('URL list is one per line; filenames are safe', () => {
    expect(exportBatchUrls(items)).toBe('https://img.example.org/1.jpg\nhttps://blog.example.net/post/42\n');
    expect(exportFilename(batch, 'json')).toBe('import-pier-at-sunset-2026-10-27.json');
    expect(exportFilename({ name: 'Import 2026-10-27', createdAt: batch.createdAt }, 'txt')).toBe('import-import-2026-10-27.txt');
  });

  it('re-imports losslessly through the normal paste/upload path', () => {
    const p = parseInput(exportBatchJSON(batch, items), { filename: 'import.json' });
    expect(p.kind).toBe('export');
    expect(p.candidates.map((c) => [c.url, c.title, c.tags, c.mediaType, c.originalUrl])).toEqual(items.map((i) => [i.url, i.title, i.tags, i.mediaType, i.originalUrl]));
    expect(parseInput(exportBatchUrls(items)).candidates.map((c) => c.url)).toEqual(items.map((i) => i.url));
  });
});

describe('imported items as native clips', () => {
  const cand = (url: string, originalUrl = url, groupId?: string) => finalize([{ url, mediaType: classifyUrl(url), origin: 'direct', originalUrl, score: 10, groupId }], emptyDrops()).candidates[0];
  const batch = { id: 'batch-x', tags: ['Beaches', 'golden hour'] };

  it('ids are stable per URL; summaries carry source, media type, batch, and matched tags', () => {
    expect(importId('https://img.example.org/a.jpg')).toBe(importId('https://img.example.org/a.jpg'));
    expect(importId('https://img.example.org/a.jpg')).not.toBe(importId('https://img.example.org/b.jpg'));
    const item = itemFromCandidate(cand('https://img.example.org/a.jpg'), batch, { taxonomy: TAGS, now: Date.UTC(2026, 0, 2) });
    expect(item.tagIds).toContain('beach');
    const s = importSummary(item);
    expect(s).toMatchObject({ source: 'import', mediaType: 'image', batchId: 'batch-x', studioId: 'site:img.example.org', releaseDate: '2026-01-02', thumbnail: { kind: 'url', url: 'https://img.example.org/a.jpg' } });
    expect(s.embedding).toHaveLength(32);
    expect(importSummary(item)).toBe(s); // memoised per record
  });

  it('items from one gallery sit closer together than items from another', () => {
    const g1 = ['1', '2', '3'].map((n) => itemFromCandidate(cand(`https://a.example.org/set/${n}.jpg`, 'https://a.example.org/set/', 'g1'), batch));
    const g2 = itemFromCandidate(cand('https://b.example.net/other/9.jpg', 'https://b.example.net/other/', 'g9'), batch);
    const e = (i: ImportItem) => importEmbedding(i);
    expect(cosine(e(g1[0]), e(g1[1]))).toBeGreaterThan(cosine(e(g1[0]), e(g2)) + 0.2);
  });

  it('matches tags by label, synonym, and plural; suggests tags and a board name from the sources', () => {
    expect(matchTagIds(['Pools', 'kiss', '#outdoors', 'nonsense'], TAGS).sort()).toEqual(['kissing', 'outdoor', 'pool'].sort());
    const cs = ['1', '2', '3', '4'].map((n) => ({ url: `https://cdn.sunsetpix.com/galleries/pier-sunset/pier-${n}.jpg`, originalUrl: 'https://www.sunsetpix.com/galleries/pier-sunset/' }));
    const tags = suggestImportTags(cs);
    expect(tags).toEqual(expect.arrayContaining(['sunsetpix', 'pier', 'sunset']));
    expect(tags).not.toContain('galleries');
    expect(defaultBatchName(cs)).toBe('sunsetpix.com');
    expect(defaultBatchName([{ url: 'https://a.org/1.jpg', originalUrl: 'https://a.org/1.jpg' }, { url: 'https://b.org/2.jpg', originalUrl: 'https://b.org/2.jpg' }], Date.UTC(2026, 9, 27))).toBe('Import 2026-10-27');
  });
});
