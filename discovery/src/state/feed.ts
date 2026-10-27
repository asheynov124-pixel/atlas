/**
 * Feed controller: the imperative glue between gestures, paths, learning,
 * history, and the library. UI components call these; they read and write
 * the stores directly so gesture handlers never wait on React.
 */
import { dataSource, remember, cachedSummary } from '../data/api';
import type { Reason, VideoSummary } from '../data/types';
import { createPath, extendPath, pathLabel, FOR_YOU_RECYCLE, type PathContext } from '../engine/paths';
import { implicitSignal } from '../engine/learning';
import { profileScore } from '../engine/ranking';
import type { HistoryAction, Path, PathSeed, SignalKind } from '../engine/types';
import { activeData, activePath, onWipe, useStore } from './store';
import { getModel, lookupVideo } from './selectors';
import { names, performerLookup, useTaxonomy } from './taxonomy';
import { useUI } from './ui';
import { haptic } from '../gestures/haptics';

/** Ranking reasons, keyed by profile so one profile's "why" never shows in another. */
const reasonCache = new Map<string, Reason[]>();
const MAX_QUEUE = 600;
const TRIM = 200;
/** Re-ranking leaves this many upcoming clips alone so preloaded cards don't swap under the user. */
const STABLE_AHEAD = 2;
const inflight = new Map<string, Promise<void>>();
/**
 * Bumped whenever a path's future is invalidated (filters, blocks, rebuild).
 * A load that started under an older epoch is discarded instead of written.
 */
const epochs = new Map<string, number>();
/** Last known playback time per clip, so menus can capture "where you paused". */
const lastTime = new Map<string, number>();

const key = (profileId: string, pathId: string) => `${profileId}:${pathId}`;
const epochOf = (k: string) => epochs.get(k) ?? 0;

function invalidate(profileId: string, pathId: string) {
  const k = key(profileId, pathId);
  epochs.set(k, epochOf(k) + 1);
}

onWipe(() => {
  reasonCache.clear();
  lastTime.clear();
  useUI.getState().setSearchText('');
});

export function reasonsFor(pathId: string, videoId: string): Reason[] {
  const hit = reasonCache.get(`${useStore.getState().activeProfileId}|${pathId}|${videoId}`);
  if (hit) return hit;
  const v = lookupVideo(videoId);
  return v ? profileScore(v, getModel(), names()).reasons : [];
}

export function noteTime(videoId: string, t: number) {
  lastTime.set(videoId, t);
}

export function lastTimeFor(videoId: string): number {
  return lastTime.get(videoId) ?? 0;
}

function context(): PathContext {
  const s = useStore.getState();
  const d = activeData(s);
  const recent = new Set(d.history.slice(-250).map((h) => h.videoId));
  return {
    ds: dataSource(),
    model: getModel(),
    globalFilters: d.filters,
    blocks: d.blocks,
    performer: performerLookup,
    names: names(),
    recent,
  };
}

function findPath(id: string, profileId = useStore.getState().activeProfileId): Path | undefined {
  return useStore.getState().data[profileId]?.paths.find((p) => p.id === id);
}

/**
 * Keep `ahead` items buffered beyond the current index. Safe to call repeatedly.
 * Results are written to the profile and path that requested them, and only
 * if nothing invalidated that path while the load was in flight.
 */
export function ensureBuffer(pathId: string, ahead = 6): Promise<void> {
  const profileId = useStore.getState().activeProfileId;
  const k = key(profileId, pathId);
  const running = inflight.get(k);
  if (running) return running;
  const path = findPath(pathId, profileId);
  if (!path || path.exhausted || path.queue.length - path.index > ahead) return Promise.resolve();
  const epoch = epochOf(k);
  const ui = useUI.getState();
  ui.setPathStatus(pathId, { loading: true });
  let retry = false;
  const job = (async () => {
    try {
      const ext = await extendPath(path, context(), 12, lookupVideo);
      if (epochOf(k) !== epoch) {
        retry = true; // filters/blocks changed mid-load: these results are stale
        return;
      }
      const latest = findPath(pathId, profileId);
      if (!latest) return;
      for (const r of ext.ranked) reasonCache.set(`${profileId}|${pathId}|${r.video.id}`, r.reasons);
      remember(ext.ranked.map((r) => r.video));
      useStore.getState().rememberContent(ext.ranked.map((r) => r.video));
      const recent = new Set(latest.queue.slice(-recycleWindow(latest)));
      let queue = [...latest.queue, ...ext.append.filter((id) => !recent.has(id))];
      let index = latest.index;
      if (latest.startAt) {
        const at = queue.indexOf(latest.startAt);
        if (at >= 0) index = at;
      }
      if (queue.length > MAX_QUEUE && index > TRIM) {
        // Keep long-running paths light: drop the oldest already-watched stretch.
        queue = queue.slice(TRIM);
        index -= TRIM;
      }
      useStore.getState().updatePathFor(profileId, pathId, { queue, index, cursor: ext.cursor, exhausted: ext.exhausted, startAt: undefined });
      useUI.getState().setPathStatus(pathId, { loading: false });
    } catch (e) {
      if (epochOf(k) !== epoch) retry = true;
      else useUI.getState().setPathStatus(pathId, { loading: false, error: (e as Error).message || 'Could not load more' });
    } finally {
      inflight.delete(k);
      if (retry && useStore.getState().activeProfileId === profileId) void ensureBuffer(pathId, ahead);
      else if (retry) useUI.getState().setPathStatus(pathId, { loading: false });
    }
  })();
  inflight.set(k, job);
  return job;
}

/** For You recycles clips once they fall this far back; finite paths never repeat. */
function recycleWindow(p: Path): number {
  return p.seed.kind === 'forYou' ? FOR_YOU_RECYCLE : Infinity;
}

export function currentVideoId(): string | undefined {
  const p = activePath(useStore.getState());
  return p.queue[p.index];
}

/** Move a path's position. Defaults to the active path; deferred callers pass the path they meant. */
export function goTo(index: number, pathId?: string) {
  const p = pathId ? findPath(pathId) : activePath(useStore.getState());
  if (!p) return;
  const i = Math.max(0, Math.min(index, p.queue.length));
  if (i === p.index) return;
  useStore.getState().updatePath(p.id, { index: i });
  void ensureBuffer(p.id);
}

/** Advance `pathId` one step from `fromIndex` (no-op if it already moved). */
export function advanceFrom(pathId: string, fromIndex: number, delta: 1 | -1 = 1) {
  const p = findPath(pathId);
  if (!p || p.index !== fromIndex) return;
  goTo(fromIndex + delta, pathId);
}

export const goNext = () => goTo(activePath(useStore.getState()).index + 1);
export const goPrev = () => goTo(activePath(useStore.getState()).index - 1);

export function switchPath(dir: 1 | -1): Path {
  const d = activeData(useStore.getState());
  const i = d.paths.findIndex((p) => p.id === d.activePathId);
  const next = d.paths[(i + dir + d.paths.length) % d.paths.length];
  activatePath(next.id);
  return next;
}

export function activatePath(id: string) {
  useStore.getState().setActivePath(id);
  void ensureBuffer(id);
}

export interface StartOptions {
  /** Begin the new path on these videos (usually the current clip). */
  startWith?: string[];
  label?: string;
  parentId?: string;
  activate?: boolean;
  /** Jump to the feed tab. */
  show?: boolean;
}

export function startPath(seed: PathSeed, opts: StartOptions = {}): Path {
  const label = opts.label ?? pathLabel(seed, names());
  const parentId = opts.parentId ?? activePath(useStore.getState()).id;
  // Ordered paths start at the right place instead of prepending the clip.
  const ordered = seed.kind === 'series' || (seed.kind === 'imported' && !!seed.batchId);
  const path = createPath(seed, label, { startWith: ordered ? undefined : opts.startWith, parentId });
  if (ordered && opts.startWith?.[0]) path.startAt = opts.startWith[0];
  if (seed.kind === 'collection') {
    const d = activeData(useStore.getState());
    path.queue = path.queue.filter((id) => !d.blocks.videos.includes(id));
  }
  useStore.getState().addPath(path, opts.activate ?? true);
  void ensureBuffer(path.id);
  if (opts.show) useUI.getState().setTab('feed');
  return path;
}

/** Re-rank everything after the current item (e.g. after a filter change). */
export function rebuildAhead(pathId?: string) {
  const s = useStore.getState();
  const d = activeData(s);
  const targets = pathId ? d.paths.filter((p) => p.id === pathId) : d.paths;
  for (const p of targets) {
    if (p.seed.kind === 'collection') continue;
    invalidate(s.activeProfileId, p.id);
    s.updatePath(p.id, { queue: p.queue.slice(0, p.index + 1), cursor: undefined, exhausted: false });
  }
  const active = activePath(useStore.getState());
  void ensureBuffer(active.id);
}

/**
 * Near-real-time refinement: after an explicit signal, re-order the buffered
 * clips ahead on taste-driven paths so the very next few reflect it.
 */
export function refreshAhead(pathId?: string) {
  const s = useStore.getState();
  const path = pathId ? findPath(pathId) : activePath(s);
  if (!path) return;
  const kind = path.seed.kind;
  const model = getModel();
  const keep = path.index + 1 + STABLE_AHEAD;
  if (path.queue.length <= keep + 1) return;
  const head = path.queue.slice(0, keep);
  const tail = path.queue.slice(keep).filter((id) => !model.disliked.has(id) || kind === 'collection' || kind === 'series');
  const tasteDriven = kind === 'forYou' || kind === 'cluster' || kind === 'contrast' || (path.seed.kind === 'imported' && !path.seed.batchId);
  if (tasteDriven) {
    const n = tail.length;
    const scored = tail.map((id, i) => {
      const v = lookupVideo(id);
      const taste = v ? profileScore(v, model).score : 0;
      // Keep some of the original order (it carries source relevance and diversity).
      return { id, s: (kind === 'contrast' ? -taste : taste) + 0.8 * (1 - i / Math.max(1, n)) };
    });
    scored.sort((a, b) => b.s - a.s);
    s.updatePath(path.id, { queue: [...head, ...scored.map((x) => x.id)] });
  } else if (tail.length !== path.queue.length - keep) {
    s.updatePath(path.id, { queue: [...head, ...tail] });
  }
}

// ---------------------------------------------------------------------------
// View tracking → implicit signals + history

interface ViewSession {
  videoId: string;
  pathId: string;
  profileId: string;
  historyId: string | null;
  startedAt: number;
  watched: number;
  loops: number;
  explicit: boolean;
  actions: HistoryAction[];
  /** Seconds already recorded on a resumed history entry. */
  priorWatched: number;
  resumed: boolean;
}

/** A view shorter than this never really happened (StrictMode remounts, instant re-renders). */
const PHANTOM_MS = 250;

let view: ViewSession | null = null;

/** Coming back to the same clip within this window continues its history entry. */
const RESUME_MS = 10 * 60 * 1000;

export function beginView(videoId: string) {
  endView();
  const s = useStore.getState();
  const path = activePath(s);
  const v = lookupVideo(videoId);
  if (v) s.rememberContent([v]);
  const hist = activeData(s).history;
  const last = hist[hist.length - 1];
  const resumes = last && last.videoId === videoId && last.pathId === path.id && Date.now() - last.at < RESUME_MS;
  const historyId = resumes
    ? last.id
    : s.addHistory({
        videoId,
        at: Date.now(),
        pathId: path.id,
        pathLabel: path.label,
        pathKind: path.seed.kind,
        pathIndex: path.index,
        watched: 0,
        actions: [],
      });
  view = {
    videoId,
    pathId: path.id,
    profileId: s.activeProfileId,
    historyId,
    startedAt: Date.now(),
    watched: 0,
    loops: 0,
    explicit: false,
    actions: resumes ? [...last.actions] : [],
    priorWatched: resumes ? last.watched : 0,
    resumed: !!resumes,
  };
}

export function trackProgress(videoId: string, watchedDelta: number, looped: boolean) {
  if (!view || view.videoId !== videoId) return;
  view.watched += watchedDelta;
  if (looped) view.loops++;
}

/**
 * `advance`: the user moved on to another clip, so a short view is a skip.
 * `leave`: they switched tab/path/profile — only positive watch signals count.
 */
export function endView(reason: 'advance' | 'leave' = 'advance') {
  if (!view) return;
  const v = view;
  view = null;
  const s = useStore.getState();
  if (s.activeProfileId !== v.profileId) return; // never leak one profile's signals into another
  if (Date.now() - v.startedAt < PHANTOM_MS && !v.explicit) {
    if (v.historyId && !v.resumed) s.removeHistory(v.historyId);
    return;
  }
  const summary = lookupVideo(v.videoId);
  let imp = summary ? implicitSignal(v.watched, summary.clipDuration, v.loops, v.explicit) : null;
  if (imp?.kind === 'skip' && reason === 'leave') imp = null;
  if (imp) {
    s.addSignal(imp.kind, v.videoId, { value: imp.value, fraction: imp.fraction, loops: v.loops, pathId: v.pathId });
    if (imp.kind === 'skip') v.actions.push('skip');
    if (imp.kind === 'watch' || imp.kind === 'rewatch') v.actions.push('watch');
  }
  if (v.historyId) s.updateHistory(v.historyId, { watched: Math.round(v.priorWatched + v.watched), actions: [...new Set(v.actions)] });
}

function noteAction(videoId: string, a: HistoryAction) {
  if (view && view.videoId === videoId) {
    view.explicit = true;
    view.actions.push(a);
    if (view.historyId) useStore.getState().updateHistory(view.historyId, { actions: [...new Set(view.actions)] });
  }
}

// ---------------------------------------------------------------------------
// Explicit actions

function signal(kind: SignalKind, videoId: string): string | null {
  const s = useStore.getState();
  const v = lookupVideo(videoId) ?? cachedSummary(videoId);
  if (v) s.rememberContent([v]);
  const p = activePath(s);
  return s.addSignal(kind, videoId, { pathId: p.id, pathKind: p.seed.kind });
}

function learningNote(): string {
  const s = useStore.getState();
  if (s.incognito) return ' · incognito, not learned';
  if (s.settings.pauseLearning) return ' · learning paused';
  return '';
}

/**
 * `advance: 'external'` means the caller animates and advances the feed
 * itself; Undo still rewinds to this clip.
 */
type Advance = boolean | 'external';

export function judge(videoId: string, kind: 'like' | 'dislike', opts: { advance?: Advance } = {}) {
  const id = signal(kind, videoId);
  noteAction(videoId, kind);
  haptic(kind === 'like' ? 'success' : 'warning');
  const mode = opts.advance ?? useStore.getState().settings.advanceOnJudge;
  const advance = mode !== false;
  const { id: pathId, index: fromIndex } = activePath(useStore.getState());
  if (mode === true) goNext();
  refreshAhead(pathId);
  useUI.getState().toast({
    text: `${kind === 'like' ? 'Liked' : 'Passed'}${learningNote()}`,
    tone: kind,
    action: {
      label: 'Undo',
      run: () => {
        if (id) useStore.getState().removeSignal(id);
        if (advance) goTo(fromIndex, pathId);
      },
    },
  });
}

export function isSaved(videoId: string): boolean {
  return activeData(useStore.getState()).saves.some((x) => x.videoId === videoId);
}

export function save(videoId: string, opts: { advance?: Advance; position?: number; quiet?: boolean } = {}) {
  const s = useStore.getState();
  const p = activePath(s);
  if (isSaved(videoId)) {
    if (!opts.quiet) useUI.getState().toast({ text: 'Already saved', tone: 'save', action: { label: 'Boards', run: () => useUI.getState().openSheet({ kind: 'save', videoId }) } });
    return;
  }
  const v = lookupVideo(videoId);
  if (v) s.rememberContent([v]);
  s.addSave({ videoId, pathId: p.id, pathLabel: p.label, position: opts.position });
  const sigId = signal('save', videoId);
  noteAction(videoId, 'save');
  haptic('success');
  const mode = opts.advance ?? s.settings.advanceOnSave;
  const fromIndex = p.index;
  if (mode === true) goNext();
  refreshAhead(p.id);
  if (!opts.quiet) {
    useUI.getState().toast({
      text: `Saved${learningNote()}`,
      tone: 'save',
      action: { label: 'Add to board', run: () => useUI.getState().openSheet({ kind: 'save', videoId }) },
    });
  }
  return { sigId, fromIndex };
}

export function unsave(videoId: string) {
  useStore.getState().removeSave(videoId);
  useUI.getState().toast({ text: 'Removed from saves', tone: 'info' });
}

export function moreOrLess(videoId: string, kind: 'more' | 'less') {
  signal(kind, videoId);
  refreshAhead();
  noteAction(videoId, kind === 'more' ? 'like' : 'dislike');
  haptic('light');
  useUI.getState().toast({ text: kind === 'more' ? `Got it — more like this${learningNote()}` : `Got it — less like this${learningNote()}`, tone: 'info' });
}

export function noteCapture(videoId: string) {
  signal('capture', videoId);
  noteAction(videoId, 'capture');
}

export function block(type: 'videos' | 'performers' | 'studios' | 'tags', id: string, label: string) {
  const s = useStore.getState();
  s.addBlock(type, id);
  haptic('warning');
  const current = currentVideoId();
  const v = current ? lookupVideo(current) : undefined;
  const hitsCurrent =
    v && (type === 'videos' ? v.id === id : type === 'performers' ? v.performerIds.includes(id) : type === 'studios' ? v.studioId === id : v.tags.includes(id));
  // Purge the block target from every queued path ahead of the user, and
  // discard any load already in flight (it was ranked without the block).
  const d = activeData(useStore.getState());
  for (const p of d.paths) {
    invalidate(s.activeProfileId, p.id);
    const ahead = p.queue.slice(p.index + 1).filter((qid) => {
      const q = lookupVideo(qid);
      if (!q) return true;
      if (type === 'videos') return q.id !== id;
      if (type === 'performers') return !q.performerIds.includes(id);
      if (type === 'studios') return q.studioId !== id;
      return !q.tags.includes(id);
    });
    useStore.getState().updatePath(p.id, { queue: [...p.queue.slice(0, p.index + 1), ...ahead] });
  }
  if (hitsCurrent) goNext();
  void ensureBuffer(activePath(useStore.getState()).id);
  useUI.getState().toast({
    text: `Never showing ${label}`,
    tone: 'dislike',
    action: { label: 'Undo', run: () => useStore.getState().removeBlock(type, id) },
  });
}

/** Seed helper for "more like this" variants from a clip. */
export function seedFrom(kind: PathSeed['kind'], v: VideoSummary, facet?: 'face' | 'body' | 'pose' | 'composition'): PathSeed | null {
  switch (kind) {
    case 'related':
      return { kind: 'related', videoId: v.id };
    case 'performer':
      return { kind: 'performer', performerId: v.performerIds[0] };
    case 'visual':
      return { kind: 'visual', videoId: v.id, facets: facet ? { [facet]: 1 } : { face: 1, body: 1, pose: 1, composition: 1 } };
    case 'acts': {
      const acts = v.tags.filter((t) => tagCategory(t) === 'act' && !['solo', 'couple', 'threesome', 'group'].includes(t));
      return { kind: 'acts', videoId: v.id, tagIds: acts.length ? acts : v.tags.slice(0, 3) };
    }
    case 'tags':
      return { kind: 'tags', videoId: v.id, tagIds: v.tags.filter((t) => !['hd', '4k', 'vertical'].includes(t)) };
    case 'studio':
      return { kind: 'studio', studioId: v.studioId };
    case 'contrast':
      return { kind: 'contrast', videoId: v.id };
    case 'series':
      return v.seriesId ? { kind: 'series', seriesId: v.seriesId } : null;
    default:
      return null;
  }
}

function tagCategory(id: string) {
  return useTaxonomy.getState().tag.get(id)?.category;
}
