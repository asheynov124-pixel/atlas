export interface Option {
  id: string;
  name: string;
  note: string;
  hex?: string;
  /** Typical installed cost, USD per unit, low–high. */
  cost?: [number, number];
  unit?: string;
}

export const FLOORS: Option[] = [
  { id: 'oak', name: 'White oak, wide plank', note: 'Matte oil. The honest default.', hex: '#c9a673', cost: [9, 18], unit: 'sq ft installed' },
  { id: 'oak-herringbone', name: 'White oak herringbone', note: 'The pattern is the room. Keep the walls plain.', hex: '#c4a06a', cost: [14, 28], unit: 'sq ft installed' },
  { id: 'walnut', name: 'Walnut', note: 'Lounges and libraries. Hides dust, shows scratches.', hex: '#5a3d2c', cost: [12, 24], unit: 'sq ft installed' },
  { id: 'limestone', name: 'Honed limestone', note: 'Entries, baths, a kitchen that can take a cool floor.', hex: '#d9d2c5', cost: [15, 40], unit: 'sq ft installed' },
  { id: 'terracotta', name: 'Terracotta', note: 'Irregular and warm. Best where shoes come off.', hex: '#b8714f', cost: [10, 25], unit: 'sq ft installed' },
  { id: 'mineral', name: 'Trowel plaster / microcement', note: 'A mineral floor. Quiet with oak, loud with a gray sofa.', hex: '#cfc6ba', cost: [12, 30], unit: 'sq ft installed' },
  { id: 'checker', name: 'Marble checkerboard', note: 'One pattern for the whole house. Put it in the entry and nowhere else.', hex: '#e8e2d8', cost: [18, 45], unit: 'sq ft installed' },
  { id: 'wool-carpet', name: 'Wool carpet', note: 'Bedrooms only. Loop, not shag, in oat.', hex: '#d8ccb6', cost: [6, 14], unit: 'sq ft installed' },
];

export const FINISHES: Option[] = [
  { id: 'limewash', name: 'Limewash', note: 'Clouds of pigment. Hides a bad drywall tape job.', cost: [3, 6], unit: 'sq ft applied' },
  { id: 'smooth', name: 'Flat paint', note: 'Quiet. Use it when the texture is in the cloth and the wood.', cost: [1.5, 3.5], unit: 'sq ft applied' },
  { id: 'eggshell', name: 'Eggshell paint', note: 'A whisper of sheen for halls and kids\' rooms. Wipes clean.', cost: [1.5, 3.5], unit: 'sq ft applied' },
  { id: 'venetian', name: 'Venetian plaster', note: 'Burnished. Best on one wall you can light.', cost: [8, 18], unit: 'sq ft applied' },
  { id: 'roman-clay', name: 'Roman clay', note: 'Matte, chalky, suede-like. The grown-up limewash.', cost: [5, 10], unit: 'sq ft applied' },
  { id: 'tadelakt', name: 'Tadelakt', note: 'Waterproof plaster for a shower that wants no grout lines.', cost: [25, 60], unit: 'sq ft applied' },
  { id: 'vgroove', name: 'V-groove paneling', note: 'Painted boards to the chair rail or the ceiling. Cottage, if you commit.', cost: [8, 16], unit: 'sq ft installed' },
];

export const METALS: Option[] = [
  { id: 'brass', name: 'Unlacquered brass', hex: '#b08d57', note: 'It darkens where hands touch it. Let it.' },
  { id: 'aged-brass', name: 'Aged brass', hex: '#9a7b4b', note: 'Lacquered to look like it has already lived. Lower maintenance, less alive.' },
  { id: 'blackened', name: 'Blackened steel', hex: '#2c2926', note: 'Windows, a table, a picture light. Not every knob.' },
  { id: 'nickel', name: 'Soft nickel', hex: '#c5c1ba', note: 'The cool metal. Only with cool stone.' },
  { id: 'bronze', name: 'Oil-rubbed bronze', hex: '#4a3a30', note: 'Warm dark. Easier than black against oak.' },
  { id: 'chrome', name: 'Polished chrome', hex: '#d9dadb', note: 'Only in a bath that is entirely cool and glossy. Never beside brass.' },
];

export const CLOTHS: Option[] = [
  { id: 'oat-linen', name: 'Oat linen', hex: '#e7dcc8', note: 'The default. Shows its slub.' },
  { id: 'bone-linen', name: 'Bone linen', hex: '#f3efe6', note: 'Lighter. Needs a rug with some value.' },
  { id: 'boucle', name: 'Cream boucle', hex: '#ede6d8', note: 'Nubby. One piece, not three.' },
  { id: 'clay-wool', name: 'Clay wool', hex: '#a85a45', note: 'The dark on a pale sofa.' },
  { id: 'cognac', name: 'Cognac leather', hex: '#8a5a3a', note: 'Better after dark.' },
  { id: 'ink-wool', name: 'Ink wool', hex: '#3a3632', note: 'Quiet dark. Wants a lighter rug.' },
  { id: 'moss-wool', name: 'Moss wool', hex: '#5c6854', note: 'A library chair.' },
  { id: 'mohair', name: 'Sand mohair', hex: '#d2bb94', note: 'Velvet that does not shine. For one chair.' },
  { id: 'stripe', name: 'Ticking stripe', hex: '#dcd6c9', note: 'The one pattern. Pillows or a headboard, not both.' },
];

export const FRAMES: Option[] = [
  { id: 'square', name: 'Modern square', note: 'One flat stock. The shadow line does the work.', cost: [4, 8], unit: 'linear ft installed' },
  { id: 'craftsman', name: 'Craftsman', note: 'Thicker casing and a real base. Makes drywall feel built.', cost: [7, 14], unit: 'linear ft installed' },
  { id: 'ogee', name: 'Soft ogee', note: 'A curve, not a costume. Use it once — windows or art.', cost: [6, 12], unit: 'linear ft installed' },
  { id: 'floater', name: 'Floater', note: 'The wall color becomes the mat. Needs a calm wall.', cost: [3, 6], unit: 'linear ft installed' },
  { id: 'gallery', name: 'Gallery metal', note: 'Thin metal. The picture stays larger than the frame.', cost: [2, 5], unit: 'linear ft installed' },
  { id: 'none', name: 'No casing (drywall return)', note: 'Modern and unforgiving. Your drywall contractor must be very good.', cost: [2, 4], unit: 'linear ft installed' },
];

export const COUNTERS: Option[] = [
  { id: 'honed-marble', name: 'Honed marble', note: 'It will etch. That is the patina you are paying for.', hex: '#e9e4dc', cost: [70, 150], unit: 'sq ft installed' },
  { id: 'soapstone', name: 'Soapstone', note: 'Dark, soft, oilable. Hides nothing and forgives everything.', hex: '#44484a', cost: [80, 160], unit: 'sq ft installed' },
  { id: 'quartzite', name: 'Quartzite', note: 'Looks like marble, behaves like granite. Check it is real quartzite.', hex: '#e2ddd3', cost: [80, 180], unit: 'sq ft installed' },
  { id: 'quartz', name: 'Engineered quartz', note: 'Perfectly even. Choose one with little veining or it looks printed.', hex: '#ebe8e2', cost: [60, 120], unit: 'sq ft installed' },
  { id: 'butcher', name: 'Oak butcher block', note: 'On the island only, and oil it on the first Sunday of the month.', hex: '#c9a673', cost: [35, 80], unit: 'sq ft installed' },
  { id: 'limestone-top', name: 'Honed limestone', note: 'For a vanity, not a kitchen.', hex: '#d9d2c5', cost: [60, 120], unit: 'sq ft installed' },
  { id: 'concrete', name: 'Cast concrete', note: 'Heavy, cool, a little industrial. Seal it well.', hex: '#b9b4ab', cost: [70, 140], unit: 'sq ft installed' },
];

export const TILES: Option[] = [
  { id: 'zellige', name: 'Cream zellige', note: 'Handmade, uneven, glossy. Backsplash or niche. The variation is the point.', hex: '#ebe3d2', cost: [12, 35], unit: 'sq ft material' },
  { id: 'subway', name: 'Handmade subway', note: 'Only the kind with a wobbly edge. Machine-made subway is a rental.', hex: '#f0ebe2', cost: [8, 22], unit: 'sq ft material' },
  { id: 'limestone-tile', name: 'Limestone 12×24', note: 'Floors and shower walls. Honed, never polished.', hex: '#d9d2c5', cost: [10, 28], unit: 'sq ft material' },
  { id: 'terracotta-tile', name: 'Terracotta square', note: 'Mudroom, laundry, a bath that can take color.', hex: '#b8714f', cost: [8, 25], unit: 'sq ft material' },
  { id: 'checker-tile', name: 'Marble checker', note: 'One pattern. Entry or powder.', hex: '#e8e2d8', cost: [14, 40], unit: 'sq ft material' },
  { id: 'penny', name: 'Unglazed penny round', note: 'Shower floors. Grip, and a thousand grout lines that look right.', hex: '#d8d2c6', cost: [10, 20], unit: 'sq ft material' },
  { id: 'slab', name: 'Slab marble', note: 'Shower walls without grout. Expensive and very quiet.', hex: '#e9e4dc', cost: [60, 150], unit: 'sq ft installed' },
];

export const HARDWARE: Option[] = [
  { id: 'edge-pull', name: 'Edge pulls', note: 'Nearly invisible. For flat oak.', cost: [8, 30], unit: 'each' },
  { id: 'cup-pull', name: 'Cup pulls + knobs', note: 'Cup on drawers, knob on doors. The classic set.', cost: [10, 45], unit: 'each' },
  { id: 'bar-pull', name: 'Long bar pulls', note: 'Modern. One length for everything, or two at most.', cost: [12, 60], unit: 'each' },
  { id: 'latch', name: 'Cabinet latches', note: 'A little turn. Pantry doors and a cottage kitchen.', cost: [20, 80], unit: 'each' },
  { id: 'none-hw', name: 'No hardware (push-to-open)', note: 'Fine on flat fronts. Maddening on a drawer full of pots.', cost: [4, 12], unit: 'each' },
];

export const CEILINGS: Option[] = [
  { id: 'flat-white', name: 'Flat paint, a half-step lighter than the wall', note: 'The default. Chalk or Candle.', cost: [1.5, 3], unit: 'sq ft applied' },
  { id: 'same-as-wall', name: 'Same color as the walls', note: 'Makes a small room feel like a jewel box. Powder rooms, dens.', cost: [1.5, 3], unit: 'sq ft applied' },
  { id: 'beams', name: 'Oak beams', note: 'Only where the ceiling is high. Beams on an 8-foot ceiling is a hat on a hat.', cost: [25, 60], unit: 'linear ft installed' },
  { id: 'vgroove-ceiling', name: 'V-groove boards', note: 'Porches, mudrooms, a cottage kitchen.', cost: [8, 16], unit: 'sq ft installed' },
  { id: 'limewash-ceiling', name: 'Limewash', note: 'Soft clouds overhead. In a bedroom, with a lamp, this is lovely.', cost: [3, 6], unit: 'sq ft applied' },
];

export const WINDOW_TREATMENTS: Option[] = [
  { id: 'linen-panels', name: 'Linen panels, pleated', note: 'Hung high, just kissing the floor. 2.5× fullness.', cost: [120, 400], unit: 'panel' },
  { id: 'roman', name: 'Relaxed roman shade', note: 'When the sill holds a faucet or a plant.', cost: [150, 500], unit: 'shade' },
  { id: 'woven', name: 'Woven wood shade', note: 'Texture without pattern. Add a liner if it faces the street.', cost: [120, 400], unit: 'shade' },
  { id: 'sheer', name: 'Sheer linen', note: 'Privacy by day, nothing by night. Layer it under panels.', cost: [80, 250], unit: 'panel' },
  { id: 'shutters', name: 'Interior shutters', note: 'Baths and a coastal kitchen. Painted the trim color.', cost: [25, 45], unit: 'sq ft' },
  { id: 'bare', name: 'Bare window', note: 'If the view is good and the neighbors are far. The casing is the treatment.', cost: [0, 0], unit: 'window' },
];

export const LIGHT_TEMPS = [
  { k: 2200, name: 'Candle', note: 'Sconces on a dimmer, dining after ten.' },
  { k: 2700, name: 'Warm', note: 'Every lamp in a living room or bedroom.' },
  { k: 3000, name: 'Soft', note: 'Kitchens and baths, where you chop and shave.' },
  { k: 3500, name: 'Neutral', note: 'A garage or a laundry. Nowhere you sit.' },
  { k: 4000, name: 'Cool', note: 'Makes oak look green and people look ill.' },
];

export const MOOD_PALETTES: { moods: string[]; ids: string[]; roles: string[] }[] = [
  { moods: ['Sunwashed', 'Cottage', 'Gathered'], ids: ['bone', 'oat', 'clay', 'ink'], roles: ['Walls', 'Cloth', 'Accent', 'Dark'] },
  { moods: ['Quiet', 'Mineral'], ids: ['slate', 'stone', 'bone', 'ink'], roles: ['Walls', 'Stone', 'Trim', 'Dark'] },
  { moods: ['Cinematic', 'Library'], ids: ['ink', 'walnut', 'brassdust', 'bone'], roles: ['Walls', 'Wood', 'Metal', 'Relief'] },
  { moods: ['Jewel'], ids: ['clay', 'blush', 'bone', 'oakshadow'], roles: ['Walls', 'Soft', 'Trim', 'Wood'] },
  { moods: ['Cottage', 'Sunwashed'], ids: ['linen', 'candle', 'terra', 'oakshadow'], roles: ['Walls', 'Ceiling', 'Clay', 'Wood'] },
  { moods: ['Library', 'Quiet'], ids: ['moss', 'bone', 'oakshadow', 'brassdust'], roles: ['Walls', 'Trim', 'Wood', 'Metal'] },
  { moods: ['Coastal', 'Quiet'], ids: ['chalk', 'sage', 'sand', 'denim'], roles: ['Walls', 'Cabinets', 'Cloth', 'Dark'] },
  { moods: ['Gathered', 'Library'], ids: ['putty', 'forest', 'bone', 'cocoa'], roles: ['Walls', 'Cabinets', 'Trim', 'Dark'] },
];

export const opt = (list: Option[], id: string): Option => list.find((o) => o.id === id) ?? list[0];
