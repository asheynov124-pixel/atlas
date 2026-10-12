export type PaintGroup = 'light' | 'mid' | 'deep';

export interface Paint {
  id: string;
  name: string;
  hex: string;
  undertone: string;
  /** Light reflectance value, 0–100. Above ~60 reads as light; below ~25 reads as deep. */
  lrv: number;
  group: PaintGroup;
  note: string;
  /** Rooms where this color tends to work. */
  best: string[];
  /** Commercial paints that land in the same neighborhood. Always sample in the room. */
  near: string[];
  /** Where it goes wrong. */
  avoid?: string;
}

export const PAINTS: Paint[] = [
  // ---- light ----
  { id: 'bone', name: 'Bone Milk', hex: '#f3efe6', undertone: 'yellow-pink', lrv: 84, group: 'light', note: 'The safest warm white. It does not go blue at dusk.', best: ['living', 'bedroom', 'entry', 'office'], near: ['Benjamin Moore White Dove OC-17', 'Farrow & Ball Pointing', 'Sherwin-Williams Alabaster SW 7008'] },
  { id: 'candle', name: 'Candle', hex: '#f7f1e4', undertone: 'yellow', lrv: 87, group: 'light', note: 'A touch of cream. Useful on a ceiling you actually look at.', best: ['ceiling', 'living', 'kitchen'], near: ['Benjamin Moore Cloud White OC-130', 'Farrow & Ball White Tie'] },
  { id: 'linen', name: 'Warm Linen', hex: '#efe4d4', undertone: 'pink-yellow', lrv: 79, group: 'light', note: 'Sits next to oak without a yellow argument.', best: ['kitchen', 'dining', 'office'], near: ['Farrow & Ball School House White', 'Benjamin Moore Swiss Coffee OC-45'] },
  { id: 'oat', name: 'Oat Plaster', hex: '#e4d8c4', undertone: 'yellow', lrv: 69, group: 'light', note: 'Reads as limewash even when the paint is flat.', best: ['bedroom', 'living', 'hall'], near: ['Farrow & Ball Joa\'s White', 'Benjamin Moore Manchester Tan HC-81'] },
  { id: 'slate', name: 'Slate Milk', hex: '#d5d2cc', undertone: 'blue-gray', lrv: 66, group: 'light', note: 'The one cool light. Use it with cool stone, not next to cherry.', best: ['bath', 'laundry'], near: ['Farrow & Ball Ammonite', 'Benjamin Moore Classic Gray OC-23'], avoid: 'A north-facing room lit only at night. It will feel like a basement.' },
  { id: 'chalk', name: 'Chalk', hex: '#f6f3ee', undertone: 'neutral', lrv: 89, group: 'light', note: 'A near-true white with the sting taken out. For trim when the wall is warm.', best: ['trim', 'ceiling', 'bath'], near: ['Benjamin Moore Chantilly Lace OC-65', 'Farrow & Ball Wevet'] },
  { id: 'mushroom', name: 'Mushroom', hex: '#d9cfc1', undertone: 'taupe', lrv: 62, group: 'light', note: 'A greige that stays warm. Hides scuffs in a hallway.', best: ['hall', 'mudroom', 'bedroom'], near: ['Farrow & Ball Elephant\'s Breath', 'Sherwin-Williams Accessible Beige SW 7036'] },
  { id: 'sand', name: 'Dune', hex: '#e3d2b4', undertone: 'yellow-orange', lrv: 64, group: 'light', note: 'Sunlight in a jar. Only for rooms that face north and need the help.', best: ['office', 'nursery'], near: ['Farrow & Ball String', 'Benjamin Moore Lenox Tan HC-44'], avoid: 'A south room. It will go dayglo at 2pm.' },
  // ---- mid ----
  { id: 'blush', name: 'Blush Lime', hex: '#e6d2c6', undertone: 'pink', lrv: 66, group: 'mid', note: 'A plaster pink. One wall, a niche, or a powder room.', best: ['powder', 'bedroom', 'nursery'], near: ['Farrow & Ball Setting Plaster', 'Benjamin Moore Pink Damask OC-72'] },
  { id: 'stone', name: 'River Stone', hex: '#c4bbb2', undertone: 'green-gray', lrv: 50, group: 'mid', note: 'Calms south light. Can go sad in a north-facing bath.', best: ['living', 'bath', 'laundry'], near: ['Farrow & Ball Cromarty', 'Benjamin Moore Revere Pewter HC-172'] },
  { id: 'brassdust', name: 'Brass Dust', hex: '#c6a36a', undertone: 'yellow', lrv: 40, group: 'mid', note: 'Rare as a wall. Beautiful as the ceiling of a small room.', best: ['powder', 'ceiling', 'library'], near: ['Farrow & Ball Sudbury Yellow', 'Benjamin Moore Hawthorne Yellow HC-4'] },
  { id: 'oakshadow', name: 'Oak Shadow', hex: '#8a6a45', undertone: 'yellow-brown', lrv: 18, group: 'mid', note: 'The color oak goes in shade. A door, not a sofa.', best: ['door', 'millwork'], near: ['Farrow & Ball London Clay', 'Benjamin Moore Fresco Urbain'] },
  { id: 'clay', name: 'Clay Wash', hex: '#c4785a', undertone: 'orange', lrv: 27, group: 'mid', note: 'A finish, not a whole house. Alcoves and powder rooms.', best: ['powder', 'dining', 'alcove'], near: ['Farrow & Ball Red Earth', 'Benjamin Moore Audubon Russet HC-51'] },
  { id: 'sea', name: 'Sea Glass', hex: '#8aa39a', undertone: 'green', lrv: 34, group: 'mid', note: 'Only if the stone in the room is actually cool.', best: ['bath', 'laundry', 'mudroom'], near: ['Farrow & Ball Green Blue', 'Benjamin Moore Wythe Blue HC-143'] },
  { id: 'terra', name: 'Kiln', hex: '#a24b32', undertone: 'red-orange', lrv: 12, group: 'mid', note: 'Needs a field of bone nearby or it shouts.', best: ['dining', 'front door', 'powder'], near: ['Farrow & Ball Picture Gallery Red', 'Benjamin Moore Spanish Red'] },
  { id: 'sage', name: 'Dried Sage', hex: '#a7ab96', undertone: 'gray-green', lrv: 39, group: 'mid', note: 'The green that behaves like a neutral. Kitchens love it.', best: ['kitchen', 'mudroom', 'bedroom'], near: ['Farrow & Ball French Gray', 'Sherwin-Williams Evergreen Fog SW 9130'] },
  { id: 'putty', name: 'Window Putty', hex: '#b9ab96', undertone: 'yellow-gray', lrv: 41, group: 'mid', note: 'Khaki without the uniform. Lovely on cabinetry with brass.', best: ['kitchen', 'office', 'millwork'], near: ['Farrow & Ball Old White', 'Benjamin Moore Shaker Beige HC-45'] },
  { id: 'denim', name: 'Washed Denim', hex: '#6f7f8f', undertone: 'blue', lrv: 20, group: 'mid', note: 'A blue that does not say nautical. Needs brass or oak close by.', best: ['office', 'boy\'s room', 'mudroom'], near: ['Farrow & Ball Stiffkey Blue', 'Benjamin Moore Van Deusen Blue HC-156'] },
  // ---- deep ----
  { id: 'moss', name: 'Moss Jar', hex: '#5c6854', undertone: 'green', lrv: 13, group: 'deep', note: 'A library green that still has daylight in it.', best: ['library', 'office', 'dining'], near: ['Farrow & Ball Green Smoke', 'Benjamin Moore Backwoods 469'] },
  { id: 'fig', name: 'Pressed Fig', hex: '#5c3140', undertone: 'red', lrv: 7, group: 'deep', note: 'Dining rooms after dark. Unkind in a windowless bath.', best: ['dining', 'powder'], near: ['Farrow & Ball Brinjal', 'Benjamin Moore Dark Burgundy'] },
  { id: 'ink', name: 'Soft Soot', hex: '#3a3632', undertone: 'warm gray', lrv: 6, group: 'deep', note: 'Millwork and a lounge wall. Pair with bone trim if the room is small.', best: ['lounge', 'millwork', 'front door'], near: ['Farrow & Ball Off-Black', 'Benjamin Moore Wrought Iron 2124-10'] },
  { id: 'walnut', name: 'Night Walnut', hex: '#2a211c', undertone: 'red-brown', lrv: 3, group: 'deep', note: 'Lounge ceilings and the inside of a bookcase.', best: ['lounge', 'bookcase interiors'], near: ['Farrow & Ball Tanner\'s Brown', 'Benjamin Moore Bittersweet Chocolate'] },
  { id: 'navy', name: 'Harbor', hex: '#2c3a4a', undertone: 'blue', lrv: 5, group: 'deep', note: 'An island or a study. Never four walls of a small bath.', best: ['island', 'office', 'front door'], near: ['Farrow & Ball Hague Blue', 'Benjamin Moore Hale Navy HC-154'] },
  { id: 'forest', name: 'Hemlock', hex: '#2f4034', undertone: 'blue-green', lrv: 5, group: 'deep', note: 'The classic cabinet green. Wants unlacquered brass and a cream wall.', best: ['kitchen cabinets', 'mudroom', 'library'], near: ['Farrow & Ball Studio Green', 'Benjamin Moore Essex Green'] },
  { id: 'cocoa', name: 'Cocoa Plaster', hex: '#6b4a3a', undertone: 'red-brown', lrv: 9, group: 'deep', note: 'Warmer than soot, calmer than fig. A den or a dining room.', best: ['den', 'dining', 'bedroom'], near: ['Farrow & Ball Mahogany', 'Sherwin-Williams Sable SW 6083'] },
];

export const paint = (id: string): Paint => PAINTS.find((p) => p.id === id) ?? PAINTS[0];

/** Named colors a person might type in the "add your own" box. */
export const COLOR_WORDS: Record<string, string> = {
  white: '#f4f1ea', ivory: '#f3efe6', cream: '#f7f1e4', bone: '#f3efe6', linen: '#efe4d4', oat: '#e4d8c4', beige: '#e6d7c3',
  sand: '#d8c4a4', tan: '#c9ae8c', taupe: '#b5a494', greige: '#cfc6ba', gray: '#b7b2ab', grey: '#b7b2ab', charcoal: '#3a3632',
  black: '#1c1916', ink: '#2a2724', espresso: '#3d2a22', navy: '#2c3a4a', blue: '#6d8494', 'powder blue': '#b7c9d3', 'dusty blue': '#8aa0b0',
  sage: '#8fa08a', 'dusty sage': '#9aa892', olive: '#6d6a45', moss: '#5c6854', green: '#6e7f68', forest: '#2f4034', 'sea glass': '#8aa39a',
  teal: '#5d7a78', blush: '#e6d2c6', pink: '#e4c4b8', 'dusty rose': '#c98986', rose: '#c98986', terracotta: '#c4623a', terra: '#a24b32',
  clay: '#c4785a', rust: '#8f3d2c', coral: '#d4785a', red: '#8a3a38', burgundy: '#6b2e3a', plum: '#5c3148', fig: '#5c3140', gold: '#c6a36a',
  brass: '#b08d57', mustard: '#c4a04a', yellow: '#e6d39a', butter: '#f0e2b6', brown: '#6b4a32', walnut: '#4a3426', chocolate: '#3d2a22',
  oak: '#c4a06a', stone: '#c4bbb2', limestone: '#d9d2c5', marble: '#ece7df', slate: '#8d8a84', pewter: '#8e8b86', silver: '#c5c1ba',
  nickel: '#c5c1ba', copper: '#b8734a', lavender: '#b7a8c4', lilac: '#c8b6d4', 'warm white': '#f4efe6', 'off white': '#f3efe6',
  'soft white': '#f6f1ea', 'warm gray': '#b7b2ab', 'warm grey': '#b7b2ab', mushroom: '#d9cfc1', denim: '#6f7f8f', cocoa: '#6b4a3a',
};
