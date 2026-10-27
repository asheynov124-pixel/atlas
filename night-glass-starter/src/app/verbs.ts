/**
 * The verb mapping: the one decision that shapes every screen. Each Night Glass action
 * color means one thing in this app, everywhere it appears: rail button, swipe stamp,
 * toast, chip, action-sheet tile, gesture guide. Rename the words to fit your app and
 * keep the keys; the key picks the color (like = green, pass = rose, save = amber,
 * capture = violet).
 */
export type Verb = 'like' | 'pass' | 'save' | 'capture';

export interface VerbSpec {
  key: Verb;
  /** Button and tile label. */
  label: string;
  /** The word stamped on the card while you drag. */
  stamp: string;
  /** Toast text once it's done (past tense). */
  done: string;
  /** One-line explanation in menus and the gesture guide. */
  hint: string;
  /** The gesture, in words. */
  swipe: string;
}

export const VERBS: Record<Verb, VerbSpec> = {
  like: { key: 'like', label: 'Like', stamp: 'LIKE', done: 'Liked', hint: 'More like this in your feed', swipe: 'Swipe right' },
  pass: { key: 'pass', label: 'Pass', stamp: 'PASS', done: 'Passed', hint: 'Fewer like this', swipe: 'Swipe left' },
  save: { key: 'save', label: 'Save', stamp: 'SAVE', done: 'Saved', hint: 'Keep it in your Library', swipe: 'Swipe up' },
  capture: { key: 'capture', label: 'Explore', stamp: 'EXPLORE', done: 'Exploring', hint: 'Start a feed from this card', swipe: 'Swipe down' },
};

export const VERB_ORDER: Verb[] = ['like', 'pass', 'save', 'capture'];
