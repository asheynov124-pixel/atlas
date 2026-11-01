import { Component, memo, type ReactNode } from 'react';
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

class SpreadBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Spread failed to render:', this.props.label, error);
  }
  render() {
    if (this.state.error) {
      return (
        <section className="paper" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 32 }} aria-label="Spread could not be shown">
          <p className="t-caption" style={{ textAlign: 'center', maxWidth: '36ch' }}>
            This spread could not be drawn. Its content is safe; try changing its template.
          </p>
        </section>
      );
    }
    return this.props.children;
  }
}

/** Picks the template component for a spread and hands it a context. */
export const SpreadView = memo(function SpreadView({ ref_, book, figures, editable = false, print = false }: SpreadViewProps) {
  const Component_ = templateComponent(ref_.spread.template);
  const ctx: SpreadCtx = { ref: ref_, book, figures, editable, print };
  return (
    <SpreadBoundary label={`${ref_.chapter.title} / ${ref_.spread.template}`}>
      <Component_ ctx={ctx} />
    </SpreadBoundary>
  );
});
