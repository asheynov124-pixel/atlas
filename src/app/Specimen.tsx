import { Placeholder } from '@/reader/Placeholder';
import { useBookStore } from '@/state/bookStore';
import styles from './Specimen.module.css';

const COLORS: Array<[string, string]> = [
  ['paper', 'Paper'],
  ['ink', 'Ink'],
  ['muted', 'Muted ink'],
  ['sage', 'Sage (the siding)'],
  ['olive', 'Olive (the shutters)'],
  ['oak', 'Oak'],
  ['clay', 'Clay'],
  ['hairline', 'Hairline'],
];

export function Specimen() {
  const book = useBookStore((s) => s.book);
  return (
    <div className={['paper', styles.root].join(' ')}>
      <header>
        <p className="t-label">Type specimen · {book.title}</p>
        <h1 className="t-display" style={{ fontSize: 'clamp(48px, 7vw, 96px)', marginTop: 12 }}>
          Sixteen Bannehr
        </h1>
        <p style={{ fontStyle: 'italic', fontSize: 22, marginTop: 8 }}>A book about a house, in progress.</p>
      </header>

      <section className={styles.section}>
        <p className="t-label">Display · Instrument Serif</p>
        <div className={styles.row}>
          <span className="t-label">Numeral</span>
          <span className="t-display" style={{ fontSize: 160, lineHeight: 0.85 }}>3</span>
        </div>
        <div className={styles.row}>
          <span className="t-label">Title</span>
          <span className="t-display" style={{ fontSize: 56 }}>A Cook’s Kitchen</span>
        </div>
        <div className={styles.row}>
          <span className="t-label">Pull quote</span>
          <span className="t-display" style={{ fontSize: 36, fontStyle: 'italic', hangingPunctuation: 'first' }}>
            “We opened the ceiling and the room took a breath.”
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <p className="t-label">Text · Newsreader</p>
        <div className={['t-body', 't-dropcap', styles.sampleBody].join(' ')} style={{ fontSize: 18 }}>
          <p>
            It was a sage-green bi-level on a gentle rise, brick below, shutters the colour of olives, three old oaks leaning
            over the lawn. There was a blue tarp on one side and a pile of debris at the curb. We bought it anyway, or maybe
            because.
          </p>
          <p>
            By October the front of the house was open to the rafters. This book is the record of what we are making of it:
            the walls we took down, the tile we argued about, the vanity we looked at thirty-two different ways. Ranges: 60–72″,
            2026–27. <em>Italic</em>, <strong>bold</strong>, and a <a href="#/">link</a>.
          </p>
        </div>
        <p className="t-caption">
          <span className="fig">Fig. 3.4</span>The peninsula, looking toward the dining room.
        </p>
      </section>

      <section className={styles.section}>
        <p className="t-label">Labels · Inter, small caps, tracked</p>
        <div className={styles.row}>
          <span className="t-label">Running head</span>
          <span className="t-label">Chapter Three · A Cook’s Kitchen</span>
        </div>
        <div className={styles.row}>
          <span className="t-label">Marginalia · Caveat</span>
          <span className="t-hand" style={{ color: 'var(--clay)' }}>Blackout, but pretty. — Sonny</span>
        </div>
      </section>

      <section className={styles.section}>
        <p className="t-label">Colour, taken from the house</p>
        <div className={styles.swatches}>
          {COLORS.map(([k, name]) => (
            <div className={styles.swatch} key={k}>
              <div style={{ background: `var(--${k})` }} />
              <span className="t-label">{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className="t-label">Placeholder plates</p>
        <div className={[styles.plates, 'accent-oak'].join(' ')}>
          <Placeholder label="Kitchen — render, peninsula view" fig="3.1" />
          <Placeholder label="Kitchen — the sink under the window" fig="3.2" size="small" accent="var(--sage)" />
        </div>
      </section>
    </div>
  );
}
