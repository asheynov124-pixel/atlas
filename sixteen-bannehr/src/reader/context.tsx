import { createContext, useContext } from 'react';
import type { Placed } from '../model/pages';
import { useMode } from '../store/prefs';

export type LayoutMode = 'spread' | 'phone';

export interface SpreadEnv {
  placed: Placed;
  layout: LayoutMode;
  /** The spread the reader is looking at (drives Ken Burns, autoplay). */
  active: boolean;
  /** A copy drawn only for the page-turn animation: inert, never editable. */
  decorative: boolean;
  /** Laid out for print: every photo loads at once, nothing moves. */
  print?: boolean;
}

const SpreadContext = createContext<SpreadEnv | null>(null);

export const SpreadProvider = SpreadContext.Provider;

export function useSpread(): SpreadEnv {
  const env = useContext(SpreadContext);
  if (!env) throw new Error('useSpread outside a spread');
  return env;
}

export function useEditing(): boolean {
  const editing = useMode((s) => s.editing);
  const env = useContext(SpreadContext);
  return editing && !env?.decorative && !env?.print;
}
