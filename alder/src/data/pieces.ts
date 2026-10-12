export type PieceGroup = 'Seating' | 'Tables' | 'Light' | 'Cloth & art' | 'Kitchen & bath' | 'Storage' | 'Outdoor' | 'Smart';
export type Shape = 'box' | 'sofa' | 'chair' | 'table' | 'bed' | 'lamp-floor' | 'lamp-table' | 'pendant' | 'rug' | 'art' | 'curtains' | 'plant' | 'shelves' | 'tub' | 'vanity' | 'range' | 'island' | 'bench' | 'stool' | 'sideboard' | 'desk' | 'mirror' | 'sconce' | 'dresser' | 'bookcase';

export interface Piece {
  id: string;
  name: string;
  group: PieceGroup;
  shape: Shape;
  /** Default footprint in inches: width (x), depth (z), height (y). */
  w: number;
  d: number;
  h: number;
  /** Typical price range new, USD. */
  price: [number, number];
  /** Clearance guidance in inches. */
  clearance?: string;
  note?: string;
  /** Wall-mounted pieces sit against a wall in the plan. */
  wall?: boolean;
  /** Ceiling-mounted pieces hang. */
  ceiling?: boolean;
  /** Radius of reach in feet, for mesh nodes and sensors. */
  reach?: number;
  /** Field of view in degrees, for cameras. */
  fov?: number;
  /** Gives light in a scene. */
  lamp?: boolean;
}

export const PIECES: Piece[] = [
  { id: 'sofa', name: 'Sofa', group: 'Seating', shape: 'sofa', w: 84, d: 38, h: 32, price: [1200, 4500], clearance: '30–36" walkway in front; 18" to the coffee table.', note: 'Buy the largest one the walkway allows.' },
  { id: 'sectional', name: 'Sectional', group: 'Seating', shape: 'sofa', w: 110, d: 90, h: 32, price: [2200, 7000], clearance: 'Measure the door and the stair landing first.' },
  { id: 'loveseat', name: 'Loveseat', group: 'Seating', shape: 'sofa', w: 62, d: 36, h: 32, price: [800, 2800], note: 'Rarely the right answer. A large chair is usually better.' },
  { id: 'chair', name: 'Lounge chair', group: 'Seating', shape: 'chair', w: 32, d: 34, h: 30, price: [500, 2200], note: 'One, not a pair, pulled toward the coffee table.' },
  { id: 'armchair-pair', name: 'Pair of armchairs', group: 'Seating', shape: 'chair', w: 30, d: 32, h: 30, price: [900, 3600], note: 'Across from the sofa, 8–10 feet apart.' },
  { id: 'bench', name: 'Bench', group: 'Seating', shape: 'bench', w: 54, d: 16, h: 18, price: [300, 1400] },
  { id: 'bed', name: 'Bed, queen', group: 'Seating', shape: 'bed', w: 64, d: 86, h: 48, price: [900, 4000], clearance: '24" on each side, 36" at the foot.' },
  { id: 'bed-king', name: 'Bed, king', group: 'Seating', shape: 'bed', w: 80, d: 86, h: 48, price: [1200, 5000], clearance: '24" on each side, 36" at the foot.' },
  { id: 'stools', name: 'Counter stools (3)', group: 'Seating', shape: 'stool', w: 18, d: 18, h: 26, price: [450, 1800], clearance: '24" per stool along the island.' },
  { id: 'dining-chairs', name: 'Dining chairs (6)', group: 'Seating', shape: 'chair', w: 19, d: 21, h: 32, price: [1200, 4200], note: 'Spend here if people sit for an hour.' },
  { id: 'coffee', name: 'Coffee table', group: 'Tables', shape: 'table', w: 48, d: 24, h: 16, price: [400, 1800], clearance: '18" from the sofa. Oval if the room is a walk-through.' },
  { id: 'side-table', name: 'Side table', group: 'Tables', shape: 'table', w: 20, d: 20, h: 24, price: [150, 900] },
  { id: 'dining', name: 'Dining table', group: 'Tables', shape: 'table', w: 84, d: 40, h: 30, price: [1200, 4500], clearance: '36" minimum to walls so chairs pull out; 42–48" is comfortable.' },
  { id: 'round-dining', name: 'Round dining table', group: 'Tables', shape: 'table', w: 54, d: 54, h: 30, price: [1000, 4000], clearance: 'Seats 5–6. 36" all around.' },
  { id: 'island', name: 'Kitchen island', group: 'Kitchen & bath', shape: 'island', w: 84, d: 42, h: 36, price: [3000, 12000], clearance: '42" aisles; 48" if two cooks. 12" overhang for stools.' },
  { id: 'desk', name: 'Desk', group: 'Tables', shape: 'desk', w: 60, d: 28, h: 30, price: [500, 2000] },
  { id: 'console', name: 'Console table', group: 'Tables', shape: 'sideboard', w: 54, d: 14, h: 32, price: [400, 1800], wall: true },
  { id: 'sideboard', name: 'Sideboard', group: 'Storage', shape: 'sideboard', w: 72, d: 18, h: 32, price: [1200, 3800], wall: true },
  { id: 'dresser', name: 'Dresser', group: 'Storage', shape: 'dresser', w: 60, d: 20, h: 34, price: [900, 3500], wall: true },
  { id: 'nightstands', name: 'Nightstands (2)', group: 'Storage', shape: 'dresser', w: 24, d: 18, h: 26, price: [400, 1800], wall: true },
  { id: 'bookcase', name: 'Bookcase', group: 'Storage', shape: 'bookcase', w: 36, d: 14, h: 84, price: [500, 3000], wall: true, note: 'Paint the inside Night Walnut.' },
  { id: 'shelves', name: 'Open shelves', group: 'Storage', shape: 'shelves', w: 36, d: 10, h: 2, price: [160, 600], wall: true, note: 'Two or three, not a wall of them.' },
  { id: 'floorlamp', lamp: true, name: 'Floor lamp', group: 'Light', shape: 'lamp-floor', w: 18, d: 18, h: 62, price: [250, 1200], note: 'Shade at seated eye height.' },
  { id: 'tablelamp', lamp: true, name: 'Table lamp', group: 'Light', shape: 'lamp-table', w: 16, d: 16, h: 26, price: [150, 650] },
  { id: 'pendant', lamp: true, name: 'Pendant', group: 'Light', shape: 'pendant', w: 18, d: 18, h: 14, price: [250, 1200], ceiling: true, clearance: '30–36" above the table or counter.' },
  { id: 'chandelier', lamp: true, name: 'Chandelier', group: 'Light', shape: 'pendant', w: 30, d: 30, h: 20, price: [500, 3500], ceiling: true, clearance: '30–34" above a dining table; diameter about half the table width.' },
  { id: 'sconces', lamp: true, name: 'Wall sconces (2)', group: 'Light', shape: 'sconce', w: 6, d: 6, h: 12, price: [300, 1000], wall: true, clearance: '60–66" to center, shaded.' },
  { id: 'picture-light', lamp: true, name: 'Picture light', group: 'Light', shape: 'sconce', w: 18, d: 4, h: 3, price: [150, 500], wall: true },
  { id: 'rug', name: 'Rug', group: 'Cloth & art', shape: 'rug', w: 108, d: 144, h: 0.5, price: [400, 3500], note: 'Front legs of every seat on it, at least.' },
  { id: 'runner', name: 'Runner', group: 'Cloth & art', shape: 'rug', w: 30, d: 96, h: 0.5, price: [150, 900] },
  { id: 'curtains', name: 'Curtain panels', group: 'Cloth & art', shape: 'curtains', w: 50, d: 4, h: 96, price: [240, 1200], wall: true, note: 'Hung high, just kissing the floor.' },
  { id: 'art', name: 'Framed art', group: 'Cloth & art', shape: 'art', w: 40, d: 2, h: 30, price: [150, 2500], wall: true, note: 'Center at 57–60" from the floor.' },
  { id: 'mirror', name: 'Mirror', group: 'Cloth & art', shape: 'mirror', w: 30, d: 2, h: 40, price: [150, 900], wall: true },
  { id: 'plant', name: 'Plant', group: 'Cloth & art', shape: 'plant', w: 24, d: 24, h: 60, price: [60, 400] },
  { id: 'tub', name: 'Soaking tub', group: 'Kitchen & bath', shape: 'tub', w: 66, d: 32, h: 24, price: [1200, 5000], clearance: 'A walkway behind it, or do not buy the freestanding one.' },
  { id: 'vanity', name: 'Vanity', group: 'Kitchen & bath', shape: 'vanity', w: 48, d: 22, h: 34, price: [900, 3500], wall: true },
  { id: 'double-vanity', name: 'Double vanity', group: 'Kitchen & bath', shape: 'vanity', w: 72, d: 22, h: 34, price: [1800, 6000], wall: true },
  { id: 'range', name: 'Range', group: 'Kitchen & bath', shape: 'range', w: 36, d: 27, h: 36, price: [1500, 9000], wall: true },
  { id: 'fridge', name: 'Refrigerator', group: 'Kitchen & bath', shape: 'box', w: 36, d: 30, h: 72, price: [1800, 9000], wall: true },
  { id: 'wc', name: 'Toilet', group: 'Kitchen & bath', shape: 'box', w: 18, d: 28, h: 30, price: [250, 1200], wall: true, clearance: '15" from center to any wall; 24" in front.' },
  { id: 'shower', name: 'Shower', group: 'Kitchen & bath', shape: 'box', w: 42, d: 36, h: 84, price: [2000, 12000], wall: true },
  { id: 'recessed', name: 'Recessed downlights (4)', group: 'Smart', shape: 'pendant', w: 6, d: 6, h: 1, price: [200, 600], ceiling: true, lamp: true, note: 'Task light only, on their own dimmer. Not the main event.' },
  { id: 'thermostat', name: 'Thermostat', group: 'Smart', shape: 'sconce', w: 4, d: 1, h: 4, price: [120, 300], wall: true, note: 'On an interior wall at 60", away from the window and the range.' },
  { id: 'shelf-speaker', name: 'Shelf speaker', group: 'Smart', shape: 'box', w: 8, d: 7, h: 12, price: [200, 900], reach: 14, note: 'Walnut cabinet, linen grille. On the sideboard, not the floor.' },
  { id: 'ceiling-speaker', name: 'Ceiling speakers (2)', group: 'Smart', shape: 'pendant', w: 8, d: 8, h: 1, price: [300, 1200], ceiling: true, reach: 12, note: 'A linen disc in the plaster. Pair them, 8 feet apart.' },
  { id: 'camera', name: 'Corner camera', group: 'Smart', shape: 'sconce', w: 3, d: 3, h: 3, price: [100, 400], wall: true, fov: 100, reach: 22, note: 'Doors and the drive. Never a bedroom. Smoked glass, a small ring.' },
  { id: 'presence', name: 'Presence sensor', group: 'Smart', shape: 'pendant', w: 2, d: 2, h: 1, price: [40, 120], ceiling: true, reach: 14, note: 'A ceiling disc that turns the lights on before you reach for them.' },
  { id: 'mesh', name: 'Mesh node', group: 'Smart', shape: 'box', w: 5, d: 5, h: 6, price: [100, 350], reach: 28, note: 'One per floor, in the middle, not in a closet. Coverage, shaped like ceramic.' },
  { id: 'leak-sensor', name: 'Leak sensor', group: 'Smart', shape: 'box', w: 2, d: 2, h: 1, price: [25, 80], note: 'Under the sink, behind the washer, beside the water heater.' },
  { id: 'smart-switch', name: 'Smart dimmer', group: 'Smart', shape: 'sconce', w: 3, d: 1, h: 5, price: [40, 90], wall: true, note: 'Every overhead light. The cheapest scene you will ever buy.' },
  { id: 'outdoor-sofa', name: 'Outdoor sofa', group: 'Outdoor', shape: 'sofa', w: 80, d: 36, h: 30, price: [1200, 4000] },
  { id: 'planter', name: 'Large planter', group: 'Outdoor', shape: 'plant', w: 22, d: 22, h: 48, price: [60, 300] },
];

export const piece = (id: string): Piece | undefined => PIECES.find((p) => p.id === id);
export const PIECE_GROUPS: PieceGroup[] = ['Seating', 'Tables', 'Storage', 'Light', 'Cloth & art', 'Kitchen & bath', 'Smart', 'Outdoor'];
