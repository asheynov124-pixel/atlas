import { useEffect, useRef, useState } from 'react';
import { formatClock } from './engine/format';
import { dayMarks } from './engine/present';
import { useRoute } from './router';
import { score } from './runtime/audio';
import { postNotice } from './runtime/notify';
import { setWakeLock } from './runtime/wake';
import { setPrefs, setRuntime, useSnapshot } from './store';
import { Shell } from './ui/chrome';
import { Ringing } from './ui/ringing';
import { Alarms } from './views/Alarms';
import { Editor } from './views/Editor';
import { Now } from './views/Now';
import { Sleep } from './views/Sleep';
import { Stopwatch } from './views/Stopwatch';
import { Timer } from './views/Timer';
import { World } from './views/World';

function riseFor(phase: string, preludeMinutes: number, occurrenceAt: number, now: number): number {
  if (phase === 'ringing') return 1;
  if (phase !== 'prelude') return 0;
  const span = preludeMinutes * 60_000;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - (occurrenceAt - span)) / span));
}

export function App() {
  const route = useRoute();
  const { persisted, now } = useSnapshot();
  const notified = useRef('');
  const [announcement, setAnnouncement] = useState('');
  const live = persisted.live;
  const liveAlarm = live.phase === 'idle' ? undefined : persisted.alarms.find((alarm) => alarm.id === live.alarmId);
  const rise = riseFor(
    live.phase,
    liveAlarm?.preludeMinutes ?? 0,
    live.phase === 'idle' ? 0 : live.occurrenceAt,
    now,
  );
  const leg =
    live.phase !== 'idle' && liveAlarm
      ? (() => {
          const end = new Date(live.occurrenceAt);
          const today = new Date(now);
          if (end.toDateString() !== today.toDateString()) return null;
          const endMin = end.getHours() * 60 + end.getMinutes();
          return { startMin: Math.max(0, endMin - liveAlarm.preludeMinutes), endMin };
        })()
      : null;

  useEffect(() => {
    const want = persisted.prefs.bedside || live.phase === 'prelude' || live.phase === 'ringing' || live.phase === 'snoozed';
    void setWakeLock(want).then((wake) => setRuntime({ wake }));
  }, [persisted.prefs.bedside, live.phase]);

  useEffect(() => {
    if ((live.phase === 'ringing' || live.phase === 'prelude') && liveAlarm) {
      if (live.phase === 'ringing') {
        score.ring(liveAlarm.soundId, liveAlarm.volume);
        const key = `${liveAlarm.id}:${live.occurrenceAt}:${live.snoozesUsed}`;
        if (notified.current !== key) {
          notified.current = key;
          postNotice('Prelude', `${liveAlarm.label} is ringing.`, 'prelude-alarm');
          setAnnouncement(
            `${liveAlarm.label}, ${formatClock(live.occurrenceAt, persisted.prefs.hourCycle, false)}. The alarm is ringing.`,
          );
        }
      } else {
        score.prelude(liveAlarm.soundId, liveAlarm.volume);
      }
      return;
    }
    score.releaseAlarm();
  }, [live, liveAlarm, persisted.prefs.hourCycle]);

  useEffect(() => {
    if (live.phase !== 'prelude' || !liveAlarm) return;
    const span = liveAlarm.preludeMinutes * 60_000;
    const level = span <= 0 ? liveAlarm.volume : liveAlarm.volume * rise;
    score.setLevel(level);
  }, [live.phase, liveAlarm, rise]);

  const marks = dayMarks(persisted, now);

  return (
    <>
      <Shell
        route={route.name}
        rise={rise}
        bedside={persisted.prefs.bedside}
        onLeave={() => setPrefs({ bedside: false })}
        aside={
          <>
            <h2>On this day</h2>
            {marks.length === 0 ? (
              <p>Nothing else is marked today.</p>
            ) : (
              <ul>
                {marks.map((mark) => (
                  <li key={mark.id}>
                    <span className="name">{mark.name}</span>
                    <span className="status">{mark.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        }
      >
        {route.name === 'now' ? <Now leg={leg} /> : null}
        {route.name === 'alarms' ? <Alarms leg={leg} /> : null}
        {route.name === 'alarm' ? <Editor id={route.id} /> : null}
        {route.name === 'sleep' ? <Sleep /> : null}
        {route.name === 'timer' ? <Timer /> : null}
        {route.name === 'stopwatch' ? <Stopwatch /> : null}
        {route.name === 'world' ? <World /> : null}
      </Shell>
      <Ringing alarm={live.phase === 'ringing' ? liveAlarm ?? null : null} />
      <div className="visually-hidden" aria-live="assertive">
        {announcement}
      </div>
    </>
  );
}
