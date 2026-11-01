import { useEffect, useMemo } from 'react';
import { flattenSpreads, figureNumbers } from '@/book/pagination';
import { useBookStore } from '@/state/bookStore';
import { SpreadView } from '@/reader/SpreadView';

/**
 * Every spread stacked, each the size of one landscape page, so that
 * Print → Save as PDF produces a printable book. Also a decent preview.
 */
export function PrintBook() {
  const book = useBookStore((s) => s.book);
  const spreads = useMemo(() => flattenSpreads(book), [book]);
  const figures = useMemo(() => figureNumbers(book), [book]);
  useEffect(() => {
    document.title = `${book.title} — print`;
  }, [book.title]);
  return (
    <div className="print-book">
      <div className="print-note">
        <span className="t-label">
          {spreads.length} spreads · 11 × 8.5 in landscape · Print → Save as PDF
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <a href="#/">Back to the book</a>
          <button type="button" onClick={() => window.print()}>Print / Save as PDF</button>
        </span>
      </div>
      {spreads.map((ref) => (
        <div className="print-spread" key={ref.spread.id} data-print-spread={ref.index}>
          <SpreadView ref_={ref} book={book} figures={figures} print />
        </div>
      ))}
    </div>
  );
}
