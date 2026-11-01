/**
 * Every mutation of the book goes through one of these. Each call is one
 * undo step unless the caller is inside a coalesced editing session.
 */
import { current, isDraft } from 'immer';
import { newId } from '@/book/ids';
import {
  emptyClean,
  type Asset,
  type Author,
  type BoardEl,
  type Book,
  type Chapter,
  type CleanFields,
  type DecisionSlot,
  type ImageSlot,
  type Item,
  type MaterialCard,
  type Note,
  type Pin,
  type ShoppingRow,
  type Spread,
  type TemplateId,
  type Theme,
  type ThemeColorKey,
} from '@/book/types';
import { newSpread, retemplate } from '@/templates/defaults';
import { useBookStore } from './bookStore';

const update = (fn: (book: Book) => void) => useBookStore.getState().update(fn);

/** A plain copy of an Immer draft (structuredClone cannot clone a draft). */
const snapshot = <T,>(x: T): T => (isDraft(x) ? (current(x as object) as T) : x);

export function findSpread(book: Book, spreadId: string): { chapter: Chapter; spread: Spread; index: number } | null {
  for (const chapter of book.chapters) {
    const index = chapter.spreads.findIndex((s) => s.id === spreadId);
    if (index >= 0) return { chapter, spread: chapter.spreads[index], index };
  }
  return null;
}

/** Resolve an image slot by path: "hero", "pair.before", "pins.image". */
export function getImageSlot(spread: Spread, path: string): ImageSlot | null {
  const [key, sub] = path.split('.');
  const slot = spread.slots[key];
  if (!slot) return null;
  if (slot.kind === 'image' && !sub) return slot;
  if (slot.kind === 'pair' && (sub === 'before' || sub === 'after')) return slot[sub];
  if (slot.kind === 'pins' && sub === 'image') return slot.image;
  return null;
}

/** Ordered image slot paths of a spread, used to fill several dropped files. */
export function imageSlotPaths(spread: Spread): string[] {
  const out: string[] = [];
  for (const [key, slot] of Object.entries(spread.slots)) {
    if (slot.kind === 'image') out.push(key);
    else if (slot.kind === 'pair') out.push(`${key}.before`, `${key}.after`);
    else if (slot.kind === 'pins') out.push(`${key}.image`);
  }
  return out;
}

/* ---------------- text ---------------- */

export function setSlotHtml(spreadId: string, key: string, html: string) {
  update((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    const slot = f.spread.slots[key];
    if (slot && slot.kind === 'text') slot.html = html;
    else f.spread.slots[key] = { kind: 'text', html };
  });
}

export function setDecisionWhy(spreadId: string, why: string) {
  update((b) => {
    const f = findSpread(b, spreadId);
    const d = f?.spread.slots.decision;
    if (d && d.kind === 'decision') d.why = why;
  });
}

/* ---------------- images ---------------- */

export function patchImageSlot(spreadId: string, path: string, patch: Partial<Omit<ImageSlot, 'kind'>>) {
  update((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    const slot = getImageSlot(f.spread, path);
    if (slot) Object.assign(slot, patch);
  });
}

export function addAsset(asset: Asset) {
  update((b) => {
    b.assets[asset.id] = asset;
  });
}

export function setImageAsset(spreadId: string, path: string, assetId: string | null) {
  patchImageSlot(spreadId, path, { assetId, focal: { x: 0.5, y: 0.5 } });
}

/** Register assets and place them in slots as one undo step. */
export function placeAssets(spreadId: string, placements: Array<{ path: string; asset: Asset }>) {
  update((b) => {
    const f = findSpread(b, spreadId);
    for (const { path, asset } of placements) {
      b.assets[asset.id] = asset;
      const slot = f ? getImageSlot(f.spread, path) : null;
      if (slot) {
        slot.assetId = asset.id;
        slot.focal = { x: 0.5, y: 0.5 };
      }
    }
  });
}

export function swapImageSlots(a: { spreadId: string; path: string }, b: { spreadId: string; path: string }) {
  update((book) => {
    const fa = findSpread(book, a.spreadId);
    const fb = findSpread(book, b.spreadId);
    if (!fa || !fb) return;
    const sa = getImageSlot(fa.spread, a.path);
    const sb = getImageSlot(fb.spread, b.path);
    if (!sa || !sb) return;
    const keep = (s: ImageSlot) => ({ assetId: s.assetId, focal: { ...s.focal }, alt: s.alt, credit: s.credit, caption: s.caption, decorative: s.decorative });
    const ka = keep(sa);
    const kb = keep(sb);
    Object.assign(sa, kb);
    Object.assign(sb, ka);
  });
}

/* ---------------- spreads ---------------- */

export function addSpread(afterSpreadId: string | null, template: TemplateId, chapterId?: string): string | null {
  let id: string | null = null;
  update((b) => {
    const f = afterSpreadId ? findSpread(b, afterSpreadId) : null;
    const chapter = f?.chapter ?? b.chapters.find((c) => c.id === chapterId) ?? b.chapters.find((c) => !c.hidden) ?? b.chapters[0];
    if (!chapter) return;
    const s = newSpread(template, chapter);
    const at = f ? f.index + 1 : chapter.spreads.length;
    chapter.spreads.splice(at, 0, s);
    id = s.id;
  });
  return id;
}

export function duplicateSpread(spreadId: string): string | null {
  let id: string | null = null;
  update((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    const copy: Spread = structuredClone(snapshot(f.spread));
    copy.id = newId('sp');
    copy.notes = [];
    f.chapter.spreads.splice(f.index + 1, 0, copy);
    id = copy.id;
  });
  return id;
}

export function deleteSpread(spreadId: string) {
  update((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    if (f.spread.template === 'cover' || f.spread.template === 'contents') return; // the book keeps its cover and contents
    f.chapter.spreads.splice(f.index, 1);
  });
}

export function changeTemplate(spreadId: string, template: TemplateId) {
  update((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    f.chapter.spreads[f.index] = retemplate(snapshot(f.spread), template, { title: f.chapter.title });
  });
}

/** Move a spread to a position in the flattened order (used by the thumbnail strip). */
export function moveSpreadTo(spreadId: string, beforeSpreadId: string | null, intoChapterId: string) {
  update((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    if (f.spread.template === 'cover') return;
    const [spread] = f.chapter.spreads.splice(f.index, 1);
    const chapter = b.chapters.find((c) => c.id === intoChapterId) ?? f.chapter;
    const at = beforeSpreadId ? chapter.spreads.findIndex((s) => s.id === beforeSpreadId) : chapter.spreads.length;
    chapter.spreads.splice(at < 0 ? chapter.spreads.length : at, 0, spread);
  });
}

/* ---------------- chapters ---------------- */

export function renumber(b: Book) {
  let n = 1;
  for (const c of b.chapters) {
    if (c.hidden || c.number == null) continue;
    c.number = n++;
  }
}

export function addChapter(afterChapterId: string | null, title = 'New chapter'): string | null {
  let id: string | null = null;
  update((b) => {
    const idx = afterChapterId ? b.chapters.findIndex((c) => c.id === afterChapterId) : b.chapters.findIndex((c) => c.kicker === 'Epilogue') - 1;
    const at = idx >= 0 ? idx + 1 : b.chapters.length;
    const c: Chapter = {
      id: newId('ch'),
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || newId('ch'),
      number: 1,
      title,
      kicker: '',
      epigraph: '',
      accent: 'sage',
      spreads: [],
    };
    c.spreads.push(newSpread('opener', c), newSpread('essay', c));
    b.chapters.splice(at, 0, c);
    renumber(b);
    id = c.id;
  });
  return id;
}

export function setChapterField(chapterId: string, patch: Partial<Pick<Chapter, 'title' | 'kicker' | 'epigraph' | 'accent' | 'slug'>>) {
  update((b) => {
    const c = b.chapters.find((x) => x.id === chapterId);
    if (c) Object.assign(c, patch);
  });
}

export function setChapterAccent(chapterId: string, accent: ThemeColorKey) {
  setChapterField(chapterId, { accent });
}

export function moveChapter(chapterId: string, toIndex: number) {
  update((b) => {
    const from = b.chapters.findIndex((c) => c.id === chapterId);
    if (from < 0) return;
    const [c] = b.chapters.splice(from, 1);
    b.chapters.splice(Math.max(0, Math.min(toIndex, b.chapters.length)), 0, c);
    renumber(b);
  });
}

export function deleteChapter(chapterId: string) {
  update((b) => {
    const i = b.chapters.findIndex((c) => c.id === chapterId);
    if (i < 0 || b.chapters[i].hidden) return;
    b.chapters.splice(i, 1);
    renumber(b);
  });
}

/* ---------------- notes ---------------- */

export function addNote(spreadId: string, author: Author, side: 'left' | 'right', x = 50, y = 40, text = ''): string | null {
  let id: string | null = null;
  update((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    const n: Note = { id: newId('n'), author, text, x, y, side, resolved: false, createdAt: new Date().toISOString() };
    f.spread.notes.push(n);
    id = n.id;
  });
  return id;
}

export function updateNote(spreadId: string, noteId: string, patch: Partial<Omit<Note, 'id'>>) {
  update((b) => {
    const n = findSpread(b, spreadId)?.spread.notes.find((x) => x.id === noteId);
    if (n) Object.assign(n, patch);
  });
}

export function deleteNote(spreadId: string, noteId: string) {
  update((b) => {
    const f = findSpread(b, spreadId);
    if (!f) return;
    f.spread.notes = f.spread.notes.filter((n) => n.id !== noteId);
  });
}

/* ---------------- book + theme ---------------- */

export function setBookField(patch: Partial<Pick<Book, 'title' | 'subtitle' | 'address' | 'dedication'>>) {
  update((b) => Object.assign(b, patch));
}

export function setThemeColor(key: keyof Omit<Theme, 'night'>, value: string) {
  update((b) => {
    b.theme[key] = value;
  });
}

export function setNightColor(key: keyof Theme['night'], value: string) {
  update((b) => {
    b.theme.night[key] = value;
  });
}

export function resetTheme(theme: Theme) {
  update((b) => {
    b.theme = structuredClone(theme);
  });
}

/* ---------------- items ---------------- */

export function toggleFavorite(itemId: string, author: Author) {
  update((b) => {
    const it = b.items[itemId];
    if (it) it.favorites[author] = !it.favorites[author];
  });
}

export function patchItem(itemId: string, patch: Partial<Item>) {
  update((b) => {
    const it = b.items[itemId];
    if (it) Object.assign(it, patch);
  });
}

export function upsertItem(item: Item) {
  update((b) => {
    b.items[item.id] = item;
  });
}

export function replaceBook(book: Book) {
  update((b) => {
    Object.assign(b, structuredClone(book));
  });
}

/* ---------------- items & galleries ---------------- */

export function addItem(name: string, placeholder: string): string {
  const it: Item = {
    id: newId('it'),
    name,
    brand: '',
    price: null,
    currency: 'USD',
    url: '',
    assetId: null,
    placeholder,
    tags: [],
    status: 'considering',
    favorites: { adi: false, sonny: false },
    clean: emptyClean(),
    notes: '',
  };
  update((b) => {
    b.items[it.id] = it;
  });
  return it.id;
}

export function addItemToSlot(spreadId: string, key: string, itemId: string) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind === 'items' && !slot.itemIds.includes(itemId)) slot.itemIds.push(itemId);
  });
}

export function removeItemFromSlot(spreadId: string, key: string, itemId: string) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind === 'items') slot.itemIds = slot.itemIds.filter((id) => id !== itemId);
  });
}

/* ---------------- mood boards ---------------- */

export function addBoardEl(spreadId: string, key: string, el: Omit<BoardEl, 'id' | 'z'>): string | null {
  let id: string | null = null;
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'board') return;
    const z = slot.elements.reduce((m, e) => Math.max(m, e.z), 0) + 1;
    const full: BoardEl = { ...el, id: newId('el'), z };
    slot.elements.push(full);
    id = full.id;
  });
  return id;
}

export function patchBoardEl(spreadId: string, key: string, elId: string, patch: Partial<BoardEl>) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'board') return;
    const el = slot.elements.find((e) => e.id === elId);
    if (el) Object.assign(el, patch);
  });
}

export function removeBoardEl(spreadId: string, key: string, elId: string) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind === 'board') slot.elements = slot.elements.filter((e) => e.id !== elId);
  });
}

/** Bring forward (+1) or send back (-1). */
export function bumpBoardEl(spreadId: string, key: string, elId: string, dir: 1 | -1) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'board') return;
    const sorted = [...slot.elements].sort((a, c) => a.z - c.z);
    const i = sorted.findIndex((e) => e.id === elId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((e, idx) => {
      const el = slot.elements.find((x) => x.id === e.id)!;
      el.z = idx + 1;
    });
  });
}

/* ---------------- pins ---------------- */

export function addPin(spreadId: string, key: string, x: number, y: number): string | null {
  let id: string | null = null;
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'pins') return;
    const pin: Pin = { id: newId('pin'), x, y, title: '', body: '' };
    slot.pins.push(pin);
    id = pin.id;
  });
  return id;
}

export function patchPin(spreadId: string, key: string, pinId: string, patch: Partial<Pin>) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'pins') return;
    const pin = slot.pins.find((p) => p.id === pinId);
    if (pin) Object.assign(pin, patch);
  });
}

export function removePin(spreadId: string, key: string, pinId: string) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind === 'pins') slot.pins = slot.pins.filter((p) => p.id !== pinId);
  });
}

/* ---------------- materials ---------------- */

export function addMaterial(spreadId: string, key: string): string | null {
  let id: string | null = null;
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'materials') return;
    const card: MaterialCard = {
      id: newId('mt'),
      name: 'New material',
      finish: '',
      maker: '',
      url: '',
      pricePerUnit: null,
      unit: '',
      swatchColor: '#D9D2C7',
      assetId: null,
      clean: emptyClean(),
    };
    slot.cards.push(card);
    id = card.id;
  });
  return id;
}

export function patchMaterial(spreadId: string, key: string, cardId: string, patch: Partial<MaterialCard>) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'materials') return;
    const card = slot.cards.find((c) => c.id === cardId);
    if (card) Object.assign(card, patch);
  });
}

export function patchMaterialClean(spreadId: string, key: string, cardId: string, patch: Partial<CleanFields>) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'materials') return;
    const card = slot.cards.find((c) => c.id === cardId);
    if (card) Object.assign(card.clean, patch);
  });
}

export function removeMaterial(spreadId: string, key: string, cardId: string) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind === 'materials') slot.cards = slot.cards.filter((c) => c.id !== cardId);
  });
}

export function patchItemClean(itemId: string, patch: Partial<CleanFields>) {
  update((b) => {
    const it = b.items[itemId];
    if (it) Object.assign(it.clean, patch);
  });
}

/* ---------------- decisions ---------------- */

export function patchDecision(spreadId: string, patch: Partial<Omit<DecisionSlot, 'kind'>>) {
  update((b) => {
    const d = findSpread(b, spreadId)?.spread.slots.decision;
    if (d?.kind === 'decision') Object.assign(d, patch);
  });
}

export function chooseOption(spreadId: string, itemId: string | null) {
  update((b) => {
    const d = findSpread(b, spreadId)?.spread.slots.decision;
    if (d?.kind !== 'decision') return;
    d.chosenId = itemId;
    if (itemId && d.status === 'thinking') d.status = 'decided';
    if (itemId && !d.date) d.date = new Date().toISOString().slice(0, 10);
    for (const id of d.optionIds) {
      const it = b.items[id];
      if (!it) continue;
      if (id === itemId) it.status = 'chosen';
      else if (it.status === 'chosen') it.status = 'considering';
    }
  });
}

export function addDecisionOption(spreadId: string, itemId: string) {
  update((b) => {
    const d = findSpread(b, spreadId)?.spread.slots.decision;
    if (d?.kind === 'decision' && !d.optionIds.includes(itemId)) d.optionIds.push(itemId);
  });
}

export function removeDecisionOption(spreadId: string, itemId: string) {
  update((b) => {
    const d = findSpread(b, spreadId)?.spread.slots.decision;
    if (d?.kind !== 'decision') return;
    d.optionIds = d.optionIds.filter((id) => id !== itemId);
    if (d.chosenId === itemId) d.chosenId = null;
  });
}

/* ---------------- shopping ---------------- */

export function addShoppingRow(spreadId: string, key: string, name = ''): string | null {
  let id: string | null = null;
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'shopping') return;
    const row: ShoppingRow = { id: newId('row'), name, status: 'needed', price: null, retailer: '', url: '', note: '' };
    slot.rows.push(row);
    id = row.id;
  });
  return id;
}

export function patchShoppingRow(spreadId: string, key: string, rowId: string, patch: Partial<ShoppingRow>) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'shopping') return;
    const row = slot.rows.find((r) => r.id === rowId);
    if (row) Object.assign(row, patch);
  });
}

export function removeShoppingRow(spreadId: string, key: string, rowId: string) {
  update((b) => {
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind === 'shopping') slot.rows = slot.rows.filter((r) => r.id !== rowId);
  });
}

/* ---------------- placing assets outside image slots ---------------- */

export function placeItemAsset(itemId: string, asset: Asset) {
  update((b) => {
    b.assets[asset.id] = asset;
    const it = b.items[itemId];
    if (it) {
      it.assetId = asset.id;
      it.focal = { x: 0.5, y: 0.5 };
    }
  });
}

export function placeBoardAsset(spreadId: string, key: string, elId: string, asset: Asset) {
  update((b) => {
    b.assets[asset.id] = asset;
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'board') return;
    const el = slot.elements.find((e) => e.id === elId);
    if (el) el.assetId = asset.id;
  });
}

export function placeMaterialAsset(spreadId: string, key: string, cardId: string, asset: Asset) {
  update((b) => {
    b.assets[asset.id] = asset;
    const slot = findSpread(b, spreadId)?.spread.slots[key];
    if (slot?.kind !== 'materials') return;
    const card = slot.cards.find((c) => c.id === cardId);
    if (card) card.assetId = asset.id;
  });
}
