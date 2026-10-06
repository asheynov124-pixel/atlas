/**
 * OWNER: cosmos.
 * Procedural names for star systems, planets and moons — syllable tables with a little grammar so the results
 * read like places ("Kaelor", "Vyndra IV", "Sethi's Reach"). Deterministic: everything takes an Rng.
 */
import type { Rng } from '../core/rng';

const START = ['Ka', 'Ve', 'Lo', 'Ri', 'Sa', 'Tor', 'Qua', 'Zen', 'Mar', 'Eli', 'Or', 'An', 'Thy', 'Dra', 'Vo', 'Nyx', 'Cal', 'Ser', 'Phae', 'Ul', 'Is', 'Ya', 'Gre', 'Bel', 'Mor', 'Ix', 'Ta', 'Ne', 'Os', 'Kel', 'Ar', 'Sy', 'Hel', 'Pyr', 'Cy', 'Ae', 'Lu', 'Vey', 'Zor', 'Hy'];
const MID = ['la', 'ri', 'no', 'the', 'va', 'li', 'ra', 'do', 'mi', 'ne', 'ta', 'si', 'ro', 'ze', 'ka', 'lu', 'phi', 'ber', 'len', 'dri'];
const END = ['on', 'is', 'a', 'us', 'ar', 'eth', 'ion', 'ys', 'ora', 'ex', 'ane', 'or', 'ia', 'ax', 'el', 'um', 'ae', 'oth', 'ix', 'ene', 'ul', 'yr', 'en', 'ost'];
const STAR_PREFIX = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Sigma', 'Tau', 'Omega'];
const STAR_SUFFIX = ['Reach', 'Drift', 'Haven', 'Crossing', 'Hollow', 'Gate', 'Rest', 'Verge', 'Expanse', 'Cradle', 'Spire', 'Wake'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** A pronounceable 2–3 syllable name. */
export function worldName(rng: Rng): string {
  const syl = rng.chance(0.55) ? 2 : 3;
  let s = rng.pick(START);
  for (let i = 0; i < syl - 2; i++) s += rng.pick(MID);
  s += rng.pick(END);
  return s;
}

/** A star-system name: "Kaelor", "Tau Vyndra", "Sethi's Reach". */
export function systemName(rng: Rng): string {
  const r = rng.next();
  const base = worldName(rng);
  if (r < 0.35) return `${rng.pick(STAR_PREFIX)} ${base}`;
  if (r < 0.55) return `${base}'s ${rng.pick(STAR_SUFFIX)}`;
  return base;
}

/** Planet name inside a system: either its own name or "<System> IV". */
export function planetName(rng: Rng, system: string, index: number): string {
  if (rng.chance(0.62)) return worldName(rng);
  const root = system.replace(/^(Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Sigma|Tau|Omega) /, '').replace(/'s .*$/, '');
  return `${root} ${ROMAN[index] ?? index + 1}`;
}

/** Moon names: short and lyrical. */
export function moonName(rng: Rng): string {
  const a = ['Io', 'Nix', 'Mira', 'Pell', 'Rhea', 'Tethe', 'Dione', 'Kore', 'Ash', 'Lys', 'Echo', 'Vela', 'Iris', 'Nyss', 'Opal', 'Wren', 'Cass', 'Hali', 'Juno', 'Sable'];
  const b = ['', '', '', 'a', 'is', 'on', 'e', 'ra'];
  return rng.pick(a) + rng.pick(b);
}

export function roman(n: number): string {
  return ROMAN[n] ?? String(n + 1);
}
