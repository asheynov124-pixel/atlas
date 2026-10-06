/**
 * Reactive UI state (Preact signals) shared by the game and the UI. FOUNDATION, CONTRACT — append only.
 * The game writes these at ~5 Hz (Game.publishUI) or on events; components read `.value`.
 */
import { signal } from '@preact/signals';
import { bus } from '../core/events';
import type { Category, GameMode, NewsItem, Notification, Selection, ViewKind } from '../core/types';

export type Screen = 'boot' | 'menu' | 'game';

export interface ToolState {
  /** tool id understood by ToolManager: 'select' | 'plop' | 'road' | 'zone' | 'bulldoze' | 'terraform' | 'district' | 'paint' | 'god' | ... */
  id: string;
  /** item being placed / painted (ItemDef id) */
  itemId?: string;
  /** god power id when id === 'god' */
  powerId?: string;
  /** human label for the HUD */
  label?: string;
}

/** A tool's adjustable option (rendered generically by the tool options bar). */
export interface ToolOption {
  id: string;
  label: string;
  type: 'choice' | 'toggle' | 'slider' | 'button';
  value?: string | number | boolean;
  choices?: { value: string | number; label: string; icon?: string }[];
  min?: number;
  max?: number;
  step?: number;
  icon?: string;
}

export interface GoalView {
  id: string;
  title: string;
  description: string;
  /** 0..1 */
  progress: number;
  done: boolean;
  reward?: string;
  /** progress label e.g. "1 240 / 1 500 citizens" */
  label?: string;
  tier?: number;
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export const ui = {
  screen: signal<Screen>('boot'),
  /** loading overlay message (null = hidden) */
  loading: signal<string | null>('Booting…'),
  view: signal<ViewKind>('planet'),
  mode: signal<GameMode>('career'),
  speed: signal(1),
  dateLabel: signal(''),
  day: signal(0),
  money: signal(0),
  research: signal(0),
  population: signal(0),
  happiness: signal(50),
  /** net income per month */
  income: signal(0),
  /** RCI(O) demand in −1..1 */
  demand: signal<{ R: number; C: number; I: number; O: number }>({ R: 0, C: 0, I: 0, O: 0 }),
  /** generic stat bag published by the sim (MetricId → value) */
  stats: signal<Record<string, number>>({}),
  planetId: signal(''),
  planetName: signal(''),
  cityName: signal(''),
  /** open build category (sheet) */
  category: signal<Category | 'terraform' | 'god' | null>(null),
  tool: signal<ToolState | null>(null),
  toolOptions: signal<ToolOption[]>([]),
  selection: signal<Selection>(null),
  lens: signal<string | null>(null),
  /** open panel id (see ui/registry) */
  panel: signal<string | null>(null),
  photo: signal(false),
  /** hide all chrome (cinematic tour, photo mode) */
  chromeHidden: signal(false),
  toasts: signal<Notification[]>([]),
  news: signal<NewsItem[]>([]),
  unreadNews: signal(0),
  tier: signal(0),
  goals: signal<GoalView[]>([]),
  fps: signal(0),
  /** contextual instruction shown near the tool bar */
  hint: signal<string | null>(null),
  confirm: signal<ConfirmRequest | null>(null),
  /** cost preview of the current tool action */
  costPreview: signal<{ cost: number; ok: boolean; reason?: string } | null>(null),
  /** catalog / unlock changes bump this so menus re-filter */
  catalogVersion: signal(0),
  canUndo: signal(false),
  canRedo: signal(false),
};

let nid = 1;

export function notify(n: Omit<Notification, 'id' | 'time'>): Notification {
  const full: Notification = { ...n, id: nid++, time: Date.now() };
  ui.toasts.value = [...ui.toasts.value.slice(-4), full];
  bus.emit('notify', full);
  return full;
}

export function dismissToast(id: number): void {
  ui.toasts.value = ui.toasts.value.filter((t) => t.id !== id);
}

export function pushNews(n: Omit<NewsItem, 'id' | 'day'>): NewsItem {
  const item: NewsItem = { ...n, id: nid++, day: ui.day.value };
  ui.news.value = [item, ...ui.news.value].slice(0, 120);
  ui.unreadNews.value++;
  bus.emit('news', item);
  return item;
}

export function confirmDialog(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    ui.confirm.value = {
      ...req,
      resolve: (ok) => {
        ui.confirm.value = null;
        resolve(ok);
      },
    };
  });
}
