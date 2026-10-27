/** The slot after the last queued clip: loading, error, or end-of-path. */
import { useCallback } from 'react';
import { useStore, activePath } from '../../state/store';
import { useUI } from '../../state/ui';
import { ensureBuffer, activatePath, startPath } from '../../state/feed';
import { Skeleton, Spinner } from '../../components/common';
import { PATH_KINDS } from '../../engine/paths';

export function FeedEnd({ idx, registerEl, onBack }: { idx: number; registerEl: (idx: number, el: HTMLDivElement | null) => void; onBack: () => void }) {
  const path = useStore(activePath);
  const status = useUI((s) => s.pathStatus[path.id]);
  const openSheet = useUI((s) => s.openSheet);
  const setEl = useCallback((el: HTMLDivElement | null) => registerEl(idx, el), [idx, registerEl]);
  const lastId = path.queue[path.queue.length - 1];

  let body: React.ReactNode;
  if (status?.error) {
    body = (
      <div className="end-card" data-no-gesture>
        <div className="end-card__icon">⚠︎</div>
        <h3>Couldn’t load more</h3>
        <p>{status.error}</p>
        <button className="btn btn--primary" onClick={() => void ensureBuffer(path.id)}>
          Retry
        </button>
      </div>
    );
  } else if (!path.exhausted) {
    body = (
      <div className="end-card end-card--loading">
        <Skeleton className="card__skeleton" />
        <div className="end-card__loading">
          <Spinner /> Finding more for {path.label}…
        </div>
      </div>
    );
  } else {
    body = (
      <div className="end-card" data-no-gesture>
        <div className="end-card__icon">{PATH_KINDS[path.seed.kind].icon}</div>
        <h3>That’s everything on this path</h3>
        <p>
          {path.queue.length} clip{path.queue.length === 1 ? '' : 's'} in <strong>{path.label}</strong>. Branch somewhere new:
        </p>
        <div className="end-card__actions">
          {lastId && (
            <button className="btn btn--primary" onClick={() => startPath({ kind: 'related', videoId: lastId })}>
              Related to the last clip
            </button>
          )}
          {lastId && (
            <button className="btn" onClick={() => startPath({ kind: 'contrast', videoId: lastId })}>
              ◐ Something different
            </button>
          )}
          <button className="btn" onClick={() => activatePath('for-you')}>
            ✦ Back to For You
          </button>
          <button className="btn btn--ghost" onClick={() => openSheet({ kind: 'paths' })}>
            All paths
          </button>
          {path.queue.length > 0 && (
            <button className="btn btn--ghost" onClick={onBack}>
              ↑ Previous clip
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="card card--end" ref={setEl}>
      {body}
    </div>
  );
}
