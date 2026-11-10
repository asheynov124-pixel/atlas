import { formatClock, formatDistance } from './format';
import { repeatLabel, nextAlarmAt } from './schedule';
import { lightsOut, windStart } from './sleep';
import type { Alarm, Persisted } from '../types';

export type Mark = {
  id: string;
  minute: number;
  kind: 'alarm' | 'bed' | 'wind' | 'timer';
  name: string;
  status: string;
};

export function wakeClock(state: Persisted): { hour: number; minute: number; label: string; off: boolean } {
  if (state.sleep.useLinkedAlarm && state.sleep.alarmId) {
    const alarm = state.alarms.find((item) => item.id === state.sleep.alarmId);
    if (alarm) return { hour: alarm.hour, minute: alarm.minute, label: alarm.label, off: !alarm.enabled };
  }
  return { hour: state.sleep.wakeHour, minute: state.sleep.wakeMinute, label: 'Wake', off: false };
}

export function alarmStatus(alarm: Alarm): string {
  const prelude = alarm.preludeMinutes === 0 ? 'no lead-in' : `prelude ${alarm.preludeMinutes} min`;
  return `${repeatLabel(alarm.repeat)} · ${prelude} · ${alarm.rite.kind} · ${alarm.enabled ? 'on' : 'off'}`;
}

export function dayMarks(state: Persisted, now: number): Mark[] {
  const marks: Mark[] = [];
  for (const alarm of state.alarms) {
    if (!alarm.enabled) continue;
    marks.push({
      id: alarm.id,
      minute: alarm.hour * 60 + alarm.minute,
      kind: 'alarm',
      name: alarm.label,
      status: alarmStatus(alarm),
    });
  }
  const wake = wakeClock(state);
  const bed = lightsOut(wake.hour, wake.minute, state.sleep.goalMinutes);
  const wind = windStart(bed, state.sleep.windDownMinutes);
  marks.push({
    id: 'bed',
    minute: bed.hour * 60 + bed.minute,
    kind: 'bed',
    name: 'Lights out',
    status: `before ${wake.label}`,
  });
  marks.push({
    id: 'wind',
    minute: wind.hour * 60 + wind.minute,
    kind: 'wind',
    name: 'Wind-down',
    status: `${state.sleep.windDownMinutes} min before lights out`,
  });
  const today = new Date(now);
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  for (const timer of state.timers) {
    if (timer.status !== 'running' || timer.endsAt == null) continue;
    const end = new Date(timer.endsAt);
    const key = `${end.getFullYear()}-${end.getMonth()}-${end.getDate()}`;
    if (key !== todayKey) continue;
    marks.push({
      id: timer.id,
      minute: end.getHours() * 60 + end.getMinutes(),
      kind: 'timer',
      name: timer.label,
      status: 'running',
    });
  }
  return marks;
}

export function nextCopy(state: Persisted, now: number): string {
  const cycle = state.prefs.hourCycle;
  const labelOf = (id: string) => state.alarms.find((alarm) => alarm.id === id)?.label ?? 'Alarm';
  if (state.live.phase === 'ringing') return `${labelOf(state.live.alarmId)} is ringing`;
  if (state.live.phase === 'prelude') {
    return `Prelude, ${formatDistance(state.live.occurrenceAt - now)} to ${labelOf(state.live.alarmId)}`;
  }
  if (state.live.phase === 'snoozed') {
    const until = state.live.snoozeUntil ?? now;
    return `${labelOf(state.live.alarmId)} snoozed, ${formatDistance(until - now)} left`;
  }
  const next = nextAlarmAt(state.alarms, now);
  if (!next) return 'No alarm is on';
  return `${next.alarm.label} at ${formatClock(next.at, cycle, false)}, in ${formatDistance(next.at - now)}`;
}

export function clockOf(hour: number, minute: number, cycle: '12' | '24'): string {
  const sample = new Date(2026, 0, 1, hour, minute, 0, 0).getTime();
  return formatClock(sample, cycle, false);
}
