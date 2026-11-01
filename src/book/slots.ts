import type {
  BoardSlot,
  DecisionSlot,
  Focal,
  ImageSlot,
  ItemsSlot,
  MaterialsSlot,
  PairSlot,
  PinsSlot,
  ShoppingSlot,
  Slot,
  TextSlot,
} from './types';

export const text = (html = ''): TextSlot => ({ kind: 'text', html });

export const image = (placeholder: string, opts: Partial<Omit<ImageSlot, 'kind'>> = {}): ImageSlot => ({
  kind: 'image',
  assetId: null,
  focal: { x: 0.5, y: 0.5 },
  caption: '',
  alt: '',
  credit: '',
  placeholder,
  ...opts,
});

export const items = (itemIds: string[] = []): ItemsSlot => ({ kind: 'items', itemIds });

export const board = (elements: BoardSlot['elements'] = []): BoardSlot => ({ kind: 'board', elements });

export const pins = (placeholder: string, list: PinsSlot['pins'] = []): PinsSlot => ({
  kind: 'pins',
  image: image(placeholder),
  pins: list,
});

export const pair = (before: string, after: string): PairSlot => ({
  kind: 'pair',
  before: image(before),
  after: image(after),
});

export const decision = (opts: Partial<Omit<DecisionSlot, 'kind'>> = {}): DecisionSlot => ({
  kind: 'decision',
  optionIds: [],
  chosenId: null,
  why: '',
  cost: null,
  status: 'thinking',
  date: null,
  ...opts,
});

export const shopping = (rows: ShoppingSlot['rows'] = []): ShoppingSlot => ({ kind: 'shopping', rows });

export const materials = (cards: MaterialsSlot['cards'] = []): MaterialsSlot => ({ kind: 'materials', cards });

export const clampFocal = (f: Focal): Focal => ({
  x: Math.min(1, Math.max(0, f.x)),
  y: Math.min(1, Math.max(0, f.y)),
});

export function isSlotKind<K extends Slot['kind']>(slot: Slot | undefined, kind: K): slot is Extract<Slot, { kind: K }> {
  return !!slot && slot.kind === kind;
}

/** Plain text of a text slot, for thumbnails, search and the contents page. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h\d|li|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
