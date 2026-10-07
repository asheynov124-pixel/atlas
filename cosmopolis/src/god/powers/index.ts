/**
 * OWNER: god.
 * Every god power, in panel order per category.
 */
import type { PowerSpec } from '../effect';
import { WEATHER } from './weather';
import { EARTH } from './earth';
import { SKY } from './sky';
import { CREATURE } from './creature';
import { COSMIC } from './cosmic';
import { CREATION } from './creation';

export const POWERS: PowerSpec[] = [...WEATHER, ...EARTH, ...SKY, ...CREATURE, ...COSMIC, ...CREATION];
