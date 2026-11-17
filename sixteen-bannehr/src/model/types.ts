// The book is plain JSON: everything here must survive JSON.stringify, a zip, and a
// trip to another phone. Blobs never live in these types; assets are referenced by id.

export type Author = 'adi' | 'sonny';

export const AUTHORS: Record<Author, { name: string; initial: string }> = {
  adi: { name: 'Adi', initial: 'A' },
  sonny: { name: 'Sonny', initial: 'S' },
};

export type TemplateId =
  | 'cover'
  | 'dedication'
  | 'contents'
  | 'opener'
  | 'essay'
  | 'fullbleed'
  | 'beforeAfter'
  | 'gallery'
  | 'moodboard'
  | 'plan'
  | 'palette'
  | 'decision'
  | 'shopping'
  | 'library'
  | 'stillToDecide'
  | 'title';

/** Percentages, 0–100, measured from the top-left of the image. */
export interface Focal {
  x: number;
  y: number;
}

export interface TextSlot {
  kind: 'text';
  html: string;
}

export interface ImageSlot {
  kind: 'image';
  assetId: string | null;
  focal: Focal;
  /** Names the photo that belongs here while the slot is empty. */
  label: string;
  caption: string;
  alt: string;
  credit: string;
  decorative: boolean;
}

export interface ItemsSlot {
  kind: 'items';
  itemIds: string[];
}

export type BoardElType = 'image' | 'swatch' | 'text' | 'note';

export interface BoardEl {
  id: string;
  type: BoardElType;
  /** Position and size as percentages of the board, so a board reflows on any screen. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  z: number;
  assetId?: string | null;
  focal?: Focal;
  label?: string;
  hex?: string;
  text?: string;
  author?: Author;
}

export interface BoardSlot {
  kind: 'board';
  elements: BoardEl[];
}

export interface Pin {
  id: string;
  x: number;
  y: number;
  title: string;
  text: string;
  url: string;
  itemId: string | null;
}

export interface PinsSlot {
  kind: 'pins';
  assetId: string | null;
  label: string;
  alt: string;
  pins: Pin[];
}

export interface MetaSlot {
  kind: 'meta';
  values: Record<string, string>;
}

export interface Swatch {
  id: string;
  name: string;
  hex: string;
  note: string;
}

export interface SwatchesSlot {
  kind: 'swatches';
  swatches: Swatch[];
}

export type Slot = TextSlot | ImageSlot | ItemsSlot | BoardSlot | PinsSlot | MetaSlot | SwatchesSlot;
export type SlotKind = Slot['kind'];

export type PageSide = 'verso' | 'recto';

export interface Note {
  id: string;
  author: Author;
  text: string;
  page: PageSide;
  /** Percent of the page. */
  x: number;
  y: number;
  resolved: boolean;
  createdAt: string;
}

export interface Spread {
  id: string;
  template: TemplateId;
  slots: Record<string, Slot>;
  notes: Note[];
}

export type ChapterKind = 'front' | 'prologue' | 'chapter' | 'epilogue';

export interface Chapter {
  id: string;
  /** Folder name under content/photos/ for `npm run import-photos`. */
  slug: string;
  kind: ChapterKind;
  title: string;
  kicker: string;
  epigraph: string;
  /** Placeholder duotone and accent for this chapter. */
  tone: string;
  spreads: Spread[];
}

export type DecisionStatus = 'thinking' | 'decided' | 'ordered' | 'installed';

export const DECISION_STATUSES: { id: DecisionStatus; label: string }[] = [
  { id: 'thinking', label: 'Thinking' },
  { id: 'decided', label: 'Decided' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'installed', label: 'Installed' },
];

export type ItemStatus = 'thinking' | 'to-buy' | 'ordered' | 'arrived' | 'installed';

export const ITEM_STATUSES: { id: ItemStatus; label: string }[] = [
  { id: 'thinking', label: 'Thinking' },
  { id: 'to-buy', label: 'To buy' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'arrived', label: 'Arrived' },
  { id: 'installed', label: 'Installed' },
];

/**
 * Clean materials. Every field starts blank ("not yet checked"); the app never fills
 * these in on anyone's behalf.
 */
export interface CleanFields {
  core: '' | 'solid' | 'composite' | 'na';
  formaldehyde: '' | 'carb2' | 'tsca6' | 'carb2-tsca6' | 'none' | 'na';
  voc: '' | 'zero' | 'low' | 'standard' | 'na';
  pvc: '' | 'no' | 'yes' | 'na';
  leadFree: '' | 'yes' | 'no' | 'na';
  notes: string;
}

export type ItemKind = 'product' | 'material';

export interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  brand: string;
  price: number | null;
  currency: string;
  /** "each", "per sq ft"… */
  unit: string;
  finish: string;
  url: string;
  retailer: string;
  assetId: string | null;
  focal: Focal;
  label: string;
  tags: string[];
  status: ItemStatus;
  favorites: Record<Author, boolean>;
  clean: CleanFields;
  notes: string;
}

export interface ThemeColors {
  paper: string;
  ink: string;
  muted: string;
  sage: string;
  olive: string;
  oak: string;
  clay: string;
  hairline: string;
}

export interface Theme {
  day: ThemeColors;
  night: ThemeColors;
}

export interface Book {
  id: string;
  schema: 1;
  title: string;
  subtitle: string;
  address: string;
  dedication: string;
  theme: Theme;
  chapters: Chapter[];
  items: Record<string, Item>;
  /** Bundled photos already placed in a slot, so a removed photo is not placed again. */
  placedBundled: string[];
  updatedAt: string;
}

export interface AssetMeta {
  id: string;
  source: 'blob' | 'bundled';
  width: number;
  height: number;
  mime: string;
  name: string;
  /** Widths of the WebP/JPEG variants that exist, ascending. */
  variants: number[];
  createdAt: string;
  /** Bundled assets only: URL of each variant, keyed by width. */
  urls?: Record<number, string>;
}

export interface Edition {
  id: string;
  name: string;
  author: Author | null;
  createdAt: string;
  book: Book;
}

export type EditionSummary = Omit<Edition, 'book'>;
