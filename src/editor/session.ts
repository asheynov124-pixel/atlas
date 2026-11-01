import { useCallback, useEffect, useRef } from 'react';
import { useBookStore } from '@/state/bookStore';

/**
 * Coalesce a run of edits (typing, dragging) into one undo step: the first
 * change is recorded, history pauses until the session ends.
 */
export function useEditSession() {
  const active = useRef(false);
  const change = useCallback((apply: () => void) => {
    const temporal = useBookStore.temporal.getState();
    if (!active.current) {
      apply();
      temporal.pause();
      active.current = true;
    } else {
      apply();
    }
  }, []);
  const end = useCallback(() => {
    if (active.current) {
      useBookStore.temporal.getState().resume();
      active.current = false;
    }
  }, []);
  useEffect(() => end, [end]);
  return { change, end };
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text (with line breaks) to the HTML we store for single-line and short slots. */
export const textToHtml = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');
