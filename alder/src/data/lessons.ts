import { IMG } from './catalog';
import type { StudioState } from '../lib/types';

export interface Lesson {
  id: string;
  title: string;
  kicker: string;
  minutes: number;
  image: string;
  lede: string;
  sections: { heading: string; body: string }[];
  try?: { label: string; studio: Partial<StudioState> }[];
  related: string[];
  /** A quick self-check. */
  quiz?: { q: string; options: string[]; answer: number; why: string }[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'color-in-the-room', title: 'Color is a room, not a chip', minutes: 4, image: IMG('living'), kicker: 'Color',
    lede: 'A chip in daylight is a rumor. The same paint on a north wall at 8pm is a different color, and that is the one you live with.',
    sections: [
      { heading: 'Undertone before name', body: 'Bone Milk and Slate Milk are both light. One leans yellow-pink, the other blue-gray. Oak, brass, and cream stone want the yellow-pink. Cool marble wants the blue-gray. If you mix them, the oak looks dirty or the marble looks yellow. Pick the undertone from the material you cannot change — usually the floor.' },
      { heading: 'Value does the work', body: 'A room feels calm when the wall, the sofa, and the floor are close in value and one thing is darker: a walnut table, a clay throw, a soot door. If everything is a different hue at the same lightness, the eye cannot rest. That is the busy room that still has no pattern.' },
      { heading: 'LRV is the number on the back of the chip', body: 'Light Reflectance Value runs from 0 (a black hole) to 100 (a lightbulb). Walls above 60 feel airy. Between 25 and 60 is a color you notice. Below 25 is a mood. A north room wants to start ten points higher than you think.' },
      { heading: 'Test it where it will live', body: 'Paint a board, not a postage stamp on the wall. Stand it on the floor, then on the wall, then look at it with the lamp you will actually use. North light needs a warmer mix. South light can take River Stone. A powder room with one window can take Clay Wash because you leave it.' },
    ],
    try: [
      { label: 'Bone Milk, oak floor', studio: { room: 'living', wall: 'bone', floor: 'oak', warmth: 62 } },
      { label: 'Clay Wash, small and deep', studio: { room: 'bath', wall: 'clay', floor: 'limestone', finish: 'limewash', warmth: 48 } },
      { label: 'Soft Soot, evening', studio: { room: 'lounge', wall: 'ink', floor: 'walnut', warmth: 86, metal: 'blackened' } },
    ],
    related: ['limewash-paint', 'flat-paint', 'wool-rug', 'clay-throw'],
    quiz: [{ q: 'Your floor is warm white oak and the counters are cream marble. Which white?', options: ['Slate Milk (blue-gray)', 'Bone Milk (yellow-pink)', 'Either, whites are neutral'], answer: 1, why: 'Pick the undertone from the material you cannot change. Oak and cream stone want the yellow-pink family.' }],
  },
  {
    id: 'texture-first', title: 'Texture before pattern', minutes: 4, image: IMG('linen'), kicker: 'Texture',
    lede: 'Pattern asks to be matched. Texture asks to be touched. Most rooms that feel expensive are doing the second thing.',
    sections: [
      { heading: 'Three textures, one pattern at most', body: 'A working set: mineral wall (limewash or plaster), a hard grain (oak or stone), a soft field (linen or wool). That is a room. A fourth pattern — a geometric tile, a striped rug, a floral shade — has to be the only pattern. If you want zellige, the rug stays plain.' },
      { heading: 'Scale of the texture', body: 'Boucle on a whole sofa is enough nubs. Do not also boucle the pillows, the chair, and the ottoman. Flute the pantry, not the island and the mirror. Large fields of one texture read as material. Small repeats of it read as a theme.' },
      { heading: 'Light is what reveals it', body: 'Limewash looks flat under a ceiling can and alive in a side window. If your room is mostly lit from above, add a floor lamp or a sconce so the wall gets a rake of light. Otherwise you paid for texture nobody can see.' },
    ],
    try: [
      { label: 'Limewash and linen', studio: { finish: 'limewash', floor: 'oak', cloth: 'oat-linen', pieces: ['sofa', 'rug', 'curtains', 'art', 'floorlamp'] } },
      { label: 'Venetian, one quiet wall', studio: { finish: 'venetian', wall: 'linen', floor: 'limestone', pieces: ['sideboard', 'art', 'pendant'] } },
    ],
    related: ['zellige', 'linen-curtain', 'boucle-sofa', 'fluted-sideboard'],
  },
  {
    id: 'framing', title: 'Framing decides the room', minutes: 5, image: IMG('entry'), kicker: 'Framing',
    lede: 'Casings, baseboards, picture frames, and the edge of a rug are the same problem: where one material stops and another starts.',
    sections: [
      { heading: 'The shadow line', body: 'A modern square casing works because of the shadow it throws, not because it is trendy. If your drywall is wavy, a thin square stock shows every dip. A craftsman casing with a backband is more forgiving and makes a builder-grade room feel assembled. Pick one language and run it through doors, windows, and base.' },
      { heading: 'Picture frames are architecture', body: 'A wide oak frame is a small piece of millwork. A thin metal frame is a line. On a Bone Milk wall, oak belongs. On Soft Soot, metal disappears correctly and oak can look like a sticker. The floater frame only works when the wall color is good enough to be the mat.' },
      { heading: 'Rugs frame furniture', body: 'A rug that stops halfway under a sofa cuts the legs off in the worst way. All legs on, or the front legs on and the back legs off with intention. The rug should be larger than the coffee table by a walkable margin. If you cannot afford that size, use a flatweave that is big and plain rather than a small ornate one.' },
      { heading: 'Base and casing, together', body: 'A 7-inch base under a 3½-inch casing is the proportion that looks built. A 3-inch base under a 5-inch casing looks like the builder ran out. If the budget allows only one upgrade, make it the base: it runs the whole room.' },
    ],
    try: [
      { label: 'Try square casing', studio: { frame: 'square', room: 'living' } },
      { label: 'Try craftsman', studio: { frame: 'craftsman', room: 'entry' } },
      { label: 'Try a gallery frame', studio: { frame: 'gallery', room: 'lounge', wall: 'ink' } },
    ],
    related: ['oak-frame', 'gallery-frame', 'casing', 'baseboard', 'wool-rug'],
  },
  {
    id: 'light-layers', title: 'Three layers of light', minutes: 4, image: IMG('lounge'), kicker: 'Light',
    lede: 'A single ceiling fixture makes every material look cheaper. Rooms need light from more than one height.',
    sections: [
      { heading: 'Daylight is a material', body: 'North light is blue and steady. South light is warm and moves. East is morning, then gone. West is the hour that flatters plaster and punishes a cool gray. Do not pick Slate Milk for a room that only lives at night under lamps — it will look blue-gray and tired. Candle or Bone Milk will hold.' },
      { heading: 'The three heights', body: 'A soft wash up high (a pendant, a concealed cove, even a simple ceiling light on a dimmer). A shade at seated eye level (a floor lamp, a table lamp). A small purposeful light (a picture light, a sconce by a mirror). You can turn the ceiling off and the room should still work.' },
      { heading: 'Warmth is a number', body: '2700K for lamps in living rooms and bedrooms. 3000K if you must in a kitchen where you chop. Daylight bulbs (4000K and up) make oak look green and people look ill. Dimmers matter more than a fancy fixture. Unlacquered brass looks right under warm light and cheap under cool light.' },
      { heading: 'How much light', body: 'Rough lumens per square foot: 10–20 for a living room, 30–40 for a kitchen counter, 70+ for a task surface. A 9×12 bedroom wants about 1,500 lumens total, split between two lamps and one overhead on a dimmer, not one 3,000-lumen boob light.' },
    ],
    try: [
      { label: 'Afternoon, living', studio: { room: 'living', warmth: 70, hour: 16, pieces: ['sofa', 'floorlamp', 'tablelamp', 'curtains', 'art', 'rug'] } },
      { label: 'Evening, lounge', studio: { room: 'lounge', warmth: 90, hour: 21, wall: 'ink', metal: 'blackened', pieces: ['sofa', 'floorlamp', 'art', 'coffee'] } },
    ],
    related: ['floor-lamp', 'ceramic-lamp', 'brass-pendant', 'picture-light', 'dimmers'],
    quiz: [{ q: 'Which bulb for a bedroom lamp?', options: ['2700K warm', '4000K daylight', '5000K bright white'], answer: 0, why: 'Daylight bulbs make oak look green and faces look ill. Warm for anywhere you sit.' }],
  },
  {
    id: 'scale', title: 'The sofa that is too small', minutes: 3, image: IMG('sofa'), kicker: 'Scale',
    lede: 'The most common miss is furniture that is polite. Rooms want one thing that is confidently large.',
    sections: [
      { heading: 'Measure the path, then the piece', body: 'Leave about 30 inches where people walk, more if two people pass. Then buy the largest sofa that still allows that path. A small sofa in a large room looks like it is waiting to be replaced. A huge sofa in a tight room is a mistake you feel every day — so measure the door too.' },
      { heading: 'Art wants air or commitment', body: 'One large picture, hung so its center is a little lower than you think, beats a scatter of small frames with no shared baseline. If you love small work, align the bottoms or the tops and keep the frames in one metal or one wood.' },
      { heading: 'Tables in reach', body: 'A coffee table should land where a hand falls from the seat, not a formal distance away. Dining tables fail when the chairs cannot pull out. Islands fail when the overhang is too shallow to sit and too deep to walk past.' },
    ],
    try: [{ label: 'A living room with one large sofa', studio: { room: 'living', pieces: ['sofa', 'coffee', 'rug', 'art', 'floorlamp'] } }],
    related: ['boucle-sofa', 'oak-coffee', 'oak-frame'],
  },
  {
    id: 'metals', title: 'Metals that can live together', minutes: 3, image: IMG('pendant'), kicker: 'Metal',
    lede: 'You do not need one metal in the whole house. You need one metal in each view, and a reason for a second.',
    sections: [
      { heading: 'Unlacquered brass', body: 'It arrives bright and goes mottled where hands, water, and air touch it. That is the finish, not a defect. Do not mix it with polished chrome in the same kitchen. Chrome will make the brass look unfinished instead of alive. Blackened steel can sit with brass if the steel is the window or the table and the brass is the small warm things.' },
      { heading: 'Nickel is a cool guest', body: 'Soft nickel belongs with cool limestone and Slate Milk. Next to yellow oak and Bone Milk it looks like the wrong house. If your stone is warm, stay with brass.' },
      { heading: 'Count what you see at once', body: 'From the doorway of a bath you might see a faucet, a shower head, a towel bar, a sconce, and a mirror frame. Those should match. The cabinet pull in the next room can be different. People do not fail by mixing metals. They fail by mixing them inside one glance.' },
    ],
    try: [
      { label: 'Brass, warm kitchen', studio: { room: 'kitchen', metal: 'brass', wall: 'linen', warmth: 56 } },
      { label: 'Blackened steel, lounge', studio: { room: 'lounge', metal: 'blackened', wall: 'ink', floor: 'walnut' } },
    ],
    related: ['brass-pendant', 'bridge-faucet', 'sconce', 'cabinet-pulls'],
  },
  {
    id: 'quiet-contrast', title: 'Contrast of value, not hue', minutes: 3, image: IMG('powder'), kicker: 'Contrast',
    lede: 'A clay powder room works because the brass and the oak are close to it, and the mirror is the one bright hole.',
    sections: [
      { heading: 'One dark, deliberately', body: 'If the shell of the room is light, choose a single dark: the floor, or the door, or the table, or the art. Not all four. Soft Soot on the millwork with Bone Milk walls is a classic because the contrast is in the edges — which brings you back to framing.' },
      { heading: 'Deep color in small rooms', body: 'Pressed Fig and Clay Wash need a short visit or a lot of lamp light. A dining room you use at night can hold a deep wall. A home office you use at noon on a north window cannot, unless you want to feel underground. Powder rooms are the exception: you are there for a minute, and the smallness makes the color feel intentional.' },
      { heading: 'White trim is not neutral', body: 'Bright white trim next to a warm wall makes the wall look dirty. If the wall is Bone Milk, the trim should be the same or a half-step lighter, not a can of contractor white. Sample them together.' },
    ],
    try: [
      { label: 'Clay powder room', studio: { room: 'bath', wall: 'clay', floor: 'limestone', metal: 'brass', finish: 'limewash', pieces: ['vanity', 'pendant'] } },
      { label: 'Light room, dark floor', studio: { room: 'living', wall: 'bone', floor: 'walnut', frame: 'square' } },
    ],
    related: ['brass-mirror', 'oak-vanity', 'limewash-paint'],
  },
  {
    id: 'last-things', title: 'What to add last', minutes: 3, image: IMG('dining'), kicker: 'Additions',
    lede: 'Objects are the last 10 percent. They cannot fix a room whose walls, floor, and light are arguing.',
    sections: [
      { heading: 'The order', body: 'Shell first: wall finish, floor, casing, the large light. Then the largest furniture, then the rug that frames it, then the lamps. Only then a bowl, a branch, books with quiet spines, one picture. If you start with the objects you will buy things that try to be interesting because the room is not finished.' },
      { heading: 'Odd numbers, empty surface', body: 'One branch. Three bowls, if you must, of the same clay. Leave the coffee table with open wood. A styled surface with no gap looks like a shop display. You live in the gaps.' },
      { heading: 'Marketplace versus new', body: 'Tables, frames, stone, and solid wood are worth hunting used — the material is the same and often better. Upholstery, mattresses, and anything that holds water against a wall are worth buying new, with a return path. The shop links in the catalog search a market. They are not a single listing, so you can compare the actual thing in front of you.' },
    ],
    try: [{ label: 'A calm dining room', studio: { room: 'dining', pieces: ['dining', 'sideboard', 'pendant', 'art', 'rug'], wall: 'linen', frame: 'ogee' } }],
    related: ['ceramic-vase', 'stone-bowl', 'open-shelves', 'ceramic-lamp'],
  },
  // ---- new, practical ----
  {
    id: 'measure', title: 'How to measure a room', minutes: 5, image: IMG('office'), kicker: 'Measuring',
    lede: 'Every mistake in a furnished room started as a number nobody wrote down. Measure once, properly, and the app does the rest.',
    sections: [
      { heading: 'Length, width, height', body: 'Measure wall to wall at the floor, in two places; walls are rarely parallel. Take the smaller. Ceiling height at a corner and at the center. Write them in feet and inches, then convert to decimal feet (8\'6" is 8.5). Alder\'s rooms want decimal feet.' },
      { heading: 'Openings', body: 'For each door and window: which wall it is on, how far its left edge is from the corner, how wide, how tall, and for windows how high the sill sits. A 36" door is 3 feet wide. A standard window sill is about 3 feet off the floor. Write down which way the door swings.' },
      { heading: 'The things that do not move', body: 'Radiators, outlets, the thermostat, the vent, the one spot where the floor creaks. Note where the cable comes in. A sofa over the only outlet is a lamp you can never plug in.' },
      { heading: 'Then the path', body: 'Measure the front door width, the hall, the stair landing, and the turn into the room. A 90-inch sofa with a 40-inch depth does not go up a stair with a 36-inch landing. The delivery driver will not be sympathetic.' },
    ],
    related: ['casing', 'baseboard'],
    quiz: [{ q: 'A hallway is 36" wide. Which coffee table depth leaves a 30" path beside an 84" sofa in a 14-foot-wide room?', options: ['Any — 14 feet is plenty', 'Up to 24" deep', 'Up to 40" deep'], answer: 1, why: 'Fourteen feet is 168". Minus a 38" sofa, a 24" table, 18" between them and two 30" paths leaves 28". A 40" table eats the path.' }],
  },
  {
    id: 'budget', title: 'Budgeting a room without lying to yourself', minutes: 5, image: IMG('kitchen'), kicker: 'Money',
    lede: 'The number you have in your head is the number before tax, delivery, the second coat, and the thing you forgot. Add a third and you are close.',
    sections: [
      { heading: 'The rule of thirds', body: 'A furnished room splits roughly into thirds: the shell (floor, paint, trim, built-in light), the big pieces (sofa, bed, table, rug), and everything else (lamps, curtains, art, hardware, delivery, tax). People budget the middle third and are surprised by the other two.' },
      { heading: 'Where to spend', body: 'Spend on what you touch and what you cannot change: the floor, the sofa you sit on daily, the faucet, the mattress. Save on what is far from your hands: the bookcase, the console, the art frame, the guest room curtains. Hunt used for solid wood and stone. Buy new for upholstery and anything that holds water.' },
      { heading: 'Hidden lines', body: 'Delivery (often 5–10% of furniture), sales tax, paint primer and the second gallon, grout and thinset, the electrician for the sconces, the plumber for the faucet, curtain rods and rings, rug pads, light bulbs, return shipping on the one that was wrong. Alder adds a contingency line for you. Do not delete it.' },
      { heading: 'Lead times', body: 'A sofa is 8–12 weeks. A range can be 8–16. Custom shades, 4–6. Tile from Morocco, 3–8. Order the longest items first, and the paint last, because the paint is the thing you can still change.' },
    ],
    related: ['dimmers', 'curtain-rod', 'grout', 'cabinet-pulls'],
    quiz: [{ q: 'Your sofa is $3,000. What should the line in the budget say?', options: ['$3,000', 'About $3,500 with tax and delivery', '$2,700 after the sale'], answer: 1, why: 'Tax plus delivery runs 10–18%. Budget what it costs at your door.' }],
  },
  {
    id: 'order', title: 'The order of operations', minutes: 4, image: IMG('entry'), kicker: 'Sequence',
    lede: 'Rooms are built from the outside in and the top down. Paint before floors; floors before furniture; furniture before art; art before objects.',
    sections: [
      { heading: 'Rough, then finish', body: 'Electrical and plumbing rough-in happen while the walls are open. That is when you decide where the sconces and the picture light go, not after the drywall. Walk the room with painter\'s tape and mark every fixture at its real height before the electrician leaves.' },
      { heading: 'Ceilings, walls, trim, floors', body: 'Paint the ceiling first (drips fall down), then walls, then trim. Floors go in after paint when possible, so nobody drips on them. If the floor is already down, cover it like you mean it.' },
      { heading: 'Big to small', body: 'Deliver the sofa, the bed, the table. Then unroll the rug and move the big pieces onto it. Then hang the curtains, high. Then the lamps. Then the art, with the big pieces in the room so you hang it to the furniture, not to the wall. Then, weeks later, the bowl.' },
      { heading: 'Live in it first', body: 'Leave the art down for two weeks. Walk the room at night. You will find the corner that needs a lamp and the wall that wants nothing. That is the information the plan could not give you.' },
    ],
    related: ['casing', 'sconce', 'oak-flooring'],
  },
  {
    id: 'kitchen', title: 'A kitchen that cooks', minutes: 5, image: IMG('kitchen'), kicker: 'Kitchen',
    lede: 'A kitchen is a workshop with better light. Get the distances right and the pretty parts take care of themselves.',
    sections: [
      { heading: 'Aisles', body: '42 inches between the island and the counter. 48 if two people cook at once. Less than 36 and the dishwasher door blocks the room. Island overhang for stools: 12 inches, and 24 inches of width per stool.' },
      { heading: 'The triangle, still', body: 'Sink, range, fridge: each leg 4 to 9 feet, total under 26. The sink gets the window. The range gets the wall with the hood. The fridge goes at the edge so a guest can grab a drink without crossing the cook.' },
      { heading: 'Counters', body: 'Honed marble etches and that is its charm. Quartzite looks like marble and shrugs off lemon. Soapstone is dark and soft and oilable. Engineered quartz is even and a little dead. Butcher block only on the island. Whatever you choose, pick the slab in person.' },
      { heading: 'One idea', body: 'Perimeter cabinets and the island in the same wood, or the same paint. A second color on the island is a second idea. Flat drawer fronts, a fluted pantry, one metal in the wet zone, a cream range, a hood that is plaster or oak. Open shelves: two, not twelve.' },
    ],
    try: [{ label: 'Oak kitchen, brass', studio: { room: 'kitchen', wall: 'linen', floor: 'oak', metal: 'brass', warmth: 54, pieces: ['island', 'pendant', 'shelves', 'stools', 'range'] } }],
    related: ['kitchen-island', 'cream-range', 'bridge-faucet', 'farm-sink', 'range-hood', 'panel-fridge'],
    quiz: [{ q: 'Island-to-counter aisle for a one-cook kitchen?', options: ['30 inches', '42 inches', '60 inches'], answer: 1, why: '42" lets the dishwasher open and a person pass. 48" for two cooks.' }],
  },
  {
    id: 'bath', title: 'A bath with air around it', minutes: 4, image: IMG('bath'), kicker: 'Bath',
    lede: 'Bathrooms fail by crowding. The second you can walk around the tub, the room feels twice its size.',
    sections: [
      { heading: 'Clearances', body: 'Toilet: 15 inches from its center to anything on either side, 24 inches in front. Vanity: 30 inches of floor in front. Shower: 36 by 36 inside, minimum; 42 by 36 is kind. A freestanding tub wants 6 inches to the wall on the long side and a real walkway behind it, or buy an alcove tub and spend the difference on the tile.' },
      { heading: 'Water and metal', body: 'One metal you can see from the door: faucet, shower trim, towel bar, sconce. Unlacquered brass with warm stone; nickel with cool stone. Never both.' },
      { heading: 'Stone', body: 'Honed, never polished, on the floor. Large format (12×24) makes a small floor read bigger. Penny round or a small mosaic on the shower floor for grip. Slab on the shower walls if the budget is there; if not, the same floor tile run vertically, and one niche with a stone shelf.' },
      { heading: 'Light', body: 'Sconces beside the mirror at face height, not above it. A shaded pendant or a flush mount on a dimmer. Heated floor on a timer. Nothing fluorescent, ever.' },
    ],
    try: [{ label: 'Stone bath, warm', studio: { room: 'bath', wall: 'slate', floor: 'limestone', metal: 'brass', warmth: 40, pieces: ['tub', 'vanity', 'plant'] } }],
    related: ['soaking-tub', 'oak-vanity', 'bath-faucet', 'shower-set', 'heated-floor', 'toilet'],
  },
  {
    id: 'windows', title: 'Hang the curtains high', minutes: 3, image: IMG('linen'), kicker: 'Windows',
    lede: 'Curtains are the cheapest way to make a ceiling taller and the easiest way to make a window look small. The rod decides which.',
    sections: [
      { heading: 'Where the rod goes', body: 'Four to six inches below the ceiling, or halfway between the window top and the ceiling if the ceiling is very high. Eight to twelve inches past the window on each side so the open panels clear the glass. The window will look twice its size.' },
      { heading: 'How much fabric', body: 'Panel width should total 2 to 2.5 times the rod length. For an 8-foot rod, that is 16 to 20 feet of fabric, so four 50-inch panels, not two. Length: just kissing the floor, or a half inch above. A puddle is a costume.' },
      { heading: 'Which treatment', body: 'Linen panels for living and bedrooms. A relaxed roman shade where the sill is busy (kitchen, bath). Woven wood for texture without pattern. Sheers under the panels if the neighbors are close. Shutters in a bath. Bare, if the view is the point and the neighbors are far.' },
    ],
    related: ['linen-curtain', 'curtain-rod', 'roman-shade'],
    quiz: [{ q: 'How many 50-inch panels for a 96-inch rod?', options: ['Two', 'Four', 'Six'], answer: 1, why: '2 to 2.5 times fullness: 192–240 inches of fabric, so four panels.' }],
  },
  {
    id: 'rugs', title: 'The rug is the floor plan', minutes: 3, image: IMG('rug'), kicker: 'Rugs',
    lede: 'A rug tells the furniture where to stand. Buy the size the room needs, not the size that was on sale.',
    sections: [
      { heading: 'Living', body: 'All front legs of every seat on the rug. In a 14×18 room with a sofa and two chairs, that is a 9×12, not a 5×8. Leave 12 to 18 inches of floor at the walls. If the right size is out of budget, layer a plain jute under a smaller good rug.' },
      { heading: 'Dining', body: 'The rug extends 24 inches past the table edge on every side, so the chairs stay on it when pulled out. An 84×40 table wants a 9×12. A round table wants a round or square rug.' },
      { heading: 'Bedroom', body: 'Under the bottom two-thirds of the bed, out 24 to 36 inches on each side and at the foot. Queen: 8×10. King: 9×12. Or two runners beside the bed and nothing under it.' },
    ],
    related: ['wool-rug', 'vintage-rug', 'jute-rug'],
  },
  {
    id: 'glossary', title: 'Words the contractor will use', minutes: 6, image: IMG('fluted'), kicker: 'Glossary',
    lede: 'A short dictionary so the trades cannot talk past you.',
    sections: [
      { heading: 'Casing, base, crown, backband, stop', body: 'Casing frames doors and windows. Base runs along the floor. Crown runs along the ceiling. A backband is a second strip that thickens a casing. The stop is the small piece the door closes against. A "reveal" is the step between two trim pieces.' },
      { heading: 'Honed, polished, leathered, tumbled', body: 'Honed is matte. Polished is shiny. Leathered has a slight texture. Tumbled has rounded edges and looks old. For floors and most counters: honed.' },
      { heading: 'LRV, undertone, mass tone', body: 'LRV is how much light the paint bounces back. Mass tone is the color you see at a glance. Undertone is the color underneath that shows up next to other things. Two "whites" with different undertones look like two different colors on one wall.' },
      { heading: 'Limewash, Roman clay, Venetian plaster, tadelakt', body: 'All mineral finishes. Limewash is thin and cloudy. Roman clay is thicker and suede-like. Venetian is burnished and slightly glossy. Tadelakt is waterproof and goes in showers. All need a mineral primer and a tester board.' },
      { heading: 'Rough-in, finish, punch list', body: 'Rough-in is pipes and wires in open walls. Finish is fixtures, trim, and paint. The punch list is everything still wrong at the end. Make yours long and specific.' },
      { heading: 'Lead time, backorder, white glove, curbside', body: 'Lead time is how long until it ships. Backorder means they do not have it. White glove means they carry it in and unbox it. Curbside means it lands on the driveway in a crate in the rain. Pay for white glove on anything over 100 pounds.' },
    ],
    related: ['casing', 'baseboard', 'limewash-paint'],
  },
];

export const lesson = (id: string) => LESSONS.find((l) => l.id === id);
