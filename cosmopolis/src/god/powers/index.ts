/**
 * OWNER: god.
 * Every god power, in panel order per category.
 */
import type { PowerSpec } from '../effect';
import { WEATHER } from './weather';
import { EARTH } from './earth';
import { SKY } from './sky';

export const POWERS: PowerSpec[] = [...WEATHER, ...EARTH, ...SKY];
