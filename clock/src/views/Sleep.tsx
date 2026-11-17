import { formatClock, formatDistance } from '../engine/format';
import { clockOf, wakeClock } from '../engine/present';
import { dateKey } from '../engine/schedule';
import { lightsOut, windStart, windStreak } from '../engine/sleep';
import { setSleep, startWindDown, stopWindDown, useSnapshot } from '../store';

function nextAt(hour: number, minute: number, now: number): number {
  const date = new Date(now);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

export function Sleep() {
  const { persisted, now } = useSnapshot();
  const wake = wakeClock(persisted);
  const bed = lightsOut(wake.hour, wake.minute, persisted.sleep.goalMinutes);
  const wind = windStart(bed, persisted.sleep.windDownMinutes);
  const streak = windStreak(persisted.windDownLog, dateKey(new Date(now)));
  const bedAt = nextAt(bed.hour, bed.minute, now);
  const wakeAt = nextAt(wake.hour, wake.minute, now);
  const active = persisted.windDownSince != null;
  const countdown = now < bedAt ? `Lights out in ${formatDistance(bedAt - now)}` : `Wake in ${formatDistance(wakeAt - now)}`;

  return (
    <div className={active ? 'dim' : undefined}>
      <h1>Sleep</h1>
      <p className="numeral-md">{clockOf(bed.hour, bed.minute, persisted.prefs.hourCycle)}</p>
      <p>
        Lights out before {wake.label} at {clockOf(wake.hour, wake.minute, persisted.prefs.hourCycle)}. Wind-down starts at{' '}
        {clockOf(wind.hour, wind.minute, persisted.prefs.hourCycle)}.
      </p>
      {wake.off ? <p>{wake.label} is off. The time is still the one this schedule uses.</p> : null}
      <p>
        {streak === 0 ? 'No wind-down streak yet.' : `${streak} night${streak === 1 ? '' : 's'} in a row.`}
      </p>
      {active ? (
        <>
          <p className="numeral-sm">{countdown}</p>
          <button type="button" onClick={() => stopWindDown()}>
            End wind-down
          </button>
        </>
      ) : (
        <button type="button" className="primary" onClick={() => startWindDown(now)}>
          Start wind-down
        </button>
      )}
      <form aria-labelledby="sleep-settings" onSubmit={(event) => event.preventDefault()}>
        <h2 id="sleep-settings">Schedule</h2>
        <div className="field">
          <label htmlFor="goal">Sleep goal, hours</label>
          <input
            id="goal"
            type="text"
            inputMode="decimal"
            value={String(persisted.sleep.goalMinutes / 60)}
            onChange={(event) => {
              const hours = Number(event.target.value);
              if (!Number.isFinite(hours)) return;
              setSleep({ goalMinutes: Math.min(14 * 60, Math.max(30, Math.round(hours * 60))) });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="wind">Wind-down, minutes</label>
          <input
            id="wind"
            type="text"
            inputMode="numeric"
            value={String(persisted.sleep.windDownMinutes)}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              if (!Number.isFinite(minutes)) return;
              setSleep({ windDownMinutes: Math.min(120, Math.max(0, Math.round(minutes))) });
            }}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={persisted.sleep.useLinkedAlarm}
            onChange={(event) => setSleep({ useLinkedAlarm: event.target.checked })}
          />
          Use an alarm as the wake
        </label>
        {persisted.sleep.useLinkedAlarm ? (
          <div className="field">
            <label htmlFor="linked">Alarm</label>
            <select
              id="linked"
              value={persisted.sleep.alarmId ?? ''}
              onChange={(event) => setSleep({ alarmId: event.target.value || null })}
            >
              <option value="">Choose an alarm</option>
              {persisted.alarms.map((alarm) => (
                <option key={alarm.id} value={alarm.id}>
                  {alarm.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="wake-time">Wake time</label>
            <input
              id="wake-time"
              type="time"
              value={`${String(persisted.sleep.wakeHour).padStart(2, '0')}:${String(persisted.sleep.wakeMinute).padStart(2, '0')}`}
              onChange={(event) => {
                const [hour, minute] = event.target.value.split(':').map(Number);
                if (Number.isFinite(hour) && Number.isFinite(minute)) setSleep({ wakeHour: hour, wakeMinute: minute });
              }}
            />
          </div>
        )}
      </form>
      <p className="hint">Shown in your clock: {formatClock(now, persisted.prefs.hourCycle, false)} now.</p>
    </div>
  );
}
