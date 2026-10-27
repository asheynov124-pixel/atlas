/**
 * The import being prepared: inputs, page scans, per-row overrides, and the
 * finalised preview. Session-only (never persisted) and shared by the import
 * sheet and the bulk title editor, so closing the sheet by accident doesn't
 * throw a half-reviewed batch away.
 */
import { create } from 'zustand';
import { useStore, activeData } from '../state/store';
import { useTaxonomy } from '../state/taxonomy';
import { uid } from '../lib/id';
import { addDrops, emptyDrops, finalize, parseInput, type InputKind, type RawCandidate } from './extract';
import { scanPages, type ScanResult } from './scan';
import { defaultBatchName, itemFromCandidate, parseTagInput, suggestImportTags } from './model';
import type { Candidate, DropCounts, ImportBatch, ImportSummary, MediaType, ScanError } from './types';

export interface DraftSource {
  id: string;
  label: string;
  kind: InputKind;
  candidates: RawCandidate[];
  dropped: DropCounts;
}

export interface ScanState {
  status: 'running' | 'ok' | 'failed';
  found: number;
  error?: ScanError;
}

export interface RowOverride {
  include?: boolean;
  title?: string;
  tags?: string[];
}

interface DraftState {
  text: string;
  /** Parsed form of `text`, refreshed on a short debounce. */
  textSource: DraftSource | null;
  files: DraftSource[];
  scans: Record<string, ScanState>;
  scanSources: Record<string, DraftSource & { pageTitle?: string }>;
  /** Scans that found the "page" was really an image/video file. */
  retype: Record<string, MediaType>;
  overrides: Record<string, RowOverride>;
  selected: string[];
  anchor: string | null;
  batchTags: string;
  board: { on: boolean; name: string; touched: boolean };
  scanning: { done: number; total: number } | null;
  /** Set after a commit: the post-import screen shows this batch. */
  doneBatchId: string | null;
  setText: (t: string) => void;
  appendText: (t: string) => void;
  addFile: (name: string, text: string) => DraftSource;
  removeFile: (id: string) => void;
  setOverride: (keys: string[], patch: RowOverride) => void;
  setSelected: (keys: string[], anchor?: string | null) => void;
  setBatchTags: (t: string) => void;
  setBoard: (patch: Partial<DraftState['board']>) => void;
  scan: (urls: string[]) => Promise<void>;
  cancelScan: () => void;
  clear: () => void;
  commit: () => { batchId: string; boardId?: string; count: number } | null;
  showBatch: (id: string | null) => void;
}

let parseTimer: ReturnType<typeof setTimeout> | null = null;
let abort: AbortController | null = null;

const initial = () => ({
  text: '',
  textSource: null,
  files: [] as DraftSource[],
  scans: {} as Record<string, ScanState>,
  scanSources: {} as DraftState['scanSources'],
  retype: {} as Record<string, MediaType>,
  overrides: {} as Record<string, RowOverride>,
  selected: [] as string[],
  anchor: null,
  batchTags: '',
  board: { on: true, name: '', touched: false },
  scanning: null,
});

function parseSource(text: string, label: string, filename?: string): DraftSource {
  const p = parseInput(text, { filename });
  return { id: uid('src-'), label, kind: p.kind, candidates: p.candidates, dropped: p.dropped };
}

export const useImportDraft = create<DraftState>()((set, get) => ({
  ...initial(),
  doneBatchId: null,
  setText: (text) => {
    set({ text });
    if (parseTimer) clearTimeout(parseTimer);
    parseTimer = setTimeout(() => {
      const t = get().text;
      set({ textSource: t.trim() ? parseSource(t, 'Pasted') : null });
    }, 180);
  },
  appendText: (t) => {
    const cur = get().text;
    get().setText(cur && !cur.endsWith('\n') ? `${cur}\n${t}` : cur + t);
  },
  addFile: (name, text) => {
    const src = parseSource(text, name, name);
    set((s) => ({ files: [...s.files, src] }));
    return src;
  },
  removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  setOverride: (keys, patch) =>
    set((s) => {
      const overrides = { ...s.overrides };
      for (const k of keys) overrides[k] = { ...overrides[k], ...patch };
      return { overrides };
    }),
  setSelected: (selected, anchor) => set((s) => ({ selected, anchor: anchor === undefined ? s.anchor : anchor })),
  setBatchTags: (batchTags) => set({ batchTags }),
  setBoard: (patch) => set((s) => ({ board: { ...s.board, ...patch } })),
  scan: async (urls) => {
    const todo = [...new Set(urls)].filter((u) => get().scans[u]?.status !== 'running');
    if (!todo.length) return;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    set((s) => ({
      scanning: { done: 0, total: todo.length },
      scans: { ...s.scans, ...Object.fromEntries(todo.map((u) => [u, { status: 'running' as const, found: 0 }])) },
    }));
    const onResult = (r: ScanResult, done: number, total: number) => {
      set((s) => {
        const scans = { ...s.scans };
        const scanSources = { ...s.scanSources };
        const retype = { ...s.retype };
        if (!r.ok) scans[r.url] = { status: 'failed', found: 0, error: r.error };
        else if ('media' in r) {
          retype[r.url] = r.media;
          scans[r.url] = { status: 'ok', found: 0 };
        } else {
          const media = r.extraction.candidates.filter((c) => !c.role);
          scans[r.url] = media.length
            ? { status: 'ok', found: media.length }
            : { status: 'failed', found: 0, error: { kind: 'empty', message: 'No images or videos were readable on that page.' } };
          scanSources[r.url] = {
            id: uid('scan-'),
            label: r.url,
            kind: 'html',
            candidates: r.extraction.candidates,
            dropped: r.extraction.dropped,
            pageTitle: r.extraction.pageTitle,
          };
        }
        return { scans, scanSources, retype, scanning: done >= total ? null : { done, total } };
      });
    };
    await scanPages(todo, onResult, { signal });
    if (signal.aborted) {
      set((s) => ({
        scanning: null,
        scans: Object.fromEntries(Object.entries(s.scans).filter(([, v]) => v.status !== 'running')),
      }));
    }
  },
  cancelScan: () => {
    abort?.abort();
    set((s) => ({ scanning: null, scans: Object.fromEntries(Object.entries(s.scans).filter(([, v]) => v.status !== 'running')) }));
  },
  clear: () => {
    abort?.abort();
    if (parseTimer) clearTimeout(parseTimer);
    set({ ...initial(), doneBatchId: null });
  },
  commit: () => {
    const view = computeDraft(get());
    const chosen = view.candidates.filter((c) => c.include && !c.role && !c.flags.includes('in-library'));
    if (!chosen.length) return null;
    const s = get();
    const tags = parseTagInput(s.batchTags);
    const name = s.board.name.trim() || defaultBatchName(chosen);
    const batch: ImportBatch = {
      id: uid('batch-'),
      name,
      createdAt: Date.now(),
      tags,
      itemIds: [],
      source: s.files.length && (s.textSource?.candidates.length ?? 0) ? 'mixed' : s.files.length ? 'file' : 'paste',
      stats: {
        found: view.summary.total,
        imported: chosen.length,
        duplicates: view.summary.duplicates + view.summary.inLibrary,
        failed: chosen.filter((c) => c.flags.includes('scan-failed')).length,
        dropped: view.summary.dropped.junk + view.summary.dropped.ads + view.summary.dropped.refused,
      },
    };
    const taxonomy = useTaxonomy.getState().tx?.tags ?? [];
    const now = Date.now();
    const items = chosen.map((c, i) => itemFromCandidate(c, batch, { title: s.overrides[c.key]?.title, extraTags: s.overrides[c.key]?.tags, taxonomy, now: now + i }));
    const boardId = useStore.getState().commitImport(batch, items, s.board.on ? { name, emoji: '⇪' } : undefined);
    abort?.abort();
    set({ ...initial(), doneBatchId: batch.id });
    return { batchId: batch.id, boardId, count: items.length };
  },
  showBatch: (id) => set({ doneBatchId: id }),
}));

export interface DraftView {
  candidates: Candidate[];
  /** Clips (rows), excluding nav/sub-page links. */
  rows: Candidate[];
  nav: Candidate[];
  summary: ImportSummary;
  unscannedPages: string[];
  suggestions: string[];
  defaultName: string;
}

let memo: { key: unknown[]; view: DraftView } | null = null;

/** Finalise everything gathered so far, then apply the user's row overrides. */
export function computeDraft(s: Pick<DraftState, 'textSource' | 'files' | 'scanSources' | 'scans' | 'retype' | 'overrides' | 'batchTags'>): DraftView {
  const items = activeData(useStore.getState()).imports.items;
  const key = [s.textSource, s.files, s.scanSources, s.scans, s.retype, s.overrides, s.batchTags, items];
  if (memo && memo.key.every((k, i) => k === key[i])) return memo.view;
  const sources = [...(s.textSource ? [s.textSource] : []), ...s.files, ...Object.values(s.scanSources)];
  let dropped = emptyDrops();
  const raws: RawCandidate[] = [];
  for (const src of sources) {
    dropped = addDrops(dropped, src.dropped);
    for (const c of src.candidates) raws.push(s.retype[c.url] ? { ...c, mediaType: s.retype[c.url] } : c);
  }
  const existing = new Set(Object.values(items).map((i) => i.url));
  const scanned = new Map(
    Object.entries(s.scans)
      .filter(([, v]) => v.status !== 'running')
      .map(([u, v]) => [u, { ok: v.status === 'ok', found: s.retype[u] ? 0 : v.found, error: v.error }] as const),
  );
  const pageTitles = new Map(Object.entries(s.scanSources).filter(([, v]) => v.pageTitle).map(([u, v]) => [u, v.pageTitle!]));
  const f = finalize(raws, dropped, { existing, scanned, pageTitles });
  const candidates = f.candidates.map((c) => {
    const o = s.overrides[c.key];
    if (!o) return c;
    const locked = c.flags.includes('in-library');
    return { ...c, include: locked ? false : o.include ?? c.include, title: o.title ?? c.title, tags: o.tags ? [...new Set([...c.tags, ...o.tags])] : c.tags };
  });
  const rows = candidates.filter((c) => !c.role);
  const nav = candidates.filter((c) => c.role && !s.scans[c.url]);
  const summary = { ...f.summary, included: rows.filter((c) => c.include).length };
  const unscannedPages = rows.filter((c) => c.mediaType === 'page' && c.flags.includes('unscanned') && c.include).map((c) => c.url);
  const included = rows.filter((c) => c.include);
  const view: DraftView = {
    candidates,
    rows,
    nav,
    summary,
    unscannedPages,
    suggestions: suggestImportTags(included.length ? included : rows, parseTagInput(s.batchTags)),
    defaultName: defaultBatchName(included.length ? included : rows),
  };
  memo = { key, view };
  return view;
}

export function useDraftView(): DraftView {
  useStore((s) => activeData(s).imports.items); // re-render when the library changes (in-library flags)
  return useImportDraft((s) => computeDraft(s));
}
