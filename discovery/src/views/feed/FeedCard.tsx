/** One full-screen clip: player, minimal overlay, action rail, scrubber. */
import { memo, useCallback, useRef, useState } from 'react';
import { ClipPlayer, type PlayerHandle } from '../../player/ClipPlayer';
import { useVideoDetail } from './useVideoDetail';
import { useStore, activeData } from '../../state/store';
import { useUI } from '../../state/ui';
import { useTaxonomy } from '../../state/taxonomy';
import { startPath, trackProgress } from '../../state/feed';
import type { Intent } from '../../gestures/classify';
import { IconBookmark, IconChevron, IconDots, IconExternal, IconHeart, IconTarget, IconVolume, IconX } from '../../components/Icons';
import { Skeleton } from '../../components/common';
import { formatDuration } from '../../lib/format';
import type { PlaybackOption } from '../../data/types';

interface Props {
  videoId: string;
  idx: number;
  active: boolean;
  playing: boolean;
  registerEl: (idx: number, el: HTMLDivElement | null) => void;
  registerPlayer: (idx: number, h: PlayerHandle | null) => void;
  onIntent: (i: Intent) => void;
  hasPrev: boolean;
  hasNext: boolean;
}

const VIA: Record<string, string> = { embed: 'Embed', source: 'Direct source', original: 'Original', failed: 'Unavailable' };

export const FeedCard = memo(function FeedCard({ videoId, idx, active, playing, registerEl, registerPlayer, onIntent, hasPrev, hasNext }: Props) {
  const { summary, detail, error, retry } = useVideoDetail(videoId);
  const muted = useStore((s) => s.settings.muted);
  const leftHanded = useStore((s) => s.settings.leftHanded);
  const setSettings = useStore((s) => s.setSettings);
  const saved = useStore((s) => activeData(s).saves.some((x) => x.videoId === videoId));
  const overlayHidden = useUI((s) => s.overlayHidden);
  const openSheet = useUI((s) => s.openSheet);
  const tags = useTaxonomy((s) => s.tag);
  const performers = useTaxonomy((s) => s.performer);
  const progressRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const [via, setVia] = useState<string | null>(null);

  const setPlayer = useCallback(
    (h: PlayerHandle | null) => {
      playerRef.current = h;
      registerPlayer(idx, h);
    },
    [idx, registerPlayer],
  );
  const setEl = useCallback((el: HTMLDivElement | null) => registerEl(idx, el), [idx, registerEl]);

  const onTime = useCallback((t: number, d: number) => {
    if (progressRef.current) progressRef.current.style.transform = `scaleX(${d ? t / d : 0})`;
    if (timeRef.current) timeRef.current.textContent = formatDuration(t);
  }, []);
  const onProgress = useCallback((dt: number, looped: boolean) => trackProgress(videoId, dt, looped), [videoId]);
  const onResolved = useCallback((k: PlaybackOption['kind'] | 'failed') => setVia(k), []);

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    playerRef.current?.seek((e.clientX - r.left) / r.width);
  };

  if (!summary) {
    return (
      <div className="card" ref={setEl}>
        <Skeleton className="card__skeleton" />
      </div>
    );
  }

  const cast = summary.performerIds.map((id) => performers.get(id)).filter(Boolean);
  const shownTags = summary.tags.filter((t) => !['hd', '4k', 'vertical', 'solo', 'couple'].includes(t)).slice(0, 3);

  return (
    <div className={`card${active ? ' card--active' : ''}`} ref={setEl} data-video-id={videoId}>
      <div className="card__media">
        {error && !detail ? (
          <div className="card__error" data-no-gesture>
            <strong>Couldn’t load this clip</strong>
            <span>{error}</span>
            <div className="row">
              <button className="btn btn--primary" onClick={retry}>
                Retry
              </button>
              <button className="btn" onClick={() => onIntent('next')}>
                Skip
              </button>
              <a className="btn" href={summary.originalUrl} target="_blank" rel="noopener noreferrer">
                Original <IconExternal />
              </a>
            </div>
          </div>
        ) : (
          <ClipPlayer ref={setPlayer} summary={summary} detail={detail} playing={playing} muted={muted} onProgress={onProgress} onTime={onTime} onResolved={onResolved} />
        )}
      </div>

      <div className={`card__overlay${overlayHidden ? ' card__overlay--hidden' : ''}${leftHanded ? ' card__overlay--left' : ''}`}>
        <div className="card__info">
          {cast.length > 0 && (
            <div className="card__cast" data-no-gesture>
              {cast.map((p) => (
                <button key={p!.id} type="button" className="cast-chip" onClick={() => startPath({ kind: 'performer', performerId: p!.id }, { startWith: [videoId] })}>
                  <span className="cast-chip__dot" style={{ background: `hsl(${(Math.atan2(p!.face[1], p!.face[0]) * 180) / Math.PI} 70% 62%)` }} />
                  {p!.name}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="card__title" data-no-gesture onClick={() => openSheet({ kind: 'details', videoId })}>
            {summary.title}
            <IconChevron dir="up" size={14} />
          </button>
          <div className="card__tags" data-no-gesture>
            {shownTags.map((t) => (
              <button key={t} type="button" className="tag-chip" onClick={() => startPath({ kind: 'tags', tagIds: [t], videoId }, { startWith: [videoId] })}>
                #{tags.get(t)?.label ?? t}
              </button>
            ))}
            <span className="card__meta">
              {summary.quality} · {formatDuration(summary.duration)}
              {via && via !== 'embed' && <> · {VIA[via]}</>}
            </span>
          </div>
        </div>

        <div className="rail" data-no-gesture>
          <RailButton label="Like" tone="like" onClick={() => onIntent('like')}>
            <IconHeart size={28} />
          </RailButton>
          <RailButton label="Pass" tone="dislike" onClick={() => onIntent('dislike')}>
            <IconX size={26} />
          </RailButton>
          <RailButton label={saved ? 'Saved' : 'Save'} tone="save" active={saved} onClick={() => (saved ? openSheet({ kind: 'save', videoId }) : onIntent('save'))}>
            <IconBookmark size={26} filled={saved} />
          </RailButton>
          <RailButton label="Capture" tone="capture" onClick={() => onIntent('capture')}>
            <IconTarget size={26} />
          </RailButton>
          <RailButton label="More" onClick={() => openSheet({ kind: 'menu', videoId })}>
            <IconDots size={26} />
          </RailButton>
          <div className="rail__mini">
            <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setSettings({ muted: !muted })}>
              <IconVolume muted={muted} size={18} />
            </button>
            <a aria-label="Open original" href={summary.originalUrl} target="_blank" rel="noopener noreferrer">
              <IconExternal size={18} />
            </a>
            <button type="button" aria-label="Previous clip" disabled={!hasPrev} onClick={() => onIntent('prev')}>
              <IconChevron dir="up" size={18} />
            </button>
            <button type="button" aria-label="Next clip" disabled={!hasNext} onClick={() => onIntent('next')}>
              <IconChevron dir="down" size={18} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="scrub"
        data-no-gesture
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub(e);
        }}
        onPointerMove={(e) => e.buttons && scrub(e)}
      >
        <div className="scrub__track">
          <div className="scrub__fill" ref={progressRef} />
        </div>
        <span className="scrub__time" ref={timeRef}>
          0:00
        </span>
      </div>
    </div>
  );
});

function RailButton({ label, tone, active, onClick, children }: { label: string; tone?: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`rail-btn${tone ? ` rail-btn--${tone}` : ''}${active ? ' rail-btn--on' : ''}`} onClick={onClick} aria-label={label}>
      <span className="rail-btn__icon">{children}</span>
      <span className="rail-btn__label">{label}</span>
    </button>
  );
}

