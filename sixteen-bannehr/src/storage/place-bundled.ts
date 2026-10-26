import { imageRefsOf, readImage, type ImageRef } from '../store/actions';
import { bundledPhotos } from './bundled';
import { findSpread } from '../store/book';
import type { Book } from '../model/types';

/**
 * Fill each chapter's empty image places with the photos `npm run import-photos` baked
 * into the site, in filename order: spread images first, then gallery items. A bundled
 * photo is placed once; if Sonny removes it, it stays removed.
 */
export function placeBundled(book: Book, list = bundledPhotos): { book: Book; placed: number } {
  let placed = 0;
  const next = structuredClone(book);
  const done = new Set(next.placedBundled);
  for (const chapter of next.chapters) {
    const photos = list(chapter.slug).filter((p) => !done.has(p.id));
    if (!photos.length) continue;
    const refs: ImageRef[] = [];
    const itemRefs: ImageRef[] = [];
    for (const spread of chapter.spreads)
      for (const ref of imageRefsOf(spread, next)) (ref.kind === 'item' ? itemRefs : refs).push(ref);
    const empty = [...refs, ...itemRefs].filter((r) => readImage(next, r)?.assetId === null);
    for (let i = 0; i < photos.length && i < empty.length; i++) {
      write(next, empty[i], photos[i].id);
      next.placedBundled.push(photos[i].id);
      placed++;
    }
  }
  return { book: placed ? next : book, placed };
}

function write(book: Book, ref: ImageRef, assetId: string) {
  switch (ref.kind) {
    case 'slot': {
      const s = findSpread(book, ref.spreadId)?.spread.slots[ref.key];
      if (s?.kind === 'image') s.assetId = assetId;
      return;
    }
    case 'plan': {
      const s = findSpread(book, ref.spreadId)?.spread.slots.plan;
      if (s?.kind === 'pins') s.assetId = assetId;
      return;
    }
    case 'board': {
      const s = findSpread(book, ref.spreadId)?.spread.slots.board;
      const el = s?.kind === 'board' ? s.elements.find((e) => e.id === ref.elId) : undefined;
      if (el) el.assetId = assetId;
      return;
    }
    case 'item': {
      const it = book.items[ref.itemId];
      if (it) it.assetId = assetId;
      return;
    }
  }
}
