import { useSyncExternalStore } from 'react';
import { cityLabel } from './engine/world';
import { completeRite, dateKey, nextFuture, occurrenceOn, occurrenceStamp, snooze, step } from './engine/schedule';
import { score } from './runtime/audio';
import { postNotice, readNotify, type NotifyState } from './runtime/notify';
import type { Alarm, City, Persisted, Scene, Session, SleepPlan, Stopwatch, Timer } from './types';

const KEY = 'prelude:v1';

export type Runtime = {
  wake: 'idle' | 'held' | 'unsupported' | 'denied';
  notify: NotifyState;
};

export type Snapshot = { persisted: Persisted; now: number; runtime: Runtime };

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function createInitial(now: number): Persisted {
  const zone = localZone();
  const weekday: Alarm = {
    id: 'alarm-weekday',
    label: 'Weekday',
    hour: 7,
    minute: 0,
    enabled: false,
    repeat: [1, 2, 3, 4, 5],
    soundId: 'bell',
    volume: 0.8,
    preludeMinutes: 15,
    paletteId: 'night',
    faceId: 'numeral',
    snooze: { enabled: true, minutes: 5, max: 3, escalate: false },
    rite: { kind: 'tap', phrase: 'I am awake', difficulty: 1 },
    sceneIds: ['scene-weekday'],
    handledStamp: null,
  };
  const weekend: Alarm = {
    id: 'alarm-weekend',
    label: 'Weekend',
    hour: 9,
    minute: 0,
    enabled: false,
    repeat: [0, 6],
    soundId: 'strike',
    volume: 0.7,
    preludeMinutes: 10,
    paletteId: 'cloth',
    faceId: 'ribbon',
    snooze: { enabled: true, minutes: 10, max: 2, escalate: true },
    rite: { kind: 'phrase', phrase: 'I am awake', difficulty: 1 },
    sceneIds: ['scene-weekend'],
    handledStamp: null,
  };
  const scenes: Scene[] = [
    { id: 'scene-weekday', name: 'Weekday', alarmIds: [weekday.id] },
    { id: 'scene-weekend', name: 'Weekend', alarmIds: [weekend.id] },
  ];
  const cities: City[] = [{ id: 'city-local', timeZone: zone, name: cityLabel(zone) }];
  return {
    version: 1,
    alarms: [weekday, weekend],
    scenes,
    sleep: {
      goalMinutes: 450,
      windDownMinutes: 30,
      useLinkedAlarm: true,
      alarmId: weekday.id,
      wakeHour: 7,
      wakeMinute: 0,
    },
    windDownLog: [],
    windDownSince: null,
    timers: [],
    stopwatch: { name: 'Session', running: false, startedAt: null, accumulatedMs: 0, laps: [] },
    sessions: [],
    cities,
    prefs: {
      hourCycle: '12',
      showSeconds: false,
      homeFaceId: 'numeral',
      homePaletteId: 'night',
      bedside: false,
      firstRunSeen: false,
    },
    live: { phase: 'idle' },
    miss: null,
    lastSeenAt: now,
  };
}

function hydrate(raw: unknown, now: number): Persisted {
  const base = createInitial(now);
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<Persisted>;
  if (data.version !== 1 || !Array.isArray(data.alarms)) return base;
  return {
    ...base,
    ...data,
    version: 1,
    prefs: { ...base.prefs, ...data.prefs },
    sleep: { ...base.sleep, ...data.sleep },
    stopwatch: { ...base.stopwatch, ...data.stopwatch },
    alarms: data.alarms,
    scenes: data.scenes ?? base.scenes,
    timers: data.timers ?? [],
    sessions: data.sessions ?? [],
    cities: data.cities?.length ? data.cities : base.cities,
    windDownLog: data.windDownLog ?? [],
    live: data.live ?? { phase: 'idle' },
    miss: data.miss ?? null,
    lastSeenAt: typeof data.lastSeenAt === 'number' ? data.lastSeenAt : now,
  };
}

function load(now: number): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createInitial(now);
    return hydrate(JSON.parse(raw) as unknown, now);
  } catch {
    return createInitial(now);
  }
}

function paintPalette(id: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.palette = id;
  document.documentElement.style.colorScheme = id === 'shu' ? 'light' : 'dark';
}

let persisted = load(Date.now());
paintPalette(persisted.prefs.homePaletteId);
let now = Date.now();
let runtime: Runtime = { wake: 'idle', notify: readNotify() };
let snapshot: Snapshot = { persisted, now, runtime };
const listeners = new Set<() => void>();
let persistTimer: number | null = null;
let clockTimer: number | null = null;
let booted = false;

function publish() {
  snapshot = { persisted, now, runtime };
  listeners.forEach((listener) => listener());
}

function flush() {
  if (persistTimer != null) window.clearTimeout(persistTimer);
  persistTimer = null;
  localStorage.setItem(KEY, JSON.stringify(persisted));
}

function schedulePersist(immediate: boolean) {
  if (immediate) {
    flush();
    return;
  }
  if (persistTimer != null) return;
  persistTimer = window.setTimeout(flush, 5000);
}

function commit(next: Persisted, immediate = false) {
  persisted = next;
  publish();
  schedulePersist(immediate);
  if (booted) arm(delay(persisted, Date.now()));
}

function nextWake(state: Persisted, at: number): number {
  let nextAt = at + 60 * 60 * 1000;
  const consider = (point: number) => {
    if (point < nextAt) nextAt = point;
  };
  for (const alarm of state.alarms) {
    if (!alarm.enabled) continue;
    const today = occurrenceOn(alarm, new Date(at)).getTime();
    const repeatsToday = alarm.repeat.length === 0 || alarm.repeat.includes(new Date(at).getDay());
    if (repeatsToday && alarm.handledStamp !== occurrenceStamp(alarm.id, today)) {
      consider(today - alarm.preludeMinutes * 60_000);
      consider(today);
    }
    const when = nextFuture(alarm, at);
    if (when != null) {
      consider(when - alarm.preludeMinutes * 60_000);
      consider(when);
    }
  }
  for (const timer of state.timers) {
    if (timer.status === 'running' && timer.endsAt != null) consider(timer.endsAt);
  }
  if (state.live.phase === 'snoozed' && state.live.snoozeUntil != null) consider(state.live.snoozeUntil);
  if (state.live.phase === 'prelude') consider(state.live.occurrenceAt);
  if (state.windDownSince != null) consider(state.windDownSince + state.sleep.windDownMinutes * 60_000);
  return nextAt;
}

function delay(state: Persisted, at: number): number {
  const active =
    state.live.phase !== 'idle' ||
    state.prefs.bedside ||
    state.timers.some((timer) => timer.status === 'running') ||
    state.stopwatch.running ||
    state.windDownSince != null;
  if (state.prefs.showSeconds || active) return 1000;
  const hidden = typeof document !== 'undefined' && document.hidden;
  const date = new Date(at);
  const untilMinute = 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds());
  const eventAt = nextWake(state, at);
  if (eventAt <= at) return 200;
  const wait = Math.min(hidden ? 60 * 60 * 1000 : untilMinute, eventAt - at);
  return Math.min(Math.max(wait, 200), 60 * 60 * 1000);
}

function arm(ms: number) {
  if (clockTimer != null) window.clearTimeout(clockTimer);
  clockTimer = window.setTimeout(tick, ms);
}

function tick() {
  now = Date.now();
  const result = step(persisted, now);
  const changed = result.state !== persisted;
  persisted = result.state;
  publish();
  if (changed) schedulePersist(result.events.length > 0);
  for (const event of result.events) {
    if (event.type === 'timer-done') {
      score.chime();
      postNotice('Prelude', `${event.label} finished.`, `timer-${event.id}`);
    }
  }
  arm(delay(persisted, now));
}

export function startClock() {
  if (booted) return;
  booted = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
    else tick();
  });
  tick();
}

export function setRuntime(patch: Partial<Runtime>) {
  runtime = { ...runtime, ...patch };
  publish();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function blankAlarm(at = Date.now()): Alarm {
  const date = new Date(at);
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return {
    id: uid('alarm'),
    label: 'Alarm',
    hour: date.getHours(),
    minute: 0,
    enabled: false,
    repeat: [],
    soundId: 'bell',
    volume: 0.8,
    preludeMinutes: 10,
    paletteId: persisted.prefs.homePaletteId,
    faceId: persisted.prefs.homeFaceId,
    snooze: { enabled: true, minutes: 5, max: 3, escalate: true },
    rite: { kind: 'math', phrase: 'I am awake', difficulty: 1 },
    sceneIds: [],
    handledStamp: null,
  };
}

function clearLiveIf(id: string, next: Persisted): Persisted {
  if (next.live.phase !== 'idle' && next.live.alarmId === id) return { ...next, live: { phase: 'idle' } };
  return next;
}

export function saveAlarm(alarm: Alarm) {
  const exists = persisted.alarms.some((item) => item.id === alarm.id);
  const alarms = exists ? persisted.alarms.map((item) => (item.id === alarm.id ? alarm : item)) : [...persisted.alarms, alarm];
  const scenes = persisted.scenes.map((scene) => {
    const should = alarm.sceneIds.includes(scene.id);
    const has = scene.alarmIds.includes(alarm.id);
    if (should && !has) return { ...scene, alarmIds: [...scene.alarmIds, alarm.id] };
    if (!should && has) return { ...scene, alarmIds: scene.alarmIds.filter((id) => id !== alarm.id) };
    return scene;
  });
  let next: Persisted = { ...persisted, alarms, scenes, lastSeenAt: Date.now() };
  if (next.live.phase !== 'idle' && next.live.alarmId === alarm.id) {
    const at = new Date(next.live.occurrenceAt);
    if (!alarm.enabled || at.getHours() !== alarm.hour || at.getMinutes() !== alarm.minute) next = { ...next, live: { phase: 'idle' } };
  }
  commit(next, true);
}

export function deleteAlarm(id: string) {
  let next: Persisted = {
    ...persisted,
    alarms: persisted.alarms.filter((alarm) => alarm.id !== id),
    scenes: persisted.scenes.map((scene) => ({ ...scene, alarmIds: scene.alarmIds.filter((alarmId) => alarmId !== id) })),
    sleep: persisted.sleep.alarmId === id ? { ...persisted.sleep, alarmId: null, useLinkedAlarm: false } : persisted.sleep,
  };
  next = clearLiveIf(id, next);
  commit(next, true);
}

export function toggleAlarm(id: string, enabled: boolean) {
  let next: Persisted = {
    ...persisted,
    lastSeenAt: Date.now(),
    alarms: persisted.alarms.map((alarm) => (alarm.id === id ? { ...alarm, enabled } : alarm)),
  };
  if (!enabled) next = clearLiveIf(id, next);
  commit(next, true);
}

export function toggleScene(id: string, enabled: boolean) {
  const scene = persisted.scenes.find((item) => item.id === id);
  if (!scene) return;
  let next: Persisted = {
    ...persisted,
    lastSeenAt: Date.now(),
    alarms: persisted.alarms.map((alarm) => (scene.alarmIds.includes(alarm.id) ? { ...alarm, enabled } : alarm)),
  };
  if (!enabled) {
    for (const alarmId of scene.alarmIds) next = clearLiveIf(alarmId, next);
  }
  commit(next, true);
}

export function setSleep(patch: Partial<SleepPlan>) {
  commit({ ...persisted, sleep: { ...persisted.sleep, ...patch } }, true);
}

export function startWindDown(at = Date.now()) {
  const key = dateKey(new Date(at));
  const windDownLog = persisted.windDownLog.includes(key) ? persisted.windDownLog : [...persisted.windDownLog, key];
  commit({ ...persisted, windDownSince: at, windDownLog }, true);
}

export function stopWindDown() {
  commit({ ...persisted, windDownSince: null }, true);
}

export function addTimer(label: string, durationMs: number): string {
  const timer: Timer = {
    id: uid('timer'),
    label,
    durationMs,
    remainingMs: durationMs,
    status: 'idle',
    endsAt: null,
    chainNextId: null,
  };
  commit({ ...persisted, timers: [...persisted.timers, timer] }, true);
  return timer.id;
}

export function patchTimer(id: string, patch: Partial<Timer>) {
  commit({
    ...persisted,
    timers: persisted.timers.map((timer) => (timer.id === id ? { ...timer, ...patch } : timer)),
  }, true);
}

export function startTimer(id: string, at = Date.now()) {
  commit({
    ...persisted,
    timers: persisted.timers.map((timer) => {
      if (timer.id !== id) return timer;
      const remaining = timer.remainingMs > 0 ? timer.remainingMs : timer.durationMs;
      return { ...timer, status: 'running', remainingMs: remaining, endsAt: at + remaining };
    }),
  }, true);
}

export function pauseTimer(id: string, at = Date.now()) {
  commit({
    ...persisted,
    timers: persisted.timers.map((timer) => {
      if (timer.id !== id || timer.status !== 'running') return timer;
      const remaining = timer.endsAt != null ? Math.max(0, timer.endsAt - at) : timer.remainingMs;
      return { ...timer, status: 'paused', remainingMs: remaining, endsAt: null };
    }),
  }, true);
}

export function resetTimer(id: string) {
  commit({
    ...persisted,
    timers: persisted.timers.map((timer) =>
      timer.id === id ? { ...timer, status: 'idle', remainingMs: timer.durationMs, endsAt: null } : timer,
    ),
  }, true);
}

export function removeTimer(id: string) {
  commit({
    ...persisted,
    timers: persisted.timers
      .filter((timer) => timer.id !== id)
      .map((timer) => (timer.chainNextId === id ? { ...timer, chainNextId: null } : timer)),
  }, true);
}

export function stopwatchElapsed(sw: Stopwatch, at: number): number {
  if (sw.running && sw.startedAt != null) return sw.accumulatedMs + (at - sw.startedAt);
  return sw.accumulatedMs;
}

export function swToggle(at = Date.now()) {
  const sw = persisted.stopwatch;
  if (sw.running && sw.startedAt != null) {
    commit({
      ...persisted,
      stopwatch: { ...sw, running: false, accumulatedMs: sw.accumulatedMs + (at - sw.startedAt), startedAt: null },
    }, true);
    return;
  }
  commit({ ...persisted, stopwatch: { ...sw, running: true, startedAt: at } }, true);
}

export function swLap(at = Date.now()) {
  const sw = persisted.stopwatch;
  if (!sw.running || sw.startedAt == null) return;
  const elapsed = sw.accumulatedMs + (at - sw.startedAt);
  commit({ ...persisted, stopwatch: { ...sw, laps: [...sw.laps, { elapsedMs: elapsed }] } }, true);
}

export function swName(name: string) {
  commit({ ...persisted, stopwatch: { ...persisted.stopwatch, name } }, true);
}

export function swKeep(at = Date.now()) {
  const elapsed = stopwatchElapsed(persisted.stopwatch, at);
  if (elapsed <= 0) return;
  const session: Session = {
    id: uid('session'),
    name: persisted.stopwatch.name.trim() || 'Session',
    elapsedMs: elapsed,
    laps: persisted.stopwatch.laps,
    savedAt: at,
  };
  commit({
    ...persisted,
    sessions: [session, ...persisted.sessions].slice(0, 10),
    stopwatch: { ...persisted.stopwatch, running: false, startedAt: null, accumulatedMs: 0, laps: [] },
  }, true);
}

export function swClear() {
  commit({
    ...persisted,
    stopwatch: { ...persisted.stopwatch, running: false, startedAt: null, accumulatedMs: 0, laps: [] },
  }, true);
}

export function addCity(timeZone: string) {
  if (persisted.cities.some((city) => city.timeZone === timeZone)) return;
  commit({
    ...persisted,
    cities: [...persisted.cities, { id: uid('city'), timeZone, name: cityLabel(timeZone) }],
  }, true);
}

export function removeCity(id: string) {
  if (persisted.cities.length <= 1) return;
  commit({ ...persisted, cities: persisted.cities.filter((city) => city.id !== id) }, true);
}

export function setPrefs(patch: Partial<Persisted['prefs']>) {
  const next = { ...persisted, prefs: { ...persisted.prefs, ...patch } };
  commit(next, true);
  paintPalette(next.prefs.homePaletteId);
}

export function dismissMiss() {
  commit({ ...persisted, miss: null }, true);
}

export function dismissFirstRun() {
  commit({ ...persisted, prefs: { ...persisted.prefs, firstRunSeen: true } }, true);
}

export function snoozeLive(at = Date.now()) {
  commit(snooze(persisted, at), true);
}

export function finishRite() {
  commit(completeRite(persisted), true);
}
