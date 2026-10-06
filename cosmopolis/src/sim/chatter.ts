/**
 * Hypernet — the citizens' social feed. Generates people (names, @handles, emoji avatars), recurring
 * characters, and witty posts that react to the real state of the city (outages, traffic, taxes, new parks,
 * disasters, milestones…) plus a stream of random flavour. Pure text generation: the Simulation decides when
 * to post and calls ui/store pushNews().
 */
import type { SimRng } from './rng';

export interface Persona {
  author: string;
  handle: string;
  icon: string;
}

const FIRST = [
  'Mira', 'Juno', 'Kai', 'Tomás', 'Ava', 'Rohan', 'Yuki', 'Nia', 'Ezra', 'Lena', 'Omar', 'Priya', 'Felix', 'Zara', 'Idris', 'Sol',
  'Tess', 'Arlo', 'Noor', 'Bao', 'Ines', 'Dmitri', 'Amara', 'Leo', 'Saoirse', 'Kofi', 'Hana', 'Rafael', 'Elif', 'Theo', 'Mei',
  'Zed', 'Orla', 'Ravi', 'Quinn', 'Asha', 'Bruno', 'Freya', 'Jae', 'Lucía', 'Malik', 'Nova', 'Pax', 'Rin', 'Sven', 'Talia',
  'Vesper', 'Wren', 'Xan', 'Yara', 'Cosmo', 'Astrid', 'Dax', 'Lyra', 'Orion', 'Cassia', 'Ilya', 'Kenji', 'Ottilie', 'Ptolemy',
];
const LAST = [
  'Okafor', 'Lindqvist', 'Moreau', 'Nakamura', 'Patel', 'Reyes', 'Haddad', 'Kowalski', 'Mbeki', 'Ivanova', 'Chen', 'Dubois',
  'Fontaine', 'García', 'Holm', 'Ibarra', 'Jansen', 'Kaur', 'Larsen', 'Mendes', 'Novak', 'Osei', 'Petrov', 'Quispe', 'Rossi',
  'Sato', 'Tanaka', 'Ulloa', 'Vance', 'Weiss', 'Xu', 'Yilmaz', 'Zhou', 'Starling', 'Voidwalker', 'Ringrose', 'Halley',
  'Kepler', 'Nebulov', 'Quasarini', 'Driftwood', 'Moonfield', 'Solano', 'Brightwater', 'Comet', 'Ashgrove',
];
const HANDLE_WORDS = ['stardust', 'orbit', 'nebula', 'ringside', 'lowgrav', 'void', 'comet', 'photon', 'hydro', 'neon', 'cosmic', 'rover', 'quark', 'dusk', 'zenith', 'airlock', 'moonpie', 'warp'];
const AVATARS = ['🧑‍🚀', '👩‍🔬', '👨‍🍳', '🧑‍🎨', '👩‍🌾', '🧑‍💻', '👷', '🧑‍🏫', '👩‍⚕️', '🧑‍🔧', '🕺', '💃', '🧔', '👵', '👴', '🧒', '🙋', '😎', '🤓', '🥸', '🦊', '🐙', '👽', '🤖', '🐱', '🦖', '🌵', '🍄', '🛸', '🪐'];

/** Recurring characters — they give the feed a personality. */
export const CHARACTERS: Record<string, Persona> = {
  news: { author: 'Cosmo Daily', handle: '@CosmoDaily', icon: '📰' },
  traffic: { author: 'TrafficBot 9000', handle: '@TrafficBot9000', icon: '🚦' },
  weather: { author: 'Orbital Weather', handle: '@SkyWatch', icon: '🌦️' },
  prof: { author: 'Prof. Zylla Quasarini', handle: '@ProfZylla', icon: '👩‍🔬' },
  grandma: { author: 'Grandma Orbit', handle: '@GrandmaOrbit', icon: '👵' },
  cat: { author: 'Sir Whiskers III', handle: '@cat_supreme', icon: '🐈' },
  robot: { author: 'UNIT-7', handle: '@unit7_beepboop', icon: '🤖' },
  alien: { author: 'Glorp', handle: '@glorp_visiting', icon: '👽' },
  mayorfan: { author: 'Mayor Fan Club', handle: '@MayorStans', icon: '📣' },
  critic: { author: 'Dex the Critic', handle: '@DexHatesEverything', icon: '🧐' },
  fire: { author: 'Fire & Rescue', handle: '@CityFireDept', icon: '🚒' },
  police: { author: 'Police Department', handle: '@CityPD', icon: '🚓' },
  biz: { author: 'Chamber of Commerce', handle: '@BizCouncil', icon: '💼' },
};

export function randomPersona(rng: SimRng): Persona {
  const first = rng.pick(FIRST), last = rng.pick(LAST);
  const style = rng.int(0, 3);
  const handle =
    style === 0 ? `@${first.toLowerCase()}_${last.toLowerCase().replace(/[^a-z]/g, '')}`
    : style === 1 ? `@${first.toLowerCase()}${rng.int(2, 99)}`
    : style === 2 ? `@${rng.pick(HANDLE_WORDS)}_${first.toLowerCase()}`
    : `@${last.toLowerCase().replace(/[^a-z]/g, '')}.${rng.pick(HANDLE_WORDS)}`;
  return { author: `${first} ${last}`, handle: handle.normalize('NFD').replace(/[̀-ͯ]/g, ''), icon: rng.pick(AVATARS) };
}

export function citizenName(rng: SimRng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

/** Topic → templates. {city} {planet} {name} {district} {pop} {tax} {mayor} {thing} {n} placeholders. */
export const TEMPLATES: Record<string, string[]> = {
  powerOut: [
    'Power\'s been out for days. I\'m charging my phone with a hamster wheel. The hamster is unionising. ⚡',
    'Day 3 without electricity. We\'ve started telling stories around the fridge. It does not glow anymore.',
    'Fun fact: you cannot microwave dinner with sheer willpower. I tried. ⚡😤',
    'Our block went dark again. Mayor, the stars are pretty but I\'d like to see my kitchen.',
  ],
  waterOut: [
    'No water in the tap. I brushed my teeth with sparkling juice. Do not recommend. 💧',
    'Showered with a spray bottle today. Mayor, PLEASE build a pump.',
    'My plants are judging me. We have no water. They know.',
  ],
  oxygenOut: [
    'Holding my breath until the mayor builds more oxygen generators. Update: I need to stop doing that. 🫁',
    'The air smells like "nothing", which on this planet means "danger". Oxygen please!',
    'Bought an emergency oxygen can. Breathed it all on my lunch break. Worth it.',
  ],
  garbage: [
    'The trash pile outside my building now has its own postcode. 🗑️',
    'Garbage hasn\'t been collected in weeks. A raccoon moved in and is charging rent.',
    'Pretty sure the trash heap on my street just achieved sentience.',
  ],
  traffic: [
    'Stuck on {road} for 45 minutes. I\'ve read an entire novel. It was about traffic. 🚗',
    '{road} is a parking lot again. I waved at the same pigeon four times. 🐦',
    'Gridlock again. I\'m now on first-name terms with the driver next to me. We\'re engaged.',
    'Traffic report: everything is red. The map looks like a tomato. 🍅',
    'Walked to work. Beat my car, which I left in traffic yesterday.',
  ],
  trafficBot: [
    'CONGESTION LEVEL: {n}%. RECOMMENDATION: TELEPORTATION (NOT YET AVAILABLE). 🚦',
    'TRAFFIC STATUS: NOMINAL. HUMANS ARE MOVING AT ACCEPTABLE VELOCITIES. 🟢',
    'ADVISORY: MAIN ARTERIES AT {n}% CAPACITY. HAVE YOU CONSIDERED AN AVENUE?',
  ],
  newPark: [
    'Just had a picnic at the new {thing}. A bird stole my sandwich. 10/10 would picnic again. 🌳',
    'The new {thing} is gorgeous. Mayor, you\'ve done it. I may never go home.',
    'Took the kids to {thing}. They\'re finally tired. Bless this city. 🙏',
  ],
  newLandmark: [
    'Okay the new {thing} is STUNNING. Took 400 photos. Deleted 3. 📸',
    'Can see {thing} from my balcony. Rent just went up. Worth it?? Worth it.',
    'Tourists everywhere since {thing} opened. Business is BOOMING. 💼',
  ],
  newService: [
    'A new {thing} opened down the road. Feeling very looked-after right now.',
    'Finally a {thing} in our neighbourhood! Took you long enough, mayor 😅',
  ],
  taxUp: [
    'Taxes went UP? I\'m moving to the asteroid belt. (I\'m not. Rent is worse there.) 💸',
    'New tax rate of {tax}%. My wallet just filed a complaint.',
    'Raising taxes again, mayor? Bold. Very bold. 🧐',
  ],
  taxDown: [
    'Tax cut! Treating myself to a slightly larger coffee. ☕',
    'Taxes down to {tax}%. Mayor, I take back everything I said last month.',
  ],
  taxHigh: ['{tax}% tax?! My accountant just fainted. Again.', 'At these tax rates I\'m considering becoming a comet. No fixed address. ☄️'],
  unemployed: [
    'Looking for work. Skills: optimism, mild telekinesis, Excel. 📉',
    'Still no job. I\'ve applied to every shop in {city}. Some twice.',
    'Day 40 of unemployment: taught my cat to file my applications. She is more qualified than me.',
  ],
  jobsPlenty: ['Every shop in {city} has a HIRING sign. Time to quit my job and get a better one 😎', 'Got three job offers this week. Feeling like a celebrity.'],
  pollution: [
    'The air today tastes like pennies and regret. ☁️',
    'Hung my laundry outside. It is now a different colour. 🏭',
    'Industrial smog so thick I waved to my neighbour and it waved back. It was a cloud.',
  ],
  crime: [
    'Someone stole my hover-bike. Then returned it with a note saying "too slow". Rude. 🦹',
    'Crime is up in my area. Even the vending machine looks nervous.',
    'Locked my door three times today. Still checking. 🔒',
  ],
  happy: [
    'Honestly? Best city in the sector. No notes. 💖',
    'Watched the sunset over {city} tonight. Moved here last year — never leaving.',
    'Good services, clean air, nice neighbours. Mayor {mayor}, you\'re alright. 🙌',
  ],
  unhappy: [
    'Thinking of leaving {city}. Anyone know a good planet? 😞',
    'Is anyone in charge here?? Asking for literally everyone.',
  ],
  abandoned: ['Our street has a creepy abandoned building now. The ghosts pay no taxes. 👻', 'Another building emptied out on my block. Mayor, what\'s going on?'],
  topOut: [
    '{thing} just topped out in {district}! The view from the top is unreal. 🏙️',
    'Moved into {thing}. My elevator has a lounge. My lounge has an elevator. 🛗',
    'They finished {thing}. The skyline finally looks like the brochures. ✨',
  ],
  levelUp: [
    'Just moved into a shiny new tower — level {n}! The elevator plays jazz. 🎷',
    'My building got renovated! New windows, new lobby, same weird neighbour.',
    'Our neighbourhood is going upscale. I saw a dog wearing a monocle. 🧐',
  ],
  newcomer: [
    'Just landed in {city}! Where do I get coffee? ☕🚀',
    'First day on {planet}. The gravity is weird and I love it.',
    'Moved here from three systems over. The view of the sky alone is worth it. 🌌',
    'New in town! Is it normal for the moon to be that big? 🌕',
  ],
  milestone: [
    '{city} is officially a {thing}! I was here before it was cool. 🎉',
    'Population {pop}! Remember when this was three houses and a dirt road? 🥲',
    'Breaking: {city} reaches {thing} status. Champagne in the plaza! 🍾',
  ],
  disaster: [
    'IS THAT A {thing}?? 😱',
    'I KNEW I should\'ve bought disaster insurance. {thing}! RUN!',
    'Not a drill: {thing}. Everyone get to a shelter! 🚨',
    'My horoscope said "unexpected events". It did not say {thing}. 😰',
  ],
  disasterOver: [
    'We survived the {thing}. Rebuilding starts tomorrow. {city} strong. 💪',
    'Cleanup crews are already out after the {thing}. Proud of this city.',
  ],
  fire: ['There\'s a fire on our street! 🔥 Firefighters on the way, I hope.', 'Smoke everywhere. Stay safe, {city}! 🔥'],
  fireOut: ['Firefighters saved our block! Buying them all pizza. 🍕🚒', 'Fire\'s out. Heroes, all of them. 🚒'],
  bankrupt: ['Heard the city is broke. Do I still have to pay my parking tickets? 🤔', 'The city budget is in the red. Bake sale at city hall, Saturday. 🧁'],
  research: ['Our labs just made a breakthrough! Something about quantum toast. 🔬', 'Visited the research centre. Understood nothing. Felt smart anyway.'],
  policy: ['New policy just dropped: {thing}. Let\'s see how this goes 👀', 'Mayor enacted {thing}. Bold move. I respect it.'],
  colony: ['My cousin moved to our new colony on {thing}. Says the sunsets are purple. 🪐'],
  tourism: ['So many tourists today! One asked me where the "real {city}" is. This is it, buddy. 📸', 'Tourist season is wild. Selling souvenir rocks. Business is good. 🪨'],
  random: [
    'Saw a shooting star over {city} tonight. Wished for a parking spot. 🌠',
    'Hot take: the moons of {planet} are overrated. (They are beautiful.) 🌙',
    'Anyone else\'s toaster getting Hypernet updates? Mine wants to talk about feelings.',
    'Gravity felt a little lighter today. Or I\'m just in a good mood. 🪶',
    'Spotted the mayor buying groceries. Got a bag of space-oats. Relatable.',
    'Tried the new nebula-flavoured ice cream. It tastes like purple. 🍦',
    'Reminder: drink water, look up, the stars are free. ✨',
    'My kid asked why the sky is that colour. I said "atmospheric scattering". She said "boring". 🙄',
    'Neighbour is building a backyard rocket again. HOA is furious. 🚀',
    'If you see a small green dog in {district}, he\'s mine and he owes me money.',
    'Petition to rename Tuesday to "Spacey Tuesday". Sign below. 📝',
    'Watched two drones argue over a parking spot. Drama. 🍿',
    'Night shift at the spaceport. The view never gets old. 🛸',
    'Low gravity basketball league tryouts today. I dunked from the parking lot. 🏀',
    'My houseplant photosynthesised so hard today it got a sunburn. 🌱',
    'Just realised our sunset happens twice if you take the express elevator. 🌇',
    'Overheard at the café: "I\'m not lost, I\'m exploring the hexagons." Same, friend.',
    'Someone graffitied "HELLO UNIVERSE" on the water tower. The universe has not replied. 📡',
    'Bought a telescope. Spent the night watching my neighbour\'s telescope watching me. 🔭',
    'The street musician on {district} plays the theremin like it owes him money. 🎶',
    'PSA: the meteor in the museum is NOT for licking. Ask me how I know. ☄️',
    'Weather forecast: 40% chance of aurora, 60% chance I stay up too late watching it. 🌌',
    'My grandma has more followers than me. She posts about soup. 🥣',
  ],
  grandma: [
    'In my day we had ONE moon and we were grateful. 👵',
    'Knitted a sweater for the moon. It looked cold up there. 🧶',
    'Back in my day {city} was all fields. Now look at it! I\'m so proud. 🥲',
  ],
  cat: ['Sat in a sunbeam for six hours. Productive day. 🐈', 'Knocked a glass off the mayor\'s desk. No regrets.', 'Demand for chin scratches remains high. Supply: disappointing. 🐾'],
  robot: ['GREETINGS, FELLOW HUMANS. I TOO ENJOY OXYGEN AND SLEEP. 🤖', 'TODAY I LEARNED THE CONCEPT OF "VIBES". PROCESSING… PROCESSING…'],
  alien: ['Visiting {planet}. Your "pizza" is the finest substance in the galaxy. Taking 40 home. 👽🍕', 'Glorp likes {city}. Glorp will tell Glorp\'s 11 siblings.'],
  prof: ['New paper: "On the Gravitational Effects of Too Many Cafés". Peer review pending. 👩‍🔬', 'Education coverage in {city} is {n}%. Science approves (mostly). 📚'],
  critic: ['Rating {city}: 6/10. Too many roads, not enough fountains. 🧐', 'The new skyline? Derivative. Also, I love it. Don\'t tell anyone.', 'Visited the waterfront. The seagulls have better taste than the architects. 🧐', 'Fine. FINE. The new park is nice. Happy now?'],
  police: [
    'Suspect apprehended after stealing 400 rubber ducks from the harbour. The ducks are safe. 🦆',
    'Reminder: jaywalking in low gravity is still jaywalking, even if you float. 🚓',
    'Patrols increased in {district}. Please stop reporting the moon as "suspicious". 🌕',
    'A citizen returned a lost wallet with ₡400 inside. We are not crying, you are crying. 💙',
  ],
  fireDept: [
    'Fire contained, no injuries. Please stop deep-frying things on the balcony. 🔥',
    'Cat rescued from a tree. Cat was not grateful. Business as usual. 🐈',
    'Smoke detector tip: if it chirps at 3am, it is not haunted. Change the battery. 🔋',
  ],
  heist: [
    'Someone stole the "BEWARE OF THEFT" sign from the plaza. Bold. 🦹',
    'Heard sirens all night in {district}. Crime is getting out of hand, mayor. 🚨',
    'My e-bike got stolen. Then my second e-bike. I am now walking out of spite. 🚶',
  ],
  yearReview: [
    'YEAR IN REVIEW: {city} grew {growth} to {pop} citizens. Mood of the year: {mood}. Biggest headache: {problem}. 📰',
    '{year} WRAPPED: {pop} citizens ({growth}), happiness {happy}%. Citizens\' top complaint: {problem}. Here\'s to next year! 🥂',
  ],
};

/** Fill placeholders. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : _));
}

/** Recently used template lines (shared) so the feed rarely repeats itself. */
const recent: string[] = [];
const RECENT_MAX = 40;

/** Pick a template line for a topic, avoiding lines used recently. */
export function line(rng: SimRng, topic: string, vars: Record<string, string | number>): string {
  const list = TEMPLATES[topic] ?? TEMPLATES.random;
  let pick = list[Math.floor(rng.next() * list.length)];
  for (let tries = 0; tries < 6 && recent.includes(pick); tries++) pick = list[Math.floor(rng.next() * list.length)];
  recent.push(pick);
  if (recent.length > RECENT_MAX) recent.shift();
  return fill(pick, vars);
}

/** Resident quote for the inspector, chosen by mood and needs. */
export function residentQuote(rng: SimRng, mood: number, problem: string | null, vars: Record<string, string | number>): string {
  const byProblem: Record<string, string[]> = {
    power: ['"We eat dinner by candlelight. Not by choice."', '"The fridge stopped humming. I miss it."'],
    water: ['"I\'ve started showering at the gym. I don\'t go to the gym."'],
    oxygen: ['"Every breath is a little adventure. Too little."'],
    garbage: ['"The bins are overflowing. A seagull has claimed the stairwell."'],
    pollution: ['"The sunsets are lovely. That\'s the smog."'],
    crime: ['"I keep my valuables in my shoes now."'],
    noise: ['"The club next door has one song and it is VERY long."'],
    taxes: ['"Half my paycheck goes to the city. The other half goes to rent."'],
    jobs: ['"Looking for work. Any work. I can juggle."'],
    traffic: ['"I could walk faster. I could CRAWL faster."'],
    customers: ['"Lovely shop. No customers. I talk to the mannequins."'],
    workers: ['"We\'re hiring. We\'ve been hiring for months."'],
    educated: ['"We need engineers! Or at least someone who can read a manual."'],
    fire: ['"IS SOMETHING BURNING? …oh no."'],
    flood: ['"The living room is now a lake. The fish seem happy."'],
    radiation: ['"I glow in the dark now. Not in a fun way."'],
    goo: ['"The walls are… shimmering. That\'s normal, right?"'],
  };
  if (problem && byProblem[problem]) return fill(rng.pick(byProblem[problem]), vars);
  const happy = ['"Best decision I ever made, moving here."', '"The view of the rings from my balcony? Priceless."', '"Great neighbours, good schools, and the café downstairs knows my order."', '"I love {city}. I\'d marry it if that were legal."'];
  const ok = ['"It\'s fine. It\'s home. The commute could be shorter."', '"Not bad. Could use a park nearby."', '"Rent\'s high, but so is the ceiling."'];
  const sad = ['"Honestly thinking of moving to another planet."', '"Is there anyone running this city?"', '"It used to be nicer around here."'];
  return fill(rng.pick(mood >= 70 ? happy : mood >= 45 ? ok : sad), vars);
}

const JOBS = ['hydroponics tech', 'starship mechanic', 'barista', 'data wrangler', 'teacher', 'nurse', 'drone pilot', 'xeno-botanist', 'line cook', 'holo-artist', 'mining engineer', 'accountant', 'astro-physicist', 'street musician', 'robot therapist', 'firefighter', 'urban planner', 'pastry chef', 'courier', 'retired'];
export function citizenJob(rng: SimRng): string {
  return rng.pick(JOBS);
}

// ─────────────────────────────────────────────── place names

const AREA_A = ['Ring', 'Comet', 'Orbit', 'Nova', 'Halo', 'Quasar', 'Lumen', 'Aurora', 'Zenith', 'Meteor', 'Nebula', 'Solar', 'Crater', 'Ion', 'Vega', 'Lyra', 'Pulsar', 'Eclipse', 'Starfall', 'Moonrise', 'Gravity', 'Cosmo', 'Polaris', 'Kepler'];
const AREA_B = ['Heights', 'Hollow', 'Gardens', 'Quarter', 'Park', 'Point', 'Terrace', 'Commons', 'Docks', 'Village', 'Row', 'Fields', 'Hill', 'Market', 'Crossing', 'Vale', 'Bluffs', 'Landing', 'Basin', 'Ridge'];
const AREA_PREFIX = ['', '', '', 'Old ', 'Upper ', 'Lower ', 'New ', 'East ', 'West ', 'Little '];
const ROAD_A = ['Orion', 'Kepler', 'Halley', 'Sagan', 'Lovelace', 'Tereshkova', 'Gagarin', 'Armstrong', 'Hubble', 'Curie', 'Galileo', 'Copernicus', 'Herschel', 'Leavitt', 'Hawking', 'Ride', 'Jemison', 'Tycho', 'Newton', 'Einstein', 'Meitner', 'Noether', 'Vulcan', 'Andromeda', 'Cassini', 'Juno', 'Voyager', 'Pioneer', 'Apollo', 'Artemis'];
const ROAD_KIND = ['', 'Path', 'Street', 'Avenue', 'Skyway', 'Maglev Line', 'Hyperloop'];

function h32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Deterministic neighbourhood name for a coarse cell of the sphere (≈ 6–8 tiles across). */
export function areaName(cx: number, cy: number, cz: number, seed: number): string {
  const cell = h32((Math.floor(cx * 7) * 73856093) ^ (Math.floor(cy * 7) * 19349663) ^ (Math.floor(cz * 7) * 83492791) ^ seed);
  return AREA_PREFIX[cell % AREA_PREFIX.length] + AREA_A[(cell >>> 4) % AREA_A.length] + ' ' + AREA_B[(cell >>> 12) % AREA_B.length];
}

/** Deterministic street name for a road tile (stretches of road share a name). */
export function streetName(cx: number, cy: number, cz: number, kind: number, seed: number): string {
  const cell = h32((Math.floor(cx * 16) * 73856093) ^ (Math.floor(cy * 16) * 19349663) ^ (Math.floor(cz * 16) * 83492791) ^ (seed * 31 + kind));
  return `${ROAD_A[cell % ROAD_A.length]} ${ROAD_KIND[kind] || 'Street'}`;
}

const TOWER_A = ['Helix', 'Zenith', 'Aurora', 'Meridian', 'Halcyon', 'Obsidian', 'Celestia', 'Vantage', 'Paragon', 'Solstice', 'Equinox', 'Nimbus', 'Apex', 'Lumina', 'Starlight', 'Polaris', 'Cobalt', 'Ember', 'Sapphire', 'Orbital'];
const TOWER_B: Record<string, string[]> = {
  R: ['Residences', 'Tower', 'Heights', 'Lofts', 'Spire', 'Habitat'],
  C: ['Galleria', 'Exchange', 'Arcade', 'Plaza', 'Emporium', 'Mall'],
  I: ['Works', 'Foundry', 'Fabricatorium', 'Labs', 'Assembly'],
  O: ['Tower', 'Centre', 'Headquarters', 'Exchange', 'Campus', 'Building'],
};
/** A grand name for a building that reaches the top level. */
export function towerName(rng: SimRng, family: 'R' | 'C' | 'I' | 'O'): string {
  return `The ${rng.pick(TOWER_A)} ${rng.pick(TOWER_B[family] ?? TOWER_B.O)}`;
}
