import type { CharacterDef } from './types';

/**
 * Character defs. Names are UI labels only; every look is an original
 * geometric silhouette drawn from `color`, `role`, and a hash of `id`.
 * Several live instances of one def can exist at once.
 */
export const ROSTER: CharacterDef[] = [
  {
    id: 'will', name: 'Will Stronghold', role: 'hero', color: '#3b6fd8',
    radius: 17, mass: 5, speed: 4.6, powers: ['strength', 'flight'],
    blurb: 'Late bloomer. Lifts anything; flies once he remembers how.',
  },
  {
    id: 'layla', name: 'Layla', role: 'hero', color: '#3fae5a',
    radius: 16, mass: 4, speed: 4.4, powers: ['plants'],
    blurb: 'Talks to plants. The plants listen, then grab you.',
  },
  {
    id: 'warren', name: 'Warren Peace', role: 'hero', color: '#d2462e',
    radius: 17, mass: 5, speed: 4.4, powers: ['fire'],
    blurb: 'Hands of fire, temper to match.',
  },
  {
    id: 'ethan', name: 'Ethan', role: 'sidekick', color: '#7a5bd0',
    radius: 16, mass: 4, speed: 4.2, powers: ['melt'],
    blurb: 'Melts into a puddle. Mostly on purpose.',
  },
  {
    id: 'magenta', name: 'Magenta', role: 'sidekick', color: '#b83c8f',
    radius: 15, mass: 3.6, speed: 4.4, powers: ['guinea'],
    blurb: 'Shape-shifts into a guinea pig. Fear the nibble.',
  },
  {
    id: 'zach', name: 'Zach', role: 'sidekick', color: '#e8d44a',
    radius: 17, mass: 4.5, speed: 4.3, powers: ['glow'],
    blurb: 'Glows. Brightly. Insistently.',
  },
  {
    id: 'larry', name: 'Larry', role: 'hero', color: '#8a7f70',
    radius: 19, mass: 7, speed: 3.6, powers: ['rock'],
    blurb: 'Goes full boulder and rolls downhill fast.',
  },
  {
    id: 'ron', name: 'Ron Wilson', role: 'faculty', color: '#e09a3a',
    radius: 18, mass: 5.5, speed: 3.8, powers: ['grow'],
    blurb: 'Bus driver. Occasionally the size of the bus.',
  },
  {
    id: 'gwen', name: 'Gwen', role: 'villain', color: '#6d2fa8',
    radius: 16, mass: 4, speed: 4.4, powers: ['tech', 'pacifier'],
    blurb: 'Machines obey her. People get… smaller.',
  },
  {
    id: 'penny', name: 'Penny', role: 'villain', color: '#f07aa8',
    radius: 15, mass: 3.6, speed: 4.6, powers: ['clone'],
    blurb: 'There are several of her. That is the problem.',
  },
  {
    id: 'lash', name: 'Lash', role: 'villain', color: '#3aa6a0',
    radius: 16, mass: 4, speed: 4.4, powers: ['stretch'],
    blurb: 'Limbs like taffy, reach like a crane.',
  },
  {
    id: 'speed', name: 'Speed', role: 'villain', color: '#ff7b1c',
    radius: 18, mass: 5.5, speed: 9.5, powers: ['speed'],
    blurb: 'Fastest thing on campus. Will not let you forget it.',
  },
  {
    id: 'freeze', name: 'Freeze Girl', role: 'villain', color: '#6fc7ef',
    radius: 15, mass: 3.6, speed: 4.4, powers: ['ice'],
    blurb: 'Cold shoulder, colder ray.',
  },
  {
    id: 'commander', name: 'The Commander', role: 'hero', color: '#1f3f8f',
    radius: 20, mass: 8, speed: 4.8, powers: ['strength', 'flight', 'invuln'],
    blurb: 'Campus legend. Things bounce off him, then off the walls.',
  },
  {
    id: 'jetstream', name: 'Jetstream', role: 'hero', color: '#d9dde8',
    radius: 16, mass: 4, speed: 4.8, powers: ['flight'],
    blurb: 'Pure flight. Turns the sky into a runway.',
  },
  {
    id: 'powers', name: 'Principal Powers', role: 'faculty', color: '#e8a33c',
    radius: 17, mass: 4.5, speed: 4.2, powers: ['comet'],
    blurb: 'Runs the school. Sometimes as a comet.',
  },
  {
    id: 'boomer', name: 'Coach Boomer', role: 'faculty', color: '#6b8e23',
    radius: 21, mass: 8, speed: 4.0, powers: ['sonic'],
    blurb: 'One whistle away from a sonic boom.',
  },
  {
    id: 'spex', name: 'Nurse Spex', role: 'faculty', color: '#e9eef2',
    radius: 16, mass: 4, speed: 4.0, powers: ['xray'],
    blurb: 'Sees straight through you. Patches you up anyway.',
  },
];

export const DEF_BY_ID: Record<string, CharacterDef> = Object.fromEntries(ROSTER.map((d) => [d.id, d]));
