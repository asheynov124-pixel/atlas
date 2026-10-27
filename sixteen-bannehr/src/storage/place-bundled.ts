import { imageRefsOf, readImage, type ImageRef } from '../store/actions';
import { bundledPhotos } from './bundled';
import { findSpread } from '../store/book';
import { createSpread, emptyImage } from '../model/templates';
import type { Book, TemplateId } from '../model/types';

// Where a new page goes: after the chapter's pictures and essays, before its galleries,
// palettes and decisions.
const STORY: TemplateId[] = ['opener', 'essay', 'fullbleed', 'beforeAfter', 'title'];

/** "02-around-the-corner" → "Around the corner" */
function titleOf(name: string): string {
  const words = name.replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'A photograph';
}

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
    const fresh = list(chapter.slug).filter((p) => !done.has(p.id));
    if (!fresh.length) continue;
    // A photo from a pages/ folder becomes a full-bleed page of its own (a collage, say).
    for (const photo of fresh.filter((p) => p.target === 'page')) {
      const title = titleOf(photo.name);
      const page = createSpread('fullbleed', { image: emptyImage(title, { assetId: photo.id, alt: title, caption: `${title}.` }) });
      page.id = `sp-${photo.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      let at = 0;
      chapter.spreads.forEach((s, i) => {
        if (STORY.includes(s.template)) at = i + 1;
      });
      chapter.spreads.splice(at, 0, page);
      next.placedBundled.push(photo.id);
      placed++;
    }
    // Photos meant for options or essays claim those first; the rest fill pages, then options.
    const photos = [...fresh.filter((p) => p.target === 'items' || p.target === 'essay'), ...fresh.filter((p) => !p.target || p.target === 'any')];
    const refs: ImageRef[] = [];
    const itemRefs: ImageRef[] = [];
    const essayRefs: ImageRef[] = [];
    for (const spread of chapter.spreads)
      for (const ref of imageRefsOf(spread, next)) {
        // An essay's margin picture is optional: only a photo from an essay/ folder fills it.
        if (ref.kind === 'slot' && spread.template === 'essay') essayRefs.push(ref);
        else (ref.kind === 'item' ? itemRefs : refs).push(ref);
      }
    const isEmpty = (r: ImageRef) => readImage(next, r)?.assetId === null;
    const pools: Record<'any' | 'items' | 'essay', ImageRef[]> = {
      any: [...refs, ...itemRefs].filter(isEmpty),
      items: itemRefs.filter(isEmpty),
      essay: essayRefs.filter(isEmpty),
    };
    const taken = new Set<ImageRef>();
    for (const photo of photos) {
      const pool = pools[photo.target === 'items' || photo.target === 'essay' ? photo.target : 'any'];
      const ref = pool.find((r) => !taken.has(r));
      if (!ref) continue;
      taken.add(ref);
      write(next, ref, photo.id);
      next.placedBundled.push(photo.id);
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
