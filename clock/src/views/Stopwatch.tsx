import { formatElapsed } from '../engine/format';
import { stopwatchElapsed, swClear, swKeep, swLap, swName, swToggle, useSnapshot } from '../store';

export function Stopwatch() {
  const { persisted, now } = useSnapshot();
  const sw = persisted.stopwatch;
  const elapsed = stopwatchElapsed(sw, now);
  return (
    <>
      <h1>Stopwatch</h1>
      <p className="numeral-md">{formatElapsed(elapsed)}</p>
      <form aria-labelledby="sw-name-label" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label id="sw-name-label" htmlFor="sw-name">
            Session name
          </label>
          <input id="sw-name" value={sw.name} onChange={(event) => swName(event.target.value)} />
        </div>
      </form>
      <div className="actions">
        <button type="button" className="primary" onClick={() => swToggle(now)}>
          {sw.running ? 'Stop' : 'Start'}
        </button>
        <button type="button" onClick={() => swLap(now)} disabled={!sw.running}>
          Lap
        </button>
        <button type="button" onClick={() => swKeep(now)} disabled={sw.running || elapsed <= 0}>
          Keep session
        </button>
        <button type="button" onClick={() => swClear()} disabled={sw.running || elapsed <= 0}>
          Clear
        </button>
      </div>
      {sw.laps.length > 0 ? (
        <ol className="rows">
          {sw.laps.map((lap, index) => {
            const previous = index === 0 ? 0 : sw.laps[index - 1].elapsedMs;
            return (
              <li key={`${lap.elapsedMs}-${index}`}>
                <span>Lap {index + 1}</span>
                <span className="status">
                  {formatElapsed(lap.elapsedMs)} · +{formatElapsed(lap.elapsedMs - previous)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <h2>Kept sessions</h2>
      {persisted.sessions.length === 0 ? (
        <p>Kept sessions appear here.</p>
      ) : (
        <ul className="rows">
          {persisted.sessions.map((session) => (
            <li key={session.id}>
              <span>{session.name}</span>
              <span className="status">
                {formatElapsed(session.elapsedMs)} · {session.laps.length} laps
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
