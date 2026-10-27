/** Library: saves, boards (incl. AI suggestions), smart collections, and the session timeline. */
import { useMemo, useState } from 'react';
import { useStore, activeData } from '../state/store';
import { useUI } from '../state/ui';
import { useTaxonomy } from '../state/taxonomy';
import { lookupVideo } from '../state/selectors';
import { activatePath, startPath } from '../state/feed';
import { suggestBoards } from '../ai/suggest';
import type { VideoSummary } from '../data/types';
import type { HistoryEntry } from '../engine/types';
import { PATH_KINDS } from '../engine/paths';
import { Chip, EmptyState, Section, Segmented } from '../components/common';
import { Thumb, VideoTile } from '../components/Thumb';
import { playCollection } from '../components/sheets/LibrarySheets';
import { IconBookmark, IconBranch, IconClock, IconPlay, IconPlus, IconSparkle, IconTrash, IconX } from '../components/Icons';
import { clockTime, dayLabel, formatDuration, timeAgo } from '../lib/format';

type LibTab = 'saved' | 'boards' | 'smart' | 'history';

export function LibraryView() {
  const [tab, setTab] = useState<LibTab>('saved');
  return (
    <div className="page library">
      <header className="page__head">
        <h1>Library</h1>
      </header>
      <Segmented
        value={tab}
        onChange={setTab}
        label="Library section"
        options={[
          { value: 'saved', label: 'Saved' },
          { value: 'boards', label: 'Boards' },
          { value: 'smart', label: 'Smart' },
          { value: 'history', label: 'History' },
        ]}
      />
      {tab === 'saved' && <Saved />}
      {tab === 'boards' && <Boards />}
      {tab === 'smart' && <Smart />}
      {tab === 'history' && <History />}
    </div>
  );
}

function Saved() {
  const saves = useStore((s) => activeData(s).saves);
  const openSheet = useUI((s) => s.openSheet);
  const [tag, setTag] = useState<string | null>(null);
  const [order, setOrder] = useState<'new' | 'old'>('new');
  const customTags = useMemo(() => [...new Set(saves.flatMap((s) => s.customTags))], [saves]);
  let list = tag ? saves.filter((s) => s.customTags.includes(tag)) : saves;
  list = order === 'new' ? list : [...list].reverse();
  const ids = list.map((s) => s.videoId);
  if (!saves.length) {
    return <EmptyState icon={<IconBookmark />} title="No saves yet" body="Swipe up on a clip (or tap the bookmark) to save it here with its context." />;
  }
  return (
    <>
      <div className="row row--split">
        <div className="chips">
          <Chip active={!tag} onClick={() => setTag(null)}>
            All {saves.length}
          </Chip>
          {customTags.map((t) => (
            <Chip key={t} active={tag === t} tone={tag === t ? 'accent' : undefined} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </Chip>
          ))}
        </div>
        <button className="link" onClick={() => setOrder(order === 'new' ? 'old' : 'new')}>
          {order === 'new' ? 'Newest' : 'Oldest'} first
        </button>
      </div>
      <div className="row">
        <button className="btn btn--primary" onClick={() => playCollection(tag ? `Saved · ${tag}` : 'Saved', ids, 'saved')}>
          <IconPlay size={16} /> Play as feed
        </button>
      </div>
      <div className="grid">
        {list.map((s) => {
          const v = lookupVideo(s.videoId);
          if (!v) return null;
          return (
            <VideoTile
              key={s.videoId}
              video={v}
              onOpen={() => playCollection('Saved', ids, 'saved', undefined, v.id)}
              onLongPress={() => openSheet({ kind: 'edit-save', videoId: v.id })}
              meta={s.note ? `“${s.note.slice(0, 40)}”` : `${timeAgo(s.savedAt)}${s.pathLabel ? ` · ${s.pathLabel}` : ''}`}
            />
          );
        })}
      </div>
    </>
  );
}

function Mosaic({ ids }: { ids: string[] }) {
  const vids = ids.slice(0, 4).map(lookupVideo).filter((v): v is VideoSummary => !!v);
  return (
    <div className="mosaic">
      {vids.map((v) => (
        <Thumb key={v.id} video={v} width={90} />
      ))}
      {Array.from({ length: Math.max(0, 4 - vids.length) }, (_, i) => (
        <div key={i} className="mosaic__empty" />
      ))}
    </div>
  );
}

function Boards() {
  const d = useStore(activeData);
  const createBoard = useStore((s) => s.createBoard);
  const dismiss = useStore((s) => s.dismiss);
  const openSheet = useUI((s) => s.openSheet);
  const tx = useTaxonomy((s) => s.tx);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const suggestions = useMemo(() => (tx ? suggestBoards(d.saves, d.boards, lookupVideo, tx, d.dismissed) : []), [d.saves, d.boards, d.dismissed, tx]);

  return (
    <>
      {suggestions.length > 0 && (
        <Section title={<><IconSparkle size={16} /> Suggested boards</>}>
          <div className="board-suggest">
            {suggestions.map((s) => (
              <div key={s.id} className="board-suggest__card">
                <Mosaic ids={s.videoIds} />
                <div>
                  <strong>
                    {s.emoji} {s.name}
                  </strong>
                  <small>{s.reason}</small>
                  <div className="row">
                    <button
                      className="btn btn--primary btn--small"
                      onClick={() => {
                        createBoard(s.name, s.emoji, s.videoIds, true);
                        dismiss(s.id);
                        useUI.getState().toast({ text: `Board “${s.name}” created`, tone: 'save' });
                      }}
                    >
                      Create
                    </button>
                    <button className="btn btn--ghost btn--small" onClick={() => dismiss(s.id)}>
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section
        title="Your boards"
        action={
          <button className="link" onClick={() => setAdding((v) => !v)}>
            <IconPlus size={14} /> New
          </button>
        }
      >
        {adding && (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createBoard(name.trim(), '📁');
              setName('');
              setAdding(false);
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Board name" aria-label="Board name" />
            <button className="btn" type="submit">
              Create
            </button>
          </form>
        )}
        {!d.boards.length ? (
          <EmptyState icon="📁" title="No boards yet" body={d.saves.length >= 4 ? 'Create one, or accept an AI suggestion above.' : 'Save a few clips and the AI will suggest boards from what they have in common.'} />
        ) : (
          <div className="boards">
            {d.boards.map((b) => (
              <button key={b.id} type="button" className="board-card" onClick={() => openSheet({ kind: 'board', boardId: b.id })}>
                <Mosaic ids={b.videoIds} />
                <span className="board-card__name">
                  {b.emoji} {b.name}
                </span>
                <small>
                  {b.videoIds.length} clips{b.fromSuggestion ? ' · ✨' : ''}
                </small>
              </button>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

interface Group {
  key: string;
  label: string;
  ids: string[];
}

function Smart() {
  const d = useStore(activeData);
  const tags = useTaxonomy((s) => s.tag);
  const performers = useTaxonomy((s) => s.performer);
  const studios = useTaxonomy((s) => s.studio);
  const openSheet = useUI((s) => s.openSheet);

  const groups = useMemo(() => {
    const saved = d.saves.map((s) => lookupVideo(s.videoId)).filter((v): v is VideoSummary => !!v);
    const by = (keyFn: (v: VideoSummary) => string[], label: (k: string) => string): Group[] => {
      const m = new Map<string, string[]>();
      for (const v of saved) for (const k of keyFn(v)) m.set(k, [...(m.get(k) ?? []), v.id]);
      return [...m].sort((a, b) => b[1].length - a[1].length).slice(0, 10).map(([k, ids]) => ({ key: k, label: label(k), ids }));
    };
    const liked = [...new Set(d.signals.filter((s) => s.kind === 'like').map((s) => s.videoId))].reverse();
    const rewatched = [...new Set(d.signals.filter((s) => s.kind === 'rewatch').map((s) => s.videoId))].reverse();
    const longWatch = [...new Set(d.signals.filter((s) => s.kind === 'watch').map((s) => s.videoId))].reverse();
    const week = d.saves.filter((s) => Date.now() - s.savedAt < 7 * 86400000).map((s) => s.videoId);
    const fourK = saved.filter((v) => v.quality === '4K').map((v) => v.id);
    return {
      rules: [
        { key: 'liked', label: '♥ Everything you liked', ids: liked },
        { key: 'rewatched', label: '↻ Replayed', ids: rewatched },
        { key: 'long', label: '◷ Watched to the end', ids: longWatch },
        { key: 'week', label: '★ Saved this week', ids: week },
        { key: '4k', label: '4K saves', ids: fourK },
      ].filter((g) => g.ids.length),
      performer: by((v) => v.performerIds, (k) => performers.get(k)?.name ?? k),
      act: by((v) => v.tags.filter((t) => tags.get(t)?.category === 'act' && !['solo', 'couple'].includes(t)), (k) => tags.get(k)?.label ?? k),
      studio: by((v) => [v.studioId], (k) => studios.get(k)?.name ?? k),
      custom: by((v) => d.saves.find((s) => s.videoId === v.id)?.customTags ?? [], (k) => k),
    };
  }, [d.saves, d.signals, tags, performers, studios]);

  const open = (g: Group) => openSheet({ kind: 'collection', title: g.label, videoIds: g.ids, refId: g.key });
  const Row = ({ title, list }: { title: string; list: Group[] }) =>
    list.length ? (
      <Section title={title}>
        <ul className="smart-list">
          {list.map((g) => (
            <li key={g.key}>
              <button type="button" onClick={() => open(g)}>
                <Mosaic ids={g.ids} />
                <span className="smart-list__label">{g.label}</span>
                <small>{g.ids.length}</small>
              </button>
              <button type="button" className="icon-btn icon-btn--small" aria-label={`Play ${g.label}`} onClick={() => playCollection(g.label, g.ids, 'smart', g.key)}>
                <IconPlay size={16} />
              </button>
            </li>
          ))}
        </ul>
      </Section>
    ) : null;

  if (!groups.rules.length && !groups.performer.length) {
    return <EmptyState icon="✧" title="Smart collections build themselves" body="Like, save, and watch a few clips — collections by performer, act, studio, and your own tags appear here." />;
  }
  return (
    <>
      <Row title="Smart rules" list={groups.rules} />
      <Row title="By performer" list={groups.performer} />
      <Row title="By act" list={groups.act} />
      <Row title="By studio" list={groups.studio} />
      <Row title="By your tags" list={groups.custom} />
    </>
  );
}

const ACTION_ICON: Record<string, string> = { like: '♥', dislike: '✕', save: '🔖', capture: '⌖', skip: '»', watch: '◷' };

function History() {
  const d = useStore(activeData);
  const incognito = useStore((s) => s.incognito);
  const clearHistory = useStore((s) => s.clearHistory);
  const removeHistory = useStore((s) => s.removeHistory);
  const updatePath = useStore((s) => s.updatePath);
  const openSheet = useUI((s) => s.openSheet);
  const setTab = useUI((s) => s.setTab);
  const [confirm, setConfirm] = useState(false);

  const days = useMemo(() => {
    const out: { day: string; sessions: { id: string; entries: HistoryEntry[] }[] }[] = [];
    for (const h of [...d.history].reverse()) {
      const day = dayLabel(h.at);
      let bucket = out[out.length - 1];
      if (!bucket || bucket.day !== day) {
        bucket = { day, sessions: [] };
        out.push(bucket);
      }
      let ses = bucket.sessions[bucket.sessions.length - 1];
      if (!ses || ses.id !== h.sessionId) {
        ses = { id: h.sessionId, entries: [] };
        bucket.sessions.push(ses);
      }
      ses.entries.push(h);
    }
    return out.slice(0, 30);
  }, [d.history]);

  const jump = (h: HistoryEntry) => {
    const path = d.paths.find((p) => p.id === h.pathId);
    if (path) {
      const idx = path.queue[h.pathIndex] === h.videoId ? h.pathIndex : path.queue.indexOf(h.videoId);
      if (idx >= 0) {
        updatePath(path.id, { index: idx });
        activatePath(path.id);
        setTab('feed');
        return;
      }
    }
    // Path is gone: rebuild it from that session's sequence.
    const ses = d.history.filter((x) => x.sessionId === h.sessionId).map((x) => x.videoId);
    const ids = [...new Set(ses)];
    const i = ids.indexOf(h.videoId);
    startPath({ kind: 'collection', videoIds: [...ids.slice(i), ...ids.slice(0, i)], source: 'history', label: `Replay · ${h.pathLabel}` }, { show: true });
  };

  if (!d.history.length) {
    return <EmptyState icon={<IconClock />} title={incognito ? 'Incognito is on' : 'No history yet'} body={incognito ? 'Nothing is being recorded this session.' : 'Every clip you watch lands here, grouped by session, so you can jump back or branch off.'} />;
  }
  return (
    <>
      <div className="row row--split">
        <span className="muted small">{d.history.length} views · tap to jump, branch to fork a new path</span>
        {confirm ? (
          <span className="row">
            <button className="btn btn--small btn--danger" onClick={() => { clearHistory(); setConfirm(false); }}>
              Clear all
            </button>
            <button className="btn btn--small btn--ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button className="link" onClick={() => setConfirm(true)}>
            <IconTrash size={14} /> Clear
          </button>
        )}
      </div>
      {days.map((day) => (
        <section key={day.day} className="timeline">
          <h3 className="timeline__day">{day.day}</h3>
          {day.sessions.map((ses) => {
            const first = ses.entries[ses.entries.length - 1];
            const last = ses.entries[0];
            const ids = [...new Set([...ses.entries].reverse().map((e) => e.videoId))];
            return (
              <div key={ses.id} className="timeline__session">
                <div className="timeline__sesshead">
                  <span>
                    {clockTime(first.at)}–{clockTime(last.at)} · {ses.entries.length} clips
                  </span>
                  <button className="link" onClick={() => playCollection(`Session ${clockTime(first.at)}`, ids, 'history')}>
                    <IconPlay size={12} /> Replay session
                  </button>
                </div>
                <ol className="timeline__list">
                  {ses.entries.map((h) => {
                    const v = lookupVideo(h.videoId);
                    if (!v) return null;
                    return (
                      <li key={h.id} className="timeline__item">
                        <span className="timeline__dot" data-kind={h.pathKind} />
                        <button type="button" className="timeline__main" onClick={() => jump(h)}>
                          <Thumb video={v} width={64} className="timeline__thumb" />
                          <span className="timeline__text">
                            <strong>{v.title}</strong>
                            <small>
                              {PATH_KINDS[h.pathKind]?.icon} {h.pathLabel} · {clockTime(h.at)} · {formatDuration(h.watched)} watched
                            </small>
                          </span>
                          <span className="timeline__acts">{h.actions.map((a) => ACTION_ICON[a]).join(' ')}</span>
                        </button>
                        <div className="timeline__btns">
                          <button type="button" className="icon-btn icon-btn--small" aria-label="Branch from here" onClick={() => openSheet({ kind: 'more-like', videoId: v.id, title: 'Branch from here' })}>
                            <IconBranch size={16} />
                          </button>
                          <button type="button" className="icon-btn icon-btn--small" aria-label="Remove from history" onClick={() => removeHistory(h.id)}>
                            <IconX size={14} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
