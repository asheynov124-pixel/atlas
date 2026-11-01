import { board, decision, image, items, materials, pair, pins, shopping, text } from '@/book/slots';
import type { Chapter, Slot, Spread, TemplateId } from '@/book/types';
import { newId } from '@/book/ids';

/** Default slots for a template, named after the chapter so placeholders read well. */
export function defaultSlots(template: TemplateId, chapter: Pick<Chapter, 'title'>): Record<string, Slot> {
  const room = chapter.title.toUpperCase();
  switch (template) {
    case 'cover':
      return { hero: image(`${room} — COVER`), title: text('Title'), subtitle: text(''), address: text('') };
    case 'endpapers':
      return { dedication: text('') };
    case 'contents':
      return { title: text('Contents') };
    case 'opener':
      return { hero: image(`${room} — OPENING PLATE`) };
    case 'essay':
      return { title: text(''), body: text(''), quote: text(''), aside: image(`${room} — DETAIL`) };
    case 'fullbleed':
      return { image: image(`${room} — PLATE`), caption: text('') };
    case 'beforeafter':
      return { pair: pair(`${room} — BEFORE`, `${room} — AFTER`), caption: text('') };
    case 'gallery':
      return { title: text(''), items: items([]) };
    case 'moodboard':
      return { title: text(''), board: board([]) };
    case 'pins':
      return { title: text(''), pins: pins(`${room} — PLAN`, []) };
    case 'palette':
      return { title: text(''), materials: materials([]) };
    case 'decision':
      return { title: text(''), decision: decision() };
    case 'shopping':
      return { title: text(''), shopping: shopping([]) };
    case 'stilltodecide':
      return { title: text('Still to Decide') };
  }
}

export function newSpread(template: TemplateId, chapter: Pick<Chapter, 'title'>): Spread {
  return { id: newId('sp'), template, slots: defaultSlots(template, chapter), notes: [] };
}

/**
 * Change a spread's template, carrying content over where slots match by
 * key and kind, then by kind alone (so a hero becomes a plate, a title stays
 * a title).
 */
export function retemplate(spread: Spread, template: TemplateId, chapter: Pick<Chapter, 'title'>): Spread {
  const next = defaultSlots(template, chapter);
  const old = spread.slots;
  const used = new Set<string>();
  for (const [key, slot] of Object.entries(next)) {
    const same = old[key];
    if (same && same.kind === slot.kind) {
      next[key] = structuredClone(same);
      used.add(key);
    }
  }
  for (const [key, slot] of Object.entries(next)) {
    if (used.has(key)) continue;
    const match = Object.entries(old).find(([k, s]) => !used.has(k) && s.kind === slot.kind && (slot.kind !== 'text' || key !== 'title' || k === 'title'));
    if (match) {
      next[key] = structuredClone(match[1]);
      used.add(match[0]);
    }
  }
  // a lone image can become one half of a pair
  const pairKey = Object.entries(next).find(([, s]) => s.kind === 'pair')?.[0];
  if (pairKey) {
    const p = next[pairKey];
    if (p.kind === 'pair' && !p.before.assetId) {
      const img = Object.entries(old).find(([k, s]) => !used.has(k) && s.kind === 'image' && s.assetId);
      if (img && img[1].kind === 'image') {
        p.before = structuredClone(img[1]);
        used.add(img[0]);
      }
    }
  }
  return { ...spread, template, slots: next };
}
