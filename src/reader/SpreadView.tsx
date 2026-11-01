import { memo } from 'react';
import type { SpreadRef } from '@/book/pagination';
import type { Book } from '@/book/types';
import { templateComponent } from '@/templates/registry';
import type { SpreadCtx } from './SpreadContext';

interface SpreadViewProps {
  ref_: SpreadRef;
  book: Book;
  figures: Map<string, string>;
  editable?: boolean;
  print?: boolean;
}

/** Picks the template component for a spread and hands it a context. */
export const SpreadView = memo(function SpreadView({ ref_, book, figures, editable = false, print = false }: SpreadViewProps) {
  const Component = templateComponent(ref_.spread.template);
  const ctx: SpreadCtx = { ref: ref_, book, figures, editable, print };
  return <Component ctx={ctx} />;
});
