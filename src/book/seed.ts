import { newId } from './ids';
import {
  board,
  decision as decisionSlot,
  image,
  items,
  materials,
  pair,
  pins,
  shopping,
  text,
} from './slots';
import {
  DEFAULT_THEME,
  SCHEMA_VERSION,
  emptyClean,
  type Book,
  type Chapter,
  type Item,
  type MaterialCard,
  type Spread,
  type TemplateId,
  type ThemeColorKey,
  type Slot,
} from './types';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const p = (...paras: string[]) => paras.map((t) => `<p>${t}</p>`).join('');

const spread = (template: TemplateId, slots: Record<string, Slot>): Spread => ({
  id: newId('sp'),
  template,
  slots,
  notes: [],
});

interface ChapterInput {
  slug: string;
  number: number | null;
  title: string;
  kicker: string;
  epigraph: string;
  accent: ThemeColorKey;
  spreads: Spread[];
  hidden?: boolean;
}

const chapter = (c: ChapterInput): Chapter => ({ id: newId('ch'), ...c });

const item = (
  name: string,
  placeholder: string,
  tags: string[],
  extra: Partial<Item> = {},
): Item => ({
  id: newId('it'),
  name,
  brand: '',
  price: null,
  currency: 'USD',
  url: '',
  assetId: null,
  placeholder,
  tags,
  status: 'considering',
  favorites: { adi: false, sonny: false },
  clean: emptyClean(),
  notes: '',
  ...extra,
});

const card = (
  name: string,
  finish: string,
  swatchColor: string | null,
  extra: Partial<MaterialCard> = {},
): MaterialCard => ({
  id: newId('mt'),
  name,
  finish,
  maker: '',
  url: '',
  pricePerUnit: null,
  unit: '',
  swatchColor,
  assetId: null,
  clean: emptyClean(),
  ...extra,
});

const ids = (list: Item[]) => list.map((i) => i.id);

/* ------------------------------------------------------------------ */
/* items                                                               */
/* ------------------------------------------------------------------ */

const frontYardConcepts: Item[] = [
  item('Cottage', 'FRONT — CONCEPT 01, COTTAGE', ['cottage', 'planting']),
  item('Modern farmhouse', 'FRONT — CONCEPT 02, MODERN FARMHOUSE', ['farmhouse', 'fence']),
  item('Classic American', 'FRONT — CONCEPT 03, CLASSIC AMERICAN', ['classic', 'shutters']),
  item('Boxwood and hydrangea beds', 'FRONT — CONCEPT 04, BOXWOOD + HYDRANGEA', ['planting']),
  item('A fence for the dog', 'FRONT — CONCEPT 05, CEDAR FENCE', ['fence', 'dog']),
  item('The lamp post', 'FRONT — CONCEPT 06, LAMP POST AT THE WALK', ['lighting']),
];

const beamStyles: Item[] = [
  item('Exposed collar ties', 'VAULT — BEAMS, COLLAR TIES', ['beams', 'rustic']),
  item('Boxed beams, painted', 'VAULT — BEAMS, BOXED + PAINTED', ['beams', 'painted']),
  item('Scissor truss', 'VAULT — BEAMS, SCISSOR TRUSS', ['beams', 'structural']),
  item('Rough-sawn oak', 'VAULT — BEAMS, ROUGH-SAWN OAK', ['beams', 'oak']),
];

const fireplaceOptions: Item[] = [
  item('Electric linear, 60″', 'VAULT — FIREPLACE, ELECTRIC 60″', ['fireplace', 'electric']),
  item('Electric linear, 72″', 'VAULT — FIREPLACE, ELECTRIC 72″', ['fireplace', 'electric']),
  item('Direct-vent gas', 'VAULT — FIREPLACE, DIRECT-VENT GAS', ['fireplace', 'gas']),
];

const kitchenLayouts: Item[] = [
  item('Peninsula with stools', 'KITCHEN — LAYOUT A, PENINSULA', ['layout', 'peninsula'], { status: 'chosen' }),
  item('Island', 'KITCHEN — LAYOUT B, ISLAND', ['layout', 'island']),
  item('Galley', 'KITCHEN — LAYOUT C, GALLEY', ['layout', 'galley']),
  item('L with a table', 'KITCHEN — LAYOUT D, L + TABLE', ['layout', 'table']),
];

const woods = ['White oak', 'Walnut', 'Painted sage', 'Painted white', 'Ebonised oak', 'Rift oak', 'Painted olive', 'Teak'];
const mounts = ['floating', 'on legs', 'furniture-style', 'wall-hung'];
const tops = ['quartz', 'porcelain', 'marble', 'concrete'];

const vanities: Item[] = Array.from({ length: 32 }, (_, i) => {
  const wood = woods[i % woods.length];
  const mount = mounts[Math.floor(i / 8) % mounts.length];
  const top = tops[(i * 7) % tops.length];
  const n = String(i + 1).padStart(2, '0');
  return item(
    `Vanity ${n}`,
    `BATH — VANITY RENDER ${n}, ${wood.toUpperCase()}`,
    [wood.toLowerCase(), mount, top],
    { notes: `${wood}, ${mount}, ${top} top.` },
  );
});

const smallBathLayouts: Item[] = [
  item('Shower on the long wall', 'SMALL BATH — LAYOUT A', ['layout']),
  item('Shower at the end', 'SMALL BATH — LAYOUT B', ['layout']),
  item('Wet room', 'SMALL BATH — LAYOUT C, WET ROOM', ['layout', 'wet-room']),
];

const allItems = [
  ...frontYardConcepts,
  ...beamStyles,
  ...fireplaceOptions,
  ...kitchenLayouts,
  ...vanities,
  ...smallBathLayouts,
];

/* ------------------------------------------------------------------ */
/* materials                                                           */
/* ------------------------------------------------------------------ */

const approachCards = [
  card('Siding', 'Sage, satin', '#8A9A7B'),
  card('Shutters', 'Olive, satin', '#5E6B4A'),
  card('Fence', 'Cedar, left to silver', '#B08B5E', { unit: 'linear ft' }),
  card('Boxwood', 'Evergreen hedge', '#4F6B3E'),
  card('Hydrangea', 'Limelight, white to lime', '#DDE4CF'),
  card('Lamp post', 'Black, textured', '#1F1D1A'),
];

const kitchenCards = [
  card('Cabinets', 'Painted, satin', '#E7E1D4', { unit: 'linear ft' }),
  card('Counter', 'Quartz, honed', '#EDE8DF', { unit: 'sq ft' }),
  card('Backsplash', 'Handmade tile', '#D9D2C7', { unit: 'sq ft' }),
  card('Floor', 'White oak, matte', '#B08B5E', { unit: 'sq ft' }),
  card('Hardware', 'Unlacquered brass', '#B59256'),
];

const bathCards = [
  card('Wall tile', 'Large gray porcelain', '#9A9892', { unit: 'sq ft' }),
  card('Floor tile', 'Small-format, matte', '#6F6A63', { unit: 'sq ft' }),
  card('Glass screen', 'Fixed, low-iron', '#C9D3D4'),
  card('Fixtures', 'Brushed nickel', '#B9B7B1'),
  card('Vanity top', 'Quartz', '#EDE8DF'),
];

const smallBathCards = [
  card('Wall tile', 'Vertical stack, matte white', '#EDE8DF', { unit: 'sq ft' }),
  card('Floor', 'Hex, charcoal', '#3B3936', { unit: 'sq ft' }),
  card('Fixtures', 'Matte black', '#1F1D1A'),
];

const houseCards = [
  ...approachCards.slice(0, 3),
  ...kitchenCards,
  ...bathCards.slice(0, 2),
  card('Interior walls', 'Warm white, matte', '#F5F1EA'),
  card('Trim', 'Warm white, satin', '#F0EBE2'),
  card('Beams', 'Rough-sawn, sealed', '#8E6B45'),
];

/* ------------------------------------------------------------------ */
/* spreads                                                             */
/* ------------------------------------------------------------------ */

const prologueEssay = p(
  'It was a sage-green bi-level on a gentle rise, brick below, shutters the colour of olives, three old oaks leaning over the lawn. There was a blue tarp on one side and a pile of debris at the curb. We bought it anyway, or maybe because.',
  'By October the front of the house was open to the rafters.',
  'This book is the record of what we are making of it: the walls we took down, the tile we argued about, the vanity we looked at thirty-two different ways. It is not finished. Neither is the house. That is the point of both.',
);

const placeholderEssay = (line: string) =>
  p(`<em>${line}</em>`, '<em>Essay to come.</em>');

export function buildSeedBook(): Book {
  const front = chapter({
    slug: 'front',
    number: null,
    title: 'Front matter',
    kicker: '',
    epigraph: '',
    accent: 'sage',
    hidden: true,
    spreads: [
      spread('cover', {
        hero: image('THE HOUSE — FROM THE STREET, SEPTEMBER', { alt: 'The house at 16 Bannehr Street, seen from the street.' }),
        title: text('Sixteen Bannehr'),
        subtitle: text('A book about a house, in progress.'),
        address: text('16 Bannehr Street · Oakland, New Jersey'),
      }),
      spread('endpapers', {
        dedication: text('For Sonny, who saw the kitchen before there was a kitchen.'),
      }),
      spread('contents', {
        title: text('Contents'),
      }),
    ],
  });

  const prologue = chapter({
    slug: 'prologue',
    number: null,
    title: 'The House on Bannehr Street',
    kicker: 'Prologue',
    epigraph: 'We bought it anyway, or maybe because.',
    accent: 'sage',
    spreads: [
      spread('opener', {
        hero: image('THE HOUSE — THREE OAKS, THE RISE, THE TARP', { alt: 'The front of the house with three oaks leaning over the lawn.' }),
      }),
      spread('essay', {
        title: text('The House on Bannehr Street'),
        body: text(prologueEssay),
        quote: text('It is not finished. Neither is the house. That is the point of both.'),
        aside: image('THE CURB — DEBRIS, OCTOBER'),
      }),
    ],
  });

  const approach = chapter({
    slug: 'approach',
    number: 1,
    title: 'The Approach',
    kicker: 'Exterior and garden',
    epigraph: 'A house introduces itself from the street.',
    accent: 'sage',
    spreads: [
      spread('opener', { hero: image('FRONT — RENDER, FROM THE SIDEWALK') }),
      spread('essay', {
        title: text('Three words for the same wish'),
        body: text(
          p(
            'Cottage, modern farmhouse, classic American with taste: three words for the same wish, a house that looks cared for without looking fussy.',
            'Fresh paint, a fence for the dog, beds of boxwood and hydrangea, a lamp post that finally means something.',
          ),
        ),
        quote: text('A house that looks cared for without looking fussy.'),
        aside: image('FRONT — THE LAMP POST, DETAIL'),
      }),
      spread('beforeafter', {
        pair: pair('FRONT — BEFORE, SEPTEMBER', 'FRONT — AFTER, RENDER'),
        caption: text('The front of the house, before and as it will be.'),
      }),
      spread('gallery', {
        title: text('Six ways to meet the street'),
        items: items(ids(frontYardConcepts)),
      }),
      spread('palette', {
        title: text('Fence and planting'),
        materials: materials(approachCards),
      }),
      spread('decision', {
        title: text('What the street will see'),
        decision: decisionSlot({ optionIds: ids(frontYardConcepts) }),
      }),
    ],
  });

  const vault = chapter({
    slug: 'vault',
    number: 2,
    title: 'The Vault',
    kicker: 'Living and dining',
    epigraph: 'We opened the ceiling and the room took a breath.',
    accent: 'olive',
    spreads: [
      spread('opener', { hero: image('VAULT — RENDER, LOOKING UP INTO THE GABLE') }),
      spread('essay', {
        title: text('The room went up'),
        body: text(
          p(
            'The joists came out and the room went up: a full gable over living and dining, exposed beams, a bay window with a seat deep enough to read in.',
            'The open question is the wall under the TV, where a fireplace wants to live.',
          ),
        ),
        quote: text('A bay window with a seat deep enough to read in.'),
        aside: image('VAULT — THE JOISTS COMING OUT'),
      }),
      spread('gallery', {
        title: text('Beam styles'),
        items: items(ids(beamStyles)),
      }),
      spread('fullbleed', {
        image: image('VAULT — BAY WINDOW SEAT, RENDER'),
        caption: text('The bay window seat, deep enough to read in.'),
      }),
      spread('gallery', {
        title: text('Where a fireplace wants to live'),
        items: items(ids(fireplaceOptions)),
      }),
      spread('fullbleed', {
        image: image('VAULT — DINING TABLE UNDER THE GABLE, RENDER'),
        caption: text('The dining table under the vault.'),
      }),
      spread('decision', {
        title: text('The wall under the TV'),
        decision: decisionSlot({ optionIds: ids(fireplaceOptions) }),
      }),
    ],
  });

  const kitchen = chapter({
    slug: 'kitchen',
    number: 3,
    title: 'A Cook’s Kitchen',
    kicker: 'The kitchen',
    epigraph: 'Thirteen feet by thirteen and a half, and every inch argued over.',
    accent: 'oak',
    spreads: [
      spread('opener', { hero: image('KITCHEN — RENDER, PENINSULA VIEW') }),
      spread('essay', {
        title: text('Whoever is cooking faces whoever is talking'),
        body: text(
          p(
            'The kitchen keeps its own room, with a wide opening to the dining room and a peninsula with stools, so whoever is cooking faces whoever is talking.',
            'The sink sits under the window; the range and a 36-inch fridge share the long wall.',
          ),
        ),
        quote: text('So whoever is cooking faces whoever is talking.'),
        aside: image('KITCHEN — THE SINK UNDER THE WINDOW'),
      }),
      spread('beforeafter', {
        pair: pair('KITCHEN — BEFORE, SEPTEMBER', 'KITCHEN — AFTER, RENDER'),
        caption: text('The kitchen, before and as it will be.'),
      }),
      spread('gallery', {
        title: text('Layouts considered'),
        items: items(ids(kitchenLayouts)),
      }),
      spread('pins', {
        title: text('The peninsula plan'),
        pins: pins('KITCHEN — PLAN, PENINSULA LAYOUT', [
          { id: newId('pin'), x: 0.22, y: 0.18, title: 'Sink under the window', body: 'Facing the yard.' },
          { id: newId('pin'), x: 0.72, y: 0.22, title: 'Range on the long wall', body: 'Hood above, counter either side.' },
          { id: newId('pin'), x: 0.86, y: 0.52, title: '36-inch fridge', body: 'Shares the long wall with the range.' },
          { id: newId('pin'), x: 0.42, y: 0.74, title: 'Peninsula with stools', body: 'Whoever is cooking faces whoever is talking.' },
          { id: newId('pin'), x: 0.14, y: 0.86, title: 'Wide opening to dining', body: 'The room keeps its own walls.' },
        ]),
      }),
      spread('palette', {
        title: text('Cabinets and counters'),
        materials: materials(kitchenCards),
      }),
      spread('shopping', {
        title: text('Appliances'),
        shopping: shopping([
          { id: newId('row'), name: '36-inch refrigerator', status: 'needed', price: null, retailer: '', url: '', note: 'Counter-depth if it fits.' },
          { id: newId('row'), name: 'Range', status: 'needed', price: null, retailer: '', url: '', note: 'Gas or induction: still to decide.' },
          { id: newId('row'), name: 'Range hood', status: 'needed', price: null, retailer: '', url: '', note: '' },
          { id: newId('row'), name: 'Dishwasher', status: 'needed', price: null, retailer: '', url: '', note: 'Panel-ready?' },
          { id: newId('row'), name: 'Undermount sink', status: 'needed', price: null, retailer: '', url: '', note: 'Single bowl, under the window.' },
          { id: newId('row'), name: 'Faucet', status: 'needed', price: null, retailer: '', url: '', note: 'Lead-free certified.' },
        ]),
      }),
      spread('decision', {
        title: text('The layout'),
        decision: decisionSlot({
          optionIds: ids(kitchenLayouts),
          chosenId: kitchenLayouts[0].id,
          status: 'decided',
          why: 'A peninsula keeps the room its own but opens it to the table. Whoever is cooking faces whoever is talking.',
          date: '2026-10-18',
        }),
      }),
    ],
  });

  const bath = chapter({
    slug: 'bath-archer',
    number: 4,
    title: 'The Bath with the Archer',
    kicker: 'The main bath',
    epigraph: 'Seventy-two inches of tub, and a window over it.',
    accent: 'clay',
    spreads: [
      spread('opener', { hero: image('BATH — RENDER, TUB UNDER THE WINDOW') }),
      spread('essay', {
        title: text('One bathroom became two'),
        body: text(
          p(
            'One old bathroom became two, and two bedroom closets gave up their space to make it happen.',
            'A 72-inch Kohler Archer runs along one wall under a fixed glass screen, wrapped in large gray porcelain. A single vanity sits in the corner by the window, and we rendered thirty-two of them before choosing.',
          ),
        ),
        quote: text('We rendered thirty-two of them before choosing.'),
        aside: image('BATH — THE GLASS SCREEN, DETAIL'),
      }),
      spread('pins', {
        title: text('The plan'),
        pins: pins('BATH — PLAN, TUB AND VANITY', [
          { id: newId('pin'), x: 0.3, y: 0.22, title: '72-inch tub under the window', body: 'The Archer, along the long wall.' },
          { id: newId('pin'), x: 0.56, y: 0.3, title: 'Fixed glass screen', body: 'No door, no track.' },
          { id: newId('pin'), x: 0.8, y: 0.3, title: 'Vanity in the corner by the window', body: 'Thirty-two renders.' },
          { id: newId('pin'), x: 0.74, y: 0.76, title: 'Toilet', body: '' },
          { id: newId('pin'), x: 0.18, y: 0.8, title: 'Borrowed from two closets', body: 'The space that made it possible.' },
        ]),
      }),
      spread('gallery', {
        title: text('Thirty-two vanities'),
        items: items(ids(vanities)),
      }),
      spread('palette', {
        title: text('Tile and fixtures'),
        materials: materials(bathCards),
      }),
      spread('decision', {
        title: text('The vanity'),
        decision: decisionSlot({ optionIds: ids(vanities.slice(0, 6)) }),
      }),
    ],
  });

  const smallBath = chapter({
    slug: 'small-bath',
    number: 5,
    title: 'The Small Bath',
    kicker: 'The second bath',
    epigraph: 'Fifty-eight inches, used well.',
    accent: 'olive',
    spreads: [
      spread('opener', { hero: image('SMALL BATH — RENDER, FROM THE DOOR') }),
      spread('essay', {
        title: text('No wasted motion'),
        body: text(p('A shower, a vanity, a toilet, and no wasted motion.')),
        quote: text(''),
        aside: image('SMALL BATH — THE NICHE, DETAIL'),
      }),
      spread('gallery', {
        title: text('Three ways to fit it'),
        items: items(ids(smallBathLayouts)),
      }),
      spread('palette', {
        title: text('Tile and fixtures'),
        materials: materials(smallBathCards),
      }),
      spread('decision', {
        title: text('The layout'),
        decision: decisionSlot({ optionIds: ids(smallBathLayouts) }),
      }),
    ],
  });

  const rest = chapter({
    slug: 'rest',
    number: 6,
    title: 'Rest',
    kicker: 'Bedrooms',
    epigraph: 'The quiet end of the house.',
    accent: 'oak',
    spreads: [
      spread('opener', { hero: image('BEDROOM — RENDER, MORNING LIGHT') }),
      spread('essay', {
        title: text('The quiet end of the house'),
        body: text(placeholderEssay('The bedrooms wait their turn.')),
        quote: text(''),
        aside: image('BEDROOM — THE CLOSET WALL'),
      }),
      spread('moodboard', {
        title: text('Rest'),
        board: board([
          { id: newId('el'), type: 'image', x: 4, y: 6, w: 40, h: 46, rotation: -1.5, z: 1, assetId: null, placeholder: 'BEDROOM — LINEN, TEXTURE' },
          { id: newId('el'), type: 'swatch', x: 50, y: 8, w: 14, h: 14, rotation: 0, z: 2, color: '#E7E1D4' },
          { id: newId('el'), type: 'swatch', x: 66, y: 8, w: 14, h: 14, rotation: 0, z: 2, color: '#B08B5E' },
          { id: newId('el'), type: 'swatch', x: 82, y: 8, w: 14, h: 14, rotation: 0, z: 2, color: '#5E6B4A' },
          { id: newId('el'), type: 'text', x: 50, y: 30, w: 44, h: 16, rotation: 0, z: 3, text: 'Linen, oak, a dark green wall behind the bed.' },
          { id: newId('el'), type: 'note', x: 56, y: 56, w: 30, h: 22, rotation: 2, z: 4, text: 'Blackout, but pretty.', author: 'sonny' },
          { id: newId('el'), type: 'image', x: 8, y: 58, w: 36, h: 36, rotation: 1, z: 1, assetId: null, placeholder: 'BEDROOM — SCONCE, DETAIL' },
        ]),
      }),
    ],
  });

  const below = chapter({
    slug: 'below',
    number: 7,
    title: 'Below',
    kicker: 'The lower level',
    epigraph: 'Every house has a room that has not decided what it is yet.',
    accent: 'muted',
    spreads: [
      spread('opener', { hero: image('LOWER LEVEL — FROM THE STAIRS') }),
      spread('essay', {
        title: text('A room that has not decided'),
        body: text(placeholderEssay('Gym, office, den, all three.')),
        quote: text(''),
        aside: image('LOWER LEVEL — THE SLIDER TO THE YARD'),
      }),
      spread('moodboard', {
        title: text('Below'),
        board: board([
          { id: newId('el'), type: 'image', x: 6, y: 8, w: 44, h: 50, rotation: 1, z: 1, assetId: null, placeholder: 'LOWER LEVEL — GYM CORNER' },
          { id: newId('el'), type: 'text', x: 56, y: 10, w: 38, h: 20, rotation: 0, z: 3, text: 'Rubber floor under the rack, cork everywhere else.' },
          { id: newId('el'), type: 'swatch', x: 56, y: 36, w: 12, h: 12, rotation: 0, z: 2, color: '#3B3936' },
          { id: newId('el'), type: 'swatch', x: 70, y: 36, w: 12, h: 12, rotation: 0, z: 2, color: '#C9A77C' },
          { id: newId('el'), type: 'note', x: 60, y: 60, w: 30, h: 22, rotation: -2, z: 4, text: 'Where does the dog bed go?', author: 'adi' },
        ]),
      }),
    ],
  });

  const outside = chapter({
    slug: 'outside',
    number: 8,
    title: 'Outside',
    kicker: 'Deck and yard',
    epigraph: 'Summer starts at the top of the stairs.',
    accent: 'sage',
    spreads: [
      spread('opener', { hero: image('DECK — RENDER, LATE AFTERNOON') }),
      spread('essay', {
        title: text('Summer starts at the top of the stairs'),
        body: text(placeholderEssay('A deck, a table, a grill, and the oaks.')),
        quote: text(''),
        aside: image('YARD — THE OAKS FROM THE DECK'),
      }),
      spread('moodboard', {
        title: text('Outside'),
        board: board([
          { id: newId('el'), type: 'image', x: 4, y: 6, w: 48, h: 54, rotation: -1, z: 1, assetId: null, placeholder: 'DECK — CEDAR, TEXTURE' },
          { id: newId('el'), type: 'swatch', x: 58, y: 8, w: 12, h: 12, rotation: 0, z: 2, color: '#8A9A7B' },
          { id: newId('el'), type: 'swatch', x: 72, y: 8, w: 12, h: 12, rotation: 0, z: 2, color: '#B08B5E' },
          { id: newId('el'), type: 'swatch', x: 86, y: 8, w: 12, h: 12, rotation: 0, z: 2, color: '#1F1D1A' },
          { id: newId('el'), type: 'text', x: 58, y: 28, w: 38, h: 18, rotation: 0, z: 3, text: 'Cedar, black railings, string lights that stay up all year.' },
          { id: newId('el'), type: 'note', x: 60, y: 62, w: 30, h: 22, rotation: 2, z: 4, text: 'Grill on the left, away from the door.', author: 'sonny' },
        ]),
      }),
    ],
  });

  const palette = chapter({
    slug: 'palette',
    number: 9,
    title: 'The Palette',
    kicker: 'Materials for the whole house',
    epigraph: 'Every surface, and what it is made of.',
    accent: 'clay',
    spreads: [
      spread('opener', { hero: image('PALETTE — SAMPLES ON THE FLOOR') }),
      spread('essay', {
        title: text('Every surface, and what it is made of'),
        body: text(
          p(
            'A library of every material in the house, with its Clean panel: solid wood or composite, the formaldehyde standard if composite, the finish’s VOC level, whether there is PVC in it, and whether anything that touches water is lead-free.',
            'Nothing here is claimed until we have checked it. Unknown is an honest answer.',
          ),
        ),
        quote: text('Unknown is an honest answer.'),
        aside: image('PALETTE — THE SAMPLE BOX'),
      }),
      spread('palette', {
        title: text('The house, by material'),
        materials: materials(houseCards),
      }),
    ],
  });

  const epilogue = chapter({
    slug: 'epilogue',
    number: null,
    title: 'Still to Decide',
    kicker: 'Epilogue',
    epigraph: 'What is left, gathered in one place.',
    accent: 'ink',
    spreads: [
      spread('stilltodecide', { title: text('Still to Decide') }),
      spread('essay', {
        title: text('The First Dinner'),
        body: text(''),
        quote: text(''),
        aside: image('THE FIRST DINNER — LEFT FOR LATER'),
      }),
    ],
  });

  const chapters = [front, prologue, approach, vault, kitchen, bath, smallBath, rest, below, outside, palette, epilogue];

  return {
    id: newId('book'),
    schemaVersion: SCHEMA_VERSION,
    title: 'Sixteen Bannehr',
    subtitle: 'A book about a house, in progress.',
    address: '16 Bannehr Street · Oakland, New Jersey',
    dedication: 'For Sonny, who saw the kitchen before there was a kitchen.',
    theme: structuredClone(DEFAULT_THEME),
    chapters,
    items: Object.fromEntries(allItems.map((i) => [i.id, i])),
    assets: {},
    appliedPhotos: [],
    updatedAt: new Date().toISOString(),
  };
}
