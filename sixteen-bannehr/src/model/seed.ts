import { createItem, emptyImage, TEMPLATES } from './templates';
import type {
  BoardEl,
  Book,
  Chapter,
  ChapterKind,
  Item,
  Pin,
  Slot,
  Spread,
  Swatch,
  TemplateId,
  Theme,
} from './types';

// The seed book. Every word below is Adi's, from the brief, set with real typography.
// Images are placeholders labelled with the photo that belongs there. IDs are fixed so
// that bundled photos, tests and screenshots can find the same spread every time.

export const DEFAULT_THEME: Theme = {
  day: {
    paper: '#F5F1EA',
    ink: '#1F1D1A',
    muted: '#6F6A63',
    sage: '#8A9A7B',
    olive: '#5E6B4A',
    oak: '#B08B5E',
    clay: '#B0452A',
    hairline: '#D9D2C7',
  },
  night: {
    paper: '#14130F',
    ink: '#EDE8DF',
    muted: '#A39D93',
    sage: '#8A9A7B',
    olive: '#A3B08C',
    oak: '#C9A57A',
    clay: '#D9734F',
    hairline: '#3A3731',
  },
};

const TONES = {
  sage: '#8A9A7B',
  olive: '#5E6B4A',
  oak: '#B08B5E',
  clay: '#B0452A',
  stone: '#8E8B85',
  dusk: '#6E7B86',
  moss: '#76805F',
  loam: '#8C6B52',
};

const p = (...paras: string[]) => paras.map((t) => `<p>${t}</p>`).join('');
const txt = (html: string): Slot => ({ kind: 'text', html });
const img = (label: string, caption = '', alt = ''): Slot => emptyImage(label, { caption, alt });

const items: Record<string, Item> = {};
function item(id: string, name: string, extra: Partial<Item> = {}, kind: Item['kind'] = 'product'): string {
  items[id] = { ...createItem({ name, ...extra }, kind), id };
  return id;
}

function spread(id: string, template: TemplateId, slots: Record<string, Slot> = {}): Spread {
  const filled: Record<string, Slot> = {};
  for (const def of TEMPLATES[template].slots) {
    filled[def.key] = slots[def.key] ?? emptySlotFor(def.kind);
  }
  return { id, template, slots: { ...slots, ...filled }, notes: [] };
}

function emptySlotFor(kind: Slot['kind']): Slot {
  switch (kind) {
    case 'text':
      return txt('');
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

function chapter(
  id: string,
  kind: ChapterKind,
  slug: string,
  title: string,
  kicker: string,
  epigraph: string,
  tone: string,
  spreads: Spread[],
): Chapter {
  return { id, kind, slug, title, kicker, epigraph, tone, spreads };
}

const essay = (id: string, body: string, pull = '', kicker = '', title = '', image?: Slot) =>
  spread(id, 'essay', {
    kicker: txt(kicker),
    title: txt(title),
    body: txt(body),
    pull: txt(pull),
    image: image ?? emptyImage(),
  });

const opener = (id: string, label: string, alt: string) => spread(id, 'opener', { image: img(label, '', alt) });

const items$ = (ids: string[]): Slot => ({ kind: 'items', itemIds: ids });
const meta = (values: Record<string, string>): Slot => ({ kind: 'meta', values });
const swatches = (list: [string, string][]): Slot => ({
  kind: 'swatches',
  swatches: list.map(([name, hex], i): Swatch => ({ id: `sw-${hex.slice(1)}-${i}`, name, hex, note: '' })),
});
const pins = (label: string, alt: string, list: [number, number, string, string][]): Slot => ({
  kind: 'pins',
  assetId: null,
  label,
  alt,
  pins: list.map(([x, y, title, text], i): Pin => ({ id: `pin-${i + 1}-${title.length}`, x, y, title, text, url: '', itemId: null })),
});

function numbered(prefix: string, n: number, name: (i: number) => string, label: (i: number) => string, extra: Partial<Item> = {}) {
  return Array.from({ length: n }, (_, i) =>
    item(`${prefix}-${String(i + 1).padStart(2, '0')}`, name(i + 1), { label: label(i + 1), ...extra }),
  );
}
const two = (n: number) => String(n).padStart(2, '0');

function board(prefix: string, els: Omit<BoardEl, 'id'>[]): Slot {
  return { kind: 'board', elements: els.map((e, i) => ({ ...e, id: `${prefix}-${i + 1}` })) };
}

export function createSeedBook(): Book {
  for (const k of Object.keys(items)) delete items[k];

  // ── Front matter ──────────────────────────────────────────────────────────────
  const front = chapter('ch-front', 'front', 'cover', 'Front matter', '', '', TONES.sage, [
    spread('sp-cover', 'cover', {
      image: img('Exterior — the house from the street', '', 'The sage-green bi-level at 16 Bannehr Street, seen from the street.'),
    }),
    spread('sp-dedication', 'dedication'),
    spread('sp-contents', 'contents'),
  ]);

  // ── Prologue ──────────────────────────────────────────────────────────────────
  const prologue = chapter(
    'ch-prologue',
    'prologue',
    'prologue',
    'The House on Bannehr Street',
    'September 2026',
    'We bought it anyway, or maybe because.',
    TONES.sage,
    [
      opener('sp-prologue-opener', 'Exterior — September, the day we bought it', 'The house on the day it was bought, a blue tarp on one side.'),
      essay(
        'sp-prologue-essay',
        p(
          'It was a sage-green bi-level on a gentle rise, brick below, shutters the colour of olives, three old oaks leaning over the lawn. There was a blue tarp on one side and a pile of debris at the curb. We bought it anyway, or maybe because. By October the front of the house was open to the rafters.',
          'This book is the record of what we are making of it: the walls we took down, the tile we argued about, the vanity we looked at thirty-two different ways. It is not finished. Neither is the house. That is the point of both.',
        ),
        'It is not finished. Neither is the house. That is the point of both.',
        'Prologue',
        'The House on Bannehr Street',
      ),
      spread('sp-prologue-rafters', 'fullbleed', {
        image: img('Exterior — October, open to the rafters', 'By October the front of the house was open to the rafters.', 'The front of the house opened up to the rafters during demolition.'),
      }),
    ],
  );

  // ── 1 · The Approach ──────────────────────────────────────────────────────────
  const concepts = numbered(
    'it-front',
    6,
    (i) => `Front-yard concept ${i}`,
    (i) => `Front yard — concept ${i}`,
    { tags: ['front yard'] },
  );
  const fence = item('it-fence', 'Fence', { label: 'Fence — sample', tags: ['for the dog'] }, 'material');
  const boxwood = item('it-boxwood', 'Boxwood', { label: 'Planting — boxwood', tags: ['planting'] }, 'material');
  const hydrangea = item('it-hydrangea', 'Hydrangea', { label: 'Planting — hydrangea', tags: ['planting'] }, 'material');
  const lamp = item('it-lamppost', 'Lamp post', { label: 'Lamp post', tags: ['lighting'] }, 'material');

  const approach = chapter(
    'ch-approach',
    'chapter',
    'approach',
    'The Approach',
    'Exterior and garden',
    'A house introduces itself from the street.',
    TONES.olive,
    [
      opener('sp-approach-opener', 'Exterior — the front, morning', 'The front of the house from the street.'),
      essay(
        'sp-approach-essay',
        p(
          'Cottage, modern farmhouse, classic American with taste: three words for the same wish, a house that looks cared for without looking fussy. Fresh paint, a fence for the dog, beds of boxwood and hydrangea, a lamp post that finally means something.',
        ),
        'A house that looks cared for without looking fussy.',
      ),
      spread('sp-approach-ba', 'beforeAfter', {
        title: txt('<p>The front</p>'),
        image: img('Front — before', 'Before.', 'The front of the house before the renovation.'),
        image2: img('Front — after, render', 'After.', 'A render of the front of the house after the renovation.'),
      }),
      spread('sp-approach-gallery', 'gallery', {
        title: txt('<p>Six front yards</p>'),
        body: txt(p('Six concepts for the same thirty feet of lawn.')),
        items: items$(concepts),
      }),
      spread('sp-approach-palette', 'palette', {
        title: txt('<p>Fence and planting</p>'),
        swatches: swatches([
          ['Siding — sage', '#8A9A7B'],
          ['Shutters — olive', '#5E6B4A'],
        ]),
        items: items$([fence, boxwood, hydrangea, lamp]),
      }),
      spread('sp-approach-decision', 'decision', {
        title: txt('<p>The front yard</p>'),
        items: items$(concepts),
        meta: meta({ status: 'thinking', cost: '', date: '', chosen: '' }),
      }),
    ],
  );

  // ── 2 · The Vault ─────────────────────────────────────────────────────────────
  const beams = numbered('it-beam', 4, (i) => `Beam study ${i}`, (i) => `Living — beam study ${i}`, { tags: ['beams'] });
  const fire60 = item('it-fire-60', 'Electric, 60″', { label: 'Fireplace — electric, 60″', tags: ['electric'] });
  const fire72 = item('it-fire-72', 'Electric, 72″', { label: 'Fireplace — electric, 72″', tags: ['electric'] });
  const fireGas = item('it-fire-gas', 'Direct-vent gas', { label: 'Fireplace — direct-vent gas', tags: ['gas'] });

  const vault = chapter(
    'ch-vault',
    'chapter',
    'vault',
    'The Vault',
    'Living and dining',
    'We opened the ceiling and the room took a breath.',
    TONES.oak,
    [
      opener('sp-vault-opener', 'Living — the vault, looking toward the bay', 'The living room under the new vaulted ceiling.'),
      essay(
        'sp-vault-essay',
        p(
          'The joists came out and the room went up: a full gable over living and dining, exposed beams, a bay window with a seat deep enough to read in. The open question is the wall under the TV, where a fireplace wants to live.',
        ),
        'A bay window with a seat deep enough to read in.',
      ),
      spread('sp-vault-beams', 'gallery', {
        title: txt('<p>Beam styles</p>'),
        body: txt(p('Exposed beams under the full gable.')),
        items: items$(beams),
      }),
      spread('sp-vault-bay', 'fullbleed', {
        image: img('Living — the bay window seat', 'A seat deep enough to read in.', 'The bay window with its deep window seat.'),
      }),
      spread('sp-vault-fireplace', 'gallery', {
        title: txt('<p>Fireplace options</p>'),
        body: txt(p('The wall under the TV, where a fireplace wants to live.')),
        items: items$([fire60, fire72, fireGas]),
      }),
      spread('sp-vault-dining', 'fullbleed', {
        image: img('Dining — the table under the vault', 'The dining table under the vault.', 'The dining table beneath the vaulted ceiling.'),
      }),
      spread('sp-vault-decision', 'decision', {
        title: txt('<p>The fireplace wall</p>'),
        items: items$([fire60, fire72, fireGas]),
        meta: meta({ status: 'thinking', cost: '', date: '', chosen: '' }),
      }),
    ],
  );

  // ── 3 · A Cook's Kitchen ──────────────────────────────────────────────────────
  const peninsula = item('it-layout-peninsula', 'The peninsula', { label: 'Kitchen — layout, peninsula', tags: ['layout'] });
  const layoutB = item('it-layout-2', 'Layout No. 2', { label: 'Kitchen — layout 2', tags: ['layout'] });
  const layoutC = item('it-layout-3', 'Layout No. 3', { label: 'Kitchen — layout 3', tags: ['layout'] });
  const cabinets = item('it-cabinets', 'Cabinets', { label: 'Kitchen — cabinet sample', tags: ['cabinets'] }, 'material');
  const counter = item('it-counter', 'Countertop', { label: 'Kitchen — counter sample', tags: ['counters'] }, 'material');
  const backsplash = item('it-backsplash', 'Backsplash', { label: 'Kitchen — backsplash sample', tags: ['tile'] }, 'material');
  const shopKitchen = [
    item('it-range', 'Range', { label: 'Appliance — range', status: 'to-buy', tags: ['appliance'] }),
    item('it-fridge', 'Refrigerator, 36-inch', { label: 'Appliance — 36″ fridge', status: 'to-buy', tags: ['appliance'] }),
    item('it-hood', 'Range hood', { label: 'Appliance — hood', status: 'thinking', tags: ['appliance'] }),
    item('it-dishwasher', 'Dishwasher', { label: 'Appliance — dishwasher', status: 'to-buy', tags: ['appliance'] }),
    item('it-stools', 'Peninsula stools', { label: 'Kitchen — stools', status: 'thinking', tags: ['seating'] }),
  ];

  const kitchen = chapter(
    'ch-kitchen',
    'chapter',
    'kitchen',
    'A Cook’s Kitchen',
    '',
    'Thirteen feet by thirteen and a half, and every inch argued over.',
    TONES.clay,
    [
      opener('sp-kitchen-opener', 'Kitchen — render, peninsula view', 'A render of the kitchen looking across the peninsula.'),
      essay(
        'sp-kitchen-essay',
        p(
          'The kitchen keeps its own room, with a wide opening to the dining room and a peninsula with stools, so whoever is cooking faces whoever is talking. The sink sits under the window; the range and a 36-inch fridge share the long wall.',
        ),
        'So whoever is cooking faces whoever is talking.',
      ),
      spread('sp-kitchen-ba', 'beforeAfter', {
        title: txt('<p>The kitchen</p>'),
        image: img('Kitchen — before', 'Before.', 'The kitchen before the renovation.'),
        image2: img('Kitchen — after, render', 'After.', 'A render of the finished kitchen.'),
      }),
      spread('sp-kitchen-layouts', 'gallery', {
        title: txt('<p>Layouts considered</p>'),
        body: txt(p('Thirteen feet by thirteen and a half.')),
        items: items$([peninsula, layoutB, layoutC]),
      }),
      spread('sp-kitchen-plan', 'plan', {
        title: txt('<p>The peninsula plan</p>'),
        body: txt(p('Whoever is cooking faces whoever is talking.')),
        plan: pins('Kitchen — plan, 13′ × 13′6″', 'Floor plan of the kitchen with the peninsula.', [
          [50, 14, 'Sink', 'Under the window.'],
          [16, 48, 'Range', 'On the long wall.'],
          [16, 80, 'Fridge', 'A 36-inch fridge, also on the long wall.'],
          [62, 58, 'Peninsula', 'With stools, facing the dining room.'],
          [88, 70, 'The opening', 'A wide opening to the dining room.'],
        ]),
      }),
      spread('sp-kitchen-palette', 'palette', {
        title: txt('<p>Cabinets and counters</p>'),
        items: items$([cabinets, counter, backsplash]),
      }),
      spread('sp-kitchen-shopping', 'shopping', {
        title: txt('<p>Appliances</p>'),
        items: items$(shopKitchen),
      }),
      spread('sp-kitchen-decision', 'decision', {
        title: txt('<p>The layout</p>'),
        items: items$([peninsula, layoutB, layoutC]),
        body: txt(p('The kitchen keeps its own room, and whoever is cooking faces whoever is talking.')),
        meta: meta({ status: 'decided', cost: '', date: '', chosen: peninsula }),
      }),
    ],
  );

  // ── 4 · The Bath with the Archer ──────────────────────────────────────────────
  const vanities = numbered(
    'it-vanity',
    32,
    (i) => `Vanity No. ${i}`,
    (i) => `Bath — vanity render ${two(i)}`,
    { tags: ['vanity'] },
  );
  const archer = item('it-archer', 'Archer tub, 72-inch', { brand: 'Kohler', label: 'Bath — Kohler Archer', tags: ['tub'] }, 'material');
  const porcelain = item('it-porcelain', 'Large gray porcelain', { label: 'Bath — porcelain tile', tags: ['tile'] }, 'material');
  const screen = item('it-screen', 'Fixed glass screen', { label: 'Bath — glass screen', tags: ['glass'] }, 'material');
  const fixtures = item('it-bath-fixtures', 'Tub and basin fittings', { label: 'Bath — fittings', tags: ['fixtures', 'water'] }, 'material');

  const archerBath = chapter(
    'ch-archer',
    'chapter',
    'archer-bath',
    'The Bath with the Archer',
    'The main bath',
    'Seventy-two inches of tub, and a window over it.',
    TONES.stone,
    [
      opener('sp-archer-opener', 'Bath — the Archer under the window', 'The 72-inch tub beneath the window.'),
      essay(
        'sp-archer-essay',
        p(
          'One old bathroom became two, and two bedroom closets gave up their space to make it happen. A 72-inch Kohler Archer runs along one wall under a fixed glass screen, wrapped in large gray porcelain. A single vanity sits in the corner by the window, and we rendered thirty-two of them before choosing.',
        ),
        'We rendered thirty-two of them before choosing.',
      ),
      spread('sp-archer-plan', 'plan', {
        title: txt('<p>One bathroom became two</p>'),
        body: txt(p('Two bedroom closets gave up their space to make it happen.')),
        plan: pins('Bath — plan', 'Floor plan of the bath with the tub and vanity.', [
          [50, 18, 'The Archer', 'A 72-inch Kohler Archer along one wall.'],
          [50, 34, 'Glass screen', 'Fixed, over the tub.'],
          [82, 74, 'Vanity', 'A single vanity in the corner by the window.'],
          [24, 70, 'Porcelain', 'Large gray porcelain, all around.'],
        ]),
      }),
      spread('sp-archer-vanities', 'gallery', {
        title: txt('<p>Thirty-two vanities</p>'),
        body: txt(p('We rendered thirty-two of them before choosing.')),
        items: items$(vanities),
      }),
      spread('sp-archer-palette', 'palette', {
        title: txt('<p>Tile and fixtures</p>'),
        items: items$([archer, porcelain, screen, fixtures]),
      }),
      spread('sp-archer-decision', 'decision', {
        title: txt('<p>The vanity</p>'),
        items: items$(vanities.slice(0, 6)),
        meta: meta({ status: 'decided', cost: '', date: '', chosen: '' }),
      }),
    ],
  );

  // ── 5 · The Small Bath ────────────────────────────────────────────────────────
  const smallLayouts = numbered('it-small-layout', 3, (i) => `Layout No. ${i}`, (i) => `Small bath — layout ${i}`, { tags: ['layout'] });
  const smallBath = chapter(
    'ch-small',
    'chapter',
    'small-bath',
    'The Small Bath',
    'The second bath',
    'Fifty-eight inches, used well.',
    TONES.dusk,
    [
      opener('sp-small-opener', 'Small bath — fifty-eight inches', 'The small bathroom.'),
      essay('sp-small-essay', p('A shower, a vanity, a toilet, and no wasted motion.'), 'No wasted motion.'),
      spread('sp-small-layouts', 'gallery', {
        title: txt('<p>Layouts</p>'),
        body: txt(p('Fifty-eight inches, three ways.')),
        items: items$(smallLayouts),
      }),
      spread('sp-small-palette', 'palette', {
        title: txt('<p>Palette</p>'),
        items: items$([
          item('it-small-tile', 'Shower tile', { label: 'Small bath — tile sample', tags: ['tile'] }, 'material'),
          item('it-small-vanity', 'Vanity', { label: 'Small bath — vanity', tags: ['vanity'] }, 'material'),
          item('it-small-fittings', 'Shower fittings', { label: 'Small bath — fittings', tags: ['fixtures', 'water'] }, 'material'),
        ]),
      }),
      spread('sp-small-decision', 'decision', {
        title: txt('<p>The layout</p>'),
        items: items$(smallLayouts),
        meta: meta({ status: 'thinking', cost: '', date: '', chosen: '' }),
      }),
    ],
  );

  // ── 6 · Rest ──────────────────────────────────────────────────────────────────
  const rest = chapter('ch-rest', 'chapter', 'rest', 'Rest', 'Bedrooms', 'The quiet end of the house.', TONES.moss, [
    opener('sp-rest-opener', 'Bedroom — morning light', 'A bedroom in the morning.'),
    essay(
      'sp-rest-essay',
      p(
        'This essay is waiting to be written. When the bedrooms are finished, this page is for the first quiet morning in them: the light, the curtains, what can be heard from the end of the hall.',
      ),
      '',
    ),
    spread('sp-rest-full', 'fullbleed', {
      image: img('Bedroom — the quiet end of the hall', '', 'The hallway leading to the bedrooms.'),
    }),
  ]);

  // ── 7 · Below ─────────────────────────────────────────────────────────────────
  const below = chapter(
    'ch-below',
    'chapter',
    'below',
    'Below',
    'The lower level',
    'Every house has a room that has not decided what it is yet.',
    TONES.loam,
    [
      opener('sp-below-opener', 'Lower level — as found', 'The lower level as it was found.'),
      essay(
        'sp-below-essay',
        p('This essay is waiting to be written. A gym, a library, a room for the dog, a place for guests: this page is for the room once it has decided.'),
      ),
      spread('sp-below-board', 'moodboard', {
        title: txt('<p>What it could be</p>'),
        board: board('el-below', [
          { type: 'image', x: 4, y: 8, w: 30, h: 46, rotate: -1.5, z: 1, assetId: null, label: 'Lower level — as found' },
          { type: 'image', x: 38, y: 4, w: 26, h: 34, rotate: 1, z: 2, assetId: null, label: 'Reference — a reading room' },
          { type: 'image', x: 68, y: 10, w: 28, h: 40, rotate: -0.5, z: 3, assetId: null, label: 'Reference — a home gym' },
          { type: 'swatch', x: 40, y: 44, w: 10, h: 18, rotate: 0, z: 4, hex: '#B08B5E', label: 'Oak' },
          { type: 'swatch', x: 52, y: 46, w: 10, h: 18, rotate: 0, z: 5, hex: '#8A9A7B', label: 'Sage' },
          { type: 'text', x: 8, y: 62, w: 36, h: 20, rotate: 0, z: 6, text: 'Every house has a room that has not decided what it is yet.' },
          { type: 'note', x: 66, y: 60, w: 24, h: 22, rotate: 2, z: 7, text: 'Room for the dog bed?', author: 'adi' },
        ]),
      }),
    ],
  );

  // ── 8 · Outside ───────────────────────────────────────────────────────────────
  const outside = chapter(
    'ch-outside',
    'chapter',
    'outside',
    'Outside',
    'Deck and yard',
    'Summer starts at the top of the stairs.',
    TONES.sage,
    [
      opener('sp-outside-opener', 'Deck — the top of the stairs', 'The deck seen from the top of the stairs.'),
      essay(
        'sp-outside-essay',
        p('This essay is waiting to be written. It is for the first warm evening on the deck: who was there, what was on the grill, where the dog fell asleep.'),
      ),
      spread('sp-outside-board', 'moodboard', {
        title: txt('<p>Summer</p>'),
        board: board('el-outside', [
          { type: 'image', x: 3, y: 6, w: 40, h: 52, rotate: 0, z: 1, assetId: null, label: 'Deck — as found' },
          { type: 'image', x: 47, y: 10, w: 24, h: 32, rotate: 1.5, z: 2, assetId: null, label: 'Reference — deck railing' },
          { type: 'image', x: 74, y: 4, w: 23, h: 40, rotate: -1, z: 3, assetId: null, label: 'Reference — outdoor dining' },
          { type: 'swatch', x: 50, y: 50, w: 10, h: 18, rotate: 0, z: 4, hex: '#5E6B4A', label: 'Olive' },
          { type: 'swatch', x: 62, y: 52, w: 10, h: 18, rotate: 0, z: 5, hex: '#B0452A', label: 'Clay' },
          { type: 'text', x: 6, y: 66, w: 38, h: 18, rotate: 0, z: 6, text: 'Summer starts at the top of the stairs.' },
        ]),
      }),
    ],
  );

  // ── 9 · The Palette ───────────────────────────────────────────────────────────
  const palette = chapter('ch-palette', 'chapter', 'palette', 'The Palette', 'Materials library', 'A materials library for the whole house.', TONES.oak, [
    opener('sp-palette-opener', 'Materials — samples on the table', 'Material samples laid out on a table.'),
    spread('sp-palette-house', 'palette', {
      title: txt('<p>The house colours</p>'),
      body: txt(p('Taken from the house itself.')),
      swatches: swatches([
        ['Siding — sage', '#8A9A7B'],
        ['Shutters — olive', '#5E6B4A'],
        ['Oak', '#B08B5E'],
        ['Clay', '#B0452A'],
        ['Paper', '#F5F1EA'],
        ['Ink', '#1F1D1A'],
      ]),
    }),
    spread('sp-palette-library', 'library', {
      title: txt('<p>Materials library</p>'),
      body: txt(p('Every material in this book, with its Clean materials panel. Blank means not yet checked.')),
    }),
  ]);

  // ── Epilogue ──────────────────────────────────────────────────────────────────
  const epilogue = chapter('ch-epilogue', 'epilogue', 'epilogue', 'Still to Decide', '', '', TONES.clay, [
    spread('sp-still', 'stillToDecide', {
      title: txt('<p>Still to Decide</p>'),
      body: txt(p('Everything still open, gathered from the rest of the book. It updates itself.')),
    }),
    spread('sp-first-dinner', 'title', {
      title: txt('<p>The First Dinner</p>'),
      body: txt(''),
    }),
  ]);

  const book: Book = {
    id: 'book-sixteen-bannehr',
    schema: 1,
    title: 'Sixteen Bannehr',
    subtitle: 'A book about a house, in progress.',
    address: '16 Bannehr Street · Oakland, New Jersey',
    dedication: p('For Sonny, who saw the kitchen before there was a kitchen.'),
    theme: structuredClone(DEFAULT_THEME),
    chapters: [front, prologue, approach, vault, kitchen, archerBath, smallBath, rest, below, outside, palette, epilogue],
    items: { ...items },
    placedBundled: [],
    updatedAt: new Date(0).toISOString(),
  };

  // One note in the margin, so the first thing Sonny finds in Edit mode is a reply waiting.
  book.chapters[0].spreads[1].notes.push({
    id: 'note-welcome',
    author: 'adi',
    text: 'Happy reading. Write back in the margins.',
    page: 'recto',
    x: 62,
    y: 72,
    resolved: false,
    createdAt: new Date(0).toISOString(),
  });

  return book;
}
