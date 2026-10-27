// @vitest-environment jsdom
// Gallery pages: stronger extraction, clear failure messages, image-first playback, session cache.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFromHtml, finalize, emptyDrops } from '../import/extract';
import { importPlayback, itemFromCandidate } from '../import/model';
import { looksLikePageUrl, mightBeImage, sizeDirOf, variantKey } from '../import/urls';
import { zeroMediaMessage } from '../import/scan';
import { useImportDraft, computeDraft } from '../import/draft';
import { useStore } from '../state/store';

const PAGE = 'https://www.gallerysite.test/galleries/summer-set-12345/';

/** A fictional gallery page built from patterns real gallery sites use. */
const GALLERY = `<!doctype html><html><head><title>Summer set</title></head><body>
<main class="gallery-grid">
  <!-- Fancybox tiles: 460px thumbnails linking to 1280px files in a sibling size folder -->
  ${[1, 2, 3, 4]
    .map(
      (n) => `<a class="rel-link" data-fancybox="gallery" href="https://cdn.gallerysite.test/1280/7/abc/0${n}.jpg"><img data-src="https://cdn.gallerysite.test/460/7/abc/0${n}.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Summer ${n}"></a>`,
    )
    .join('\n  ')}
  <!-- PhotoSwipe: the full-size file has no extension; the link publishes its size -->
  <a href="https://cdn.gallerysite.test/full/p5" data-pswp-width="2000" data-pswp-height="3000"><img src="https://cdn.gallerysite.test/thumb/p5_s.jpg" alt="Five"></a>
  <!-- lightGallery: full size on a wrapper, not on a link -->
  <div class="lg-item" data-src="https://cdn.gallerysite.test/big/p6.jpg"><img src="https://cdn.gallerysite.test/small/p6.jpg" alt="Six"></div>
  <!-- Microdata -->
  <figure itemscope itemtype="https://schema.org/ImageObject"><a itemprop="contentUrl" href="https://cdn.gallerysite.test/1280/7/abc/10.jpg"><img src="https://cdn.gallerysite.test/460/7/abc/10.jpg"></a><figcaption itemprop="caption">Ten</figcaption></figure>
</main>
<script>window.__GALLERY__ = {"photos":[
  {"title":"Seven","thumb":"https://cdn.gallerysite.test/t/p7","large":{"src":"https://cdn.gallerysite.test/l/p7","width":1600,"height":2400}},
  {"title":"Eight","thumb":"https://cdn.gallerysite.test/t/p8","large":{"src":"https://cdn.gallerysite.test/l/p8","width":1600,"height":2400}},
  {"title":"Nine","sizes":{"small":{"url":"https://cdn.gallerysite.test/s/p9.webp","width":300},"original":{"url":"https://cdn.gallerysite.test/o/p9.webp","width":3000}}}
]};</script>
</body></html>`;

describe('gallery-style pages yield every picture, at its largest', () => {
  const ex = extractFromHtml(GALLERY, PAGE);
  const f = finalize(ex.candidates, ex.dropped);
  const urls = f.candidates.map((c) => c.url);

  it('lists each image individually as a direct image candidate', () => {
    expect(f.candidates.every((c) => c.mediaType === 'image')).toBe(true);
    expect(urls).toEqual(
      expect.arrayContaining([
        ...[1, 2, 3, 4].map((n) => `https://cdn.gallerysite.test/1280/7/abc/0${n}.jpg`),
        'https://cdn.gallerysite.test/full/p5',
        'https://cdn.gallerysite.test/big/p6.jpg',
        'https://cdn.gallerysite.test/1280/7/abc/10.jpg',
        'https://cdn.gallerysite.test/l/p7',
        'https://cdn.gallerysite.test/l/p8',
        'https://cdn.gallerysite.test/o/p9.webp',
      ]),
    );
    expect(f.candidates).toHaveLength(10);
  });

  it('never imports the thumbnail as its own item, and keeps it as the preview', () => {
    expect(urls.some((u) => /\/(460|thumb|small|t|s)\//.test(u))).toBe(false);
    const tile = f.candidates.find((c) => c.url.endsWith('/1280/7/abc/01.jpg'))!;
    expect(tile.thumbnailUrl).toBe('https://cdn.gallerysite.test/460/7/abc/01.jpg');
    expect(tile.title).toBe('Summer 1');
  });

  it('uses the sizes lightboxes and gallery data publish', () => {
    expect(f.candidates.find((c) => c.url.endsWith('/full/p5'))).toMatchObject({ width: 2000, height: 3000, title: 'Five' });
    expect(f.candidates.find((c) => c.url.endsWith('/l/p7'))).toMatchObject({ width: 1600, title: 'Seven', thumbnailUrl: 'https://cdn.gallerysite.test/t/p7' });
    expect(f.candidates.find((c) => c.url.endsWith('/o/p9.webp'))?.width).toBe(3000);
  });

  it('treats pixel-size folders as one picture at several sizes and keeps the biggest', () => {
    expect(sizeDirOf('https://cdn.x.test/1280/7/abc/01.jpg')).toBe(1280);
    expect(sizeDirOf('https://cdn.x.test/2024/05/01.jpg')).toBeUndefined();
    expect(variantKey('https://cdn.x.test/460/7/abc/01.jpg')).toBe(variantKey('https://cdn.x.test/1280/7/abc/01.jpg'));
    const r = finalize(
      ['https://cdn.x.test/460/7/abc/01.jpg', 'https://cdn.x.test/1280/7/abc/01.jpg', 'https://cdn.x.test/800/7/abc/01.jpg'].map((url) => ({ url, mediaType: 'image' as const, origin: 'img' as const, originalUrl: PAGE, score: 2 })),
      emptyDrops(),
    );
    expect(r.candidates.map((c) => c.url)).toEqual(['https://cdn.x.test/1280/7/abc/01.jpg']);
  });
});

describe('gallery pages are recognised; anything else gets tried as a picture', () => {
  it('tells pages from extension-less files', () => {
    expect(looksLikePageUrl(PAGE)).toBe(true);
    expect(looksLikePageUrl('https://site.test/album/42')).toBe(true);
    expect(looksLikePageUrl('https://site.test/photoset/9')).toBe(true);
    expect(looksLikePageUrl('https://site.test/post.php?id=3')).toBe(true);
    expect(mightBeImage('https://img.site.test/i/beach-03')).toBe(true);
    expect(mightBeImage('https://img.site.test/i/beach-03.jpg')).toBe(false); // it's plainly an image already
    expect(mightBeImage(PAGE)).toBe(false);
  });

  it('plays an extension-less link as a picture first; a gallery page goes straight to its card', () => {
    const c = (url: string) => finalize([{ url, mediaType: 'page', origin: 'direct', originalUrl: url, score: 10 }], emptyDrops()).candidates[0];
    const batch = { id: 'b', tags: [] };
    expect(importPlayback(itemFromCandidate(c('https://img.site.test/i/beach-03'), batch)).map((p) => p.kind)).toEqual(['image', 'original']);
    expect(importPlayback(itemFromCandidate(c(PAGE), batch)).map((p) => p.kind)).toEqual(['original']);
  });
});

describe('a gallery that gives nothing says so, plainly', () => {
  it('explains the block and what to do instead', () => {
    expect(zeroMediaMessage({ kind: 'cors', message: 'x' })).toBe(
      'Could not read images from this page (site blocked access). Open the page, copy direct image links, and paste those instead.',
    );
    expect(zeroMediaMessage({ kind: 'empty', message: 'x' })).toMatch(/^Could not read images from this page \(its pictures are added by scripts/);
    expect(zeroMediaMessage({ kind: 'http', message: 'The site answered 403 Forbidden.' })).toMatch(/\(the site answered 403\)/);
  });
});

describe('the draft: mixed pastes, failed pages, and the session cache', () => {
  const settle = async (n = 40) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5));
  };
  beforeEach(() => {
    useStore.getState().wipeEverything();
    useImportDraft.getState().clear();
  });

  it('a failed gallery page is unticked; direct images stay ticked; skipping pages unticks unread ones', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    try {
      const d = useImportDraft.getState();
      d.setText(['https://site.test/album/42', 'https://site.test/galleries/two/', 'https://img.site.test/a.jpg'].join('\n'));
      await settle();
      useImportDraft.getState().skipUnscannedPages();
      let v = computeDraft(useImportDraft.getState());
      expect(v.rows.filter((r) => r.include).map((r) => r.url)).toEqual(['https://img.site.test/a.jpg']);
      await useImportDraft.getState().scan(['https://site.test/album/42']);
      v = computeDraft(useImportDraft.getState());
      const failed = v.rows.find((r) => r.url === 'https://site.test/album/42')!;
      expect(failed).toMatchObject({ include: false, flags: ['scan-failed'], error: { kind: 'cors' } });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a page read once this session comes back instantly, with no new request', async () => {
    const html = `<html><body><main class="gallery"><a href="https://cdn.site.test/full/1.jpg"><img src="https://cdn.site.test/t/1.jpg"></a><a href="https://cdn.site.test/full/2.jpg"><img src="https://cdn.site.test/t/2.jpg"></a></main></body></html>`;
    const fetchMock = vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const url = 'https://site.test/galleries/cached/';
      useImportDraft.getState().setText(url);
      await settle();
      await useImportDraft.getState().scan([url]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      useImportDraft.getState().clear();
      useImportDraft.getState().setText(url); // re-paste later in the session
      await settle();
      const st = useImportDraft.getState();
      expect(st.scans[url]).toMatchObject({ status: 'ok', found: 2, cached: true });
      expect(computeDraft(st).rows.filter((r) => r.mediaType === 'image')).toHaveLength(2);
      await st.scan([url]); // pressing "Find media" again is also a cache hit
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await useImportDraft.getState().scan([url], { fresh: true }); // "Read again" really reads again
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('marking a probed link as an image takes it out of the page queue', async () => {
    useImportDraft.getState().setText('https://img.site.test/i/beach-03');
    await settle();
    expect(computeDraft(useImportDraft.getState()).unscannedPages).toEqual(['https://img.site.test/i/beach-03']);
    useImportDraft.getState().markMedia('https://img.site.test/i/beach-03', 'image');
    const v = computeDraft(useImportDraft.getState());
    expect(v.unscannedPages).toEqual([]);
    expect(v.rows[0].mediaType).toBe('image');
  });
});
