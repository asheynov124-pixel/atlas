import { DEFAULT_THEME, SCHEMA_VERSION, type Book } from './types';

/**
 * Bring a stored or imported book up to the current schema. Each version
 * step is additive so old exports keep opening.
 */
export function migrateBook(input: unknown): Book {
  const b = structuredClone(input) as Partial<Book> & Record<string, unknown>;
  if (!b || typeof b !== 'object' || !Array.isArray(b.chapters)) throw new Error('Not a book');
  b.schemaVersion = b.schemaVersion ?? 1;
  b.items = b.items ?? {};
  b.assets = b.assets ?? {};
  b.appliedPhotos = b.appliedPhotos ?? [];
  b.theme = { ...DEFAULT_THEME, ...(b.theme ?? {}), night: { ...DEFAULT_THEME.night, ...(b.theme?.night ?? {}) } };
  b.title = b.title ?? 'Untitled';
  b.subtitle = b.subtitle ?? '';
  b.address = b.address ?? '';
  b.dedication = b.dedication ?? '';
  b.updatedAt = b.updatedAt ?? new Date().toISOString();
  for (const c of b.chapters) {
    c.spreads = c.spreads ?? [];
    c.accent = c.accent ?? 'sage';
    c.kicker = c.kicker ?? '';
    c.epigraph = c.epigraph ?? '';
    c.slug = c.slug ?? c.id;
    for (const s of c.spreads) {
      s.notes = s.notes ?? [];
      s.slots = s.slots ?? {};
    }
  }
  b.schemaVersion = SCHEMA_VERSION;
  return b as Book;
}
