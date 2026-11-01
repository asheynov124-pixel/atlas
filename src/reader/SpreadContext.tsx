import { createContext, useContext } from 'react';
import type { SpreadRef } from '@/book/pagination';
import type { Book } from '@/book/types';

export interface SpreadCtx {
  ref: SpreadRef;
  book: Book;
  figures: Map<string, string>;
  /** Edit mode is on and this spread is the current one. */
  editable: boolean;
  /** Rendering for print: no lazy loading, no motion. */
  print: boolean;
}

export const SpreadContext = createContext<SpreadCtx | null>(null);

export function useSpread(): SpreadCtx {
  const ctx = useContext(SpreadContext);
  if (!ctx) throw new Error('useSpread must be used inside a Spread');
  return ctx;
}

export function useFigure(slotKey: string): string | undefined {
  const { ref, figures } = useSpread();
  return figures.get(`${ref.spread.id}:${slotKey}`);
}

/** Figure number for a slot, usable before the provider mounts (templates own their Spread). */
export function figureOf(ctx: SpreadCtx, slotKey: string): string | undefined {
  return ctx.figures.get(`${ctx.ref.spread.id}:${slotKey}`);
}
