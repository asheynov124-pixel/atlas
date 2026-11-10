import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatClock } from '../engine/format';
import { snoozeLengthMinutes } from '../engine/schedule';
import { finishRite, snoozeLive, useSnapshot } from '../store';
import type { Alarm } from '../types';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mathProblem(seed: number, difficulty: 1 | 2 | 3): { prompt: string; answer: number } {
  const rand = mulberry32(seed);
  if (difficulty === 1) {
    const left = 2 + Math.floor(rand() * 8);
    const right = 2 + Math.floor(rand() * 8);
    return { prompt: `${left} + ${right}`, answer: left + right };
  }
  if (difficulty === 2) {
    const left = 12 + Math.floor(rand() * 40);
    const right = 12 + Math.floor(rand() * 40);
    return { prompt: `${left} + ${right}`, answer: left + right };
  }
  const left = 3 + Math.floor(rand() * 7);
  const right = 3 + Math.floor(rand() * 7);
  return { prompt: `${left} × ${right}`, answer: left * right };
}

function sequenceFor(seed: number, difficulty: 1 | 2 | 3): number[] {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const length = difficulty + 2;
  const span = difficulty === 1 ? 3 : 4;
  return Array.from({ length }, () => 1 + Math.floor(rand() * span));
}

function instruction(kind: Alarm['rite']['kind']): string {
  if (kind === 'math') return 'Answer this to stop the alarm.';
  if (kind === 'sequence') return 'Repeat the sequence to stop the alarm.';
  if (kind === 'phrase') return 'Type the phrase to stop the alarm.';
  return 'Press I\'m up to stop the alarm.';
}

export function Ringing({ alarm }: { alarm: Alarm | null }) {
  const { persisted } = useSnapshot();
  const live = persisted.live;
  const dialog = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const [escNote, setEscNote] = useState(false);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [showSequence, setShowSequence] = useState(true);
  const errorId = useId();
  const noteId = useId();
  const titleId = useId();
  const open = live.phase === 'ringing' && alarm != null;
  const occurrenceAt = live.phase === 'idle' ? 0 : live.occurrenceAt;
  const difficulty = alarm?.rite.difficulty ?? 1;
  const problem = useMemo(() => mathProblem(occurrenceAt || 1, difficulty), [occurrenceAt, difficulty]);
  const sequence = useMemo(() => sequenceFor(occurrenceAt || 1, difficulty), [occurrenceAt, difficulty]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.setAttribute('closedby', 'none');
    if (open) {
      setEscNote(false);
      setError('');
      setEntry('');
      setPicked([]);
      setShowSequence(true);
      if (!node.open) node.showModal();
      return;
    }
    if (node.open) {
      closing.current = true;
      node.close('done');
    }
  }, [open, occurrenceAt]);

  useEffect(() => {
    if (!open || alarm?.rite.kind !== 'sequence') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => setShowSequence(false), 2200 + sequence.length * 500);
    return () => window.clearTimeout(timer);
  }, [open, alarm?.rite.kind, sequence.length, occurrenceAt]);

  const ringing = open && live.phase === 'ringing' && alarm ? live : null;

  return (
    <dialog
      ref={dialog}
      className="ring"
      data-palette={alarm?.paletteId ?? 'night'}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        setEscNote(true);
      }}
      onClose={() => {
        if (closing.current) {
          closing.current = false;
          return;
        }
        const node = dialog.current;
        if (node && open) {
          setEscNote(true);
          if (!node.open) node.showModal();
        }
      }}
    >
      {ringing && alarm ? (
        <>
          <p className="numeral-lg">{formatClock(ringing.occurrenceAt, persisted.prefs.hourCycle, false)}</p>
          <h2 id={titleId}>{alarm.label}</h2>
          <p>{instruction(alarm.rite.kind)}</p>
          {alarm.rite.kind === 'tap' ? (
            <button type="button" className="rite" autoFocus aria-describedby={escNote ? noteId : undefined} onClick={() => finishRite()}>
              I'm up
            </button>
          ) : null}
          {alarm.rite.kind === 'math' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (entry.trim() !== '' && Number(entry.trim()) === problem.answer) finishRite();
                else setError('That is not the answer. Try again.');
              }}
            >
              <div className="field">
                <label htmlFor="rite-answer">{problem.prompt}</label>
                <input
                  id="rite-answer"
                  value={entry}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? errorId : escNote ? noteId : undefined}
                  onChange={(event) => {
                    setEntry(event.target.value);
                    if (error) setError('');
                  }}
                />
              </div>
              <button type="submit" className="rite">
                Check answer
              </button>
            </form>
          ) : null}
          {alarm.rite.kind === 'phrase' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const expected = alarm.rite.phrase.trim().toLocaleLowerCase();
                if (expected && entry.trim().toLocaleLowerCase() === expected) finishRite();
                else setError('That phrase does not match. Try again.');
              }}
            >
              <div className="field">
                <label htmlFor="rite-phrase">Phrase</label>
                <input
                  id="rite-phrase"
                  value={entry}
                  autoFocus
                  autoComplete="off"
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? errorId : escNote ? noteId : undefined}
                  onChange={(event) => {
                    setEntry(event.target.value);
                    if (error) setError('');
                  }}
                />
              </div>
              <button type="submit" className="rite">
                Stop the alarm
              </button>
            </form>
          ) : null}
          {alarm.rite.kind === 'sequence' ? (
            <div>
              {showSequence ? (
                <>
                  <p className="numeral-sm">{sequence.join(' ')}</p>
                  <button type="button" autoFocus onClick={() => setShowSequence(false)}>
                    I have it
                  </button>
                </>
              ) : (
                <>
                  <p id="seq-label">Repeat the sequence.</p>
                  <div className="seq" role="group" aria-labelledby="seq-label">
                    {Array.from(new Set(sequence))
                      .sort((a, b) => a - b)
                      .map((digit) => (
                        <button
                          key={digit}
                          type="button"
                          onClick={() => {
                            const next = [...picked, digit];
                            setPicked(next);
                            if (next.length < sequence.length) return;
                            if (next.every((value, index) => value === sequence[index])) finishRite();
                            else {
                              setPicked([]);
                              setShowSequence(true);
                              setError('That sequence does not match. Watch it again.');
                            }
                          }}
                        >
                          {digit}
                        </button>
                      ))}
                  </div>
                  <p className="numeral-sm">{picked.join(' ') || '…'}</p>
                </>
              )}
            </div>
          ) : null}
          <p id={errorId} className="error" aria-live="polite">
            {error}
          </p>
          <p id={noteId} className="esc-note" style={{ visibility: escNote ? 'visible' : 'hidden' }}>
            Escape does not dismiss this alarm. Finish the rite, or snooze if any are left.
          </p>
          {alarm.snooze.enabled ? (
            <button
              type="button"
              disabled={alarm.snooze.max - ringing.snoozesUsed <= 0}
              onClick={() => snoozeLive()}
            >
              {alarm.snooze.max - ringing.snoozesUsed <= 0
                ? 'Snooze, none left'
                : `Snooze ${snoozeLengthMinutes(alarm.snooze.minutes, alarm.snooze.escalate, ringing.snoozesUsed)} min, ${alarm.snooze.max - ringing.snoozesUsed} left`}
            </button>
          ) : (
            <p>Snooze is off for this alarm.</p>
          )}
        </>
      ) : (
        <h2 id={titleId} className="visually-hidden">
          Alarm
        </h2>
      )}
    </dialog>
  );
}
