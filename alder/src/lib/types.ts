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
  /** Warranty length in months from install. */
  warrantyMonths?: number;
  /** ISO date installed. */
  installedAt?: string;
  /** Care interval in months, with what to do. */
  careEvery?: number;
  careNote?: string;
  lastCare?: string;
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
  phase?: RoomPhase;
  versions?: RoomVersion[];
  scenes?: Scene[];
  at: number;
}

export type RoomPhase = 'concept' | 'design' | 'permitting' | 'in-progress' | 'done';
export const ROOM_PHASES: RoomPhase[] = ['concept', 'design', 'permitting', 'in-progress', 'done'];
export const PHASE_LABEL: Record<RoomPhase, string> = { concept: 'Concept', design: 'Design', permitting: 'Permitting', 'in-progress': 'In progress', done: 'Done' };

/** A recorded state of a room: as found, as it is, as it will be. */
export interface RoomVersion {
  id: string;
  label: string;
  kind: 'past' | 'current' | 'planned';
  date: string;
  note?: string;
  snapshot: { length: number; width: number; height: number; surfaces: Surfaces; placed: Placed[]; openings: Opening[] };
  at: number;
}

/** A lighting scene: which pieces are on, how warm, what hour. */
export interface Scene {
  id: string;
  name: string;
  hour: number;
  warmth: number;
  /** Overall lamp level 0–1. */
  level: number;
  /** Placed ids that are off in this scene. */
  off: string[];
  note?: string;
}

// ---------- Decisions, seats, votes ----------

export type DecisionStatus = 'open' | 'decided' | 'hold' | 'watch';
export const DECISION_STATUSES: DecisionStatus[] = ['open', 'decided', 'hold', 'watch'];
export const DECISION_LABEL: Record<DecisionStatus, string> = { open: 'Open', decided: 'Decided', hold: 'Hold', watch: 'Watch' };
export type Vote = 'love' | 'ok' | 'pass';

export interface DecisionOption { id: string; label: string; note?: string; cost?: number }

export interface Decision {
  id: string;
  roomId: string;
  title: string;
  options: DecisionOption[];
  owner: string;
  due?: string;
  status: DecisionStatus;
  chosen?: string;
  /** seatId → optionId → vote */
  votes: Record<string, Record<string, Vote>>;
  /** Why it is on hold, or what it blocks. */
  blocks?: string;
  note?: string;
  at: number;
}

export interface Seat { id: string; name: string; role: string; leans: string; note?: string }

export interface HistoryEntry { id: string; at: number; seatId?: string; text: string; roomId?: string; decisionId?: string }

// ---------- Lot ----------

export type LotFeatureKind = 'deck' | 'patio' | 'pool' | 'spa' | 'shed' | 'planting' | 'tree' | 'path' | 'fence' | 'driveway';
export interface LotFeature {
  id: string;
  kind: LotFeatureKind;
  label?: string;
  /** Feet from the lot's top-left (street is at the bottom). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Height above grade in feet, for decks, platforms and sheds. */
  height?: number;
  material?: string;
  /** Unit cost override, USD per sq ft. */
  cost?: number;
}
export interface Lot {
  width: number;
  depth: number;
  house: { x: number; y: number; w: number; h: number };
  setbacks: { front: number; rear: number; side: number };
  /** Maximum lot coverage allowed, as a fraction. */
  maxCoverage: number;
  /** Decks under this height (ft) may enter the rear setback by half, a common borough rule. */
  lowDeckHeight: number;
  features: LotFeature[];
  place?: string;
  notes?: string;
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
