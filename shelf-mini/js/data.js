// Sample data: the twelve items on the shelf and the categories they belong to.
// Everything here is fictional and local. Artwork is drawn from `art` by artwork.js.

export const CATEGORIES = [
  { id: 'film', label: 'Film', singular: 'Film' },
  { id: 'book', label: 'Books', singular: 'Book' },
  { id: 'music', label: 'Music', singular: 'Music' },
  { id: 'game', label: 'Games', singular: 'Game' },
];

export const ITEMS = [
  {
    id: 'night-ferry',
    title: 'Night Ferry',
    category: 'film',
    year: 2019,
    credit: 'Directed by Mara Okafor',
    detail: '1 h 48 min',
    description:
      'A deckhand on the last crossing of the season has eleven hours, one stowaway and no signal. A slow, lamp-lit thriller about who gets to go home.',
    art: { motif: 'horizon', colors: ['#12333a', '#0b2228', '#f2b880', '#f7e6cf'] },
  },
  {
    id: 'the-long-exposure',
    title: 'The Long Exposure',
    category: 'film',
    year: 2022,
    credit: 'Directed by Tomás Reyes',
    detail: '2 h 3 min',
    description:
      'A night photographer leaves his shutter open on a desert ridge and catches more than stars. Patient, eerie and beautifully lit.',
    art: { motif: 'startrails', colors: ['#10152a', '#e9e4f2', '#070912'] },
  },
  {
    id: 'orchid-house',
    title: 'Orchid House',
    category: 'film',
    year: 2017,
    credit: 'Directed by Lea Brandt',
    detail: '1 h 36 min',
    description:
      'Two sisters try to keep a failing orchid nursery alive through the driest summer on record. Small, warm and quietly funny.',
    art: { motif: 'glasshouse', colors: ['#dfe6d3', '#3d5a46', '#c2307a', '#c7d2ba'] },
  },
  {
    id: 'nightjar',
    title: 'Nightjar',
    category: 'book',
    year: 2020,
    credit: 'A novel by Hana Sato',
    detail: '312 pages',
    description:
      'A birdwatcher who only works after dark starts logging a species that should not exist. Part field journal, part ghost story.',
    art: { motif: 'crescent', colors: ['#2b2233', '#e8dcc8', '#17111c'] },
  },
  {
    id: 'salt-and-iron',
    title: 'Salt & Iron',
    category: 'book',
    year: 2016,
    credit: 'Essays by Ruth Adeyemi',
    detail: '224 pages',
    description:
      'Twelve essays on shipyards, kitchens and the work that holds a coastal town together. Plain-spoken and hard to put down.',
    art: { motif: 'blocks', colors: ['#e9e1d3', '#8a2f25', '#1d1b19', '#f6f1e8'] },
  },
  {
    id: 'the-quiet-engine',
    title: 'The Quiet Engine',
    category: 'book',
    year: 2023,
    credit: 'Non-fiction by Owen Marsh',
    detail: '288 pages',
    description:
      'How sleep repairs the brain, told through night-shift nurses, long-haul pilots and one stubborn insomniac. Clear, humane science.',
    art: { motif: 'gears', colors: ['#1f2a44', '#c5d2e8', '#f0c419'] },
  },
  {
    id: 'night-swim',
    title: 'Night Swim',
    category: 'music',
    year: 2021,
    credit: 'An album by Ines Morrow',
    detail: '9 tracks · 41 min',
    description:
      'Slow piano and tape hiss, recorded in a lakeside cabin over one winter. Music for the last hour before sleep.',
    art: { motif: 'ripples', colors: ['#0b2a4a', '#7fb2d9', '#f3eee6'] },
  },
  {
    id: 'paper-satellites',
    title: 'Paper Satellites',
    category: 'music',
    year: 2018,
    credit: 'An EP by The Halyards',
    detail: '5 tracks · 22 min',
    description:
      'Bright, jangling guitar songs about long-distance love and cheap telescopes. Twenty-two minutes that feel like a whole summer.',
    art: { motif: 'orbits', colors: ['#d9d2c5', '#2c2a28', '#e2552c'] },
  },
  {
    id: 'velvet-static',
    title: 'Velvet Static',
    category: 'music',
    year: 2024,
    credit: 'An album by Kobi Lane',
    detail: '11 tracks · 47 min',
    description:
      'Warm synths, slow drums and a voice that sits right in the middle of the noise. A late-night drive in record form.',
    art: { motif: 'waves', colors: ['#2a0f22', '#ff5fa2'] },
  },
  {
    id: 'lanternfall',
    title: 'Lanternfall',
    category: 'game',
    year: 2022,
    credit: 'An adventure by Hollow Pine',
    detail: 'Single player · about 12 hours',
    description:
      'Carry one lantern down a mountain as the light fades. Every place you choose to shine it leaves somewhere else in the dark.',
    art: { motif: 'mountains', colors: ['#3a2547', '#5b3a66', '#2a1a35', '#160d1e', '#ffb547'] },
  },
  {
    id: 'tilewright',
    title: 'Tilewright',
    category: 'game',
    year: 2019,
    credit: 'A puzzle game by Moth & Key',
    detail: '1–2 players · 200 puzzles',
    description:
      'Turn tiles until the pattern locks into place. Gentle at first, devious by the end, and never in a hurry.',
    art: { motif: 'truchet', colors: ['#e7c453', '#1f4e5a'] },
  },
  {
    id: 'orchard-nine',
    title: 'Orchard Nine',
    category: 'game',
    year: 2021,
    credit: 'A farming game by Field Day',
    detail: 'Single player · open-ended',
    description:
      'Plant, prune and trade across nine seasons on a hillside orchard. A calm game about patience and good soil.',
    art: { motif: 'dots', colors: ['#1d3324', '#4f7a4a', '#e86f4a'] },
  },
];

export const ITEM_IDS = new Set(ITEMS.map((item) => item.id));
export const CATEGORY_IDS = new Set(CATEGORIES.map((category) => category.id));

export function getItem(id) {
  return ITEMS.find((item) => item.id === id) ?? null;
}

export function getCategory(id) {
  return CATEGORIES.find((category) => category.id === id) ?? null;
}
