/**
 * OWNER: agent landmarks
 * Landmarks (group "Landmarks": unique monuments, tiers 0–6, footprint 1 or 7, ≤ 3 000 tris) and Wonders (group
 * "Wonders": unique megastructures, footprint 19, tiers 5–8, ≤ 6 000 tris). Meshes: content/meshes/landmarks/**.
 *
 * Balance (see catalog.ts guide): landmarks cost 30 000–150 000 with ~2 % upkeep and pay back in tourism, land
 * value and happiness over a wide radius; wonders cost 250 000–2 000 000 and add a signature city-wide effect
 * (housing, power, research, data, shield, weather, warp travel). Progression tags: "warpgate" (Warp Gate,
 * unlocks interstellar travel), "intergalactic" (Intergalactic Gate), "shield" (disaster damage resistance),
 * "weather", and "wonder" on every wonder so the sim counts them even if `unique` semantics change.
 */
import { registerItems, type ItemDef } from '../catalog';
import { LANDMARK_MESHES as L } from '../meshes/landmarks/monuments';
import { WONDER_MESHES as W } from '../meshes/landmarks/wonders';

const LM = 'Landmarks';
const WD = 'Wonders';

type Base = Pick<ItemDef, 'category' | 'placement' | 'unique'>;
const lm: Base = { category: 'landmarks', placement: 'surface', unique: true };

const landmarks: ItemDef[] = [
  // ─────────────────────────────── T0 – T1
  {
    ...lm, id: 'lm_lander_memorial', name: 'Colony Lander Memorial', group: LM, icon: '🛬', tier: 0, footprint: 7,
    cost: 30_000, upkeep: 450, height: 2.9, mesh: L.landerMemorial,
    description: 'The very landing craft your first colonists rode down in, set on its scorched touchdown circle with plaques naming every passenger. Tourists, pride and a little nostalgia.',
    flavor: 'Still smells faintly of reheated space noodles and courage.',
    effects: { tourism: 300, landValue: 14, happiness: 8, radius: 7 },
    tags: ['landmark', 'history'],
  },
  {
    ...lm, id: 'lm_founders_monument', name: 'Founders Monument', group: LM, icon: '🗿', tier: 0, footprint: 1,
    cost: 12_000, upkeep: 180, height: 1.85, mesh: L.foundersMonument,
    description: 'A marble obelisk with a gilded tip, three bronze founders at its foot. A modest first landmark that makes the neighbourhood feel like a real town.',
    flavor: 'The founders are depicted pointing at the horizon. Historians agree they were arguing about directions.',
    effects: { tourism: 80, landValue: 10, happiness: 5, radius: 5 },
    tags: ['landmark', 'history'],
  },
  {
    ...lm, id: 'lm_clock_tower', name: 'Clock Tower', group: LM, icon: '🕰️', tier: 1, footprint: 1,
    cost: 40_000, upkeep: 600, height: 4.3, mesh: L.clockTower,
    description: 'A stately stone clock tower with four faces that glow warm after dusk and a golden bell in an open belfry. Keeps the whole city on time — local time, anyway.',
    flavor: 'Synced to an atomic clock, then set five minutes fast so everyone arrives on time.',
    effects: { tourism: 260, landValue: 16, happiness: 7, radius: 8 },
    tags: ['landmark'],
  },
  {
    ...lm, id: 'lm_lighthouse', name: 'Lighthouse', group: LM, icon: '🗼', tier: 1, footprint: 1,
    cost: 42_000, upkeep: 620, height: 2.6, mesh: L.lighthouse, requires: { coastal: true },
    description: 'A red-and-white lighthouse on a rocky outcrop, its lantern sweeping beams across the sea at night. Must be built on the coast. Boosts coastal tourism and shipping morale.',
    flavor: 'The keeper hasn’t seen a ship in years. He waves at the satellites instead.',
    effects: { tourism: 320, landValue: 14, happiness: 6, radius: 7 },
    tags: ['landmark', 'coastal'],
  },
  {
    ...lm, id: 'lm_pioneer_statue', name: 'Statue of the Pioneer', group: LM, icon: '👩‍🚀', tier: 1, footprint: 1,
    cost: 36_000, upkeep: 520, height: 2.3, mesh: L.pioneerStatue,
    description: 'An astronaut planting the colony flag, cast in white bronze and saluting the sky. Citizens touch the boot for luck.',
    flavor: 'The visor is real gold. The boot is real shiny. Nobody touches the visor.',
    effects: { tourism: 220, landValue: 14, happiness: 8, radius: 7 },
    tags: ['landmark', 'history'],
  },
  // ─────────────────────────────── T2
  {
    ...lm, id: 'lm_grand_arch', name: 'Grand Arch', group: LM, icon: '🌈', tier: 2, footprint: 7,
    cost: 65_000, upkeep: 1_000, height: 7.3, mesh: L.grandArch,
    description: 'A soaring stainless-steel catenary arch with a neon spine, framing twin reflecting pools. The gateway to the city, visible from every district.',
    flavor: 'Engineers call it a catenary. Everyone else calls it “the big shiny croissant”.',
    effects: { tourism: 700, landValue: 22, happiness: 9, radius: 10 },
    tags: ['landmark'],
  },
  {
    ...lm, id: 'lm_aurora_fountain', name: 'Aurora Fountain', group: LM, icon: '⛲', tier: 2, footprint: 7,
    cost: 55_000, upkeep: 850, height: 3.2, mesh: L.auroraFountain,
    description: 'A grand tiered fountain whose crown is a twist of glowing aurora ribbons, ringed by dancing water jets. The city’s favourite meeting point.',
    flavor: 'Coins thrown in so far: 4.2 million. Wishes granted: the fountain declines to comment.',
    effects: { tourism: 520, landValue: 20, happiness: 11, pollution: -4, radius: 8 },
    tags: ['landmark', 'water'],
  },
  {
    ...lm, id: 'lm_rocket_garden', name: 'Rocket Garden', group: LM, icon: '🚀', tier: 2, footprint: 7,
    cost: 60_000, upkeep: 900, height: 4.6, mesh: L.rocketGarden,
    description: 'Historic rockets standing proud on their launch stands beside a rusty gantry: the ships that got you here, their rivals and the one that never quite left the pad. Adds a little research.',
    flavor: 'The small red one is “Plan B”. We don’t talk about Plan B.',
    effects: { tourism: 600, landValue: 16, happiness: 8, research: 20, radius: 9 },
    tags: ['landmark', 'history', 'space'],
  },
  {
    ...lm, id: 'lm_ascension_column', name: 'Column of Ascension', group: LM, icon: '🏛️', tier: 2, footprint: 1,
    cost: 48_000, upkeep: 700, height: 3.4, mesh: L.ascensionColumn,
    description: 'A slender marble column wrapped in a golden spiral relief, crowned by a winged figure and a ring of light. Commemorates everyone who ever said “we should go up there”.',
    flavor: 'The relief tells the history of the colony. It is 90 % rockets and 10 % paperwork.',
    effects: { tourism: 380, landValue: 18, happiness: 7, radius: 8 },
    tags: ['landmark'],
  },
  // ─────────────────────────────── T3
  {
    ...lm, id: 'lm_sky_needle', name: 'Sky Needle', group: LM, icon: '🛸', tier: 3, footprint: 7,
    cost: 95_000, upkeep: 1_500, height: 9.5, mesh: L.skyNeedle,
    description: 'A tripod observation tower topped by a flying-saucer deck with a glass panorama restaurant, a neon halo and a red aviation beacon. Visible from orbit at night.',
    flavor: 'The restaurant revolves once an hour. The soup revolves faster.',
    effects: { tourism: 1_200, landValue: 26, happiness: 10, income: 400, radius: 12 },
    tags: ['landmark', 'tower'],
  },
  {
    ...lm, id: 'lm_neon_pagoda', name: 'Neon Pagoda', group: LM, icon: '🏯', tier: 3, footprint: 7,
    cost: 80_000, upkeep: 1_200, height: 5.4, mesh: L.neonPagoda,
    description: 'A five-tier pagoda whose eaves are traced in magenta and cyan neon, with a torii gate, paper lanterns and cherry trees. Serene by day, electric by night.',
    flavor: 'Ancient tradition meets modern wiring. The monks have very strong opinions about extension cords.',
    effects: { tourism: 900, landValue: 22, happiness: 12, radius: 10 },
    tags: ['landmark', 'neon'],
  },
  {
    ...lm, id: 'lm_megadome_hall', name: 'Mega-dome City Hall', group: LM, icon: '🏛️', tier: 3, footprint: 7,
    cost: 110_000, upkeep: 1_800, height: 3.6, mesh: L.megadomeHall, styleable: true,
    description: 'A colossal civic hall crowned by a ribbed glass dome, with a columned portico, grand stairs and fountains. Re-skins with the district’s architectural style. Boosts land value and civic pride across a wide area.',
    flavor: 'The dome was designed to inspire. The council meets in the basement anyway.',
    effects: { tourism: 600, landValue: 30, happiness: 10, jobs: 120, radius: 12 },
    tags: ['landmark', 'civic'],
  },
  {
    ...lm, id: 'lm_spiral_library', name: 'Spiral Library', group: LM, icon: '📚', tier: 3, footprint: 7,
    cost: 85_000, upkeep: 1_300, height: 5.6, mesh: L.spiralLibrary,
    description: 'Thirteen reading floors twist around a single spine, wrapped by a glowing spiral ramp and topped with a lantern of knowledge. Generates research and education prestige.',
    flavor: 'Shelved by colour, then by vibe. The librarians insist this is a system.',
    effects: { tourism: 500, landValue: 20, happiness: 7, research: 60, radius: 9 },
    coverage: [{ service: 'education', radius: 10, strength: 0.25, capacity: 1_500 }],
    tags: ['landmark', 'culture'],
  },
  {
    ...lm, id: 'lm_grotto', name: 'Bio-Luminescent Grotto', group: LM, icon: '🍄', tier: 3, footprint: 7,
    cost: 70_000, upkeep: 1_000, height: 2.2, mesh: L.grotto,
    description: 'A mossy cave hill glowing from within, ringed by luminous mushrooms, crystal outcrops and a still pool. Nature’s own light show — best after dark.',
    flavor: 'The mushrooms glow brighter when you compliment them. Science is still processing this.',
    effects: { tourism: 750, landValue: 18, happiness: 12, pollution: -6, radius: 9 },
    tags: ['landmark', 'nature', 'glow'],
  },
  // ─────────────────────────────── T4
  {
    ...lm, id: 'lm_pyramid_light', name: 'Pyramid of Light', group: LM, icon: '🔺', tier: 4, footprint: 7,
    cost: 120_000, upkeep: 2_000, height: 9.6, mesh: L.pyramidOfLight,
    description: 'A glass pyramid with a glowing skeleton and a golden capstone, rising from a reflecting pool and firing a pillar of light into the sky every night.',
    flavor: 'Built to stand ten thousand years. The beam is visible from three moons and one very confused comet.',
    effects: { tourism: 1_600, landValue: 28, happiness: 11, radius: 12 },
    tags: ['landmark', 'beam'],
  },
  {
    ...lm, id: 'lm_colossus', name: 'Colossus', group: LM, icon: '🗽', tier: 4, footprint: 7,
    cost: 130_000, upkeep: 2_100, height: 7.6, mesh: L.colossus,
    description: 'A colossal patinated guardian holding a burning torch aloft and the colony charter at its side, floodlit from below. The city’s defining silhouette.',
    flavor: 'Thirty storeys of bronze and not one of them is a bathroom.',
    effects: { tourism: 1_800, landValue: 26, happiness: 12, radius: 12 },
    tags: ['landmark', 'statue'],
  },
  {
    ...lm, id: 'lm_crystal_spire', name: 'Crystal Spire', group: LM, icon: '💎', tier: 4, footprint: 7,
    cost: 115_000, upkeep: 1_800, height: 7.2, mesh: L.crystalSpire,
    description: 'A forest of faceted crystal shards around a luminous core, with fragments floating overhead on an invisible current. Hums a single soothing note.',
    flavor: 'Tuned to B-flat. The orchestra tunes to it now.',
    effects: { tourism: 1_400, landValue: 24, happiness: 12, research: 40, radius: 11 },
    tags: ['landmark', 'crystal', 'glow'],
  },
  {
    ...lm, id: 'lm_holo_moon', name: 'Holo-Moon Monument', group: LM, icon: '🌕', tier: 4, footprint: 7,
    cost: 105_000, upkeep: 1_700, height: 4.5, mesh: L.holoMoon,
    description: 'A full moon rendered in light, hovering above a stepped pedestal between three projector pylons and wrapped in glowing orbit rings. Phases with the real calendar.',
    flavor: 'Werewolves have filed a formal complaint about the 24-hour full moon.',
    effects: { tourism: 1_300, landValue: 22, happiness: 11, radius: 11 },
    tags: ['landmark', 'holo'],
  },
  {
    ...lm, id: 'lm_magcoaster_tower', name: 'Mag-Coaster Tower', group: LM, icon: '🎢', tier: 4, footprint: 7,
    cost: 125_000, upkeep: 2_200, height: 7.3, mesh: L.magCoasterTower,
    description: 'A lattice tower wrapped in a corkscrewing magnetic roller-coaster with neon underglow, topped by a glass sky lounge. Loud, thrilling and very profitable.',
    flavor: '0 to 200 km/h in 2 seconds. Lunch to sky in 2.1.',
    effects: { tourism: 1_500, landValue: 16, happiness: 13, income: 900, noise: 18, radius: 10 },
    tags: ['landmark', 'attraction'],
  },
  {
    ...lm, id: 'lm_sky_gardens', name: 'Sky Gardens', group: LM, icon: '🌿', tier: 4, footprint: 7,
    cost: 110_000, upkeep: 1_700, height: 7.2, mesh: L.skyGardens,
    description: 'Three slender glass towers carrying cantilevered gardens, with waterfalls tumbling from terrace to terrace into a pool below. Cleans the air for blocks around.',
    flavor: 'Gravity-fed irrigation: the most relaxing physics lesson in the city.',
    effects: { tourism: 1_100, landValue: 26, happiness: 13, pollution: -12, oxygen: 20, radius: 11 },
    tags: ['landmark', 'nature', 'water'],
  },
  // ─────────────────────────────── T5 – T6
  {
    ...lm, id: 'lm_floating_cathedral', name: 'Floating Cathedral', group: LM, icon: '⛪', tier: 5, footprint: 7,
    cost: 140_000, upkeep: 2_400, height: 6.2, mesh: L.floatingCathedral,
    description: 'A gothic cathedral hovering on a chunk of bedrock above its plaza, held aloft by glowing anti-grav rings, its rose window shimmering through every colour.',
    flavor: 'Services are held at 40 metres. The congregation has never been closer to heaven, or to the pigeons.',
    effects: { tourism: 2_000, landValue: 28, happiness: 14, radius: 12 },
    coverage: [{ service: 'spiritual', radius: 14, strength: 0.4, capacity: 4_000 }],
    tags: ['landmark', 'faith', 'hover'],
  },
  {
    ...lm, id: 'lm_tree_of_life', name: 'Tree of Life', group: LM, icon: '🌳', tier: 5, footprint: 7,
    cost: 135_000, upkeep: 2_000, height: 5.5, mesh: L.treeOfLife,
    description: 'A colossal ancient tree, coaxed from a single seed, with roots gripping a garden ring and a canopy strung with glowing fruit and vines. Purifies the air and lifts every spirit nearby.',
    flavor: 'Planted by the first gardener. Watered by everyone since. Climbed by exactly one very brave cat.',
    effects: { tourism: 1_800, landValue: 30, happiness: 16, pollution: -18, oxygen: 40, radius: 13 },
    tags: ['landmark', 'nature', 'glow'],
  },
  {
    ...lm, id: 'lm_terraform_obelisk', name: 'Terraforming Obelisk', group: LM, icon: '🗼', tier: 5, footprint: 7,
    cost: 150_000, upkeep: 2_600, height: 7.2, mesh: L.terraformObelisk,
    description: 'A towering black monolith laced with green rune channels and atmosphere vents. It quietly breathes oxygen into the sky and greens the land around it.',
    flavor: 'We dug it up, turned it on, and the desert grew a lawn. Nobody has asked what else it does.',
    effects: { tourism: 1_400, landValue: 24, happiness: 10, pollution: -25, oxygen: 120, research: 50, radius: 14 },
    tags: ['landmark', 'ancient', 'terraform'],
  },
  {
    ...lm, id: 'lm_cosmic_clock', name: 'Cosmic Clock', group: LM, icon: '🪐', tier: 5, footprint: 7,
    cost: 125_000, upkeep: 2_100, height: 5.4, mesh: L.cosmicClock,
    description: 'A giant brass orrery: a blazing artificial sun, tilted orbit rings and their worlds, standing on a glowing zodiac plaza. Tells the time on five planets at once.',
    flavor: 'Accurate to a millisecond on every world except this one. Daylight saving, again.',
    effects: { tourism: 1_700, landValue: 24, happiness: 12, research: 80, radius: 11 },
    tags: ['landmark', 'science'],
  },
  {
    ...lm, id: 'lm_halo_gate', name: 'Halo Bridge Gate', group: LM, icon: '💫', tier: 6, footprint: 7,
    cost: 150_000, upkeep: 2_600, height: 5.1, mesh: L.haloGate,
    description: 'A giant standing halo with neon chevrons, cradled by two pylons above a glowing bridge deck. Every parade, marathon and conquering hero passes through it.',
    flavor: 'Engineers swear it is purely decorative. It hums when the warp gate opens anyway.',
    effects: { tourism: 2_200, landValue: 30, happiness: 13, radius: 13 },
    tags: ['landmark', 'gate'],
  },
];

const wd: Base = { category: 'landmarks', placement: 'surface', unique: true };

const wonders: ItemDef[] = [
  {
    ...wd, id: 'wonder_arcology_prime', name: 'Arcology Prime', group: WD, icon: '🏙️', tier: 5, footprint: 19,
    cost: 450_000, upkeep: 6_500, height: 17, mesh: W.arcologyPrime,
    description: 'A self-contained mountain of a city: eight terraced rings of homes, gardens and glowing promenades rising to a glass crown. Houses twenty thousand people on a single footprint.',
    flavor: 'Residents can live, work, shop and retire without ever going outside. Most still go outside, to look at it.',
    effects: { housing: 20_000, jobs: 3_000, tourism: 3_000, landValue: 30, happiness: 10, power: -60, water: -50, radius: 16 },
    tags: ['wonder', 'housing', 'arcology'],
  },
  {
    ...wd, id: 'wonder_hanging_gardens', name: 'Hanging Gardens of Nova', group: WD, icon: '🌺', tier: 5, footprint: 19,
    cost: 380_000, upkeep: 5_000, height: 9.5, mesh: W.hangingGardens,
    description: 'A terraced ziggurat dripping with greenery and waterfalls, crowned by a crystal pavilion while garden islands float overhead. Breathes for half the city.',
    flavor: 'Ancient wonder, modern irrigation, floating extras. The gardeners commute by jetpack.',
    effects: { tourism: 3_500, landValue: 34, happiness: 18, pollution: -35, oxygen: 200, radius: 18 },
    tags: ['wonder', 'nature', 'water'],
  },
  {
    ...wd, id: 'wonder_galactic_senate', name: 'Galactic Senate', group: WD, icon: '🏛️', tier: 6, footprint: 19,
    cost: 700_000, upkeep: 9_000, height: 9.5, mesh: W.galacticSenate,
    description: 'A colossal saucer-shaped chamber on a crystal stem where the delegates of a hundred worlds argue under a holographic galaxy. Diplomacy brings tourists, trade and prestige.',
    flavor: 'Item one on every agenda since founding: “Who keeps taking the good chair?”',
    effects: { tourism: 4_500, landValue: 35, happiness: 12, income: 3_000, jobs: 1_200, radius: 18 },
    tags: ['wonder', 'civic', 'diplomacy'],
  },
  {
    ...wd, id: 'wonder_stellar_forge', name: 'Stellar Forge', group: WD, icon: '☀️', tier: 6, footprint: 19,
    cost: 900_000, upkeep: 12_000, height: 10, mesh: W.stellarForge,
    description: 'A captured miniature star held in a cage of magnetic rings and pylons, its plasma piped down to ground transformers. Produces a staggering 2 000 MW of clean power.',
    flavor: 'Do not look directly at the forge. Do not look indirectly at the forge. Just trust us, it’s working.',
    effects: { power: 2_000, jobs: 600, tourism: 2_500, landValue: 10, noise: 20, radius: 14 },
    tags: ['wonder', 'power', 'star'],
  },
  {
    ...wd, id: 'wonder_warp_gate', name: 'Warp Gate', group: WD, icon: '🌀', tier: 6, footprint: 19,
    cost: 1_200_000, upkeep: 15_000, height: 8.4, mesh: W.warpGate,
    description: 'A ring the height of a skyscraper, cradled on a launch apron, its event horizon shimmering blue. Unlocks interstellar travel: new star systems open to colonisation.',
    flavor: 'Please keep arms, legs and existential dread inside the vehicle at all times.',
    effects: { tourism: 5_000, income: 4_000, landValue: 20, power: -300, noise: 15, radius: 16 },
    tags: ['wonder', 'warpgate', 'gate'],
  },
  {
    ...wd, id: 'wonder_shield_generator', name: 'Planetary Shield Generator', group: WD, icon: '🛡️', tier: 6, footprint: 19,
    cost: 1_000_000, upkeep: 14_000, height: 10.8, mesh: W.shieldGenerator,
    description: 'A towering emitter crowned by a blazing crystal, projecting a lattice of force that protects the whole world. Greatly reduces damage from disasters and god powers.',
    flavor: 'Rated for meteors, kaiju and mild vacuum decay. Not rated for your neighbour’s music.',
    effects: { landValue: 25, happiness: 14, tourism: 2_000, power: -400, radius: 20 },
    tags: ['wonder', 'shield', 'defense'],
  },
  {
    ...wd, id: 'wonder_weather_dominion', name: 'Weather Dominion Tower', group: WD, icon: '⛈️', tier: 6, footprint: 19,
    cost: 850_000, upkeep: 11_000, height: 19.5, mesh: W.weatherDominion,
    description: 'A needle tower with cloud-seeding arms and a captive storm crackling around its crown. Tames the climate: calmer storms, kinder seasons, sunshine on demand.',
    flavor: 'Takes requests. Weddings get sunshine. Tax day gets drizzle.',
    effects: { tourism: 2_500, landValue: 20, happiness: 12, power: -250, radius: 20 },
    coverage: [{ service: 'fire', radius: 40, strength: 0.3 }],
    tags: ['wonder', 'weather'],
  },
  {
    ...wd, id: 'wonder_gravity_defier', name: 'Gravity Defier', group: WD, icon: '🏝️', tier: 6, footprint: 19,
    cost: 800_000, upkeep: 10_000, height: 12, mesh: W.gravityDefier,
    description: 'Five islands of rock and garden float above the city at different heights, trailing waterfalls into thin air and linked by chains of light. Pure spectacle.',
    flavor: 'Property values are sky-high. Literally. The estate agents float too.',
    effects: { tourism: 6_000, landValue: 32, happiness: 16, income: 2_500, radius: 18 },
    tags: ['wonder', 'hover', 'nature'],
  },
  {
    ...wd, id: 'wonder_time_spire', name: 'Time Spire', group: WD, icon: '⏳', tier: 7, footprint: 19,
    cost: 1_400_000, upkeep: 16_000, height: 21, mesh: W.timeSpire,
    description: 'A twisting spire threaded through floating rings and holographic clock faces, an hourglass of liquid light at its waist. Its chronometric research advances every science.',
    flavor: 'Visitors report leaving before they arrived. The gift shop sells souvenirs from next week.',
    effects: { research: 1_500, tourism: 4_000, landValue: 28, happiness: 10, power: -500, radius: 18 },
    tags: ['wonder', 'science', 'time'],
  },
  {
    ...wd, id: 'wonder_matrioshka_node', name: 'Matrioshka Node', group: WD, icon: '🧠', tier: 7, footprint: 19,
    cost: 1_600_000, upkeep: 18_000, height: 9.5, mesh: W.matrioshkaNode,
    description: 'Nested shells of computronium around a blazing core: a planetary-scale brain that runs your city’s data, forecasts and research at once.',
    flavor: 'It has solved chess, go, traffic and the meaning of life. It is now working on parking.',
    effects: { data: 5_000, research: 1_200, jobs: 400, power: -800, landValue: 15, tourism: 2_000, radius: 14 },
    tags: ['wonder', 'data', 'science'],
  },
  {
    ...wd, id: 'wonder_infinite_library', name: 'Infinite Library', group: WD, icon: '📖', tier: 7, footprint: 19,
    cost: 1_100_000, upkeep: 13_000, height: 13.5, mesh: W.infiniteLibrary,
    description: 'An inverted ziggurat of reading halls balanced on a glass stem, orbited by floating book-slabs and topped with a beacon of knowledge. Every book ever written, and several that weren’t.',
    flavor: 'Overdue fines are measured in light-years.',
    effects: { research: 900, tourism: 3_500, landValue: 30, happiness: 12, radius: 18 },
    coverage: [{ service: 'education', radius: 30, strength: 0.6, capacity: 30_000 }],
    tags: ['wonder', 'culture', 'science'],
  },
  {
    ...wd, id: 'wonder_neural_nexus', name: 'Neural Nexus', group: WD, icon: '🧬', tier: 7, footprint: 19,
    cost: 1_300_000, upkeep: 15_000, height: 4.5, mesh: W.neuralNexus,
    description: 'A colossal living brain-dome laced with glowing synapses, wired to antenna pylons that link every citizen’s implants. Happier, smarter, slightly telepathic citizens.',
    flavor: 'Everyone is connected. Everyone knows what you got them for their birthday.',
    effects: { data: 3_000, research: 700, happiness: 18, landValue: 24, tourism: 3_000, power: -600, radius: 20 },
    tags: ['wonder', 'data', 'bio'],
  },
  {
    ...wd, id: 'wonder_cosmic_cathedral', name: 'Cosmic Cathedral', group: WD, icon: '✨', tier: 7, footprint: 19,
    cost: 1_000_000, upkeep: 12_000, height: 20, mesh: W.cosmicCathedral,
    description: 'Six naves radiating like a star around a glass crossing and a spire that pierces the clouds, every rose window shifting colour, a beam of light at the tip. Faiths of a hundred worlds share it.',
    flavor: 'Took 300 years to build. 200 of those were spent agreeing on the hymn.',
    effects: { tourism: 6_500, landValue: 34, happiness: 18, radius: 20 },
    coverage: [{ service: 'spiritual', radius: 40, strength: 0.9, capacity: 60_000 }],
    tags: ['wonder', 'faith'],
  },
  {
    ...wd, id: 'wonder_intergalactic_gate', name: 'Intergalactic Gate', group: WD, icon: '🌌', tier: 8, footprint: 19,
    cost: 2_000_000, upkeep: 25_000, height: 11, mesh: W.intergalacticGate,
    description: 'Three nested gyroscopic rings spinning around a captive galaxy-vortex, anchored by four titanic arms. Opens a path across the void to other galaxies.',
    flavor: 'Destination: everywhere. Estimated travel time: yes.',
    effects: { tourism: 8_000, income: 8_000, landValue: 25, power: -1_200, noise: 20, radius: 20 },
    tags: ['wonder', 'intergalactic', 'gate'],
  },
];

registerItems([...landmarks, ...wonders]);
