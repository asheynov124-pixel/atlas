import { describe, expect, it } from 'vitest';
import type { Alarm, Persisted, Timer } from '../types';
import {
  completeRite,
  napSuggestion,
  nextFuture,
  repeatLabel,
  snooze,
  snoozeLengthMinutes,
  step,
} from './schedule';

function alarm(partial: Partial<Alarm> & Pick<Alarm, 'id'>): Alarm {
  return {
    label: 'Weekday',
    hour: 7,
    minute: 0,
    enabled: true,
    repeat: [],
    soundId: 'bell',
    volume: 0.8,
    preludeMinutes: 15,
    paletteId: 'night',
    faceId: 'numeral',
    snooze: { enabled: true, minutes: 5, max: 3, escalate: false },
    rite: { kind: 'tap', phrase: 'I am awake', difficulty: 1 },
    sceneIds: [],
    handledStamp: null,
    ...partial,
  };
}

function state(partial: Partial<Persisted> & Pick<Persisted, 'alarms' | 'lastSeenAt'>): Persisted {
  return {
    version: 1,
    scenes: [],
    sleep: { goalMinutes: 450, windDownMinutes: 30, useLinkedAlarm: false, alarmId: null, wakeHour: 7, wakeMinute: 0 },
    windDownLog: [],
    windDownSince: null,
    timers: [],
    stopwatch: { name: 'Session', running: false, startedAt: null, accumulatedMs: 0, laps: [] },
    sessions: [],
    cities: [],
    prefs: {
      hourCycle: '12',
      showSeconds: false,
      homeFaceId: 'numeral',
      homePaletteId: 'night',
      bedside: false,
      firstRunSeen: true,
    },
    live: { phase: 'idle' },
    miss: null,
    ...partial,
  };
}

const at = (h: number, m: number, day = 9) => new Date(2026, 10, day, h, m, 0, 0).getTime();

describe('nextFuture', () => {
  it('skips weekdays that are not selected', () => {
    const saturday = new Date(2026, 10, 14, 12, 0, 0, 0);
    expect(saturday.getDay()).toBe(6);
    const next = nextFuture(alarm({ id: 'a', repeat: [1, 2, 3, 4, 5], hour: 7 }), saturday.getTime());
    expect(new Date(next ?? 0).getDay()).toBe(1);
    expect(new Date(next ?? 0).getHours()).toBe(7);
  });

  it('uses tomorrow when today has already passed', () => {
    const next = nextFuture(alarm({ id: 'a', hour: 7 }), at(8, 0));
    expect(new Date(next ?? 0).getDate()).toBe(10);
  });

  it('returns null when the alarm is off', () => {
    expect(nextFuture(alarm({ id: 'a', enabled: false }), at(6, 0))).toBeNull();
  });
});

describe('snooze length', () => {
  it('lengthens each snooze when asked', () => {
    expect(snoozeLengthMinutes(5, false, 2)).toBe(5);
    expect(snoozeLengthMinutes(5, true, 0)).toBe(5);
    expect(snoozeLengthMinutes(5, true, 1)).toBe(10);
    expect(snoozeLengthMinutes(5, true, 2)).toBe(15);
  });
});

describe('step', () => {
  it('enters the prelude inside the lead-in', () => {
    const result = step(state({ alarms: [alarm({ id: 'a' })], lastSeenAt: at(6, 30) }), at(6, 50));
    expect(result.state.live.phase).toBe('prelude');
    if (result.state.live.phase === 'prelude') expect(result.state.live.occurrenceAt).toBe(at(7, 0));
  });

  it('rings inside the two-minute catch window', () => {
    const result = step(state({ alarms: [alarm({ id: 'a', preludeMinutes: 0 })], lastSeenAt: at(6, 40) }), at(7, 1));
    expect(result.state.live.phase).toBe('ringing');
    expect(result.events.some((event) => event.type === 'ring')).toBe(true);
  });

  it('marks a missed once-alarm and turns it off', () => {
    const result = step(state({ alarms: [alarm({ id: 'a' })], lastSeenAt: at(6, 40) }), at(7, 10));
    expect(result.state.live.phase).toBe('idle');
    expect(result.state.alarms[0]?.enabled).toBe(false);
    expect(result.state.miss?.labels).toEqual(['Weekday']);
  });

  it('does not miss an alarm that was not armed before its time', () => {
    const result = step(state({ alarms: [alarm({ id: 'a' })], lastSeenAt: at(8, 0) }), at(8, 0));
    expect(result.state.alarms[0]?.enabled).toBe(true);
    expect(result.state.miss).toBeNull();
    expect(result.state.live.phase).toBe('idle');
  });

  it('keeps ringing after the catch window while the page is already ringing', () => {
    const armed = step(state({ alarms: [alarm({ id: 'a', preludeMinutes: 0 })], lastSeenAt: at(6, 40) }), at(7, 0)).state;
    const later = step(armed, at(7, 20));
    expect(later.state.live.phase).toBe('ringing');
  });

  it('rings again when a snooze ends, and misses a snooze left for too long', () => {
    const ringing = step(state({ alarms: [alarm({ id: 'a', preludeMinutes: 0 })], lastSeenAt: at(6, 40) }), at(7, 0)).state;
    const snoozed = snooze(ringing, at(7, 0));
    expect(snoozed.live.phase).toBe('snoozed');
    const again = step(snoozed, at(7, 5));
    expect(again.state.live.phase).toBe('ringing');
    if (again.state.live.phase === 'ringing') expect(again.state.live.snoozesUsed).toBe(1);
    const abandoned = step(snoozed, at(7, 8));
    expect(abandoned.state.live.phase).toBe('idle');
    expect(abandoned.state.miss?.labels).toEqual(['Weekday']);
  });

  it('stops offering snooze after the maximum', () => {
    let current = step(
      state({
        alarms: [alarm({ id: 'a', preludeMinutes: 0, snooze: { enabled: true, minutes: 5, max: 1, escalate: false } })],
        lastSeenAt: at(6, 40),
      }),
      at(7, 0),
    ).state;
    current = snooze(current, at(7, 0));
    current = step(current, at(7, 5)).state;
    expect(snooze(current, at(7, 5))).toBe(current);
  });

  it('turns a once-alarm off when the rite is completed', () => {
    const ringing = step(state({ alarms: [alarm({ id: 'a', preludeMinutes: 0 })], lastSeenAt: at(6, 40) }), at(7, 0)).state;
    const done = completeRite(ringing);
    expect(done.live.phase).toBe('idle');
    expect(done.alarms[0]?.enabled).toBe(false);
  });

  it('starts the chained timer when the first one ends', () => {
    const steep: Timer = {
      id: 'steep',
      label: 'Steep',
      durationMs: 60_000,
      remainingMs: 60_000,
      status: 'running',
      endsAt: at(7, 1),
      chainNextId: 'pour',
    };
    const pour: Timer = {
      id: 'pour',
      label: 'Pour',
      durationMs: 30_000,
      remainingMs: 30_000,
      status: 'idle',
      endsAt: null,
      chainNextId: null,
    };
    const result = step(state({ alarms: [], timers: [steep, pour], lastSeenAt: at(7, 0) }), at(7, 1));
    expect(result.state.timers[0]?.status).toBe('done');
    expect(result.state.timers[1]?.status).toBe('running');
    expect(result.state.timers[1]?.endsAt).toBe(at(7, 1) + 30_000);
    expect(result.events.map((event) => event.type)).toEqual(['timer-done', 'chain']);
  });

  it('starts a paused or finished timer from the chain', () => {
    const steep: Timer = {
      id: 'steep',
      label: 'Steep',
      durationMs: 60_000,
      remainingMs: 0,
      status: 'running',
      endsAt: at(7, 1),
      chainNextId: 'pour',
    };
    const pour: Timer = {
      id: 'pour',
      label: 'Pour',
      durationMs: 30_000,
      remainingMs: 0,
      status: 'paused',
      endsAt: null,
      chainNextId: null,
    };
    const result = step(state({ alarms: [], timers: [steep, pour], lastSeenAt: at(7, 0) }), at(7, 1));
    expect(result.state.timers[1]?.status).toBe('running');
    expect(result.state.timers[1]?.remainingMs).toBe(30_000);
  });
});

describe('nap guard', () => {
  it('offers to finish 15 minutes before the next alarm', () => {
    const now = at(6, 30);
    const suggestion = napSuggestion(45 * 60_000, now, at(7, 0));
    expect(suggestion.overlaps).toBe(true);
    expect(suggestion.suggestedMs).toBe(15 * 60_000);
  });

  it('stays quiet when the timer ends first', () => {
    expect(napSuggestion(10 * 60_000, at(6, 0), at(7, 0)).overlaps).toBe(false);
  });
});

describe('repeat labels', () => {
  it('names the common sets', () => {
    expect(repeatLabel([])).toBe('Once');
    expect(repeatLabel([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(repeatLabel([6, 0])).toBe('Weekends');
    expect(repeatLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
  });
});
