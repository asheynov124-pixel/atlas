/** Sheets about a single clip: details, long-press menu, "more like this", save/boards. */
import { useState } from 'react';
import { Sheet, MenuItem } from '../Sheet';
import { useUI } from '../../state/ui';
import { useStore, activeData, activePath } from '../../state/store';
import { useTaxonomy } from '../../state/taxonomy';
import { block, currentVideoId, goNext, goPrev, judge, lastTimeFor, moreOrLess, reasonsFor, save, seedFrom, startPath, unsave, isSaved } from '../../state/feed';
import { useVideoDetail } from '../../views/feed/useVideoDetail';
import { explain } from '../../engine/ranking';
import { PATH_KINDS, FACET_LABEL } from '../../engine/paths';
import type { PathSeed } from '../../engine/types';
import { formatCount, formatDuration } from '../../lib/format';
import { Chip, Spinner } from '../common';
import { Thumb } from '../Thumb';
import {
  IconBan, IconBookmark, IconBranch, IconChevron, IconExternal, IconEyeOff, IconHeart, IconInfo, IconLink, IconPlus, IconTarget, IconX, IconCheck, IconPencil,
} from '../Icons';

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => useUI.getState().toast({ text: 'Link copied', tone: 'info' }),
    () => useUI.getState().toast({ text: 'Couldn’t copy', tone: 'error' }),
  );
}

export function DetailsSheet({ videoId }: { videoId: string }) {
  const close = useUI((s) => s.closeSheet);
  const openSheet = useUI((s) => s.openSheet);
  const { summary, detail, error, retry } = useVideoDetail(videoId);
  const tags = useTaxonomy((s) => s.tag);
  const path = useStore(activePath);
  if (!summary) {
    return (
      <Sheet onClose={close} title="Details">
        <Spinner />
      </Sheet>
    );
  }
  const reasons = explain(reasonsFor(path.id, videoId));
  const go = (seed: PathSeed | null) => {
    if (!seed) return;
    startPath(seed, { startWith: [videoId] });
    useUI.getState().closeAllSheets();
  };
  const imported = summary.source === 'import';
  const host = summary.studioId.replace(/^site:/, '');
  return (
    <Sheet
      onClose={close}
      title={summary.title}
      subtitle={imported ? `Imported from ${host} · ${summary.releaseDate}` : `${detail?.studio.name ?? ''} · ${summary.releaseDate.slice(0, 4)}`}
      tall
    >
      <div className="details">
        {imported ? (
          <div className="details__stats">
            <span>{summary.mediaType === 'image' ? 'Image' : summary.mediaType === 'video' ? 'Video' : 'Page link'}</span>
            <span>{summary.quality}</span>
            <span>Personal import</span>
            <button type="button" className="link" onClick={() => openSheet({ kind: 'edit-import', videoId })}>
              <IconPencil size={14} /> Edit details
            </button>
          </div>
        ) : (
          <div className="details__stats">
            <span>{formatDuration(summary.duration)}</span>
            <span>{summary.quality}</span>
            <span>{formatCount(summary.views)} views</span>
            <span>{Math.round(summary.rating * 100)}% 👍</span>
            <span>{summary.orientation === 'vertical' ? 'Shot vertical' : 'Cropped to vertical'}</span>
          </div>
        )}
        {error && !detail && (
          <p className="muted">
            Details didn’t load ({error}). <button className="link" onClick={retry}>Retry</button>
          </p>
        )}
        {detail && <p className="details__desc">{detail.description}</p>}

        {!imported && <h3 className="details__h">Performers</h3>}
        <div className="details__people">
          {(detail?.performers ?? []).map((p) => (
            <button key={p.id} type="button" className="person" onClick={() => go({ kind: 'performer', performerId: p.id })}>
              <span className="person__dot" style={{ background: `hsl(${(Math.atan2(p.face[1], p.face[0]) * 180) / Math.PI} 70% 62%)` }} />
              <span className="person__name">{p.name}</span>
              <small>
                {p.ageBracket} · {p.hair} hair · {p.bodyType} · {p.videoCount} clips
              </small>
            </button>
          ))}
        </div>

        <h3 className="details__h">Tags</h3>
        <div className="chips">
          {summary.tags.map((t) => (
            <Chip key={t} onClick={() => go({ kind: 'tags', tagIds: [t], videoId })}>
              #{tags.get(t)?.label ?? t}
            </Chip>
          ))}
          {(summary.userTags ?? [])
            .filter((t) => !summary.tags.some((id) => tags.get(id)?.label.toLowerCase() === t.toLowerCase()))
            .map((t) => (
              <Chip key={`u:${t}`} tone="muted" onClick={() => go({ kind: 'search', query: { text: t, imports: {} }, label: `#${t}` })}>
                #{t}
              </Chip>
            ))}
          {imported && !summary.tags.length && !(summary.userTags ?? []).length && <span className="muted small">No tags yet — add some in Edit details.</span>}
        </div>

        <div className="details__links">
          {imported && (
            <button type="button" className="link-row" onClick={() => go({ kind: 'related', videoId })}>
              ⟡ More from this set <IconChevron size={14} />
            </button>
          )}
          {detail && (
            <button type="button" className="link-row" onClick={() => go({ kind: 'studio', studioId: detail.studioId })}>
              ▣ More from {detail.studio.name} <IconChevron size={14} />
            </button>
          )}
          {detail?.series && (
            <button type="button" className="link-row" onClick={() => go({ kind: 'series', seriesId: detail.series!.id })}>
              ☰ {detail.series.title} — episode {summary.episode} of {detail.series.episodes.length} <IconChevron size={14} />
            </button>
          )}
          <button type="button" className="link-row" onClick={() => openSheet({ kind: 'more-like', videoId })}>
            <IconBranch size={16} /> More like this… <IconChevron size={14} />
          </button>
        </div>

        <h3 className="details__h">Why you’re seeing this</h3>
        {reasons.length ? (
          <ul className="reasons">
            {reasons.map((r) => (
              <li key={r.label} className={r.weight < 0 ? 'neg' : ''}>
                <span>{r.label}</span>
                <b>{r.weight > 0 ? '+' : ''}{r.weight.toFixed(2)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Part of the {path.label} path. Like or pass on a few clips and reasons will appear here.</p>
        )}

        <h3 className="details__h">Playback</h3>
        <ol className="playback-chain">
          {(detail?.playback ?? []).map((p, i) => (
            <li key={i}>
              <b>{p.kind === 'embed' ? 'Embed' : p.kind === 'source' ? 'Direct source' : p.kind === 'image' ? 'Image' : 'Open original'}</b>
              <code>{p.url.replace(/^https?:\/\//, '')}</code>
            </li>
          ))}
        </ol>
        <div className="row">
          <a className="btn btn--primary" href={summary.originalUrl} target="_blank" rel="noopener noreferrer">
            Open original <IconExternal />
          </a>
          <button className="btn" onClick={() => copy(summary.originalUrl)}>
            <IconLink size={16} /> Copy link
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function MenuSheet({ videoId }: { videoId: string }) {
  const close = useUI((s) => s.closeSheet);
  const closeAll = useUI((s) => s.closeAllSheets);
  const openSheet = useUI((s) => s.openSheet);
  const setCapture = useUI((s) => s.setCapture);
  const overlayHidden = useUI((s) => s.overlayHidden);
  const setOverlayHidden = useUI((s) => s.setOverlayHidden);
  const { summary } = useVideoDetail(videoId);
  const performers = useTaxonomy((s) => s.performer);
  const studios = useTaxonomy((s) => s.studio);
  const tags = useTaxonomy((s) => s.tag);
  const [blockOpen, setBlockOpen] = useState(false);
  const saved = useStore((s) => activeData(s).saves.some((x) => x.videoId === videoId));
  const tab = useUI((s) => s.tab);
  if (!summary) return null;
  // Opened on the clip playing in the feed, or on a tile elsewhere (Library, Search)?
  // Off-feed, actions must not move the hidden feed.
  const onFeed = tab === 'feed' && currentVideoId() === videoId;
  const stay = onFeed ? {} : { advance: false as const };
  const run = (fn: () => void) => () => {
    closeAll();
    fn();
  };
  const capture = () => {
    if (onFeed) return setCapture({ videoId, time: lastTimeFor(videoId) });
    // Bring the clip into the feed first; the capture overlay lives there.
    startPath({ kind: 'related', videoId }, { startWith: [videoId], show: true });
    setCapture({ videoId, time: 0 });
  };
  return (
    <Sheet onClose={close} title={summary.title}>
      <div className="menu">
        <div className="menu__quick">
          <button type="button" className="quick quick--like" onClick={run(() => judge(videoId, 'like', stay))}>
            <IconHeart /> Like
          </button>
          <button type="button" className="quick quick--dislike" onClick={run(() => judge(videoId, 'dislike', stay))}>
            <IconX /> Pass
          </button>
          <button type="button" className="quick quick--save" onClick={() => (saved ? openSheet({ kind: 'save', videoId }) : run(() => save(videoId, stay))())}>
            <IconBookmark filled={saved} /> {saved ? 'Boards' : 'Save'}
          </button>
          <button type="button" className="quick quick--capture" onClick={run(capture)}>
            <IconTarget /> Capture
          </button>
        </div>
        <MenuItem icon={<IconBranch />} label="More like this…" hint="Start a Smart Path from this clip" onClick={() => openSheet({ kind: 'more-like', videoId })} />
        <MenuItem icon={<IconPlus />} label="Save to board…" onClick={() => openSheet({ kind: 'save', videoId })} />
        <MenuItem icon="↓" label="Less like this" hint="Soft signal — keeps it possible" onClick={run(() => moreOrLess(videoId, 'less'))} />
        <MenuItem icon={<IconInfo />} label="Details & why this?" onClick={() => openSheet({ kind: 'details', videoId })} />
        {summary.source === 'import' && <MenuItem icon={<IconPencil />} label="Edit details…" hint="Title, personal tags, notes" onClick={() => openSheet({ kind: 'edit-import', videoId })} />}
        <MenuItem icon={<IconBan />} label="Never show…" hint="Hard block, separate from Pass" onClick={() => setBlockOpen((v) => !v)} tone="danger" />
        {blockOpen && (
          <div className="menu__sub">
            <MenuItem label="This clip" onClick={run(() => block('videos', videoId, 'this clip'))} tone="danger" />
            {summary.performerIds.map((p) => (
              <MenuItem key={p} label={performers.get(p)?.name ?? p} hint="Performer" onClick={run(() => block('performers', p, performers.get(p)?.name ?? 'this performer'))} tone="danger" />
            ))}
            {summary.source === 'import' ? (
              <MenuItem label={summary.studioId.replace(/^site:/, '')} hint="Every import from this site" onClick={run(() => block('studios', summary.studioId, summary.studioId.replace(/^site:/, '')))} tone="danger" />
            ) : (
              <MenuItem label={studios.get(summary.studioId)?.name ?? 'This studio'} hint="Studio" onClick={run(() => block('studios', summary.studioId, studios.get(summary.studioId)?.name ?? 'this studio'))} tone="danger" />
            )}
            <div className="chips chips--pad">
              {summary.tags.map((t) => (
                <Chip key={t} tone="dislike" onClick={run(() => block('tags', t, `#${tags.get(t)?.label ?? t}`))}>
                  #{tags.get(t)?.label ?? t}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <MenuItem icon={<IconExternal />} label="Open original" onClick={() => window.open(summary.originalUrl, '_blank', 'noopener')} />
        <MenuItem icon={<IconLink />} label="Copy link" onClick={() => copy(summary.originalUrl)} />
        {onFeed && <MenuItem icon={<IconEyeOff />} label={overlayHidden ? 'Show overlay' : 'Hide overlay'} onClick={run(() => setOverlayHidden(!overlayHidden))} />}
        {onFeed && (
        <div className="menu__nav">
          <button type="button" className="btn btn--ghost" onClick={run(goPrev)}>
            ↑ Previous
          </button>
          <button type="button" className="btn btn--ghost" onClick={run(goNext)}>
            ↓ Next
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => openSheet({ kind: 'paths' })}>
            ⇆ Paths
          </button>
        </div>
        )}
      </div>
    </Sheet>
  );
}

export function MoreLikeSheet({ videoId, title }: { videoId: string; title?: string }) {
  const close = useUI((s) => s.closeSheet);
  const closeAll = useUI((s) => s.closeAllSheets);
  const { summary } = useVideoDetail(videoId);
  const performers = useTaxonomy((s) => s.performer);
  const studios = useTaxonomy((s) => s.studio);
  const tab = useUI((s) => s.tab);
  if (!summary) return null;
  const go = (seed: PathSeed | null) => {
    if (!seed) return;
    moreOrLess(videoId, 'more');
    startPath(seed, { startWith: [videoId], show: tab !== 'feed' });
    closeAll();
  };
  const facets: ('face' | 'body' | 'pose' | 'composition')[] = ['face', 'body', 'pose', 'composition'];
  if (summary.source === 'import') {
    const host = summary.studioId.replace(/^site:/, '');
    return (
      <Sheet onClose={close} title={title ?? 'More like this'} subtitle="Each option opens a parallel Smart Path. This clip stays on screen.">
        <div className="morelike">
          <div className="morelike__hero">
            <Thumb video={summary} width={120} className="morelike__thumb" />
            <div>
              <strong>{summary.title}</strong>
              <small>Imported from {host}</small>
            </div>
          </div>
          <MenuItem icon={PATH_KINDS.related.icon} label="More from this set" hint="Same page or gallery first, then the same site" onClick={() => go(seedFrom('related', summary))} />
          <MenuItem icon={PATH_KINDS.studio.icon} label={`Everything from ${host}`} onClick={() => go(seedFrom('studio', summary))} />
          {summary.tags.length > 0 && <MenuItem icon={PATH_KINDS.tags.icon} label="Catalogue clips with these tags" hint={PATH_KINDS.tags.blurb} onClick={() => go(seedFrom('tags', summary))} />}
          <MenuItem icon={PATH_KINDS.imported.icon} label="All my imports" hint={PATH_KINDS.imported.blurb} onClick={() => go({ kind: 'imported', label: 'Imported' })} />
          <MenuItem icon={PATH_KINDS.contrast.icon} label="Contrast" hint={PATH_KINDS.contrast.blurb} onClick={() => go(seedFrom('contrast', summary))} />
          <p className="muted small">Imported media is never matched by face or body — “more like this” follows the set, the site, and your tags.</p>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet onClose={close} title={title ?? 'More like this'} subtitle="Each option opens a parallel Smart Path. This clip stays on screen.">
      <div className="morelike">
        <div className="morelike__hero">
          <Thumb video={summary} width={120} className="morelike__thumb" />
          <div>
            <strong>{summary.title}</strong>
            <small>{summary.performerIds.map((p) => performers.get(p)?.name).join(', ')}</small>
          </div>
        </div>
        <MenuItem icon={PATH_KINDS.related.icon} label="Related" hint={PATH_KINDS.related.blurb} onClick={() => go(seedFrom('related', summary))} />
        {summary.performerIds.map((p) => (
          <MenuItem key={p} icon={PATH_KINDS.performer.icon} label={`Everything with ${performers.get(p)?.name}`} hint={`${performers.get(p)?.videoCount ?? 0} clips`} onClick={() => go({ kind: 'performer', performerId: p })} />
        ))}
        <div className="morelike__group">
          <span className="morelike__label">{PATH_KINDS.visual.icon} Visually similar</span>
          <div className="chips">
            {facets.map((f) => (
              <Chip key={f} tone="capture" onClick={() => go(seedFrom('visual', summary, f))}>
                {FACET_LABEL[f]}
              </Chip>
            ))}
            <Chip tone="capture" onClick={() => go(seedFrom('visual', summary))}>
              Overall look
            </Chip>
          </div>
        </div>
        <MenuItem icon={PATH_KINDS.acts.icon} label="Matching acts" hint={PATH_KINDS.acts.blurb} onClick={() => go(seedFrom('acts', summary))} />
        <MenuItem icon={PATH_KINDS.tags.icon} label="High tag overlap" hint={PATH_KINDS.tags.blurb} onClick={() => go(seedFrom('tags', summary))} />
        <MenuItem icon={PATH_KINDS.studio.icon} label={`Same studio · ${studios.get(summary.studioId)?.name}`} onClick={() => go(seedFrom('studio', summary))} />
        {summary.seriesId && <MenuItem icon={PATH_KINDS.series.icon} label="Watch the series in order" onClick={() => go(seedFrom('series', summary))} />}
        <MenuItem icon={PATH_KINDS.contrast.icon} label="Contrast" hint={PATH_KINDS.contrast.blurb} onClick={() => go(seedFrom('contrast', summary))} />
      </div>
    </Sheet>
  );
}

export function SaveSheet({ videoId }: { videoId: string }) {
  const close = useUI((s) => s.closeSheet);
  const openSheet = useUI((s) => s.openSheet);
  const boards = useStore((s) => activeData(s).boards);
  const saved = useStore((s) => activeData(s).saves.find((x) => x.videoId === videoId));
  const toggleInBoard = useStore((s) => s.toggleInBoard);
  const createBoard = useStore((s) => s.createBoard);
  const [name, setName] = useState('');
  const { summary } = useVideoDetail(videoId);
  const ensureSaved = () => {
    if (!isSaved(videoId)) save(videoId, { advance: false, quiet: true });
  };
  return (
    <Sheet onClose={close} title="Save to boards" subtitle={summary?.title}>
      <div className="savesheet">
        <div className="row">
          {saved ? (
            <>
              <span className="pill pill--save">
                <IconCheck size={14} /> Saved {saved.pathLabel ? `from ${saved.pathLabel}` : ''}
              </span>
              <button className="btn btn--ghost" onClick={() => openSheet({ kind: 'edit-save', videoId })}>
                <IconPencil size={16} /> Note & tags
              </button>
              <button className="btn btn--ghost" onClick={() => { unsave(videoId); close(); }}>
                Unsave
              </button>
            </>
          ) : (
            <button className="btn btn--primary" onClick={ensureSaved}>
              <IconBookmark size={16} /> Save
            </button>
          )}
        </div>
        <ul className="boardpick">
          {boards.map((b) => {
            const inBoard = b.videoIds.includes(videoId);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className={`boardpick__item${inBoard ? ' boardpick__item--on' : ''}`}
                  onClick={() => {
                    ensureSaved();
                    toggleInBoard(b.id, videoId);
                  }}
                >
                  <span className="boardpick__emoji">{b.emoji}</span>
                  <span className="boardpick__name">{b.name}</span>
                  <small>{b.videoIds.length}</small>
                  <span className="boardpick__check">{inBoard ? <IconCheck size={18} /> : <IconPlus size={18} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            ensureSaved();
            createBoard(name.trim(), '📁', [videoId]);
            setName('');
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New board name" aria-label="New board name" />
          <button className="btn" type="submit" disabled={!name.trim()}>
            Create
          </button>
        </form>
      </div>
    </Sheet>
  );
}

export function EditSaveSheet({ videoId }: { videoId: string }) {
  const close = useUI((s) => s.closeSheet);
  const rec = useStore((s) => activeData(s).saves.find((x) => x.videoId === videoId));
  const updateSave = useStore((s) => s.updateSave);
  const [note, setNote] = useState(rec?.note ?? '');
  const [tagText, setTagText] = useState('');
  if (!rec) return null;
  return (
    <Sheet
      onClose={close}
      title="Note & custom tags"
      footer={
        <button className="btn btn--primary btn--block" onClick={() => { updateSave(videoId, { note }); close(); }}>
          Done
        </button>
      }
    >
      <label className="field">
        <span>Note</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What you liked about it" />
      </label>
      <div className="field">
        <span>Custom tags</span>
        <div className="chips">
          {rec.customTags.map((t) => (
            <Chip key={t} onRemove={() => updateSave(videoId, { customTags: rec.customTags.filter((x) => x !== t) })}>
              {t}
            </Chip>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const t = tagText.trim().toLowerCase();
            if (t && !rec.customTags.includes(t)) updateSave(videoId, { customTags: [...rec.customTags, t] });
            setTagText('');
          }}
        >
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Add a tag" aria-label="Add a custom tag" />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
      </div>
      <p className="muted small">
        Auto-metadata: saved {new Date(rec.savedAt).toLocaleString()}
        {rec.pathLabel ? ` from “${rec.pathLabel}”` : ''}
        {rec.position ? ` at ${formatDuration(rec.position)}` : ''}.
      </p>
    </Sheet>
  );
}
