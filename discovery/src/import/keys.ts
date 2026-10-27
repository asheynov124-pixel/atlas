/** Keyboard helpers shared by the import sheet and the bulk title editor. */

export const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
export const MOD = IS_APPLE ? '⌘' : 'Ctrl';

/** ⌘ on Apple platforms, Ctrl elsewhere — but accept either, people cross platforms. */
export const isMod = (e: KeyboardEvent | React.KeyboardEvent) => e.metaKey || e.ctrlKey;

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes((el as HTMLInputElement).type);
}

/** True when an input's whole value is already selected (so ⌘A should escalate to "select all rows"). */
export function fullySelected(el: EventTarget | null): boolean {
  const input = el as HTMLInputElement | null;
  if (!input || typeof input.selectionStart !== 'number') return true;
  return input.value.length === 0 || (input.selectionStart === 0 && input.selectionEnd === input.value.length);
}

export interface Shortcut {
  keys: string;
  does: string;
}

export const IMPORT_SHORTCUTS: Shortcut[] = [
  { keys: `${MOD} V`, does: 'Paste links (anywhere in the import screen)' },
  { keys: `${MOD} ↵`, does: 'Start: scan pages, then import' },
  { keys: `${MOD} A`, does: 'Select every row in the preview' },
  { keys: '⌫ / Del', does: 'Exclude the selected rows' },
  { keys: `${MOD} E`, does: 'Open the bulk title editor' },
  { keys: `${MOD} S`, does: 'Save title edits' },
  { keys: `${MOD} ⇧ E`, does: 'Export the current batch' },
  { keys: '?', does: 'Show or hide this list' },
];

export const EDITOR_SHORTCUTS: Shortcut[] = [
  { keys: '↑ ↓', does: 'Move between rows' },
  { keys: '⇧ ↑ / ⇧ ↓', does: 'Extend the selection' },
  { keys: 'Tab / ⇧ Tab', does: 'Next / previous title field' },
  { keys: `${MOD} A`, does: 'Select all rows (press twice inside a field)' },
  { keys: `${MOD} Z / ${MOD} ⇧ Z`, does: 'Undo / redo title changes' },
  { keys: `${MOD} S`, does: 'Save titles and close' },
];
