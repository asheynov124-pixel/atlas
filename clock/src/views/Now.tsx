import { FACES, PALETTES } from '../catalog';
import { formatClock } from '../engine/format';
import { dayMarks, nextCopy } from '../engine/present';
import { readNotify, requestNotify } from '../runtime/notify';
import { go } from '../router';
import { dismissFirstRun, dismissMiss, setPrefs, setRuntime, useSnapshot } from '../store';
import { DayRibbon, Face } from '../ui/chrome';

export function Now({ leg }: { leg: { startMin: number; endMin: number } | null }) {
  const { persisted, now, runtime } = useSnapshot();
  const { prefs } = persisted;
  const marks = dayMarks(persisted, now);
  const text = formatClock(now, prefs.hourCycle, prefs.showSeconds);
  const wakeNote =
    runtime.wake === 'unsupported'
      ? 'This browser will not keep the screen awake. Bedside mode still dims the page.'
      : runtime.wake === 'denied'
        ? 'The screen may sleep. Bedside mode is on, but the browser refused the wake lock.'
        : '';

  return (
    <>
      <Face face={prefs.homeFaceId} text={text} now={now} showSeconds={prefs.showSeconds} marks={marks} />
      <p className="next">{nextCopy(persisted, now)}</p>
      <DayRibbon marks={marks} now={now} leg={leg} />
      <div className="actions">
        <button type="button" className="primary" onClick={() => go('/alarms/new')}>
          Add alarm
        </button>
        <button type="button" onClick={() => go('/timer')}>
          Start a timer
        </button>
      </div>
      {persisted.miss ? (
        <section className="notice" aria-labelledby="miss-title">
          <h2 id="miss-title">Missed</h2>
          <p>
            {persisted.miss.labels.join(' and ')} did not ring. The tab was away for more than two minutes.
          </p>
          <button type="button" onClick={() => dismissMiss()}>
            Dismiss
          </button>
        </section>
      ) : null}
      {!prefs.firstRunSeen ? (
        <section className="notice" aria-labelledby="first-title">
          <h2 id="first-title">While this tab is open</h2>
          <p>Prelude rings only while this tab stays open. Quitting the browser will not wake you.</p>
          {runtime.notify === 'unsupported' ? (
            <p>This browser has no notifications. The alarm still rings while the tab is open.</p>
          ) : null}
          {runtime.notify === 'denied' ? (
            <p>Notifications are blocked. The alarm still rings in this tab. Allow them in the browser’s site settings if you want a banner too.</p>
          ) : null}
          <div className="actions">
            {runtime.notify === 'unknown' ? (
              <button
                type="button"
                onClick={() => {
                  void requestNotify().then((notify) => setRuntime({ notify }));
                }}
              >
                Allow notifications
              </button>
            ) : null}
            <button type="button" className="primary" onClick={() => dismissFirstRun()}>
              Got it
            </button>
          </div>
        </section>
      ) : null}
      <form aria-labelledby="home-settings" onSubmit={(event) => event.preventDefault()}>
        <h2 id="home-settings">Home</h2>
        <fieldset>
          <legend>Face</legend>
          {FACES.map((face) => (
            <label key={face.id}>
              <input
                type="radio"
                name="face"
                checked={prefs.homeFaceId === face.id}
                onChange={() => setPrefs({ homeFaceId: face.id })}
              />
              {face.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Palette</legend>
          {PALETTES.map((palette) => (
            <label key={palette.id}>
              <input
                type="radio"
                name="palette"
                checked={prefs.homePaletteId === palette.id}
                onChange={() => setPrefs({ homePaletteId: palette.id })}
              />
              {palette.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Hours</legend>
          <label>
            <input type="radio" name="cycle" checked={prefs.hourCycle === '12'} onChange={() => setPrefs({ hourCycle: '12' })} />
            12-hour
          </label>
          <label>
            <input type="radio" name="cycle" checked={prefs.hourCycle === '24'} onChange={() => setPrefs({ hourCycle: '24' })} />
            24-hour
          </label>
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={prefs.showSeconds} onChange={(event) => setPrefs({ showSeconds: event.target.checked })} />
          Show seconds
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.bedside}
            onChange={(event) => {
              setPrefs({ bedside: event.target.checked });
              setRuntime({ notify: readNotify() });
            }}
          />
          Bedside
        </label>
        {prefs.bedside && wakeNote ? <p>{wakeNote}</p> : null}
      </form>
    </>
  );
}
