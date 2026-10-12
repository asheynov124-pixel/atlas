import type { HouseItem, HouseRoom, HouseSettings, ItemCategory, ItemStatus } from './types';
import { takeoff } from './takeoff';

export interface Rollup {
  subtotal: number;
  shipping: number;
  tax: number;
  contingency: number;
  total: number;
  low: number;
  high: number;
  committed: number;     // ordered + delivered + installed
  spent: number;         // delivered + installed
  byCategory: Record<string, number>;
  byStatus: Record<ItemStatus, number>;
  count: number;
}

export const lineTotal = (i: HouseItem) => i.qty * i.price;
export const lineLow = (i: HouseItem) => (i.price > 0 ? i.qty * i.price : i.estimate ? i.qty * i.estimate[0] : 0);
export const lineHigh = (i: HouseItem) => (i.price > 0 ? i.qty * i.price : i.estimate ? i.qty * i.estimate[1] : 0);
export const lineBest = (i: HouseItem) => (i.price > 0 ? i.qty * i.price : i.estimate ? (i.qty * (i.estimate[0] + i.estimate[1])) / 2 : 0);

export function rollup(items: HouseItem[], settings: HouseSettings): Rollup {
  const live = items.filter((i) => i.status !== 'returned');
  const subtotal = live.reduce((a, i) => a + lineBest(i), 0);
  const low = live.reduce((a, i) => a + lineLow(i), 0);
  const high = live.reduce((a, i) => a + lineHigh(i), 0);
  const shipping = live.reduce((a, i) => a + (i.shipping ?? (i.category === 'labor' ? 0 : lineBest(i) * settings.shippingDefault)), 0);
  const tax = live.reduce((a, i) => a + ((i.taxable ?? i.category !== 'labor') ? lineBest(i) * settings.taxRate : 0), 0);
  const contingency = (subtotal + shipping + tax) * settings.contingency;
  const total = subtotal + shipping + tax + contingency;
  const byCategory: Record<string, number> = {};
  const byStatus = { idea: 0, shortlist: 0, approved: 0, ordered: 0, delivered: 0, installed: 0, returned: 0 } as Record<ItemStatus, number>;
  for (const i of items) {
    if (i.status !== 'returned') byCategory[i.category] = (byCategory[i.category] ?? 0) + lineBest(i);
    byStatus[i.status] += lineBest(i);
  }
  const committed = byStatus.ordered + byStatus.delivered + byStatus.installed;
  const spent = byStatus.delivered + byStatus.installed;
  return { subtotal, shipping, tax, contingency, total, low, high, committed, spent, byCategory, byStatus, count: live.length };
}

export function roomRollup(room: HouseRoom, items: HouseItem[], settings: HouseSettings) {
  const r = rollup(items.filter((i) => i.roomId === room.id), settings);
  const t = takeoff(room);
  const shellLow = Object.values(t.cost).reduce((a, c) => a + c[0], 0);
  const shellHigh = Object.values(t.cost).reduce((a, c) => a + c[1], 0);
  const hasShellLines = items.some((i) => i.roomId === room.id && i.surface);
  return { ...r, shellLow, shellHigh, shellMid: (shellLow + shellHigh) / 2, hasShellLines, takeoff: t };
}

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  furniture: 'Furniture', lighting: 'Lighting', textiles: 'Textiles', art: 'Art & frames', surfaces: 'Surfaces', plumbing: 'Plumbing', appliances: 'Appliances', hardware: 'Hardware', millwork: 'Millwork', labor: 'Labor', other: 'Objects & other',
};

/** Suggest the order to buy things in, by lead time and dependency. */
export function orderPlan(items: HouseItem[]) {
  const weight = (i: HouseItem) => {
    const base: Record<ItemCategory, number> = { millwork: 0, surfaces: 1, plumbing: 2, appliances: 2, lighting: 3, hardware: 4, furniture: 5, textiles: 6, art: 7, labor: 1, other: 8 };
    return base[i.category] * 100 - (i.lead ?? 0);
  };
  return [...items].filter((i) => i.status === 'approved' || i.status === 'shortlist').sort((a, b) => weight(a) - weight(b));
}
