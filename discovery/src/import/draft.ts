/**
 * The import being prepared: inputs, page scans, per-row overrides, and the
 * finalised preview. Session-only (never persisted) and shared by the import
 * sheet and the bulk title editor, so closing the sheet by accident doesn't
 * throw a half-reviewed batch away.
 */
import { create } from 'zustand';
import { useStore, activeData, onWipe } from '../state/store';
import { useTaxonomy } from '../state/taxonomy';
import { uid } from '../lib/id';
import { addDrops, emptyDrops, finalize, parseInput, textIsSafe, type InputKind, type RawCandidate } from './extract';
import { scanPages, type ScanResult } from './scan';
import { defaultBatchName, itemFromCandidate, itemIsSafe, parseTagInput, suggestImportTags } from './model';
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
  /** Served from this session's cache of earlier successful reads (no new request). */
  cached?: boolean;
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
  /** `label` names the chip when the file name isn't what the user would recognise. */
  addFile: (name: string, text: string, label?: string) => DraftSource;
  removeFile: (id: string) => void;
  setOverride: (keys: string[], patch: RowOverride) => void;
  setSelected: (keys: string[], anchor?: string | null) => void;
  setBatchTags: (t: string) => void;
  setBoard: (patch: Partial<DraftState['board']>) => void;
  /** `fresh` skips the session cache (a deliberate re-scan). */
  scan: (urls: string[], opts?: { fresh?: boolean }) => Promise<void>;
  /** A row's preview proved what a link really is (an extension-less link that loads as a picture). */
  markMedia: (url: string, type: MediaType) => void;
  /** Untick page links nobody has read yet, so the direct links can import on their own. */
  skipUnscannedPages: () => void;
  cancelScan: () => void;
  clear: () => void;
  commit: () => CommitResult;
  showBatch: (id: string | null) => void;
}

export type CommitResult =
  | { ok: true; batchId: string; boardId?: string; count: number; refused: number }
  | { ok: false; reason: 'empty' | 'unsafe-name' | 'unsafe-items' };

let parseTimer: ReturnType<typeof setTimeout> | null = null;
/** Every scan in flight; each has its own controller so a second scan never cancels the first. */
const controllers = new Set<AbortController>();
/** Bumped by clear/commit: results from an older draft are dropped, never written into a new one. */
let generation = 0;

function stopAll() {
  for (const c of controllers) c.abort();
  controllers.clear();
}

type Readable = Extract<ScanResult, { ok: true }>;
/**
 * Successful page reads for this session (memory only, never persisted), so
 * re-opening or re-pasting a gallery is instant and makes no new request.
 * Cleared on profile switch, when incognito ends, and on erase.
 */
const scanCache = new Map<string, Readable>();
const CACHE_MAX = 40;

function cacheScan(r: Readable) {
  scanCache.delete(r.url);
  scanCache.set(r.url, r);
  if (scanCache.size > CACHE_MAX) scanCache.delete(scanCache.keys().next().value!);
}

export function clearScanCache() {
  scanCache.clear();
}

/** Fold one scan result into draft state (shared by live scans and cache hits). */
function applyScan(s: DraftState, r: ScanResult, cached = false): Pick<DraftState, 'scans' | 'scanSources' | 'retype'> {
  const scans = { ...s.scans };
  const scanSources = { ...s.scanSources };
  const retype = { ...s.retype };
  if (!r.ok) scans[r.url] = { status: 'failed', found: 0, error: r.error };
  else if ('media' in r) {
    retype[r.url] = r.media;
    scans[r.url] = { status: 'ok', found: 0, cached };
  } else {
    const media = r.extraction.candidates.filter((c) => !c.role);
    scans[r.url] = media.length
      ? { status: 'ok', found: media.length, cached }
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
  return { scans, scanSources, retype };
}

/** Page links in `src` that this session already read successfully. */
function cachedPagesIn(src: DraftSource | null, scans: Record<string, ScanState>): Readable[] {
  if (!src) return [];
  return src.candidates.filter((c) => c.mediaType === 'page' && !c.role && !scans[c.url] && scanCache.has(c.url)).map((c) => scanCache.get(c.url)!);
}

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
      const textSource = t.trim() ? parseSource(t, 'Pasted') : null;
      set({ textSource });
      // Pages read earlier this session come back instantly, without a new request.
      for (const r of cachedPagesIn(textSource, get().scans)) set((st) => applyScan(st, r, true));
    }, 180);
  },
  appendText: (t) => {
    const cur = get().text;
    get().setText(cur && !cur.endsWith('\n') ? `${cur}\n${t}` : cur + t);
  },
  addFile: (name, text, label) => {
    const src = parseSource(text, label ?? name, name);
    set((s) => ({ files: [...s.files, src] }));
    for (const r of cachedPagesIn(src, get().scans)) set((st) => applyScan(st, r, true));
    return src;
  },
  markMedia: (url, type) => set((s) => (s.retype[url] === type ? {} : { retype: { ...s.retype, [url]: type } })),
  skipUnscannedPages: () => {
    const pending = computeDraft(get()).unscannedPages;
    if (pending.length) get().setOverride(pending, { include: false });
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
  scan: async (urls, opts = {}) => {
    const wanted = [...new Set(urls)].filter((u) => get().scans[u]?.status !== 'running');
    // Cache hits apply at once; only pages not read this session go to the network.
    const hits = opts.fresh ? [] : wanted.filter((u) => scanCache.has(u));
    for (const u of hits) set((st) => applyScan(st, scanCache.get(u)!, true));
    const todo = wanted.filter((u) => !hits.includes(u));
    if (!todo.length) return;
    const ctrl = new AbortController();
    const gen = generation;
    controllers.add(ctrl);
    set((s) => ({
      scanning: { done: s.scanning?.done ?? 0, total: (s.scanning?.total ?? 0) + todo.length },
      scans: { ...s.scans, ...Object.fromEntries(todo.map((u) => [u, { status: 'running' as const, found: 0 }])) },
    }));
    const onResult = (r: ScanResult) => {
      if (ctrl.signal.aborted || gen !== generation) return;
      if (r.ok) cacheScan(r);
      set((s) => {
        const done = (s.scanning?.done ?? 0) + 1;
        const total = s.scanning?.total ?? 0;
        return { ...applyScan(s, r), scanning: done >= total ? null : { done, total } };
      });
    };
    await scanPages(todo, onResult, { signal: ctrl.signal });
    controllers.delete(ctrl);
    if (ctrl.signal.aborted && gen === generation) {
      // Cancelled pages go back to "not scanned", not "couldn't read".
      const mine = new Set(todo);
      set((s) => ({
        scans: Object.fromEntries(Object.entries(s.scans).filter(([u, v]) => !(mine.has(u) && v.status === 'running'))),
        scanning: controllers.size ? s.scanning : null,
      }));
    }
  },
  cancelScan: () => {
    stopAll();
    set((s) => ({ scanning: null, scans: Object.fromEntries(Object.entries(s.scans).filter(([, v]) => v.status !== 'running')) }));
  },
  clear: () => {
    generation++;
    stopAll();
    if (parseTimer) clearTimeout(parseTimer);
    set({ ...initial(), doneBatchId: null });
  },
  commit: () => {
    const view = computeDraft(get());
    const chosen = view.candidates.filter((c) => c.include && !c.role && !c.flags.includes('in-library'));
    if (!chosen.length) return { ok: false, reason: 'empty' };
    const s = get();
    const tags = parseTagInput(s.batchTags);
    const name = s.board.name.trim() || defaultBatchName(chosen);
    // Typed text passes the same gate as search: the name, the batch tags, and every item below.
    if (!textIsSafe(name, tags)) return { ok: false, reason: 'unsafe-name' };
    const batch: ImportBatch = {
      id: uid('batch-'),
      name,
      createdAt: Date.now(),
      tags,
      itemIds: [],
      source: s.files.length && (s.textSource?.candidates.length ?? 0) ? 'mixed' : s.files.length ? 'file' : 'paste',
      stats: { found: 0, imported: 0, duplicates: 0, failed: 0, dropped: 0 },
    };
    const taxonomy = useTaxonomy.getState().tx?.tags ?? [];
    const now = Date.now();
    const built = chosen.map((c, i) => itemFromCandidate(c, batch, { title: s.overrides[c.key]?.title, extraTags: s.overrides[c.key]?.tags, taxonomy, now: now + i }));
    const items = built.filter(itemIsSafe);
    const refused = built.length - items.length;
    if (!items.length) return { ok: false, reason: 'unsafe-items' };
    batch.stats = {
      found: view.summary.total,
      imported: items.length,
      duplicates: view.summary.duplicates + view.summary.inLibrary,
      failed: items.filter((i) => chosen.find((c) => c.key === i.url)?.flags.includes('scan-failed')).length,
      dropped: view.summary.dropped.junk + view.summary.dropped.ads + view.summary.dropped.refused + view.summary.dropped.overflow + refused,
    };
    const boardId = useStore.getState().commitImport(batch, items, s.board.on ? { name, emoji: '⇪' } : undefined);
    generation++;
    stopAll();
    set({ ...initial(), doneBatchId: batch.id });
    return { ok: true, batchId: batch.id, boardId, count: items.length, refused };
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
let finalMemo: { key: unknown[]; f: ReturnType<typeof finalize> } | null = null;

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/** Finalise everything gathered so far, then apply the user's row overrides. */
export function computeDraft(s: Pick<DraftState, 'textSource' | 'files' | 'scanSources' | 'scans' | 'retype' | 'overrides' | 'batchTags'>): DraftView {
  const items = activeData(useStore.getState()).imports.items;
  const key = [s.textSource, s.files, s.scanSources, s.scans, s.retype, s.overrides, s.batchTags, items];
  if (memo && same(memo.key, key)) return memo.view;
  // The expensive pass (dedupe, variants, safety, titles) doesn't depend on row overrides,
  // so ticking a checkbox on a 2,000-row import doesn't redo it.
  const fkey = [s.textSource, s.files, s.scanSources, s.scans, s.retype, items];
  let f: ReturnType<typeof finalize>;
  if (finalMemo && same(finalMemo.key, fkey)) f = finalMemo.f;
  else {
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
    f = finalize(raws, dropped, { existing, scanned, pageTitles });
    finalMemo = { key: fkey, f };
  }
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

// A draft belongs to the profile (and the incognito session) it was started in.
// Switching profile, or ending incognito, throws it away rather than letting it
// commit into the wrong silo or outlive the session it was made in.
useStore.subscribe((s, prev) => {
  if (s.activeProfileId !== prev.activeProfileId || (prev.incognito && !s.incognito)) {
    clearScanCache();
    useImportDraft.getState().clear();
  }
});
onWipe(clearScanCache);
