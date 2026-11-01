import { templateIsBleed } from '@/templates/meta';
import type { Book, Chapter, Spread } from './types';

export interface SpreadRef {
  spread: Spread;
  chapter: Chapter;
  /** Index into the flattened list of spreads. */
  index: number;
  /** Index of the spread within its chapter. */
  indexInChapter: number;
  /** Folio of the left and right pages, or null when the page carries none. */
  folio: { left: number | null; right: number | null };
  bleed: boolean;
}

export interface PageRef {
  spreadIndex: number;
  side: 'left' | 'right' | 'bleed';
  /** Index into the flattened list of pages (phone). */
  index: number;
}

/** Index of the first spread that carries a folio (the Contents). */
const FIRST_FOLIO_SPREAD = 2;

/**
 * Flatten chapters into an ordered list of spreads with folios. Verso pages
 * are even and recto pages odd, as in a bound book; the cover and endpapers
 * carry no folio and the Contents spread begins at page 1 on the recto.
 */
export function flattenSpreads(book: Book): SpreadRef[] {
  const out: SpreadRef[] = [];
  let index = 0;
  for (const chapter of book.chapters) {
    chapter.spreads.forEach((spread, indexInChapter) => {
      const bleed = templateIsBleed(spread.template);
      let folio: SpreadRef['folio'] = { left: null, right: null };
      if (index >= FIRST_FOLIO_SPREAD) {
        const left = 2 * (index - FIRST_FOLIO_SPREAD);
        folio = { left: left === 0 ? null : left, right: left + 1 };
      }
      out.push({ spread, chapter, index, indexInChapter, folio, bleed });
      index += 1;
    });
  }
  return out;
}

export function flattenPages(spreads: SpreadRef[]): PageRef[] {
  const pages: PageRef[] = [];
  for (const s of spreads) {
    if (s.bleed) {
      pages.push({ spreadIndex: s.index, side: 'bleed', index: pages.length });
    } else {
      pages.push({ spreadIndex: s.index, side: 'left', index: pages.length });
      pages.push({ spreadIndex: s.index, side: 'right', index: pages.length });
    }
  }
  return pages;
}

export function findSpreadIndexById(spreads: SpreadRef[], id: string): number {
  return spreads.findIndex((s) => s.spread.id === id);
}

/** Chapters that appear in Contents, with the page of their first spread. */
export function contentsEntries(book: Book, spreads: SpreadRef[]) {
  return book.chapters
    .filter((c) => !c.hidden && c.spreads.length > 0)
    .map((c) => {
      const first = spreads.find((s) => s.chapter.id === c.id)!;
      const page = first.folio.left ?? first.folio.right;
      return { chapter: c, spreadIndex: first.index, spreadId: first.spread.id, page };
    });
}

/**
 * Figure numbers: "Fig. 3.4" is the fourth image in chapter 3. Keyed by
 * `${spreadId}:${slotKey}` for plain image slots and pairs/pins sub-images.
 */
export function figureNumbers(book: Book): Map<string, string> {
  const map = new Map<string, string>();
  for (const chapter of book.chapters) {
    if (chapter.hidden) continue;
    let n = 0;
    const prefix = chapter.number ?? (chapter.kicker ? chapter.kicker[0] : '');
    for (const spread of chapter.spreads) {
      for (const [key, slot] of Object.entries(spread.slots)) {
        if (slot.kind === 'image') {
          n += 1;
          map.set(`${spread.id}:${key}`, `${prefix}.${n}`);
        } else if (slot.kind === 'pair') {
          n += 1;
          map.set(`${spread.id}:${key}:before`, `${prefix}.${n}`);
          n += 1;
          map.set(`${spread.id}:${key}:after`, `${prefix}.${n}`);
        } else if (slot.kind === 'pins') {
          n += 1;
          map.set(`${spread.id}:${key}`, `${prefix}.${n}`);
        }
      }
    }
  }
  return map;
}
