/**
 * OWNER: agent services
 * Police & justice, fire & rescue, health, deathcare, faith and civil defence ploppables.
 *
 * Coverage services used: police · fire · health · deathcare · spiritual. Capacity is "people served" — the sim
 * multiplies residents in range by a per-service demand factor (police/fire 1, health 0.08, deathcare 0.01,
 * spiritual 0.12), so a 250-bed clinic comfortably serves ~3 000 residents. Special tags: "shelter" (disaster
 * shelters cut casualties, see sim/hazards) and "weather" (weather control). Meshes: content/meshes/services/.
 * Styleable civic buildings re-skin with the district style.
 */
import { registerItems, type ItemDef } from '../catalog';
import * as S from '../meshes/services/safety';
import * as H from '../meshes/services/health';

const POLICE = 'Police & Justice';
const FIRE = 'Fire & Rescue';
const HEALTH = 'Health';
const DEATH = 'Deathcare';
const FAITH = 'Faith';
const DEFENCE = 'Civil Defence';

const defs: ItemDef[] = [
  // ───────────────────────────── police & justice
  {
    id: 'police_post', name: 'Police Post', category: 'services', group: POLICE, icon: '🚓', tier: 0,
    footprint: 1, placement: 'surface', cost: 4500, upkeep: 260, styleable: true, height: 0.82, mesh: S.policePost,
    description: 'A neighbourhood station with a blue lamp, two patrol cruisers and an officer who knows everyone by name. Cuts crime nearby.',
    flavor: 'Open 24/7. The coffee is older than some of the officers.',
    effects: { power: -2, water: -1, jobs: 14, noise: 4 },
    coverage: [{ service: 'police', radius: 6, strength: 0.75, capacity: 3000 }],
    tags: ['police', 'safety'],
  },
  {
    id: 'police_hq', name: 'Police Headquarters', category: 'services', group: POLICE, icon: '🚔', tier: 2,
    footprint: 7, placement: 'surface', cost: 26000, upkeep: 1300, styleable: true, height: 1.62, mesh: S.policeHQ,
    description: 'Precinct HQ with a rooftop helipad, a car park full of cruisers and a detective squad for the big cases. Wide, strong police coverage.',
    flavor: 'Eight floors of paperwork with a helipad on top for dramatic exits.',
    effects: { power: -6, water: -3, jobs: 90, noise: 8 },
    coverage: [{ service: 'police', radius: 13, strength: 1, capacity: 18000 }],
    tags: ['police', 'safety'],
  },
  {
    id: 'drone_hub', name: 'Security Drone Hub', category: 'services', group: POLICE, icon: '🛸', tier: 4,
    footprint: 1, placement: 'surface', cost: 38000, upkeep: 1700, height: 1.5, mesh: S.droneHub,
    description: 'A graphite tower that launches swarms of patrol drones. Huge police reach from a single tile — ideal for dense downtowns.',
    flavor: 'A thousand tiny eyes, all of them very polite about it.',
    effects: { power: -8, jobs: 18, noise: 6 },
    coverage: [{ service: 'police', radius: 16, strength: 0.85, capacity: 22000 }],
    tags: ['police', 'safety', 'drones'],
  },
  {
    id: 'prison', name: 'Penitentiary', category: 'services', group: POLICE, icon: '⛓️', tier: 2,
    footprint: 7, placement: 'surface', cost: 20000, upkeep: 1000, height: 1.12, mesh: S.prison,
    description: 'High walls, six guard towers and cell blocks for the city’s worst. Takes the pressure off police across a wide area, but nobody wants to live next door.',
    flavor: 'Six walls, six towers and a surprisingly competitive basketball league.',
    effects: { power: -5, water: -4, jobs: 70, landValue: -12, happiness: -2, noise: 4, radius: 5 },
    coverage: [{ service: 'police', radius: 10, strength: 0.45, capacity: 40000 }],
    tags: ['police', 'jail'],
  },
  {
    id: 'courthouse', name: 'Hall of Justice', category: 'services', group: POLICE, icon: '⚖️', tier: 3,
    footprint: 7, placement: 'surface', cost: 32000, upkeep: 1400, height: 1.52, mesh: S.courthouse,
    description: 'A marble courthouse with a copper dome and a statue of blind Justice. Speeds up trials, lowers crime and lifts the neighbourhood.',
    flavor: 'Justice is blind. The architect, fortunately, was not.',
    effects: { power: -4, water: -2, jobs: 60, landValue: 6, tourism: 80, radius: 6 },
    coverage: [{ service: 'police', radius: 11, strength: 0.55, capacity: 20000 }],
    tags: ['police', 'justice', 'civic'],
  },
  {
    id: 'precog_precinct', name: 'Pre-Crime Precinct', category: 'services', group: POLICE, icon: '👁️', tier: 7,
    footprint: 1, placement: 'surface', cost: 380000, upkeep: 12000, height: 1.25, mesh: S.precogPrecinct,
    description: 'Three dreaming precogs float in a milky pool beneath an all-seeing eye. Planet-scale police coverage from one obsidian block.',
    flavor: 'Arrests you for crimes you were about to commit. Also for jaywalking you were about to think about.',
    effects: { power: -20, jobs: 30, research: 10, happiness: -1, radius: 4 },
    coverage: [{ service: 'police', radius: 36, strength: 1, capacity: 150000 }],
    tags: ['police', 'safety', 'sci-fi'],
  },

  // ───────────────────────────── fire & rescue
  {
    id: 'fire_station', name: 'Fire Station', category: 'services', group: FIRE, icon: '🚒', tier: 0,
    footprint: 1, placement: 'surface', cost: 5000, upkeep: 300, styleable: true, height: 1.07, mesh: S.fireStation,
    description: 'Red-brick double garage with a hose-drying tower and an engine ready on the apron. Fires in range are put out fast and spread less.',
    flavor: 'The pole is mandatory. The dalmatian is a hologram.',
    effects: { power: -2, water: -3, jobs: 16, noise: 6 },
    coverage: [{ service: 'fire', radius: 7, strength: 0.8, capacity: 4000 }],
    tags: ['fire', 'safety'],
  },
  {
    id: 'fire_hq', name: 'Fire Headquarters', category: 'services', group: FIRE, icon: '🧑‍🚒', tier: 2,
    footprint: 7, placement: 'surface', cost: 28000, upkeep: 1400, styleable: true, height: 1.5, mesh: S.fireHQ,
    description: 'Four engine bays, a training tower, a drill yard and a water-bomber on the helipad. Covers a whole district.',
    flavor: 'Where firefighters train by setting the same small house on fire every Tuesday.',
    effects: { power: -6, water: -8, jobs: 110, noise: 10 },
    coverage: [{ service: 'fire', radius: 13, strength: 1, capacity: 20000 }],
    tags: ['fire', 'safety'],
  },
  {
    id: 'emergency_centre', name: 'Emergency Response Centre', category: 'services', group: FIRE, icon: '🚨', tier: 4,
    footprint: 7, placement: 'surface', cost: 60000, upkeep: 2800, height: 1.4, mesh: S.emergencyCentre,
    description: 'A glass rotunda under a holographic city map dispatching fire, ambulance and police from three wings. Covers fire, health and police at once.',
    flavor: 'One number, three sirens, zero hold music.',
    effects: { power: -10, water: -6, jobs: 160, noise: 10 },
    coverage: [
      { service: 'fire', radius: 14, strength: 0.8, capacity: 25000 },
      { service: 'health', radius: 12, strength: 0.6, capacity: 1200 },
      { service: 'police', radius: 10, strength: 0.4, capacity: 10000 },
    ],
    tags: ['fire', 'health', 'police', 'safety'],
  },
  {
    id: 'fire_drone_tower', name: 'Fire Drone Tower', category: 'services', group: FIRE, icon: '🧯', tier: 3,
    footprint: 1, placement: 'surface', cost: 18000, upkeep: 900, height: 1.55, mesh: S.fireDroneTower,
    description: 'A red water-globe on a slender mast, ringed by docked firefighting drones that reach blazes long before a truck could.',
    flavor: 'A water balloon the size of a house, guarded by a swarm of very brave drones.',
    effects: { power: -5, water: -6, jobs: 10, noise: 4 },
    coverage: [{ service: 'fire', radius: 12, strength: 0.7, capacity: 12000 }],
    tags: ['fire', 'safety', 'drones'],
  },
  {
    id: 'coast_guard', name: 'Coast Guard Station', category: 'services', group: FIRE, icon: '⚓', tier: 2,
    footprint: 1, placement: 'surface', cost: 9000, upkeep: 450, height: 1.15, mesh: S.coastGuard, requires: { coastal: true },
    description: 'Candy-striped lighthouse, boathouse and an orange rescue cutter. Fire and rescue for the waterfront, plus a lighthouse the tourists adore.',
    flavor: 'The lighthouse keeper is an AI. It still insists on a little hat.',
    effects: { power: -2, jobs: 14, tourism: 30, landValue: 3, radius: 4 },
    coverage: [
      { service: 'fire', radius: 9, strength: 0.6, capacity: 6000 },
      { service: 'police', radius: 6, strength: 0.3, capacity: 3000 },
    ],
    tags: ['fire', 'safety', 'coastal'],
  },

  // ───────────────────────────── health
  {
    id: 'clinic', name: 'Medical Clinic', category: 'services', group: HEALTH, icon: '🩺', tier: 0,
    footprint: 1, placement: 'surface', cost: 5500, upkeep: 300, styleable: true, height: 0.72, mesh: H.clinic,
    description: 'A bright neighbourhood clinic with a glowing pharmacy cross and its own ambulance. Keeps the locals healthy.',
    flavor: 'Walk-ins welcome. Hover-ins by appointment.',
    effects: { power: -2, water: -2, jobs: 18 },
    coverage: [{ service: 'health', radius: 6, strength: 0.7, capacity: 250 }],
    tags: ['health'],
  },
  {
    id: 'hospital', name: 'General Hospital', category: 'services', group: HEALTH, icon: '🏥', tier: 2,
    footprint: 7, placement: 'surface', cost: 36000, upkeep: 1800, styleable: true, height: 1.85, mesh: H.hospital,
    description: 'Ward tower with a rooftop helipad, emergency room, twin wings and a healing garden. Large health coverage.',
    flavor: 'The food is still terrible. Some traditions survive interstellar travel.',
    effects: { power: -8, water: -8, jobs: 220, noise: 6 },
    coverage: [{ service: 'health', radius: 13, strength: 1, capacity: 1600 }],
    tags: ['health'],
  },
  {
    id: 'medical_centre', name: 'Medical Research Centre', category: 'services', group: HEALTH, icon: '🧬', tier: 4,
    footprint: 7, placement: 'surface', cost: 80000, upkeep: 3600, height: 2.42, mesh: H.medicalCentre,
    description: 'Twin glass rotundas joined by a skybridge, a glowing DNA sculpture and labs that turn patients’ problems into papers. Big health coverage plus research.',
    flavor: 'Where they cure things you didn’t know you had, then name them after a donor.',
    effects: { power: -12, water: -10, jobs: 320, research: 15, landValue: 5, radius: 5 },
    coverage: [{ service: 'health', radius: 16, strength: 1, capacity: 4000 }],
    tags: ['health', 'research'],
  },
  {
    id: 'cryo_clinic', name: 'Cryo-Care Longevity Clinic', category: 'services', group: HEALTH, icon: '❄️', tier: 6,
    footprint: 1, placement: 'surface', cost: 120000, upkeep: 5200, height: 0.9, mesh: H.cryoClinic,
    description: 'A frosted capsule ringed by glowing cryo pods. Life-extension treatments raise health and happiness across a wide area.',
    flavor: 'Patients are frozen until medicine catches up. Results may vary by century.',
    effects: { power: -18, jobs: 40, research: 8, happiness: 4, landValue: 6, radius: 6 },
    coverage: [{ service: 'health', radius: 14, strength: 0.9, capacity: 3000 }],
    tags: ['health', 'sci-fi'],
  },
  {
    id: 'chrono_clinic', name: 'Chrono-Clinic', category: 'services', group: HEALTH, icon: '⏳', tier: 8,
    footprint: 1, placement: 'surface', cost: 900000, upkeep: 30000, height: 1.25, mesh: H.chronoClinic,
    description: 'An hourglass of living light inside gyroscopic clock rings. Treats illnesses before they happen — planet-wide health coverage.',
    flavor: 'Heals you yesterday so you never got sick today. The paperwork arrives last week.',
    effects: { power: -60, jobs: 50, research: 30, happiness: 6, radius: 8 },
    coverage: [{ service: 'health', radius: 40, strength: 1, capacity: 40000 }],
    tags: ['health', 'sci-fi'],
  },

  // ───────────────────────────── deathcare
  {
    id: 'memorial_garden', name: 'Memorial Garden', category: 'services', group: DEATH, icon: '🕯️', tier: 1,
    footprint: 7, placement: 'surface', cost: 9000, upkeep: 380, height: 1.25, mesh: H.memorialGarden,
    description: 'A reflecting pool between cypress avenues, lantern-lit rows of stones and a tiny chapel. Deathcare with dignity — and a lovely walk.',
    flavor: 'A quiet place to remember. The lanterns never go out.',
    effects: { jobs: 6, happiness: 2, landValue: 3, radius: 4 },
    coverage: [
      { service: 'deathcare', radius: 12, strength: 0.9, capacity: 150 },
      { service: 'spiritual', radius: 6, strength: 0.35, capacity: 1500 },
    ],
    tags: ['deathcare', 'park'],
  },
  {
    id: 'crematorium', name: 'Stardust Crematorium', category: 'services', group: DEATH, icon: '🚀', tier: 2,
    footprint: 1, placement: 'surface', cost: 14000, upkeep: 700, height: 1.05, mesh: H.crematorium,
    description: 'A lilac chapel of rest beside a launch rail. Ashes ride a tiny rocket to a gentle orbit. Compact, high-capacity deathcare.',
    flavor: 'Ashes to ashes, dust to stardust. One-way ticket, window seat.',
    effects: { power: -4, jobs: 12, pollution: 4, radius: 3 },
    coverage: [{ service: 'deathcare', radius: 16, strength: 0.9, capacity: 400 }],
    tags: ['deathcare'],
  },
  {
    id: 'ascension_spire', name: 'Ascension Spire', category: 'services', group: DEATH, icon: '✨', tier: 5,
    footprint: 7, placement: 'surface', cost: 140000, upkeep: 5000, height: 5.75, mesh: H.ascensionSpire,
    description: 'A pearl needle with glowing seams, a floating halo and a beam of light into the sky. Minds are uploaded rather than buried: city-wide deathcare and comfort.',
    flavor: 'The departed are uploaded to the cloud. The actual cloud, in orbit. Visiting hours: eternal.',
    effects: { power: -15, jobs: 40, tourism: 400, landValue: 6, happiness: 3, radius: 7 },
    coverage: [
      { service: 'deathcare', radius: 30, strength: 1, capacity: 2000 },
      { service: 'spiritual', radius: 14, strength: 0.7, capacity: 12000 },
    ],
    tags: ['deathcare', 'spiritual', 'sci-fi'],
  },

  // ───────────────────────────── faith
  {
    id: 'chapel', name: 'Interfaith Chapel', category: 'services', group: FAITH, icon: '⛪', tier: 1,
    footprint: 1, placement: 'surface', cost: 6000, upkeep: 250, height: 0.96, mesh: H.chapel,
    description: 'Stone nave, bell tower and a rose window that glows at night. Spiritual comfort for the neighbourhood.',
    flavor: 'All faiths welcome. The bell rings in seventeen time zones.',
    effects: { jobs: 4, happiness: 2, landValue: 2, radius: 4 },
    coverage: [{ service: 'spiritual', radius: 8, strength: 0.7, capacity: 1500 }],
    tags: ['spiritual'],
  },
  {
    id: 'temple_stars', name: 'Temple of the Stars', category: 'services', group: FAITH, icon: '🛕', tier: 4,
    footprint: 7, placement: 'surface', cost: 55000, upkeep: 1800, height: 1.66, mesh: H.templeOfStars,
    description: 'Sandstone terraces, braziers and a golden orrery shrine at the summit. Wide spiritual coverage and a pilgrimage for tourists.',
    flavor: 'Built to the stars, aligned with the stars, mildly insistent that you look at the stars.',
    effects: { jobs: 20, tourism: 450, happiness: 4, landValue: 8, radius: 6 },
    coverage: [{ service: 'spiritual', radius: 16, strength: 1, capacity: 9000 }],
    tags: ['spiritual', 'landmark-lite'],
  },

  // ───────────────────────────── civil defence
  {
    id: 'disaster_shelter', name: 'Disaster Shelter', category: 'services', group: DEFENCE, icon: '🛡️', tier: 1,
    footprint: 1, placement: 'surface', cost: 7000, upkeep: 220, height: 0.72, mesh: S.disasterShelter,
    description: 'A grass-roofed bunker with a round blast door and a siren mast. Residents within ~8 tiles take cover when disaster strikes — far fewer casualties.',
    flavor: 'Blast-proof, quake-proof, tsunami-proof. Not, alas, small-talk-proof.',
    effects: { power: -1, jobs: 3 },
    tags: ['shelter', 'safety'],
  },
  {
    id: 'weather_station', name: 'Weather Control Station', category: 'services', group: DEFENCE, icon: '🌦️', tier: 5,
    footprint: 7, placement: 'surface', cost: 160000, upkeep: 5600, height: 3.6, mesh: S.weatherStation,
    description: 'Radar globe, ionizer ring and cloud-seeding cannons. Damps wildfires with on-demand rain and keeps the sky on schedule.',
    flavor: 'Rain is now booked in advance, like a dentist. It even has a pet cloud.',
    effects: { power: -30, jobs: 45, research: 10, happiness: 3, radius: 10 },
    coverage: [{ service: 'fire', radius: 20, strength: 0.4, capacity: 40000 }],
    tags: ['weather', 'safety', 'sci-fi'],
  },
];

registerItems(defs);
