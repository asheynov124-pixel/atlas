/**
 * Batch export. JSON keeps everything needed to rebuild the batch (and
 * re-imports cleanly through the same paste/upload flow); the URL list is
 * for everything else.
 */
import type { ImportBatch, ImportItem, MediaType } from './types';

export const IMPORT_EXPORT_APP = 'ph-discovery-import';

export interface ExportedItem {
  url: string;
  title: string;
  tags: string[];
  mediaType: MediaType;
  originalUrl: string;
  thumbnailUrl?: string;
  notes?: string;
  added: string;
}

export interface ExportedBatch {
  app: typeof IMPORT_EXPORT_APP;
  version: 1;
  exportedAt: string;
  batch: { id: string; name: string; created: string; tags: string[]; count: number };
  items: ExportedItem[];
}

export function exportBatchObject(batch: Pick<ImportBatch, 'id' | 'name' | 'createdAt' | 'tags'>, items: ImportItem[], now = Date.now()): ExportedBatch {
  return {
    app: IMPORT_EXPORT_APP,
    version: 1,
    exportedAt: new Date(now).toISOString(),
    batch: { id: batch.id, name: batch.name, created: new Date(batch.createdAt).toISOString(), tags: batch.tags, count: items.length },
    items: items.map((it) => {
      const out: ExportedItem = {
        url: it.url,
        title: it.title,
        tags: it.tags,
        mediaType: it.mediaType,
        originalUrl: it.originalUrl,
        added: new Date(it.addedAt).toISOString(),
      };
      if (it.thumbnailUrl) out.thumbnailUrl = it.thumbnailUrl;
      if (it.notes) out.notes = it.notes;
      return out;
    }),
  };
}

export function exportBatchJSON(batch: Pick<ImportBatch, 'id' | 'name' | 'createdAt' | 'tags'>, items: ImportItem[], now = Date.now()): string {
  return JSON.stringify(exportBatchObject(batch, items, now), null, 2);
}

/** One URL per line: the media itself, or the page for "open original" clips. */
export function exportBatchUrls(items: Pick<ImportItem, 'url'>[]): string {
  return `${items.map((i) => i.url).join('\n')}\n`;
}

export function exportFilename(batch: Pick<ImportBatch, 'name' | 'createdAt'>, ext: 'json' | 'txt'): string {
  const date = new Date(batch.createdAt).toISOString().slice(0, 10);
  const slug = batch.name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `import-${slug || 'batch'}${slug.includes(date) ? '' : `-${date}`}.${ext}`;
}

export function isBatchExport(v: unknown): v is ExportedBatch {
  return !!v && typeof v === 'object' && (v as { app?: unknown }).app === IMPORT_EXPORT_APP && Array.isArray((v as { items?: unknown }).items);
}

/** Save a file. iOS Safari turns this into a preview with a Share button. */
export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
