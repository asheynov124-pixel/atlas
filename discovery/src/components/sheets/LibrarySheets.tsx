/** Boards, collections, and visual search. */
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../Sheet';
import { useUI } from '../../state/ui';
import { useStore, activeData } from '../../state/store';
import { lookupVideo } from '../../state/selectors';
import { startPath } from '../../state/feed';
import { dataSource, remember } from '../../data/api';
import type { Facet, VideoSummary } from '../../data/types';
import { FACET_LABEL } from '../../engine/paths';
import { isBlocked } from '../../engine/ranking';
import { Thumb, VideoTile } from '../Thumb';
import { EmptyState, ErrorState, GridSkeleton, Segmented } from '../common';
import { IconPlay, IconShuffle, IconTrash, IconTarget } from '../Icons';

export function playCollection(title: string, ids: string[], source: 'board' | 'saved' | 'smart' | 'history', refId?: string, startAt?: string, shuffle?: boolean) {
  let list = ids.slice();
  if (shuffle) list = list.sort(() => Math.random() - 0.5);
  if (startAt) {
    const i = list.indexOf(startAt);
    if (i > 0) list = [...list.slice(i), ...list.slice(0, i)];
  }
  startPath({ kind: 'collection', videoIds: list, source, refId, label: title }, { show: true });
  useUI.getState().closeAllSheets();
}

export function CollectionGrid({ title, ids, source, refId, onRemove }: { title: string; ids: string[]; source: 'board' | 'saved' | 'smart' | 'history'; refId?: string; onRemove?: (id: string) => void }) {
  const openSheet = useUI((s) => s.openSheet);
  const videos = ids.map(lookupVideo).filter((v): v is VideoSummary => !!v);
  if (!videos.length) return <EmptyState icon="▤" title="Nothing here yet" body="Save clips from the feed and they’ll show up here." />;
  return (
    <>
      <div className="row">
        <button className="btn btn--primary" onClick={() => playCollection(title, ids, source, refId)}>
          <IconPlay size={16} /> Play as feed
        </button>
        <button className="btn" onClick={() => playCollection(title, ids, source, refId, undefined, true)}>
          <IconShuffle size={16} /> Shuffle
        </button>
      </div>
      <div className="grid">
        {videos.map((v) => (
          <div key={v.id} className="tile-wrap">
            <VideoTile video={v} onOpen={() => playCollection(title, ids, source, refId, v.id)} onLongPress={() => openSheet({ kind: 'menu', videoId: v.id })} />
            {onRemove && (
              <button className="tile-remove" aria-label="Remove from board" onClick={() => onRemove(v.id)}>
                <IconTrash size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function BoardSheet({ boardId }: { boardId: string }) {
  const close = useUI((s) => s.closeSheet);
  const board = useStore((s) => activeData(s).boards.find((b) => b.id === boardId));
  const updateBoard = useStore((s) => s.updateBoard);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const toggleInBoard = useStore((s) => s.toggleInBoard);
  const [name, setName] = useState(board?.name ?? '');
  if (!board) return null;
  return (
    <Sheet
      onClose={close}
      tall
      title={
        <span className="board-title">
          <span>{board.emoji}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && updateBoard(board.id, { name: name.trim() })} aria-label="Board name" />
        </span>
      }
      subtitle={`${board.videoIds.length} clips${board.fromSuggestion ? ' · created from an AI suggestion' : ''}`}
      footer={
        <button
          className="btn btn--ghost btn--danger"
          onClick={() => {
            deleteBoard(board.id);
            close();
          }}
        >
          <IconTrash size={16} /> Delete board
        </button>
      }
    >
      <CollectionGrid title={board.name} ids={board.videoIds} source="board" refId={board.id} onRemove={(id) => toggleInBoard(board.id, id)} />
    </Sheet>
  );
}

export function CollectionSheet({ title, videoIds, refId }: { title: string; videoIds: string[]; refId?: string }) {
  const close = useUI((s) => s.closeSheet);
  return (
    <Sheet onClose={close} title={title} subtitle={`${videoIds.length} clips`} tall>
      <CollectionGrid title={title} ids={videoIds} source="smart" refId={refId} />
    </Sheet>
  );
}

export function VisualSearchSheet() {
  const close = useUI((s) => s.closeSheet);
  const d = useStore(activeData);
  const [seedId, setSeedId] = useState<string | null>(null);
  const [facet, setFacet] = useState<Facet | 'all'>('face');
  const [results, setResults] = useState<VideoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Seeds: anything seen or saved — "any video or captured frame".
  const seeds = useMemo(() => {
    const ids = [...new Set([...d.saves.map((s) => s.videoId), ...d.history.slice().reverse().map((h) => h.videoId)])];
    return ids.map(lookupVideo).filter((v): v is VideoSummary => !!v).slice(0, 24);
  }, [d.saves, d.history]);

  useEffect(() => {
    if (!seedId) return;
    let alive = true;
    setResults(null);
    setError(null);
    dataSource()
      .getSimilar({ kind: 'video', id: seedId, facets: facet === 'all' ? undefined : { [facet]: 1 } }, { limit: 24 })
      .then((r) => {
        if (!alive) return;
        remember(r.items.map((i) => i.video));
        useStore.getState().rememberContent(r.items.map((i) => i.video));
        setResults(r.items.map((i) => i.video).filter((v) => !isBlocked(v, d.blocks)));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [seedId, facet, attempt, d.blocks]);

  const seed = seedId ? lookupVideo(seedId) : undefined;
  return (
    <Sheet onClose={close} title="Visual search" subtitle="Find faces, bodies, poses, or compositions like any clip you’ve seen." tall>
      {!seeds.length ? (
        <EmptyState icon={<IconTarget />} title="Watch a few clips first" body="Any clip you’ve seen or saved can seed a visual search." />
      ) : (
        <>
          <div className="seedrow">
            {seeds.map((v) => (
              <button key={v.id} type="button" className={`seedrow__item${v.id === seedId ? ' seedrow__item--on' : ''}`} onClick={() => setSeedId(v.id)} aria-label={`Use ${v.title} as the seed`}>
                <VideoThumbMini video={v} />
              </button>
            ))}
          </div>
          <Segmented
            value={facet}
            onChange={setFacet}
            label="Facet"
            options={(['face', 'body', 'pose', 'composition', 'all'] as const).map((f) => ({ value: f, label: f === 'all' ? 'All' : FACET_LABEL[f] }))}
          />
          {!seedId && <p className="muted">Pick a seed clip above.</p>}
          {seedId && error && <ErrorState message={error} onRetry={() => setAttempt((a) => a + 1)} />}
          {seedId && !error && !results && <GridSkeleton count={6} />}
          {seed && results && (
            <>
              <button
                className="btn btn--primary btn--block"
                onClick={() => {
                  startPath({ kind: 'visual', videoId: seed.id, facets: facet === 'all' ? { face: 1, body: 1, pose: 1, composition: 1 } : { [facet]: 1 } }, { startWith: [seed.id], show: true });
                  useUI.getState().closeAllSheets();
                }}
              >
                <IconPlay size={16} /> Start “{facet === 'all' ? 'Overall look' : FACET_LABEL[facet]}” path
              </button>
              <div className="grid">
                {results.map((v) => (
                  <VideoTile
                    key={v.id}
                    video={v}
                    onOpen={() => {
                      startPath({ kind: 'visual', videoId: seed.id, facets: facet === 'all' ? { face: 1, body: 1, pose: 1, composition: 1 } : { [facet]: 1 } }, { startWith: [v.id], show: true });
                      useUI.getState().closeAllSheets();
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function VideoThumbMini({ video }: { video: VideoSummary }) {
  return <Thumb video={video} width={90} className="seedrow__thumb" />;
}

