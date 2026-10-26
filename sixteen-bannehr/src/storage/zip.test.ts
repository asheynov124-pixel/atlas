import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DexieRepository } from './dexie';
import { exportZip, importZip } from './zip';
import { createSeedBook } from '../model/seed';
import type { AssetMeta } from '../model/types';

describe('export and import', () => {
  it('round-trips the book, its photos and its editions into a fresh browser', async () => {
    const phoneA = new DexieRepository('phone-a');
    const phoneB = new DexieRepository('phone-b');
    const book = createSeedBook();

    // A photo on the cover, with two variants.
    const meta: AssetMeta = {
      id: 'as-cover',
      source: 'blob',
      width: 3000,
      height: 2000,
      mime: 'image/jpeg',
      name: 'cover.jpg',
      variants: [800, 1600],
      createdAt: '2026-10-26T00:00:00.000Z',
    };
    await phoneA.putAsset(meta, new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }));
    await phoneA.putVariant('as-cover', 800, new Blob([new Uint8Array([8])], { type: 'image/webp' }));
    await phoneA.putVariant('as-cover', 1600, new Blob([new Uint8Array([16])], { type: 'image/webp' }));
    const cover = book.chapters[0].spreads[0].slots.image;
    if (cover.kind === 'image') cover.assetId = 'as-cover';
    book.chapters[2].title = 'The Approach, Revised';
    await phoneA.saveBook(book);
    await phoneA.saveEdition({ id: 'ed-1', name: 'First proof', author: 'sonny', createdAt: '2026-10-25T00:00:00.000Z', book: createSeedBook() });

    // An unused photo is not exported.
    await phoneA.putAsset({ ...meta, id: 'as-orphan' }, new Blob([new Uint8Array([9])], { type: 'image/jpeg' }));

    const zip = await exportZip(phoneA, book);
    const result = await importZip(phoneB, zip);

    expect(result.book).toEqual(book);
    expect(await phoneB.loadBook()).toEqual(book);
    expect(result.assets).toBe(1);
    expect(await phoneB.getAssetMeta('as-orphan')).toBeUndefined();
    const imported = await phoneB.getAssetMeta('as-cover');
    expect(imported?.variants).toEqual([800, 1600]);
    const original = await phoneB.getBlob('as-cover', 0);
    expect(new Uint8Array(await original!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect((await phoneB.listEditions()).map((e) => e.name)).toEqual(['First proof']);
  });

  it('refuses a zip that is not a book, and changes nothing', async () => {
    const repo = new DexieRepository('phone-c');
    await repo.saveBook(createSeedBook());
    const JSZip = (await import('jszip')).default;
    const z = new JSZip();
    z.file('hello.txt', 'not a book');
    const bytes = await z.generateAsync({ type: 'uint8array' });
    await expect(importZip(repo, new Blob([bytes as BlobPart]))).rejects.toThrow(/not a Sixteen Bannehr book/);
    expect(await repo.loadBook()).not.toBeNull();
  });
});
