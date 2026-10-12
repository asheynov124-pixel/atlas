export interface StudioState {
  room: string;
  wall: string;
  floor: string;
  frame: string;
  finish: string;
  metal: string;
  cloth: string;
  ceiling: string;
  trim: string;
  /** 0 (cool north day) → 100 (candle). */
  warmth: number;
  /** Hour of day 0–23 for daylight simulation. */
  hour: number;
  pieces: string[];
}

export type SaveKind = 'look' | 'idea' | 'room' | 'piece' | 'lesson' | 'palette';

export interface SaveItem {
  id: string;
  kind: SaveKind;
  title: string;
  subtitle?: string;
  body?: string;
  image?: string;
  studio?: Partial<StudioState>;
  catalogId?: string;
  palette?: string[];
  board?: string;
  at: number;
}

export interface Custom {
  id: string;
  kind: 'idea' | 'color' | 'option';
  text: string;
  hex?: string;
}

// ---------- My House ----------

export type ItemStatus = 'idea' | 'shortlist' | 'approved' | 'ordered' | 'delivered' | 'installed' | 'returned';
export const ITEM_STATUSES: ItemStatus[] = ['idea', 'shortlist', 'approved', 'ordered', 'delivered', 'installed', 'returned'];
export const STATUS_LABEL: Record<ItemStatus, string> = {
  idea: 'Idea', shortlist: 'Shortlist', approved: 'Approved', ordered: 'Ordered', delivered: 'Delivered', installed: 'Installed', returned: 'Returned',
};

export type ItemCategory = 'furniture' | 'lighting' | 'textiles' | 'art' | 'surfaces' | 'plumbing' | 'appliances' | 'hardware' | 'millwork' | 'labor' | 'other';
export const ITEM_CATEGORIES: ItemCategory[] = ['furniture', 'lighting', 'textiles', 'art', 'surfaces', 'plumbing', 'appliances', 'hardware', 'millwork', 'labor', 'other'];

export interface HouseItem {
  id: string;
  roomId: string;
  name: string;
  category: ItemCategory;
  qty: number;
  unit: string;
  /** Unit price in USD. */
  price: number;
  /** Optional low/high estimate if price unknown. */
  estimate?: [number, number];
  retailer?: string;
  url?: string;
  sku?: string;
  status: ItemStatus;
  notes?: string;
  /** Link to a catalog item, for images and shop links. */
  catalogId?: string;
  /** Link to a placed piece on the plan. */
  pieceId?: string;
  /** Lead time in weeks. */
  lead?: number;
  orderedAt?: number;
  /** Dimensions in inches, W×D×H. */
  dims?: [number, number, number];
  /** Whether this line was generated from a surface takeoff. */
  surface?: SurfaceKey;
  taxable?: boolean;
  shipping?: number;
  priority?: 'must' | 'want' | 'later';
  at: number;
}

export type SurfaceKey = 'walls' | 'ceiling' | 'floor' | 'trim' | 'tile' | 'counters' | 'windows';

export interface Opening {
  id: string;
  kind: 'door' | 'window' | 'opening';
  /** Which wall: 0 = north (top), 1 = east, 2 = south, 3 = west. */
  wall: 0 | 1 | 2 | 3;
  /** Offset from the wall's left end, in feet. */
  offset: number;
  /** Width in feet. */
  width: number;
  /** Height in feet. */
  height: number;
  /** Sill height for windows, feet. */
  sill?: number;
}

export interface Placed {
  id: string;
  pieceId: string;
  /** Position of the piece center in feet from the room's top-left corner. */
  x: number;
  z: number;
  /** Rotation in degrees. */
  rot: number;
  /** Override footprint in inches. */
  w?: number;
  d?: number;
  h?: number;
  label?: string;
}

export interface Surfaces {
  wall: string;
  finish: string;
  ceiling: string;
  ceilingColor: string;
  floor: string;
  trim: string;
  trimColor: string;
  counters?: string;
  counterSqft?: number;
  tile?: string;
  tileSqft?: number;
  windows?: string;
  hardware?: string;
  metal: string;
  cloth: string;
  /** Fraction of wall area that is tiled or paneled, 0–1. */
  wainscot?: number;
}

export interface HouseRoom {
  id: string;
  name: string;
  type: string;
  /** Feet. */
  length: number;
  width: number;
  height: number;
  /** Compass facing of the main window: N E S W. */
  facing: 'N' | 'E' | 'S' | 'W';
  openings: Opening[];
  placed: Placed[];
  surfaces: Surfaces;
  notes?: string;
  budget?: number;
  /** Waste factor for materials, as a fraction. */
  waste: number;
  warmth: number;
  hour: number;
  at: number;
}

export interface HouseSettings {
  name: string;
  taxRate: number;
  contingency: number;
  shippingDefault: number;
  currency: string;
  totalBudget?: number;
  moveIn?: string;
}

export interface Board {
  id: string;
  name: string;
}
