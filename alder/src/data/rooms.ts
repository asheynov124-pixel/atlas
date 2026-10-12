import type { StudioState } from '../lib/types';

export interface RoomType {
  id: string;
  name: string;
  /** Which studio template to start from. */
  studio: string;
  /** Default dimensions in feet: length, width, ceiling height. */
  dims: [number, number, number];
  pieces: string[];
  checklist: string[];
}

export const ROOM_TYPES: RoomType[] = [
  { id: 'living', name: 'Living', studio: 'living', dims: [18, 14, 9], pieces: ['sofa', 'coffee', 'rug', 'art', 'floorlamp', 'plant', 'curtains', 'chair'], checklist: ['Sofa path is 30"+', 'Rug catches the front legs', 'A lamp at seated eye height', 'One dark thing, not four'] },
  { id: 'kitchen', name: 'Kitchen', studio: 'kitchen', dims: [16, 13, 9], pieces: ['island', 'pendant', 'shelves', 'stools', 'range', 'fridge'], checklist: ['42" aisles', 'Pendants 32" above the counter', 'One metal in the wet zone', 'Flat drawers, fluted pantry'] },
  { id: 'dining', name: 'Dining', studio: 'dining', dims: [14, 12, 9], pieces: ['dining', 'dining-chairs', 'sideboard', 'pendant', 'art', 'rug'], checklist: ['36" from table edge to wall', 'Chandelier 30–34" above the table', 'Rug 24" past the chairs', 'A dimmer'] },
  { id: 'bedroom', name: 'Primary bedroom', studio: 'bedroom', dims: [16, 14, 9], pieces: ['bed', 'nightstands', 'tablelamp', 'rug', 'art', 'curtains', 'bench', 'dresser'], checklist: ['24" each side of the bed', 'Lamps you can reach lying down', 'Blackout behind the linen', 'Art belongs to the headboard'] },
  { id: 'guest', name: 'Guest / kid bedroom', studio: 'bedroom', dims: [12, 12, 8.5], pieces: ['bed', 'nightstands', 'tablelamp', 'rug', 'curtains', 'dresser'], checklist: ['One lamp, one hook, one chair', 'A rug that is not precious'] },
  { id: 'bath', name: 'Primary bath', studio: 'bath', dims: [12, 10, 9], pieces: ['tub', 'double-vanity', 'shower', 'wc', 'sconces', 'mirror', 'plant'], checklist: ['Walkway behind the tub', 'Sconces beside the mirror, not above', 'Honed stone, warm metal', 'A heated floor if the budget allows'] },
  { id: 'powder', name: 'Powder', studio: 'bath', dims: [6, 5, 9], pieces: ['vanity', 'wc', 'mirror', 'sconces'], checklist: ['One deep color is allowed', 'A mirror larger than you think', 'A single shaded light'] },
  { id: 'lounge', name: 'Lounge / den', studio: 'lounge', dims: [15, 13, 9], pieces: ['sofa', 'coffee', 'floorlamp', 'art', 'bookcase', 'rug', 'picture-light'], checklist: ['This is an evening room', 'Ceiling lighter than the walls', 'Wool rug under leather'] },
  { id: 'office', name: 'Office', studio: 'living', dims: [12, 11, 9], pieces: ['desk', 'chair', 'tablelamp', 'shelves', 'art', 'rug'], checklist: ['Daylight from the side, not behind the screen', 'A shaded task lamp', 'A chair you tested for twenty minutes'] },
  { id: 'entry', name: 'Entry', studio: 'entry', dims: [10, 7, 9], pieces: ['bench', 'mirror', 'console', 'sconces', 'runner', 'plant'], checklist: ['Casing and base upgraded together', 'A large mirror', 'Somewhere to sit and take off a boot', 'A stone bowl'] },
  { id: 'mudroom', name: 'Mudroom / laundry', studio: 'entry', dims: [10, 8, 9], pieces: ['bench', 'shelves', 'runner'], checklist: ['A floor that can take wet', 'Hooks at two heights', 'Eggshell paint, not flat'] },
  { id: 'nursery', name: 'Nursery', studio: 'bedroom', dims: [11, 11, 8.5], pieces: ['chair', 'dresser', 'rug', 'tablelamp', 'curtains', 'bookcase'], checklist: ['A chair that rocks and is wide enough for two', 'Blackout that actually blacks out', 'Dimmer on everything'] },
  { id: 'hall', name: 'Hall / stair', studio: 'entry', dims: [20, 4, 9], pieces: ['runner', 'art', 'sconces'], checklist: ['Runner leaves 3–4" of floor each side', 'Art hung as one line', 'Sconces, not a row of cans'] },
  { id: 'deck', name: 'Deck / porch', studio: 'entry', dims: [16, 12, 10], pieces: ['outdoor-sofa', 'coffee', 'planter', 'planter'], checklist: ['Same palette as inside', 'Three pots, not six', 'A low table'] },
];

export const roomType = (id: string): RoomType => ROOM_TYPES.find((r) => r.id === id) ?? ROOM_TYPES[0];

const base = { finish: 'limewash', metal: 'brass', cloth: 'oat-linen', ceiling: 'flat-white', trim: 'chalk' } as const;

export const STUDIO_TEMPLATES: Record<string, StudioState> = {
  living: { ...base, room: 'living', wall: 'bone', floor: 'oak', frame: 'square', warmth: 68, hour: 15, pieces: ['sofa', 'coffee', 'rug', 'art', 'floorlamp', 'plant', 'curtains'] },
  kitchen: { ...base, room: 'kitchen', wall: 'linen', floor: 'oak', frame: 'square', warmth: 54, hour: 11, pieces: ['island', 'pendant', 'shelves', 'stools', 'range'] },
  bath: { ...base, room: 'bath', wall: 'slate', floor: 'limestone', frame: 'square', warmth: 40, hour: 9, cloth: 'bone-linen', pieces: ['tub', 'vanity', 'plant'] },
  bedroom: { ...base, room: 'bedroom', wall: 'oat', floor: 'oak', frame: 'craftsman', warmth: 62, hour: 20, pieces: ['bed', 'tablelamp', 'rug', 'art', 'curtains', 'bench'] },
  dining: { ...base, room: 'dining', wall: 'linen', floor: 'oak', frame: 'ogee', warmth: 58, hour: 19, pieces: ['dining', 'sideboard', 'pendant', 'art', 'rug'] },
  lounge: { ...base, room: 'lounge', wall: 'ink', floor: 'walnut', frame: 'gallery', warmth: 84, hour: 21, cloth: 'cognac', metal: 'blackened', ceiling: 'same-as-wall', pieces: ['sofa', 'coffee', 'floorlamp', 'art', 'bookcase', 'rug'] },
  entry: { ...base, room: 'entry', wall: 'bone', floor: 'limestone', frame: 'craftsman', warmth: 48, hour: 10, pieces: ['bench', 'art', 'plant', 'tablelamp'] },
};

export const STUDIO_ROOMS = [
  { id: 'living', name: 'Living' }, { id: 'kitchen', name: 'Kitchen' }, { id: 'bath', name: 'Bath' }, { id: 'bedroom', name: 'Bedroom' },
  { id: 'dining', name: 'Dining' }, { id: 'lounge', name: 'Lounge' }, { id: 'entry', name: 'Entry' },
];

export const roomName = (id: string) => ROOM_TYPES.find((r) => r.id === id)?.name ?? STUDIO_ROOMS.find((r) => r.id === id)?.name ?? 'Room';
