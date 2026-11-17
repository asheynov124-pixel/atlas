export type RiteKind = 'tap' | 'math' | 'sequence' | 'phrase';

export type Alarm = {
  id: string;
  label: string;
  hour: number;
  minute: number;
  enabled: boolean;
  repeat: number[];
  soundId: string;
  volume: number;
  preludeMinutes: number;
  paletteId: string;
  faceId: string;
  snooze: { enabled: boolean; minutes: number; max: number; escalate: boolean };
  rite: { kind: RiteKind; phrase: string; difficulty: 1 | 2 | 3 };
  sceneIds: string[];
  handledStamp: string | null;
};

export type Scene = { id: string; name: string; alarmIds: string[] };

export type SleepPlan = {
  goalMinutes: number;
  windDownMinutes: number;
  useLinkedAlarm: boolean;
  alarmId: string | null;
  wakeHour: number;
  wakeMinute: number;
};

export type Timer = {
  id: string;
  label: string;
  durationMs: number;
  remainingMs: number;
  status: 'idle' | 'running' | 'paused' | 'done';
  endsAt: number | null;
  chainNextId: string | null;
};

export type Lap = { elapsedMs: number };

export type Stopwatch = {
  name: string;
  running: boolean;
  startedAt: number | null;
  accumulatedMs: number;
  laps: Lap[];
};

export type Session = {
  id: string;
  name: string;
  elapsedMs: number;
  laps: Lap[];
  savedAt: number;
};

export type City = { id: string; timeZone: string; name: string };

type ActiveLive = {
  alarmId: string;
  occurrenceAt: number;
  snoozesUsed: number;
  snoozeUntil: number | null;
};

export type Live =
  | { phase: 'idle' }
  | (ActiveLive & { phase: 'prelude' })
  | (ActiveLive & { phase: 'ringing' })
  | (ActiveLive & { phase: 'snoozed' });

export type Miss = { labels: string[]; at: number } | null;

export type Persisted = {
  version: 1;
  alarms: Alarm[];
  scenes: Scene[];
  sleep: SleepPlan;
  windDownLog: string[];
  windDownSince: number | null;
  timers: Timer[];
  stopwatch: Stopwatch;
  sessions: Session[];
  cities: City[];
  prefs: {
    hourCycle: '12' | '24';
    showSeconds: boolean;
    homeFaceId: string;
    homePaletteId: string;
    bedside: boolean;
    firstRunSeen: boolean;
  };
  live: Live;
  miss: Miss;
  lastSeenAt: number;
};

export type EngineEvent =
  | { type: 'ring'; alarmId: string; label: string }
  | { type: 'prelude'; alarmId: string }
  | { type: 'miss'; alarmId: string; label: string }
  | { type: 'timer-done'; id: string; label: string }
  | { type: 'chain'; id: string };
