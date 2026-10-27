/** First-run gesture guide plus one-off contextual tips. */
import { useEffect, useState } from 'react';
import { useStore, activeData } from '../../state/store';
import { useUI } from '../../state/ui';

const GESTURES = [
  { icon: '→', label: 'Swipe right', does: 'Like', tone: 'like' },
  { icon: '←', label: 'Swipe left', does: 'Pass', tone: 'dislike' },
  { icon: '↑', label: 'Swipe up', does: 'Save', tone: 'save' },
  { icon: '↓', label: 'Swipe down', does: 'Aspect Capture', tone: 'capture' },
  { icon: '⇅', label: 'Edge swipe or two fingers ↑↓', does: 'Next / previous clip', tone: '' },
  { icon: '⇆', label: 'Edge swipe or two fingers ←→', does: 'Switch path', tone: '' },
  { icon: '◉', label: 'Long-press', does: 'Full menu', tone: '' },
  { icon: '♥', label: 'Double-tap', does: 'Like without moving on', tone: 'like' },
];

const CLASSIC = [
  { icon: '↑', label: 'Swipe up', does: 'Next clip', tone: '' },
  { icon: '↓', label: 'Swipe down', does: 'Previous clip', tone: '' },
];

const TIPS: { key: string; when: (n: number) => boolean; text: string }[] = [
  { key: 'tip-capture', when: (n) => n >= 4, text: 'Tip: swipe down on a clip and circle what you like — it becomes its own path.' },
  { key: 'tip-paths', when: (n) => n >= 9, text: 'Tip: swipe from the screen edge (or with two fingers) to hop between paths.' },
  { key: 'tip-menu', when: (n) => n >= 15, text: 'Tip: long-press for “More like this”, blocks, and “Why am I seeing this?”.' },
];

/** `quiet` suppresses contextual tips (e.g. over the end-of-path card or during capture). */
export function CoachMarks({ quiet = false }: { quiet?: boolean }) {
  const seen = useStore((s) => s.hints.gestures);
  const hints = useStore((s) => s.hints);
  const markHint = useStore((s) => s.markHint);
  const scheme = useStore((s) => s.settings.gestureScheme);
  const views = useStore((s) => activeData(s).history.length);
  const tab = useUI((s) => s.tab);
  const [tip, setTip] = useState<(typeof TIPS)[number] | null>(null);

  useEffect(() => {
    if (!seen || tab !== 'feed' || tip || quiet) return;
    const t = TIPS.find((x) => !hints[x.key] && x.when(views));
    if (!t) return;
    setTip(t);
    markHint(t.key);
  }, [views, seen, hints, tab, tip, markHint, quiet]);

  useEffect(() => {
    if (!tip) return;
    const timer = setTimeout(() => setTip(null), 6000);
    return () => clearTimeout(timer);
  }, [tip]);

  if (!seen) {
    const list = scheme === 'classic' ? [...GESTURES.slice(0, 2), ...CLASSIC, ...GESTURES.slice(4)] : GESTURES;
    return (
      <div className="coach" data-no-gesture role="dialog" aria-label="How to use the feed">
        <div className="coach__card">
          <h2>Swipe to teach it your taste</h2>
          <p>Every gesture is a signal. Buttons on the right do the same things.</p>
          <ul className="coach__list">
            {list.map((g) => (
              <li key={g.label} className={g.tone ? `coach__item coach__item--${g.tone}` : 'coach__item'}>
                <span className="coach__icon">{g.icon}</span>
                <span className="coach__label">{g.label}</span>
                <span className="coach__does">{g.does}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn--primary btn--block" onClick={() => markHint('gestures')}>
            Start swiping
          </button>
        </div>
      </div>
    );
  }
  if (!tip || quiet) return null;
  return (
    <div className="tip" role="status" data-no-gesture onClick={() => setTip(null)}>
      {tip.text}
    </div>
  );
}
