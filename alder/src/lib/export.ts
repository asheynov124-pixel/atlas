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

declare global { interface Window { claude?: { use?: (name: string) => Promise<{ save: (r: { filename: string; data: string | Blob }) => Promise<unknown> } | null> } } }

/**
 * Hand a generated file to the person. Inside the claude.ai viewer this goes through the
 * downloads capability (the viewer confirms); in a normal browser tab it is a plain download.
 * Resolves true when a save surface took the file, false when nothing could (copy is the fallback).
 */
export async function saveFile(filename: string, data: string | Blob, type = 'text/plain'): Promise<boolean> {
  try {
    const dl = await window.claude?.use?.('downloads');
    if (dl) { await dl.save({ filename, data }); return true; }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'declined' || code === 'rate_limited') return true; // the viewer decided; nothing else to do
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch { return false; }
}

/** @deprecated use saveFile */
export function download(name: string, content: string, type = 'text/csv') { void saveFile(name, content, type); }

export function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const bin = atob(body); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function houseJson(house: { rooms: HouseRoom[]; items: HouseItem[]; settings: HouseSettings }, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ version: 3, exported: new Date().toISOString(), ...house, ...extra }, null, 2);
}
