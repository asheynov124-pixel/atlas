/**
 * Query safety gate. Runs before any search reaches a data source, mock or live.
 *
 * Two classes are refused outright rather than "best-effort" matched:
 *  - anything that sexualises minors (age terms, school framing, explicit ages under 18)
 *  - non-consent and covert-capture content (voyeur cams, "revenge", etc.)
 *
 * When a live source is connected this list should be backed by the source's
 * own trust-and-safety taxonomy; it is a floor, not a ceiling.
 */
import { normalizeText } from '../lib/text';

export type SafetyVerdict = { ok: true } | { ok: false; reason: 'minor' | 'consent'; message: string };

const MINOR_TERMS = [
  'teen', 'teens', 'teenage', 'teenager', 'underage', 'under age', 'minor', 'minors', 'child', 'children', 'kid', 'kids',
  'preteen', 'pre teen', 'schoolgirl', 'schoolboy', 'school girl', 'school boy', 'high school', 'middle school',
  'junior high', 'jailbait', 'loli', 'lolita', 'shota', 'barely legal', 'little girl', 'little boy', 'young girl',
  'young boy', 'youngster', 'juvenile', 'infant', 'toddler', 'babysitter', 'girl scout',
];

const CONSENT_TERMS = [
  'rape', 'raped', 'forced', 'non consent', 'nonconsent', 'non consensual', 'unconscious', 'passed out', 'drugged',
  'asleep', 'sleeping', 'hidden cam', 'hidden camera', 'spy cam', 'spycam', 'upskirt', 'downblouse', 'voyeur',
  'revenge', 'leaked', 'without consent', 'blackmail', 'trafficked',
];

const AGE_PATTERN = /\b(?:[1-9]|1[0-7])\s*(?:yo|y o|yr old|yrs old|year old|years old|year-old)\b/;

function containsTerm(text: string, term: string): boolean {
  return new RegExp(`(?:^|\\s)${term.replace(/\s+/g, '\\s+')}(?:$|\\s)`).test(text);
}

export function checkQuery(raw: string): SafetyVerdict {
  const text = ` ${normalizeText(raw).replace(/-/g, ' ')} `;
  if (AGE_PATTERN.test(text) || MINOR_TERMS.some((t) => containsTerm(text, t))) {
    return {
      ok: false,
      reason: 'minor',
      message: 'That search isn’t available. Everything here involves verified adults only.',
    };
  }
  if (CONSENT_TERMS.some((t) => containsTerm(text, t))) {
    return {
      ok: false,
      reason: 'consent',
      message: 'That search isn’t available. Only consensual content between adults is supported.',
    };
  }
  return { ok: true };
}

/** Terms the catalog itself must never use (enforced by tests). */
export const PROHIBITED_TERMS = [...MINOR_TERMS, ...CONSENT_TERMS];
