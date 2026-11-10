import { useMemo, useState } from 'react';
import { formatClock } from '../engine/format';
import { dayMarks } from '../engine/present';
import { cityLabel, minuteOfDay, sharedWorkWindow, wallToUtc } from '../engine/world';
import { addCity, removeCity, useSnapshot } from '../store';
import { DayRibbon } from '../ui/chrome';

function allZones(): string[] {
  if (typeof Intl.supportedValuesOf !== 'function') return [];
  return Intl.supportedValuesOf('timeZone');
}

export function World() {
  const { persisted, now } = useSnapshot();
  const anchor = persisted.cities[0];
  const [query, setQuery] = useState('');
  const [minute, setMinute] = useState(() => (anchor ? minuteOfDay(now, anchor.timeZone) : 0));
  const zones = useMemo(() => allZones(), []);
  const matches = zones
    .filter((zone) => zone.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .slice(0, 8);
  const compared = persisted.cities.slice(0, 4);
  const shared = sharedWorkWindow(
    compared.map((city) => city.timeZone),
    now,
  );
  const span =
    shared && anchor
      ? (() => {
          const startMin = minuteOfDay(shared.start, anchor.timeZone);
          const endMin = minuteOfDay(shared.end, anchor.timeZone);
          return endMin > startMin ? { startMin, endMin } : null;
        })()
      : null;
  const instant = anchor ? wallToUtc(anchor.timeZone, now, minute) : now;

  return (
    <>
      <h1>World</h1>
      {anchor ? <p className="numeral-md">{formatClock(instant, persisted.prefs.hourCycle, false, anchor.timeZone)}</p> : null}
      <DayRibbon marks={dayMarks(persisted, now)} now={now} span={span} />
      <div className="field">
        <label htmlFor="hour-slider">Hour in {anchor?.name ?? 'the first city'}</label>
        <input
          id="hour-slider"
          type="range"
          min={0}
          max={1439}
          step={15}
          value={minute}
          onChange={(event) => setMinute(Number(event.target.value))}
        />
      </div>
      <ul className="rows">
        {persisted.cities.map((city) => (
          <li key={city.id}>
            <div>
              <p className="numeral-sm">{formatClock(instant, persisted.prefs.hourCycle, false, city.timeZone)}</p>
              <p>
                {city.name} · {city.timeZone}
              </p>
            </div>
            <button type="button" onClick={() => removeCity(city.id)} disabled={persisted.cities.length <= 1}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <p>
        {compared.length < 2
          ? 'Add a city to compare hours.'
          : shared
            ? `Shared 9–5: ${formatClock(shared.start, persisted.prefs.hourCycle, false, anchor?.timeZone)} – ${formatClock(shared.end, persisted.prefs.hourCycle, false, anchor?.timeZone)}.`
            : 'No shared working hours.'}
        {persisted.cities.length > 4 ? ' Overlap uses the first four cities.' : ''}
      </p>
      <search>
        <form
          aria-labelledby="city-search"
          onSubmit={(event) => {
            event.preventDefault();
            if (matches[0]) addCity(matches[0]);
          }}
        >
          <h2 id="city-search">Add a city</h2>
          <div className="field">
            <label htmlFor="zone-query">Time zone</label>
            <input
              id="zone-query"
              type="search"
              value={query}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ul className="rows">
            {query.trim()
              ? matches.map((zone) => {
                  const pinned = persisted.cities.some((city) => city.timeZone === zone);
                  return (
                    <li key={zone}>
                      <span>{cityLabel(zone)}</span>
                      <button type="button" onClick={() => addCity(zone)} disabled={pinned}>
                        {pinned ? 'Added' : 'Add'}
                      </button>
                    </li>
                  );
                })
              : null}
          </ul>
        </form>
      </search>
    </>
  );
}
