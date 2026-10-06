/**
 * Policies (city-wide or per district) and the modifier bag they produce. Each policy changes concrete sim
 * parameters through `Mods`; city policies apply everywhere, district policies stack on top inside the district.
 * Enabled ids live in planet.districts[0].policies (city) and planet.districts[i].policies.
 */
import type { PolicyDef } from './Simulation';

/** Every tunable a policy (or city event) can touch. Multipliers default to 1, additive terms to 0. */
export interface Mods {
  powerUse: number;
  waterUse: number;
  oxygenUse: number;
  garbageGen: number;
  dataUse: number;
  pollution: number;
  noise: number;
  traffic: number;
  crime: number;
  /** additive happiness (points) */
  happiness: number;
  /** additive land value (points) */
  landValue: number;
  education: number;
  research: number;
  tourism: number;
  workforce: number;
  fireSpread: number;
  police: number;
  /** additive transit mode share 0..1 */
  transitShare: number;
  /** cap for R/C growable levels */
  maxLevelRC: number;
  /** buildings never change level (heritage) */
  levelLock: boolean;
  demandR: number;
  demandC: number;
  demandI: number;
  demandO: number;
  taxR: number;
  taxC: number;
  taxI: number;
  taxO: number;
  /** additive health (points) */
  health: number;
  /** direct monthly income per 1 000 citizens (+) */
  incomePer1k: number;
  /** cosmetic happiness added to the reported city figure (satire) */
  reportedHappiness: number;
  /** industry jobs multiplier */
  industryJobs: number;
  /** level-up speed multiplier */
  growthSpeed: number;
}

export function baseMods(): Mods {
  return {
    powerUse: 1, waterUse: 1, oxygenUse: 1, garbageGen: 1, dataUse: 1, pollution: 1, noise: 1, traffic: 1, crime: 1,
    happiness: 0, landValue: 0, education: 1, research: 1, tourism: 1, workforce: 1, fireSpread: 1, police: 1,
    transitShare: 0, maxLevelRC: 5, levelLock: false, demandR: 0, demandC: 0, demandI: 0, demandO: 0,
    taxR: 1, taxC: 1, taxI: 1, taxO: 1, health: 0, incomePer1k: 0, reportedHappiness: 0, industryJobs: 1, growthSpeed: 1,
  };
}

export type ModPatch = Partial<Mods>;

/** Merge a patch into mods: numbers named like multipliers multiply, additive ones add, caps take the min. */
const ADDITIVE = new Set<keyof Mods>(['happiness', 'landValue', 'transitShare', 'demandR', 'demandC', 'demandI', 'demandO', 'health', 'incomePer1k', 'reportedHappiness']);
export function applyPatch(m: Mods, p: ModPatch): void {
  for (const k in p) {
    const key = k as keyof Mods;
    const v = p[key];
    if (v === undefined) continue;
    if (key === 'levelLock') m.levelLock = m.levelLock || (v as boolean);
    else if (key === 'maxLevelRC') m.maxLevelRC = Math.min(m.maxLevelRC, v as number);
    else if (ADDITIVE.has(key)) (m[key] as number) += v as number;
    else (m[key] as number) *= v as number;
  }
}

export interface SimPolicyDef extends PolicyDef {
  /** short effect summary lines for the policies panel */
  effects: string[];
  mods: ModPatch;
  /** satire flag (shown with a wink in the UI) */
  satire?: boolean;
  category: 'economy' | 'society' | 'environment' | 'safety' | 'transport' | 'tech';
  /** Hypernet reactions when enacted */
  cheers?: string[];
}

export const POLICIES: SimPolicyDef[] = [
  {
    id: 'free_transit', name: 'Free Public Transit', icon: '🚌', category: 'transport', scope: 'both', costPer1k: 60, tier: 1,
    description: 'Fares are abolished. Everyone rides, nobody drives, the buses smell faintly of victory.',
    effects: ['+15% transit share', '−12% traffic', '+3 happiness'], mods: { transitShare: 0.15, traffic: 0.88, happiness: 3 },
    cheers: ['FREE BUS. I rode it to nowhere just because I could. 🚌', 'Sold my hovercar. Bought a monocle. Life is good.'],
  },
  {
    id: 'solar_mandate', name: 'Solar Rooftop Mandate', icon: '🔆', category: 'environment', scope: 'both', costPer1k: 8, tier: 1,
    description: 'Every roof gets panels. Buildings draw less from the grid; builders grumble about the paperwork.',
    effects: ['−15% power use', '−2% commercial & industrial tax'], mods: { powerUse: 0.85, taxC: 0.98, taxI: 0.98 },
    cheers: ['My roof now earns more than I do. ☀️'],
  },
  {
    id: 'recycling', name: 'Recycling Program', icon: '♻️', category: 'environment', scope: 'both', costPer1k: 20, tier: 1,
    description: 'Seven bins per household, colour-coded by molecular weight.',
    effects: ['−30% garbage', '−5% pollution'], mods: { garbageGen: 0.7, pollution: 0.95 },
    cheers: ['I sorted my trash into 7 bins and now I feel like a god. ♻️'],
  },
  {
    id: 'highrise_ban', name: 'High-Rise Ban', icon: '🚫', category: 'society', scope: 'both', costPer1k: 0, tier: 2,
    description: 'Nothing taller than a sensible giraffe. Residential & commercial stop at level 3.',
    effects: ['R & C max level 3', '+5 land value'], mods: { maxLevelRC: 3, landValue: 5 },
    cheers: ['Finally I can see the rings from my garden again. 🪐'],
  },
  {
    id: 'heavy_traffic_ban', name: 'Heavy Traffic Ban', icon: '🚛', category: 'transport', scope: 'both', costPer1k: 10, tier: 1,
    description: 'Freight haulers must take the long way round. Quieter streets, grumpier factories.',
    effects: ['−20% noise', '−10% traffic', 'Industry levels up slower'], mods: { noise: 0.8, traffic: 0.9, demandI: -0.04, growthSpeed: 0.92 },
  },
  {
    id: 'smoke_detectors', name: 'Smoke Detector Distribution', icon: '🔥', category: 'safety', scope: 'both', costPer1k: 15, tier: 0,
    description: 'Free detectors for every home. They beep at 3 a.m. for reasons known only to them.',
    effects: ['−50% fire spread'], mods: { fireSpread: 0.5 },
    cheers: ['My smoke detector chirped at 3am. I have never felt so protected. 🔔'],
  },
  {
    id: 'startup_tax_breaks', name: 'Startup Tax Breaks', icon: '🚀', category: 'economy', scope: 'city', costPer1k: 0, tier: 2,
    description: 'Disrupt everything! Office and tech demand soar, office tax income dips.',
    effects: ['+0.15 office demand', '+0.08 industry demand', '−30% office tax'], mods: { demandO: 0.15, demandI: 0.08, taxO: 0.7 },
    cheers: ['Launched my startup today. It is an app that launches other startups. 🚀'],
  },
  {
    id: 'ubi', name: 'Universal Basic Income', icon: '💳', category: 'society', scope: 'city', costPer1k: 180, tier: 3,
    description: 'A monthly stipend for every citizen. Crime drops, joy rises, a few people take up the oboe.',
    effects: ['+8 happiness', '−15% crime', '−8% workforce'], mods: { happiness: 8, crime: 0.85, workforce: 0.92, demandR: 0.08 },
    cheers: ['UBI hit my account. Bought a hover-scooter and an oboe. No regrets. 🎶'],
  },
  {
    id: 'night_curfew', name: 'Night Curfew', icon: '🌙', category: 'safety', scope: 'both', costPer1k: 5, tier: 1,
    description: 'Everyone indoors by 22:00. Crime naps, so does nightlife.',
    effects: ['−25% crime', '−5 happiness', '−30% tourism'], mods: { crime: 0.75, happiness: -5, tourism: 0.7 },
    cheers: ['Curfew means I finally have an excuse to go to bed early. 😴'],
  },
  {
    id: 'zero_g_sports', name: 'Zero-G Sports League', icon: '🏐', category: 'society', scope: 'city', costPer1k: 30, tier: 2,
    description: 'Three-dimensional football. The ball never comes down and neither does morale.',
    effects: ['+4 happiness', '+15% tourism'], mods: { happiness: 4, tourism: 1.15 },
    cheers: ['Zero-G league opener! The goalie is still floating somewhere over the bay. 🏐'],
  },
  {
    id: 'neural_education', name: 'Neural Education Implants', icon: '🧠', category: 'tech', scope: 'both', costPer1k: 90, tier: 4,
    description: 'Learn calculus while you sleep. Side effects include dreaming in spreadsheets.',
    effects: ['×2 education gain', '+25% research', '−3 health'], mods: { education: 2, research: 1.25, health: -3 },
    cheers: ['Woke up fluent in 4 languages and quantum chromodynamics. Still can\'t parallel park. 🧠'],
  },
  {
    id: 'robot_police', name: 'Robot Police Force', icon: '🤖', category: 'safety', scope: 'both', costPer1k: 50, tier: 3,
    description: 'Tireless, incorruptible, slightly too polite. "HAVE A NICE DAY, CITIZEN."',
    effects: ['+30% police effect', '−15% crime', '−2 happiness'], mods: { police: 1.3, crime: 0.85, happiness: -2 },
    cheers: ['A robot cop wished me a NICE DAY with alarming intensity. 🤖'],
  },
  {
    id: 'tourism_promotion', name: 'Interstellar Tourism Campaign', icon: '📸', category: 'economy', scope: 'city', costPer1k: 40, tier: 2,
    description: 'Holo-ads in every spaceport from here to Andromeda.',
    effects: ['+40% tourism', '+0.05 commercial demand'], mods: { tourism: 1.4, demandC: 0.05 },
    cheers: ['Saw our city on a billboard three star systems away. We look AMAZING. 📸'],
  },
  {
    id: 'green_spaces', name: 'Green Spaces Act', icon: '🌳', category: 'environment', scope: 'both', costPer1k: 20, tier: 1,
    description: 'Every block gets a pocket park. Industry finds it all a bit much.',
    effects: ['−15% pollution', '+4 land value', '−0.1 industry demand'], mods: { pollution: 0.85, landValue: 4, demandI: -0.1, happiness: 2 },
    cheers: ['There is a tiny park outside my office now. A squirrel judged me. 🐿️'],
  },
  {
    id: 'pet_friendly', name: 'Pet-Friendly City', icon: '🐾', category: 'society', scope: 'both', costPer1k: 5, tier: 0,
    description: 'Pets welcome everywhere — including the six-legged ones.',
    effects: ['+3 happiness', '+5% garbage'], mods: { happiness: 3, garbageGen: 1.05 },
    cheers: ['Took my six-legged dog to the café. She ordered first. 🐕'],
  },
  {
    id: 'clone_labour', name: 'Clone Labour Program', icon: '🧬', category: 'economy', scope: 'city', costPer1k: -30, tier: 4, satire: true,
    description: 'Why hire one Dave when you can print twelve? Fills jobs instantly; the Daves are unsettled.',
    effects: ['+25% workforce', '+₡30 per 1k citizens', '−6 happiness', '+5% crime'], mods: { workforce: 1.25, happiness: -6, crime: 1.05, demandI: 0.1 },
    cheers: ['Met myself at work today. He took my parking spot. 🧬', 'Which one of us is the original? Asking for a Dave.'],
  },
  {
    id: 'mandatory_joy', name: 'Mandatory Joy Act', icon: '😁', category: 'society', scope: 'city', costPer1k: 2, tier: 2, satire: true,
    description: 'Smiles are now compulsory. Happiness reports look fantastic. Reality is… less committed.',
    effects: ['+15 reported happiness 😁', '+10% crime', '−10% tourism'], mods: { reportedHappiness: 15, crime: 1.1, tourism: 0.9 },
    cheers: ['I AM SO HAPPY. Please send help. 😁', 'Got fined for a neutral facial expression. 😐→😁'],
  },
  {
    id: 'water_conservation', name: 'Water Conservation', icon: '🚿', category: 'environment', scope: 'both', costPer1k: 10, tier: 0,
    description: 'Shorter showers, low-flow everything, sad little fountains.',
    effects: ['−20% water use', '−1 happiness'], mods: { waterUse: 0.8, happiness: -1 },
  },
  {
    id: 'smart_homes', name: 'Smart Homes Initiative', icon: '🏠', category: 'tech', scope: 'both', costPer1k: 25, tier: 3,
    description: 'Homes that dim their own lights and order their own groceries.',
    effects: ['−10% power use', '+5 land value', '+20% data use'], mods: { powerUse: 0.9, landValue: 5, dataUse: 1.2 },
    cheers: ['My fridge ordered kale without asking. We are no longer speaking. 🥬'],
  },
  {
    id: 'automation', name: 'Automation Incentives', icon: '🦾', category: 'economy', scope: 'city', costPer1k: 0, tier: 3,
    description: 'Robots on the factory floor. Fewer jobs, more output, a lot of philosophical debates.',
    effects: ['−20% industry jobs', '+20% industrial tax'], mods: { industryJobs: 0.8, taxI: 1.2, happiness: -1 },
  },
  {
    id: 'tax_haven', name: 'Orbital Tax Haven', icon: '🏝️', category: 'economy', scope: 'city', costPer1k: 0, tier: 4, satire: true,
    description: 'The moon now hosts 40 million PO boxes. Office demand booms; nobody asks questions.',
    effects: ['+0.2 office demand', '+15% office tax', '−2 happiness'], mods: { demandO: 0.2, taxO: 1.15, happiness: -2 },
    cheers: ['Registered my sandwich shop on the moon. It is now worth ₡4 billion. 🥪'],
  },
  {
    id: 'free_hypernet', name: 'Free Hypernet Everywhere', icon: '📶', category: 'tech', scope: 'both', costPer1k: 25, tier: 2,
    description: 'Gigabit in every park bench. Citizens learn faster and argue online more.',
    effects: ['+3 happiness', '+10% education gain', '+30% data use'], mods: { happiness: 3, education: 1.1, dataUse: 1.3 },
  },
  {
    id: 'heritage', name: 'Heritage Preservation', icon: '🏛️', category: 'society', scope: 'district', costPer1k: 8, tier: 2,
    description: 'Old town charm, frozen in time. Buildings stop changing level; tourists love it.',
    effects: ['Buildings keep their level', '+8 land value', '+10% tourism'], mods: { levelLock: true, landValue: 8, tourism: 1.1 },
  },
  {
    id: 'smog_tax', name: 'Smog Tax', icon: '🏭', category: 'environment', scope: 'city', costPer1k: -10, tier: 2,
    description: 'Polluters pay. Factories clean up — or leave.',
    effects: ['−30% industrial pollution', '−0.15 industry demand', '+₡10 per 1k citizens'], mods: { pollution: 0.7, demandI: -0.15 },
  },
  {
    id: 'ai_comayor', name: 'AI Co-Mayor', icon: '🖥️', category: 'tech', scope: 'city', costPer1k: 30, tier: 5, satire: true,
    description: 'Optimises everything. Keeps asking whether you are *sure*.',
    effects: ['+10% service effect', '+5% research', '−1 happiness'], mods: { police: 1.1, research: 1.05, education: 1.05, happiness: -1 },
    cheers: ['The AI co-mayor scheduled my birthday for maximum efficiency. It was 11 minutes long. 🎂'],
  },
  {
    id: 'lottery', name: 'Galactic Lottery', icon: '🎰', category: 'economy', scope: 'city', costPer1k: -25, tier: 1,
    description: 'A tax on optimism. Pays for itself, and then some.',
    effects: ['+₡25 per 1k citizens', '+3% crime', '+1 happiness'], mods: { crime: 1.03, happiness: 1 },
    cheers: ['Bought 40 lottery tickets. Won a coupon for 1 lottery ticket. 🎰'],
  },
  {
    id: 'car_free', name: 'Car-Free Downtown', icon: '🚲', category: 'transport', scope: 'district', costPer1k: 12, tier: 2,
    description: 'Bikes, scooters and jetpacks only. Shops miss the drive-through crowd.',
    effects: ['−40% traffic', '−30% noise', '−0.05 commercial demand'], mods: { traffic: 0.6, noise: 0.7, demandC: -0.05, landValue: 3 },
  },
  {
    id: 'nap_pods', name: 'Nap Pods at Work', icon: '😴', category: 'society', scope: 'both', costPer1k: 12, tier: 2,
    description: 'Mandatory 20-minute naps. Productivity is up, mysteriously.',
    effects: ['+2 happiness', '+0.05 office demand'], mods: { happiness: 2, demandO: 0.05 },
  },
  {
    id: 'clean_air', name: 'Atmospheric Scrubbers', icon: '🌬️', category: 'environment', scope: 'city', costPer1k: 35, tier: 3,
    description: 'Giant fans on every rooftop scrub the sky. Oxygen goes further, too.',
    effects: ['−20% pollution', '−15% oxygen use', '+2 health'], mods: { pollution: 0.8, oxygenUse: 0.85, health: 2 },
  },
];

export const POLICY_MAP = new Map(POLICIES.map((p) => [p.id, p]));

/** Direct income per 1k citizens from policies with negative costPer1k (handled in economy). */
export function policyIncomePer1k(p: SimPolicyDef): number {
  return p.costPer1k < 0 ? -p.costPer1k : 0;
}

/** Build a Mods bag from a list of enabled policy ids. */
export function modsFor(ids: readonly string[], into?: Mods): Mods {
  const m = into ?? baseMods();
  for (const id of ids) {
    const p = POLICY_MAP.get(id);
    if (p) applyPatch(m, p.mods);
  }
  return m;
}
