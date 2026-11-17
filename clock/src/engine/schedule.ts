import type { Alarm, EngineEvent, Live, Persisted, Timer } from '../types';

export const CATCH_MS = 2 * 60 * 1000;

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function occurrenceStamp(alarmId: string, at: number): string {
  const d = new Date(at);
  return `${alarmId}@${dateKey(d)}@${d.getHours()}:${d.getMinutes()}`;
}

export function occurrenceOn(alarm: Pick<Alarm, 'hour' | 'minute'>, day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), alarm.hour, alarm.minute, 0, 0);
}

export function snoozeLengthMinutes(base: number, escalate: boolean, used: number): number {
  const minutes = Math.max(1, Math.round(base));
  if (!escalate) return minutes;
  return minutes * (used + 1);
}

export function nextFuture(alarm: Alarm, now: number): number | null {
  if (!alarm.enabled) return null;
  const base = new Date(now);
  for (let add = 0; add < 8; add += 1) {
    const occ = new Date(base.getFullYear(), base.getMonth(), base.getDate() + add, alarm.hour, alarm.minute, 0, 0);
    if (occ.getTime() <= now) continue;
    if (alarm.repeat.length > 0 && !alarm.repeat.includes(occ.getDay())) continue;
    if (alarm.handledStamp === occurrenceStamp(alarm.id, occ.getTime())) continue;
    return occ.getTime();
  }
  return null;
}

export function nextAlarmAt(alarms: Alarm[], now: number): { alarm: Alarm; at: number } | null {
  let best: { alarm: Alarm; at: number } | null = null;
  for (const alarm of alarms) {
    const at = nextFuture(alarm, now);
    if (at == null) continue;
    if (!best || at < best.at) best = { alarm, at };
  }
  return best;
}

export function napSuggestion(
  durationMs: number,
  now: number,
  nextAt: number | null,
): { overlaps: boolean; suggestedMs: number | null } {
  if (nextAt == null) return { overlaps: false, suggestedMs: null };
  if (now + durationMs <= nextAt) return { overlaps: false, suggestedMs: null };
  const suggested = nextAt - 15 * 60 * 1000 - now;
  return { overlaps: true, suggestedMs: suggested > 30_000 ? suggested : null };
}

type Action = { type: 'prelude' | 'ring' | 'miss'; alarmId: string; at: number };

function liveAlarm(state: Persisted): Alarm | undefined {
  const live = state.live;
  if (live.phase === 'idle') return undefined;
  return state.alarms.find((alarm) => alarm.id === live.alarmId);
}

function liveMatches(state: Persisted): boolean {
  const live = state.live;
  if (live.phase === 'idle') return true;
  const alarm = liveAlarm(state);
  if (!alarm || !alarm.enabled) return false;
  const at = new Date(live.occurrenceAt);
  return at.getHours() === alarm.hour && at.getMinutes() === alarm.minute;
}

function collect(state: Persisted, now: number): Action[] {
  const actions: Action[] = [];
  const today = new Date(now);
  for (const alarm of state.alarms) {
    if (!alarm.enabled) continue;
    const occ = occurrenceOn(alarm, today);
    const dayOk = alarm.repeat.length === 0 || alarm.repeat.includes(occ.getDay());
    if (dayOk && alarm.handledStamp !== occurrenceStamp(alarm.id, occ.getTime())) {
      const at = occ.getTime();
      const preludeAt = at - alarm.preludeMinutes * 60_000;
      if (now >= preludeAt && now < at) actions.push({ type: 'prelude', alarmId: alarm.id, at });
      else if (now >= at && now <= at + CATCH_MS) actions.push({ type: 'ring', alarmId: alarm.id, at });
      else if (at > state.lastSeenAt && now > at + CATCH_MS) actions.push({ type: 'miss', alarmId: alarm.id, at });
    }
    const upcoming = nextFuture(alarm, now);
    if (upcoming != null && now >= upcoming - alarm.preludeMinutes * 60_000 && now < upcoming) {
      if (!actions.some((action) => action.alarmId === alarm.id)) {
        actions.push({ type: 'prelude', alarmId: alarm.id, at: upcoming });
      }
    }
  }
  return actions;
}

function withAlarm(alarms: Alarm[], id: string, fn: (alarm: Alarm) => Alarm): Alarm[] {
  return alarms.map((alarm) => (alarm.id === id ? fn(alarm) : alarm));
}

function applyMiss(state: Persisted, action: Action, events: EngineEvent[]): Persisted {
  const alarm = state.alarms.find((item) => item.id === action.alarmId);
  if (!alarm) return state;
  events.push({ type: 'miss', alarmId: alarm.id, label: alarm.label });
  const live: Live =
    state.live.phase !== 'idle' && state.live.alarmId === alarm.id ? { phase: 'idle' } : state.live;
  return {
    ...state,
    live,
    alarms: withAlarm(state.alarms, alarm.id, (item) => ({
      ...item,
      handledStamp: occurrenceStamp(item.id, action.at),
      enabled: item.repeat.length === 0 ? false : item.enabled,
    })),
  };
}

function applyRing(state: Persisted, action: Action, events: EngineEvent[], keepSnoozes: boolean): Persisted {
  const alarm = state.alarms.find((item) => item.id === action.alarmId);
  if (!alarm) return state;
  events.push({ type: 'ring', alarmId: alarm.id, label: alarm.label });
  const snoozesUsed = keepSnoozes && state.live.phase !== 'idle' ? state.live.snoozesUsed : 0;
  return {
    ...state,
    alarms: withAlarm(state.alarms, alarm.id, (item) => ({
      ...item,
      handledStamp: occurrenceStamp(item.id, action.at),
    })),
    live: {
      phase: 'ringing',
      alarmId: alarm.id,
      occurrenceAt: action.at,
      snoozesUsed,
      snoozeUntil: null,
    },
  };
}

function applyPrelude(state: Persisted, action: Action, events: EngineEvent[]): Persisted {
  if (
    state.live.phase === 'prelude' &&
    state.live.alarmId === action.alarmId &&
    state.live.occurrenceAt === action.at
  ) {
    return state;
  }
  events.push({ type: 'prelude', alarmId: action.alarmId });
  return {
    ...state,
    live: {
      phase: 'prelude',
      alarmId: action.alarmId,
      occurrenceAt: action.at,
      snoozesUsed: 0,
      snoozeUntil: null,
    },
  };
}

function stepTimers(timers: Timer[], now: number): { timers: Timer[]; events: EngineEvent[] } {
  const events: EngineEvent[] = [];
  let changed = false;
  const next = timers.map((timer) => {
    if (timer.status === 'running' && timer.endsAt != null && timer.endsAt <= now) {
      changed = true;
      events.push({ type: 'timer-done', id: timer.id, label: timer.label });
      return { ...timer, status: 'done' as const, remainingMs: 0, endsAt: null };
    }
    return timer;
  });
  for (const timer of timers) {
    if (timer.status !== 'running' || timer.endsAt == null || timer.endsAt > now || !timer.chainNextId) continue;
    const index = next.findIndex((item) => item.id === timer.chainNextId);
    const target = next[index];
    if (!target || target.status === 'running') continue;
    changed = true;
    events.push({ type: 'chain', id: target.id });
    next[index] = {
      ...target,
      status: 'running',
      remainingMs: target.durationMs,
      endsAt: now + target.durationMs,
    };
  }
  return { timers: changed ? next : timers, events };
}

export function step(state: Persisted, now: number): { state: Persisted; events: EngineEvent[] } {
  const events: EngineEvent[] = [];
  const timed = stepTimers(state.timers, now);
  events.push(...timed.events);
  let next: Persisted = timed.timers === state.timers ? state : { ...state, timers: timed.timers };

  if (!liveMatches(next)) {
    return { state: { ...next, live: { phase: 'idle' } }, events };
  }

  if (next.live.phase === 'ringing') {
    return events.length === 0 && next === state ? { state, events } : { state: next, events };
  }

  if (next.live.phase === 'snoozed') {
    const until = next.live.snoozeUntil ?? now;
    if (now >= until + CATCH_MS) {
      const alarm = liveAlarm(next);
      if (alarm) {
        events.push({ type: 'miss', alarmId: alarm.id, label: alarm.label });
        next = {
          ...next,
          live: { phase: 'idle' },
          miss: { labels: [alarm.label], at: until },
          alarms: withAlarm(next.alarms, alarm.id, (item) => ({
            ...item,
            enabled: item.repeat.length === 0 ? false : item.enabled,
          })),
        };
      }
      return { state: next, events };
    }
    if (now >= until) {
      const alarm = liveAlarm(next);
      if (alarm) {
        events.push({ type: 'ring', alarmId: alarm.id, label: alarm.label });
        next = {
          ...next,
          live: { ...next.live, phase: 'ringing', snoozeUntil: null },
        };
      }
    }
    return { state: next, events };
  }

  if (next.live.phase === 'prelude') {
    const current = next.live;
    const others = collect(next, now).filter(
      (action) => !(action.alarmId === current.alarmId && action.at === current.occurrenceAt),
    );
    for (const action of others.filter((item) => item.type === 'miss')) next = applyMiss(next, action, events);
    const preempt = others.filter((item) => item.type === 'ring').sort((a, b) => a.at - b.at)[0];
    if (preempt) return { state: applyRing(next, preempt, events, false), events };
    if (now < current.occurrenceAt) return { state: next, events };
    const action = { type: 'ring' as const, alarmId: current.alarmId, at: current.occurrenceAt };
    if (now <= current.occurrenceAt + CATCH_MS) return { state: applyRing(next, action, events, false), events };
    next = applyMiss(next, { type: 'miss', alarmId: current.alarmId, at: current.occurrenceAt }, events);
    const labels = events.filter((event): event is Extract<EngineEvent, { type: 'miss' }> => event.type === 'miss').map((event) => event.label);
    return { state: { ...next, miss: { labels, at: current.occurrenceAt } }, events };
  }

  const actions = collect(next, now);
  for (const action of actions.filter((item) => item.type === 'miss')) next = applyMiss(next, action, events);
  const ring = actions.filter((item) => item.type === 'ring').sort((a, b) => a.at - b.at)[0];
  if (ring && next.alarms.find((alarm) => alarm.id === ring.alarmId)?.enabled !== false) {
    next = applyRing(next, ring, events, false);
  } else {
    const prelude = actions
      .filter((item) => item.type === 'prelude')
      .sort((a, b) => a.at - b.at)
      .find((item) => next.alarms.find((alarm) => alarm.id === item.alarmId)?.enabled);
    if (prelude && events.every((event) => event.type !== 'miss' || event.alarmId !== prelude.alarmId)) {
      next = applyPrelude(next, prelude, events);
    }
  }
  const missEvents = events.filter((event): event is Extract<EngineEvent, { type: 'miss' }> => event.type === 'miss');
  if (missEvents.length > 0) {
    next = { ...next, miss: { labels: missEvents.map((event) => event.label), at: now } };
  }
  if (next.live.phase === 'idle') next = { ...next, lastSeenAt: now };
  if (next.timers === state.timers && next.live === state.live && next.alarms === state.alarms && next.miss === state.miss && next.lastSeenAt === state.lastSeenAt) {
    return { state, events };
  }
  return { state: next, events };
}

export function snooze(state: Persisted, now: number): Persisted {
  const live = state.live;
  if (live.phase !== 'ringing') return state;
  const alarm = state.alarms.find((item) => item.id === live.alarmId);
  if (!alarm?.snooze.enabled || live.snoozesUsed >= alarm.snooze.max) return state;
  const minutes = snoozeLengthMinutes(alarm.snooze.minutes, alarm.snooze.escalate, live.snoozesUsed);
  return {
    ...state,
    live: {
      ...live,
      phase: 'snoozed',
      snoozesUsed: live.snoozesUsed + 1,
      snoozeUntil: now + minutes * 60_000,
    },
  };
}

export function completeRite(state: Persisted): Persisted {
  const live = state.live;
  if (live.phase !== 'ringing') return state;
  const id = live.alarmId;
  return {
    ...state,
    live: { phase: 'idle' },
    alarms: state.alarms.map((alarm) =>
      alarm.id === id && alarm.repeat.length === 0 ? { ...alarm, enabled: false } : alarm,
    ),
  };
}

export function repeatLabel(days: number[]): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ordered = [...new Set(days)].sort((a, b) => a - b);
  const key = ordered.join(',');
  if (ordered.length === 0) return 'Once';
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  if (key === '0,1,2,3,4,5,6') return 'Every day';
  return ordered.map((day) => names[day] ?? '').join(' ');
}
