import type { Draft } from 'immer';
import { findChapter, findSpread, getBook, mutate } from './book';
import { changeTemplate, createItem, createSpread, emptyImage, uid } from '../model/templates';
import type {
  Author,
  Book,
  BoardEl,
  Chapter,
  Focal,
  ImageSlot,
  Item,
  Note,
  PageSide,
  Spread,
  TemplateId,
} from '../model/types';

// Every action here is one undo step. Names read like a history: "moved a spread",
// "set the focal point", never "updated state".

// ── Spreads ─────────────────────────────────────────────────────────────────

export function addSpread(afterSpreadId: string, template: TemplateId): string {
  const spread = createSpread(template);
  mutate((b) => {
    const f = findSpread(b, afterSpreadId);
    if (!f) return;
    f.chapter.spreads.splice(f.index + 1, 0, spread as Draft<Spread>);
  });
  return spread.id;
}

export function duplicateSpread(spreadId: string): string | null {
  const f = findSpread(getBook(), spreadId);
  if (!f) return null;
  const copy: Spread = { ...structuredClone(f.spread), id: uid('sp'), notes: [] };
  mutate((b) => {
    const g = findSpread(b, spreadId);
    g?.chapter.spreads.splice(g.index + 1, 0, copy as Draft<Spread>);
  });
  return copy.id;
}

/** Returns the id of the spread to show next, or null if the spread cannot go. */
export function deleteSpread(spreadId: string): string | null {
  const book = getBook();
  const f = findSpread(book, spreadId);
  if (!f) return null;
  if (f.spread.template === 'cover' || f.spread.template === 'contents') return null;
  const all = book.chapters.flatMap((c) => c.spreads);
  const i = all.findIndex((s) => s.id === spreadId);
  const next = all[i + 1]?.id ?? all[i - 1]?.id ?? null;
  mutate((b) => {
    const g = findSpread(b, spreadId);
    g?.chapter.spreads.splice(g.index, 1);
  });
  return next;
}

export function moveSpreadWithin(chapterId: string, from: number, to: number): void {
  if (from === to) return;
  mutate((b) => {
    const c = findChapter(b, chapterId);
    if (!c) return;
    const [s] = c.spreads.splice(from, 1);
    c.spreads.splice(to, 0, s);
  });
}

/** Move a spread to a position in any chapter (the contact sheet's drag and drop). */
export function moveSpread(spreadId: string, toChapterId: string, toIndex: number): void {
  mutate((b) => {
    const f = findSpread(b, spreadId);
    const target = b.chapters.find((c) => c.id === toChapterId);
    if (!f || !target) return;
    if (f.spread.template === 'cover') return;
    const [s] = f.chapter.spreads.splice(f.index, 1);
    target.spreads.splice(Math.min(toIndex, target.spreads.length), 0, s);
  });
}

export function moveSpreadToChapter(spreadId: string, chapterId: string): void {
  mutate((b) => {
    const f = findSpread(b, spreadId);
    const target = b.chapters.find((c) => c.id === chapterId);
    if (!f || !target || f.chapter.id === chapterId) return;
    const [s] = f.chapter.spreads.splice(f.index, 1);
    target.spreads.push(s);
  });
}

export function setTemplate(spreadId: string, template: TemplateId): void {
  mutate((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    const next = changeTemplate(f.spread as Spread, template);
    f.chapter.spreads[f.index] = next as Draft<Spread>;
  });
}

// ── Chapters ────────────────────────────────────────────────────────────────

const TONES = ['#8A9A7B', '#5E6B4A', '#B08B5E', '#B0452A', '#8E8B85', '#6E7B86', '#76805F', '#8C6B52'];

export function addChapter(title = 'A new chapter'): { chapterId: string; spreadId: string } {
  const book = getBook();
  const opener = createSpread('opener', { image: emptyImage('Photograph to come') });
  const essay = createSpread('essay');
  const slug = uniqueSlug(book, title);
  const chapter: Chapter = {
    id: uid('ch'),
    slug,
    kind: 'chapter',
    title,
    kicker: '',
    epigraph: '',
    tone: TONES[book.chapters.length % TONES.length],
    spreads: [opener, essay],
  };
  mutate((b) => {
    // New chapters go before the epilogue.
    const at = b.chapters.findIndex((c) => c.kind === 'epilogue');
    b.chapters.splice(at < 0 ? b.chapters.length : at, 0, chapter as Draft<Chapter>);
  });
  return { chapterId: chapter.id, spreadId: opener.id };
}

export function uniqueSlug(book: Book, title: string): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'chapter';
  let slug = base;
  for (let i = 2; book.chapters.some((c) => c.slug === slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** Move a chapter up or down among the movable chapters (front matter stays first). */
export function moveChapter(chapterId: string, delta: -1 | 1): void {
  mutate((b) => {
    const i = b.chapters.findIndex((c) => c.id === chapterId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= b.chapters.length) return;
    if (b.chapters[j].kind === 'front' || b.chapters[i].kind === 'front') return;
    const [c] = b.chapters.splice(i, 1);
    b.chapters.splice(j, 0, c);
  });
}

export function deleteChapter(chapterId: string): void {
  mutate((b) => {
    const i = b.chapters.findIndex((c) => c.id === chapterId);
    if (i < 0 || b.chapters[i].kind === 'front') return;
    b.chapters.splice(i, 1);
  });
}

// ── Notes (marginalia) ──────────────────────────────────────────────────────

export function addNote(spreadId: string, page: PageSide, x: number, y: number, author: Author): string {
  const note: Note = {
    id: uid('note'),
    author,
    text: '',
    page,
    x: clamp(x, 4, 96),
    y: clamp(y, 4, 96),
    resolved: false,
    createdAt: new Date().toISOString(),
  };
  mutate((b) => {
    findSpread(b, spreadId)?.spread.notes.push(note);
  });
  return note.id;
}

export function updateNote(spreadId: string, noteId: string, patch: Partial<Omit<Note, 'id'>>): void {
  mutate((b) => {
    const n = findSpread(b, spreadId)?.spread.notes.find((x) => x.id === noteId);
    if (n) Object.assign(n, patch);
  });
}

export function deleteNote(spreadId: string, noteId: string): void {
  mutate((b) => {
    const s = findSpread(b, spreadId)?.spread;
    if (s) s.notes = s.notes.filter((n) => n.id !== noteId);
  });
}

// ── Images, wherever they live ──────────────────────────────────────────────

export type ImageRef =
  | { kind: 'slot'; spreadId: string; key: string }
  | { kind: 'item'; itemId: string }
  | { kind: 'board'; spreadId: string; elId: string }
  | { kind: 'plan'; spreadId: string };

export interface ImageFields {
  assetId: string | null;
  focal: Focal;
  alt: string;
  credit: string;
  decorative: boolean;
  label: string;
}

export function refKey(ref: ImageRef): string {
  switch (ref.kind) {
    case 'slot':
      return `slot:${ref.spreadId}:${ref.key}`;
    case 'item':
      return `item:${ref.itemId}`;
    case 'board':
      return `board:${ref.spreadId}:${ref.elId}`;
    case 'plan':
      return `plan:${ref.spreadId}`;
  }
}

export function readImage(book: Book, ref: ImageRef): ImageFields | null {
  switch (ref.kind) {
    case 'slot': {
      const s = findSpread(book, ref.spreadId)?.spread.slots[ref.key];
      if (!s || s.kind !== 'image') return null;
      return { assetId: s.assetId, focal: s.focal, alt: s.alt, credit: s.credit, decorative: s.decorative, label: s.label };
    }
    case 'item': {
      const it = book.items[ref.itemId];
      if (!it) return null;
      return { assetId: it.assetId, focal: it.focal, alt: it.name, credit: '', decorative: false, label: it.label };
    }
    case 'board': {
      const el = boardEl(book, ref.spreadId, ref.elId);
      if (!el) return null;
      return { assetId: el.assetId ?? null, focal: el.focal ?? { x: 50, y: 50 }, alt: el.label ?? '', credit: '', decorative: false, label: el.label ?? '' };
    }
    case 'plan': {
      const s = findSpread(book, ref.spreadId)?.spread.slots.plan;
      if (!s || s.kind !== 'pins') return null;
      return { assetId: s.assetId, focal: { x: 50, y: 50 }, alt: s.alt, credit: '', decorative: false, label: s.label };
    }
  }
}

function boardEl(book: Book | Draft<Book>, spreadId: string, elId: string): BoardEl | undefined {
  const s = findSpread(book, spreadId)?.spread.slots.board;
  return s && s.kind === 'board' ? (s.elements.find((e) => e.id === elId) as BoardEl | undefined) : undefined;
}

function writeImage(b: Draft<Book>, ref: ImageRef, patch: Partial<ImageFields>): void {
  switch (ref.kind) {
    case 'slot': {
      const s = findSpread(b, ref.spreadId)?.spread.slots[ref.key];
      if (s && s.kind === 'image') Object.assign(s as ImageSlot, patch);
      return;
    }
    case 'item': {
      const it = b.items[ref.itemId];
      if (!it) return;
      if ('assetId' in patch) it.assetId = patch.assetId ?? null;
      if (patch.focal) it.focal = patch.focal;
      return;
    }
    case 'board': {
      const el = boardEl(b, ref.spreadId, ref.elId);
      if (!el) return;
      if ('assetId' in patch) el.assetId = patch.assetId ?? null;
      if (patch.focal) el.focal = patch.focal;
      if (patch.alt !== undefined) el.label = patch.alt;
      return;
    }
    case 'plan': {
      const s = findSpread(b, ref.spreadId)?.spread.slots.plan;
      if (!s || s.kind !== 'pins') return;
      if ('assetId' in patch) s.assetId = patch.assetId ?? null;
      if (patch.alt !== undefined) s.alt = patch.alt;
      return;
    }
  }
}

export function setImage(ref: ImageRef, patch: Partial<ImageFields>): void {
  mutate((b) => writeImage(b, ref, patch));
}

/** Put photos into several image places in one undo step. */
export function setImages(entries: { ref: ImageRef; assetId: string }[]): void {
  mutate((b) => {
    for (const e of entries) writeImage(b, e.ref, { assetId: e.assetId, focal: { x: 50, y: 50 } });
  });
}

/** Swap the photographs (and their focal points, alt text and credits) of two places. */
export function swapImages(a: ImageRef, b2: ImageRef): void {
  const book = getBook();
  const A = readImage(book, a);
  const B = readImage(book, b2);
  if (!A || !B || refKey(a) === refKey(b2)) return;
  const photo = (f: ImageFields) => ({ assetId: f.assetId, focal: f.focal, alt: f.alt, credit: f.credit, decorative: f.decorative });
  mutate((b) => {
    writeImage(b, a, photo(B));
    writeImage(b, b2, photo(A));
  });
}

/** The image places on a spread, in reading order, for filling several at once. */
export function imageRefsOf(spread: Spread, book: Book): ImageRef[] {
  const refs: ImageRef[] = [];
  for (const [key, slot] of Object.entries(spread.slots)) {
    if (slot.kind === 'image') refs.push({ kind: 'slot', spreadId: spread.id, key });
    if (slot.kind === 'pins') refs.push({ kind: 'plan', spreadId: spread.id });
    if (slot.kind === 'board') for (const el of slot.elements) if (el.type === 'image') refs.push({ kind: 'board', spreadId: spread.id, elId: el.id });
    if (slot.kind === 'items') for (const id of slot.itemIds) if (book.items[id]) refs.push({ kind: 'item', itemId: id });
  }
  return refs;
}

// ── Items ───────────────────────────────────────────────────────────────────

export function updateItem(itemId: string, recipe: (item: Draft<Item>) => void): void {
  mutate((b) => {
    const it = b.items[itemId];
    if (it) recipe(it);
  });
}

export function addItemToSlot(spreadId: string, key: string, partial: Partial<Item> & { name: string }, kind: Item['kind'] = 'product'): string {
  const item = createItem(partial, kind);
  mutate((b) => {
    b.items[item.id] = item as Draft<Item>;
    const s = findSpread(b, spreadId)?.spread.slots[key];
    if (s && s.kind === 'items') s.itemIds.push(item.id);
  });
  return item.id;
}

export function removeItemFromSlot(spreadId: string, key: string, itemId: string): void {
  mutate((b) => {
    const s = findSpread(b, spreadId)?.spread.slots[key];
    if (s && s.kind === 'items') s.itemIds = s.itemIds.filter((id) => id !== itemId);
    // Items no longer referenced anywhere are removed from the book.
    const used = b.chapters.some((c) =>
      c.spreads.some((sp) =>
        Object.values(sp.slots).some((sl) => (sl.kind === 'items' && sl.itemIds.includes(itemId)) || (sl.kind === 'meta' && sl.values.chosen === itemId)),
      ),
    );
    if (!used) delete b.items[itemId];
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

// ── Mood boards ─────────────────────────────────────────────────────────────

function boardOf(b: Draft<Book>, spreadId: string) {
  const s = findSpread(b, spreadId)?.spread.slots.board;
  return s && s.kind === 'board' ? s : null;
}

export function addBoardEl(spreadId: string, el: Omit<BoardEl, 'id' | 'z'>): string {
  const id = uid('el');
  mutate((b) => {
    const board = boardOf(b, spreadId);
    if (!board) return;
    const z = Math.max(0, ...board.elements.map((e) => e.z)) + 1;
    board.elements.push({ ...el, id, z });
  });
  return id;
}

export function updateBoardEl(spreadId: string, elId: string, patch: Partial<BoardEl>): void {
  mutate((b) => {
    const el = boardOf(b, spreadId)?.elements.find((e) => e.id === elId);
    if (el) Object.assign(el, patch);
  });
}

export function deleteBoardEl(spreadId: string, elId: string): void {
  mutate((b) => {
    const board = boardOf(b, spreadId);
    if (board) board.elements = board.elements.filter((e) => e.id !== elId);
  });
}

/** Bring forward (+1) or send back (-1) one layer. */
export function restackBoardEl(spreadId: string, elId: string, delta: 1 | -1): void {
  mutate((b) => {
    const board = boardOf(b, spreadId);
    if (!board) return;
    const sorted = [...board.elements].sort((x, y) => x.z - y.z);
    const i = sorted.findIndex((e) => e.id === elId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((e, k) => (e.z = k + 1));
  });
}

// ── Pins ────────────────────────────────────────────────────────────────────

function pinsOf(b: Draft<Book>, spreadId: string) {
  const s = findSpread(b, spreadId)?.spread.slots.plan;
  return s && s.kind === 'pins' ? s : null;
}

export function addPin(spreadId: string, x: number, y: number): string {
  const id = uid('pin');
  mutate((b) => {
    pinsOf(b, spreadId)?.pins.push({ id, x: clamp(x, 2, 98), y: clamp(y, 2, 98), title: '', text: '', url: '', itemId: null });
  });
  return id;
}

export function updatePin(spreadId: string, pinId: string, patch: Partial<Omit<import('../model/types').Pin, 'id'>>): void {
  mutate((b) => {
    const p = pinsOf(b, spreadId)?.pins.find((x) => x.id === pinId);
    if (p) Object.assign(p, patch);
  });
}

export function deletePin(spreadId: string, pinId: string): void {
  mutate((b) => {
    const s = pinsOf(b, spreadId);
    if (s) s.pins = s.pins.filter((p) => p.id !== pinId);
  });
}

// ── Swatches ────────────────────────────────────────────────────────────────

function swatchesOf(b: Draft<Book>, spreadId: string) {
  const s = findSpread(b, spreadId)?.spread.slots.swatches;
  return s && s.kind === 'swatches' ? s : null;
}

export function addSwatch(spreadId: string): void {
  mutate((b) => {
    swatchesOf(b, spreadId)?.swatches.push({ id: uid('sw'), name: 'New colour', hex: '#B08B5E', note: '' });
  });
}

export function updateSwatch(spreadId: string, swatchId: string, patch: Partial<{ name: string; hex: string; note: string }>): void {
  mutate((b) => {
    const s = swatchesOf(b, spreadId)?.swatches.find((x) => x.id === swatchId);
    if (s) Object.assign(s, patch);
  });
}

export function deleteSwatch(spreadId: string, swatchId: string): void {
  mutate((b) => {
    const s = swatchesOf(b, spreadId);
    if (s) s.swatches = s.swatches.filter((x) => x.id !== swatchId);
  });
}

// ── Decisions ───────────────────────────────────────────────────────────────

export function setMeta(spreadId: string, key: string, value: string): void {
  mutate((b) => {
    const s = findSpread(b, spreadId)?.spread.slots.meta;
    if (s && s.kind === 'meta') s.values[key] = value;
  });
}

export function toggleFavorite(itemId: string, who: Author): void {
  mutate((b) => {
    const it = b.items[itemId];
    if (it) it.favorites[who] = !it.favorites[who];
  });
}
