import type {
  CleanFields,
  ImageSlot,
  Item,
  ItemKind,
  Slot,
  SlotKind,
  Spread,
  TemplateId,
} from './types';

export interface SlotDef {
  key: string;
  kind: SlotKind;
}

export interface TemplateDef {
  id: TemplateId;
  name: string;
  /** One line for the template picker. */
  blurb: string;
  slots: SlotDef[];
  /** Built from the rest of the book; nothing to fill in. */
  auto?: boolean;
  /** Front matter and auto pages are not offered when adding a spread. */
  pickable: boolean;
}

const text = (key: string): SlotDef => ({ key, kind: 'text' });
const image = (key: string): SlotDef => ({ key, kind: 'image' });

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  cover: {
    id: 'cover',
    name: 'Cover',
    blurb: 'Title, subtitle and one hero image.',
    slots: [image('image')],
    pickable: false,
  },
  dedication: {
    id: 'dedication',
    name: 'Dedication',
    blurb: 'Sage endpapers and a line for Sonny.',
    slots: [],
    pickable: false,
  },
  contents: {
    id: 'contents',
    name: 'Contents',
    blurb: 'Built from the chapters.',
    slots: [],
    auto: true,
    pickable: false,
  },
  opener: {
    id: 'opener',
    name: 'Chapter opener',
    blurb: 'One image across both pages, the number, title and epigraph.',
    slots: [image('image')],
    pickable: true,
  },
  essay: {
    id: 'essay',
    name: 'Essay',
    blurb: 'Text with a drop cap, a pull quote and a small image in the margin.',
    slots: [text('kicker'), text('title'), text('body'), text('pull'), image('image')],
    pickable: true,
  },
  fullbleed: {
    id: 'fullbleed',
    name: 'Full bleed',
    blurb: 'One image across the spread, caption in the margin.',
    slots: [image('image')],
    pickable: true,
  },
  beforeAfter: {
    id: 'beforeAfter',
    name: 'Before / after',
    blurb: 'Two images with a comparison slider.',
    slots: [text('title'), image('image'), image('image2'), text('body')],
    pickable: true,
  },
  gallery: {
    id: 'gallery',
    name: 'Options gallery',
    blurb: 'A grid of options to favourite and compare.',
    slots: [text('title'), text('body'), { key: 'items', kind: 'items' }],
    pickable: true,
  },
  moodboard: {
    id: 'moodboard',
    name: 'Mood board',
    blurb: 'A free canvas of images, swatches and notes.',
    slots: [text('title'), { key: 'board', kind: 'board' }],
    pickable: true,
  },
  plan: {
    id: 'plan',
    name: 'Plan + pins',
    blurb: 'A floor plan or render with numbered notes.',
    slots: [text('title'), text('body'), { key: 'plan', kind: 'pins' }],
    pickable: true,
  },
  palette: {
    id: 'palette',
    name: 'Palette & materials',
    blurb: 'Swatches and material cards with the Clean materials panel.',
    slots: [text('title'), text('body'), { key: 'swatches', kind: 'swatches' }, { key: 'items', kind: 'items' }],
    pickable: true,
  },
  decision: {
    id: 'decision',
    name: 'Decision',
    blurb: 'The options, the one we chose, and why.',
    slots: [text('title'), { key: 'items', kind: 'items' }, text('body'), { key: 'meta', kind: 'meta' }],
    pickable: true,
  },
  shopping: {
    id: 'shopping',
    name: 'Shopping list',
    blurb: 'What to buy, where, and the running total.',
    slots: [text('title'), { key: 'items', kind: 'items' }],
    pickable: true,
  },
  library: {
    id: 'library',
    name: 'Materials library',
    blurb: 'Every material in the book, gathered.',
    slots: [text('title'), text('body')],
    auto: true,
    pickable: true,
  },
  stillToDecide: {
    id: 'stillToDecide',
    name: 'Still to decide',
    blurb: 'Open decisions and unordered items, gathered.',
    slots: [text('title'), text('body')],
    auto: true,
    pickable: true,
  },
  title: {
    id: 'title',
    name: 'Title page',
    blurb: 'A quiet spread with a title, left for later.',
    slots: [text('title'), text('body')],
    pickable: true,
  },
};

export const PICKABLE_TEMPLATES = Object.values(TEMPLATES).filter((t) => t.pickable);

export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}-${raw}` : raw;
}

export function emptyImage(label = '', overrides: Partial<ImageSlot> = {}): ImageSlot {
  return {
    kind: 'image',
    assetId: null,
    focal: { x: 50, y: 50 },
    label,
    caption: '',
    alt: '',
    credit: '',
    decorative: false,
    ...overrides,
  };
}

export function emptySlot(kind: SlotKind): Slot {
  switch (kind) {
    case 'text':
      return { kind: 'text', html: '' };
    case 'image':
      return emptyImage();
    case 'items':
      return { kind: 'items', itemIds: [] };
    case 'board':
      return { kind: 'board', elements: [] };
    case 'pins':
      return { kind: 'pins', assetId: null, label: '', alt: '', pins: [] };
    case 'meta':
      return { kind: 'meta', values: {} };
    case 'swatches':
      return { kind: 'swatches', swatches: [] };
  }
}

export function createSpread(template: TemplateId, slots: Record<string, Slot> = {}): Spread {
  const def = TEMPLATES[template];
  const filled: Record<string, Slot> = {};
  for (const s of def.slots) filled[s.key] = slots[s.key] ?? emptySlot(s.kind);
  return { id: uid('sp'), template, slots: { ...slots, ...filled }, notes: [] };
}

/**
 * Switch a spread to another template. Slots whose key and kind match carry over;
 * slots the new template does not use are kept (hidden), so switching back restores them.
 */
export function changeTemplate(spread: Spread, template: TemplateId): Spread {
  const def = TEMPLATES[template];
  const slots: Record<string, Slot> = { ...spread.slots };
  for (const s of def.slots) {
    const existing = slots[s.key];
    if (!existing || existing.kind !== s.kind) slots[s.key] = emptySlot(s.kind);
  }
  return { ...spread, template, slots };
}

export const EMPTY_CLEAN: CleanFields = {
  core: '',
  formaldehyde: '',
  voc: '',
  pvc: '',
  leadFree: '',
  notes: '',
};

export function createItem(partial: Partial<Item> & { name: string }, kind: ItemKind = 'product'): Item {
  return {
    id: uid('it'),
    kind,
    brand: '',
    price: null,
    currency: 'USD',
    unit: '',
    finish: '',
    url: '',
    retailer: '',
    assetId: null,
    focal: { x: 50, y: 50 },
    label: '',
    tags: [],
    status: 'thinking',
    favorites: { adi: false, sonny: false },
    clean: { ...EMPTY_CLEAN },
    notes: '',
    ...partial,
  };
}
