import type { Custom, StudioState } from './types';
import { parseIdea } from './parse';
import { CATALOG, catalogForPiece, type CatalogItem } from '../data/catalog';
import { PAINTS, type Paint } from '../data/palette';
import { LESSONS, type Lesson } from '../data/lessons';
import { nearestPaint } from './color';
import type { Note } from './critique';

export type NoteStatus =
  | { kind: 'walls' } | { kind: 'cloth' } | { kind: 'palette' }
  | { kind: 'built'; what: string[] } | { kind: 'note' };

const LABEL: Record<string, string> = {
  floor: 'floor', finish: 'wall finish', metal: 'metal', frame: 'casing', cloth: 'cloth', warmth: 'light', hour: 'time of day', pieces: 'pieces',
};

/** Where a note lives right now: on the walls, on the cloth, built into the model, or kept as words. */
export function noteStatus(c: Custom, s: StudioState): NoteStatus {
  if (c.kind === 'color') {
    if (s.wall === c.id) return { kind: 'walls' };
    if (s.cloth === c.id) return { kind: 'cloth' };
    return { kind: 'palette' };
  }
  const p = parseIdea(c.text);
  const what: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (k === 'pieces') { const on = (v as string[]).filter((id) => s.pieces.includes(id)); if (on.length) what.push(`${on.length === 1 ? 'piece' : 'pieces'}: ${on.join(', ')}`); }
    else if ((s as unknown as Record<string, unknown>)[k] === v) what.push(LABEL[k] ?? k);
  }
  return what.length ? { kind: 'built', what } : { kind: 'note' };
}

export function statusLine(st: NoteStatus): string {
  switch (st.kind) {
    case 'walls': return 'On the walls';
    case 'cloth': return 'On the cloth';
    case 'palette': return 'In your palette';
    case 'built': return `In the model: ${st.what.join(' · ')}`;
    case 'note': return 'Kept as a note. The model cannot build this; the Ideas page will honor it.';
  }
}

/** Catalog pieces and paints that answer what she wrote. */
export function notesToCatalog(customs: Custom[]): { item: CatalogItem; because: string }[] {
  const out: { item: CatalogItem; because: string }[] = [];
  const seen = new Set<string>();
  const add = (item: CatalogItem | undefined, because: string) => { if (item && !seen.has(item.id)) { seen.add(item.id); out.push({ item, because }); } };
  for (const c of customs) {
    if (c.kind === 'color') continue;
    const p = parseIdea(c.text);
    for (const id of p.pieces ?? []) for (const item of catalogForPiece(id).slice(0, 2)) add(item, c.text);
    if (p.metal) for (const item of CATALOG.filter((x) => x.tags.includes('brass') || x.materials.some((m) => m.includes(p.metal === 'blackened' ? 'steel' : p.metal === 'nickel' ? 'nickel' : 'brass'))).slice(0, 2)) add(item, c.text);
    if (p.finish === 'limewash' || p.finish === 'roman-clay') add(CATALOG.find((x) => x.id === 'limewash-paint'), c.text);
    if (p.floor) add(CATALOG.find((x) => (p.floor === 'walnut' ? x.id === 'walnut-table' : p.floor === 'limestone' ? x.id === 'limestone' : p.floor === 'terracotta' ? x.id === 'terracotta-tile' : x.id === 'oak-flooring')), c.text);
    // plain word match on names and tags
    const words = c.text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    for (const item of CATALOG) {
      const hay = `${item.name} ${item.tags.join(' ')} ${item.materials.join(' ')}`.toLowerCase();
      if (words.some((w) => hay.includes(w))) add(item, c.text);
      if (out.length > 12) break;
    }
  }
  return out.slice(0, 12);
}

export function notesToPaints(customs: Custom[]): { paint: Paint; because: string }[] {
  const out: { paint: Paint; because: string }[] = [];
  for (const c of customs) {
    if (c.kind !== 'color' || !c.hex) continue;
    const p = nearestPaint(c.hex);
    if (!out.some((x) => x.paint.id === p.id)) out.push({ paint: p, because: c.text });
  }
  return out.slice(0, 4);
}

/** The lesson the room is asking for, from what the critique found. */
export function suggestLesson(notes: Note[], s: StudioState): Lesson | undefined {
  const t = notes.filter((n) => n.level !== 'good').map((n) => n.title.toLowerCase()).join(' ');
  const pick = (id: string) => LESSONS.find((l) => l.id === id);
  if (/nickel|chrome|brass/.test(t)) return pick('metals');
  if (/dark|deep|jewel|slate/.test(t)) return pick('quiet-contrast');
  if (/light|lamp/.test(t)) return pick('light-layers');
  if (/rug/.test(t)) return pick('rugs');
  if (/smooth|texture/.test(t)) return pick('texture-first');
  if (/frame|casing|drywall/.test(t)) return pick('framing');
  if (/sofa|seats|large pieces|loveseat/.test(t)) return pick('scale');
  if (/ceiling/.test(t)) return pick('color-in-the-room');
  if (s.room === 'kitchen') return pick('kitchen');
  if (s.room === 'bath') return pick('bath');
  return pick(PAINTS.some((p) => p.id === s.wall) ? 'color-in-the-room' : 'last-things');
}
