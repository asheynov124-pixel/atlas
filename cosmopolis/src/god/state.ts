/**
 * OWNER: god.
 * Reactive state shared between GodPowers (game side) and the God UI (panel + overlays). Preact signals.
 */
import { signal } from '@preact/signals';

export interface ScreenFlash {
  /** increments per flash so the overlay restarts its animation */
  key: number;
  color: string;
  /** 0..1 peak opacity */
  strength: number;
  /** seconds */
  duration: number;
}

export interface EventBanner {
  key: number;
  title: string;
  subtitle?: string;
  icon: string;
  /** CSS colour */
  color: string;
  /** seconds on screen */
  duration: number;
}

export interface RewindOffer {
  key: number;
  /** what happened ("Black Hole", "Tornado & Earthquake") */
  name: string;
  planetEnding: boolean;
  body: string;
}

export interface DisasterWarning {
  key: number;
  title: string;
  body: string;
  icon: string;
  /** performance.now() when it strikes */
  at: number;
  tile?: number;
}

export interface ActiveEffectView {
  key: number;
  id: string;
  name: string;
  icon: string;
  category: string;
  /** 0..1 progress (or -1 unknown) */
  progress: number;
}

export const godUi = {
  flash: signal<ScreenFlash | null>(null),
  banner: signal<EventBanner | null>(null),
  rewind: signal<RewindOffer | null>(null),
  /** the reverse-time transition is playing */
  rewinding: signal(false),
  warning: signal<DisasterWarning | null>(null),
  active: signal<ActiveEffectView[]>([]),
  /** intensity / size multiplier chosen in the God panel (0.5 … 2) */
  intensity: signal(1),
  /** power id → performance.now() ms when it is ready again (career) */
  cooldowns: signal<Record<string, number>>({}),
  /** a restorable snapshot exists (Chrono) */
  snapshot: signal<{ name: string; at: number } | null>(null),
  /** 0..1 apocalypse vignette strength on screen */
  dread: signal(0),
  /** last used power ids (most recent first) */
  recent: signal<string[]>([]),
  /** the panel's selected category tab */
  tab: signal<string>('weather'),
  /** picked variant per power id (powers with `choices`) */
  choice: signal<Record<string, string>>({}),
};

let key = 1;
export const nextKey = () => key++;

export function screenFlash(color: string, strength = 0.85, duration = 0.6): void {
  godUi.flash.value = { key: nextKey(), color, strength: Math.max(0, Math.min(1, strength)), duration: Math.max(0.1, duration) };
}

export function showBanner(title: string, subtitle: string | undefined, icon: string, color: string, duration = 4.2): void {
  godUi.banner.value = { key: nextKey(), title, subtitle, icon, color, duration };
}
