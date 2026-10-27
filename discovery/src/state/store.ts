/**
 * Persistent app state. Local-first: everything lives in IndexedDB on the
 * device. Each taste profile is a full silo — its own signals, paths,
 * library, history, filters, and blocks.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Filters, VideoSummary } from '../data/types';
import { emptyFilters, normalizeFilters } from '../engine/filters';
import { emptyBlocks } from '../engine/ranking';
import { emptyOverrides, SIGNAL_VALUE } from '../engine/learning';
import { createPath, IMPORTED_PATH_ID } from '../engine/paths';
import type { Blocks, Board, FilterPreset, HistoryEntry, Overrides, Path, Profile, SaveRecord, Signal, SignalKind } from '../engine/types';
import { DEFAULT_MOCK_CONFIG, type MockConfig } from '../data/mock/mockSource';
import { uid } from '../lib/id';
import { idbPersistStorage, setPersistencePaused } from './storage';
import { clone } from '../lib/clone';
import { useUI } from './ui';
import { emptyImports, type ImportBatch, type ImportItem, type ImportsData } from '../import/types';
import { isImportId, itemIsSafe } from '../import/model';
import { hostOf, normalizeUrl } from '../import/urls';
import { checkQuery } from '../data/safety';
import { setImportProvider } from '../import/registry';

export interface Settings {
  ageConfirmedAt?: number;
  muted: boolean;
  haptics: boolean;
  /** discovery: vertical swipes save/capture; classic: vertical swipes navigate (TikTok-style). */
  gestureScheme: 'discovery' | 'classic';
  leftHanded: boolean;
  advanceOnJudge: boolean;
  advanceOnSave: boolean;
  immersive: boolean;
  /** Data saver also defers remote thumbnails (imports) until asked. */
  dataSaver: boolean;
  discreet: boolean;
  /** How imported stills fill the screen. */
  imageFit: 'contain' | 'cover';
  pauseLearning: boolean;
  /** SHA-256 of the app-lock PIN, if set. */
  pinHash?: string;
  lockAfterMin: number;
  mock: MockConfig;
}

export interface ProfileData {
  signals: Signal[];
  overrides: Overrides;
  blocks: Blocks;
  filters: Filters;
  presets: FilterPreset[];
  paths: Path[];
  activePathId: string;
  saves: SaveRecord[];
  boards: Board[];
  history: HistoryEntry[];
  recentSearches: string[];
  /** Dismissed AI suggestion ids. */
  dismissed: string[];
  /** Personal Import: batches and the items they brought in. */
  imports: ImportsData;
}

export type ImportPatch = Partial<Pick<ImportItem, 'title' | 'tags' | 'tagIds' | 'notes'>>;

export const BUILTIN_PRESETS: FilterPreset[] = [
  { id: 'pre-short', name: 'Short & sweet', builtIn: true, filters: { duration: { max: 8 } } },
  { id: 'pre-long', name: 'Long watch', builtIn: true, filters: { duration: { min: 20 } } },
  { id: 'pre-4k', name: '4K only', builtIn: true, filters: { quality: ['4K'] } },
  { id: 'pre-cine', name: 'Cinematic', builtIn: true, filters: { styles: ['cinematic'] } },
  { id: 'pre-fresh', name: 'Fresh', builtIn: true, filters: { preferNew: true, year: { min: 2025 } } },
  { id: 'pre-explore', name: 'Explore more', builtIn: true, filters: { exploration: 0.75 } },
];

const MAX_SIGNALS = 4000;
const REPLACES: Partial<Record<SignalKind, SignalKind[]>> = {
  like: ['like', 'dislike'],
  dislike: ['like', 'dislike'],
  more: ['more', 'less'],
  less: ['more', 'less'],
  capture: ['capture'],
  save: ['save'],
};
let rehydratingFromIncognito = false;
const wipeHooks: (() => void)[] = [];
/** In-memory caches elsewhere (reasons, search text) register here to be cleared on erase/import. */
export function onWipe(fn: () => void) {
  wipeHooks.push(fn);
}
const MAX_HISTORY = 3000;
const MAX_PATHS = 14;
const SESSION_GAP_MS = 30 * 60 * 1000;

export const PROFILE_COLORS = ['#a78bfa', '#f472b6', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#c084fc', '#22d3ee'];
export const PROFILE_EMOJI = ['🌙', '🔥', '🌊', '🌿', '✨', '🍷', '🎞️', '🪩', '🫧', '🦋'];

function freshProfileData(): ProfileData {
  const forYou = createPath({ kind: 'forYou' }, 'For You', { pinned: true });
  return {
    signals: [],
    overrides: emptyOverrides(),
    blocks: emptyBlocks(),
    filters: emptyFilters(),
    presets: [],
    paths: [forYou],
    activePathId: forYou.id,
    saves: [],
    boards: [],
    history: [],
    recentSearches: [],
    dismissed: [],
    imports: emptyImports(),
  };
}

function defaultSettings(): Settings {
  return {
    muted: true,
    haptics: true,
    gestureScheme: 'discovery',
    leftHanded: false,
    advanceOnJudge: true,
    advanceOnSave: true,
    immersive: false,
    dataSaver: false,
    discreet: false,
    pauseLearning: false,
    imageFit: 'contain',
    lockAfterMin: 5,
    mock: { ...DEFAULT_MOCK_CONFIG },
  };
}

const firstProfile: Profile = { id: 'main', name: 'Main', emoji: '🌙', color: PROFILE_COLORS[0], createdAt: Date.now() };

export interface AppState {
  hydrated: boolean;
  settings: Settings;
  profiles: Profile[];
  activeProfileId: string;
  data: Record<string, ProfileData>;
  /** Snapshot of every video referenced anywhere, so the library works offline and after reloads. */
  content: Record<string, VideoSummary>;
  hints: Record<string, boolean>;
  /** Session-only: nothing is recorded while true. Never persisted. */
  incognito: boolean;
  sessionId: string;

  // settings
  setSettings: (patch: Partial<Settings>) => void;
  setIncognito: (on: boolean) => void;
  markHint: (key: string) => void;
  resetHints: () => void;

  // profiles
  createProfile: (p: { name: string; emoji: string; color: string; copyFrom?: string }) => string;
  switchProfile: (id: string) => void;
  updateProfile: (id: string, patch: Partial<Pick<Profile, 'name' | 'emoji' | 'color'>>) => void;
  deleteProfile: (id: string) => void;
  resetLearning: (id?: string) => void;

  // content
  rememberContent: (videos: VideoSummary[]) => void;

  // learning
  addSignal: (kind: SignalKind, videoId: string, extra?: Partial<Signal>) => string | null;
  removeSignal: (id: string) => void;
  setOverride: (type: keyof Overrides, id: string, value: number | null) => void;
  addBlock: (type: keyof Blocks, id: string) => void;
  removeBlock: (type: keyof Blocks, id: string) => void;

  // filters
  setFilters: (f: Partial<Filters>) => void;
  setPathFilters: (pathId: string, f: Partial<Filters> | undefined) => void;
  savePreset: (name: string, f: Partial<Filters>) => void;
  deletePreset: (id: string) => void;

  // paths
  addPath: (path: Path, activate?: boolean) => void;
  setActivePath: (id: string) => void;
  updatePath: (id: string, patch: Partial<Path>) => void;
  /** Update a path in a specific profile (async loaders must not write into whichever profile is active now). */
  updatePathFor: (profileId: string, id: string, patch: Partial<Path>) => void;
  removePath: (id: string) => void;

  // library
  addSave: (rec: Omit<SaveRecord, 'savedAt' | 'note' | 'customTags'> & Partial<SaveRecord>) => void;
  removeSave: (videoId: string) => void;
  updateSave: (videoId: string, patch: Partial<SaveRecord>) => void;
  createBoard: (name: string, emoji: string, videoIds?: string[], fromSuggestion?: boolean) => string;
  updateBoard: (id: string, patch: Partial<Pick<Board, 'name' | 'emoji' | 'videoIds'>>) => void;
  toggleInBoard: (boardId: string, videoId: string) => void;
  deleteBoard: (id: string) => void;
  dismiss: (id: string) => void;

  // imports
  /** Commit a reviewed batch. Returns the board id when one was created. */
  commitImport: (batch: ImportBatch, items: ImportItem[], board?: { name: string; emoji: string }) => string | undefined;
  /** Returns how many patches were refused (unsafe text, or an empty title). */
  updateImports: (patches: Record<string, ImportPatch>) => number;
  /** False when the name was refused by the safety gate. */
  renameImportBatch: (batchId: string, name: string) => boolean;
  /** Delete imported items everywhere they're referenced (saves, boards, signals, history, queues). */
  deleteImports: (ids: string[]) => void;
  deleteImportBatch: (batchId: string) => void;

  // history
  addHistory: (e: Omit<HistoryEntry, 'id' | 'sessionId'>) => string | null;
  updateHistory: (id: string, patch: Partial<HistoryEntry>) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;

  // data controls
  wipeEverything: () => void;
  importData: (json: string) => void;
}

type Persisted = Pick<AppState, 'settings' | 'profiles' | 'activeProfileId' | 'data' | 'content' | 'hints'>;

/** Immutable update of the active profile's data. */
function patchActive(s: AppState, fn: (d: ProfileData) => Partial<ProfileData>): Partial<AppState> {
  const d = s.data[s.activeProfileId];
  return { data: { ...s.data, [s.activeProfileId]: { ...d, ...fn(d) } } };
}

function referencedIds(data: Record<string, ProfileData>): Set<string> {
  const ids = new Set<string>();
  for (const d of Object.values(data)) {
    d.signals.forEach((s) => ids.add(s.videoId));
    d.saves.forEach((s) => ids.add(s.videoId));
    d.history.forEach((h) => ids.add(h.videoId));
    d.boards.forEach((b) => b.videoIds.forEach((id) => ids.add(id)));
    d.paths.forEach((p) => p.queue.forEach((id) => ids.add(id)));
  }
  return ids;
}

function prune(content: Record<string, VideoSummary>, data: Record<string, ProfileData>): Record<string, VideoSummary> {
  const keep = referencedIds(data);
  return Object.fromEntries(Object.entries(content).filter(([id]) => keep.has(id)));
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string') : []);
const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

/**
 * Restored data (a backup someone may have edited) is untrusted: URLs must be
 * http(s), text must be text, every item must belong to exactly one batch, and
 * everything must pass the safety gate.
 */
function normalizeImports(raw: Partial<ImportsData> | undefined): ImportsData {
  if (!raw || typeof raw !== 'object') return emptyImports();
  const candidates: Record<string, ImportItem> = {};
  for (const [id, it] of Object.entries(raw.items && typeof raw.items === 'object' ? raw.items : {})) {
    if (!it || typeof it !== 'object' || !isImportId(id)) continue;
    const url = typeof it.url === 'string' ? normalizeUrl(it.url) : null;
    if (!url) continue;
    const originalUrl = (typeof it.originalUrl === 'string' && normalizeUrl(it.originalUrl)) || url;
    const thumbnailUrl = (typeof it.thumbnailUrl === 'string' && normalizeUrl(it.thumbnailUrl)) || undefined;
    const item: ImportItem = {
      id,
      batchId: typeof it.batchId === 'string' ? it.batchId : '',
      url,
      mediaType: it.mediaType === 'image' || it.mediaType === 'video' ? it.mediaType : 'page',
      title: typeof it.title === 'string' && it.title.trim() ? it.title.slice(0, 140) : hostOf(url) || url,
      tags: strings(it.tags).slice(0, 40),
      tagIds: strings(it.tagIds),
      originalUrl,
      thumbnailUrl,
      width: typeof it.width === 'number' ? it.width : undefined,
      height: typeof it.height === 'number' ? it.height : undefined,
      host: typeof it.host === 'string' && it.host ? it.host : hostOf(originalUrl) || hostOf(url),
      groupKey: typeof it.groupKey === 'string' ? it.groupKey : '',
      notes: typeof it.notes === 'string' ? it.notes.slice(0, 2000) : '',
      addedAt: num(it.addedAt, Date.now()),
    };
    if (itemIsSafe(item)) candidates[id] = item;
  }
  const claimed = new Set<string>();
  const items: Record<string, ImportItem> = {};
  const batches: ImportBatch[] = [];
  for (const b of Array.isArray(raw.batches) ? raw.batches : []) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string') continue;
    // Each item belongs to the first batch that lists it; duplicates are dropped.
    const itemIds = strings(b.itemIds).filter((id) => candidates[id] && !claimed.has(id) && (claimed.add(id), true));
    if (!itemIds.length) continue;
    const createdAt = num(b.createdAt, Date.now());
    const name = typeof b.name === 'string' && b.name.trim() && checkQuery(b.name).ok ? b.name.slice(0, 80) : `Import ${new Date(createdAt).toISOString().slice(0, 10)}`;
    const st = (b.stats ?? {}) as Partial<ImportBatch['stats']>;
    batches.push({
      id: b.id,
      name,
      createdAt,
      tags: strings(b.tags),
      boardId: typeof b.boardId === 'string' ? b.boardId : undefined,
      itemIds,
      source: b.source === 'file' || b.source === 'mixed' ? b.source : 'paste',
      stats: { found: num(st.found, itemIds.length), imported: num(st.imported, itemIds.length), duplicates: num(st.duplicates, 0), failed: num(st.failed, 0), dropped: num(st.dropped, 0) },
    });
    for (const id of itemIds) items[id] = { ...candidates[id], batchId: b.id, groupKey: candidates[id].groupKey || b.id };
  }
  // Items no batch lists are dropped: they'd be invisible yet still block re-importing.
  return { batches, items };
}

/** Normalise persisted (or imported) state into a complete, safe AppState. */
function mergePersisted(p: Partial<Persisted>, current: AppState): AppState {
  const data: Record<string, ProfileData> = {};
  const rawData = p.data && typeof p.data === 'object' ? p.data : current.data;
  for (const [id, raw] of Object.entries(rawData)) {
    const d = (raw ?? {}) as Partial<ProfileData>;
    const fresh = freshProfileData();
    const arr = <T,>(x: T[] | undefined, fallback: T[]) => (Array.isArray(x) ? x : fallback);
    const merged: ProfileData = {
      ...fresh,
      ...d,
      signals: arr(d.signals, []),
      paths: arr(d.paths, fresh.paths).filter((x) => x && x.seed && Array.isArray(x.queue)),
      saves: arr(d.saves, []),
      boards: arr(d.boards, []),
      history: arr(d.history, []),
      presets: arr(d.presets, []),
      recentSearches: arr(d.recentSearches, []),
      dismissed: arr(d.dismissed, []),
      filters: normalizeFilters(d.filters),
      blocks: { ...emptyBlocks(), ...d.blocks },
      overrides: { ...emptyOverrides(), ...d.overrides },
      imports: normalizeImports(d.imports),
    };
    if (!merged.paths.some((x) => x.seed.kind === 'forYou')) merged.paths.unshift(fresh.paths[0]);
    if (!merged.paths.some((x) => x.id === merged.activePathId)) merged.activePathId = merged.paths[0].id;
    data[id] = merged;
  }
  let profiles = Array.isArray(p.profiles) ? p.profiles.filter((x) => x && data[x.id]) : current.profiles.filter((x) => data[x.id]);
  if (!profiles.length) {
    const id = Object.keys(data)[0] ?? firstProfile.id;
    if (!data[id]) data[id] = freshProfileData();
    profiles = [{ ...firstProfile, id }];
  }
  return {
    ...current,
    ...p,
    settings: { ...defaultSettings(), ...p.settings, mock: { ...DEFAULT_MOCK_CONFIG, ...p.settings?.mock } },
    profiles,
    data,
    activeProfileId: p.activeProfileId && data[p.activeProfileId] ? p.activeProfileId : profiles[0].id,
    content: prune(p.content && typeof p.content === 'object' ? p.content : {}, data),
    hints: p.hints ?? {},
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      settings: defaultSettings(),
      profiles: [firstProfile],
      activeProfileId: firstProfile.id,
      data: { [firstProfile.id]: freshProfileData() },
      content: {},
      hints: {},
      incognito: false,
      sessionId: uid('ses-'),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setIncognito: (on) => {
        if (on === get().incognito) return;
        if (on) {
          // Flush the pre-incognito state, then write nothing until incognito ends.
          setPersistencePaused(true);
          set({ incognito: true });
          return;
        }
        // Ending incognito discards the session: reload the last state written
        // before it started (paths, positions, anything new), then resume writes.
        set({ incognito: false });
        rehydratingFromIncognito = true;
        void Promise.resolve(useStore.persist.rehydrate()).finally(() => {
          rehydratingFromIncognito = false;
          useStore.setState({ incognito: false });
          setPersistencePaused(false);
        });
      },
      markHint: (key) => set((s) => ({ hints: { ...s.hints, [key]: true } })),
      resetHints: () => set({ hints: {} }),

      createProfile: ({ name, emoji, color, copyFrom }) => {
        const id = uid('prof-');
        set((s) => {
          const base = copyFrom && s.data[copyFrom] ? clone(s.data[copyFrom]) : freshProfileData();
          return {
            profiles: [...s.profiles, { id, name, emoji, color, createdAt: Date.now() }],
            data: { ...s.data, [id]: base },
            activeProfileId: id,
          };
        });
        return id;
      },
      switchProfile: (id) => set((s) => (s.data[id] ? { activeProfileId: id } : {})),
      updateProfile: (id, patch) => set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteProfile: (id) =>
        set((s) => {
          if (s.profiles.length <= 1) return {};
          const profiles = s.profiles.filter((p) => p.id !== id);
          const data = { ...s.data };
          delete data[id];
          return {
            profiles,
            data,
            activeProfileId: s.activeProfileId === id ? profiles[0].id : s.activeProfileId,
            content: prune(s.content, data),
          };
        }),
      resetLearning: (id) =>
        set((s) => {
          const pid = id ?? s.activeProfileId;
          const d = s.data[pid];
          if (!d) return {};
          const data = { ...s.data, [pid]: { ...d, signals: [], overrides: emptyOverrides(), dismissed: [] } };
          return { data, content: prune(s.content, data) };
        }),

      rememberContent: (videos) =>
        set((s) => {
          let changed = false;
          const content = { ...s.content };
          for (const v of videos) {
            // Imports live in their batch and are read from it live; a snapshot would go stale.
            if (!content[v.id] && !isImportId(v.id)) {
              content[v.id] = v;
              changed = true;
            }
          }
          return changed ? { content } : {};
        }),

      addSignal: (kind, videoId, extra) => {
        const s = get();
        if (s.incognito || s.settings.pauseLearning) return null;
        const sig: Signal = { id: uid('sig-'), kind, videoId, at: Date.now(), value: SIGNAL_VALUE[kind], ...extra };
        // An explicit judgement replaces the previous one on the same clip, so
        // repeated likes (double-tap spam) don't stack and a change of mind wins.
        const replaces = REPLACES[kind];
        set((st) =>
          patchActive(st, (d) => {
            let signals = [...(replaces ? d.signals.filter((x) => !(x.videoId === videoId && replaces.includes(x.kind))) : d.signals), sig];
            if (signals.length > MAX_SIGNALS) {
              // Drop the oldest implicit signals first; explicit judgements are worth keeping.
              const implicitIdx = signals.findIndex((x) => x.kind === 'watch' || x.kind === 'skip');
              signals.splice(implicitIdx >= 0 ? implicitIdx : 0, 1);
            }
            return { signals };
          }),
        );
        return sig.id;
      },
      removeSignal: (id) => set((s) => patchActive(s, (d) => ({ signals: d.signals.filter((x) => x.id !== id) }))),
      setOverride: (type, id, value) =>
        set((s) =>
          patchActive(s, (d) => {
            const next = { ...d.overrides[type] };
            if (value == null) delete next[id];
            else next[id] = value;
            return { overrides: { ...d.overrides, [type]: next } };
          }),
        ),
      addBlock: (type, id) =>
        set((s) => patchActive(s, (d) => ({ blocks: { ...d.blocks, [type]: d.blocks[type].includes(id) ? d.blocks[type] : [...d.blocks[type], id] } }))),
      removeBlock: (type, id) => set((s) => patchActive(s, (d) => ({ blocks: { ...d.blocks, [type]: d.blocks[type].filter((x) => x !== id) } }))),

      setFilters: (f) => set((s) => patchActive(s, () => ({ filters: normalizeFilters(f) }))),
      setPathFilters: (pathId, f) => set((s) => patchActive(s, (d) => ({ paths: d.paths.map((p) => (p.id === pathId ? { ...p, filters: f } : p)) }))),
      savePreset: (name, f) => set((s) => patchActive(s, (d) => ({ presets: [...d.presets, { id: uid('pre-'), name, filters: clone(f) }] }))),
      deletePreset: (id) => set((s) => patchActive(s, (d) => ({ presets: d.presets.filter((p) => p.id !== id) }))),

      addPath: (path, activate = true) =>
        set((s) =>
          patchActive(s, (d) => {
            let paths = [...d.paths.filter((p) => p.id !== path.id), path];
            if (paths.length > MAX_PATHS) {
              const victim = paths
                .filter((p) => !p.pinned && p.id !== d.activePathId && p.id !== path.id)
                .sort((a, b) => a.updatedAt - b.updatedAt)[0];
              if (victim) paths = paths.filter((p) => p.id !== victim.id);
            }
            return { paths, activePathId: activate ? path.id : d.activePathId };
          }),
        ),
      setActivePath: (id) => set((s) => patchActive(s, (d) => (d.paths.some((p) => p.id === id) ? { activePathId: id } : {}))),
      updatePath: (id, patch) =>
        set((s) => patchActive(s, (d) => ({ paths: d.paths.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) }))),
      updatePathFor: (profileId, id, patch) =>
        set((s) => {
          const d = s.data[profileId];
          if (!d) return {};
          return { data: { ...s.data, [profileId]: { ...d, paths: d.paths.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) } } };
        }),
      removePath: (id) =>
        set((s) =>
          patchActive(s, (d) => {
            const target = d.paths.find((p) => p.id === id);
            if (!target || target.seed.kind === 'forYou') return {};
            const paths = d.paths.filter((p) => p.id !== id);
            return { paths, activePathId: d.activePathId === id ? paths[0].id : d.activePathId };
          }),
        ),

      addSave: (rec) =>
        set((s) =>
          patchActive(s, (d) => {
            if (d.saves.some((x) => x.videoId === rec.videoId)) return {};
            const full: SaveRecord = { savedAt: Date.now(), note: '', customTags: [], ...rec };
            return { saves: [full, ...d.saves] };
          }),
        ),
      removeSave: (videoId) =>
        set((s) =>
          patchActive(s, (d) => ({
            saves: d.saves.filter((x) => x.videoId !== videoId),
            // The save signal goes with it so un-saving is a true undo for learning.
            signals: d.signals.filter((x) => !(x.kind === 'save' && x.videoId === videoId)),
          })),
        ),
      updateSave: (videoId, patch) => set((s) => patchActive(s, (d) => ({ saves: d.saves.map((x) => (x.videoId === videoId ? { ...x, ...patch } : x)) }))),
      createBoard: (name, emoji, videoIds = [], fromSuggestion) => {
        const id = uid('board-');
        set((s) => patchActive(s, (d) => ({ boards: [...d.boards, { id, name, emoji, createdAt: Date.now(), videoIds, fromSuggestion }] })));
        return id;
      },
      updateBoard: (id, patch) => set((s) => patchActive(s, (d) => ({ boards: d.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))),
      toggleInBoard: (boardId, videoId) =>
        set((s) =>
          patchActive(s, (d) => ({
            boards: d.boards.map((b) =>
              b.id !== boardId ? b : { ...b, videoIds: b.videoIds.includes(videoId) ? b.videoIds.filter((x) => x !== videoId) : [videoId, ...b.videoIds] },
            ),
          })),
        ),
      deleteBoard: (id) => set((s) => patchActive(s, (d) => ({ boards: d.boards.filter((b) => b.id !== id) }))),
      dismiss: (id) => set((s) => patchActive(s, (d) => ({ dismissed: d.dismissed.includes(id) ? d.dismissed : [...d.dismissed, id] }))),

      commitImport: (batch, items, board) => {
        // Defence in depth: the draft gates too, but nothing unsafe gets into the store by any route.
        const safe = items.filter(itemIsSafe);
        const boardId = board && safe.length ? uid('board-') : undefined;
        if (!checkQuery(`${batch.name} ${batch.tags.join(' ')}`).ok) batch = { ...batch, name: `Import ${new Date(batch.createdAt).toISOString().slice(0, 10)}`, tags: [] };
        if (board && !checkQuery(board.name).ok) board = { ...board, name: batch.name };
        set((s) =>
          patchActive(s, (d) => {
            const fresh = safe.filter((it) => !d.imports.items[it.id]);
            const all = { ...d.imports.items };
            for (const it of fresh) all[it.id] = { ...it, batchId: batch.id };
            const saved: ImportBatch = { ...batch, itemIds: fresh.map((i) => i.id), boardId };
            const boards = boardId ? [...d.boards, { id: boardId, name: board!.name, emoji: board!.emoji, createdAt: Date.now(), videoIds: saved.itemIds }] : d.boards;
            // The persistent "Imported" path appears with the first import and reopens whenever more arrive.
            let paths = d.paths.map((p) => (p.seed.kind === 'imported' && !p.seed.batchId ? { ...p, exhausted: false, cursor: undefined } : p));
            if (!paths.some((p) => p.id === IMPORTED_PATH_ID)) paths = [...paths, createPath({ kind: 'imported', label: 'Imported' }, 'Imported', { pinned: true })];
            return { imports: { batches: [saved, ...d.imports.batches.filter((b) => b.id !== batch.id)], items: all }, boards, paths };
          }),
        );
        return boardId;
      },
      updateImports: (patches) => {
        let refused = 0;
        set((s) =>
          patchActive(s, (d) => {
            const items = { ...d.imports.items };
            let changed = false;
            for (const [id, raw] of Object.entries(patches)) {
              if (!items[id]) continue;
              const patch = { ...raw };
              if (patch.title !== undefined) {
                patch.title = patch.title.replace(/\s+/g, ' ').trim().slice(0, 140);
                if (!patch.title) delete patch.title; // an empty title keeps the old one
              }
              const next = { ...items[id], ...patch };
              if (!itemIsSafe(next)) {
                refused++;
                continue;
              }
              items[id] = next;
              changed = true;
            }
            return changed ? { imports: { ...d.imports, items } } : {};
          }),
        );
        return refused;
      },
      renameImportBatch: (batchId, raw) => {
        const name = raw.replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!name) return true;
        if (!checkQuery(name).ok) return false;
        set((s) => patchActive(s, (d) => ({ imports: { ...d.imports, batches: d.imports.batches.map((b) => (b.id === batchId ? { ...b, name } : b)) } })));
        return true;
      },
      deleteImports: (ids) =>
        set((s) =>
          patchActive(s, (d) => {
            const gone = new Set(ids.filter((id) => d.imports.items[id]));
            if (!gone.size) return {};
            const items = Object.fromEntries(Object.entries(d.imports.items).filter(([id]) => !gone.has(id)));
            const batches = d.imports.batches.map((b) => ({ ...b, itemIds: b.itemIds.filter((id) => !gone.has(id)) })).filter((b) => b.itemIds.length > 0);
            const seededOnGone = (p: Path) => (p.seed.kind === 'related' || p.seed.kind === 'visual') && gone.has(p.seed.videoId);
            const paths = d.paths
              .filter((p) => !(p.seed.kind === 'imported' && p.seed.batchId && !batches.some((b) => b.id === (p.seed as { batchId?: string }).batchId)))
              .filter((p) => !seededOnGone(p))
              .map((p) => {
                // Imported paths page by offset into the import list, which just shrank: restart
                // their cursor (ranking already skips what's queued) so nothing unseen is skipped.
                const restart = p.seed.kind === 'imported' ? { cursor: undefined, exhausted: false } : {};
                if (!p.queue.some((id) => gone.has(id))) return { ...p, ...restart };
                const before = p.queue.slice(0, p.index).filter((id) => gone.has(id)).length;
                const queue = p.queue.filter((id) => !gone.has(id));
                return { ...p, ...restart, queue, index: Math.max(0, Math.min(queue.length, p.index - before)) };
              });
            // A board an import created goes once it's empty; boards the user made stay.
            const autoBoards = new Set(d.imports.batches.map((b) => b.boardId).filter(Boolean));
            const activePathId = paths.some((p) => p.id === d.activePathId) ? d.activePathId : paths[0].id;
            return {
              imports: { batches, items },
              saves: d.saves.filter((x) => !gone.has(x.videoId)),
              boards: d.boards
                .map((b) => (b.videoIds.some((id) => gone.has(id)) ? { ...b, videoIds: b.videoIds.filter((id) => !gone.has(id)) } : b))
                .filter((b) => !(autoBoards.has(b.id) && !b.videoIds.length)),
              signals: d.signals.filter((x) => !gone.has(x.videoId)),
              history: d.history.filter((h) => !gone.has(h.videoId)),
              blocks: { ...d.blocks, videos: d.blocks.videos.filter((id) => !gone.has(id)) },
              paths,
              activePathId,
            };
          }),
        ),
      deleteImportBatch: (batchId) => {
        const d = activeData(get());
        const batch = d.imports.batches.find((b) => b.id === batchId);
        if (!batch) return;
        get().deleteImports(batch.itemIds); // also removes its auto-created board once empty
        set((s) => patchActive(s, (dd) => ({ imports: { ...dd.imports, batches: dd.imports.batches.filter((x) => x.id !== batchId) } })));
      },

      addHistory: (e) => {
        const s = get();
        if (s.incognito) return null;
        const d = s.data[s.activeProfileId];
        const last = d.history[d.history.length - 1];
        let sessionId = s.sessionId;
        if (last && e.at - last.at > SESSION_GAP_MS && last.sessionId === sessionId) {
          sessionId = uid('ses-');
          set({ sessionId });
        }
        const entry: HistoryEntry = { ...e, id: uid('h-'), sessionId };
        set((st) =>
          patchActive(st, (dd) => {
            const history = [...dd.history, entry];
            return { history: history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history };
          }),
        );
        return entry.id;
      },
      updateHistory: (id, patch) => set((s) => patchActive(s, (d) => ({ history: d.history.map((h) => (h.id === id ? { ...h, ...patch } : h)) }))),
      removeHistory: (id) => set((s) => patchActive(s, (d) => ({ history: d.history.filter((h) => h.id !== id) }))),
      clearHistory: () => set((s) => patchActive(s, () => ({ history: [] }))),
      addRecentSearch: (q) => {
        if (get().incognito) return;
        set((s) => patchActive(s, (d) => ({ recentSearches: [q, ...d.recentSearches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12) })));
      },
      clearRecentSearches: () => set((s) => patchActive(s, () => ({ recentSearches: [] }))),

      wipeEverything: () => {
        for (const fn of wipeHooks) fn();
        set({
          settings: { ...defaultSettings(), ageConfirmedAt: get().settings.ageConfirmedAt },
          profiles: [{ ...firstProfile, createdAt: Date.now() }],
          activeProfileId: firstProfile.id,
          data: { [firstProfile.id]: freshProfileData() },
          content: {},
          hints: {},
        });
      },
      importData: (json) => {
        const parsed = JSON.parse(json) as Partial<Persisted> & { app?: string };
        if (parsed.app !== 'ph-discovery' || !Array.isArray(parsed.profiles) || !parsed.profiles.length || !parsed.data || typeof parsed.data !== 'object') {
          throw new Error('Not a PH Discovery export');
        }
        for (const fn of wipeHooks) fn();
        // Same normalisation as hydration, so a partial or older export can't crash the session.
        const merged = mergePersisted(parsed, get());
        set({ ...merged, settings: { ...merged.settings, pinHash: get().settings.pinHash } });
      },
    }),
    {
      name: 'ph-discovery',
      version: 1,
      storage: idbPersistStorage<Persisted>(),
      partialize: (s): Persisted => ({
        settings: s.settings,
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
        data: s.data,
        content: s.content,
        hints: s.hints,
      }),
      merge: (persisted, current) => mergePersisted((persisted ?? {}) as Partial<Persisted>, current),
      onRehydrateStorage: () => (state) => {
        // Arm the app lock before the first paint of the app, not in an effect after it.
        if (!rehydratingFromIncognito && state?.settings.pinHash) useUI.getState().setLocked(true);
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

// The data layer reads the active profile's imports through this provider (no store import there).
let importCache: { items: Record<string, ImportItem> | null; batches: ImportBatch[] | null; list: ImportItem[] } = { items: null, batches: null, list: [] };
setImportProvider({
  active: () => {
    const { items, batches } = activeData(useStore.getState()).imports;
    if (importCache.items !== items || importCache.batches !== batches) {
      const list: ImportItem[] = [];
      for (const b of batches) for (const id of b.itemIds) if (items[id]) list.push(items[id]);
      importCache = { items, batches, list };
    }
    return importCache.list;
  },
  // Active profile only: another profile's copy must never stand in (profile isolation).
  byId: (id) => activeData(useStore.getState()).imports.items[id],
});

/** Full export, for the privacy screen's "Download my data". */
export function exportData(): string {
  const s = useStore.getState();
  const { pinHash: _pin, ...settings } = s.settings;
  void _pin;
  return JSON.stringify(
    { app: 'ph-discovery', exportedAt: new Date().toISOString(), settings, profiles: s.profiles, activeProfileId: s.activeProfileId, data: s.data, content: s.content, hints: s.hints },
    null,
    1,
  );
}

export const activeData = (s: AppState): ProfileData => s.data[s.activeProfileId];
export const activeProfile = (s: AppState): Profile => s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0];
export const activePath = (s: AppState): Path => {
  const d = activeData(s);
  return d.paths.find((p) => p.id === d.activePathId) ?? d.paths[0];
};
