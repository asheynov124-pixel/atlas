/**
 * OWNER: ui-panels.
 * Small cross-panel UI state (signals) — e.g. the districts panel opens the policies panel scoped to a district,
 * the labels overlay asks the districts panel to focus one district, photo mode toggles labels.
 */
import { signal } from '@preact/signals';

/** district id the policies panel edits (0 = city-wide) */
export const policyScope = signal(0);
/** district the districts panel should expand when it opens (−1 = none) */
export const focusDistrict = signal(-1);
/** show building / district labels while in photo mode */
export const photoLabels = signal(false);
/** the help panel's tab to open with */
export const helpTab = signal<'basics' | 'gestures' | 'keys' | 'tips'>('basics');
