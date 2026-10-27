import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Spread } from './Spread';
import { useNav } from '../store/nav';
import { useMode } from '../store/prefs';
import type { Placed } from '../model/pages';

interface Turn {
  from: Placed;
  to: Placed;
  dir: 1 | -1;
  key: number;
}

const DURATION = 0.65;
const EASE = [0.5, 0.02, 0.2, 1] as const;
const FADE_EASE = [0.22, 0.61, 0.36, 1] as const;

/** Half of a spread, cut out of a full rendering so full-bleed images stay continuous. */
function Half({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  return (
    <div className={`half half--${side}`}>
      <div className="half__inner">{children}</div>
    </div>
  );
}

/**
 * Desktop reading: one spread at a time, turned with a leaf slide. The right-hand page
 * lifts and slides across the spine, turning from its front to its back as it goes, while
 * the next spread is revealed beneath it. Only transform and opacity animate.
 */
export function SpreadStage({ current, onTurn }: { current: Placed; onTurn: (d: 1 | -1) => void }) {
  const dir = useNav((s) => s.dir);
  const editing = useMode((s) => s.editing);
  const reduce = useReducedMotion();
  const [turn, setTurn] = useState<Turn | null>(null);
  // Bumped on a jump (contents, reload) so the new spread fades in; a turn keeps it.
  const [jumpKey, setJumpKey] = useState(0);
  const prev = useRef<Placed>(current);
  const counter = useRef(0);

  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = current;
    if (from.spread.id === current.spread.id) return;
    const adjacent = Math.abs(from.index - current.index) === 1;
    if (dir !== 0 && adjacent && !reduce) {
      setTurn({ from, to: current, dir, key: ++counter.current });
    } else {
      setTurn(null);
      setJumpKey((k) => k + 1);
    }
  }, [current, dir, reduce]);

  // Swipe to turn, on touch screens big enough for spreads (iPad landscape).
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  const closed = current.isCover;
  const opening = turn && turn.dir === 1 && turn.from.isCover;

  return (
    <main className="stage" aria-label="The book" aria-roledescription="book">
      <div
        className="sheet"
        data-closed={closed || undefined}
        data-turning={turn ? (opening ? 'open' : 'turn') : undefined}
        onPointerDown={(e) => {
          if (editing || e.pointerType === 'mouse') return;
          swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) onTurn(dx < 0 ? 1 : -1);
        }}
      >
        <motion.div
          key={jumpKey}
          className={['stage__base', opening && 'stage__base--opening'].filter(Boolean).join(' ')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0.15 : 0.32, ease: FADE_EASE }}
        >
          <Spread placed={current} layout="spread" active />
        </motion.div>

        {turn ? (
          <TurnLayers
            key={turn.key}
            turn={turn}
            onDone={() => setTurn((t) => (t && t.key === turn.key ? null : t))}
          />
        ) : null}

        {!editing ? (
          <>
            {current.index > 0 ? (
              <button className="turn-zone turn-zone--prev" onClick={() => onTurn(-1)} aria-label="Previous pages" tabIndex={-1} />
            ) : null}
            <button className="turn-zone turn-zone--next" onClick={() => onTurn(1)} aria-label="Next pages" tabIndex={-1} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function TurnLayers({ turn, onDone }: { turn: Turn; onDone: () => void }) {
  const { from, to, dir } = turn;
  const forward = dir === 1;
  // The half of the old spread that stays put until the leaf covers it.
  const stay: 'left' | 'right' = forward ? 'left' : 'right';
  const frontSide: 'left' | 'right' = forward ? 'right' : 'left';
  const backSide: 'left' | 'right' = forward ? 'left' : 'right';
  const t = { duration: DURATION, ease: EASE };
  const fade = { duration: DURATION, ease: 'linear' as const, times: [0, 0.44, 0.56, 1] };

  return (
    <div className="turn" aria-hidden="true">
      {!(forward && from.isCover) ? (
        <div className={`turn__stay turn__stay--${stay}`}>
          <Half side={stay}>
            <Spread placed={from} layout="spread" decorative />
          </Half>
          <motion.div
            className={`turn__dim turn__dim--${stay}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 1] }}
            transition={{ duration: DURATION, times: [0, 0.7, 1], ease: 'easeIn' }}
          />
        </div>
      ) : null}

      <motion.div
        className={`leaf leaf--${forward ? 'fwd' : 'back'}`}
        initial={{ x: forward ? '100%' : '0%', scaleX: 1 }}
        animate={{ x: forward ? '0%' : '100%', scaleX: [1, 0.955, 1] }}
        transition={{ x: t, scaleX: { duration: DURATION, ease: 'easeInOut' } }}
        onAnimationComplete={onDone}
      >
        <motion.div className="leaf__cast" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: DURATION, times: [0, 0.5, 1] }} />
        <motion.div className="leaf__face" initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0, 0] }} transition={fade}>
          <Half side={frontSide}>
            <Spread placed={from} layout="spread" decorative />
          </Half>
        </motion.div>
        <motion.div className="leaf__face" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 1] }} transition={fade}>
          <Half side={backSide}>
            <Spread placed={to} layout="spread" decorative />
          </Half>
        </motion.div>
        <motion.div className="leaf__sheen" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} transition={{ duration: DURATION, times: [0, 0.45, 1] }} />
      </motion.div>
    </div>
  );
}
