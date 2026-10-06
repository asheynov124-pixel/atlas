/**
 * OWNER: cosmos.
 * Research tech tree — 30 technologies in five branches, bought with empire research points.
 *
 * Effect keys:
 *   SIM keys (multipliers unless noted, names match sim/policies Mods so the sim can merge `techMods()` directly):
 *     powerUse waterUse oxygenUse garbageGen dataUse pollution noise traffic crime education tourism fireSpread
 *     growthSpeed serviceEffect industryJobs · additive: happiness landValue health incomePer1k demandR/C/I/O
 *   TOOLS/SIM keys: constructionCost, upkeep (multipliers), coverageRadius (multiplier on service radii)
 *   COSMOS keys (applied by Progression itself, every month / on travel):
 *     researchDividend (+x of monthly research) · taxDividend (+x of monthly revenue) · upkeepRebate (x of monthly
 *     expenses refunded) · tourismIncome (₡ per monthly tourist) · tradeIncome (₡ per colony per month) ·
 *     colonyCost (multiplier) · warpSpeed (multiplier) · goalRewards (multiplier)
 */
import type { ItemDef } from '../content/catalog';

export type TechBranch = 'infra' | 'society' | 'economy' | 'space' | 'exotic';

export interface TechEffect {
  key: string;
  value: number;
}

export interface TechDef {
  id: string;
  name: string;
  branch: TechBranch;
  icon: string;
  /** research points */
  cost: number;
  /** minimum career tier */
  tier: number;
  requires: string[];
  description: string;
  flavor: string;
  effects: TechEffect[];
  /** items this tech unlocks early (predicate over the catalog) */
  unlocks?: { label: string; test: (d: ItemDef, tier: number) => boolean };
}

/** Keys that add instead of multiply. */
export const ADDITIVE_KEYS = new Set(['happiness', 'landValue', 'health', 'incomePer1k', 'demandR', 'demandC', 'demandI', 'demandO', 'researchDividend', 'taxDividend', 'upkeepRebate', 'tourismIncome', 'tradeIncome']);

/** Keys the sim understands (see sim/policies Mods). */
export const SIM_KEYS = ['powerUse', 'waterUse', 'oxygenUse', 'garbageGen', 'dataUse', 'pollution', 'noise', 'traffic', 'crime', 'education', 'tourism', 'fireSpread', 'growthSpeed', 'serviceEffect', 'industryJobs', 'happiness', 'landValue', 'health', 'incomePer1k', 'demandR', 'demandC', 'demandI', 'demandO'] as const;

export const BRANCHES: { id: TechBranch; name: string; icon: string; color: string; blurb: string }[] = [
  { id: 'infra', name: 'Infrastructure', icon: 'power', color: '#5ef0ff', blurb: 'Grids, pipes and the boring miracles that keep cities alive.' },
  { id: 'society', name: 'Society', icon: 'population', color: '#5ef2a0', blurb: 'Healthier, smarter, happier citizens (results may vary).' },
  { id: 'economy', name: 'Economy', icon: 'money', color: '#ffd977', blurb: 'Make money while you sleep. Or while they sleep.' },
  { id: 'space', name: 'Space', icon: 'rocket', color: '#a77bff', blurb: 'Rockets, gates and the art of not falling back down.' },
  { id: 'exotic', name: 'Exotic', icon: 'sparkles', color: '#ff7ad9', blurb: 'Physics that would make your old professors weep.' },
];

const has = (d: ItemDef, re: RegExp) => re.test(`${d.id} ${d.name} ${d.group ?? ''} ${(d.tags ?? []).join(' ')}`);

/** Human labels for effect keys (UI chips). */
export const EFFECT_LABELS: Record<string, { label: string; icon: string; good: 'lower' | 'higher'; pct: boolean }> = {
  powerUse: { label: 'power use', icon: 'power', good: 'lower', pct: true },
  waterUse: { label: 'water use', icon: 'water', good: 'lower', pct: true },
  oxygenUse: { label: 'oxygen use', icon: 'oxygen', good: 'lower', pct: true },
  garbageGen: { label: 'garbage', icon: 'garbage', good: 'lower', pct: true },
  dataUse: { label: 'data use', icon: 'data', good: 'lower', pct: true },
  pollution: { label: 'pollution', icon: 'pollution', good: 'lower', pct: true },
  noise: { label: 'noise', icon: 'noise', good: 'lower', pct: true },
  traffic: { label: 'traffic', icon: 'traffic', good: 'lower', pct: true },
  crime: { label: 'crime', icon: 'crime', good: 'lower', pct: true },
  education: { label: 'education', icon: 'education', good: 'higher', pct: true },
  tourism: { label: 'tourism', icon: 'tourism', good: 'higher', pct: true },
  fireSpread: { label: 'fire spread', icon: 'fire', good: 'lower', pct: true },
  growthSpeed: { label: 'growth speed', icon: 'trendUp', good: 'higher', pct: true },
  serviceEffect: { label: 'service strength', icon: 'services', good: 'higher', pct: true },
  industryJobs: { label: 'industry jobs', icon: 'factory', good: 'higher', pct: true },
  happiness: { label: 'happiness', icon: 'smile', good: 'higher', pct: false },
  landValue: { label: 'land value', icon: 'landValue', good: 'higher', pct: false },
  health: { label: 'health', icon: 'health', good: 'higher', pct: false },
  incomePer1k: { label: '₡ per 1k citizens', icon: 'income', good: 'higher', pct: false },
  demandR: { label: 'housing demand', icon: 'housing', good: 'higher', pct: false },
  demandC: { label: 'shop demand', icon: 'shop', good: 'higher', pct: false },
  demandI: { label: 'industry demand', icon: 'factory', good: 'higher', pct: false },
  demandO: { label: 'office demand', icon: 'office', good: 'higher', pct: false },
  constructionCost: { label: 'build cost', icon: 'build', good: 'lower', pct: true },
  upkeep: { label: 'upkeep', icon: 'budget', good: 'lower', pct: true },
  coverageRadius: { label: 'service radius', icon: 'target', good: 'higher', pct: true },
  researchDividend: { label: 'research', icon: 'research', good: 'higher', pct: true },
  taxDividend: { label: 'tax revenue', icon: 'income', good: 'higher', pct: true },
  upkeepRebate: { label: 'upkeep refunded', icon: 'budget', good: 'higher', pct: true },
  tourismIncome: { label: '₡ per tourist', icon: 'tourism', good: 'higher', pct: false },
  tradeIncome: { label: '₡ per colony / mo', icon: 'globe', good: 'higher', pct: false },
  colonyCost: { label: 'colony charter cost', icon: 'rocket', good: 'lower', pct: true },
  warpSpeed: { label: 'warp speed', icon: 'warp', good: 'higher', pct: true },
  goalRewards: { label: 'goal rewards', icon: 'trophy', good: 'higher', pct: true },
};

export const TECHS: TechDef[] = [
  // ── infrastructure ──────────────────────────────────────────────────
  { id: 'smart_grid', name: 'Smart Grids', branch: 'infra', icon: 'power', cost: 40, tier: 1, requires: [], description: 'AI-balanced power lines that stop wasting electrons on empty rooms.', flavor: 'Your toaster now negotiates its own energy tariff.', effects: [{ key: 'powerUse', value: 0.9 }, { key: 'upkeepRebate', value: 0.02 }] },
  { id: 'closed_water', name: 'Closed-Loop Water', branch: 'infra', icon: 'water', cost: 60, tier: 1, requires: [], description: 'Every drop recycled, filtered and lovingly returned.', flavor: 'Yes, it was somebody else’s shower. It’s fine.', effects: [{ key: 'waterUse', value: 0.88 }, { key: 'garbageGen', value: 0.95 }] },
  { id: 'eco_arcology', name: 'Arcology Ecology', branch: 'infra', icon: 'tree', cost: 110, tier: 2, requires: ['closed_water'], description: 'Green roofs, vertical forests and filters that actually filter.', flavor: 'The pigeons have formed a residents’ association.', effects: [{ key: 'pollution', value: 0.85 }, { key: 'noise', value: 0.85 }, { key: 'landValue', value: 2 }] },
  { id: 'maglev_logistics', name: 'Maglev Logistics', branch: 'infra', icon: 'traffic', cost: 140, tier: 2, requires: ['smart_grid'], description: 'Freight floats through tubes instead of clogging your avenues.', flavor: 'Delivery drivers are now delivery philosophers.', effects: [{ key: 'traffic', value: 0.85 }, { key: 'industryJobs', value: 1.08 }] },
  { id: 'nanofab', name: 'Nanofab Construction', branch: 'infra', icon: 'build', cost: 320, tier: 3, requires: ['maglev_logistics'], description: 'Swarms of builder-bots assemble towers overnight.', flavor: 'Please do not feed the builder-bots after midnight.', effects: [{ key: 'constructionCost', value: 0.88 }, { key: 'growthSpeed', value: 1.15 }] },
  { id: 'fusion_containment', name: 'Fusion Containment', branch: 'infra', icon: 'power2', cost: 450, tier: 4, requires: ['smart_grid'], description: 'Bottle a star, sell the light. Unlocks fusion-class power early.', flavor: 'The bottle is very, very strong. We checked twice.', effects: [{ key: 'powerUse', value: 0.88 }, { key: 'pollution', value: 0.92 }], unlocks: { label: 'Fusion & advanced power plants one tier early', test: (d, t) => d.category === 'power' && d.tier <= t + 1 && has(d, /fusion|antimatter|zero.?point|plasma/i) } },
  { id: 'weather_control', name: 'Weather Control', branch: 'infra', icon: 'cloud', cost: 1_300, tier: 6, requires: ['nanofab', 'eco_arcology'], description: 'Orbital mirrors and cloud seeding keep the sky on schedule.', flavor: 'Rain is now booked in advance, like a dentist.', effects: [{ key: 'fireSpread', value: 0.6 }, { key: 'happiness', value: 3 }, { key: 'waterUse', value: 0.92 }] },

  // ── society ─────────────────────────────────────────────────────────
  { id: 'public_health', name: 'Public Health', branch: 'society', icon: 'health', cost: 50, tier: 1, requires: [], description: 'Vaccines, clean food and a firm talking-to about vegetables.', flavor: 'Life expectancy +12 years. Complaining about it: +40 %.', effects: [{ key: 'health', value: 8 }] },
  { id: 'open_university', name: 'Open University', branch: 'society', icon: 'education', cost: 130, tier: 2, requires: ['public_health'], description: 'Free lectures beamed to every screen in the city.', flavor: 'Your bus driver now has a PhD in xeno-linguistics.', effects: [{ key: 'education', value: 1.15 }, { key: 'researchDividend', value: 0.08 }] },
  { id: 'community_policing', name: 'Community Policing', branch: 'society', icon: 'police', cost: 150, tier: 2, requires: [], description: 'Officers who know your name and your dog’s name.', flavor: 'Crime is down. Cake deliveries to precincts are up.', effects: [{ key: 'crime', value: 0.85 }, { key: 'happiness', value: 1 }] },
  { id: 'renaissance', name: 'Cultural Renaissance', branch: 'society', icon: 'palette', cost: 260, tier: 3, requires: ['open_university'], description: 'Galleries, festivals and street art on every corner.', flavor: 'The new sculpture is either a masterpiece or a parking accident.', effects: [{ key: 'happiness', value: 4 }, { key: 'tourism', value: 1.1 }, { key: 'landValue', value: 3 }] },
  { id: 'longevity', name: 'Longevity Therapy', branch: 'society', icon: 'heart', cost: 750, tier: 5, requires: ['public_health', 'renaissance'], description: 'Telomere tune-ups for every citizen over 150.', flavor: 'Grandma is training for the marathon. Again.', effects: [{ key: 'health', value: 10 }, { key: 'happiness', value: 2 }, { key: 'serviceEffect', value: 1.05 }] },
  { id: 'hive_harmony', name: 'Hive-Mind Harmony', branch: 'society', icon: 'sparkles', cost: 2_100, tier: 7, requires: ['longevity', 'community_policing'], description: 'Optional neural link-ups that make everyone just a little bit nicer.', flavor: 'We are all very happy about this. We are all very happy.', effects: [{ key: 'crime', value: 0.6 }, { key: 'happiness', value: 6 }] },

  // ── economy ─────────────────────────────────────────────────────────
  { id: 'fintech', name: 'Algorithmic Finance', branch: 'economy', icon: 'income', cost: 60, tier: 1, requires: [], description: 'Trading bots squeeze extra credits out of every tax return.', flavor: 'Nobody understands it. Revenue is up. Don’t ask questions.', effects: [{ key: 'taxDividend', value: 0.03 }] },
  { id: 'lean_government', name: 'Lean Government', branch: 'economy', icon: 'budget', cost: 150, tier: 2, requires: ['fintech'], description: 'Fewer committees, more doing. Refunds part of every month’s upkeep.', flavor: 'The Committee for Fewer Committees has been dissolved.', effects: [{ key: 'upkeepRebate', value: 0.08 }] },
  { id: 'tourism_board', name: 'Interstellar Tourism Board', branch: 'economy', icon: 'tourism', cost: 260, tier: 3, requires: ['fintech'], description: 'Glossy brochures beamed to every civilisation within forty light-years.', flavor: '“Come for the skyline. Stay because the shuttle broke down.”', effects: [{ key: 'tourism', value: 1.15 }, { key: 'tourismIncome', value: 1 }] },
  { id: 'trade_network', name: 'Interplanetary Trade', branch: 'economy', icon: 'globe', cost: 500, tier: 4, requires: ['lean_government'], description: 'Freighters shuttle goods between your worlds — and you take a cut.', flavor: 'Moon cheese exports have never been stronger.', effects: [{ key: 'tradeIncome', value: 2_500 }, { key: 'demandC', value: 0.05 }] },
  { id: 'market_oracle', name: 'Market Oracle AI', branch: 'economy', icon: 'chart', cost: 900, tier: 5, requires: ['trade_network'], description: 'A financial AI that predicts the market by quietly owning it.', flavor: 'It recommends you buy more Market Oracle AI.', effects: [{ key: 'taxDividend', value: 0.05 }, { key: 'demandO', value: 0.08 }] },
  { id: 'post_scarcity', name: 'Post-Scarcity Economics', branch: 'economy', icon: 'coin', cost: 2_600, tier: 7, requires: ['market_oracle', 'tourism_board'], description: 'Replicators for everyone. Money mostly becomes a hobby.', flavor: 'Crime has dropped. So has the price of diamonds. And forks.', effects: [{ key: 'incomePer1k', value: 40 }, { key: 'demandR', value: 0.1 }, { key: 'upkeepRebate', value: 0.05 }] },

  // ── space ───────────────────────────────────────────────────────────
  { id: 'rocketry', name: 'Reusable Rocketry', branch: 'space', icon: 'rocket', cost: 100, tier: 2, requires: [], description: 'Rockets that land on their tails instead of in the sea. Spaceports become available a tier early.', flavor: 'Booster recovery rate: 97 %. The other 3 % are now reefs.', effects: [{ key: 'colonyCost', value: 0.85 }], unlocks: { label: 'Spaceports from Township', test: (d, t) => t >= 2 && /spaceport|starport|launch/i.test(`${d.id} ${d.group ?? ''} ${(d.tags ?? []).join(' ')}`) } },
  { id: 'orbital_mechanics', name: 'Orbital Mechanics', branch: 'space', icon: 'satellite', cost: 220, tier: 3, requires: ['rocketry'], description: 'Precise orbital insertion. Orbital structures unlock one tier early.', flavor: 'Kepler would be proud. Newton would be insufferable.', effects: [{ key: 'warpSpeed', value: 1.15 }], unlocks: { label: 'Orbital structures one tier early', test: (d, t) => d.category === 'orbital' && d.tier <= t + 1 } },
  { id: 'terraforming', name: 'Atmospheric Terraforming', branch: 'space', icon: 'globe', cost: 600, tier: 4, requires: ['orbital_mechanics'], description: 'Seed hostile skies with engineered microbes and very big fans.', flavor: 'The air on Ares now smells faintly of mint.', effects: [{ key: 'oxygenUse', value: 0.75 }, { key: 'colonyCost', value: 0.9 }] },
  { id: 'warp_theory', name: 'Warp Field Theory', branch: 'space', icon: 'warp', cost: 1_000, tier: 5, requires: ['orbital_mechanics'], description: 'Fold space, not your budget. Warp gates unlock from Megacity.', flavor: 'Side effects include arriving before you leave.', effects: [{ key: 'warpSpeed', value: 1.4 }], unlocks: { label: 'Warp gates from Megacity', test: (d, t) => t >= 5 && /warp.?gate|stargate|jump.?gate|warpgate/i.test(`${d.id} ${(d.tags ?? []).join(' ')}`) } },
  { id: 'dyson', name: 'Dyson Engineering', branch: 'space', icon: 'sun', cost: 1_600, tier: 6, requires: ['warp_theory', 'fusion_containment'], description: 'Harvest a star’s output with swarms of mirrors. Megastructures unlock two tiers early.', flavor: 'The sun has filed a formal complaint.', effects: [{ key: 'powerUse', value: 0.82 }], unlocks: { label: 'Megastructures two tiers early', test: (d, t) => d.category === 'orbital' && d.tier <= t + 2 } },
  { id: 'cartography', name: 'Intergalactic Cartography', branch: 'space', icon: 'galaxy', cost: 3_000, tier: 7, requires: ['warp_theory'], description: 'Map the void between galaxies. Intergalactic gates unlock from Stellar Civilisation.', flavor: 'The map is mostly empty. That’s the point.', effects: [{ key: 'colonyCost', value: 0.8 }, { key: 'warpSpeed', value: 1.25 }], unlocks: { label: 'Intergalactic gates from Stellar Civilisation', test: (d, t) => t >= 7 && /intergalactic/i.test(`${d.id} ${(d.tags ?? []).join(' ')}`) } },

  // ── exotic ──────────────────────────────────────────────────────────
  { id: 'quantum_computing', name: 'Quantum Computing', branch: 'exotic', icon: 'data', cost: 320, tier: 3, requires: [], description: 'Computers that try every answer at once and only tell you the right one.', flavor: 'It solved the city budget. Then it cried.', effects: [{ key: 'researchDividend', value: 0.25 }, { key: 'dataUse', value: 0.85 }] },
  { id: 'xenobiology', name: 'Xenobiology', branch: 'exotic', icon: 'alien', cost: 520, tier: 4, requires: ['quantum_computing'], description: 'Understand alien ecosystems well enough to make them like you.', flavor: 'The fungus on Umbra has agreed to a trial friendship.', effects: [{ key: 'growthSpeed', value: 1.1 }, { key: 'tourism', value: 1.1 }, { key: 'health', value: 3 }] },
  { id: 'antimatter', name: 'Antimatter Synthesis', branch: 'exotic', icon: 'radiation', cost: 1_800, tier: 6, requires: ['xenobiology', 'fusion_containment'], description: 'One teaspoon powers a city for a year. Please use the provided spoon.', flavor: 'Do NOT stir. Never stir.', effects: [{ key: 'powerUse', value: 0.85 }, { key: 'pollution', value: 0.8 }] },
  { id: 'chronophysics', name: 'Chronophysics', branch: 'exotic', icon: 'hourglass', cost: 2_500, tier: 7, requires: ['antimatter'], description: 'Bend time just enough to finish things yesterday.', flavor: 'This tech was researched next week.', effects: [{ key: 'goalRewards', value: 1.5 }, { key: 'growthSpeed', value: 1.2 }] },
  { id: 'singularity', name: 'The Singularity', branch: 'exotic', icon: 'sparkles', cost: 6_000, tier: 8, requires: ['chronophysics', 'quantum_computing', 'hive_harmony'], description: 'Your civilisation’s collective mind outgrows its silicon. Everything gets better. Slightly unsettling.', flavor: 'It says hello. It also says your zoning is inefficient.', effects: [{ key: 'researchDividend', value: 0.5 }, { key: 'happiness', value: 5 }, { key: 'serviceEffect', value: 1.2 }, { key: 'taxDividend', value: 0.05 }] },
];

export const TECH_MAP = new Map(TECHS.map((t) => [t.id, t]));

/** "−10 % power use", "+4 happiness", "+₡2,500 per colony / mo" */
export function effectText(e: TechEffect): { text: string; icon: string } {
  const info = EFFECT_LABELS[e.key] ?? { label: e.key, icon: 'sparkles', good: 'higher', pct: true };
  if (ADDITIVE_KEYS.has(e.key)) {
    if (e.key === 'researchDividend' || e.key === 'taxDividend' || e.key === 'upkeepRebate') return { text: `+${Math.round(e.value * 100)} % ${info.label}`, icon: info.icon };
    if (e.key === 'tradeIncome' || e.key === 'tourismIncome') return { text: `+₡${e.value.toLocaleString('en-US')} ${info.label}`, icon: info.icon };
    if (e.key.startsWith('demand')) return { text: `+${Math.round(e.value * 100)} % ${info.label}`, icon: info.icon };
    return { text: `${e.value >= 0 ? '+' : '−'}${Math.abs(e.value)} ${info.label}`, icon: info.icon };
  }
  const pct = Math.round((e.value - 1) * 100);
  return { text: `${pct >= 0 ? '+' : '−'}${Math.abs(pct)} % ${info.label}`, icon: info.icon };
}
