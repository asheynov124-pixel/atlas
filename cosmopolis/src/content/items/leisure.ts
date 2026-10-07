/**
 * OWNER: agent services
 * Parks, gardens, sports grounds, stadiums, entertainment venues, attractions and resorts.
 *
 * Coverage service: leisure (demand factor 0.25 — a 600-visitor pocket park serves ~2 400 residents). Every
 * leisure item counts as a park for goals ("Green Thumb") and lifts land value / happiness around it; venues
 * add tourism and ticket income, and leafy gardens soak up a little pollution. Location rules: aquarium and
 * beach resort need the coast, hot springs sit on a geothermal vent, the ski lodge needs an arctic or tundra
 * world and the alpine lodge needs high ground. Meshes: content/meshes/services/{parks,venues}.ts.
 */
import { registerItems, type ItemDef } from '../catalog';
import { Feature } from '../../core/types';
import * as P from '../meshes/services/parks';
import * as V from '../meshes/services/venues';

const PARKS = 'Parks';
const GARDENS = 'Gardens';
const SPORTS = 'Sports';
const SHOWS = 'Entertainment';
const ATTRACTIONS = 'Attractions';
const RESORTS = 'Resorts';

const defs: ItemDef[] = [
  // ───────────────────────────── parks
  {
    id: 'small_park', name: 'Pocket Park', category: 'leisure', group: PARKS, icon: '🌳', tier: 0,
    footprint: 1, placement: 'surface', cost: 1500, upkeep: 40, variants: 3, height: 0.62, mesh: P.smallPark,
    description: 'A leafy pocket of green in three layouts — formal cross paths, a duck pond, or a picnic lawn with a gazebo. Raises land value and spirits nearby.',
    flavor: 'Scientifically proven to lower blood pressure, rents excluded.',
    effects: { landValue: 8, happiness: 3, pollution: -2, radius: 4 },
    coverage: [{ service: 'leisure', radius: 5, strength: 0.5, capacity: 600 }],
    tags: ['park'],
  },
  {
    id: 'playground', name: 'Playground', category: 'leisure', group: PARKS, icon: '🛝', tier: 0,
    footprint: 1, placement: 'surface', cost: 1800, upkeep: 50, height: 0.38, mesh: P.playground,
    description: 'Slide tower, swings, a climbing dome, seesaw and sandpit on soft rubber. Families love living near one.',
    flavor: 'The swings go up to eleven. The parents go up to nervous.',
    effects: { landValue: 4, happiness: 4, noise: 3, radius: 4 },
    coverage: [{ service: 'leisure', radius: 4, strength: 0.5, capacity: 500 }],
    tags: ['park', 'family'],
  },
  {
    id: 'plaza_fountain', name: 'Fountain Plaza', category: 'leisure', group: PARKS, icon: '⛲', tier: 1,
    footprint: 1, placement: 'surface', cost: 3500, upkeep: 90, height: 0.58, mesh: P.plazaFountain,
    description: 'A paved square around a tiered fountain, with benches, topiary planters and lamps. A favourite meeting spot that lifts land value.',
    flavor: 'Coins tossed per day: 3 400. Wishes granted: under review.',
    effects: { landValue: 10, happiness: 3, tourism: 40, radius: 4 },
    coverage: [{ service: 'leisure', radius: 5, strength: 0.55, capacity: 800 }],
    tags: ['park', 'plaza'],
  },
  {
    id: 'dog_park', name: 'Dog Park', category: 'leisure', group: PARKS, icon: '🐕', tier: 1,
    footprint: 1, placement: 'surface', cost: 2200, upkeep: 60, height: 0.4, mesh: P.dogPark,
    description: 'A fenced run with an agility ramp, tunnel, hurdles and a hydrant of honour. Happy dogs, happier owners.',
    flavor: 'Every dog here is a good dog. This has been independently verified.',
    effects: { landValue: 4, happiness: 4, noise: 4, radius: 4 },
    coverage: [{ service: 'leisure', radius: 5, strength: 0.45, capacity: 600 }],
    tags: ['park', 'family'],
  },

  // ───────────────────────────── gardens
  {
    id: 'community_garden', name: 'Community Garden', category: 'leisure', group: GARDENS, icon: '🥕', tier: 0,
    footprint: 1, placement: 'surface', cost: 1600, upkeep: 40, height: 0.42, mesh: P.communityGarden,
    description: 'Raised beds of greens and tomatoes, a tool shed, sunflowers and a scarecrow robot. Neighbours grow food — and friendships.',
    flavor: 'The robot scarecrow has never scared a single crow. It has, however, won three pie contests.',
    effects: { landValue: 3, happiness: 3, pollution: -2, radius: 3 },
    coverage: [{ service: 'leisure', radius: 4, strength: 0.4, capacity: 400 }],
    tags: ['park', 'garden'],
  },
  {
    id: 'zen_garden', name: 'Zen Garden', category: 'leisure', group: GARDENS, icon: '🎋', tier: 1,
    footprint: 1, placement: 'surface', cost: 4000, upkeep: 110, height: 0.45, mesh: P.zenGarden,
    description: 'Raked gravel, moss rocks, a koi pond, a bonsai, a stone lantern and a red torii gate. The calmest tile in the city.',
    flavor: 'The gravel is raked every morning by a monk who has opinions about leaf blowers.',
    effects: { landValue: 6, happiness: 5, radius: 3 },
    coverage: [{ service: 'leisure', radius: 5, strength: 0.5, capacity: 500 }],
    tags: ['park', 'garden'],
  },
  {
    id: 'sculpture_garden', name: 'Sculpture Garden', category: 'leisure', group: GARDENS, icon: '🗿', tier: 2,
    footprint: 1, placement: 'surface', cost: 6000, upkeep: 150, height: 0.4, mesh: P.sculptureGarden,
    description: 'A lawn of modern art: a red torus, a twisted cube stack, a chrome sphere and a very serious stone head. Culture raises land value.',
    flavor: 'Is it art? The plaque says yes. The pigeons remain unconvinced.',
    effects: { landValue: 12, happiness: 2, tourism: 60, radius: 5 },
    coverage: [{ service: 'leisure', radius: 6, strength: 0.5, capacity: 900 }],
    tags: ['park', 'culture'],
  },
  {
    id: 'botanic_garden', name: 'Botanic Garden', category: 'leisure', group: GARDENS, icon: '🌺', tier: 2,
    footprint: 7, placement: 'surface', cost: 18000, upkeep: 600, height: 1.25, mesh: P.botanicGarden,
    description: 'A glass palm house with barrel wings, ribbon flower beds, a lily pond and trees from a dozen worlds. A district-wide boost to land value and mood.',
    flavor: 'Home to 4 000 species, two of which are suspected of plotting.',
    effects: { landValue: 14, happiness: 4, tourism: 250, pollution: -4, radius: 6 },
    coverage: [{ service: 'leisure', radius: 10, strength: 0.8, capacity: 4000 }],
    tags: ['park', 'garden'],
  },
  {
    id: 'biodome', name: 'Biodome', category: 'leisure', group: GARDENS, icon: '🌴', tier: 4,
    footprint: 7, placement: 'surface', cost: 85000, upkeep: 2600, height: 2.45, mesh: P.biodome,
    description: 'A faceted glass dome with a giant tree rising through its oculus, satellite domes and a waterfall. Breathes out oxygen — vital on airless worlds.',
    flavor: 'A rainforest in a jar. Humidity: yes.',
    effects: { landValue: 12, happiness: 4, tourism: 900, oxygen: 15, pollution: -6, radius: 6 },
    coverage: [{ service: 'leisure', radius: 12, strength: 0.85, capacity: 6000 }],
    tags: ['park', 'garden', 'sci-fi'],
  },

  // ───────────────────────────── sports
  {
    id: 'sports_field', name: 'Sports Field', category: 'leisure', group: SPORTS, icon: '⚽', tier: 0,
    footprint: 7, placement: 'surface', cost: 8000, upkeep: 220, height: 0.95, mesh: P.sportsField,
    description: 'A striped pitch with goals, a covered stand, floodlights for night games and a little clubhouse.',
    flavor: 'Saturday league rules: the ball must stay on the planet.',
    effects: { landValue: 4, happiness: 3, noise: 8, radius: 4 },
    coverage: [{ service: 'leisure', radius: 7, strength: 0.7, capacity: 2000 }],
    tags: ['park', 'sports'],
  },
  {
    id: 'skate_park', name: 'Skate Park', category: 'leisure', group: SPORTS, icon: '🛹', tier: 1,
    footprint: 1, placement: 'surface', cost: 3000, upkeep: 80, height: 0.35, mesh: P.skatePark,
    description: 'Half-pipe, funbox with a rail, a stair set and a graffiti wall. Teens finally have somewhere to be.',
    flavor: 'Hover-boards banned. Gravity is part of the sport.',
    effects: { happiness: 3, noise: 8, radius: 3 },
    coverage: [{ service: 'leisure', radius: 5, strength: 0.5, capacity: 600 }],
    tags: ['park', 'sports'],
  },
  {
    id: 'arena', name: 'Arena', category: 'leisure', group: SPORTS, icon: '🏟️', tier: 3,
    footprint: 7, placement: 'surface', cost: 55000, upkeep: 2000, height: 1.12, mesh: V.arena,
    description: 'An indoor bowl wrapped in an LED ribbon under a white dome. Concerts, esports and hoverball draw crowds and ticket income.',
    flavor: 'Seats 20 000. Snack queue seats 20 001.',
    effects: { landValue: 4, happiness: 3, tourism: 700, income: 600, noise: 20, radius: 6 },
    coverage: [{ service: 'leisure', radius: 12, strength: 0.9, capacity: 6000 }],
    tags: ['sports', 'venue'],
  },
  {
    id: 'stadium', name: 'Stadium', category: 'leisure', group: SPORTS, icon: '🏆', tier: 3,
    footprint: 19, placement: 'surface', cost: 120000, upkeep: 3800, height: 2.35, mesh: V.stadium,
    description: 'An oval bowl whose stands sparkle with phone lights at night, a white canopy, jumbotrons and towering floodlights. Huge leisure reach, tourism and income.',
    flavor: 'Home of the Orbital Rangers. Tickets: sold out. Halftime show: a meteor shower (scheduled).',
    effects: { landValue: 4, happiness: 4, tourism: 1500, income: 1200, noise: 30, radius: 8 },
    coverage: [{ service: 'leisure', radius: 18, strength: 1, capacity: 15000 }],
    tags: ['sports', 'venue'],
  },
  {
    id: 'zero_g_dome', name: 'Zero-G Sports Dome', category: 'leisure', group: SPORTS, icon: '🪐', tier: 6,
    footprint: 7, placement: 'surface', cost: 240000, upkeep: 7000, height: 3.05, mesh: V.zeroGDome,
    description: 'A glass sphere cradled on a glowing anti-grav ring, where athletes play in three dimensions. Galaxy-famous: enormous tourism and income.',
    flavor: 'The only sport where the floor is optional and the ceiling is also the floor.',
    effects: { landValue: 8, happiness: 5, tourism: 2200, income: 1600, noise: 10, radius: 7 },
    coverage: [{ service: 'leisure', radius: 20, strength: 1, capacity: 15000 }],
    tags: ['sports', 'venue', 'sci-fi'],
  },

  // ───────────────────────────── entertainment
  {
    id: 'night_market', name: 'Night Market', category: 'leisure', group: SHOWS, icon: '🏮', tier: 2,
    footprint: 1, placement: 'surface', cost: 6000, upkeep: 160, height: 0.42, mesh: V.nightMarket,
    description: 'Lantern-strung stalls with candy-stripe awnings, a food truck and tables under parasols. Glorious after dark.',
    flavor: 'Open from dusk till the dumplings run out.',
    effects: { landValue: 5, happiness: 3, tourism: 160, income: 220, noise: 6, radius: 4 },
    coverage: [{ service: 'leisure', radius: 6, strength: 0.6, capacity: 1200 }],
    tags: ['venue', 'nightlife'],
  },
  {
    id: 'drive_in', name: 'Starlight Drive-In', category: 'leisure', group: SHOWS, icon: '🎬', tier: 2,
    footprint: 7, placement: 'surface', cost: 16000, upkeep: 500, height: 1.25, mesh: V.driveIn,
    description: 'A giant screen, arcs of hover-cars and a striped snack bar whose projector beam glows at night. Retro fun with ticket income.',
    flavor: 'Tonight’s double feature: “Attack of the 50-Foot Landlord” and “Return of the Recycled Air”.',
    effects: { happiness: 3, tourism: 150, income: 250, noise: 6, radius: 4 },
    coverage: [{ service: 'leisure', radius: 10, strength: 0.6, capacity: 3000 }],
    tags: ['venue', 'nightlife'],
  },
  {
    id: 'concert_bowl', name: 'Concert Bowl', category: 'leisure', group: SHOWS, icon: '🎸', tier: 3,
    footprint: 7, placement: 'surface', cost: 40000, upkeep: 1500, height: 1.08, mesh: V.concertBowl,
    description: 'A white band shell ringed with glowing arcs, speaker towers and a lawn packed with fans. Loud, beloved and lucrative.',
    flavor: 'The neighbours complained, then bought season tickets.',
    effects: { happiness: 4, tourism: 500, income: 300, noise: 25, radius: 6 },
    coverage: [{ service: 'leisure', radius: 12, strength: 0.8, capacity: 6000 }],
    tags: ['venue', 'music'],
  },
  {
    id: 'holo_theatre', name: 'Holo-Theatre', category: 'leisure', group: SHOWS, icon: '🎭', tier: 4,
    footprint: 1, placement: 'surface', cost: 36000, upkeep: 1400, height: 1.32, mesh: V.holoTheatre,
    description: 'A velvet-purple playhouse with a marquee screen and a towering hologram dancer on the roof. Big leisure reach from a single tile.',
    flavor: 'The lead actor is a hologram. So is the critic. The reviews are glowing.',
    effects: { landValue: 6, happiness: 3, tourism: 400, income: 350, noise: 6, radius: 5 },
    coverage: [{ service: 'leisure', radius: 10, strength: 0.7, capacity: 3000 }],
    tags: ['venue', 'nightlife', 'sci-fi'],
  },
  {
    id: 'opera_house', name: 'Opera House', category: 'leisure', group: SHOWS, icon: '🎼', tier: 4,
    footprint: 7, placement: 'surface', cost: 90000, upkeep: 3000, height: 1.55, mesh: V.operaHouse,
    description: 'White sail shells over a stone podium with glass foyers and a reflecting pool. A cultural icon that sends land values soaring.',
    flavor: 'It isn’t over until the synthesised soprano sings. She sings for four hours.',
    effects: { landValue: 15, happiness: 3, tourism: 900, income: 300, radius: 7 },
    coverage: [{ service: 'leisure', radius: 14, strength: 0.85, capacity: 6000 }],
    tags: ['venue', 'culture'],
  },

  // ───────────────────────────── attractions
  {
    id: 'observation_tower', name: 'Observation Tower', category: 'leisure', group: ATTRACTIONS, icon: '🗼', tier: 3,
    footprint: 1, placement: 'surface', cost: 30000, upkeep: 900, height: 4.05, mesh: V.observationTower,
    description: 'A slender flared shaft topped by a glass saucer with a glowing rim and a needle antenna. The best view of your city — tourists queue for it.',
    flavor: 'On a clear day you can see the curvature of the planet. And your own house. Wave!',
    effects: { landValue: 6, happiness: 2, tourism: 600, income: 200, radius: 5 },
    coverage: [{ service: 'leisure', radius: 10, strength: 0.5, capacity: 2000 }],
    tags: ['attraction', 'landmark-lite'],
  },
  {
    id: 'aquarium', name: 'Aquarium', category: 'leisure', group: ATTRACTIONS, icon: '🐋', tier: 3,
    footprint: 7, placement: 'surface', cost: 60000, upkeep: 2200, height: 1.45, mesh: V.aquarium, requires: { coastal: true },
    description: 'A wave-roofed glass hall, a towering water column of glowing fish and a whale breaching from the plaza pool. Must be built on the coast.',
    flavor: 'The octopus escaped again. It left a note.',
    effects: { landValue: 8, happiness: 3, tourism: 900, income: 400, radius: 6 },
    coverage: [{ service: 'leisure', radius: 12, strength: 0.8, capacity: 5000 }],
    tags: ['attraction', 'coastal'],
  },
  {
    id: 'water_park', name: 'Water Park', category: 'leisure', group: ATTRACTIONS, icon: '🌊', tier: 3,
    footprint: 7, placement: 'surface', cost: 48000, upkeep: 1800, height: 1.25, mesh: V.waterPark,
    description: 'A lagoon, a wave pool and a slide tower with three twisting slides, ringed by palms and parasols. Drinks a lot of water.',
    flavor: 'Rule 1: no running. Rule 2: no surfing the lazy river. Rule 3: see rule 2.',
    effects: { water: -25, landValue: 4, happiness: 4, tourism: 700, income: 500, noise: 10, radius: 5 },
    coverage: [{ service: 'leisure', radius: 12, strength: 0.85, capacity: 6000 }],
    tags: ['attraction', 'family'],
  },
  {
    id: 'amusement_park', name: 'Amusement Park', category: 'leisure', group: ATTRACTIONS, icon: '🎡', tier: 3,
    footprint: 19, placement: 'surface', cost: 110000, upkeep: 4200, height: 2.85, mesh: V.amusementPark,
    description: 'A Ferris wheel, a looping roller coaster, a carousel, a drop tower and a fairy-tale gate. The city’s happiest square kilometre.',
    flavor: 'You must be this tall to ride. You must be this brave to eat the space-candyfloss.',
    effects: { landValue: 6, happiness: 6, tourism: 2500, income: 1400, noise: 25, radius: 8 },
    coverage: [{ service: 'leisure', radius: 18, strength: 1, capacity: 14000 }],
    tags: ['attraction', 'family'],
  },
  {
    id: 'alien_zoo', name: 'Alien Zoo', category: 'leisure', group: ATTRACTIONS, icon: '🦕', tier: 4,
    footprint: 19, placement: 'surface', cost: 150000, upkeep: 5000, height: 1.4, mesh: V.alienZoo,
    description: 'Crystal grazers, a tentacle lagoon, a long-necked sky-grazer, a sandworm in the dunes and an aviary of glowing flyers. Galaxy-class tourism.',
    flavor: 'Please do not tap on the glass. The glass taps back.',
    effects: { landValue: 6, happiness: 4, tourism: 2000, income: 800, noise: 8, radius: 7 },
    coverage: [{ service: 'leisure', radius: 18, strength: 0.9, capacity: 12000 }],
    tags: ['attraction', 'family', 'sci-fi'],
  },
  {
    id: 'pocket_universe', name: 'Pocket Universe Park', category: 'leisure', group: ATTRACTIONS, icon: '🌍', tier: 8,
    footprint: 7, placement: 'surface', cost: 1200000, upkeep: 30000, height: 2.8, mesh: V.pocketUniverse,
    description: 'A portal ring cradles a miniature world — with its own ring, moon and stars — above a mirror pool. Planet-wide leisure; tourists cross galaxies to see it.',
    flavor: 'A whole universe in a park. Entry is free; leaving costs one small paradox.',
    effects: { landValue: 20, happiness: 8, tourism: 6000, income: 2500, radius: 10 },
    coverage: [{ service: 'leisure', radius: 40, strength: 1, capacity: 60000 }],
    tags: ['attraction', 'sci-fi'],
  },

  // ───────────────────────────── resorts
  {
    id: 'hot_springs', name: 'Hot Springs Spa', category: 'leisure', group: RESORTS, icon: '♨️', tier: 2,
    footprint: 1, placement: 'surface', cost: 12000, upkeep: 380, height: 0.45, mesh: V.hotSprings, requires: { feature: [Feature.GeoVent] },
    description: 'Cascading rock pools on a geothermal vent, rising steam, a wooden bathhouse and a few bathing monkeys. Must be built on a geothermal vent.',
    flavor: 'The monkeys were here first. They have seniority.',
    effects: { landValue: 6, happiness: 6, tourism: 400, income: 150, radius: 4 },
    coverage: [{ service: 'leisure', radius: 7, strength: 0.7, capacity: 1500 }],
    tags: ['resort'],
  },
  {
    id: 'beach_resort', name: 'Beach Resort', category: 'leisure', group: RESORTS, icon: '🏖️', tier: 3,
    footprint: 7, placement: 'surface', cost: 65000, upkeep: 2300, height: 0.78, mesh: V.beachResort, requires: { coastal: true },
    description: 'A terraced white hotel, an infinity pool, thatched cabanas, palms and a volleyball net. Must be built on the coast.',
    flavor: 'All-inclusive: sun, sand, and a cocktail that is 40 % umbrella.',
    effects: { landValue: 12, happiness: 4, tourism: 1200, income: 700, radius: 6 },
    coverage: [{ service: 'leisure', radius: 10, strength: 0.7, capacity: 4000 }],
    tags: ['resort', 'coastal'],
  },
  {
    id: 'ski_lodge', name: 'Ski Lodge', category: 'leisure', group: RESORTS, icon: '⛷️', tier: 3,
    footprint: 7, placement: 'surface', cost: 40000, upkeep: 1500, height: 1.05, mesh: V.skiLodge, planetTypes: ['arctic', 'tundra'],
    description: 'A snow-capped A-frame chalet, a groomed slope with slalom flags, a chairlift and a fire pit. Only on arctic and tundra worlds.',
    flavor: 'Après-ski starts at noon. Ski starts at never.',
    effects: { landValue: 8, happiness: 4, tourism: 800, income: 400, radius: 5 },
    coverage: [{ service: 'leisure', radius: 12, strength: 0.8, capacity: 4000 }],
    tags: ['resort'],
  },
  {
    id: 'alpine_lodge', name: 'Alpine Gondola Lodge', category: 'leisure', group: RESORTS, icon: '🚠', tier: 3,
    footprint: 7, placement: 'surface', cost: 45000, upkeep: 1600, height: 2.2, mesh: V.alpineLodge, requires: { minElevation: 6 },
    description: 'A stone-and-timber hotel with a cable-car station whose red gondola climbs to a mountain pylon. Needs high ground.',
    flavor: 'The view is breathtaking. So is the air — we’re working on that.',
    effects: { landValue: 8, happiness: 4, tourism: 900, income: 400, radius: 5 },
    coverage: [{ service: 'leisure', radius: 12, strength: 0.8, capacity: 4000 }],
    tags: ['resort'],
  },
];

registerItems(defs);
