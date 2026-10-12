import type { HouseItem, HouseRoom, HouseSettings } from './types';
import { STATUS_LABEL } from './types';
import { lineBest } from './budget';
import { CATEGORY_LABEL } from './budget';

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function itemsCsv(items: HouseItem[], rooms: HouseRoom[], settings: HouseSettings): string {
  const head = ['Room', 'Item', 'Category', 'Qty', 'Unit', 'Unit price', 'Line total', 'Est. low', 'Est. high', 'Status', 'Priority', 'Retailer', 'SKU', 'URL', 'Lead (wk)', 'Dims W×D×H (in)', 'Notes'];
  const rows = items.map((i) => {
    const r = rooms.find((x) => x.id === i.roomId);
    return [r?.name ?? '', i.name, CATEGORY_LABEL[i.category], i.qty, i.unit, i.price || '', lineBest(i).toFixed(2), i.estimate?.[0] ?? '', i.estimate?.[1] ?? '', STATUS_LABEL[i.status], i.priority ?? '', i.retailer ?? '', i.sku ?? '', i.url ?? '', i.lead ?? '', i.dims ? i.dims.join('×') : '', i.notes ?? ''];
  });
  return [`# ${settings.name} — exported ${new Date().toISOString().slice(0, 10)}`, head.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

export function download(name: string, content: string, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function houseJson(house: { rooms: HouseRoom[]; items: HouseItem[]; settings: HouseSettings }) {
  return JSON.stringify({ version: 2, exported: new Date().toISOString(), ...house }, null, 2);
}
