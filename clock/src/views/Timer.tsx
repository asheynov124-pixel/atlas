import { useState } from 'react';
import { formatDuration } from '../engine/format';
import { napSuggestion, nextAlarmAt } from '../engine/schedule';
import { addTimer, patchTimer, pauseTimer, removeTimer, resetTimer, startTimer, useSnapshot } from '../store';
import type { Timer as TimerItem } from '../types';

const PRESETS = [1, 3, 5, 10, 15, 25, 45];

function remaining(timer: TimerItem, now: number): number {
  if (timer.status === 'running' && timer.endsAt != null) return Math.max(0, timer.endsAt - now);
  return timer.remainingMs;
}

export function Timer() {
  const { persisted, now } = useSnapshot();
  const [custom, setCustom] = useState('20');
  const [label, setLabel] = useState('Timer');
  const [guard, setGuard] = useState<{ id: string; suggestedMs: number | null; name: string } | null>(null);
  const next = nextAlarmAt(persisted.alarms, now);

  function begin(id: string, durationMs?: number) {
    const timer = persisted.timers.find((item) => item.id === id);
    if (!timer) return;
    const duration = durationMs ?? (timer.remainingMs > 0 ? timer.remainingMs : timer.durationMs);
    const suggestion = napSuggestion(duration, Date.now(), next?.at ?? null);
    if (suggestion.overlaps) {
      setGuard({ id, suggestedMs: suggestion.suggestedMs, name: next?.alarm.label ?? 'the alarm' });
      return;
    }
    if (durationMs) patchTimer(id, { durationMs, remainingMs: durationMs, status: 'idle', endsAt: null });
    startTimer(id);
  }

  function create(minutes: number) {
    const id = addTimer(label.trim() || 'Timer', minutes * 60_000);
    const suggestion = napSuggestion(minutes * 60_000, Date.now(), next?.at ?? null);
    if (suggestion.overlaps) {
      setGuard({ id, suggestedMs: suggestion.suggestedMs, name: next?.alarm.label ?? 'the alarm' });
      return;
    }
    startTimer(id);
  }

  return (
    <>
      <h1>Timer</h1>
      <form
        aria-labelledby="timer-new"
        onSubmit={(event) => {
          event.preventDefault();
          const minutes = Number(custom);
          if (!Number.isFinite(minutes) || minutes <= 0) return;
          create(Math.min(240, minutes));
        }}
      >
        <h2 id="timer-new">New timer</h2>
        <div className="field">
          <label htmlFor="timer-label">Name</label>
          <input id="timer-label" value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div className="actions" role="group" aria-label="Presets">
          {PRESETS.map((minutes) => (
            <button key={minutes} type="button" onClick={() => create(minutes)}>
              {minutes} min
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="timer-custom">Custom minutes</label>
          <input id="timer-custom" inputMode="numeric" value={custom} onChange={(event) => setCustom(event.target.value)} />
        </div>
        <button type="submit" className="primary">
          Start custom
        </button>
      </form>
      {guard ? (
        <section className="notice" aria-labelledby="nap-title">
          <h2 id="nap-title">This runs into {guard.name}</h2>
          <p>
            {guard.suggestedMs
              ? `End 15 minutes before it (${formatDuration(guard.suggestedMs)}).`
              : `${guard.name} is too close for a 15-minute gap.`}
          </p>
          <div className="actions">
            {guard.suggestedMs ? (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  patchTimer(guard.id, {
                    durationMs: guard.suggestedMs ?? 0,
                    remainingMs: guard.suggestedMs ?? 0,
                    status: 'idle',
                    endsAt: null,
                  });
                  startTimer(guard.id, Date.now());
                  setGuard(null);
                }}
              >
                End before it
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                startTimer(guard.id, Date.now());
                setGuard(null);
              }}
            >
              Start anyway
            </button>
          </div>
        </section>
      ) : null}
      {persisted.timers.length === 0 ? (
        <p>No timers. Start one and it will sit on the day ribbon.</p>
      ) : (
        <ul className="rows">
          {persisted.timers.map((timer) => (
            <li key={timer.id}>
              <div>
                <p className="numeral-md">{formatDuration(remaining(timer, now))}</p>
                <p>
                  {timer.label} · {timer.status}
                </p>
                <div className="field">
                  <label htmlFor={`chain-${timer.id}`}>When this ends</label>
                  <select
                    id={`chain-${timer.id}`}
                    value={timer.chainNextId ?? ''}
                    onChange={(event) => patchTimer(timer.id, { chainNextId: event.target.value || null })}
                  >
                    <option value="">Stop</option>
                    {persisted.timers
                      .filter((item) => item.id !== timer.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          Start {item.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="actions">
                {timer.status === 'running' ? (
                  <button type="button" onClick={() => pauseTimer(timer.id)}>
                    Pause
                  </button>
                ) : (
                  <button type="button" onClick={() => begin(timer.id)}>
                    {timer.status === 'done' ? 'Start again' : 'Start'}
                  </button>
                )}
                <button type="button" onClick={() => resetTimer(timer.id)}>
                  Reset
                </button>
                <button type="button" onClick={() => removeTimer(timer.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
