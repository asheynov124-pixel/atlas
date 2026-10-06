/**
 * OWNER: ui-core.
 * "New!" tracking for the build menus — the joy of unlocking. Items unlocked by progression (item unlocks and
 * tier-ups) get a NEW chip on their card; tabs and dock buttons show a dot until the player has looked at them.
 * Also: tier progress helper for the city badge ring and the status tray.
 */
import { signal } from '@preact/signals';
import { allItems } from '../../../content/catalog';
import { bus } from '../../../core/events';
import type { Category } from '../../../core/types';
import { ui } from '../../store';

/** item ids unlocked but not yet seen */
export const newItems = signal<ReadonlySet<string>>(new Set());

function add(ids: string[]): void {
  if (!ids.length) return;
  const next = new Set(newItems.value);
  for (const id of ids) next.add(id);
  newItems.value = next;
}

/** Mark the given items as seen. */
export function markSeen(ids: string[]): void {
  if (!ids.some((id) => newItems.value.has(id))) return;
  const next = new Set(newItems.value);
  for (const id of ids) next.delete(id);
  newItems.value = next;
}

export function hasNewIn(cats: readonly Category[]): boolean {
  const s = newItems.value;
  if (!s.size) return false;
  for (const d of allItems()) if (s.has(d.id) && cats.includes(d.category)) return true;
  return false;
}

let installed = false;
export function installNewItems(): () => void {
  if (installed) return () => {};
  installed = true;
  const offs = [
    bus.on('unlock', ({ kind, id }) => {
      if (ui.mode.value === 'sandbox') return;
      if (kind === 'item') add([String(id).replace(/^item:/, '')]);
      else if (kind === 'tier') {
        const t = Number(String(id).replace(/^tier:/, ''));
        add(allItems().filter((d) => d.tier === t && !d.hidden && !d.growable).map((d) => d.id));
      }
    }),
    bus.on('planet:loaded', () => {
      // a fresh game starts with nothing "new"
      if (ui.day.value <= 1) newItems.value = new Set();
    }),
  ];
  return () => {
    installed = false;
    offs.forEach((o) => o());
  };
}

/** Population thresholds per career tier (balance guide in content/catalog.ts). */
export const TIER_POP = [0, 400, 1500, 5000, 12000, 25000, 50000, 100000, 200000];

/** Progress 0..1 toward the next tier, with labels (career); null in sandbox / at max tier. */
export function tierProgress(): { value: number; next: number; from: number; to: number } | null {
  if (ui.mode.value === 'sandbox') return null;
  const t = ui.tier.value;
  if (t >= TIER_POP.length - 1) return null;
  const pop = ui.population.value;
  const from = TIER_POP[t], to = TIER_POP[t + 1];
  return { value: Math.max(0, Math.min(1, (pop - from) / Math.max(1, to - from))), next: t + 1, from, to };
}
