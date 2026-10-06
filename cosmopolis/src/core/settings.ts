/**
 * Player settings (persisted to localStorage, safe when storage is unavailable). CONTRACT — append fields only.
 * Read: `settings.value.x`. Write: `setSettings({ x })` (emits 'settings:changed').
 */
import { signal } from '@preact/signals';
import { bus } from './events';

export type QualitySetting = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export type DayNightMode = 'cycle' | 'day' | 'night' | 'golden';

export interface Settings {
  quality: QualitySetting;
  dayNight: DayNightMode;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  showFps: boolean;
  autosave: boolean;
  autosaveMinutes: number;
  tutorial: boolean;
  /** random natural disasters in career mode */
  randomDisasters: boolean;
  uiScale: number;
  reduceMotion: boolean;
  cameraSensitivity: number;
  invertRotate: boolean;
  bloom: boolean;
  shadows: boolean;
  clouds: boolean;
  /** show tile grid lines while building */
  grid: boolean;
  /** citizens' chatter feed popups */
  chirps: boolean;
  /** edge labels for districts / landmarks */
  labels: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  dayNight: 'cycle',
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  muted: false,
  showFps: false,
  autosave: true,
  autosaveMinutes: 3,
  tutorial: true,
  randomDisasters: false,
  uiScale: 1,
  reduceMotion: false,
  cameraSensitivity: 1,
  invertRotate: false,
  bloom: true,
  shadows: true,
  clouds: true,
  grid: true,
  chirps: true,
  labels: true,
};

const KEY = 'cosmopolis.settings.v1';

function load(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export const settings = signal<Settings>(load());

export function setSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    /* ignore */
  }
  bus.emit('settings:changed', {});
}
