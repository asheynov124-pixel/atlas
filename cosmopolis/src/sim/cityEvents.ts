/**
 * City events — small, temporary happenings that colour city life (festivals, heatwaves, celebrity visits,
 * data outages…). Each one tweaks sim Mods for a few days and makes the Hypernet buzz. Rolled monthly.
 * These are not disasters (god powers own those) — just the weather of civic life.
 */
import type { ModPatch } from './policies';

export interface CityEventDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  days: number;
  /** minimum population */
  minPop: number;
  weight: number;
  mods: ModPatch;
  /** one-off money (+ windfall / − cost) */
  money?: number;
  news: string[];
  good: boolean;
}

export const CITY_EVENTS: CityEventDef[] = [
  { id: 'festival', name: 'Starlight Festival', icon: '🎆', description: 'Lanterns, music and fireworks under the rings. Everyone is in a good mood.', days: 12, minPop: 300, weight: 3, good: true, mods: { happiness: 6, tourism: 1.3 }, news: ['The Starlight Festival is ON! Fireworks at 9, food stalls all night. 🎆', 'Danced until sunrise at the festival. Which sun? Both. 🎶'] },
  { id: 'heatwave', name: 'Heatwave', icon: '🥵', description: 'Air conditioners everywhere. Water and power use spike.', days: 10, minPop: 200, weight: 2, good: false, mods: { waterUse: 1.25, powerUse: 1.15, happiness: -3 }, news: ['It\'s so hot the pavement is making toast. 🥵', 'HEATWAVE ADVISORY: stay hydrated, stay indoors, stay fabulous.'] },
  { id: 'celebrity', name: 'Celebrity Chef Visit', icon: '👨‍🍳', description: 'A galaxy-famous chef opened a pop-up. Shops are buzzing.', days: 15, minPop: 800, weight: 2, good: true, mods: { demandC: 0.12, tourism: 1.15, landValue: 2 }, news: ['Waited 3 hours for Chef Zorblax\'s nebula dumplings. Life-changing. 🥟'] },
  { id: 'aliens', name: 'Alien Diplomats', icon: '👽', description: 'A delegation from a distant world is touring the city. Tourism soars.', days: 10, minPop: 1500, weight: 1, good: true, mods: { tourism: 1.5, happiness: 2 }, money: 4000, news: ['The alien delegation tried our hot dogs. Galactic relations: excellent. 👽🌭', 'Aliens visited my shop and bought every snow globe. ALL OF THEM.'] },
  { id: 'meteor_show', name: 'Meteor Shower', icon: '🌠', description: 'A spectacular (and harmless) meteor shower draws stargazers.', days: 5, minPop: 100, weight: 2, good: true, mods: { tourism: 1.25, happiness: 3 }, news: ['Meteor shower tonight! Grab a blanket and look up 🌠', 'Counted 214 shooting stars. Made 214 wishes. All about pizza.'] },
  { id: 'data_outage', name: 'Hypernet Outage', icon: '📵', description: 'A solar flare scrambled the data relays. Offices sulk.', days: 6, minPop: 2000, weight: 1, good: false, mods: { demandO: -0.15, happiness: -2, research: 0.8 }, news: ['Hypernet down. Talked to my family. They seem nice. 📵'] },
  { id: 'baby_boom', name: 'Baby Boom', icon: '👶', description: 'Something in the water? Families are growing fast.', days: 30, minPop: 1000, weight: 1, good: true, mods: { demandR: 0.15, happiness: 1 }, news: ['Three of my neighbours had twins this month. THREE. 👶👶'] },
  { id: 'tech_expo', name: 'Tech Expo', icon: '🤖', description: 'Inventors from across the sector show off gadgets. Offices and tech industry boom.', days: 12, minPop: 3000, weight: 1, good: true, mods: { demandO: 0.12, demandI: 0.06, research: 1.2 }, news: ['Saw a self-folding umbrella at the Tech Expo. It folded me. 🤖'] },
  { id: 'pothole', name: 'Pothole Epidemic', icon: '🕳️', description: 'Roads are cratered. Traffic crawls until crews catch up.', days: 8, minPop: 600, weight: 2, good: false, mods: { traffic: 1.2, happiness: -2 }, money: -1500, news: ['Hit a pothole so deep I saw the planet\'s core. 🕳️'] },
  { id: 'flu', name: 'Space Flu Season', icon: '🤧', description: 'Sniffles everywhere. Clinics are busy.', days: 14, minPop: 1200, weight: 2, good: false, mods: { health: -8, happiness: -2 }, news: ['Space flu got me. My sneezes have zero-G now. 🤧'] },
  { id: 'marathon', name: 'Orbital Marathon', icon: '🏃', description: 'Runners from every colony race through the streets.', days: 4, minPop: 2500, weight: 1, good: true, mods: { tourism: 1.3, traffic: 1.1, happiness: 3 }, news: ['Ran the Orbital Marathon! Finished 4,012th. Personal best. 🏃'] },
  // election outcomes (scheduled every four years, never rolled at random)
  { id: 'landslide', name: 'Re-elected in a Landslide', icon: '🗳️', description: 'The mayor won by a mile. Confetti everywhere; morale soars for a season.', days: 90, minPop: 0, weight: 0, good: true, mods: { happiness: 4, tourism: 1.1 }, news: ['LANDSLIDE! The mayor wins re-election with {n}% approval. Confetti cannons fired. 🎉🗳️'] },
  { id: 'scraped', name: 'Narrow Re-election', icon: '🗳️', description: 'Re-elected by a whisker. The opposition is "keeping an eye on things".', days: 60, minPop: 0, weight: 0, good: true, mods: {}, news: ['The mayor scrapes through re-election with {n}% approval. Recount requested by a goat (long story). 🐐'] },
  { id: 'recall', name: 'Recall Campaign', icon: '📢', description: 'Unhappy citizens campaign to recall the mayor. Protest marches dampen the mood.', days: 90, minPop: 0, weight: 0, good: false, mods: { happiness: -3, tourism: 0.9 }, news: ['Recall petition hits 100,000 signatures. Approval at {n}%. Mayor reportedly "taking it very well". 📢'] },
  { id: 'grant', name: 'Federation Grant', icon: '💰', description: 'The Galactic Federation rewards your city\'s progress with a grant.', days: 1, minPop: 5000, weight: 1, good: true, mods: {}, money: 15000, news: ['The Federation sent us a grant! Mayor, spend it on fountains. ⛲'] },
];
