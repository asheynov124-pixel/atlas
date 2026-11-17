import '../styles/specimen.css';
import { useBook } from '../store/book';
import { hrefFor } from '../store/nav';
import type { ThemeColors } from '../model/types';

const ROLES: Record<keyof ThemeColors, string> = {
  paper: 'Paper',
  ink: 'Ink',
  muted: 'Muted ink',
  sage: 'Sage — the siding',
  olive: 'Olive — the shutters',
  oak: 'Oak',
  clay: 'Clay — accent',
  hairline: 'Hairline',
};

/** The type specimen: every face, size and colour the book uses, on one sheet. */
export default function Specimen() {
  const book = useBook();
  const tones = Array.from(new Map(book.chapters.map((c) => [c.tone, c.title])).entries());
  return (
    <main className="specimen">
      <header className="specimen__head">
        <p className="sc specimen__kicker">Sixteen Bannehr · Specimen</p>
        <h1 className="specimen__title">The type and colour of the book</h1>
        <a className="sc specimen__back" href={hrefFor(book.chapters[0].spreads[0].id)}>
          ← Back to the book
        </a>
      </header>

      <section className="specimen__row" aria-labelledby="sp-display">
        <h2 id="sp-display" className="sc specimen__label">Display · Instrument Serif</h2>
        <p className="specimen__display">A Cook’s Kitchen</p>
        <p className="specimen__display specimen__display--italic">Seventy-two inches of tub</p>
        <p className="specimen__numerals" aria-label="Chapter numerals one to nine">
          1 2 3 4 5 6 7 8 9
        </p>
      </section>

      <section className="specimen__row specimen__row--split" aria-labelledby="sp-text">
        <h2 id="sp-text" className="sc specimen__label">Text · Newsreader, optical sizes</h2>
        <div>
          <p className="specimen__lead dropcap-demo">
            The kitchen keeps its own room, with a wide opening to the dining room and a peninsula with stools, so
            whoever is cooking faces whoever is talking.
          </p>
          <p className="specimen__body">
            The sink sits under the window; the range and a 36-inch fridge share the long wall. Thirteen feet by
            thirteen and a half — 13′ × 13′6″ — and every inch argued over. Figures sit in the line:{' '}
            <span className="oldstyle">1926, 2026, 36, 72</span>; tables use lining figures:{' '}
            <span style={{ fontVariantNumeric: 'lining-nums tabular-nums' }}>1926, 2026, 36, 72</span>.
          </p>
          <p className="specimen__caption">
            <span className="sc">Fig. 3.4</span> The peninsula, looking toward the dining room. Captions are set small,
            in the text face.
          </p>
        </div>
        <blockquote className="pull specimen__pull">
          <p>It is not finished. Neither is the house. That is the point of both.</p>
        </blockquote>
      </section>

      <section className="specimen__row" aria-labelledby="sp-labels">
        <h2 id="sp-labels" className="sc specimen__label">Labels · Inter, uppercase, tracked +6 %</h2>
        <p className="specimen__labels">
          <span className="sc">Chapter Three</span>
          <span className="sc">Kitchen — render, peninsula view</span>
          <span className="sc">Thinking · Decided · Ordered · Installed</span>
        </p>
      </section>

      <section className="specimen__row" aria-labelledby="sp-hand">
        <h2 id="sp-hand" className="sc specimen__label">Marginalia · Caveat</h2>
        <div className="specimen__notes">
          <p className="specimen__note" data-author="adi">
            Counter height or bar height? <span>— A.</span>
          </p>
          <p className="specimen__note" data-author="sonny">
            Bar height. Trust me. <span>— S.</span>
          </p>
        </div>
      </section>

      <section className="specimen__row" aria-labelledby="sp-colour">
        <h2 id="sp-colour" className="sc specimen__label">Colour, taken from the house</h2>
        <ul className="specimen__swatches">
          {(Object.keys(ROLES) as (keyof ThemeColors)[]).map((k) => (
            <li key={k}>
              <span className="specimen__chip" style={{ background: book.theme.day[k] }} />
              <span className="specimen__chip specimen__chip--night" style={{ background: book.theme.night[k] }} />
              <span className="specimen__swatch-name">{ROLES[k]}</span>
              <span className="sc specimen__hex">
                {book.theme.day[k]} · {book.theme.night[k]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="specimen__row" aria-labelledby="sp-ph">
        <h2 id="sp-ph" className="sc specimen__label">Placeholders, in each chapter’s tone</h2>
        <ul className="specimen__phs">
          {tones.map(([tone, title]) => (
            <li key={tone}>
              <div className="specimen__ph ph" style={{ ['--tone' as string]: tone }} role="img" aria-label={`Placeholder in the tone of ${title}`}>
                <span className="ph__slip ph__slip--tl" aria-hidden="true">
                  {title}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
