// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { layoutBook, chapterLabel } from './pages';
import { createSeedBook } from './seed';
import { changeTemplate, createSpread, TEMPLATES } from './templates';
import { collectStillToDecide } from './still-to-decide';
import { typeset, typesetHtml, wordCount } from './typeset';
import { sanitizeHtml, isBlank } from './sanitize';

describe('seed book', () => {
  const book = createSeedBook();

  it('has every chapter from the brief, in order', () => {
    expect(book.chapters.map((c) => c.title)).toEqual([
      'Front matter',
      'The House on Bannehr Street',
      'The Approach',
      'The Vault',
      'A Cook’s Kitchen',
      'The Bath with the Archer',
      'The Small Bath',
      'Rest',
      'Below',
      'Outside',
      'The Palette',
      'Still to Decide',
    ]);
  });

  it('gives every slot the kind its template expects', () => {
    for (const ch of book.chapters)
      for (const sp of ch.spreads)
        for (const def of TEMPLATES[sp.template].slots) expect(sp.slots[def.key]?.kind, `${sp.id}.${def.key}`).toBe(def.kind);
  });

  it('references only items that exist', () => {
    for (const ch of book.chapters)
      for (const sp of ch.spreads)
        for (const slot of Object.values(sp.slots))
          if (slot.kind === 'items') for (const id of slot.itemIds) expect(book.items[id], id).toBeDefined();
  });

  it('has thirty-two vanities', () => {
    expect(Object.keys(book.items).filter((id) => id.startsWith('it-vanity-'))).toHaveLength(32);
  });

  it('invents no compliance claims', () => {
    for (const item of Object.values(book.items)) {
      const { notes, ...fields } = item.clean;
      expect(Object.values(fields).every((v) => v === '')).toBe(true);
      expect(notes).toBe('');
    }
  });

  it('uses unique spread ids', () => {
    const ids = book.chapters.flatMap((c) => c.spreads.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('page numbering', () => {
  const book = createSeedBook();
  const layout = layoutBook(book);

  it('makes the cover page 1, a lone recto', () => {
    const cover = layout.placed[0];
    expect(cover.isCover).toBe(true);
    expect(cover.verso).toBeNull();
    expect(cover.recto).toBe(1);
  });

  it('puts even numbers on versos and odd on rectos', () => {
    for (const p of layout.placed.slice(1)) {
      expect(p.verso! % 2).toBe(0);
      expect(p.recto % 2).toBe(1);
      expect(p.recto).toBe(p.verso! + 1);
    }
  });

  it('numbers chapters by position, not by stored number', () => {
    const kitchen = book.chapters.find((c) => c.slug === 'kitchen')!;
    expect(layout.chapterNumbers.get(kitchen.id)).toBe(3);
    expect(chapterLabel(kitchen, 3)).toBe('Chapter Three');
    // Move the kitchen first among chapters: it becomes chapter one.
    const moved = structuredClone(book);
    const idx = moved.chapters.findIndex((c) => c.slug === 'kitchen');
    const [k] = moved.chapters.splice(idx, 1);
    moved.chapters.splice(2, 0, k);
    expect(layoutBook(moved).chapterNumbers.get(kitchen.id)).toBe(1);
  });

  it('numbers figures within a chapter', () => {
    expect(layout.figures.get('sp-kitchen-ba:image')).toBe('3.1');
    expect(layout.figures.get('sp-kitchen-ba:image2')).toBe('3.2');
    expect(layout.figures.get('sp-kitchen-plan:plan')).toBe('3.3');
    expect(layout.figures.get('sp-prologue-rafters:image')).toBe('P.1');
  });
});

describe('changing a template', () => {
  it('carries over matching slots and keeps the rest for later', () => {
    const essay = createSpread('essay', {
      title: { kind: 'text', html: '<p>Title</p>' },
      body: { kind: 'text', html: '<p>Body</p>' },
    });
    const gallery = changeTemplate(essay, 'gallery');
    expect(gallery.slots.title).toEqual({ kind: 'text', html: '<p>Title</p>' });
    expect(gallery.slots.items).toEqual({ kind: 'items', itemIds: [] });
    const back = changeTemplate(gallery, 'essay');
    expect(back.slots.body).toEqual({ kind: 'text', html: '<p>Body</p>' });
    expect(back.id).toBe(essay.id);
  });
});

describe('still to decide', () => {
  it('collects decisions at Thinking and items not yet ordered', () => {
    const book = createSeedBook();
    const s = collectStillToDecide(book);
    expect(s.decisions.map((d) => d.title)).toEqual([
      'The front yard',
      'The fireplace wall',
      'The layout', // the small bath; the kitchen layout is decided
    ]);
    expect(s.purchases.map((p) => p.item.name)).toEqual([
      'Range',
      'Refrigerator, 36-inch',
      'Range hood',
      'Dishwasher',
      'Peninsula stools',
    ]);
    expect(s.unpriced).toBe(5);
  });

  it('drops an item once it is ordered, and adds up prices', () => {
    const book = createSeedBook();
    book.items['it-range'].status = 'ordered';
    book.items['it-fridge'].price = 2400;
    book.items['it-dishwasher'].price = 899.5;
    const s = collectStillToDecide(book);
    expect(s.purchases.map((p) => p.item.id)).not.toContain('it-range');
    expect(s.outstanding).toBe(3299.5);
    expect(s.unpriced).toBe(2);
  });
});

describe('typesetting', () => {
  it('curls quotes and apostrophes', () => {
    expect(typeset(`"It's ours," she said. 'Fine.'`)).toBe('“It’s ours,” she said. ‘Fine.’');
  });
  it('sets inches, feet and ranges', () => {
    expect(typeset(`a 36" fridge, 13' wide, 2-3 weeks`)).toBe('a 36″ fridge, 13′ wide, 2–3 weeks');
  });
  it('sets dashes and ellipses', () => {
    expect(typeset('wait -- or maybe... not')).toBe('wait – or maybe… not');
  });
  it('leaves tags alone and tracks quotes across them', () => {
    expect(typesetHtml('<p>"<em>Open</em>" plan</p><p>"Next"</p>')).toBe('<p>“<em>Open</em>” plan</p><p>“Next”</p>');
    expect(typesetHtml('<a href="https://x.com">it\'s</a>')).toBe('<a href="https://x.com">it’s</a>');
  });
  it('counts words', () => {
    expect(wordCount('<p>One two</p><blockquote><p>three</p></blockquote>')).toBe(3);
  });
});

describe('sanitizing', () => {
  it('keeps the small schema and drops the rest', () => {
    expect(sanitizeHtml('<p>Hi <b>there</b> <span style="x">you</span></p>')).toBe('<p>Hi <strong>there</strong> you</p>');
    expect(sanitizeHtml('<p><a href="javascript:alert(1)">x</a></p>')).toBe('<p>x</p>');
    expect(sanitizeHtml('<p><a href="https://example.com">x</a></p>')).toContain('href="https://example.com"');
    expect(sanitizeHtml('<script>bad()</script><p>ok</p>')).toBe('<p>ok</p>');
    expect(sanitizeHtml('loose <em>text</em><p>para</p>')).toBe('<p>loose <em>text</em></p><p>para</p>');
  });
  it('wraps loose text', () => {
    expect(sanitizeHtml('plain')).toBe('<p>plain</p>');
  });
  it('knows blank', () => {
    expect(isBlank('<p></p>')).toBe(true);
    expect(isBlank('<p>&nbsp;</p>')).toBe(true);
    expect(isBlank('<p>a</p>')).toBe(false);
  });
});

describe('gallery grid', async () => {
  const { galleryGrid } = await import('../templates/Gallery');
  it('puts a handful of options on the recto alone', () => {
    expect(galleryGrid(3)).toMatchObject({ verso: 0, recto: 3, cols: 3 });
    expect(galleryGrid(6)).toMatchObject({ verso: 0, recto: 6, cols: 3 });
  });
  it('fits thirty-two vanities on one spread in full verso rows', () => {
    const g = galleryGrid(32);
    expect(g.verso + g.recto).toBe(32);
    expect(g.verso % g.cols).toBe(0);
    expect(g.cols).toBeLessThanOrEqual(6);
  });
});
