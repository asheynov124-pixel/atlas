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
import { createPath } from '../engine/paths';
import type { Blocks, Board, FilterPreset, HistoryEntry, Overrides, Path, Profile, SaveRecord, Signal, SignalKind } from '../engine/types';
import { DEFAULT_MOCK_CONFIG, type MockConfig } from '../data/mock/mockSource';
import { uid } from '../lib/id';
import { idbPersistStorage, setPersistencePaused } from './storage';
import { clone } from '../lib/clone';
import { useUI } from './ui';

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
  dataSaver: boolean;
  discreet: boolean;
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
}

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
            if (!content[v.id]) {
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
