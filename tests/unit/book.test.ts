import { describe, expect, it } from 'vitest';
import { buildSeedBook } from '@/book/seed';
import { migrateBook } from '@/book/migrate';
import { flattenSpreads, contentsEntries, figureNumbers } from '@/book/pagination';
import { retemplate, newSpread } from '@/templates/defaults';
import { applyPhotoManifest } from '@/content/applyManifest';
import { exportBookZip, importBookZip } from '@/storage/zip';
import { MemoryStorage } from '@/storage/memory';

describe('seed and pagination', () => {
  it('builds the whole book from the brief', () => {
    const book = buildSeedBook();
    const titles = book.chapters.map((c) => c.title);
    expect(titles).toContain('A Cook’s Kitchen');
    expect(titles).toContain('Still to Decide');
    expect(Object.values(book.items).filter((i) => i.name.startsWith('Vanity'))).toHaveLength(32);
  });

  it('numbers pages like a bound book: verso even, recto odd, no folio on the cover', () => {
    const book = buildSeedBook();
    const spreads = flattenSpreads(book);
    expect(spreads[0].folio).toEqual({ left: null, right: null });
    expect(spreads[2].folio).toEqual({ left: null, right: 1 });
    expect(spreads[3].folio).toEqual({ left: 2, right: 3 });
    const contents = contentsEntries(book, spreads);
    expect(contents[0].chapter.kicker).toBe('Prologue');
    expect(contents.every((c) => c.page != null)).toBe(true);
  });

  it('numbers figures per chapter', () => {
    const book = buildSeedBook();
    const figs = figureNumbers(book);
    const kitchen = book.chapters.find((c) => c.slug === 'kitchen')!;
    const opener = kitchen.spreads[0];
    expect(figs.get(`${opener.id}:hero`)).toBe('3.1');
  });
});

describe('templates', () => {
  it('carries content over when the template changes', () => {
    const chapter = { title: 'Kitchen' };
    const essay = newSpread('essay', chapter);
    essay.slots.title = { kind: 'text', html: 'Kept' };
    essay.slots.aside = { kind: 'image', assetId: 'as_1', focal: { x: 0.2, y: 0.8 }, caption: 'c', alt: 'a', credit: '', placeholder: 'P' };
    const full = retemplate(essay, 'fullbleed', chapter);
    expect(full.template).toBe('fullbleed');
    expect(full.slots.image).toMatchObject({ kind: 'image', assetId: 'as_1', focal: { x: 0.2, y: 0.8 } });
    const gallery = retemplate(essay, 'gallery', chapter);
    expect(gallery.slots.title).toMatchObject({ kind: 'text', html: 'Kept' });
    const pair = retemplate(full, 'beforeafter', chapter);
    expect(pair.slots.pair).toMatchObject({ kind: 'pair', before: { assetId: 'as_1' } });
  });
});

describe('migration and photos', () => {
  it('upgrades an old export without theme or assets', () => {
    const raw = { id: 'b', title: 'Old', chapters: [{ id: 'c', title: 'One', spreads: [{ id: 's', template: 'essay', slots: {} }] }] };
    const book = migrateBook(raw);
    expect(book.schemaVersion).toBe(1);
    expect(book.theme.sage).toBe('#8A9A7B');
    expect(book.chapters[0].spreads[0].notes).toEqual([]);
    expect(() => migrateBook({ nope: true })).toThrow();
  });

  it('fills empty slots from the photo manifest once, in order', () => {
    const book = buildSeedBook();
    const manifest = {
      generatedAt: '2026-11-01T00:00:00Z',
      chapters: {
        kitchen: [
          { id: 'static:kitchen/01', name: '01 peninsula', width: 3000, height: 2000, mime: 'image/jpeg', original: '/photos/kitchen/01.jpg', variants: [{ w: 800, url: '/photos/kitchen/01-800.webp' }] },
          { id: 'static:kitchen/02', name: '02 sink', width: 3000, height: 2000, mime: 'image/jpeg', original: '/photos/kitchen/02.jpg', variants: [{ w: 800, url: '/photos/kitchen/02-800.webp' }] },
        ],
      },
    };
    const next = applyPhotoManifest(book, manifest);
    const kitchen = next.chapters.find((c) => c.slug === 'kitchen')!;
    const hero = kitchen.spreads[0].slots.hero;
    expect(hero.kind === 'image' && hero.assetId).toBe('static:kitchen/01');
    const aside = kitchen.spreads[1].slots.aside;
    expect(aside.kind === 'image' && aside.assetId).toBe('static:kitchen/02');
    expect(next.appliedPhotos).toEqual(['static:kitchen/01', 'static:kitchen/02']);
    // removing a photo and applying again does not bring it back
    if (hero.kind === 'image') hero.assetId = null;
    const again = applyPhotoManifest(next, manifest);
    const hero2 = again.chapters.find((c) => c.slug === 'kitchen')!.spreads[0].slots.hero;
    expect(hero2.kind === 'image' && hero2.assetId).toBeNull();
  });
});

describe('zip round trip', () => {
  it('exports and imports an identical book with its photos', async () => {
    const storage = new MemoryStorage();
    const book = buildSeedBook();
    book.title = 'Round trip';
    book.assets['as_x'] = { id: 'as_x', source: 'idb', width: 10, height: 10, mime: 'image/jpeg', createdAt: 'now' };
    const kitchen = book.chapters.find((c) => c.slug === 'kitchen')!;
    const hero = kitchen.spreads[0].slots.hero;
    if (hero.kind === 'image') hero.assetId = 'as_x';
    await storage.putAssetBlob('as_x', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 0);
    await storage.putAssetBlob('as_x', new Blob([new Uint8Array([4, 5])], { type: 'image/webp' }), 800);

    const zip = await exportBookZip(book, storage);
    const other = new MemoryStorage();
    const back = await importBookZip(zip, other);
    expect(back).toEqual(book);
    expect(await other.listAssetVariants('as_x')).toEqual(expect.arrayContaining([0, 800]));
    const orig = await other.getAssetBlob('as_x', 0);
    expect(orig && new Uint8Array(await orig.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('drops references to photos that did not travel', async () => {
    const storage = new MemoryStorage();
    const book = buildSeedBook();
    book.assets['as_missing'] = { id: 'as_missing', source: 'idb', width: 10, height: 10, mime: 'image/jpeg', createdAt: 'now' };
    const zip = await exportBookZip(book, storage);
    const back = await importBookZip(zip, new MemoryStorage());
    expect(back.assets['as_missing']).toBeUndefined();
  });
});
