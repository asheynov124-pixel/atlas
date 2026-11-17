import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { create } from 'zustand';
import { Spread } from './Spread';
import { useBook, useLayout } from '../store/book';

// Printing: every spread, each on one landscape page (11 × 8.5 in), so "Print → Save as
// PDF" makes a book. The print copy is rendered only while printing.

export const usePrint = create<{ printing: boolean }>()(() => ({ printing: false }));

async function imagesReady(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
  await document.fonts.ready;
}

let printRoot: HTMLElement | null = null;

/** Lay out the whole book, wait for its photos, then open the print dialog. */
export async function printBook(): Promise<void> {
  flushSync(() => usePrint.setState({ printing: true }));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  if (printRoot) await imagesReady(printRoot);
  window.print();
}

if (typeof window !== 'undefined') {
  // Cmd-P without the button still gets the book, laid out before the snapshot.
  window.addEventListener('beforeprint', () => {
    if (!usePrint.getState().printing) flushSync(() => usePrint.setState({ printing: true }));
  });
  window.addEventListener('afterprint', () => usePrint.setState({ printing: false }));
}

export function PrintBook() {
  const printing = usePrint((s) => s.printing);
  const { placed } = useLayout();
  const day = useBook().theme.day;
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    printRoot = root.current;
  });

  useEffect(() => () => void (printRoot = null), []);

  if (!printing) return null;
  // Print by day, whatever the screen is doing: paper is paper.
  const vars = Object.fromEntries(Object.entries(day).map(([k, v]) => [`--${k}`, v])) as CSSProperties;
  return (
    <div className="book print-book" data-layout="spread" data-mode="read" ref={root} style={vars} aria-hidden="true">
      {placed.map((p) => (
        <div className="print-page" key={p.spread.id}>
          <div className="sheet" data-closed={p.isCover || undefined}>
            <Spread placed={p} layout="spread" print />
          </div>
        </div>
      ))}
    </div>
  );
}
