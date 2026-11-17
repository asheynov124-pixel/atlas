import { alarmStatus, dayMarks } from '../engine/present';
import { go } from '../router';
import { toggleAlarm, toggleScene, useSnapshot } from '../store';
import { DayRibbon, Link } from '../ui/chrome';

export function Alarms({ leg }: { leg: { startMin: number; endMin: number } | null }) {
  const { persisted, now } = useSnapshot();
  const marks = dayMarks(persisted, now).filter((mark) => mark.kind === 'alarm');
  return (
    <>
      <h1>Alarms</h1>
      <DayRibbon marks={dayMarks(persisted, now)} now={now} leg={leg} />
      <div className="actions" role="group" aria-label="Scenes">
        {persisted.scenes.map((scene) => {
          const members = persisted.alarms.filter((alarm) => scene.alarmIds.includes(alarm.id));
          const on = members.length > 0 && members.every((alarm) => alarm.enabled);
          return (
            <button
              key={scene.id}
              type="button"
              aria-pressed={on}
              disabled={members.length === 0}
              onClick={() => toggleScene(scene.id, !on)}
            >
              {scene.name}
            </button>
          );
        })}
      </div>
      {persisted.alarms.length === 0 ? (
        <p>No alarms yet.</p>
      ) : (
        <ul className="rows">
          {persisted.alarms.map((alarm) => (
            <li key={alarm.id}>
              <div>
                <Link to={`/alarms/${alarm.id}`}>{alarm.label}</Link>
                <p>{alarmStatus(alarm)}</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={alarm.enabled}
                  onChange={(event) => toggleAlarm(alarm.id, event.target.checked)}
                />
                {alarm.enabled ? 'On' : 'Off'}
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="actions">
        <button type="button" className="primary" onClick={() => go('/alarms/new')}>
          Add alarm
        </button>
      </p>
      {marks.length === 0 ? <p>Nothing on the ribbon is an alarm until you turn one on.</p> : null}
    </>
  );
}
