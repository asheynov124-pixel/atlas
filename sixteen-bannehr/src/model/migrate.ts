import { DEFAULT_THEME } from './seed';
import { EMPTY_CLEAN, TEMPLATES, emptySlot } from './templates';
import type { Book } from './types';

/**
 * Bring a stored or imported book up to the current shape. Tolerant by design: a book
 * that arrives from an older build or another phone should open, not fail.
 */
export function migrate(input: unknown): Book {
  if (!input || typeof input !== 'object') throw new Error('Not a book');
  const book = structuredClone(input) as Book;
  if (!Array.isArray(book.chapters)) throw new Error('This file has no chapters');
  book.schema = 1;
  book.title ??= 'Sixteen Bannehr';
  book.subtitle ??= '';
  book.address ??= '';
  book.dedication ??= '';
  book.items ??= {};
  book.placedBundled ??= [];
  book.theme = {
    day: { ...DEFAULT_THEME.day, ...(book.theme?.day ?? {}) },
    night: { ...DEFAULT_THEME.night, ...(book.theme?.night ?? {}) },
  };
  for (const c of book.chapters) {
    c.kicker ??= '';
    c.epigraph ??= '';
    c.tone ??= '#8A9A7B';
    c.slug ??= c.id;
    c.kind ??= 'chapter';
    c.spreads ??= [];
    for (const s of c.spreads) {
      s.notes ??= [];
      s.slots ??= {};
      const def = TEMPLATES[s.template];
      if (!def) {
        s.template = 'essay';
      }
      for (const d of TEMPLATES[s.template].slots) {
        const slot = s.slots[d.key];
        if (!slot || slot.kind !== d.kind) s.slots[d.key] = emptySlot(d.kind);
      }
    }
  }
  for (const it of Object.values(book.items)) {
    it.clean = { ...EMPTY_CLEAN, ...(it.clean ?? {}) };
    it.favorites = { adi: !!it.favorites?.adi, sonny: !!it.favorites?.sonny };
    it.tags ??= [];
    it.focal ??= { x: 50, y: 50 };
    it.price = typeof it.price === 'number' && Number.isFinite(it.price) ? it.price : null;
  }
  return book;
}
