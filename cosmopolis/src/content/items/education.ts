/**
 * OWNER: agent services
 * Schools, universities, libraries, museums, research labs, observatories and the big-science megaprojects.
 *
 * Coverage services used: education (demand factor 0.2 — a 700-seat school serves ~3 500 residents) and
 * research (no capacity; research buildings also add `effects.research` points per month). The sim files
 * research-coverage buildings under the Research budget and the rest under Education.
 * Meshes: content/meshes/services/learning.ts. Styleable schools and the library re-skin with the district style.
 */
import { registerItems, type ItemDef } from '../catalog';
import * as L from '../meshes/services/learning';

const SCHOOLS = 'Schools';
const HIGHER = 'Higher Education';
const CULTURE = 'Culture';
const RESEARCH = 'Research';

const defs: ItemDef[] = [
  // ───────────────────────────── schools
  {
    id: 'kindergarten', name: 'Daycare Nursery', category: 'education', group: SCHOOLS, icon: '🧸', tier: 0,
    footprint: 1, placement: 'surface', cost: 3500, upkeep: 180, height: 0.5, mesh: L.kindergarten,
    description: 'Stacked toy-block classrooms, a sun sign, a tiny slide and a sandpit. Early education and very happy parents nearby.',
    flavor: 'Nap time is enforced by a strict union of four-year-olds.',
    effects: { power: -1, water: -1, jobs: 8, happiness: 1, radius: 3 },
    coverage: [{ service: 'education', radius: 5, strength: 0.5, capacity: 250 }],
    tags: ['school'],
  },
  {
    id: 'elementary_school', name: 'Elementary School', category: 'education', group: SCHOOLS, icon: '🏫', tier: 0,
    footprint: 1, placement: 'surface', cost: 6000, upkeep: 340, styleable: true, height: 0.67, mesh: L.elementarySchool,
    description: 'Two-storey brick school with a clock gable, a bell cupola, a hopscotch yard and its own yellow hover-bus.',
    flavor: 'Teaches reading, writing and the correct orbital velocity of a paper aeroplane.',
    effects: { power: -2, water: -2, jobs: 30, noise: 3 },
    coverage: [{ service: 'education', radius: 7, strength: 0.8, capacity: 700 }],
    tags: ['school'],
  },
  {
    id: 'high_school', name: 'High School', category: 'education', group: SCHOOLS, icon: '🎒', tier: 1,
    footprint: 7, placement: 'surface', cost: 18000, upkeep: 950, styleable: true, height: 0.95, mesh: L.highSchool,
    description: 'Three-storey main hall, barrel-roofed gym and a running track with bleachers. Educates a whole district.',
    flavor: 'Home of the Fighting Comets. Undefeated in zero-g dodgeball since forever.',
    effects: { power: -4, water: -4, jobs: 70, noise: 6 },
    coverage: [{ service: 'education', radius: 10, strength: 0.9, capacity: 1800 }],
    tags: ['school'],
  },

  // ───────────────────────────── higher education
  {
    id: 'university', name: 'University Campus', category: 'education', group: HIGHER, icon: '🎓', tier: 3,
    footprint: 19, placement: 'surface', cost: 90000, upkeep: 4000, height: 2.5, mesh: L.university,
    description: 'A grassy quad framed by gabled halls, a domed library, a clock tower, a science wing and dorm towers. Huge education reach, research and prestige.',
    flavor: 'Four years, three majors, two hundred all-nighters and one very famous clock tower.',
    effects: { power: -12, water: -10, jobs: 380, research: 25, landValue: 8, tourism: 120, radius: 7 },
    coverage: [{ service: 'education', radius: 18, strength: 1, capacity: 6000 }],
    tags: ['school', 'university'],
  },
  {
    id: 'robotics_academy', name: 'Robotics Academy', category: 'education', group: HIGHER, icon: '🦾', tier: 4,
    footprint: 1, placement: 'surface', cost: 42000, upkeep: 1900, height: 0.75, mesh: L.roboticsAcademy,
    description: 'Glass-fronted workshop with a giant robot-arm sculpture and a rover test loop. Compact education plus research.',
    flavor: 'Graduates include 400 engineers and one robot that is still trying to graduate.',
    effects: { power: -6, water: -2, jobs: 60, research: 12, noise: 4 },
    coverage: [{ service: 'education', radius: 10, strength: 0.7, capacity: 1500 }],
    tags: ['school', 'research'],
  },
  {
    id: 'space_academy', name: 'Space Academy', category: 'education', group: HIGHER, icon: '🚀', tier: 5,
    footprint: 7, placement: 'surface', cost: 120000, upkeep: 4800, height: 1.7, mesh: L.spaceAcademy,
    description: 'Training rocket on its gantry, a centrifuge ring, a crater simulation pit and cadets on parade. Wide education reach, research and tourists.',
    flavor: 'First lesson: there is no up. Second lesson: please stop asking where up went.',
    effects: { power: -14, water: -6, jobs: 150, research: 30, tourism: 300, noise: 12, radius: 5 },
    coverage: [{ service: 'education', radius: 16, strength: 0.9, capacity: 4000 }],
    tags: ['school', 'university', 'space'],
  },
  {
    id: 'neural_academy', name: 'Neural Uplink Academy', category: 'education', group: HIGHER, icon: '🧠', tier: 7,
    footprint: 7, placement: 'surface', cost: 420000, upkeep: 14000, height: 2.4, mesh: L.neuralAcademy,
    description: 'Six glowing uplink pods feed a holographic brain. Degrees are downloaded overnight — planet-wide education and a torrent of research.',
    flavor: 'A four-year degree in forty minutes. The student loan still takes forty years.',
    effects: { power: -40, jobs: 80, research: 60, happiness: 2, radius: 6 },
    coverage: [{ service: 'education', radius: 34, strength: 1, capacity: 30000 }],
    tags: ['school', 'sci-fi'],
  },

  // ───────────────────────────── culture
  {
    id: 'library', name: 'Public Library', category: 'education', group: CULTURE, icon: '📚', tier: 1,
    footprint: 1, placement: 'surface', cost: 7000, upkeep: 320, styleable: true, height: 0.72, mesh: L.library,
    description: 'Colonnaded portico, a small dome, a giant stack of books outside and a reading garden. Education, a little research and calm.',
    flavor: 'Silence is golden. The late fees are platinum.',
    effects: { power: -2, water: -1, jobs: 10, research: 2, happiness: 2, landValue: 4, radius: 4 },
    coverage: [{ service: 'education', radius: 8, strength: 0.45, capacity: 1500 }],
    tags: ['culture'],
  },
  {
    id: 'planetarium', name: 'Planetarium', category: 'education', group: CULTURE, icon: '🌌', tier: 2,
    footprint: 1, placement: 'surface', cost: 12000, upkeep: 520, height: 0.62, mesh: L.planetarium,
    description: 'A midnight-blue dome studded with stars, a cyan halo, an orbit sculpture and a telescope on the lawn.',
    flavor: 'Shows you the night sky — the one you’d see if somebody turned off all these city lights.',
    effects: { power: -4, jobs: 12, research: 3, tourism: 180, landValue: 4, radius: 4 },
    coverage: [{ service: 'education', radius: 8, strength: 0.4, capacity: 900 }],
    tags: ['culture', 'space'],
  },
  {
    id: 'museum_old_earth', name: 'Museum of Old Earth', category: 'education', group: CULTURE, icon: '🦖', tier: 3,
    footprint: 7, placement: 'surface', cost: 45000, upkeep: 1600, height: 1.65, mesh: L.museumOldEarth,
    description: 'A grand hall behind glass pyramids, with a blue-green globe, a T-rex skeleton and the last rocket to leave Earth out front. Tourists adore it.',
    flavor: 'Exhibits include: a tree, a cow, rain that falls by accident and something called a “fax machine”.',
    effects: { power: -5, water: -2, jobs: 40, research: 5, tourism: 700, landValue: 8, radius: 6 },
    coverage: [{ service: 'education', radius: 10, strength: 0.35, capacity: 2500 }],
    tags: ['culture', 'museum'],
  },

  // ───────────────────────────── research
  {
    id: 'research_lab', name: 'Research Lab', category: 'education', group: RESEARCH, icon: '🧪', tier: 2,
    footprint: 1, placement: 'surface', cost: 15000, upkeep: 750, height: 0.82, mesh: L.researchLab,
    description: 'White lab block with a glass annex, a bubbling glow tank, fume stacks and a Tesla coil. Generates research points every month.',
    flavor: 'Science happens here. Occasionally loudly.',
    effects: { power: -6, water: -2, jobs: 40, research: 12, pollution: 2, radius: 2 },
    coverage: [{ service: 'research', radius: 10, strength: 0.6 }],
    tags: ['research'],
  },
  {
    id: 'observatory', name: 'Observatory', category: 'education', group: RESEARCH, icon: '🔭', tier: 2,
    footprint: 1, placement: 'surface', cost: 12000, upkeep: 500, height: 0.78, mesh: L.observatory,
    description: 'A white dome with its slit open and the telescope peeking out. Research, stargazing tourists — and best of all on a hilltop.',
    flavor: 'Dark skies wanted. Applicants must be at least 400 light-years from the nearest billboard.',
    effects: { power: -3, jobs: 10, research: 10, tourism: 90, radius: 3 },
    coverage: [{ service: 'research', radius: 10, strength: 0.5 }],
    tags: ['research', 'space'],
  },
  {
    id: 'xenobiology_institute', name: 'Xenobiology Institute', category: 'education', group: RESEARCH, icon: '🦑', tier: 4,
    footprint: 7, placement: 'surface', cost: 70000, upkeep: 2800, height: 1.0, mesh: L.xenobiologyInstitute,
    description: 'Faceted greenhouse domes, an alien garden of glowing flora and a containment tank with a tentacled guest. Big research output and curious visitors.',
    flavor: 'Please do not feed the specimen. Please do not let the specimen feed on you.',
    effects: { power: -10, water: -6, jobs: 90, research: 45, tourism: 150, radius: 4 },
    coverage: [{ service: 'research', radius: 14, strength: 0.8 }],
    tags: ['research', 'sci-fi'],
  },
  {
    id: 'particle_collider', name: 'Particle Collider', category: 'education', group: RESEARCH, icon: '⚛️', tier: 5,
    footprint: 19, placement: 'surface', cost: 320000, upkeep: 11000, height: 1.3, mesh: L.particleCollider,
    description: 'A ring on pylons with glowing beam markers, a giant detector, cooling towers and a control campus. A research powerhouse — with a power bill to match.',
    flavor: 'Smashes tiny things together very hard to find out what tiny things are made of. Spoiler: smaller things.',
    effects: { power: -60, water: -10, jobs: 300, research: 120, noise: 5, radius: 6 },
    coverage: [{ service: 'research', radius: 24, strength: 1 }],
    tags: ['research', 'megaproject'],
  },
  {
    id: 'ai_think_tank', name: 'AI Think Tank', category: 'education', group: RESEARCH, icon: '🤖', tier: 6,
    footprint: 7, placement: 'surface', cost: 260000, upkeep: 9000, height: 1.65, mesh: L.aiThinkTank,
    description: 'Obsidian server monoliths with cyan data veins around a floating core and a holographic mind. The fastest research engine short of a singularity.',
    flavor: 'It thinks, therefore it bills.',
    effects: { power: -35, jobs: 40, research: 160, radius: 4 },
    coverage: [{ service: 'research', radius: 28, strength: 1 }],
    tags: ['research', 'sci-fi'],
  },
];

registerItems(defs);
