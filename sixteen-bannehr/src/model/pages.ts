import type { Book, Chapter, Spread } from './types';

/** A spread placed in the book: where it falls, what it is called, what its pages are. */
export interface Placed {
  spread: Spread;
  chapter: Chapter;
  chapterIndex: number;
  /** 1-based number among numbered chapters, or null for front matter, prologue, epilogue. */
  chapterNumber: number | null;
  index: number;
  /** Position of this spread within its chapter, from 1. */
  indexInChapter: number;
  /** Printed page numbers. The cover is page 1, a lone recto, so versos are even. */
  verso: number | null;
  recto: number;
  isCover: boolean;
}

export interface Layout {
  placed: Placed[];
  byId: Map<string, Placed>;
  /** Page on which each chapter starts (its first spread's verso, or recto for the cover). */
  chapterStart: Map<string, number>;
  chapterNumbers: Map<string, number | null>;
  /** "3.4" for each captioned figure, keyed `${spreadId}:${slotKey}`. */
  figures: Map<string, string>;
}

/** Slots that print a figure number beside their caption. */
function figureSlots(spread: Spread): string[] {
  switch (spread.template) {
    case 'fullbleed':
      return ['image'];
    case 'beforeAfter':
      return ['image', 'image2'];
    case 'plan':
      return ['plan'];
    case 'essay': {
      const s = spread.slots.image;
      return s && s.kind === 'image' && s.assetId ? ['image'] : [];
    }
    default:
      return [];
  }
}

export function layoutBook(book: Book): Layout {
  const placed: Placed[] = [];
  const byId = new Map<string, Placed>();
  const chapterStart = new Map<string, number>();
  const chapterNumbers = new Map<string, number | null>();
  const figures = new Map<string, string>();
  let n = 0;
  let index = 0;

  book.chapters.forEach((chapter, chapterIndex) => {
    const chapterNumber = chapter.kind === 'chapter' ? ++n : null;
    chapterNumbers.set(chapter.id, chapterNumber);
    const prefix =
      chapterNumber !== null ? String(chapterNumber) : chapter.kind === 'prologue' ? 'P' : chapter.kind === 'epilogue' ? 'E' : '';
    let fig = 0;
    chapter.spreads.forEach((spread, i) => {
      for (const key of figureSlots(spread)) figures.set(`${spread.id}:${key}`, `${prefix}.${++fig}`);
      const isCover = index === 0 && spread.template === 'cover';
      const verso = isCover ? null : 2 * index;
      const recto = isCover ? 1 : 2 * index + 1;
      const p: Placed = {
        spread,
        chapter,
        chapterIndex,
        chapterNumber,
        index,
        indexInChapter: i + 1,
        verso,
        recto,
        isCover,
      };
      if (!chapterStart.has(chapter.id)) chapterStart.set(chapter.id, verso ?? recto);
      placed.push(p);
      byId.set(spread.id, p);
      index++;
    });
  });

  return { placed, byId, chapterStart, chapterNumbers, figures };
}

const WORDS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
  'Nineteen', 'Twenty',
];

export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** "Chapter Three", "Prologue", "Epilogue". */
export function chapterLabel(chapter: Chapter, number: number | null): string {
  if (chapter.kind === 'prologue') return 'Prologue';
  if (chapter.kind === 'epilogue') return 'Epilogue';
  if (chapter.kind === 'front') return '';
  return `Chapter ${numberWord(number ?? 0)}`;
}
