/**
 * Domain model for Sixteen Bannehr.
 *
 * A Book is a sequence of Chapters; a Chapter is a sequence of Spreads; a
 * Spread is one Template plus a bag of named Slots. Items (products) and
 * Assets (images) live at book level and are referenced by id, so a vanity can
 * be a gallery tile, a decision option and a shopping row at once.
 */

export type Author = 'adi' | 'sonny';

export type TemplateId =
  | 'cover'
  | 'endpapers'
  | 'contents'
  | 'opener'
  | 'essay'
  | 'fullbleed'
  | 'beforeafter'
  | 'gallery'
  | 'moodboard'
  | 'pins'
  | 'palette'
  | 'decision'
  | 'shopping'
  | 'stilltodecide';

export interface Focal {
  /** 0..1 from the left edge */
  x: number;
  /** 0..1 from the top edge */
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
  caption: string;
  alt: string;
  credit: string;
  /** Small-caps label shown on the placeholder panel, e.g. "KITCHEN — RENDER, PENINSULA VIEW" */
  placeholder: string;
  /** Marked decorative: no alt is required and the image is aria-hidden. */
  decorative?: boolean;
}

export interface ItemsSlot {
  kind: 'items';
  itemIds: string[];
}

export type BoardElType = 'image' | 'swatch' | 'text' | 'note';

export interface BoardEl {
  id: string;
  type: BoardElType;
  /** Position and size in percent of the board (0..100) so boards reflow. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  assetId?: string | null;
  color?: string;
  text?: string;
  author?: Author;
  placeholder?: string;
}

export interface BoardSlot {
  kind: 'board';
  elements: BoardEl[];
}

export interface Pin {
  id: string;
  /** 0..1 */
  x: number;
  y: number;
  title: string;
  body: string;
  url?: string;
  itemId?: string | null;
}

export interface PinsSlot {
  kind: 'pins';
  image: ImageSlot;
  pins: Pin[];
}

export interface PairSlot {
  kind: 'pair';
  before: ImageSlot;
  after: ImageSlot;
}

export type DecisionStatus = 'thinking' | 'decided' | 'ordered' | 'installed';

export interface DecisionSlot {
  kind: 'decision';
  optionIds: string[];
  chosenId: string | null;
  why: string;
  cost: number | null;
  status: DecisionStatus;
  /** ISO date */
  date: string | null;
}

export type ShoppingStatus = 'needed' | 'ordered' | 'received' | 'installed';

export interface ShoppingRow {
  id: string;
  name: string;
  itemId?: string | null;
  status: ShoppingStatus;
  price: number | null;
  retailer: string;
  url: string;
  note: string;
}

export interface ShoppingSlot {
  kind: 'shopping';
  rows: ShoppingRow[];
}

export type CleanConstruction = 'solid-wood' | 'composite' | 'stone' | 'metal' | 'other' | 'unknown' | 'n/a';
export type CleanFormaldehyde = 'carb2' | 'tsca-vi' | 'naf' | 'ulef' | 'unknown' | 'n/a';
export type CleanVoc = 'zero' | 'low' | 'standard' | 'unknown' | 'n/a';
export type CleanYesNo = 'yes' | 'no' | 'unknown' | 'n/a';

/**
 * Clean materials panel. Every field is user-entered; "unknown" is the
 * default. The app never invents compliance claims.
 */
export interface CleanFields {
  construction: CleanConstruction;
  formaldehyde: CleanFormaldehyde;
  voc: CleanVoc;
  pvcFree: CleanYesNo;
  leadFree: CleanYesNo;
  notes: string;
}

export interface MaterialCard {
  id: string;
  name: string;
  finish: string;
  maker: string;
  url: string;
  pricePerUnit: number | null;
  unit: string;
  /** Either a hex colour swatch or an asset id for a photographed sample. */
  swatchColor: string | null;
  assetId: string | null;
  clean: CleanFields;
}

export interface MaterialsSlot {
  kind: 'materials';
  cards: MaterialCard[];
}

export type Slot =
  | TextSlot
  | ImageSlot
  | ItemsSlot
  | BoardSlot
  | PinsSlot
  | PairSlot
  | DecisionSlot
  | ShoppingSlot
  | MaterialsSlot;

export type SlotKind = Slot['kind'];

export type ItemStatus = 'considering' | 'shortlist' | 'chosen' | 'rejected';

export interface Item {
  id: string;
  name: string;
  brand: string;
  price: number | null;
  currency: string;
  url: string;
  assetId: string | null;
  focal?: Focal;
  placeholder: string;
  tags: string[];
  status: ItemStatus;
  favorites: Record<Author, boolean>;
  clean: CleanFields;
  notes: string;
  archived?: boolean;
}

export interface Note {
  id: string;
  author: Author;
  text: string;
  /** Percent of the page (0..100). */
  x: number;
  y: number;
  side: 'left' | 'right';
  resolved: boolean;
  createdAt: string;
}

export interface Spread {
  id: string;
  template: TemplateId;
  slots: Record<string, Slot>;
  notes: Note[];
}

export interface Chapter {
  id: string;
  /** Folder name under content/photos/ */
  slug: string;
  /** null for front matter, prologue and epilogue */
  number: number | null;
  title: string;
  kicker: string;
  epigraph: string;
  /** Theme token name used for placeholders and numerals. */
  accent: ThemeColorKey;
  spreads: Spread[];
  /** Front matter is hidden from Contents. */
  hidden?: boolean;
}

export type ThemeColorKey = 'sage' | 'olive' | 'oak' | 'clay' | 'ink' | 'muted';

export interface Theme {
  paper: string;
  ink: string;
  muted: string;
  sage: string;
  olive: string;
  oak: string;
  clay: string;
  hairline: string;
  night: {
    paper: string;
    ink: string;
    muted: string;
    hairline: string;
  };
}

export type AssetSource = 'idb' | 'static';

export interface AssetVariant {
  w: number;
  url: string;
}

export interface Asset {
  id: string;
  source: AssetSource;
  width: number;
  height: number;
  mime: string;
  createdAt: string;
  name?: string;
  /** Static assets: pre-built variants and the untouched original. */
  variants?: AssetVariant[];
  original?: string;
}

export interface Book {
  id: string;
  schemaVersion: number;
  title: string;
  subtitle: string;
  address: string;
  dedication: string;
  theme: Theme;
  chapters: Chapter[];
  items: Record<string, Item>;
  assets: Record<string, Asset>;
  /** Manifest photo ids already placed once by the photo filler. */
  appliedPhotos: string[];
  updatedAt: string;
}

export interface EditionMeta {
  id: string;
  name: string;
  createdAt: string;
  spreadCount: number;
}

export const SCHEMA_VERSION = 1;

export const emptyClean = (): CleanFields => ({
  construction: 'unknown',
  formaldehyde: 'unknown',
  voc: 'unknown',
  pvcFree: 'unknown',
  leadFree: 'unknown',
  notes: '',
});

export const DEFAULT_THEME: Theme = {
  paper: '#F5F1EA',
  ink: '#1F1D1A',
  muted: '#6F6A63',
  sage: '#8A9A7B',
  olive: '#5E6B4A',
  oak: '#B08B5E',
  clay: '#B0452A',
  hairline: '#D9D2C7',
  night: {
    paper: '#14130F',
    ink: '#EDE8DF',
    muted: '#A49C90',
    hairline: '#2C2923',
  },
};
